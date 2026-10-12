import { loadSettings } from '../lib/settings.js';
import { parseDate, checkArticleDate, formatDate, toIsoDate, formatDisplay, lastFriday } from '../lib/dates.js';
import { normalizeAuthor } from '../lib/author.js';
import { translateArticle } from '../lib/translate.js';

const $ = (id) => document.getElementById(id);

let settings = null;
let draft = emptyDraft();

function emptyDraft() {
  return {
    category: 'cyber',
    url: '',
    siteName: '',
    titleEn: '',
    titleDe: '',
    authorRaw: '',
    author: '',
    authorUnknown: true,
    authorHint: '',
    dateText: '',
    dateIso: '',
    dateHint: '',
    textEn: '',
    textDe: '',
    textInfo: '',
    translatedWith: ''
  };
}

// ------------------------------------------------------------------ Init ----

async function init() {
  settings = await loadSettings();
  const stored = await chrome.storage.local.get('draft');
  if (stored.draft) draft = { ...emptyDraft(), ...stored.draft };

  $('earliestDate').textContent = formatDisplay(lastFriday());
  render();
  updateTranslatorInfo();
  updateOsdpTabInfo();

  $('btnOptions').addEventListener('click', () => chrome.runtime.openOptionsPage());
  $('btnExtract').addEventListener('click', () => guard(extractFromActiveTab, $('btnExtract')));
  $('btnReset').addEventListener('click', resetDraft);
  $('btnTranslate').addEventListener('click', () => guard(translate, $('btnTranslate')));
  $('btnFill').addEventListener('click', () => guard(fillOsdp, $('btnFill')));
  $('btnInspect').addEventListener('click', () => guard(inspectOsdp, $('btnInspect')));

  // Manuelle Änderungen in den Entwurf übernehmen.
  bind('url', 'url');
  bind('titleEn', 'titleEn');
  bind('titleDe', 'titleDe');
  bind('textEn', 'textEn');
  bind('textDe', 'textDe');
  bind('author', 'author', () => {
    draft.authorUnknown = !draft.author.trim();
    $('authorUnknown').checked = draft.authorUnknown;
  });
  $('authorUnknown').addEventListener('change', (e) => {
    draft.authorUnknown = e.target.checked;
    saveDraft();
  });
  $('date').addEventListener('change', () => {
    draft.dateText = $('date').value.trim();
    applyDate(parseDate(draft.dateText), 'manuell');
    render();
    saveDraft();
  });
  document.querySelectorAll('input[name="category"]').forEach((r) =>
    r.addEventListener('change', (e) => {
      draft.category = e.target.value;
      saveDraft();
    })
  );

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.settings) {
      settings = { ...settings, ...changes.settings.newValue };
      updateTranslatorInfo();
    }
  });
  chrome.tabs.onUpdated.addListener(() => updateOsdpTabInfo());
  chrome.tabs.onRemoved.addListener(() => updateOsdpTabInfo());
}

function bind(id, key, after) {
  $(id).addEventListener('input', () => {
    draft[key] = $(id).value;
    if (after) after();
    saveDraft();
  });
}

async function guard(fn, button) {
  button.disabled = true;
  try {
    await fn();
  } catch (err) {
    console.error(err);
    setStatus(err.message || String(err), 'err');
  } finally {
    button.disabled = false;
  }
}

function setStatus(msg, kind = '') {
  const el = $('status');
  if (!msg) {
    el.hidden = true;
    return;
  }
  el.hidden = false;
  el.className = `status ${kind}`;
  el.textContent = msg;
}

async function saveDraft() {
  await chrome.storage.local.set({ draft });
}

function render() {
  $('url').value = draft.url;
  $('titleEn').value = draft.titleEn;
  $('titleDe').value = draft.titleDe;
  $('author').value = draft.author;
  $('authorUnknown').checked = draft.authorUnknown;
  $('authorHint').textContent = draft.authorHint;
  $('date').value = draft.dateText;
  $('dateHint').textContent = draft.dateHint;
  $('textEn').value = draft.textEn;
  $('textDe').value = draft.textDe;
  $('textEnInfo').textContent = draft.textInfo;
  document.querySelectorAll('input[name="category"]').forEach((r) => (r.checked = r.value === draft.category));
  renderDateBadge();
}

function renderDateBadge() {
  const badge = $('dateBadge');
  const d = draft.dateIso ? parseDate(draft.dateIso) : null;
  const { status, earliest } = checkArticleDate(d);
  const map = {
    ok: ['ok', 'OK'],
    too_old: ['err', `zu alt (vor ${formatDate(earliest)})`],
    future: ['warn', 'in der Zukunft?'],
    unknown: ['warn', 'Datum unbekannt']
  };
  const [cls, label] = map[status];
  badge.className = `badge ${cls}`;
  badge.textContent = label;
}

function updateTranslatorInfo() {
  const names = { claude: 'Claude API', deepl: 'DeepL', chrome: 'Chrome (integriert)' };
  const name = names[settings.translator] || settings.translator;
  const keyMissing = (settings.translator === 'claude' && !settings.anthropicApiKey) || (settings.translator === 'deepl' && !settings.deeplApiKey);
  $('translatorInfo').textContent = keyMissing ? `${name} – API-Key fehlt (⚙)` : `via ${name}`;
}

async function findOsdpTab() {
  const tabs = await chrome.tabs.query({ url: settings.osdpUrlPattern || 'https://osdp.zentdok.at/*' });
  if (!tabs.length) return null;
  return tabs.find((t) => /newsEditor/i.test(t.url || '')) || tabs[0];
}

async function updateOsdpTabInfo() {
  if (!settings) return;
  const tab = await findOsdpTab().catch(() => null);
  $('osdpTabInfo').textContent = tab ? 'OSDP-Tab gefunden' : 'Kein OSDP-Tab offen';
}

// --------------------------------------------------------------- Extract ----

async function extractFromActiveTab() {
  setStatus('Lese Artikel aus …');
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !/^https?:/i.test(tab.url || '')) {
    throw new Error('Bitte zuerst den Tab mit dem News-Artikel aktivieren (http/https).');
  }
  if (new RegExp(wildcardToRegex(settings.osdpUrlPattern)).test(tab.url)) {
    throw new Error('Der aktive Tab ist die OSDP-Seite – bitte den Tab mit dem Artikel aktivieren.');
  }

  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['src/content/news-extractor.js'] });
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => globalThis.__newsHelper.extract()
  });
  if (!result) throw new Error('Auslesen fehlgeschlagen (keine Daten).');

  const keepCategory = draft.category;
  draft = emptyDraft();
  draft.category = keepCategory;
  draft.url = result.canonicalUrl || result.url || tab.url;
  draft.siteName = result.siteName || '';
  draft.titleEn = result.title || tab.title || '';
  draft.textEn = result.text || '';
  draft.textInfo = result.text
    ? `${result.text.length} Zeichen, Quelle: ${result.textSource}${result.truncated ? ', gekürzt' : ''}`
    : 'kein Text gefunden – bitte manuell einfügen';

  // Autor
  draft.authorRaw = result.authorRaw || '';
  const a = normalizeAuthor(draft.authorRaw, draft.siteName);
  draft.author = a.display;
  draft.authorUnknown = !a.isPerson;
  draft.authorHint = draft.authorRaw
    ? a.isPerson
      ? `erkannt: „${draft.authorRaw}“`
      : `„${draft.authorRaw}“ ist keine Person → Autor ungenannt`
    : 'kein Autor gefunden';

  // Datum: ersten parsebaren Kandidaten nehmen
  let parsed = null;
  let source = '';
  for (const c of result.dateCandidates || []) {
    parsed = parseDate(c);
    if (parsed) {
      source = c;
      break;
    }
  }
  applyDate(parsed, source);

  render();
  await saveDraft();

  const warnings = [];
  if (!draft.textEn || draft.textEn.length < 300) warnings.push('Text sehr kurz oder leer');
  const { status } = checkArticleDate(parsed);
  if (status === 'too_old') warnings.push('Artikel ist ÄLTER als der letzte Freitag');
  if (status === 'unknown') warnings.push('Datum nicht erkannt – bitte eintragen');
  if (result.lang && !/^en/i.test(result.lang)) warnings.push(`Seitensprache ist „${result.lang}“, nicht Englisch`);
  setStatus(warnings.length ? `Ausgelesen – bitte prüfen: ${warnings.join('; ')}` : 'Artikel ausgelesen.', warnings.length ? 'warn' : 'ok');
}

function applyDate(parsed, source) {
  if (parsed) {
    draft.dateIso = toIsoDate(parsed);
    draft.dateText = formatDate(parsed, 'dd.MM.yyyy');
    draft.dateHint = source && source !== 'manuell' ? `aus: ${source.slice(0, 60)}` : '';
  } else {
    draft.dateIso = '';
    draft.dateHint = source === 'manuell' ? 'Datum nicht lesbar (Format TT.MM.JJJJ)' : 'kein Datum gefunden';
  }
}

function wildcardToRegex(pattern) {
  return '^' + (pattern || '').replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
}

// ------------------------------------------------------------- Translate ----

async function translate() {
  if (!draft.titleEn && !draft.textEn) throw new Error('Nichts zu übersetzen – bitte zuerst einen Artikel auslesen.');
  setStatus('Übersetze …');
  const result = await translateArticle(
    { title: draft.titleEn, text: draft.textEn },
    settings,
    (msg) => setStatus(msg)
  );
  draft.titleDe = result.title;
  draft.textDe = result.text;
  draft.translatedWith = result.provider;
  render();
  await saveDraft();
  setStatus(`Übersetzt mit ${result.provider}. Bitte gegenlesen.`, 'ok');
}

// ------------------------------------------------------------------ Fill ----

async function fillOsdp() {
  const tab = await findOsdpTab();
  if (!tab) throw new Error('Kein OSDP-Tab gefunden – bitte https://osdp.zentdok.at/#/newsEditor öffnen.');
  if (!draft.url) throw new Error('Der Entwurf ist leer – zuerst einen Artikel auslesen.');

  const parsed = draft.dateIso ? parseDate(draft.dateIso) : null;
  const { status, earliest } = checkArticleDate(parsed);
  if (status === 'too_old') {
    throw new Error(`Nicht eingetragen: Artikel ist älter als der letzte Freitag (${formatDate(earliest)}).`);
  }
  if (status === 'unknown') throw new Error('Nicht eingetragen: Datum fehlt.');
  if (!draft.textDe) setStatus('Hinweis: Es gibt noch keine Übersetzung – es wird nur der Quelltext eingetragen.', 'warn');

  const selectors = mergedSelectors();
  const title = settings.osdpTitleLanguage === 'en' ? draft.titleEn : draft.titleDe || draft.titleEn;
  const payload = {
    url: draft.url,
    title,
    author: draft.authorUnknown ? '' : draft.author.trim(),
    authorUnknown: draft.authorUnknown || !draft.author.trim(),
    authorUnknownText: settings.authorUnknownText || 'Autor ungenannt',
    date: formatDate(parsed, settings.osdpDateFormat || 'dd.MM.yyyy'),
    dateIso: toIsoDate(parsed),
    sourceText: draft.textEn,
    translatedText: draft.textDe,
    category: draft.category,
    categoryLabel: (globalThis.OSDP_CATEGORY_LABELS || {})[draft.category] || draft.category
  };

  setStatus('Trage in OSDP ein …');
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['src/content/osdp-filler.js'] });
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: (data, sel) => globalThis.__osdpHelper.fill(data, sel),
    args: [payload, selectors]
  });

  const report = $('fillReport');
  report.hidden = false;
  report.textContent = [
    `Ausgefüllt: ${result.filled.join(', ') || '–'}`,
    `Nicht gefunden: ${result.missing.join(', ') || '–'}`,
    ...(result.notes || []).map((n) => `Hinweis: ${n}`),
    '',
    'Gefundene Felder:',
    ...Object.entries(result.fields || {}).map(([k, v]) => `  ${k}: ${v || '(nicht gefunden)'}`)
  ].join('\n');

  await chrome.tabs.update(tab.id, { active: true });
  if (result.missing.length) {
    setStatus(`Teilweise eingetragen – nicht gefunden: ${result.missing.join(', ')}. Bitte Dump erzeugen (Werkzeuge), damit die Selektoren angepasst werden können.`, 'warn');
  } else {
    setStatus('Alle Felder eingetragen – bitte im OSDP-Tab kontrollieren und speichern.', 'ok');
  }
}

function mergedSelectors() {
  const base = JSON.parse(JSON.stringify(globalThis.OSDP_SELECTORS || {}));
  if (settings.osdpSelectorOverrides) {
    try {
      const overrides = JSON.parse(settings.osdpSelectorOverrides);
      for (const [k, v] of Object.entries(overrides)) base[k] = { ...(base[k] || {}), ...v };
    } catch {
      setStatus('Selektor-Overrides in den Einstellungen sind kein gültiges JSON – werden ignoriert.', 'warn');
    }
  }
  return base;
}

// --------------------------------------------------------------- Inspect ----

async function inspectOsdp() {
  const tab = await findOsdpTab();
  if (!tab) throw new Error('Kein OSDP-Tab gefunden – bitte den News-Editor öffnen.');
  setStatus('Analysiere OSDP-Formular …');

  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['src/content/osdp-inspector.js'] });
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => globalThis.__osdpHelper.inspect()
  });
  if (!result) throw new Error('Analyse fehlgeschlagen.');

  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '').replace(/(\d{8})(\d{4})/, '$1-$2');
  const { html, ...meta } = result;
  await download(`osdp-dump-${stamp}.json`, JSON.stringify(meta, null, 2), 'application/json');
  await download(`osdp-dump-${stamp}.html`, html, 'text/html');

  setStatus(`Dump erzeugt: ${meta.counts.controls} Steuerelemente, ${meta.counts.labels} Labels. Zwei Dateien im Download-Ordner.`, 'ok');
}

async function download(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  try {
    await chrome.downloads.download({ url, filename, saveAs: false, conflictAction: 'uniquify' });
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
}

// ----------------------------------------------------------------- Reset ----

async function resetDraft() {
  const keepCategory = draft.category;
  draft = emptyDraft();
  draft.category = keepCategory;
  $('fillReport').hidden = true;
  render();
  await saveDraft();
  setStatus('');
}

init();
