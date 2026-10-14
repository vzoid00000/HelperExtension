// Design-Test v0.6: lädt src/app/app.html (file://, ohne app.js), prüft alle IDs des
// Seitengerüsts, Konsolenfehler, Überläufe und erzeugt Screenshots jeder Ansicht
// in 1400×900 und 1000×800 (Beispielzeilen werden nur im Test injiziert).
//
// Ausgabeordner: $DESIGN_SHOTS oder der Scratchpad-Ordner dieser Sitzung,
// sonst <tmp>/osdp-design.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
const { chromium } = (() => { try { return createRequire(import.meta.url)('playwright'); } catch { return createRequire('/opt/node-tools/node_modules/')('playwright'); } })();

const EXT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const PAGE = 'file://' + path.join(EXT, 'src/app/app.html');
const SCRATCH = '/tmp/claude-0/-home-user-HelperExtension/a9b76282-8f23-58d8-9ed2-4a8161ea2b43/scratchpad/design';
const OUT = process.env.DESIGN_SHOTS || (fs.existsSync(path.dirname(SCRATCH)) ? SCRATCH : path.join(os.tmpdir(), 'osdp-design'));
fs.mkdirSync(OUT, { recursive: true });

let failures = 0;
const check = (cond, msg) => { console.log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) failures++; };

// Alle IDs, an die sich app.js später hält (Aufgabenstellung Modul A1)
const IDS = {
  run: ['view-run', 'earliestDate', 'modelInfo', 'areaSelect', 'btnRunAll', 'btnScan', 'btnClassify', 'btnProcess', 'btnStop', 'addUrl', 'btnAddUrl', 'status', 'progressBar',
    'reviewCard', 'reviewTitle', 'reviewMeta', 'reviewTags', 'reviewWarnings', 'btnReviewFocus', 'btnReviewSkip', 'btnReviewMarkSaved', 'btnReviewAbort',
    'itemsFilter', 'itemsSummary', 'btnSelectRelevant', 'btnClearSelection', 'btnForget', 'itemsTable', 'itemsEmpty', 'sourcesTable', 'sourcesSummary', 'log', 'btnClearLog'],
  sources: ['view-sources', 'btnAddSource', 'btnResetSources', 'btnSourcesText', 'sourcesManageTable', 'sourceDialog', 'srcName', 'srcUrl', 'srcCategory', 'srcType', 'srcPattern', 'srcEnabled',
    'btnSourceTest', 'btnSourceSave', 'btnSourceCancel', 'sourceTestResult', 'sourcesTextDialog', 'sourcesTextArea', 'btnSourcesTextApply', 'btnSourcesTextCancel'],
  history: ['view-history', 'statTotal', 'statCyber', 'statKrimisi', 'statWbCyber', 'statWbKrimisi', 'statDuplicates', 'historyRange', 'historySearch', 'btnHistoryMd', 'btnHistoryCsv', 'btnHistoryClear', 'historyTable', 'historyEmpty'],
  rules: ['view-rules', 'btnAddRule', 'rulesTable', 'rulesEmpty', 'ruleDialog', 'ruleScope', 'ruleText', 'ruleReason', 'ruleExample', 'btnRuleDistill', 'btnRuleSave', 'btnRuleCancel',
    'correctionDialog', 'correctionTitle', 'correctionRemoved', 'correctionAdded', 'correctionReason', 'correctionRuleText', 'btnCorrectionSave', 'btnCorrectionDismiss'],
  settings: ['view-settings', 'llmProvider', 'btnPresetCheap', 'btnPresetBridge', 'anthropicApiKey', 'anthropicModel', 'localLlmUrl', 'localLlmModel', 'localLlmApiKey', 'localLlmTimeoutSec', 'btnTestLocal',
    'translator', 'deeplApiKey', 'btnTest', 'minScore', 'maxItemsPerRun', 'autoTags', 'autoRunTime', 'osdpDateFormat', 'authorUnknownText', 'fillEnglishTab', 'useSiteExtract', 'osdpUrlPattern', 'btnSave',
    'btnExportData', 'btnImportData', 'fileImport', 'btnInspector', 'btnExportTags', 'settingsStatus'],
  common: ['toasts']
};

// Beispieldaten (nur im Test): werden per page.evaluate in die Tabellen geschrieben
const SAMPLE = {
  items: [
    { area: 'cyber', score: 9, wb: 'auto', date: '13.10.2026', source: 'BleepingComputer', title: 'Ransomware gang claims attack on European port operator, 2 TB of data stolen', status: 'waiting', selected: true },
    { area: 'cyber', score: 8, wb: 'auto', date: '13.10.2026', source: 'The Record', title: 'Chinese state hackers exploited zero-day in widely used VPN appliances, agencies warn', status: 'relevant', selected: true },
    { area: 'krimisi', score: 8, wb: 'yes', date: '12.10.2026', source: 'Defense News', title: 'NATO allies agree to expand air-defence umbrella over Baltic states after drone incursions', status: 'relevant', selected: true },
    { area: 'cyber', score: 7, wb: 'no', date: '12.10.2026', source: 'SecurityWeek', title: 'Microsoft patches 112 vulnerabilities in October Patch Tuesday', status: 'saved', selected: false },
    { area: 'krimisi', score: 6, wb: 'auto', date: '11.10.2026', source: 'Al Jazeera', title: 'Sudan: RSF offensive on El Fasher displaces tens of thousands, UN says', status: 'known', selected: false },
    { area: 'none', score: 2, wb: 'auto', date: '11.10.2026', source: 'BBC World', title: 'Football: Late goal seals dramatic win in World Cup qualifier', status: 'irrelevant', selected: false },
    { area: 'cyber', score: 7, wb: 'auto', date: '10.10.2026', source: 'Krebs on Security', title: 'Patch now: critical flaw in popular firewall under active exploitation', status: 'error', selected: false, error: 'Artikeltext nicht lesbar (Paywall)' }
  ],
  sources: [
    { name: 'BleepingComputer', type: 'RSS', state: '4 neu · 12 zu alt · 3 bekannt', ok: true },
    { name: 'The Record (Recorded Future)', type: 'RSS', state: '2 neu · 8 zu alt · 1 bekannt', ok: true },
    { name: 'Defense News', type: 'RSS', state: '3 neu · 20 zu alt · 0 bekannt', ok: true },
    { name: 'Reuters – World', type: 'Seite', state: 'Fehler: HTTP 403', ok: false },
    { name: 'BBC World', type: 'RSS', state: 'lädt …', ok: null }
  ],
  log: [
    '[08:02:11] Scanne 25 Quellen (Artikel ab 09.10.2026) …',
    '[08:02:19] Scan fertig: 9 neue Meldungen.',
    '[08:02:20] Relevanzprüfung 1/9 …',
    '[08:02:41] Relevanzprüfung fertig: 4 von 9 Meldungen relevant (Schwelle 6).',
    '[08:02:42] (1/3) Ransomware gang claims attack on European port operator',
    '[08:02:48] Übersetze …',
    '[08:03:05] Vergebe Tags nach Handbuch …',
    '[08:03:19] Struktur: Cyber · Orte: Niederlande, Deutschland · Themen: Ransomware, Kritische Infrastruktur · WB: WB-Cyber',
    '[08:03:20] ⚠ Tag-Hinweis: „Rotterdam“ ist kein Katalog-Ort, verworfen',
    '[08:03:24] Trage in OSDP ein …',
    '[08:03:31] Ausgefüllt – wartet auf Freigabe im OSDP-Tab.'
  ],
  manageSources: [
    { on: true, name: 'BleepingComputer', url: 'https://www.bleepingcomputer.com/feed/', cat: 'cyber', type: 'rss', pattern: '', scan: 'heute 08:02' },
    { on: true, name: 'The Record (Recorded Future)', url: 'https://therecord.media/feed', cat: 'cyber', type: 'rss', pattern: '', scan: 'heute 08:02' },
    { on: true, name: 'Defense News', url: 'https://www.defensenews.com/arc/outboundfeeds/rss/?outputType=xml', cat: 'krimisi', type: 'rss', pattern: '', scan: 'heute 08:02' },
    { on: false, name: 'Reuters – World', url: 'https://www.reuters.com/world/', cat: 'krimisi', type: 'html', pattern: 'reuters\\.com/world/.+-\\d{4}-\\d{2}-\\d{2}', scan: 'gestern 08:03' },
    { on: true, name: 'AP News – World', url: 'https://apnews.com/world-news', cat: 'both', type: 'html', pattern: 'apnews\\.com/article/', scan: '–' }
  ],
  history: [
    { time: '13.10. 08:05', structure: 'Cyber', wb: 'WB-Cyber', title: 'Ransomware-Gruppe meldet Angriff auf europäischen Hafenbetreiber', source: 'BleepingComputer', summary: 'Die Gruppe behauptet, 2 TB Daten gestohlen zu haben; Betrieb in Rotterdam läuft eingeschränkt weiter.', tags: ['Ransomware', 'Kritische Infrastruktur', 'Niederlande'], hint: '' },
    { time: '13.10. 08:21', structure: 'Cyber', wb: '', title: 'Microsoft schließt 112 Schwachstellen am Oktober-Patchday', source: 'SecurityWeek', summary: 'Darunter drei aktiv ausgenutzte Zero-Days in Windows und Office.', tags: ['Schwachstelle', 'Microsoft', 'USA'], hint: '' },
    { time: '12.10. 09:40', structure: 'KriMiSi', wb: 'WB-KriMiSi', title: 'NATO weitet Luftverteidigung über dem Baltikum aus', source: 'Defense News', summary: 'Nach Drohnenvorfällen verlegen Verbündete zusätzliche Systeme nach Litauen und Estland.', tags: ['NATO', 'Luftverteidigung', 'Litauen', 'Estland'], hint: '' },
    { time: '12.10. 10:02', structure: 'KriMiSi', wb: '', title: 'NATO weitet Luftverteidigung über dem Baltikum aus', source: 'Politico Europe', summary: 'Gleiche Meldung aus zweiter Quelle.', tags: ['NATO', 'Litauen'], hint: 'duplicate' }
  ],
  rules: [
    { on: true, scope: 'tagging', text: 'Bei Angriffen auf Häfen, Flughäfen oder Energieversorger immer „Kritische Infrastruktur“ setzen, auch wenn der Artikel das Wort nicht verwendet.', reason: 'Wurde bei der Hafen-Meldung vergessen.', example: 'Ransomware gang claims attack on European port operator', created: '13.10.2026' },
    { on: true, scope: 'relevance', text: 'Reine Sportmeldungen und Unterhaltung sind nie relevant, auch wenn Staaten genannt werden.', reason: '', example: 'Football: Late goal seals dramatic win', created: '11.10.2026' },
    { on: false, scope: 'translation', text: 'Behördennamen (CISA, NCSC, BSI) nicht übersetzen, nur beim ersten Vorkommen in Klammern erklären.', reason: 'OSDP-Leser kennen die Abkürzungen.', example: '', created: '10.10.2026' }
  ]
};

// Hilfsfunktion im Seitenkontext: Beispieldaten rendern (wird per toString übertragen)
const inject = (sample) => {
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const areaBadge = (a) => a === 'cyber' ? el('span', 'badge badge-cyber', 'Cyber') : a === 'krimisi' ? el('span', 'badge badge-krimisi', 'KriMiSi') : el('span', 'badge badge-muted', '–');
  const STATUS = { waiting: 'wartet auf Freigabe', relevant: 'relevant', saved: 'eingetragen', known: 'bereits eingetragen', irrelevant: 'nicht relevant', error: 'Fehler', new: 'neu' };

  document.getElementById('earliestDate').textContent = '09.10.2026';
  document.getElementById('modelInfo').textContent = 'Modell: Claude-Code-Brücke (opus) · Übersetzung: lokales Modell';
  document.getElementById('appStatus').textContent = 'Wartet auf Freigabe';
  document.getElementById('appStatusDot').className = 'status-dot status-dot-busy';
  document.getElementById('navRunCount').textContent = '3';
  document.getElementById('navRulesCount').textContent = '2';

  // Lauf
  const st = document.getElementById('status');
  st.hidden = false; st.className = 'status status-busy'; st.textContent = 'Meldung 1 von 3: Formular ausgefüllt – warte auf Save im OSDP-Tab.';
  document.getElementById('progressBar').style.width = '33%';
  const rc = document.getElementById('reviewCard'); rc.hidden = false;
  document.getElementById('reviewTitle').textContent = 'Ransomware gang claims attack on European port operator, 2 TB of data stolen';
  const meta = document.getElementById('reviewMeta');
  for (const [cls, t] of [['badge-cyber', 'Cyber'], ['badge-wb', 'WB-Cyber'], ['badge-outline', '13.10.2026'], ['badge-outline', 'BleepingComputer'], ['badge-outline', 'Autor: Lawrence Abrams']]) meta.append(el('span', 'badge ' + cls, t));
  const tags = document.getElementById('reviewTags');
  for (const t of ['[S]1 Cyber', 'News', 'Nachrichtenseite', 'Niederlande', 'Deutschland', 'Ransomware', 'Kritische Infrastruktur', 'Hackergruppe', 'WB-Cyber']) { const c = el('span', 'chip'); c.append(el('span', '', t)); c.title = 'Pfad → ' + t; tags.append(c); }
  document.getElementById('reviewWarnings').append(el('li', '', '„Rotterdam“ ist kein Katalog-Ort – verworfen'), el('li', '', 'Übersetzung: 14 Absätze EN, 13 Absätze DE – bitte prüfen'));
  document.getElementById('itemsSummary').textContent = '9 Meldungen · 4 relevant · 3 ausgewählt · 1 eingetragen';
  const counts = { relevant: 5, all: 9, selected: 3, done: 1, error: 1 };
  for (const b of document.querySelectorAll('#itemsFilter .tab')) b.querySelector('[data-count]').textContent = counts[b.dataset.filter];
  const tb = document.querySelector('#itemsTable tbody');
  for (const it of sample.items) {
    const tr = el('tr', 'clickable' + (it.selected ? ' selected' : ''));
    const td0 = el('td', 'col-check'); const cb = el('input', 'checkbox'); cb.type = 'checkbox'; cb.checked = it.selected; cb.disabled = it.status === 'saved'; td0.append(cb);
    const td1 = el('td', 'col-area'); td1.append(areaBadge(it.area));
    const td2 = el('td', 'col-score num', String(it.score));
    const td3 = el('td', 'col-wb');
    if (it.status === 'saved') td3.append(el('span', 'badge badge-wb badge-sm', 'WB')); else { const s = el('select', 'select select-xs wb-select'); for (const [v, l] of [['auto', 'auto'], ['yes', 'ja'], ['no', 'nein']]) { const o = el('option', '', l); o.value = v; s.append(o); } s.value = it.wb; td3.append(s); }
    const td4 = el('td', 'col-date', it.date);
    const td5 = el('td', 'col-source', it.source); td5.title = it.source;
    const td6 = el('td', 'title-cell'); const a = el('a', '', it.title); a.href = '#'; a.title = it.title; td6.append(a);
    const td7 = el('td', 'col-status st-' + it.status, STATUS[it.status]); if (it.error) td7.title = it.error;
    tr.append(td0, td1, td2, td3, td4, td5, td6, td7); tb.append(tr);
  }
  document.getElementById('itemsEmpty').hidden = true;
  document.getElementById('sourcesSummary').textContent = 'Letzter Scan 13.10.2026 08:02 · 23/25 ok';
  const sb = document.querySelector('#sourcesTable tbody');
  for (const s of sample.sources) { const tr = el('tr'); const t3 = el('td', s.ok === false ? 'st-error' : s.ok === null ? 'st-processing' : '', s.state); tr.append(el('td', 'clip', s.name), el('td', 'col-type muted', s.type), t3); sb.append(tr); }
  document.getElementById('log').textContent = sample.log.join('\n');

  // Quellen
  const mb = document.querySelector('#sourcesManageTable tbody');
  for (const s of sample.manageSources) {
    const tr = el('tr'); const t0 = el('td', 'col-switch'); const sw = el('input', 'switch'); sw.type = 'checkbox'; sw.checked = s.on; t0.append(sw);
    const t2 = el('td', 'col-url clip mono', s.url); t2.title = s.url;
    const t3 = el('td'); t3.append(s.cat === 'cyber' ? el('span', 'badge badge-cyber', 'Cyber') : s.cat === 'krimisi' ? el('span', 'badge badge-krimisi', 'KriMiSi') : el('span', 'badge badge-secondary', 'Beide'));
    const t5 = el('td', 'col-pattern clip mono muted', s.pattern || '–');
    const t7 = el('td', 'actions');
    for (const [act, lbl, ic] of [['test', 'Testen', 'i-scan'], ['edit', 'Bearbeiten', 'i-pencil'], ['delete', 'Löschen', 'i-trash']]) { const b = el('button', 'btn btn-ghost btn-xs btn-icon' + (act === 'delete' ? ' btn-destructive' : '')); b.type = 'button'; b.dataset.action = act; b.title = lbl; b.innerHTML = '<svg class="icon"><use href="#' + ic + '"/></svg>'; t7.append(b); }
    tr.append(t0, el('td', 'col-name strong', s.name), t2, t3, el('td', 'muted', s.type === 'html' ? 'Seite' : 'RSS'), t5, el('td', 'col-scan muted', s.scan), t7); mb.append(tr);
  }

  // Verlauf
  for (const [id, v] of [['statTotal', 128], ['statCyber', 71], ['statKrimisi', 57], ['statWbCyber', 9], ['statWbKrimisi', 6], ['statDuplicates', 2]]) document.getElementById(id).textContent = v;
  const hb = document.querySelector('#historyTable tbody');
  for (const h of sample.history) {
    const tr = el('tr');
    const t1 = el('td'); t1.append(el('span', 'badge ' + (h.structure === 'Cyber' ? 'badge-cyber' : 'badge-krimisi'), h.structure));
    const t2 = el('td'); if (h.wb) t2.append(el('span', 'badge badge-wb', h.wb)); else t2.append(el('span', 'muted', '–'));
    const t3 = el('td', 'title-cell'); const a = el('a', '', h.title); a.href = '#'; t3.append(a);
    const t5 = el('td', 'col-summary'); t5.append(el('div', 'clip-2 muted', h.summary));
    const t6 = el('td', 'col-tags'); const ch = el('div', 'chips'); for (const t of h.tags) { const c = el('span', 'chip chip-sm'); c.append(el('span', '', t)); ch.append(c); } t6.append(ch);
    const t7 = el('td', 'col-hint'); if (h.hint === 'duplicate') t7.append(el('span', 'badge badge-warning', 'Duplikat'));
    const t8 = el('td', 'actions');
    for (const [act, lbl, ic] of [['correct', 'Korrigieren', 'i-pencil'], ['delete', 'Löschen', 'i-trash']]) { const b = el('button', 'btn btn-ghost btn-xs btn-icon' + (act === 'delete' ? ' btn-destructive' : '')); b.type = 'button'; b.dataset.action = act; b.title = lbl; b.innerHTML = '<svg class="icon"><use href="#' + ic + '"/></svg>'; t8.append(b); }
    const t4 = el('td', 'col-source', h.source); t4.title = h.source;
    tr.append(el('td', 'col-time muted', h.time), t1, t2, t3, t4, t5, t6, t7, t8); hb.append(tr);
  }
  document.getElementById('historyEmpty').hidden = true;

  // Regeln
  const rb = document.querySelector('#rulesTable tbody');
  const SCOPE = { tagging: 'Tagging', relevance: 'Relevanz', translation: 'Übersetzung' };
  for (const r of sample.rules) {
    const tr = el('tr'); const t0 = el('td', 'col-switch'); const sw = el('input', 'switch'); sw.type = 'checkbox'; sw.checked = r.on; t0.append(sw);
    const t1 = el('td'); const bd = el('span', 'badge badge-outline scope-' + r.scope); bd.append(el('span', 'dot'), document.createTextNode(SCOPE[r.scope])); t1.append(bd);
    const t2 = el('td', 'col-rule', r.text);
    const t3 = el('td', 'col-reason muted', r.reason || '–');
    const t4 = el('td', 'col-example'); t4.append(el('div', 'clip muted', r.example || '–'));
    const t6 = el('td', 'actions');
    for (const [act, lbl, ic] of [['edit', 'Bearbeiten', 'i-pencil'], ['delete', 'Löschen', 'i-trash']]) { const b = el('button', 'btn btn-ghost btn-xs btn-icon' + (act === 'delete' ? ' btn-destructive' : '')); b.type = 'button'; b.dataset.action = act; b.title = lbl; b.innerHTML = '<svg class="icon"><use href="#' + ic + '"/></svg>'; t6.append(b); }
    tr.append(t0, t1, t2, t3, t4, el('td', 'col-created muted', r.created), t6); rb.append(tr);
  }
  document.getElementById('rulesEmpty').hidden = true;

  // Einstellungen
  document.getElementById('localLlmUrl').value = 'http://localhost:4310/v1';
  document.getElementById('localLlmModel').value = 'opus';
  document.getElementById('localLlmTimeoutSec').value = '600';
  document.getElementById('minScore').value = '6';
  document.getElementById('maxItemsPerRun').value = '25';
  document.getElementById('autoRunTime').value = '08:00';
  document.getElementById('osdpDateFormat').value = 'dd/MM/yyyy';
  document.getElementById('authorUnknownText').value = 'Autor ungenannt';
  document.getElementById('osdpUrlPattern').value = 'https://osdp.zentdok.at/*';
  document.getElementById('autoTags').checked = true;
  document.getElementById('fillEnglishTab').checked = true;
  document.getElementById('llmProvider').value = 'local';
  document.getElementById('translator').value = 'local';
  const ss = document.getElementById('settingsStatus'); ss.className = 'status status-ok'; ss.textContent = 'Gespeichert.';

  // Korrektur-Dialog
  document.getElementById('correctionTitle').textContent = 'Ransomware gang claims attack on European port operator';
  for (const t of ['Hackergruppe']) { const c = el('span', 'chip chip-removed'); c.append(el('span', '', t)); document.getElementById('correctionRemoved').append(c); }
  for (const t of ['Kritische Infrastruktur', 'Belgien']) { const c = el('span', 'chip chip-added'); c.append(el('span', '', t)); document.getElementById('correctionAdded').append(c); }
  document.getElementById('correctionReason').value = 'Der Hafen Antwerpen liegt in Belgien, nicht in den Niederlanden.';
  document.getElementById('correctionRuleText').value = 'Bei Hafen-Meldungen das Land des genannten Hafens als Ort setzen (Antwerpen → Belgien).';
  document.getElementById('sourceTestResult').hidden = false; document.getElementById('sourceTestResult').className = 'status status-ok'; document.getElementById('sourceTestResult').textContent = 'OK: 25 Meldungen gefunden, neueste vom 13.10.2026.';
  document.getElementById('srcName').value = 'BleepingComputer'; document.getElementById('srcUrl').value = 'https://www.bleepingcomputer.com/feed/';

  // Toast-Beispiel
  const toast = el('div', 'toast toast-success'); toast.append(el('div', 'toast-title', 'Gespeichert'), el('div', 'toast-desc', 'OSDP hat die Meldung übernommen – weiter mit 2 von 3.'));
  const close = el('button', 'btn btn-ghost btn-xs btn-icon toast-close'); close.type = 'button'; close.innerHTML = '<svg class="icon"><use href="#i-x"/></svg>'; toast.append(close);
  document.getElementById('toasts').append(toast);
};

const browser = await chromium.launch({ headless: true, channel: 'chromium' });
const context = await browser.newContext({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1, colorScheme: 'dark', locale: 'de-AT' });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => {
  if (m.type() !== 'error') return;
  const where = m.location()?.url || '';
  // app.js existiert in diesem Modul noch nicht – das darf der einzige Fehler sein
  if (/app\.js$/.test(where) || /app\.js/.test(m.text())) return;
  errors.push(`${m.text()} (${where})`);
});
await page.goto(PAGE);
await page.waitForTimeout(400);

// 1) Grundgerüst, CSS geladen, keine Inline-Skripte
check(errors.length === 0, `Seite ohne Konsolenfehler ${errors.length ? JSON.stringify(errors) : ''}`);
const base = await page.evaluate(() => ({
  bg: getComputedStyle(document.body).backgroundColor,
  font: getComputedStyle(document.body).fontFamily,
  inlineScripts: document.querySelectorAll('script:not([src])').length,
  inlineHandlers: [...document.querySelectorAll('*')].filter((n) => [...n.attributes].some((a) => /^on/i.test(a.name))).length,
  views: [...document.querySelectorAll('section.view')].map((v) => ({ id: v.id, hidden: v.hidden })),
  navViews: [...document.querySelectorAll('.nav-link[data-view]')].map((a) => a.dataset.view),
  scripts: [...document.querySelectorAll('script[src]')].map((s) => s.getAttribute('src')),
  dialogs: [...document.querySelectorAll('dialog.dialog')].map((d) => d.id),
  extractor: typeof globalThis.__newsHelper
}));
check(base.bg === 'rgb(9, 9, 11)', `Dark-Theme aktiv (body ${base.bg})`);
check(/Inter/.test(base.font) && /system-ui/.test(base.font), `Schrift: ${base.font}`);
check(base.inlineScripts === 0 && base.inlineHandlers === 0, 'Keine Inline-Skripte / Inline-Handler (CSP)');
check(base.views.map((v) => v.id).join(',') === 'view-run,view-sources,view-history,view-rules,view-settings', 'Fünf Ansichten in richtiger Reihenfolge: ' + base.views.map((v) => v.id).join(','));
check(base.views.filter((v) => !v.hidden).length === 1 && !base.views[0].hidden, 'Nur „Lauf“ sichtbar');
check(base.navViews.join(',') === 'run,sources,history,rules,settings', 'Navigation data-view: ' + base.navViews.join(','));
check(base.scripts.join(',') === '../content/news-extractor.js,app.js', 'Skripte: news-extractor vor app.js');
check(base.extractor === 'object', 'news-extractor.js geladen (globalThis.__newsHelper)');
check(base.dialogs.length === 4 && ['sourceDialog', 'sourcesTextDialog', 'ruleDialog', 'correctionDialog'].every((d) => base.dialogs.includes(d)), 'Vier Dialoge: ' + base.dialogs.join(','));

// 2) Alle IDs vorhanden und eindeutig
for (const [group, ids] of Object.entries(IDS)) {
  const r = await page.evaluate((ids) => ids.filter((id) => document.querySelectorAll('#' + CSS.escape(id)).length !== 1), ids);
  check(r.length === 0, `IDs ${group}: ${ids.length} vorhanden${r.length ? ' – fehlend/doppelt: ' + r.join(', ') : ''}`);
}
const details = await page.evaluate(() => ({
  area: [...document.querySelectorAll('#areaSelect [data-area]')].map((b) => b.dataset.area),
  filter: [...document.querySelectorAll('#itemsFilter [data-filter]')].map((b) => b.dataset.filter),
  counts: document.querySelectorAll('#itemsFilter [data-filter] [data-count]').length,
  range: [...document.querySelectorAll('#historyRange [data-range]')].map((b) => b.dataset.range),
  itemsHead: [...document.querySelectorAll('#itemsTable thead th')].map((t) => t.textContent.trim()),
  historyHead: [...document.querySelectorAll('#historyTable thead th')].map((t) => t.textContent.trim()),
  rulesHead: [...document.querySelectorAll('#rulesTable thead th')].map((t) => t.textContent.trim()),
  sourcesHead: [...document.querySelectorAll('#sourcesManageTable thead th')].map((t) => t.textContent.trim()),
  stopDisabled: document.getElementById('btnStop').disabled,
  reviewHidden: document.getElementById('reviewCard').hidden,
  statusVariants: (() => {
    // Varianten müssen sich sichtbar vom Grundzustand unterscheiden (Rahmenfarbe)
    const probe = document.createElement('div');
    document.body.append(probe);
    const colorOf = (cls) => { probe.className = cls; probe.textContent = 'x'; return getComputedStyle(probe).borderColor; };
    const base = colorOf('status');
    const ok = ['status status-ok', 'status status-warn', 'status status-err'].map(colorOf);
    probe.remove();
    return ok.every((c) => c && c !== base) && new Set(ok).size === 3;
  })(),
  models: [...document.querySelectorAll('#anthropicModel option')].map((o) => o.value),
  scopes: [...document.querySelectorAll('#ruleScope option')].map((o) => o.value),
  srcCats: [...document.querySelectorAll('#srcCategory option')].map((o) => o.value),
  srcTypes: [...document.querySelectorAll('#srcType option')].map((o) => o.value),
  fileHidden: document.getElementById('fileImport').hidden && document.getElementById('fileImport').type === 'file',
  switches: ['srcEnabled', 'autoTags', 'fillEnglishTab', 'useSiteExtract'].every((id) => document.getElementById(id).type === 'checkbox' && document.getElementById(id).classList.contains('switch')),
  noOld: !document.getElementById('sourcesText') && !document.getElementById('autoSave')
}));
check(details.area.join(',') === 'cyber,krimisi,both', 'Bereichswahl cyber/krimisi/both');
check(details.filter.join(',') === 'relevant,all,selected,done,error' && details.counts === 5, 'Filter-Tabs mit Zähler-Platzhaltern');
check(details.range.join(',') === 'today,week,month,all', 'Verlauf-Zeiträume today/week/month/all');
check(details.itemsHead.slice(1).join('|') === 'Bereich|Score|WB|Datum|Quelle|Titel|Status', 'Meldungs-Tabelle Spalten: ' + details.itemsHead.join('|'));
check(details.historyHead.join('|') === 'Zeit|Struktur|WB|Titel|Quelle|Zusammenfassung|Tags|Hinweis|Aktionen', 'Verlauf-Tabelle Spalten');
check(details.rulesHead.join('|') === 'Aktiv|Bereich|Regel|Begründung|Beispiel|Erstellt|Aktionen', 'Regel-Tabelle Spalten');
check(details.sourcesHead.join('|') === 'Aktiv|Name|URL|Bereich|Typ|Muster|Letzter Scan|Aktionen', 'Quellen-Tabelle Spalten');
check(details.stopDisabled && details.reviewHidden, 'Stopp deaktiviert, Freigabe-Card versteckt');
check(details.statusVariants, 'Status-Varianten status-ok/-warn/-err definiert');
check(details.models.join(',') === 'claude-haiku-5-5,claude-sonnet-5-5,claude-opus-5-5', 'Modellauswahl haiku/sonnet/opus');
check(details.scopes.join(',') === 'tagging,relevance,translation' && details.srcCats.join(',') === 'cyber,krimisi,both' && details.srcTypes.join(',') === 'rss,html', 'Select-Optionen Regeln/Quellen');
check(details.fileHidden && details.switches && details.noOld, 'Datei-Import versteckt, Switches sind Checkboxen, kein sourcesText/autoSave');

// 3) Beispieldaten injizieren, Ansichten durchschalten, Screenshots, Überlauf prüfen
await page.evaluate(inject, SAMPLE);
const rows = await page.evaluate(() => ['itemsTable', 'sourcesTable', 'sourcesManageTable', 'historyTable', 'rulesTable'].map((id) => document.querySelectorAll('#' + id + ' tbody tr').length));
check(rows.join(',') === '7,5,5,4,3', 'Beispielzeilen injiziert: ' + rows.join(','));
const views = ['run', 'sources', 'history', 'rules', 'settings'];
// Standard 1400×900 und 1000×800; weitere Größen per DESIGN_SIZES="1100x800,1280x800"
const sizes = [[1400, 900], [1000, 800], ...(process.env.DESIGN_SIZES || '').split(',').filter(Boolean).map((s) => s.split('x').map(Number))];
for (const [w, h] of sizes) {
  await page.setViewportSize({ width: w, height: h });
  for (const v of views) {
    await page.evaluate((v) => {
      for (const s of document.querySelectorAll('section.view')) s.hidden = s.id !== 'view-' + v;
      for (const a of document.querySelectorAll('.nav-link')) a.classList.toggle('active', a.dataset.view === v);
      window.scrollTo(0, 0);
    }, v);
    await page.waitForTimeout(80);
    const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth, sh: document.documentElement.scrollHeight }));
    check(m.sw <= m.iw, `${v} @${w}: kein horizontaler Überlauf (${m.sw}/${m.iw}, Höhe ${m.sh})`);
    // Viewport auf Seitenhöhe setzen, damit die sticky Sidebar im Bild vollständig ist
    await page.setViewportSize({ width: w, height: Math.max(h, Math.min(m.sh, 4000)) });
    await page.waitForTimeout(50);
    await page.screenshot({ path: path.join(OUT, `${v}-${w}.png`) });
    await page.setViewportSize({ width: w, height: h });
  }
}

// 4) Dialoge (1400): Quelle bearbeiten, Korrektur, Regel
await page.setViewportSize({ width: 1400, height: 900 });
for (const [view, dlg] of [['sources', 'sourceDialog'], ['rules', 'correctionDialog'], ['rules', 'ruleDialog']]) {
  await page.evaluate(([view, dlg]) => {
    for (const s of document.querySelectorAll('section.view')) s.hidden = s.id !== 'view-' + view;
    for (const d of document.querySelectorAll('dialog[open]')) d.close();
    document.getElementById(dlg).showModal();
  }, [view, dlg]);
  await page.waitForTimeout(200);
  const open = await page.evaluate((dlg) => document.getElementById(dlg).open, dlg);
  check(open, `Dialog ${dlg} geöffnet`);
  await page.screenshot({ path: path.join(OUT, `dialog-${dlg}-1400.png`) });
  await page.evaluate((dlg) => document.getElementById(dlg).close(), dlg);
}

check(errors.length === 0, `Nach Interaktion weiterhin keine Konsolenfehler ${errors.length ? JSON.stringify(errors) : ''}`);
console.log(`Screenshots: ${OUT}`);

await browser.close();
console.log(failures ? `\n${failures} Test(s) fehlgeschlagen` : '\nAlle Design-Tests bestanden');
process.exit(failures ? 1 : 0);
