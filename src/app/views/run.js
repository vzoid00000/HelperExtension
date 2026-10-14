// Ansicht „Lauf“: Quellen scannen → Relevanz prüfen → Meldungen in OSDP eintragen.
//
// Gespeichert wird NIE automatisch. Je Meldung: Artikel laden, Datum prüfen, Autor, übersetzen,
// Tags nach Handbuch, OSDP-Formular ausfüllen (driver.fillArticle ohne save), dann warten
// (driver.waitForReview), bis der Nutzer im OSDP-Tab auf „Save“ klickt oder „Überspringen“/
// „Abbrechen“ wählt (Leiste im OSDP-Tab oder Freigabe-Card hier). Danach die nächste Meldung.
//
// Bereichswahl (Cyber / KriMiSi / Beide): gilt für Scan (Quellen des Bereichs), Relevanzprüfung,
// Eintragen und die Liste. 'both'-Quellen gehören zu beiden Bereichen.

import { getSources, llmMissing } from '../../lib/settings.js';
import { sourcesByArea } from '../../lib/sources-store.js';
import { lastFriday, formatDisplay, parseDate, checkArticleDate, toIsoDate, formatDate } from '../../lib/dates.js';
import { normalizeAuthor } from '../../lib/author.js';
import { loadSource, fetchText } from '../../lib/feeds.js';
import { extractViaTab } from '../../lib/tabloader.js';
import { classifyItems } from '../../lib/classify.js';
import { translateArticle } from '../../lib/translate.js';
import { OsdpDriver } from '../../lib/osdp-driver.js';
import { isRateLimit } from '../../lib/llm.js';
import { selectionToText, STRUCTURE_PATHS, PATH_NEWS, PATH_SOURCE_TYPE, PATH_NO_LOCATION } from '../../lib/tag-catalog.js';
import { suggestTags } from '../../lib/tagger.js';
import { addHistoryEntry, normalizeUrl, findInHistory } from '../../lib/history.js';
import { rulesPromptBlock, rulesForScope, recordRuleHits, correctionFromChips } from '../../lib/rules.js';
import { $, el, clear, areaBadge, structureBadge, badge, chip, leafName, toast, toastOk, toastWarn, toastError, setStatusEl, setActive, fmtDateTime, isoToDate, hostOf, shortText, plural } from '../ui.js';

const CONCURRENT_SOURCES = 4;
const AREAS = ['cyber', 'krimisi', 'both'];
const AREA_TEXT = { cyber: 'Cyber', krimisi: 'KriMiSi', both: 'beide Bereiche' };

export const STATUS_LABEL = {
  new: 'neu',
  relevant: 'relevant',
  irrelevant: 'nicht relevant',
  processing: 'läuft …',
  waiting: 'wartet auf Freigabe',
  saved: 'eingetragen',
  skipped: 'übersprungen',
  duplicate: 'Duplikat in OSDP',
  in_history: 'bereits eingetragen',
  too_old: 'zu alt',
  error: 'Fehler',
  // Altbestände aus v0.5
  filled: 'ausgefüllt',
  known: 'bereits eingetragen'
};

// Status, in denen eine Meldung nicht (erneut) eingetragen wird
const BLOCKED = new Set(['saved', 'processing', 'waiting', 'in_history', 'duplicate']);

const FILTERS = {
  relevant: (it) => !['new', 'irrelevant', 'in_history', 'known'].includes(it.status),
  all: () => true,
  selected: (it) => !!it.selected,
  done: (it) => it.status === 'saved' || it.status === 'in_history' || it.status === 'known',
  error: (it) => it.status === 'error' || it.status === 'too_old'
};

let ctx = null;
let running = false;
let stopRequested = false;
let reviewing = false;
let appAction = null;     // 'skip' | 'abort' | 'saved' – aus der Freigabe-Card
let currentDriver = null;
let filter = 'relevant';
const expanded = new Set();

// ---------------------------------------------------------------- Init ----

export async function init(c) {
  ctx = c;
  $('earliestDate').textContent = formatDisplay(lastFriday());
  updateModelInfo();
  setActive($('areaSelect'), 'area', currentArea());

  $('areaSelect').addEventListener('click', (e) => {
    const b = e.target.closest('[data-area]');
    if (!b || !AREAS.includes(b.dataset.area)) return;
    setArea(b.dataset.area);
  });
  $('btnRunAll').addEventListener('click', () => run(runAll));
  $('btnScan').addEventListener('click', () => run(scan));
  $('btnClassify').addEventListener('click', () => run(classify));
  $('btnProcess').addEventListener('click', () => run(processSelected));
  $('btnStop').addEventListener('click', () => {
    stopRequested = true;
    if (reviewing) {
      appAction = 'abort';
      log('Stopp: Freigabe abgebrochen, der Lauf wird beendet.', 'warn');
    } else log('Stopp angefordert – der laufende Schritt wird noch beendet.', 'warn');
  });
  $('btnAddUrl').addEventListener('click', () => addManualUrl($('addUrl').value));
  $('addUrl').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addManualUrl($('addUrl').value);
    }
  });

  $('btnReviewFocus').addEventListener('click', () => currentDriver?.focusTab().catch((e) => toastError('OSDP-Tab', e.message)));
  $('btnReviewSkip').addEventListener('click', () => (appAction = 'skip'));
  $('btnReviewMarkSaved').addEventListener('click', () => (appAction = 'saved'));
  $('btnReviewAbort').addEventListener('click', () => (appAction = 'abort'));

  $('itemsFilter').addEventListener('click', (e) => {
    const b = e.target.closest('[data-filter]');
    if (!b) return;
    filter = b.dataset.filter;
    renderItems();
  });
  $('itemsSelectAll').addEventListener('change', (e) => {
    const on = e.target.checked;
    for (const it of visibleItems()) if (selectable(it)) it.selected = on;
    renderItems();
    saveState();
  });
  $('btnSelectRelevant').addEventListener('click', () => {
    const area = currentArea();
    for (const it of items()) if (it.status === 'relevant' && inArea(it, area)) it.selected = true;
    renderItems();
    saveState();
  });
  $('btnClearSelection').addEventListener('click', () => {
    for (const it of items()) it.selected = false;
    renderItems();
    saveState();
  });
  $('btnForget').addEventListener('click', async () => {
    if (running) return toastWarn('Lauf aktiv', 'Bitte zuerst den Lauf beenden.');
    if (!confirm('Meldungsliste leeren? Der Verlauf bleibt erhalten; bereits eingetragene URLs bleiben als erledigt gemerkt.')) return;
    ctx.state = { items: {}, order: [], sources: {}, lastScan: null };
    expanded.clear();
    await saveState();
    render();
    toastOk('Liste geleert');
  });
  $('btnClearLog').addEventListener('click', () => ($('log').textContent = ''));

  render();
  return { render, renderItems, renderSources, log, onSettingsChanged, addManualUrl, startAutorun, currentArea, isRunning: () => running };
}

function onSettingsChanged() {
  updateModelInfo();
  setActive($('areaSelect'), 'area', currentArea());
  renderSources();
}

/** Zeitplan (?autorun=1): nur Scan + Relevanzprüfung, kein Eintragen ohne Nutzer. */
async function startAutorun() {
  log('Automatischer Start (Zeitplan): Scan und Relevanzprüfung für Cyber.');
  await setArea('cyber');
  await run(async () => {
    await scan();
    if (stopRequested) return;
    await classify();
    const n = items().filter((it) => it.status === 'relevant' && it.selected).length;
    toast({ title: 'Zeitplan: Scan abgeschlossen', desc: `${plural(n, 'relevante Meldung wartet', 'relevante Meldungen warten')} auf das Eintragen.`, kind: 'success', timeoutMs: 60000 });
  });
}

// -------------------------------------------------------------- Helfer ----

const items = () => ctx.state.order.map((k) => ctx.state.items[k]).filter(Boolean);
const selectable = (it) => !BLOCKED.has(it.status);

function currentArea() {
  const a = ctx.settings?.lastArea;
  return AREAS.includes(a) ? a : 'cyber';
}

async function setArea(area) {
  if (!AREAS.includes(area)) return;
  setActive($('areaSelect'), 'area', area);
  const changed = ctx.settings.lastArea !== area;
  ctx.settings.lastArea = area;
  renderItems();
  renderSources();
  if (changed) await ctx.patchSettings({ lastArea: area });
}

/** Bereich einer Meldung: Klassifikation > manuelle Zuordnung > Quellen-Schwerpunkt > 'both'. */
export function itemArea(it) {
  if (it.category === 'cyber' || it.category === 'krimisi') return it.category;
  if (it.area === 'cyber' || it.area === 'krimisi') return it.area;
  if (it.sourceCategory === 'cyber' || it.sourceCategory === 'krimisi') return it.sourceCategory;
  return 'both';
}

export function inArea(it, area) {
  if (area === 'both') return true;
  const a = itemArea(it);
  return a === area || a === 'both';
}

function visibleItems() {
  const area = currentArea();
  return items().filter((it) => inArea(it, area) && (FILTERS[filter] || FILTERS.all)(it));
}

/** "claude-haiku-5-5" → "Haiku 5.5"; unbekannte IDs unverändert. */
function modelLabel(id) {
  const m = /^claude-(haiku|sonnet|opus)-(\d+)-(\d+)$/i.exec(String(id || ''));
  return m ? `${m[1][0].toUpperCase()}${m[1].slice(1)} ${m[2]}.${m[3]}` : String(id || 'Standard');
}

function updateModelInfo() {
  const s = ctx.settings;
  const names = { claude: 'Claude API', local: 'lokales Modell', deepl: 'DeepL', chrome: 'Chrome (integriert)' };
  const model = s.llmProvider === 'local'
    ? `lokales Modell${s.localLlmModel ? ' (' + s.localLlmModel + ')' : ''}`
    : `Claude API (${modelLabel(s.anthropicModel)})`;
  const missing = llmMissing(s);
  $('modelInfo').textContent = `Modell: ${model} · Übersetzung: ${names[s.translator] || s.translator}${missing ? ' · ⚠ ' + missing : ''}`;
}

async function run(fn) {
  if (running) return;
  running = true;
  stopRequested = false;
  appAction = null;
  setButtons(true);
  ctx.setAppStatus('Läuft …', 'busy');
  try {
    await fn();
  } catch (err) {
    console.error(err);
    if (isRateLimit(err)) {
      const until = err.retryAt ? ` Voraussichtlich wieder möglich ab ${new Date(err.retryAt).toLocaleString('de-AT')}.` : '';
      log(`⏸ Nutzungslimit erreicht: ${err.message}${until} Der Durchlauf wurde angehalten – später einfach erneut starten, bereits erledigte Meldungen bleiben erledigt.`, 'err');
      setStatus(`Nutzungslimit erreicht – bitte warten.${until}`, 'err');
      toast({ title: 'Nutzungslimit erreicht', desc: `${err.message}${until}`, kind: 'warn', timeoutMs: 20000 });
      ctx.setAppStatus('Nutzungslimit – wartet', 'warn');
    } else {
      log(`Fehler: ${err.message || err}`, 'err');
      setStatus(err.message || String(err), 'err');
      toastError('Fehler', err.message || String(err));
      ctx.setAppStatus('Fehler', 'warn');
    }
  } finally {
    running = false;
    reviewing = false;
    hideReview();
    setButtons(false);
    setProgress(0);
    if ($('appStatusDot').classList.contains('status-dot-busy')) ctx.setAppStatus('Bereit', 'off');
    await saveState();
    renderNavCount();
  }
}

function setButtons(busy) {
  for (const id of ['btnRunAll', 'btnScan', 'btnClassify', 'btnProcess']) $(id).disabled = busy;
  $('btnStop').disabled = !busy;
}

function setStatus(msg, kind = '') {
  setStatusEl($('status'), msg, kind);
}

function setProgress(fraction) {
  $('progressBar').style.width = `${Math.round(Math.max(0, Math.min(1, fraction)) * 100)}%`;
}

function log(msg, kind = '') {
  const node = $('log');
  const time = new Date().toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const prefix = kind === 'err' ? '✖ ' : kind === 'warn' ? '⚠ ' : kind === 'ok' ? '✔ ' : '';
  node.textContent += `[${time}] ${prefix}${msg}\n`;
  const lines = node.textContent.split('\n');
  if (lines.length > 500) node.textContent = lines.slice(-500).join('\n');
  node.scrollTop = node.scrollHeight;
  if (kind !== 'err') setStatus(msg, kind === 'ok' ? 'ok' : kind === 'warn' ? 'warn' : running ? 'busy' : '');
}

/** Zustand ohne große Texte sichern (autoState) und die „erledigt“-Liste (processed). */
async function saveState() {
  const slim = { ...ctx.state, items: {} };
  for (const [k, it] of Object.entries(ctx.state.items)) {
    const { textEn, textDe, report, ...rest } = it;
    slim.items[k] = rest;
  }
  await chrome.storage.local.set({ autoState: slim, processed: ctx.processed });
}

function renderNavCount() {
  const pending = items().filter((it) => it.selected && selectable(it)).length;
  $('navRunCount').textContent = pending ? String(pending) : '';
}

// ------------------------------------------------------- Manuelle URL ----

async function addManualUrl(raw) {
  const url = String(raw || '').trim();
  if (!url) return toastWarn('Keine URL', 'Bitte eine Artikel-URL eingeben.');
  if (!/^https?:\/\//i.test(url)) return toastWarn('Ungültige URL', 'Die URL muss mit http:// oder https:// beginnen.');
  const key = normalizeUrl(url);
  const area = currentArea();
  const existing = ctx.state.items[key];
  if (existing) {
    if (selectable(existing)) existing.selected = true;
    renderItems();
    await saveState();
    return toastWarn('Schon in der Liste', `„${shortText(existing.title, 70)}“ ist bereits vorhanden (${STATUS_LABEL[existing.status] || existing.status}).`);
  }
  const hit = findInHistory(ctx.history, { url });
  ctx.state.items[key] = {
    key,
    url,
    title: url.replace(/^https?:\/\/(www\.)?/i, ''),
    titleFromUrl: true,
    manual: true,
    summary: '',
    author: '',
    dateIso: '',
    sourceName: hostOf(url) || 'manuell',
    sourceCategory: area,
    area: area === 'both' ? '' : area,
    status: 'new',
    selected: true,
    wbChoice: 'auto',
    addedAt: Date.now()
  };
  ctx.state.order.unshift(key);
  $('addUrl').value = '';
  // Die neue Meldung soll sichtbar sein: Filter „Relevant“ zeigt „neu“ nicht
  if (!(FILTERS[filter] || FILTERS.all)(ctx.state.items[key])) filter = 'all';
  if (ctx.processed[key]) toastWarn('Schon erledigt', 'Diese URL wurde bereits eingetragen – die Meldung wurde trotzdem aufgenommen.');
  else if (hit) toastWarn('Schon im Verlauf', `Gleiche URL wie Eintrag vom ${fmtDateTime(hit.at)} – die Meldung wurde trotzdem aufgenommen.`);
  else toastOk('Meldung hinzugefügt', 'Titel und Datum werden beim Eintragen aus dem Artikel gelesen.');
  log(`Manuell hinzugefügt: ${url}`);
  renderItems();
  await saveState();
}

// ------------------------------------------------------------------ Scan ----

async function scan() {
  const area = currentArea();
  const sources = sourcesByArea(getSources(ctx.settings), area, { enabledOnly: true });
  if (!sources.length) throw new Error(`Keine aktiven Quellen für ${AREA_TEXT[area]} (Ansicht „Quellen“).`);
  const earliest = lastFriday();
  log(`Scanne ${plural(sources.length, 'Quelle', 'Quellen')} (${AREA_TEXT[area]}, Artikel ab ${formatDate(earliest)}) …`);
  ctx.setAppStatus('Scanne Quellen …', 'busy');
  for (const src of sources) ctx.state.sources[src.id] = { status: 'loading', at: Date.now() };
  renderSources();
  let done = 0;
  let added = 0;
  let inHistoryTotal = 0;

  const queue = [...sources];
  const worker = async () => {
    while (queue.length) {
      if (stopRequested) break;
      const src = queue.shift();
      try {
        const found = await loadSource(src);
        let fresh = 0;
        let old = 0;
        let known = 0;
        let inHistory = 0;
        for (const it of found) {
          const key = normalizeUrl(it.url);
          if (ctx.processed[key]) {
            known++;
            continue;
          }
          if (it.date && it.date.getTime() < earliest.getTime()) {
            old++;
            continue;
          }
          const ex = ctx.state.items[key];
          if (ex) {
            if (!ex.summary && it.summary) ex.summary = it.summary;
            if (!ex.dateIso && it.date) ex.dateIso = toIsoDate(it.date);
            known++;
            continue;
          }
          const hit = findInHistory(ctx.history, { url: it.url, title: it.title });
          ctx.state.items[key] = {
            key,
            url: it.url,
            title: it.title,
            summary: it.summary,
            author: it.author,
            dateIso: it.date ? toIsoDate(it.date) : '',
            sourceName: it.sourceName,
            sourceId: src.id,
            sourceCategory: it.sourceCategory,
            status: hit ? 'in_history' : 'new',
            historyId: hit ? hit.id : undefined,
            historyAt: hit ? hit.at : undefined,
            selected: false,
            wbChoice: 'auto',
            addedAt: Date.now()
          };
          ctx.state.order.unshift(key);
          if (hit) inHistory++;
          else fresh++;
          added++;
        }
        inHistoryTotal += inHistory;
        ctx.state.sources[src.id] = { status: 'ok', total: found.length, fresh, old, known, inHistory, at: Date.now() };
      } catch (e) {
        ctx.state.sources[src.id] = { status: 'error', error: e.message || String(e), at: Date.now() };
        log(`${src.name}: ${e.message || e}`, 'warn');
      }
      done++;
      setProgress(done / sources.length);
      renderSources();
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENT_SOURCES, sources.length) }, worker));
  // Abgebrochene Quellen nicht als „lädt“ stehen lassen
  for (const src of sources) if (ctx.state.sources[src.id]?.status === 'loading') ctx.state.sources[src.id] = { status: 'skipped', at: Date.now() };
  ctx.state.lastScan = Date.now();
  render();
  await saveState();
  log(`Scan fertig: ${plural(added - inHistoryTotal, 'neue Meldung', 'neue Meldungen')}${inHistoryTotal ? `, ${inHistoryTotal} bereits im Verlauf` : ''}.`, 'ok');
}

// -------------------------------------------------------------- Classify ----

async function classify() {
  const area = currentArea();
  const candidates = items().filter((it) => it.status === 'new' && inArea(it, area));
  if (!candidates.length) {
    log('Keine neuen Meldungen zur Relevanzprüfung.');
    return;
  }
  const missing = llmMissing(ctx.settings);
  if (missing) throw new Error(`Relevanzprüfung nicht möglich: ${missing}`);
  ctx.setAppStatus('Relevanzprüfung …', 'busy');

  const rulesText = rulesPromptBlock(ctx.rules, 'relevance');
  const input = candidates.map((it, i) => ({ id: i, title: it.title, summary: it.summary, sourceName: it.sourceName, sourceCategory: it.sourceCategory }));
  const results = await classifyItems(input, ctx.settings, (m) => {
    log(m);
    setProgress(parseInt(m.match(/(\d+)\//)?.[1] || 0, 10) / candidates.length);
  }, { rulesText });
  if (rulesText) recordRuleHits(rulesForScope(ctx.rules, 'relevance').map((r) => r.id)).catch(() => {});

  const minScore = Number(ctx.settings.minScore ?? 6);
  let relevant = 0;
  let selected = 0;
  candidates.forEach((it, i) => {
    const r = results.get(i) || { category: 'none', score: 0, reason: '' };
    it.category = r.category;
    it.score = r.score;
    it.reason = r.reason;
    const isRelevant = r.category !== 'none' && r.score >= minScore;
    it.status = isRelevant ? 'relevant' : 'irrelevant';
    // Auswahl nur für den gewählten Bereich (bei „Beide“ alles Relevante)
    it.selected = isRelevant && (area === 'both' || r.category === area);
    if (isRelevant) relevant++;
    if (it.selected) selected++;
  });
  render();
  await saveState();
  log(`Relevanzprüfung fertig: ${relevant} von ${candidates.length} Meldungen relevant (Schwelle ${minScore}), ${selected} für ${AREA_TEXT[area]} ausgewählt.`, 'ok');
}

// --------------------------------------------------------------- Process ----

async function processSelected() {
  const area = currentArea();
  const list = items().filter((it) => it.selected && inArea(it, area) && selectable(it));
  if (!list.length) {
    log(`Keine ausgewählten Meldungen für ${AREA_TEXT[area]} zum Eintragen.`);
    toastWarn('Nichts ausgewählt', 'Bitte Meldungen anhaken oder zuerst die Relevanz prüfen.');
    return;
  }
  const limit = Number(ctx.settings.maxItemsPerRun) || 25;
  const todo = list.slice(0, limit);
  if (list.length > limit) log(`Hinweis: nur die ersten ${limit} von ${list.length} ausgewählten Meldungen werden verarbeitet (Einstellung „max. pro Durchlauf“).`, 'warn');
  if (ctx.settings.autoTags && llmMissing(ctx.settings)) log(`Tagging per Modell nicht möglich (${llmMissing(ctx.settings)}) – es werden nur Pflichttags gesetzt.`, 'warn');

  const driver = new OsdpDriver(ctx.settings, (m) => log(m));
  currentDriver = driver;
  await driver.ensureTab();
  let saved = 0;
  let aborted = false;
  for (let i = 0; i < todo.length; i++) {
    if (stopRequested) {
      log('Gestoppt – weitere Meldungen bleiben ausgewählt.', 'warn');
      break;
    }
    const it = todo[i];
    setProgress(i / todo.length);
    log(`(${i + 1}/${todo.length}) ${it.title}`);
    const outcome = await processItem(it, driver, i + 1, todo.length);
    if (it.status === 'saved') saved++;
    renderItems();
    renderNavCount();
    await saveState();
    if (outcome === 'abort') {
      aborted = true;
      break;
    }
  }
  currentDriver = null;
  const rest = todo.length - saved;
  log(`Eintragen beendet: ${saved} von ${todo.length} gespeichert${aborted ? ' (abgebrochen)' : ''}.`, saved === todo.length ? 'ok' : 'warn');
  if (!aborted) toast({ title: 'Eintragen beendet', desc: `${plural(saved, 'Meldung', 'Meldungen')} gespeichert${rest ? `, ${rest} nicht` : ''}.`, kind: saved ? 'success' : 'warn' });
}

/**
 * Eine Meldung: laden → prüfen → übersetzen → Tags → OSDP ausfüllen → auf Freigabe warten.
 * @returns {'next'|'abort'}
 */
async function processItem(it, driver, index, total) {
  it.status = 'processing';
  it.error = '';
  it.warnings = [];
  it.problems = [];
  renderItems();
  ctx.setAppStatus(`Meldung ${index}/${total}: lädt …`, 'busy');
  try {
    // 1) Artikel laden
    setStatus(`Lade Artikel: ${shortText(it.title, 80)}`, 'busy');
    const ex = await loadArticle(it.url);
    if (!ex || !ex.text || ex.text.length < 200) throw new Error('Artikeltext nicht lesbar (Paywall oder unbekanntes Layout)');
    if (it.titleFromUrl && ex.title) {
      it.title = ex.title;
      delete it.titleFromUrl;
    }
    if (it.manual && ex.siteName && (!it.sourceName || it.sourceName === hostOf(it.url))) it.sourceName = ex.siteName;

    // 2) Datum prüfen
    let date = null;
    for (const c of ex.dateCandidates || []) {
      date = parseDate(c);
      if (date) break;
    }
    if (!date && it.dateIso) date = parseDate(it.dateIso);
    const chk = checkArticleDate(date);
    if (chk.status === 'too_old') {
      it.status = 'too_old';
      it.selected = false;
      it.dateIso = toIsoDate(date);
      log(`Übersprungen (älter als ${formatDate(chk.earliest)}): ${it.title}`, 'warn');
      return 'next';
    }
    if (chk.status === 'unknown') throw new Error('Veröffentlichungsdatum nicht erkannt');
    it.dateIso = toIsoDate(date);

    // 3) Autor
    const a = normalizeAuthor(ex.authorRaw || it.author, ex.siteName);
    it.authorRaw = ex.authorRaw || it.author || '';
    it.authorFinal = a.display;
    it.authorUnknown = !a.isPerson;
    it.siteName = ex.siteName || '';
    it.titleEn = ex.title || it.title;
    it.textEn = ex.text;

    // 4) Übersetzen – nur der gescrapte Text, wortgetreu; Warnungen der Plausibilitätsprüfung mitnehmen
    const translationRules = rulesPromptBlock(ctx.rules, 'translation');
    const translateFn = async ({ title, text }) => {
      const t = await translateArticle({ title, text }, ctx.settings, (m) => setStatus(m, 'busy'), { rulesText: translationRules });
      for (const w of t.warnings || []) {
        it.warnings.push(`Übersetzung: ${w}`);
        log(`  Übersetzung: ${w}`, 'warn');
      }
      return { title: t.title, text: t.text };
    };
    if (!ctx.settings.useSiteExtract) {
      log('Übersetze …');
      const t = await translateFn({ title: it.titleEn, text: it.textEn });
      it.titleDe = t.title;
      it.textDe = t.text;
    }

    // 5) Tags nach Handbuch
    const cat = await ctx.getCatalog();
    const hintCategory = it.category === 'cyber' || it.category === 'krimisi' ? it.category : (itemArea(it) !== 'both' ? itemArea(it) : undefined);
    let selection;
    if (ctx.settings.autoTags && !llmMissing(ctx.settings)) {
      log('Vergebe Tags nach Handbuch …');
      setStatus('Vergebe Tags nach Handbuch …', 'busy');
      const taggingRules = rulesPromptBlock(ctx.rules, 'tagging');
      selection = await suggestTags(
        { title: it.titleEn, titleDe: it.titleDe, text: it.textEn, url: it.url, siteName: it.siteName, sourceName: it.sourceName, category: hintCategory, score: it.score },
        cat,
        ctx.settings,
        { forceWb: it.wbChoice || 'auto', rulesText: taggingRules }
      );
      if (taggingRules) recordRuleHits(rulesForScope(ctx.rules, 'tagging').map((r) => r.id)).catch(() => {});
      log(selectionToText(selection).replace(/\n/g, ' · '));
      for (const w of selection.warnings) log(`  Tag-Hinweis: ${w}`, 'warn');
    } else {
      // Ohne Modell nur Pflichttags: Struktur aus Relevanzprüfung/Bereich, News, Nachrichtenseite, „kein Standort“
      const structure = hintCategory === 'krimisi' ? 'KriMiSi' : 'Cyber';
      const paths = [STRUCTURE_PATHS[structure], PATH_NEWS, `${PATH_SOURCE_TYPE} → Nachrichtenseite`, PATH_NO_LOCATION];
      const wb = it.wbChoice === 'yes' ? (structure === 'KriMiSi' ? 'WB-KriMiSi' : 'WB-Cyber') : '';
      if (wb) paths.push(`Auftragstags → ${wb}`);
      selection = { structure, sourceType: 'Nachrichtenseite', locations: [PATH_NO_LOCATION], topics: [], ki: false, wb, wbReason: '', summary: it.reason || '', notes: '', paths, warnings: ['Tags ohne Modell: nur Pflichttags, Ort = „kein Standort“ – bitte in OSDP ergänzen'] };
      log('  Tag-Hinweis: ohne Modell nur Pflichttags gesetzt, Ort und Themen bitte in OSDP ergänzen', 'warn');
    }
    const tagPaths = selection.paths;
    it.tagSelection = { ...selection };
    it.summary2 = selection.summary;
    it.wbResult = selection.wb || '';
    for (const w of selection.warnings || []) it.warnings.push(`Tags: ${w}`);

    // 6) OSDP-Formular ausfüllen (ohne Save)
    log('Trage in OSDP ein …');
    setStatus('Fülle das OSDP-Formular aus …', 'busy');
    ctx.setAppStatus(`Meldung ${index}/${total}: OSDP ausfüllen …`, 'busy');
    const report = await driver.fillArticle(
      {
        url: it.url,
        titleEn: it.titleEn,
        textEn: it.textEn,
        titleDe: it.titleDe || '',
        textDe: it.textDe || '',
        author: it.authorFinal,
        authorUnknown: it.authorUnknown,
        date,
        category: selection.structure === 'KriMiSi' ? 'krimisi' : 'cyber',
        tagPaths,
        tagUids: cat.uidsFor(tagPaths)
      },
      { save: false, translateFn }
    );
    it.report = report;
    it.problems = [...report.problems];
    it.chips = report.chips || [];
    for (const p of report.problems) log(`  Problem: ${p}`, 'warn');
    if (report.duplicate) {
      it.status = 'duplicate';
      it.selected = false;
      ctx.processed[it.key] = { at: Date.now(), title: it.title, status: 'duplicate' };
      log('OSDP meldet: URL ist bereits in der Datenbank – übersprungen.', 'warn');
      toastWarn('Duplikat in OSDP', shortText(it.title, 90));
      return 'next';
    }

    // 7) Freigabe: warten, bis der Nutzer in OSDP speichert (oder überspringt/abbricht)
    it.status = 'waiting';
    renderItems();
    showReview(it, selection);
    log('Ausgefüllt – wartet auf Freigabe im OSDP-Tab (Save, Überspringen oder Abbrechen).', 'ok');
    setStatus(`Meldung ${index} von ${total}: Formular ausgefüllt – warte auf Save im OSDP-Tab.`, 'busy');
    ctx.setAppStatus('Wartet auf Freigabe', 'busy');
    await driver.focusTab().catch(() => {});
    const result = await driver.waitForReview({
      index,
      total,
      title: it.titleEn,
      structure: selection.structure,
      wb: selection.wb || '',
      external: () => {
        const a = appAction;
        appAction = null;
        return a;
      }
    });
    hideReview();
    it.chipsFinal = result.chips || [];

    if (result.outcome === 'saved') {
      it.status = 'saved';
      it.selected = false;
      it.savedAt = Date.now();
      ctx.processed[it.key] = { at: Date.now(), title: it.title, status: 'saved' };
      const entry = await addHistoryEntry({
        url: it.url,
        title: it.titleEn,
        titleDe: it.titleDe || '',
        sourceName: it.sourceName,
        siteName: it.siteName,
        dateIso: it.dateIso,
        structure: selection.structure,
        wb: selection.wb || '',
        ki: !!selection.ki,
        tags: tagPaths,
        chipsFinal: it.chipsFinal,
        summary: selection.summary || it.reason || '',
        author: it.authorFinal,
        authorUnknown: it.authorUnknown,
        saved: true,
        confirmedBy: result.reason,
        problems: report.problems,
        warnings: it.warnings
      });
      it.historyId = entry.id;
      // storage.onChanged kann den Verlauf schon ersetzt haben – nicht doppelt einfügen
      if (!ctx.history.some((e) => e.id === entry.id)) ctx.history.unshift(entry);
      ctx.views.history?.render();
      log(`Gespeichert (${result.reason === 'app' ? 'manuell bestätigt' : 'OSDP: Item Added'}).`, 'ok');
      toastOk('Gespeichert', `${shortText(it.titleDe || it.titleEn, 80)}${index < total ? ` – weiter mit ${index + 1} von ${total}.` : ''}`);
      await detectCorrection(it, tagPaths, it.chipsFinal, cat);
      return 'next';
    }
    if (result.outcome === 'duplicate') {
      it.status = 'duplicate';
      it.selected = false;
      ctx.processed[it.key] = { at: Date.now(), title: it.title, status: 'duplicate' };
      log('OSDP meldet beim Speichern: Duplikat – URL ist bereits in der Datenbank.', 'warn');
      toastWarn('Duplikat in OSDP', shortText(it.title, 90));
      return 'next';
    }
    if (result.outcome === 'skip') {
      it.status = 'skipped';
      it.selected = false;
      log('Übersprungen.', 'warn');
      return 'next';
    }
    if (result.outcome === 'abort') {
      it.status = it.category ? 'relevant' : 'new';
      log('Abgebrochen – die Meldung bleibt ausgewählt.', 'warn');
      return 'abort';
    }
    // timeout / lost
    it.status = 'error';
    it.error = result.outcome === 'timeout'
      ? 'Zeitüberschreitung bei der Freigabe (keine Entscheidung im OSDP-Tab)'
      : `OSDP-Tab nicht mehr erreichbar (${result.reason || 'Tab geschlossen oder neu geladen'})`;
    log(`Fehler bei „${it.title}“: ${it.error}`, 'err');
    toastError('Freigabe abgebrochen', it.error);
    return 'abort';
  } catch (e) {
    hideReview();
    if (isRateLimit(e)) {
      // Nicht als Fehler der Meldung werten: Auswahl bleibt, der Durchlauf wird oben angehalten
      it.status = it.category ? 'relevant' : 'new';
      throw e;
    }
    it.status = 'error';
    it.error = e.message || String(e);
    log(`Fehler bei „${it.title}“: ${it.error}`, 'err');
    toastError('Meldung übersprungen', `${shortText(it.title, 60)}: ${it.error}`);
    return 'next';
  }
}

/** Tags im OSDP-Formular wurden vor dem Save geändert? → Korrektur als Regel vorschlagen (Dialog, nicht blockierend). */
async function detectCorrection(it, suggestedPaths, finalChips, catalog) {
  if (!finalChips?.length || !suggestedPaths?.length) return;
  const corr = correctionFromChips({ suggestedPaths, finalChips, catalog });
  if (!corr.removed.length && !corr.added.length) return;
  log(`Tags vor dem Save geändert: entfernt ${corr.removed.map(leafName).join(', ') || '–'} · ergänzt ${corr.added.map(leafName).join(', ') || '–'}`, 'warn');
  ctx.views.rules?.openCorrection({
    correction: corr,
    article: { title: it.titleEn, titleDe: it.titleDe, url: it.url, summary: it.summary2 || it.reason || '' }
  });
}

/** Artikel per fetch laden; bei wenig Text Fallback auf einen Hintergrund-Tab. */
async function loadArticle(url) {
  let best = null;
  try {
    const html = await fetchText(url, 'text/html');
    const doc = new DOMParser().parseFromString(html, 'text/html');
    best = globalThis.__newsHelper.extractFrom(doc, { url, layout: false });
  } catch (e) {
    log(`  fetch fehlgeschlagen (${e.message}), lade im Browser-Tab …`);
  }
  if (!best || !best.text || best.text.length < 400) {
    try {
      const viaTab = await extractViaTab(url);
      if (viaTab && (viaTab.text || '').length > (best?.text || '').length) best = viaTab;
    } catch (e) {
      log(`  Laden im Tab fehlgeschlagen: ${e.message}`, 'warn');
    }
  }
  return best;
}

async function runAll() {
  await scan();
  if (stopRequested) return;
  await classify();
  if (stopRequested) return;
  await processSelected();
}

// ------------------------------------------------------------ Freigabe ----

function showReview(it, selection) {
  $('reviewTitle').textContent = it.titleEn || it.title;
  const meta = clear($('reviewMeta'));
  meta.append(structureBadge(selection.structure));
  if (selection.wb) meta.append(badge(selection.wb, 'wb'));
  if (it.dateIso) meta.append(badge(formatDate(isoToDate(it.dateIso)), 'outline'));
  if (it.sourceName) meta.append(badge(it.sourceName, 'outline'));
  meta.append(badge(it.authorUnknown ? 'Autor ungenannt' : `Autor: ${it.authorFinal}`, 'outline'));
  if (it.titleDe) meta.append(badge(shortText(it.titleDe, 90), 'outline', { title: it.titleDe }));
  const tags = clear($('reviewTags'));
  for (const p of selection.paths || []) tags.append(chip(leafName(p), { title: p }));
  const warn = clear($('reviewWarnings'));
  for (const w of [...(it.warnings || []), ...(it.problems || []).map((p) => `OSDP: ${p}`)]) warn.append(el('li', '', w));
  appAction = null;
  reviewing = true;
  $('reviewCard').hidden = false;
}

function hideReview() {
  reviewing = false;
  $('reviewCard').hidden = true;
}

// ---------------------------------------------------------------- Render ----

function render() {
  renderSources();
  renderItems();
  renderNavCount();
}

function sourceStateText(st) {
  if (!st) return { text: '–', cls: 'muted' };
  if (st.status === 'ok') return { text: `${st.fresh} neu · ${st.old} zu alt · ${st.known} bekannt${st.inHistory ? ` · ${st.inHistory} im Verlauf` : ''}`, cls: '' };
  if (st.status === 'error') return { text: `Fehler: ${st.error}`, cls: 'st-error' };
  if (st.status === 'loading') return { text: 'lädt …', cls: 'st-processing' };
  if (st.status === 'skipped') return { text: 'nicht gescannt (gestoppt)', cls: 'muted' };
  return { text: st.status, cls: '' };
}

function renderSources() {
  const area = currentArea();
  const sources = sourcesByArea(getSources(ctx.settings), area);
  const tbody = clear($('sourcesTable').querySelector('tbody'));
  let okCount = 0;
  let scanned = 0;
  for (const s of sources) {
    const st = ctx.state.sources[s.id] || ctx.state.sources[s.name];
    const tr = el('tr');
    const tdName = el('td', 'clip', s.name);
    tdName.title = s.url;
    if (s.enabled === false) {
      tdName.classList.add('muted');
      tdName.textContent = `${s.name} (aus)`;
    }
    const tdType = el('td', 'col-type muted', s.type === 'html' ? 'Seite' : 'RSS');
    const { text, cls } = sourceStateText(st);
    const tdState = el('td', cls, text);
    if (st?.error) tdState.title = st.error;
    tr.append(tdName, tdType, tdState);
    tbody.append(tr);
    if (st && st.status !== 'loading') scanned++;
    if (st?.status === 'ok') okCount++;
  }
  $('sourcesSummary').textContent = ctx.state.lastScan
    ? `Letzter Scan ${fmtDateTime(ctx.state.lastScan)} · ${okCount}/${scanned || sources.length} ok · ${AREA_TEXT[area]}`
    : `Noch kein Scan · ${plural(sources.length, 'Quelle', 'Quellen')} für ${AREA_TEXT[area]}`;
}

function wbCell(it) {
  const td = el('td', 'col-wb');
  if (!selectable(it)) {
    if (it.wbResult) td.append(badge('WB', 'wb', { sm: true, title: it.wbResult }));
    else td.append(el('span', 'muted', '–'));
    return td;
  }
  const sel = el('select', 'select select-xs wb-select');
  sel.title = 'WB-Tag: automatisch, erzwingen oder unterdrücken';
  for (const [v, l] of [['auto', 'auto'], ['yes', 'ja'], ['no', 'nein']]) {
    const o = el('option', '', l);
    o.value = v;
    sel.append(o);
  }
  sel.value = it.wbChoice || 'auto';
  sel.addEventListener('click', (e) => e.stopPropagation());
  sel.addEventListener('change', () => {
    it.wbChoice = sel.value;
    saveState();
  });
  td.append(sel);
  return td;
}

function statusCell(it) {
  const td = el('td', `col-status st-${it.status}`);
  if (it.status === 'in_history' || it.status === 'known') {
    const b = badge(STATUS_LABEL.in_history, 'muted', { sm: true, title: it.historyAt ? `im Verlauf seit ${fmtDateTime(it.historyAt)}` : 'steht bereits im Verlauf' });
    td.append(b);
    return td;
  }
  td.textContent = STATUS_LABEL[it.status] || it.status;
  if (it.error) td.title = it.error;
  else if (it.status === 'saved' && it.savedAt) td.title = `gespeichert ${fmtDateTime(it.savedAt)}`;
  return td;
}

function detailsText(it) {
  return [
    it.reason ? `Begründung: ${it.reason}` : '',
    it.summary ? `Feed-Zusammenfassung: ${it.summary}` : '',
    it.summary2 ? `Zusammenfassung: ${it.summary2}` : '',
    it.titleDe ? `Titel (DE): ${it.titleDe}` : '',
    it.authorRaw !== undefined ? `Autor: ${it.authorUnknown ? 'Autor ungenannt' : it.authorFinal}${it.authorRaw ? ' (gefunden: „' + it.authorRaw + '“)' : ''}` : '',
    it.tagSelection ? `Tags:\n${selectionToText(it.tagSelection)}` : '',
    it.warnings?.length ? `Warnungen: ${it.warnings.join('; ')}` : '',
    it.chips?.length ? `In OSDP gesetzt: ${it.chips.join(', ')}` : '',
    it.chipsFinal?.length ? `Beim Speichern gesetzt: ${it.chipsFinal.join(', ')}` : '',
    it.problems?.length ? `Probleme: ${it.problems.join('; ')}` : '',
    it.error ? `Fehler: ${it.error}` : '',
    it.historyAt ? `Im Verlauf seit: ${fmtDateTime(it.historyAt)}` : '',
    `URL: ${it.url}`
  ].filter(Boolean).join('\n');
}

function renderItems() {
  const area = currentArea();
  const areaItems = items().filter((it) => inArea(it, area));
  const visible = areaItems.filter(FILTERS[filter] || FILTERS.all);
  setActive($('itemsFilter'), 'filter', filter);
  for (const b of $('itemsFilter').querySelectorAll('[data-filter]')) {
    const n = areaItems.filter(FILTERS[b.dataset.filter] || FILTERS.all).length;
    b.querySelector('[data-count]').textContent = n ? String(n) : '';
  }

  const tbody = clear($('itemsTable').querySelector('tbody'));
  for (const it of visible) {
    const tr = el('tr', 'clickable' + (it.selected ? ' selected' : ''));
    const tdSel = el('td', 'col-check');
    const cb = el('input', 'checkbox');
    cb.type = 'checkbox';
    cb.checked = !!it.selected;
    cb.disabled = !selectable(it);
    cb.setAttribute('aria-label', 'Meldung auswählen');
    cb.addEventListener('click', (e) => e.stopPropagation());
    cb.addEventListener('change', () => {
      it.selected = cb.checked;
      tr.classList.toggle('selected', cb.checked);
      renderNavCount();
      saveState();
    });
    tdSel.append(cb);

    const tdArea = el('td', 'col-area');
    if (it.category) tdArea.append(areaBadge(it.category, { sm: true }));
    else if (itemArea(it) !== 'both') tdArea.append(badge(itemArea(it) === 'krimisi' ? 'KriMiSi' : 'Cyber', 'outline', { sm: true, title: 'Schwerpunkt der Quelle – Relevanz noch nicht geprüft' }));
    else tdArea.append(areaBadge(undefined, { sm: true }));

    const tdScore = el('td', 'col-score num', it.score ?? '');
    const tdDate = el('td', 'col-date', it.dateIso ? formatDate(isoToDate(it.dateIso) || parseDate(it.dateIso)) : '?');
    const tdSrc = el('td', 'col-source', it.sourceName || '');
    tdSrc.title = it.sourceName || '';

    const tdTitle = el('td', 'title-cell');
    const a = el('a', '', it.title);
    a.href = it.url;
    a.target = '_blank';
    a.rel = 'noopener';
    a.title = it.title;
    a.addEventListener('click', (e) => e.stopPropagation());
    tdTitle.append(a);

    tr.append(tdSel, tdArea, tdScore, wbCell(it), tdDate, tdSrc, tdTitle, statusCell(it));
    tr.addEventListener('click', () => {
      if (expanded.has(it.key)) expanded.delete(it.key);
      else expanded.add(it.key);
      renderItems();
    });
    tbody.append(tr);

    if (expanded.has(it.key)) {
      const trd = el('tr', 'details');
      const td = el('td', '', detailsText(it));
      td.colSpan = 8;
      trd.append(td);
      tbody.append(trd);
    }
  }
  $('itemsEmpty').hidden = visible.length > 0;
  const all = $('itemsSelectAll');
  const selectableVisible = visible.filter(selectable);
  all.checked = selectableVisible.length > 0 && selectableVisible.every((it) => it.selected);
  all.indeterminate = !all.checked && selectableVisible.some((it) => it.selected);

  const counts = areaItems.reduce((acc, it) => ((acc[it.status] = (acc[it.status] || 0) + 1), acc), {});
  $('itemsSummary').textContent = areaItems.length
    ? `${plural(areaItems.length, 'Meldung', 'Meldungen')} (${AREA_TEXT[area]}) · ${counts.relevant || 0} relevant · ${areaItems.filter((i) => i.selected).length} ausgewählt · ${counts.saved || 0} eingetragen${counts.in_history ? ` · ${counts.in_history} bereits im Verlauf` : ''}`
    : ctx.state.lastScan ? `Keine Meldungen für ${AREA_TEXT[area]}.` : 'Noch kein Scan.';
}
