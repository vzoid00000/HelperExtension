// Automatik-Seite: Quellen scannen → Relevanz prüfen → Artikel laden, übersetzen,
// Tags nach Handbuch vergeben, in OSDP eintragen und speichern, Verlauf führen.

import { loadSettings, getSources, llmMissing } from '../lib/settings.js';
import { lastFriday, formatDisplay, parseDate, checkArticleDate, toIsoDate, formatDate } from '../lib/dates.js';
import { normalizeAuthor } from '../lib/author.js';
import { loadSource, fetchText } from '../lib/feeds.js';
import { extractViaTab } from '../lib/tabloader.js';
import { classifyItems } from '../lib/classify.js';
import { translateArticle } from '../lib/translate.js';
import { OsdpDriver } from '../lib/osdp-driver.js';
import { TagCatalog, selectionToText, STRUCTURE_PATHS, PATH_NEWS, PATH_SOURCE_TYPE, PATH_NO_LOCATION } from '../lib/tag-catalog.js';
import { suggestTags } from '../lib/tagger.js';
import { loadHistory, addHistoryEntry, updateHistoryEntry, removeHistoryEntry, filterHistory, historyStats, historyToMarkdown, historyToCsv } from '../lib/history.js';

const $ = (id) => document.getElementById(id);
const CONCURRENT_SOURCES = 4;

let settings = null;
let state = { items: {}, order: [], sources: {}, lastScan: null };
let processed = {};
let history = [];
let catalog = null;
let running = false;
let stopRequested = false;
let expanded = new Set();

// ------------------------------------------------------------------ Init ----

async function init() {
  settings = await loadSettings();
  const stored = await chrome.storage.local.get(['autoState', 'processed']);
  if (stored.autoState) state = { ...state, ...stored.autoState };
  processed = stored.processed || {};
  history = await loadHistory();

  $('earliestDate').textContent = formatDisplay(lastFriday());
  updateTranslatorInfo();
  render();

  $('btnOptions').addEventListener('click', () => chrome.runtime.openOptionsPage());
  $('btnAll').addEventListener('click', () => run(runAll));
  $('btnScan').addEventListener('click', () => run(scan));
  $('btnClassify').addEventListener('click', () => run(classify));
  $('btnProcess').addEventListener('click', () => run(processSelected));
  $('btnStop').addEventListener('click', () => {
    stopRequested = true;
    log('Stopp angefordert – aktueller Schritt wird beendet.', 'warn');
  });
  $('filter').addEventListener('change', renderItems);
  $('btnSelectRelevant').addEventListener('click', () => {
    for (const it of items()) if (it.status === 'relevant') it.selected = true;
    renderItems();
    saveState();
  });
  $('btnClearSelection').addEventListener('click', () => {
    for (const it of items()) it.selected = false;
    renderItems();
    saveState();
  });
  $('btnForget').addEventListener('click', async () => {
    if (!confirm('Meldungsliste und Verlauf der eingetragenen URLs löschen? (Der Verlauf unten bleibt erhalten.)')) return;
    state = { items: {}, order: [], sources: {}, lastScan: null };
    processed = {};
    await chrome.storage.local.set({ autoState: state, processed });
    render();
  });
  $('historyRange').addEventListener('change', renderHistory);
  $('btnHistoryMd').addEventListener('click', async () => {
    const list = filterHistory(history, $('historyRange').value);
    await navigator.clipboard.writeText(historyToMarkdown(list, `Eingetragene News (${rangeLabel()})`));
    setStatus(`${list.length} Einträge als Markdown in die Zwischenablage kopiert.`, 'ok');
  });
  $('btnHistoryCsv').addEventListener('click', () => {
    const list = filterHistory(history, $('historyRange').value);
    download(`osdp-verlauf-${toIsoDate(new Date())}.csv`, '﻿' + historyToCsv(list), 'text/csv');
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.settings) {
      settings = { ...settings, ...changes.settings.newValue };
      updateTranslatorInfo();
    }
    if (changes.history && !running) {
      history = changes.history.newValue || [];
      renderHistory();
    }
  });

  if (new URLSearchParams(location.search).get('autorun') === '1') {
    log('Automatischer Start (Zeitplan).');
    run(runAll);
  }
}

const items = () => state.order.map((k) => state.items[k]).filter(Boolean);
const rangeLabel = () => ({ today: 'heute', week: 'diese Woche', all: 'gesamt' })[$('historyRange').value];

function updateTranslatorInfo() {
  const names = { claude: 'Claude API', local: 'lokales Modell', deepl: 'DeepL', chrome: 'Chrome (integriert)' };
  const llm = settings.llmProvider === 'local' ? 'lokales Modell' : 'Claude API';
  const missing = llmMissing(settings);
  $('translatorInfo').textContent = `Modell: ${llm} · Übersetzung: ${names[settings.translator] || settings.translator}${missing ? ' · ⚠ ' + missing : ''}`;
}

async function run(fn) {
  if (running) return;
  running = true;
  stopRequested = false;
  setButtons(true);
  try {
    await fn();
  } catch (err) {
    console.error(err);
    log(`Fehler: ${err.message || err}`, 'err');
    setStatus(err.message || String(err), 'err');
  } finally {
    running = false;
    setButtons(false);
    setProgress(0);
    await saveState();
  }
}

function setButtons(busy) {
  for (const id of ['btnAll', 'btnScan', 'btnClassify', 'btnProcess']) $(id).disabled = busy;
  $('btnStop').disabled = !busy;
}

function setStatus(msg, kind = '') {
  const el = $('status');
  el.hidden = !msg;
  el.className = `status ${kind}`;
  el.textContent = msg;
}

function setProgress(fraction) {
  $('progressBar').style.width = `${Math.round(Math.max(0, Math.min(1, fraction)) * 100)}%`;
}

function log(msg, kind = '') {
  const el = $('log');
  const time = new Date().toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const prefix = kind === 'err' ? '✖ ' : kind === 'warn' ? '⚠ ' : '';
  el.textContent += `[${time}] ${prefix}${msg}\n`;
  const lines = el.textContent.split('\n');
  if (lines.length > 500) el.textContent = lines.slice(-500).join('\n');
  el.scrollTop = el.scrollHeight;
  if (kind !== 'err') setStatus(msg, kind);
}

async function saveState() {
  const slim = { ...state, items: {} };
  for (const [k, it] of Object.entries(state.items)) {
    const { textEn, textDe, report, ...rest } = it;
    slim.items[k] = rest;
  }
  await chrome.storage.local.set({ autoState: slim, processed });
}

function download(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  chrome.downloads.download({ url, filename, saveAs: false, conflictAction: 'uniquify' }).finally(() => setTimeout(() => URL.revokeObjectURL(url), 60000));
}

function normalizeUrl(u) {
  try {
    const url = new URL(u);
    url.hash = '';
    for (const k of [...url.searchParams.keys()]) if (/^(utm_|fbclid|gclid|ref$|src$|cmpid|ocid)/i.test(k)) url.searchParams.delete(k);
    return url.href.replace(/\/$/, '');
  } catch {
    return u;
  }
}

async function getCatalog() {
  if (!catalog) catalog = await TagCatalog.load();
  return catalog;
}

// ------------------------------------------------------------------ Scan ----

async function scan() {
  const sources = getSources(settings).filter((s) => s.enabled !== false);
  if (!sources.length) throw new Error('Keine Quellen konfiguriert (Einstellungen).');
  const earliest = lastFriday();
  log(`Scanne ${sources.length} Quellen (Artikel ab ${formatDate(earliest)}) …`);
  state.sources = {};
  let done = 0;
  let added = 0;

  const queue = [...sources];
  const worker = async () => {
    while (queue.length) {
      const src = queue.shift();
      state.sources[src.name] = { status: 'lädt …' };
      renderSources();
      try {
        const found = await loadSource(src);
        let fresh = 0;
        let old = 0;
        let known = 0;
        for (const it of found) {
          const key = normalizeUrl(it.url);
          if (processed[key]) {
            known++;
            continue;
          }
          if (it.date && it.date.getTime() < earliest.getTime()) {
            old++;
            continue;
          }
          if (state.items[key]) {
            const ex = state.items[key];
            if (!ex.summary && it.summary) ex.summary = it.summary;
            if (!ex.dateIso && it.date) ex.dateIso = toIsoDate(it.date);
            known++;
            continue;
          }
          state.items[key] = {
            key,
            url: it.url,
            title: it.title,
            summary: it.summary,
            author: it.author,
            dateIso: it.date ? toIsoDate(it.date) : '',
            sourceName: it.sourceName,
            sourceCategory: it.sourceCategory,
            status: 'new',
            selected: false,
            wbChoice: 'auto',
            addedAt: Date.now()
          };
          state.order.unshift(key);
          fresh++;
          added++;
        }
        state.sources[src.name] = { status: 'ok', total: found.length, fresh, old, known };
      } catch (e) {
        state.sources[src.name] = { status: 'error', error: e.message || String(e) };
        log(`${src.name}: ${e.message || e}`, 'warn');
      }
      done++;
      setProgress(done / sources.length);
      renderSources();
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENT_SOURCES, sources.length) }, worker));
  state.lastScan = Date.now();
  render();
  await saveState();
  log(`Scan fertig: ${added} neue Meldungen.`, 'ok');
}

// -------------------------------------------------------------- Classify ----

async function classify() {
  const candidates = items().filter((it) => it.status === 'new');
  if (!candidates.length) {
    log('Keine neuen Meldungen zur Relevanzprüfung.');
    return;
  }
  const missing = llmMissing(settings);
  if (missing) throw new Error(`Relevanzprüfung nicht möglich: ${missing}`);

  const input = candidates.map((it, i) => ({ id: i, title: it.title, summary: it.summary, sourceName: it.sourceName, sourceCategory: it.sourceCategory }));
  const results = await classifyItems(input, settings, (m) => {
    log(m);
    setProgress(parseInt(m.match(/(\d+)\//)?.[1] || 0, 10) / candidates.length);
  });
  let relevant = 0;
  candidates.forEach((it, i) => {
    const r = results.get(i) || { category: 'none', score: 0, reason: '' };
    it.category = r.category;
    it.score = r.score;
    it.reason = r.reason;
    const isRelevant = r.category !== 'none' && r.score >= Number(settings.minScore ?? 6);
    it.status = isRelevant ? 'relevant' : 'irrelevant';
    it.selected = isRelevant;
    if (isRelevant) relevant++;
  });
  render();
  await saveState();
  log(`Relevanzprüfung fertig: ${relevant} von ${candidates.length} Meldungen relevant (Schwelle ${settings.minScore}).`, 'ok');
}

// --------------------------------------------------------------- Process ----

async function processSelected() {
  const list = items().filter((it) => it.selected && !['saved', 'filled', 'processing'].includes(it.status));
  if (!list.length) {
    log('Keine ausgewählten Meldungen zum Eintragen.');
    return;
  }
  const limit = Number(settings.maxItemsPerRun) || 25;
  const todo = list.slice(0, limit);
  if (list.length > limit) log(`Hinweis: nur die ersten ${limit} von ${list.length} ausgewählten Meldungen werden verarbeitet (Einstellung „max. pro Durchlauf“).`, 'warn');
  if (settings.autoTags && llmMissing(settings)) log(`Tagging per Modell nicht möglich (${llmMissing(settings)}) – es wird nur der Struktur-Tag gesetzt.`, 'warn');

  const driver = new OsdpDriver(settings, (m) => log(m));
  await driver.ensureTab();
  let ok = 0;
  for (let i = 0; i < todo.length; i++) {
    if (stopRequested) break;
    setProgress(i / todo.length);
    const it = todo[i];
    log(`(${i + 1}/${todo.length}) ${it.title}`);
    await processItem(it, driver);
    if (it.status === 'saved' || it.status === 'filled') ok++;
    renderItems();
    await saveState();
    if (!settings.autoSave && it.status === 'filled') {
      log('Automatisches Speichern ist aus: bitte im OSDP-Tab prüfen und auf „Save“ klicken, dann „3 · Ausgewählte eintragen“ erneut starten.', 'warn');
      await driver.focusTab();
      break;
    }
  }
  log(`Eintragen beendet: ${ok} von ${todo.length} erfolgreich.`, ok === todo.length ? 'ok' : 'warn');
}

async function processItem(it, driver) {
  it.status = 'processing';
  it.error = '';
  renderItems();
  try {
    // 1) Artikel laden
    const ex = await loadArticle(it.url);
    if (!ex || !ex.text || ex.text.length < 200) throw new Error('Artikeltext nicht lesbar (Paywall oder unbekanntes Layout)');

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
      return;
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

    // 4) Übersetzen (bei OSDP-Extract übernimmt der Driver das nach dem Extract)
    const translateFn = async ({ title, text }) => {
      const t = await translateArticle({ title, text }, settings, (m) => setStatus(m));
      return { title: t.title, text: t.text };
    };
    if (!settings.useSiteExtract) {
      log('Übersetze …');
      const t = await translateFn({ title: it.titleEn, text: it.textEn });
      it.titleDe = t.title;
      it.textDe = t.text;
    }

    // 5) Tags nach Handbuch
    let tagPaths = null;
    let selection = null;
    const cat = await getCatalog();
    if (settings.autoTags && !llmMissing(settings)) {
      log('Vergebe Tags nach Handbuch …');
      selection = await suggestTags(
        { title: it.titleEn, titleDe: it.titleDe, text: it.textEn, url: it.url, siteName: it.siteName, sourceName: it.sourceName, category: it.category, score: it.score },
        cat,
        settings,
        { forceWb: it.wbChoice || 'auto' }
      );
      tagPaths = selection.paths;
      it.tagSelection = { ...selection };
      it.summary2 = selection.summary;
      it.wbResult = selection.wb || '';
      log(selectionToText(selection).replace(/\n/g, ' · '));
      for (const w of selection.warnings) log(`  Tag-Hinweis: ${w}`, 'warn');
    } else {
      // Minimal-Pflichttags ohne Modell
      const structure = it.category === 'krimisi' ? 'KriMiSi' : 'Cyber';
      tagPaths = [STRUCTURE_PATHS[structure], PATH_NEWS, `${PATH_SOURCE_TYPE} → Nachrichtenseite`, PATH_NO_LOCATION];
      if (it.wbChoice === 'yes') tagPaths.push(structure === 'KriMiSi' ? 'Auftragstags → WB-KriMiSi' : 'Auftragstags → WB-Cyber');
      selection = { structure, wb: it.wbChoice === 'yes' ? (structure === 'KriMiSi' ? 'WB-KriMiSi' : 'WB-Cyber') : '', ki: false, summary: it.reason || '', paths: tagPaths, warnings: ['Tags ohne Modell: nur Pflichttags, Ort = „kein Standort“ – bitte in OSDP ergänzen'] };
      it.tagSelection = selection;
      it.wbResult = selection.wb;
      log('  Tag-Hinweis: ohne Modell nur Pflichttags gesetzt, geografische Zuordnung bitte ergänzen', 'warn');
    }

    // 6) In OSDP eintragen
    log('Trage in OSDP ein …');
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
      { save: !!settings.autoSave, translateFn }
    );
    it.report = report;
    for (const p of report.problems) log(`  Problem: ${p}`, 'warn');
    const meta = report.steps.metadata;
    if (meta?.structure) it.metadataStructure = meta.structure;
    it.chips = report.steps.tags?.chips || report.steps.tag?.chips || [];

    const done = settings.autoSave ? report.saved : true;
    if (settings.autoSave && report.duplicate) {
      it.status = 'duplicate';
      it.selected = false;
      processed[it.key] = { at: Date.now(), title: it.title, status: 'duplicate' };
      log('OSDP meldet: URL ist bereits in der Datenbank – übersprungen.', 'warn');
      return;
    }
    if (settings.autoSave && !report.saved) {
      throw new Error(`Speichern fehlgeschlagen: ${report.problems.join('; ') || 'keine Rückmeldung'}`);
    }
    it.status = settings.autoSave ? 'saved' : 'filled';
    it.savedAt = Date.now();
    processed[it.key] = { at: Date.now(), title: it.title, status: it.status };
    if (done) {
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
        summary: selection.summary || it.reason || '',
        author: it.authorFinal,
        authorUnknown: it.authorUnknown,
        saved: !!settings.autoSave,
        problems: report.problems
      });
      history.unshift(entry);
      renderHistory();
    }
    log(settings.autoSave ? `Gespeichert${report.snackbar ? ' – OSDP: „' + report.snackbar + '“' : ''}.` : 'Ausgefüllt – bitte in OSDP prüfen und speichern.', 'ok');
  } catch (e) {
    it.status = 'error';
    it.error = e.message || String(e);
    log(`Fehler bei „${it.title}“: ${it.error}`, 'err');
  }
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

// ----------------------------------------------------------------- Run all --

async function runAll() {
  await scan();
  if (stopRequested) return;
  await classify();
  if (stopRequested) return;
  await processSelected();
}

// ---------------------------------------------------------------- Render ----

function render() {
  renderSources();
  renderItems();
  renderHistory();
}

function renderSources() {
  const tbody = $('sourcesTable').querySelector('tbody');
  tbody.textContent = '';
  const sources = getSources(settings);
  let okCount = 0;
  for (const s of sources) {
    const st = state.sources[s.name];
    const tr = document.createElement('tr');
    const tdName = document.createElement('td');
    tdName.textContent = s.name + (s.enabled === false ? ' (aus)' : '');
    const tdType = document.createElement('td');
    tdType.textContent = s.type === 'html' ? 'Seite' : 'RSS';
    const tdStatus = document.createElement('td');
    if (!st) tdStatus.textContent = '–';
    else if (st.status === 'ok') {
      tdStatus.textContent = `${st.fresh} neu · ${st.old} zu alt · ${st.known} bekannt`;
      okCount++;
    } else if (st.status === 'error') {
      tdStatus.textContent = `Fehler: ${st.error}`;
      tdStatus.className = 'st-error';
    } else tdStatus.textContent = st.status;
    tr.append(tdName, tdType, tdStatus);
    tbody.append(tr);
  }
  $('sourcesSummary').textContent = state.lastScan ? `· letzter Scan ${new Date(state.lastScan).toLocaleString('de-AT')} · ${okCount}/${sources.length} ok` : '';
}

const STATUS_LABEL = {
  new: 'neu',
  relevant: 'relevant',
  irrelevant: 'nicht relevant',
  processing: 'läuft …',
  saved: 'eingetragen',
  filled: 'ausgefüllt (manuell speichern)',
  error: 'Fehler',
  too_old: 'zu alt',
  duplicate: 'Duplikat in OSDP'
};

function renderItems() {
  const filter = $('filter').value;
  const all = items();
  const visible = all.filter((it) => {
    if (filter === 'relevant') return ['relevant', 'processing', 'saved', 'filled', 'error', 'too_old', 'duplicate'].includes(it.status);
    if (filter === 'selected') return it.selected;
    if (filter === 'done') return it.status === 'saved' || it.status === 'filled';
    if (filter === 'error') return it.status === 'error';
    return true;
  });
  const tbody = $('itemsTable').querySelector('tbody');
  tbody.textContent = '';
  for (const it of visible) {
    const tr = document.createElement('tr');
    tr.className = 'clickable';
    const tdSel = document.createElement('td');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = !!it.selected;
    cb.disabled = it.status === 'saved' || it.status === 'processing';
    cb.addEventListener('click', (e) => e.stopPropagation());
    cb.addEventListener('change', () => {
      it.selected = cb.checked;
      saveState();
    });
    tdSel.append(cb);

    const tdCat = document.createElement('td');
    const badge = document.createElement('span');
    badge.className = `badge ${it.category || 'none'}`;
    badge.textContent = it.category === 'cyber' ? 'Cyber' : it.category === 'krimisi' ? 'KriMiSi' : it.category === 'none' ? '–' : '?';
    tdCat.append(badge);

    const tdScore = document.createElement('td');
    tdScore.className = 'num';
    tdScore.textContent = it.score ?? '';

    const tdWb = document.createElement('td');
    if (it.status === 'saved' || it.status === 'filled') {
      tdWb.textContent = it.wbResult ? it.wbResult : '–';
      if (it.wbResult) tdWb.className = 'st-saved';
    } else {
      const sel = document.createElement('select');
      for (const [v, l] of [['auto', 'auto'], ['yes', 'ja'], ['no', 'nein']]) {
        const o = document.createElement('option');
        o.value = v;
        o.textContent = l;
        sel.append(o);
      }
      sel.value = it.wbChoice || 'auto';
      sel.addEventListener('click', (e) => e.stopPropagation());
      sel.addEventListener('change', () => {
        it.wbChoice = sel.value;
        saveState();
      });
      tdWb.append(sel);
    }

    const tdDate = document.createElement('td');
    tdDate.textContent = it.dateIso ? formatDate(parseDate(it.dateIso)) : '?';

    const tdSrc = document.createElement('td');
    tdSrc.textContent = it.sourceName;

    const tdTitle = document.createElement('td');
    tdTitle.className = 'title';
    const a = document.createElement('a');
    a.href = it.url;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = it.title;
    a.addEventListener('click', (e) => e.stopPropagation());
    tdTitle.append(a);

    const tdStatus = document.createElement('td');
    tdStatus.className = `st-${it.status}`;
    tdStatus.textContent = STATUS_LABEL[it.status] || it.status;
    if (it.error) tdStatus.title = it.error;

    tr.append(tdSel, tdCat, tdScore, tdWb, tdDate, tdSrc, tdTitle, tdStatus);
    tr.addEventListener('click', () => {
      if (expanded.has(it.key)) expanded.delete(it.key);
      else expanded.add(it.key);
      renderItems();
    });
    tbody.append(tr);

    if (expanded.has(it.key)) {
      const trd = document.createElement('tr');
      trd.className = 'details';
      const td = document.createElement('td');
      td.colSpan = 8;
      td.textContent = [
        it.reason ? `Begründung: ${it.reason}` : '',
        it.summary ? `Feed-Zusammenfassung: ${it.summary}` : '',
        it.summary2 ? `Zusammenfassung: ${it.summary2}` : '',
        it.titleDe ? `Titel (DE): ${it.titleDe}` : '',
        it.authorRaw !== undefined ? `Autor: ${it.authorUnknown ? 'Autor ungenannt' : it.authorFinal}${it.authorRaw ? ' (gefunden: „' + it.authorRaw + '“)' : ''}` : '',
        it.tagSelection ? `Tags:\n${selectionToText(it.tagSelection)}` : '',
        it.tagSelection?.warnings?.length ? `Tag-Hinweise: ${it.tagSelection.warnings.join('; ')}` : '',
        it.chips?.length ? `In OSDP gesetzt: ${it.chips.join(', ')}` : '',
        it.error ? `Fehler: ${it.error}` : '',
        it.report?.problems?.length ? `Probleme: ${it.report.problems.join('; ')}` : '',
        it.metadataStructure ? `Metadata-Felder: ${JSON.stringify(it.metadataStructure)}` : ''
      ].filter(Boolean).join('\n');
      trd.append(td);
      tbody.append(trd);
    }
  }
  const counts = all.reduce((acc, it) => ((acc[it.status] = (acc[it.status] || 0) + 1), acc), {});
  $('itemsSummary').textContent = `· ${all.length} gesamt · ${counts.relevant || 0} relevant · ${all.filter((i) => i.selected).length} ausgewählt · ${counts.saved || 0} eingetragen`;
}

function renderHistory() {
  const range = $('historyRange').value;
  const list = filterHistory(history, range);
  const st = historyStats(history);
  $('historyStats').textContent = `· heute ${st.today} (Cyber ${st.todayCyber}, KriMiSi ${st.todayKrimisi}) · diese Woche ${st.week}, davon WB-Cyber ${st.wbCyber}, WB-KriMiSi ${st.wbKrimisi}`;
  const tbody = $('historyTable').querySelector('tbody');
  tbody.textContent = '';
  for (const e of list) {
    const tr = document.createElement('tr');
    const tdTime = document.createElement('td');
    const d = new Date(e.at);
    tdTime.textContent = `${formatDate(d)} ${d.toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' })}`;
    const tdStruct = document.createElement('td');
    const badge = document.createElement('span');
    badge.className = `badge ${e.structure === 'KriMiSi' ? 'krimisi' : e.structure === 'Cyber' ? 'cyber' : 'none'}`;
    badge.textContent = e.structure || '–';
    tdStruct.append(badge);
    const tdWb = document.createElement('td');
    const wbBtn = document.createElement('button');
    wbBtn.className = 'ghost';
    wbBtn.textContent = e.wb || 'nein';
    wbBtn.title = 'WB-Kennzeichnung im Verlauf umschalten';
    wbBtn.addEventListener('click', async () => {
      const next = e.wb ? '' : e.structure === 'KriMiSi' ? 'WB-KriMiSi' : 'WB-Cyber';
      await updateHistoryEntry(e.id, { wb: next });
      e.wb = next;
      renderHistory();
    });
    tdWb.append(wbBtn);
    const tdTitle = document.createElement('td');
    tdTitle.className = 'title';
    const a = document.createElement('a');
    a.href = e.url;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = e.titleDe || e.title;
    tdTitle.append(a);
    const tdSrc = document.createElement('td');
    tdSrc.textContent = e.sourceName || e.siteName || '';
    const tdSum = document.createElement('td');
    tdSum.textContent = e.summary || '';
    const tdDel = document.createElement('td');
    const del = document.createElement('button');
    del.className = 'ghost';
    del.textContent = '✕';
    del.title = 'Eintrag aus dem Verlauf entfernen';
    del.addEventListener('click', async () => {
      if (!confirm('Eintrag aus dem Verlauf entfernen?')) return;
      await removeHistoryEntry(e.id);
      history = history.filter((x) => x.id !== e.id);
      renderHistory();
    });
    tdDel.append(del);
    tr.append(tdTime, tdStruct, tdWb, tdTitle, tdSrc, tdSum, tdDel);
    tbody.append(tr);
  }
}

init();
