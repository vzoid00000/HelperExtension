// Ansicht „Einstellungen“: Sprachmodell, Übersetzung, Automatik, lokaler Server, OSDP, Werkzeuge
// (DOM-Dump, Tag-Export) und Datensicherung (Gesamtexport/-import). Logik aus der alten
// Optionsseite übernommen; Quellen werden in der Ansicht „Quellen“ verwaltet.

import { saveSettings, DEFAULT_SETTINGS } from '../../lib/settings.js';
import { translateArticle } from '../../lib/translate.js';
import { testLocalLlm } from '../../lib/llm.js';
import { OsdpDriver } from '../../lib/osdp-driver.js';
import { exportAllData, importAllData } from '../../lib/data-transfer.js';
import { toIsoDate } from '../../lib/dates.js';
import { $, toastOk, toastError, setStatusEl, download, readFileAsText, stamp, plural } from '../ui.js';

const TEXT_FIELDS = ['llmProvider', 'anthropicApiKey', 'anthropicModel', 'localLlmUrl', 'localLlmModel', 'localLlmApiKey', 'localLlmTimeoutSec', 'translator', 'deeplApiKey', 'minScore', 'maxItemsPerRun', 'autoRunTime', 'osdpDateFormat', 'authorUnknownText', 'osdpUrlPattern'];
const BOOL_FIELDS = ['autoTags', 'fillEnglishTab', 'useSiteExtract'];

let ctx = null;
let dirty = false;

export async function init(c) {
  ctx = c;
  fill(ctx.settings);
  for (const f of [...TEXT_FIELDS, ...BOOL_FIELDS]) {
    $(f).addEventListener('input', () => (dirty = true));
    $(f).addEventListener('change', () => (dirty = true));
  }

  $('btnPresetCheap').addEventListener('click', () => {
    $('llmProvider').value = 'claude';
    $('translator').value = 'claude';
    $('anthropicModel').value = 'claude-haiku-5-5';
    dirty = true;
    const hasKey = !!$('anthropicApiKey').value.trim();
    setStatus(hasKey ? 'Sparmodus gesetzt – bitte „Speichern“ und „Übersetzung testen“.' : 'Sparmodus gesetzt – jetzt den API-Key von console.anthropic.com eintragen, „Speichern“ und „Übersetzung testen“.', 'ok');
    if (!hasKey) $('anthropicApiKey').focus();
  });
  $('btnPresetBridge').addEventListener('click', () => {
    $('llmProvider').value = 'local';
    $('translator').value = 'local';
    $('localLlmUrl').value = 'http://localhost:4310/v1';
    $('localLlmModel').value = 'opus';
    dirty = true;
    setStatus('Voreinstellung gesetzt – bitte „Speichern“ und dann „Verbindung testen“ (die Brücke muss laufen).', 'ok');
  });
  $('btnSave').addEventListener('click', save);
  $('btnTestLocal').addEventListener('click', testLocal);
  $('btnTest').addEventListener('click', testTranslation);
  $('btnExportData').addEventListener('click', exportData);
  $('btnImportData').addEventListener('click', () => $('fileImport').click());
  $('fileImport').addEventListener('change', importData);
  $('btnInspector').addEventListener('click', () => guard(inspectOsdp, $('btnInspector')));
  $('btnExportTags').addEventListener('click', () => guard(exportTags, $('btnExportTags')));
  return { render: () => fill(ctx.settings), onSettingsChanged, fill, readForm };
}

function setStatus(msg, kind = '') {
  setStatusEl($('settingsStatus'), msg, kind);
}

function onSettingsChanged() {
  // Von außen geändert (Import, andere Seite): Formular übernehmen, solange hier nichts editiert wird
  if (!dirty) fill(ctx.settings);
}

/** Formular aus den Einstellungen füllen (unbekannte Modell-ID als Option ergänzen). */
function fill(settings) {
  const s = { ...DEFAULT_SETTINGS, ...(settings || {}) };
  const modelSel = $('anthropicModel');
  const storedModel = s.anthropicModel || DEFAULT_SETTINGS.anthropicModel;
  if (storedModel && ![...modelSel.options].some((o) => o.value === storedModel)) modelSel.append(new Option(storedModel, storedModel));
  for (const f of TEXT_FIELDS) $(f).value = s[f] ?? '';
  for (const f of BOOL_FIELDS) $(f).checked = !!s[f];
  dirty = false;
}

function readForm() {
  const s = {};
  for (const f of TEXT_FIELDS) s[f] = $(f).value.trim();
  for (const f of BOOL_FIELDS) s[f] = $(f).checked;
  s.minScore = Math.max(0, Math.min(10, Number(s.minScore) || 0));
  s.maxItemsPerRun = Math.max(1, Math.min(200, Number(s.maxItemsPerRun) || 25));
  s.localLlmTimeoutSec = Math.max(30, Number(s.localLlmTimeoutSec) || 600);
  return s;
}

async function save() {
  const s = readForm();
  if (s.autoRunTime && !/^\d{1,2}:\d{2}$/.test(s.autoRunTime)) {
    setStatus('Uhrzeit bitte als HH:MM angeben.', 'err');
    return toastError('Nicht gespeichert', 'Uhrzeit bitte als HH:MM angeben.');
  }
  if (s.osdpUrlPattern && !/^(https?|file):\/\//i.test(s.osdpUrlPattern)) {
    setStatus('Das URL-Muster des OSDP-Tabs muss mit http://, https:// oder file:// beginnen.', 'err');
    return toastError('Nicht gespeichert', 'URL-Muster des OSDP-Tabs ungültig.');
  }
  if (s.llmProvider === 'local' && s.localLlmUrl && !/^https?:\/\//i.test(s.localLlmUrl)) {
    setStatus('Die Server-URL muss mit http:// oder https:// beginnen.', 'err');
    return toastError('Nicht gespeichert', 'Server-URL ungültig.');
  }
  const next = { ...DEFAULT_SETTINGS, ...ctx.settings, ...s };
  await saveSettings(next);
  ctx.settings = next;
  dirty = false;
  $('minScore').value = s.minScore;
  $('maxItemsPerRun').value = s.maxItemsPerRun;
  $('localLlmTimeoutSec').value = s.localLlmTimeoutSec;
  setStatus('Gespeichert.', 'ok');
  toastOk('Einstellungen gespeichert');
  ctx.views.run?.onSettingsChanged();
}

async function testLocal() {
  const s = { ...DEFAULT_SETTINGS, ...ctx.settings, ...readForm() };
  setStatus('Teste lokales Modell …', 'busy');
  $('btnTestLocal').disabled = true;
  try {
    const r = await testLocalLlm(s);
    setStatus(`Verbunden. Modelle: ${r.models.join(', ') || '(keine gemeldet)'} · Antwort: „${r.answer}“`, 'ok');
    toastOk('Verbindung OK', `Antwort: „${r.answer}“`);
  } catch (e) {
    setStatus(e.message, 'err');
    toastError('Verbindung fehlgeschlagen', e.message);
  } finally {
    $('btnTestLocal').disabled = false;
  }
}

async function testTranslation() {
  const s = { ...DEFAULT_SETTINGS, ...ctx.settings, ...readForm() };
  setStatus('Teste Übersetzung …', 'busy');
  $('btnTest').disabled = true;
  try {
    const r = await translateArticle(
      { title: 'Hackers breach defence contractor', text: 'The attackers gained access to internal systems on Friday, the company said.' },
      s,
      (m) => setStatus(m, 'busy')
    );
    setStatus(`OK (${r.provider}): „${r.title}“ – ${r.text}${r.warnings.length ? ' · Hinweise: ' + r.warnings.join('; ') : ''}`, 'ok');
    toastOk('Übersetzung OK', `„${r.title}“`);
  } catch (e) {
    setStatus(e.message, 'err');
    toastError('Übersetzung fehlgeschlagen', e.message);
  } finally {
    $('btnTest').disabled = false;
  }
}

// --------------------------------------------------------------- Daten ----

async function exportData() {
  try {
    const data = await exportAllData({ includeSecrets: true });
    await download(`osdp-helper-daten-${toIsoDate(new Date())}.json`, JSON.stringify(data, null, 2), 'application/json');
    toastOk('Daten exportiert', `${plural(data.history.length, 'Verlaufseintrag', 'Verlaufseinträge')}, ${plural(data.rules.length, 'Regel', 'Regeln')}, ${plural(data.sources.length, 'Quelle', 'Quellen')}. Die Datei enthält API-Keys – nicht weitergeben.`);
  } catch (e) {
    toastError('Export fehlgeschlagen', e.message);
  }
}

async function importData() {
  const input = $('fileImport');
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  try {
    const text = await readFileAsText(file);
    const rep = await importAllData(text, { merge: true });
    const parts = [];
    if (rep.settings) parts.push('Einstellungen');
    if (rep.sources) parts.push(`Quellen +${rep.sources.added}`);
    if (rep.rules) parts.push(`Regeln +${rep.rules.added}`);
    if (rep.history) parts.push(`Verlauf +${rep.history.added}`);
    if (rep.processed) parts.push(`erledigt ${rep.processed}`);
    await ctx.reloadAll();
    setStatus(`Import abgeschlossen: ${parts.join(', ')}.`, 'ok');
    toastOk('Daten importiert', parts.join(' · '));
  } catch (e) {
    setStatus(`Import fehlgeschlagen: ${e.message}`, 'err');
    toastError('Import fehlgeschlagen', e.message);
  }
}

// ------------------------------------------------------------ Werkzeuge ----

async function guard(fn, button) {
  button.disabled = true;
  try {
    await fn();
  } catch (e) {
    console.error(e);
    setStatus(e.message || String(e), 'err');
    toastError('Werkzeug', e.message || String(e));
  } finally {
    button.disabled = false;
  }
}

async function findOsdpTab() {
  const tabs = await chrome.tabs.query({ url: ctx.settings.osdpUrlPattern || DEFAULT_SETTINGS.osdpUrlPattern });
  return tabs.find((t) => /newsEditor/i.test(t.url || '')) || tabs[0] || null;
}

async function inspectOsdp() {
  const tab = await findOsdpTab();
  if (!tab) throw new Error('Kein OSDP-Tab gefunden – bitte den News-Editor öffnen.');
  setStatus('Analysiere OSDP-Formular …', 'busy');
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['src/content/osdp-inspector.js'] });
  const [{ result }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => globalThis.__osdpHelper.inspect() });
  if (!result) throw new Error('Analyse fehlgeschlagen (keine Daten).');
  const st = stamp();
  const { html, ...meta } = result;
  await download(`osdp-dump-${st}.json`, JSON.stringify(meta, null, 2), 'application/json');
  await download(`osdp-dump-${st}.html`, html, 'text/html');
  setStatus(`Dump erzeugt: ${meta.counts.controls} Steuerelemente, ${meta.counts.labels} Labels. Zwei Dateien im Download-Ordner.`, 'ok');
  toastOk('DOM-Dump gespeichert', `${meta.counts.controls} Steuerelemente, ${meta.counts.labels} Labels.`);
}

async function exportTags() {
  const driver = new OsdpDriver(ctx.settings, (m) => setStatus(m, 'busy'));
  await driver.ensureTab({ create: false }).catch(() => {
    throw new Error('Kein OSDP-Tab gefunden – bitte den News-Editor öffnen.');
  });
  setStatus('Klappe Tag-Baum auf und lese Tooltips … (kann eine Minute dauern)', 'busy');
  const result = await driver.exec('exportTagTree', {}, { create: false });
  if (!result?.ok) throw new Error(result?.error || 'Export fehlgeschlagen.');
  await download(`osdp-tags-${stamp()}.json`, JSON.stringify({ exportedAt: new Date().toISOString(), count: result.count, tags: result.tags }, null, 2), 'application/json');
  const withTooltip = result.tags.filter((t) => t.tooltip).length;
  setStatus(`${result.count} Tags exportiert (${withTooltip} mit Tooltip, ${result.expansions} Knoten aufgeklappt). Datei im Download-Ordner.`, 'ok');
  toastOk('Tag-Baum exportiert', `${result.count} Tags, ${withTooltip} mit Tooltip.`);
}

export { TEXT_FIELDS, BOOL_FIELDS };
