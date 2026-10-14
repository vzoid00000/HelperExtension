// Ansicht „Lauf“: Quellen scannen → Relevanz prüfen → Meldungen in OSDP eintragen.
//
// Gespeichert wird NIE automatisch. Je Meldung: Duplikat-Vorabprüfung in OSDP (ohne Modellkosten),
// Artikel laden, Datum prüfen, Autor, übersetzen, Tags nach Handbuch, OSDP-Formular ausfüllen
// (driver.fillArticle ohne save), dann warten (driver.waitForReview), bis der Nutzer im OSDP-Tab auf
// „Save“ klickt oder „Überspringen“/„Abbrechen“ wählt (Leiste im OSDP-Tab oder Freigabe-Card hier).
// Danach die nächste Meldung.
//
// Bereichswahl (Cyber / KriMiSi / Beide): gilt für Scan (Quellen des Bereichs), Relevanzprüfung,
// Eintragen und die Liste. 'both'-Quellen gehören zu beiden Bereichen. Zu Beginn eines Laufs wird
// der Bereich einmal festgehalten; die Segment-Buttons sind währenddessen gesperrt.
//
// Zustand: ctx.state (Meldungsliste, autoState) und ctx.processed („erledigt“-Liste). Die Status
// 'processing'/'waiting' gelten nur während eines Laufs – sie werden nie persistiert und beim Laden
// zurückgesetzt (sanitizeState). Meldungen älter als 14 Tage und erledigte URLs älter als 60 Tage
// werden beim Laden/Speichern entfernt; der Verlauf bleibt davon unberührt.

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
import { addHistoryEntry, normalizeUrl, urlKey, findInHistory } from '../../lib/history.js';
// Namespace-Import: rulesBlockWithIds (liefert die ids der wirklich eingespeisten Regeln) wird parallel
// in rules.js ergänzt – fehlt die Funktion noch, fällt rulesBlock() auf rulesPromptBlock zurück.
import * as rulesLib from '../../lib/rules.js';
import { $, el, clear, areaBadge, structureBadge, badge, chip, leafName, toast, toastOk, toastWarn, toastError, setStatusEl, setActive, fmtDateTime, isoToDate, hostOf, shortText, plural } from '../ui.js';

const CONCURRENT_SOURCES = 4;
const AREAS = ['cyber', 'krimisi', 'both'];
const AREA_TEXT = { cyber: 'Cyber', krimisi: 'KriMiSi', both: 'beide Bereiche' };
// Aufräumen beim Laden/Speichern (Verlauf bleibt unberührt)
export const ITEM_MAX_AGE_MS = 14 * 86400000;
export const PROCESSED_MAX_AGE_MS = 60 * 86400000;

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

// Status, in denen eine Meldung nicht (erneut) eingetragen wird. 'in_history' sperrt nicht mehr:
// ein Titel-Treffer im Verlauf kann eine andere Meldung sein – der Nutzer entscheidet.
const BLOCKED = new Set(['saved', 'processing', 'waiting', 'duplicate']);
// Nur während eines Laufs gültig; werden nie persistiert und beim Laden zurückgesetzt
const TRANSIENT = new Set(['processing', 'waiting']);
// Status, die nach Abbruch/Stopp/Nutzungslimit unverändert wiederhergestellt werden
const RESTORABLE = new Set(['relevant', 'new', 'in_history', 'irrelevant', 'skipped']);

const FILTERS = {
  relevant: (it) => ['relevant', 'processing', 'waiting', 'skipped'].includes(it.status),
  all: () => true,
  selected: (it) => !!it.selected,
  done: (it) => ['saved', 'in_history', 'duplicate', 'known'].includes(it.status),
  error: (it) => it.status === 'error' || it.status === 'too_old'
};

// Gründe aus waitForReview als deutsche Sätze
const LOST_REASON_TEXT = {
  tab: 'der OSDP-Tab wurde geschlossen',
  reload: 'die OSDP-Seite wurde neu geladen – die Eingaben im Formular sind weg',
  unreachable: 'die OSDP-Seite antwortet nicht'
};
const SAVED_REASON_TEXT = {
  toast: 'OSDP hat die Meldung übernommen',
  message: 'OSDP hat die Meldung übernommen',
  formReset: 'Formular wurde geleert (gespeichert)',
  app: 'manuell bestätigt – „Als gespeichert markieren“'
};

const MARK_SAVED_CONFIRM = 'Nur verwenden, wenn du in OSDP bereits auf „Save“ geklickt hast und die Extension es nicht erkannt hat.\n\nEs wird nichts in OSDP gespeichert; die Meldung wird als eingetragen in den Verlauf übernommen und bei künftigen Scans übersprungen. Fortfahren?';
const FOREIGN_FORM_CONFIRM = 'Im OSDP-Tab steht ein begonnenes Formular. Verwerfen und mit dem Lauf fortfahren?';

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
  $('btnStop').addEventListener('click', stopRun);
  $('btnAddUrl').addEventListener('click', () => addManualUrl($('addUrl').value));
  $('addUrl').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addManualUrl($('addUrl').value);
    }
  });

  $('btnReviewFocus').addEventListener('click', () => currentDriver?.focusTab().catch((e) => toastError('OSDP-Tab', e.message)));
  $('btnReviewSkip').addEventListener('click', () => (appAction = 'skip'));
  $('btnReviewMarkSaved').addEventListener('click', () => {
    // Speichert nichts in OSDP – nur für den Fall, dass OSDP gespeichert hat und es nicht erkannt wurde
    if (!confirm(MARK_SAVED_CONFIRM)) return;
    appAction = 'saved';
  });
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

  onStateLoaded();
  return { render, renderItems, renderSources, log, onSettingsChanged, onStateLoaded, onHistoryChanged, addManualUrl, startAutorun, currentArea, isRunning, stopRun };
}

function onSettingsChanged() {
  updateModelInfo();
  setActive($('areaSelect'), 'area', currentArea());
  renderSources();
}

/** Läuft gerade ein Durchlauf (Scan, Relevanzprüfung oder Eintragen)? */
function isRunning() {
  return running;
}

/** Stopp: nach dem laufenden Schritt beenden; während der Freigabe wie „Abbrechen“. */
function stopRun() {
  if (!running) return;
  stopRequested = true;
  if (reviewing) {
    appAction = 'abort';
    log('Stopp: Freigabe abgebrochen, der Lauf wird beendet – die Meldung bleibt ausgewählt, das ausgefüllte Formular wird beim nächsten Lauf verworfen.', 'warn');
  } else log('Stopp angefordert – der laufende Schritt wird noch beendet, danach wird nichts mehr ausgefüllt.', 'warn');
}

/**
 * Nach dem Laden des Zustands (Start, Import): unterbrochene Läufe zurücksetzen, Altes entfernen,
 * Verlaufs-Abgleich auffrischen. Änderungen werden sofort gesichert.
 */
function onStateLoaded() {
  const r = sanitizeState(ctx.state, ctx.processed);
  if (r.reset) log(`${plural(r.reset, 'Meldung', 'Meldungen')} aus einem unterbrochenen Lauf zurückgesetzt – zum Eintragen bitte erneut starten.`, 'warn');
  if (r.prunedItems || r.prunedProcessed) log(`Aufgeräumt: ${plural(r.prunedItems, 'alte Meldung', 'alte Meldungen')}, ${plural(r.prunedProcessed, 'alter „erledigt“-Eintrag', 'alte „erledigt“-Einträge')} entfernt.`);
  const marks = refreshHistoryMarks();
  if (r.reset || r.prunedItems || r.prunedProcessed || marks) saveState().catch(() => {});
  render();
}

/**
 * Der Verlauf hat sich geändert (Eintrag gelöscht, Verlauf geleert, Import): Markierungen neu bestimmen.
 * Nicht sofort speichern – beim Laden und bei jedem Scan werden sie ohnehin neu bestimmt.
 */
function onHistoryChanged() {
  if (refreshHistoryMarks()) renderItems();
}

/** Zeitplan (Alarm im Hintergrund): nur Scan + Relevanzprüfung für den zuletzt gewählten Bereich, kein Eintragen ohne Nutzer. */
async function startAutorun() {
  if (running) {
    log('Zeitplan: Es läuft bereits ein Durchlauf – der automatische Start wurde übersprungen.', 'warn');
    return;
  }
  log(`Automatischer Start (Zeitplan): Scan und Relevanzprüfung für ${AREA_TEXT[currentArea()]}.`);
  await run(async (area) => {
    await scan(area);
    if (stopRequested) return;
    await classify(area);
    const n = items().filter((it) => it.status === 'relevant' && it.selected).length;
    toast({ title: 'Zeitplan: Scan abgeschlossen', desc: `${plural(n, 'relevante Meldung wartet', 'relevante Meldungen warten')} auf das Eintragen („Ausgewählte eintragen“).`, kind: 'success', timeoutMs: 60000 });
  });
}

// -------------------------------------------------------------- Helfer ----

const items = () => ctx.state.order.map((k) => ctx.state.items[k]).filter(Boolean);
const selectable = (it) => !BLOCKED.has(it.status);

/** Ruhestatus einer Meldung ohne laufenden Schritt: klassifiziert → relevant, im Verlauf → in_history, sonst neu. */
const idleStatus = (it) => (it.category && it.category !== 'none' ? 'relevant' : it.historyId ? 'in_history' : 'new');

/**
 * Zustand bereinigen (verändert state/processed direkt):
 *   - 'processing'/'waiting' eines unterbrochenen Laufs → Ruhestatus (Auswahl bleibt), außer Schlüssel in `keep`
 *   - Meldungen älter als ITEM_MAX_AGE_MS entfernen (Altbestand ohne addedAt zählt ab jetzt)
 *   - „erledigt“-Einträge älter als PROCESSED_MAX_AGE_MS entfernen
 * @returns {{ reset: number, prunedItems: number, prunedProcessed: number }}
 */
export function sanitizeState(state, processed, { now = Date.now(), keep = null } = {}) {
  const out = { reset: 0, prunedItems: 0, prunedProcessed: 0 };
  if (state && typeof state === 'object') {
    if (!state.items || typeof state.items !== 'object') state.items = {};
    if (!Array.isArray(state.order)) state.order = [];
    for (const key of Object.keys(state.items)) {
      const it = state.items[key];
      if (!it || typeof it !== 'object') {
        delete state.items[key];
        continue;
      }
      const kept = !!keep && keep.has(key);
      if (!Number(it.addedAt)) it.addedAt = now;
      if (!kept && now - Number(it.addedAt) > ITEM_MAX_AGE_MS) {
        delete state.items[key];
        out.prunedItems++;
        continue;
      }
      if (!kept && TRANSIENT.has(it.status)) {
        it.status = idleStatus(it);
        out.reset++;
      }
    }
    const seen = new Set();
    state.order = state.order.filter((k) => state.items[k] && !seen.has(k) && seen.add(k));
    for (const k of Object.keys(state.items)) if (!seen.has(k)) state.order.push(k);
  }
  if (processed && typeof processed === 'object') {
    for (const [key, p] of Object.entries(processed)) {
      if (!p || typeof p !== 'object') {
        delete processed[key];
        continue;
      }
      if (!Number(p.at)) p.at = now;
      if (now - Number(p.at) > PROCESSED_MAX_AGE_MS) {
        delete processed[key];
        out.prunedProcessed++;
      }
    }
  }
  return out;
}

/** Art des Verlaufstreffers: gleiche URL oder nur gleicher Titel. */
const historyMatchKind = (it, hit) => (it.url && hit?.url && urlKey(it.url) === urlKey(hit.url) ? 'url' : 'title');

/**
 * Verlaufs-Abgleich für Meldungen ohne Entscheidung ('new'/'in_history') neu bestimmen – bei jedem Scan,
 * beim Laden und wenn sich der Verlauf ändert (Eintrag/Verlauf gelöscht → wieder 'new').
 * @returns {number} Anzahl geänderter Meldungen
 */
function refreshHistoryMarks() {
  let changed = 0;
  for (const it of items()) {
    if (it.status !== 'new' && it.status !== 'in_history') continue;
    const hit = findInHistory(ctx.history, { url: it.url, title: it.titleFromUrl ? '' : it.title });
    const status = hit ? 'in_history' : 'new';
    const by = hit ? historyMatchKind(it, hit) : undefined;
    const id = hit ? hit.id : undefined;
    if (it.status !== status || it.historyId !== id || it.historyBy !== by) changed++;
    it.status = status;
    it.historyId = id;
    it.historyAt = hit ? hit.at : undefined;
    it.historyBy = by;
  }
  return changed;
}

function currentArea() {
  const a = ctx.settings?.lastArea;
  return AREAS.includes(a) ? a : 'cyber';
}

async function setArea(area) {
  if (!AREAS.includes(area)) return;
  if (running) return toastWarn('Lauf aktiv', 'Der Bereich lässt sich erst nach dem Lauf wechseln.');
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

/**
 * Regelblock für einen Prompt samt ids der Regeln, die wirklich im Block stehen (nur diese zählen
 * als Treffer). Ohne rulesBlockWithIds (ältere rules.js) zählen alle aktiven Regeln des Bereichs.
 * @returns {{ text: string, ids: string[] }}
 */
function rulesBlock(scope) {
  if (typeof rulesLib.rulesBlockWithIds === 'function') {
    const r = rulesLib.rulesBlockWithIds(ctx.rules, scope) || {};
    return { text: r.text || '', ids: Array.isArray(r.ids) ? r.ids : [] };
  }
  const text = rulesLib.rulesPromptBlock(ctx.rules, scope);
  return { text, ids: text ? rulesLib.rulesForScope(ctx.rules, scope).map((r) => r.id) : [] };
}

function countRuleHits(block) {
  if (block?.ids?.length && typeof rulesLib.recordRuleHits === 'function') rulesLib.recordRuleHits(block.ids).catch(() => {});
}

/** Fehlermeldungen bekannter Fälle um eine Handlungsanweisung ergänzen. */
function withAdvice(message) {
  const m = String(message || '');
  if (/bereits eine Anweisung|erneut starten|von Hand/i.test(m)) return m;
  if (/News-Editor wurde nicht geladen/i.test(m)) return `${m} – OSDP-Tab prüfen (eingeloggt? Seite erreichbar?) und den Lauf erneut starten.`;
  if (/\(529\)|überlastet|overloaded/i.test(m)) return `${m} – in ein paar Minuten erneut starten.`;
  if (/max_tokens|abgeschnitten/i.test(m)) return `${m} – die Antwort des Modells war zu lang; die Meldung bitte erneut eintragen.`;
  if (/Kein OSDP-Tab/i.test(m)) return `${m} – bitte OSDP im Browser öffnen und einloggen, dann den Lauf erneut starten.`;
  return m;
}

/** Lauf-Rahmen: Bereich einmal festhalten, Knöpfe sperren, Fehler/Nutzungslimit melden, am Ende Zustand sichern. */
async function run(fn) {
  if (running) return;
  running = true;
  stopRequested = false;
  appAction = null;
  const area = currentArea();
  setButtons(true);
  ctx.setAppStatus('Läuft …', 'busy');
  try {
    await fn(area);
  } catch (err) {
    console.error(err);
    if (isRateLimit(err)) {
      const until = err.retryAt ? ` Voraussichtlich wieder möglich ab ${new Date(err.retryAt).toLocaleString('de-AT')}.` : '';
      log(`⏸ Nutzungslimit erreicht: ${err.message}${until} Der Durchlauf wurde angehalten – später einfach erneut starten, bereits erledigte Meldungen bleiben erledigt.`, 'err');
      setStatus(`Nutzungslimit erreicht – bitte warten.${until}`, 'err');
      toast({ title: 'Nutzungslimit erreicht', desc: `${err.message}${until}`, kind: 'warn', timeoutMs: 20000 });
      ctx.setAppStatus('Nutzungslimit – wartet', 'warn');
    } else {
      const msg = withAdvice(err.message || String(err));
      log(`Fehler: ${msg}`, 'err');
      setStatus(msg, 'err');
      toastError('Fehler', msg);
      ctx.setAppStatus('Fehler', 'warn');
    }
  } finally {
    running = false;
    reviewing = false;
    currentDriver = null;
    hideReview();
    setButtons(false);
    setProgress(0);
    if ($('appStatusDot').classList.contains('status-dot-busy')) ctx.setAppStatus('Bereit', 'off');
    await saveState().catch((e) => log(`Zustand konnte nicht gesichert werden: ${e.message || e}`, 'err'));
    renderItems();
  }
}

function setButtons(busy) {
  for (const id of ['btnRunAll', 'btnScan', 'btnClassify', 'btnProcess']) $(id).disabled = busy;
  // Bereich ist während eines Laufs festgehalten
  for (const b of $('areaSelect').querySelectorAll('[data-area]')) b.disabled = busy;
  $('areaSelect').title = busy ? 'Der Bereich ist während eines Laufs festgehalten.' : '';
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

/**
 * Zustand ohne große Texte sichern (autoState) und die „erledigt“-Liste (processed).
 * Transiente Status ('processing'/'waiting') werden nie geschrieben; Altes wird dabei entfernt.
 */
async function saveState() {
  const slim = { ...ctx.state, items: {}, order: [...ctx.state.order] };
  for (const [k, it] of Object.entries(ctx.state.items)) {
    const { textEn, textDe, report, ...rest } = it;
    slim.items[k] = rest;
  }
  sanitizeState(slim, ctx.processed);
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
    return toastWarn('Schon in der Liste', `„${shortText(existing.title, 70)}“ ist schon in der Liste (Status: ${STATUS_LABEL[existing.status] || existing.status}).`);
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

async function scan(area = currentArea()) {
  const sources = sourcesByArea(getSources(ctx.settings), area, { enabledOnly: true });
  if (!sources.length) throw new Error(`Keine aktiven Quellen für ${AREA_TEXT[area]} (Ansicht „Quellen“).`);
  const earliest = lastFriday();
  log(`Scanne ${plural(sources.length, 'Quelle', 'Quellen')} (${AREA_TEXT[area]}, Artikel ab ${formatDate(earliest)}) …`);
  ctx.setAppStatus('Scanne Quellen …', 'busy');
  // Verlaufs-Abgleich der vorhandenen Meldungen auffrischen (Verlauf kann sich geändert haben)
  refreshHistoryMarks();
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
            historyBy: hit ? historyMatchKind({ url: it.url }, hit) : undefined,
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
  log(`Scan fertig: ${plural(added - inHistoryTotal, 'neue Meldung', 'neue Meldungen')}${inHistoryTotal ? `, ${inHistoryTotal} bereits im Verlauf (lassen sich trotzdem anhaken)` : ''}.`, 'ok');
}

// -------------------------------------------------------------- Classify ----

async function classify(area = currentArea()) {
  const candidates = items().filter((it) => it.status === 'new' && inArea(it, area));
  if (!candidates.length) {
    log('Keine neuen Meldungen zur Relevanzprüfung.');
    return;
  }
  const missing = llmMissing(ctx.settings);
  if (missing) throw new Error(`Relevanzprüfung nicht möglich: ${missing}`);
  ctx.setAppStatus('Relevanzprüfung …', 'busy');

  const rules = rulesBlock('relevance');
  const input = candidates.map((it, i) => ({ id: i, title: it.title, summary: it.summary, sourceName: it.sourceName, sourceCategory: it.sourceCategory }));
  const results = await classifyItems(input, ctx.settings, (m) => {
    log(m);
    setProgress(parseInt(m.match(/(\d+)\//)?.[1] || 0, 10) / candidates.length);
  }, { rulesText: rules.text });
  countRuleHits(rules);

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

async function processSelected(area = currentArea()) {
  const list = items().filter((it) => it.selected && inArea(it, area) && selectable(it));
  if (!list.length) {
    log(`Keine ausgewählten Meldungen für ${AREA_TEXT[area]} zum Eintragen.`);
    toastWarn('Nichts ausgewählt', 'Bitte Meldungen anhaken oder zuerst die Relevanz prüfen.');
    return;
  }
  const limit = Number(ctx.settings.maxItemsPerRun) || 25;
  const todo = list.slice(0, limit);
  if (list.length > limit) log(`Hinweis: nur die ersten ${limit} von ${list.length} ausgewählten Meldungen werden verarbeitet (Einstellung „Max. Meldungen pro Durchlauf“).`, 'warn');
  if (ctx.settings.autoTags && llmMissing(ctx.settings)) log(`Tagging per Modell nicht möglich (${llmMissing(ctx.settings)}) – es werden nur Pflichttags gesetzt.`, 'warn');

  const driver = new OsdpDriver(ctx.settings, (m) => log(m));
  currentDriver = driver;
  await driver.ensureTab();
  if (!(await confirmForeignForm(driver))) {
    currentDriver = null;
    return;
  }
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
 * Vor dem ersten Neuladen des Editors in einem Lauf: Steht im OSDP-Tab ein Formular, das nicht von
 * diesem Driver stammt (von Hand begonnen oder Rest eines früheren Laufs), nachfragen statt still zu verwerfen.
 * @returns {Promise<boolean>} false = Lauf nicht starten
 */
async function confirmForeignForm(driver) {
  if (typeof driver.formState !== 'function') return true;
  let state = null;
  try {
    state = await driver.formState();
  } catch {
    return true;
  }
  if (!state?.hasContent || state.ours) return true;
  if (confirm(FOREIGN_FORM_CONFIRM)) {
    log('Das begonnene Formular im OSDP-Tab wird verworfen.', 'warn');
    return true;
  }
  log('Lauf nicht gestartet – das begonnene Formular im OSDP-Tab bleibt erhalten (dort speichern oder leeren, dann erneut starten).', 'warn');
  toastWarn('Lauf nicht gestartet', 'Im OSDP-Tab steht ein begonnenes Formular.');
  return false;
}

/** Meldung als OSDP-Duplikat ablegen (erledigt, nie wieder anbieten). */
function markDuplicate(it, message) {
  it.status = 'duplicate';
  it.selected = false;
  ctx.processed[it.key] = { at: Date.now(), title: it.title, status: 'duplicate' };
  log(message, 'warn');
  toastWarn('Duplikat in OSDP', shortText(it.title, 90));
  return 'next';
}

/**
 * Eine Meldung: Duplikat-Vorabprüfung → laden → prüfen → übersetzen → Tags → OSDP ausfüllen → auf Freigabe warten.
 * Übersetzung und Tags aus einem vorigen Versuch derselben Sitzung werden wiederverwendet, solange der
 * Artikeltext unverändert ist. Stopp wird an den Schrittgrenzen geprüft.
 * @returns {'next'|'abort'}
 */
async function processItem(it, driver, index, total) {
  const before = it.status;
  const restoreStatus = () => {
    it.status = RESTORABLE.has(before) ? before : idleStatus(it);
  };
  const stopped = () => {
    restoreStatus();
    log('Gestoppt – die Meldung bleibt ausgewählt und wird nicht ausgefüllt.', 'warn');
    return 'abort';
  };
  const prevTextEn = it.textEn;
  const prevTitleEn = it.titleEn;
  it.status = 'processing';
  it.error = '';
  it.warnings = [];
  it.problems = [];
  renderItems();
  ctx.setAppStatus(`Meldung ${index}/${total}: lädt …`, 'busy');
  try {
    // 0) Duplikat-Vorabprüfung in OSDP (ohne Modellkosten): Quelle + Titel in den sauberen Editor,
    //    OSDP prüft die URL beim Verlassen des Quellfelds
    if (stopRequested) return stopped();
    let editorPrepared = false;
    if (typeof driver.precheckDuplicate === 'function') {
      setStatus(`Prüfe in OSDP, ob die URL schon in der Datenbank ist: ${shortText(it.title, 60)}`, 'busy');
      const pre = await driver.precheckDuplicate({ url: it.url, title: it.title });
      if (pre?.duplicate) return markDuplicate(it, 'OSDP meldet: URL ist bereits in der Datenbank – übersprungen (ohne Übersetzung und Tagging).');
      editorPrepared = pre?.prepared === true;
    }

    // 1) Artikel laden
    setStatus(`Lade Artikel: ${shortText(it.title, 80)}`, 'busy');
    const ex = await loadArticle(it.url);
    if (!ex || !ex.text || ex.text.length < 200) throw new Error('Artikeltext nicht lesbar (Paywall oder unbekanntes Layout) – Artikel im Browser öffnen und von Hand in OSDP eintragen oder in den Einstellungen „Extract“ aktivieren.');
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
    if (chk.status === 'unknown') throw new Error('Veröffentlichungsdatum nicht erkannt – die Meldung bleibt in der Liste; Datum im Artikel prüfen und die Meldung bei Bedarf von Hand in OSDP eintragen.');
    it.dateIso = toIsoDate(date);

    // 3) Autor
    const a = normalizeAuthor(ex.authorRaw || it.author, ex.siteName);
    it.authorRaw = ex.authorRaw || it.author || '';
    it.authorFinal = a.display;
    it.authorUnknown = !a.isPerson;
    it.siteName = ex.siteName || '';
    it.titleEn = ex.title || it.title;
    it.textEn = ex.text;
    // Gleicher Text wie beim vorigen Versuch in dieser Sitzung? (textEn wird nicht persistiert)
    const sameText = !!prevTextEn && prevTextEn === it.textEn && prevTitleEn === it.titleEn;

    // 4) Übersetzen – nur der gescrapte Text, wortgetreu; Warnungen der Plausibilitätsprüfung mitnehmen
    if (stopRequested) return stopped();
    const translationRules = rulesBlock('translation');
    const translateFn = async ({ title, text }) => {
      const t = await translateArticle({ title, text }, ctx.settings, (m) => setStatus(m, 'busy'), { rulesText: translationRules.text });
      countRuleHits(translationRules);
      it.translateWarnings = (t.warnings || []).map((w) => `Übersetzung: ${w}`);
      for (const w of it.translateWarnings) {
        it.warnings.push(w);
        log(`  ${w}`, 'warn');
      }
      return { title: t.title, text: t.text };
    };
    if (!ctx.settings.useSiteExtract) {
      if (sameText && it.titleDe && it.textDe) {
        log('Übersetzung aus dem vorigen Versuch wiederverwendet (Artikeltext unverändert).');
        it.warnings.push(...(it.translateWarnings || []));
      } else {
        log('Übersetze …');
        const t = await translateFn({ title: it.titleEn, text: it.textEn });
        it.titleDe = t.title;
        it.textDe = t.text;
      }
    }

    // 5) Tags nach Handbuch
    if (stopRequested) return stopped();
    const cat = await ctx.getCatalog();
    const hintCategory = it.category === 'cyber' || it.category === 'krimisi' ? it.category : (itemArea(it) !== 'both' ? itemArea(it) : undefined);
    const wbChoice = it.wbChoice || 'auto';
    const modelTags = !!ctx.settings.autoTags && !llmMissing(ctx.settings);
    const tagKey = `${wbChoice}|${hintCategory || ''}|${modelTags ? 'model' : 'basic'}`;
    let selection;
    if (sameText && it.tagSelection?.paths?.length && it.tagSelectionKey === tagKey) {
      selection = { ...it.tagSelection, warnings: [...(it.tagSelection.warnings || [])] };
      log('Tags aus dem vorigen Versuch wiederverwendet (Artikeltext unverändert).');
    } else if (modelTags) {
      log('Vergebe Tags nach Handbuch …');
      setStatus('Vergebe Tags nach Handbuch …', 'busy');
      const taggingRules = rulesBlock('tagging');
      selection = await suggestTags(
        { title: it.titleEn, titleDe: it.titleDe, text: it.textEn, url: it.url, siteName: it.siteName, sourceName: it.sourceName, category: hintCategory, score: it.score },
        cat,
        ctx.settings,
        { forceWb: wbChoice, rulesText: taggingRules.text }
      );
      countRuleHits(taggingRules);
      log(selectionToText(selection).replace(/\n/g, ' · '));
      for (const w of selection.warnings) log(`  Tag-Hinweis: ${w}`, 'warn');
    } else {
      // Ohne Modell nur Pflichttags: Struktur aus Relevanzprüfung/Bereich, News, Nachrichtenseite, „kein Standort“
      const structure = hintCategory === 'krimisi' ? 'KriMiSi' : 'Cyber';
      const paths = [STRUCTURE_PATHS[structure], PATH_NEWS, `${PATH_SOURCE_TYPE} → Nachrichtenseite`, PATH_NO_LOCATION];
      const wb = wbChoice === 'yes' ? (structure === 'KriMiSi' ? 'WB-KriMiSi' : 'WB-Cyber') : '';
      if (wb) paths.push(`Auftragstags → ${wb}`);
      selection = { structure, sourceType: 'Nachrichtenseite', locations: [PATH_NO_LOCATION], topics: [], ki: false, wb, wbReason: '', summary: it.reason || '', notes: '', paths, warnings: ['Tags ohne Modell: nur Pflichttags, Ort = „kein Standort“ – bitte in OSDP ergänzen'] };
      log('  Tag-Hinweis: ohne Modell nur Pflichttags gesetzt, Ort und Themen bitte in OSDP ergänzen', 'warn');
    }
    const tagPaths = selection.paths;
    it.tagSelection = { ...selection };
    it.tagSelectionKey = tagKey;
    it.summary2 = selection.summary;
    it.wbResult = selection.wb || '';
    for (const w of selection.warnings || []) it.warnings.push(`Tags: ${w}`);

    // 6) OSDP-Formular ausfüllen (ohne Save)
    if (stopRequested) return stopped();
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
      { save: false, translateFn, editorPrepared }
    );
    it.report = report;
    it.problems = [...(report.problems || [])];
    it.chips = report.chips || [];
    for (const p of it.problems) log(`  Problem: ${p}`, 'warn');
    if (report.duplicate) return markDuplicate(it, 'OSDP meldet: URL ist bereits in der Datenbank – übersprungen.');

    // 7) Freigabe: warten, bis der Nutzer in OSDP speichert (oder überspringt/abbricht)
    it.status = 'waiting';
    renderItems();
    showReview(it, selection);
    log('Ausgefüllt – wartet auf Freigabe im OSDP-Tab (Save, Überspringen oder Abbrechen).', 'ok');
    setStatus(`Meldung ${index} von ${total}: Formular ausgefüllt – warte auf Save im OSDP-Tab.`, 'busy');
    ctx.setAppStatus('Wartet auf Freigabe', 'busy');
    await driver.focusTab().catch(() => {});
    // Probleme beim Ausfüllen in der Leiste zeigen (beginnt mit ⚠ → Leiste wird als Warnung gestylt)
    const hint = it.problems.length
      ? shortText(`⚠ ${plural(it.problems.length, 'Problem', 'Probleme')}: ${it.problems.join(' · ')}`, 240)
      : undefined;
    const result = await driver.waitForReview({
      index,
      total,
      title: it.titleEn,
      structure: selection.structure,
      wb: selection.wb || '',
      hint,
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
      log(`Gespeichert (${SAVED_REASON_TEXT[result.reason] || SAVED_REASON_TEXT.toast}).`, 'ok');
      toastOk('Gespeichert', `${shortText(it.titleDe || it.titleEn, 80)}${index < total ? ` – weiter mit ${index + 1} von ${total}.` : ''}`);
      // Verlauf schreiben – ein Fehler hier (z. B. Speicherplatz) macht die Meldung nicht „ungespeichert“
      try {
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
          problems: it.problems,
          warnings: it.warnings
        });
        it.historyId = entry.id;
        // storage.onChanged kann den Verlauf schon ersetzt haben – nicht doppelt einfügen
        if (!ctx.history.some((e) => e.id === entry.id)) ctx.history.unshift(entry);
        ctx.views.history?.render();
      } catch (e) {
        const msg = e?.message || String(e);
        log(`Verlauf konnte nicht geschrieben werden (${msg}) – die Meldung gilt trotzdem als eingetragen.`, 'err');
        toastError('Verlauf nicht geschrieben', `${shortText(it.title, 60)}: ${msg}`);
      }
      try {
        await detectCorrection(it, tagPaths, it.chipsFinal, cat);
      } catch (e) {
        log(`Korrekturerkennung fehlgeschlagen: ${e?.message || e}`, 'warn');
      }
      return 'next';
    }
    if (result.outcome === 'duplicate') return markDuplicate(it, 'OSDP meldet beim Speichern: Duplikat – URL ist bereits in der Datenbank.');
    if (result.outcome === 'skip') {
      it.status = 'skipped';
      it.selected = false;
      log('Übersprungen.', 'warn');
      return 'next';
    }
    if (result.outcome === 'abort') {
      restoreStatus();
      log('Abgebrochen – die Meldung bleibt ausgewählt; das ausgefüllte Formular wird beim nächsten Lauf verworfen.', 'warn');
      return 'abort';
    }
    // timeout / lost: Lauf beenden, Meldung bleibt ausgewählt (Übersetzung/Tags werden beim nächsten Versuch wiederverwendet)
    restoreStatus();
    const why = result.outcome === 'timeout'
      ? 'keine Entscheidung im OSDP-Tab (Zeitüberschreitung)'
      : (LOST_REASON_TEXT[result.reason] || 'der OSDP-Tab ist nicht mehr erreichbar');
    it.error = `Freigabe abgebrochen: ${why}. Die Meldung bleibt ausgewählt – Lauf erneut starten.`;
    log(`Lauf beendet bei „${it.title}“: ${it.error}`, 'err');
    toastError('Lauf beendet', it.error);
    return 'abort';
  } catch (e) {
    hideReview();
    if (isRateLimit(e)) {
      // Nicht als Fehler der Meldung werten: Auswahl bleibt, der Durchlauf wird oben angehalten
      restoreStatus();
      renderItems();
      throw e;
    }
    it.status = 'error';
    it.error = withAdvice(e.message || String(e));
    log(`Fehler bei „${it.title}“: ${it.error}`, 'err');
    toastError('Meldung übersprungen', `${shortText(it.title, 60)}: ${it.error}`);
    return 'next';
  }
}

/** Tags im OSDP-Formular wurden vor dem Save geändert? → Korrektur als Regel vorschlagen (Dialog, nicht blockierend). */
async function detectCorrection(it, suggestedPaths, finalChips, catalog) {
  if (!finalChips?.length || !suggestedPaths?.length) return;
  const corr = rulesLib.correctionFromChips({ suggestedPaths, finalChips, catalog });
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

async function runAll(area = currentArea()) {
  await scan(area);
  if (stopRequested) return;
  await classify(area);
  if (stopRequested) return;
  await processSelected(area);
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
    const by = it.historyBy === 'title' ? 'gleicher Titel' : it.historyBy === 'url' ? 'gleiche URL' : '';
    const since = it.historyAt ? ` seit ${fmtDateTime(it.historyAt)}` : '';
    const title = `Steht bereits im Verlauf${since}${by ? ` (${by})` : ''} – lässt sich trotzdem anhaken und eintragen.`;
    td.append(badge(STATUS_LABEL.in_history, 'muted', { sm: true, title }));
    if (by) td.append(badge(by, 'outline', { sm: true, title }));
    td.title = title;
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
    it.historyAt ? `Im Verlauf seit: ${fmtDateTime(it.historyAt)}${it.historyBy === 'title' ? ' (gleicher Titel)' : it.historyBy === 'url' ? ' (gleiche URL)' : ''}` : '',
    `URL: ${it.url}`
  ].filter(Boolean).join('\n');
}

/** Zähler an den Filter-Reitern (auch nach einzelnen Auswahländerungen ohne Neuzeichnen der Tabelle). */
function renderFilterCounts(areaItems = items().filter((it) => inArea(it, currentArea()))) {
  for (const b of $('itemsFilter').querySelectorAll('[data-filter]')) {
    const n = areaItems.filter(FILTERS[b.dataset.filter] || FILTERS.all).length;
    b.querySelector('[data-count]').textContent = n ? String(n) : '';
  }
}

function renderItems() {
  const area = currentArea();
  const areaItems = items().filter((it) => inArea(it, area));
  const visible = areaItems.filter(FILTERS[filter] || FILTERS.all);
  setActive($('itemsFilter'), 'filter', filter);
  renderFilterCounts(areaItems);

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
      renderFilterCounts();
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
  // Zähler in der Navigation folgt jeder Auswahländerung
  renderNavCount();
}
