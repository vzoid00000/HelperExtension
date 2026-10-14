// Tests v0.6 für die App-Seite (src/app/app.html + app.js) mit geladener Extension:
//   1) Seite ohne Konsolenfehler, Navigation per Klick und Hash
//   2) Einstellungen: Sparmodus-Preset + Speichern → chrome.storage
//   3) Quellen: Dialog, ungültige URL → Fehlermeldung, Quelle anlegen, Switch, Löschen
//   4) Regeln: Regel anlegen → Tabelle, rulesPromptBlock enthält sie
//   5) Verlauf: zwei Einträge mit gleicher URL → Duplikat-Badge + KPI, Suche filtert
//   6) Lauf: Meldung per URL (lokaler Artikel-Server) mit Mock-LLM gegen die OSDP-Fixture (file://):
//      „Ausgewählte eintragen“ → Freigabe-Card → Überspringen → erneut → „Als gespeichert markieren“ → Verlauf
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { createRequire } from 'node:module';
const { chromium } = (() => { try { return createRequire(import.meta.url)('playwright'); } catch { return createRequire('/opt/node-tools/node_modules/')('playwright'); } })();

const EXT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const FIX = new URL('./fixtures/', import.meta.url).pathname;
const FIXTURE_URL = 'file://' + path.join(FIX, 'osdp-real.html');
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-ext-'));
let failures = 0;
const check = (cond, msg) => { console.log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) failures++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pad = (n) => String(n).padStart(2, '0');

// --- Artikel-Server: liefert die Fixture mit dem heutigen Datum (Datumsregel „ab letztem Freitag“)
const today = new Date();
const todayIso = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
const articleHtml = fs.readFileSync(path.join(FIX, 'article.html'), 'utf8').replace(/2026-10-1[01]/g, todayIso).replace('October 10, 2026', todayIso);
const articleServer = http.createServer((req, res) => {
  if (req.url.startsWith('/2026/10/10/defence-contractor-breach')) {
    res.setHeader('content-type', 'text/html; charset=utf-8');
    return res.end(articleHtml);
  }
  res.statusCode = 404;
  res.end('not found');
});
await new Promise((r) => articleServer.listen(0, '127.0.0.1', r));
const articleUrl = `http://127.0.0.1:${articleServer.address().port}/2026/10/10/defence-contractor-breach`;

// --- Mock eines OpenAI-kompatiblen Servers: Klassifikation (JSON), Übersetzung (Text), Tagging (JSON)
const llmCalls = [];
const TAG_JSON = { structure: 'Cyber', sourceType: 'Nachrichtenseite', locations: ['Deutschland'], topics: ['Cyber > Cyberangriff > Schadsoftware', 'Allgemeine Tags > Akteur > Kriminelle Organisation > Hackergruppe'], ki: false, wb: 'none', wbReason: 'Routinefall.', summary: 'Angreifer drangen über ein manipuliertes Update bei einem Rüstungsunternehmen ein.', notes: '' };
const mock = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    res.setHeader('content-type', 'application/json');
    if (req.url.endsWith('/models')) return res.end(JSON.stringify({ data: [{ id: 'test-model' }] }));
    const parsed = JSON.parse(body || '{}');
    const sys = parsed.messages?.[0]?.content || '';
    const usr = parsed.messages?.[1]?.content || '';
    let kind = 'other';
    let content = 'OK';
    if (/Fachübersetzer/.test(sys)) {
      kind = 'translate';
      const text = usr.split('TEXT:\n')[1] || '';
      const paras = text.split(/\n\s*\n/).filter(Boolean).map((p, i) => `Deutscher Absatz ${i + 1}: ${p.replace(/[a-z]/g, 'e')}`);
      content = `Hacker dringen bei europäischem Rüstungsunternehmen ein.\n\n${paras.join('\n\n')}`;
    } else if (/Tagging-Handbuch/.test(sys)) {
      kind = 'tag';
      content = JSON.stringify(TAG_JSON);
    } else if (/Schlagzeilen/.test(sys)) {
      kind = 'classify';
      const ids = [...usr.matchAll(/^#(\d+)\|/gm)].map((m) => Number(m[1]));
      content = JSON.stringify({ results: ids.map((id) => ({ id, category: 'cyber', score: 8, reason: 'Test' })) });
    }
    llmCalls.push({ kind, system: sys.length, user: usr.length, format: parsed.response_format?.type || '' });
    res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content } }] }));
  });
});
await new Promise((r) => mock.listen(0, '127.0.0.1', r));
const mockUrl = `http://127.0.0.1:${mock.address().port}/v1`;

const context = await chromium.launchPersistentContext(userDataDir, {
  headless: true, channel: 'chromium', viewport: { width: 1400, height: 900 },
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`]
});
let [sw] = context.serviceWorkers();
if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 15000 });
const extId = new URL(sw.url()).host;
check(!!extId, 'Extension geladen: ' + extId);
const APP = `chrome-extension://${extId}/src/app/app.html`;

const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const visible = (sel) => page.locator(sel).isVisible();
const statusText = () => page.locator('#itemsTable tbody tr:first-child td.col-status').textContent();

// 1) Seite ohne Fehler, Navigation per Klick und Hash
{
  await page.goto(APP);
  await page.waitForTimeout(800);
  check(errors.length === 0, `App-Seite ohne Konsolenfehler ${errors.length ? JSON.stringify(errors) : ''}`);
  check(await visible('#view-run') && !(await visible('#view-sources')), 'Start in der Ansicht „Lauf“');
  const version = await page.textContent('#appVersion');
  check(/^v\d/.test(version), 'Version aus dem Manifest: ' + version);
  await page.click('.nav-link[data-view="sources"]');
  check(await visible('#view-sources') && !(await visible('#view-run')) && page.url().endsWith('#quellen'), 'Klick auf „Quellen“ zeigt die Ansicht, Hash #quellen');
  check(await page.locator('.nav-link[data-view="sources"]').evaluate((a) => a.classList.contains('active')), 'Navigations-Link aktiv');
  await page.evaluate(() => { location.hash = '#regeln'; });
  await page.waitForTimeout(100);
  check(await visible('#view-rules') && !(await visible('#view-sources')), 'Hash #regeln zeigt die Ansicht „Regeln“');
  await page.goto(`${APP}#verlauf`);
  await page.waitForTimeout(500);
  check(await visible('#view-history'), 'Direktaufruf mit #verlauf');
  const dialogsInBody = await page.evaluate(() => [...document.body.children].filter((n) => n.matches('dialog.dialog')).length);
  check(dialogsInBody === 4, 'Dialoge aus den Ansichten in <body> verschoben (aus jeder Ansicht öffenbar)');
  const rows = await page.locator('#sourcesManageTable tbody tr').count();
  check(rows >= 20, `Quellen-Verwaltung zeigt die Standardliste (${rows} Zeilen)`);
}

// 2) Einstellungen: Sparmodus + Speichern
{
  await page.goto(`${APP}#einstellungen`);
  await page.waitForTimeout(400);
  await page.click('#btnPresetCheap');
  await page.fill('#anthropicApiKey', 'sk-ant-test');
  await page.fill('#minScore', '7');
  await page.click('#btnSave');
  await page.waitForTimeout(300);
  const saved = await page.evaluate(async () => (await chrome.storage.local.get('settings')).settings);
  check(saved.llmProvider === 'claude' && saved.translator === 'claude' && saved.anthropicModel === 'claude-haiku-5-5' && saved.anthropicApiKey === 'sk-ant-test' && saved.minScore === 7, 'Sparmodus gespeichert: ' + JSON.stringify({ llmProvider: saved.llmProvider, translator: saved.translator, model: saved.anthropicModel, minScore: saved.minScore }));
  check(!('autoSave' in saved) && Array.isArray(saved.sources), 'Gespeicherte Einstellungen ohne autoSave, mit sources-Liste');
  check(/Gespeichert/.test(await page.textContent('#settingsStatus')), 'Statuszeile „Gespeichert.“');
  await page.fill('#osdpUrlPattern', 'osdp.zentdok.at');
  await page.click('#btnSave');
  await page.waitForTimeout(200);
  const notSaved = await page.evaluate(async () => (await chrome.storage.local.get('settings')).settings.osdpUrlPattern);
  check(/URL-Muster/.test(await page.textContent('#settingsStatus')) && notSaved === 'https://osdp.zentdok.at/*', 'Ungültiges URL-Muster wird abgewiesen, Einstellung unverändert');
  await page.fill('#osdpUrlPattern', 'https://osdp.zentdok.at/*');
  // Eigene Modell-ID bleibt in der Auswahl erhalten
  await page.evaluate(async () => { const s = (await chrome.storage.local.get('settings')).settings; await chrome.storage.local.set({ settings: { ...s, anthropicModel: 'claude-custom-9' } }); });
  await page.reload();
  await page.waitForTimeout(500);
  check((await page.inputValue('#anthropicModel')) === 'claude-custom-9', 'Eigene Modell-ID bleibt in der Auswahl erhalten');
}

// 3) Quellen: Dialog, Validierung, anlegen, Switch, löschen
{
  await page.goto(`${APP}#quellen`);
  await page.waitForTimeout(400);
  const before = await page.locator('#sourcesManageTable tbody tr').count();
  await page.click('#btnAddSource');
  check(await page.locator('#sourceDialog').evaluate((d) => d.open), 'Quellen-Dialog geöffnet');
  await page.fill('#srcName', 'Test-Quelle');
  await page.fill('#srcUrl', 'nix');
  await page.click('#btnSourceSave');
  await page.waitForTimeout(200);
  const err = await page.textContent('#sourceTestResult');
  check(await page.locator('#sourceDialog').evaluate((d) => d.open) && /Ungültige URL/.test(err) && (await page.getAttribute('#srcUrl', 'aria-invalid')) === 'true', 'Ungültige URL → Fehlermeldung im Dialog: ' + err.trim());
  await page.fill('#srcUrl', 'https://example.org/feed.xml');
  await page.selectOption('#srcCategory', 'krimisi');
  await page.click('#btnSourceSave');
  await page.waitForTimeout(400);
  const after = await page.locator('#sourcesManageTable tbody tr').count();
  const row = page.locator('#sourcesManageTable tbody tr[data-id="test-quelle"]');
  check(!(await page.locator('#sourceDialog').evaluate((d) => d.open)) && after === before + 1 && (await row.count()) === 1, `Quelle angelegt (${before} → ${after} Zeilen)`);
  check(/KriMiSi/.test(await row.textContent()) && /example\.org/.test(await row.textContent()), 'Zeile zeigt Bereich und URL');
  let stored = await page.evaluate(async () => (await chrome.storage.local.get('settings')).settings.sources);
  check(stored.some((s) => s.id === 'test-quelle' && s.enabled === true && s.category === 'krimisi'), 'Quelle in chrome.storage');
  await row.locator('input.switch').click();
  await page.waitForTimeout(300);
  stored = await page.evaluate(async () => (await chrome.storage.local.get('settings')).settings.sources);
  check(stored.find((s) => s.id === 'test-quelle')?.enabled === false, 'Switch deaktiviert die Quelle');
  // Bearbeiten-Dialog vorbefüllt
  await row.locator('button[data-action="edit"]').click();
  check((await page.inputValue('#srcName')) === 'Test-Quelle' && !(await page.isChecked('#srcEnabled')), 'Bearbeiten-Dialog vorbefüllt (inkl. deaktiviert)');
  await page.click('#btnSourceCancel');
  page.once('dialog', (d) => d.accept());
  await row.locator('button[data-action="delete"]').click();
  await page.waitForTimeout(300);
  check((await row.count()) === 0 && (await page.locator('#sourcesManageTable tbody tr').count()) === before, 'Löschen entfernt die Quelle');
  // Text-Dialog zeigt die Liste
  await page.click('#btnSourcesText');
  const text = await page.inputValue('#sourcesTextArea');
  check(text.split('\n').length === before && /BleepingComputer \| https:/.test(text), 'Text-Dialog listet alle Quellen');
  await page.click('#btnSourcesTextCancel');
}

// 4) Regeln: anlegen, Tabelle, rulesPromptBlock
{
  await page.goto(`${APP}#regeln`);
  await page.waitForTimeout(400);
  await page.click('#btnAddRule');
  check(await page.locator('#ruleDialog').evaluate((d) => d.open), 'Regel-Dialog geöffnet');
  await page.click('#btnRuleSave');
  await page.waitForTimeout(200);
  check(await page.locator('#ruleDialog').evaluate((d) => d.open) && (await page.getAttribute('#ruleText', 'aria-invalid')) === 'true', 'Leere Regel wird abgewiesen');
  await page.fill('#ruleText', 'Bei Angriffen auf Häfen immer „Kritische Infrastruktur“ setzen.');
  await page.fill('#ruleReason', 'Wurde bei der Hafen-Meldung vergessen.');
  await page.fill('#ruleExample', 'Ransomware gang claims attack on port');
  await page.press('#ruleExample', 'Enter'); // Enter im Formular = Speichern (nicht: Dialog ohne Speichern schließen)
  await page.waitForTimeout(300);
  const rows = page.locator('#rulesTable tbody tr');
  check((await rows.count()) === 1 && /Kritische Infrastruktur/.test(await rows.first().textContent()) && /Tagging/.test(await rows.first().textContent()), 'Regel in der Tabelle');
  check((await page.textContent('#navRulesCount')) === '1', 'Navigation zählt aktive Regeln');
  const block = await page.evaluate(async () => {
    const { loadRules, rulesPromptBlock } = await import('../lib/rules.js');
    return rulesPromptBlock(await loadRules(), 'tagging');
  });
  check(/KORREKTURREGELN/.test(block) && block.includes('1. Bei Angriffen auf Häfen immer „Kritische Infrastruktur“ setzen.'), 'rulesPromptBlock enthält die Regel');
  await rows.first().locator('input.switch').click();
  await page.waitForTimeout(300);
  const inactive = await page.evaluate(async () => (await chrome.storage.local.get('rules')).rules[0].active);
  check(inactive === false && (await page.textContent('#navRulesCount')) === '', 'Switch deaktiviert die Regel');
  await rows.first().locator('input.switch').click();
  await page.waitForTimeout(200);
  // Korrektur-Dialog (aus dem Lauf aufgerufen) schlägt eine Regel vor und speichert sie
  await page.evaluate(() => {
    const { ctx } = window.__app;
    ctx.views.rules.openCorrection({ correction: { removed: ['Auftragstags → WB-Cyber'], added: ['Cyber → Cyber Security → Resilienz'], unchanged: [] }, article: { title: 'Ransomware hits Port of LA', summary: 'Hafen lahmgelegt.', url: 'https://news.example/port' } });
  });
  check(await page.locator('#correctionDialog').evaluate((d) => d.open) && /WB-Cyber/.test(await page.textContent('#correctionRemoved')) && /Resilienz/.test(await page.textContent('#correctionAdded')), 'Korrektur-Dialog zeigt entfernte/ergänzte Tags');
  check(/nicht „WB-Cyber“ vergeben, sondern „Cyber > Cyber Security > Resilienz“/.test(await page.inputValue('#correctionRuleText')), 'Regel-Vorschlag aus der Korrektur');
  await page.fill('#correctionReason', 'Kein WB-Fall.');
  await page.click('#btnCorrectionSave');
  await page.waitForTimeout(300);
  const rulesNow = await page.evaluate(async () => (await chrome.storage.local.get('rules')).rules);
  check(rulesNow.length === 2 && rulesNow[1].example?.wrongTags[0] === 'Auftragstags → WB-Cyber' && rulesNow[1].reason === 'Kein WB-Fall.' && (await rows.count()) === 2, 'Korrektur als Regel gespeichert (mit Beispiel)');
}

// 5) Verlauf: Duplikate, KPI, Suche
{
  const now = Date.now();
  await page.evaluate(async (now) => {
    await chrome.storage.local.set({ history: [
      { id: 'h2', at: now - 1000, url: 'https://news.example/port-la?utm_source=rss', title: 'Ransomware hits Port of LA', titleDe: 'Zweite Meldung zum Hafen', structure: 'Cyber', wb: '', tags: ['Struktur → [S]1 Cyber', 'Cyber → Cyberangriff → Schadsoftware → Ransomware'], sourceName: 'The Record', summary: 'Hafen erneut', saved: true },
      { id: 'h1', at: now - 60000, url: 'https://news.example/port-la', title: 'Ransomware hits Port of LA', titleDe: 'Erste Meldung zum Hafen', structure: 'Cyber', wb: 'WB-Cyber', tags: ['Struktur → [S]1 Cyber', 'Cyber → Cyberangriff → Schadsoftware → Ransomware', 'Newsinfo → geographische Lokationen → Kontinente und Staaten → Nordamerika → USA'], sourceName: 'BleepingComputer', summary: 'Hafen lahmgelegt', saved: true },
      { id: 'h0', at: now - 40 * 86400000, url: 'https://world.example/troops', title: 'Troops move to border', structure: 'KriMiSi', wb: 'WB-KriMiSi', tags: [], sourceName: 'BBC World', saved: true }
    ] });
  }, now);
  await page.goto(`${APP}#verlauf`);
  await page.waitForTimeout(500);
  const rows = page.locator('#historyTable tbody tr');
  check((await rows.count()) === 2, `Zeitraum „heute“: ${await rows.count()} Zeilen`);
  const kpi = async (id) => (await page.textContent('#' + id)).trim();
  check((await kpi('statTotal')) === '2' && (await kpi('statCyber')) === '2' && (await kpi('statKrimisi')) === '0' && (await kpi('statWbCyber')) === '1' && (await kpi('statDuplicates')) === '1', 'KPIs heute: 2 Einträge, 2 Cyber, 1 WB-Cyber, 1 Duplikat');
  const dupBadge = page.locator('#historyTable tbody tr[data-id="h2"] .col-hint .badge');
  check((await dupBadge.count()) === 1 && /gleiche URL wie Eintrag vom/.test(await dupBadge.getAttribute('title')) && (await page.locator('#historyTable tbody tr[data-id="h1"] .col-hint .badge').count()) === 0, 'Duplikat-Badge mit Tooltip nur am jüngeren Eintrag: ' + (await dupBadge.getAttribute('title')));
  await page.click('#historyRange [data-range="all"]');
  check((await rows.count()) === 3 && (await kpi('statTotal')) === '3' && (await kpi('statWbKrimisi')) === '1', 'Zeitraum „Alle“: 3 Einträge, WB-KriMiSi 1');
  await page.fill('#historySearch', 'zweite');
  await page.waitForTimeout(100);
  check((await rows.count()) === 1 && /Zweite Meldung/.test(await rows.first().textContent()), 'Suche filtert auf 1 Zeile');
  await page.fill('#historySearch', '');
  // WB umschalten
  await page.locator('#historyTable tbody tr[data-id="h2"] button[data-action="wb"]').click();
  await page.waitForTimeout(200);
  const wb = await page.evaluate(async () => (await chrome.storage.local.get('history')).history.find((e) => e.id === 'h2').wb);
  check(wb === 'WB-Cyber' && (await kpi('statWbCyber')) === '2', 'WB im Verlauf umgeschaltet');
  // „Korrektur melden“ öffnet den Regel-Dialog vorbefüllt
  await page.locator('#historyTable tbody tr[data-id="h1"] button[data-action="correct"]').click();
  check(await page.locator('#ruleDialog').evaluate((d) => d.open) && (await page.inputValue('#ruleExample')) === 'Ransomware hits Port of LA' && (await page.inputValue('#ruleScope')) === 'tagging', 'Korrektur melden: Regel-Dialog mit Beispiel vorbefüllt');
  await page.click('#btnRuleCancel');
  await page.evaluate(() => chrome.storage.local.set({ history: [] }));
}

// 6) Lauf: manuelle URL → Eintragen mit Freigabe gegen die OSDP-Fixture
{
  const osdp = await context.newPage();
  await osdp.goto(FIXTURE_URL);
  await page.evaluate(async (s) => {
    const cur = (await chrome.storage.local.get('settings')).settings || {};
    await chrome.storage.local.set({ settings: { ...cur, ...s }, processed: {} });
    await chrome.storage.local.remove('autoState');
  }, { llmProvider: 'local', localLlmUrl: mockUrl, localLlmModel: 'test-model', translator: 'local', autoTags: true, osdpUrlPattern: 'file:///*', fillEnglishTab: true, useSiteExtract: false, osdpDateFormat: 'dd.MM.yyyy', minScore: 6, lastArea: 'cyber' });
  await page.goto(`${APP}#lauf`);
  await page.waitForTimeout(500);
  await page.bringToFront();
  check(/lokales Modell/.test(await page.textContent('#modelInfo')), 'Modellzeile zeigt lokales Modell');

  await page.fill('#addUrl', articleUrl);
  await page.click('#btnAddUrl');
  await page.waitForSelector('#itemsTable tbody tr');
  const firstRow = page.locator('#itemsTable tbody tr').first();
  check((await firstRow.locator('input.checkbox').isChecked()) && /neu/.test(await statusText()), 'Manuelle Meldung angelegt, ausgewählt, Status „neu“');
  check((await page.locator('#itemsFilter [data-filter="selected"] [data-count]').textContent()) === '1', 'Filter-Zähler „Ausgewählt“ = 1');

  // a) Eintragen → Freigabe-Card → Überspringen
  await page.click('#btnProcess');
  await page.waitForSelector('#reviewCard:not([hidden])', { timeout: 90000 });
  check(/^Hackers breach European defence contractor/.test((await page.textContent('#reviewTitle')).trim()), 'Freigabe-Card mit Artikeltitel: ' + (await page.textContent('#reviewTitle')).trim());
  check(/wartet auf Freigabe/.test(await statusText()) && (await page.isDisabled('#btnProcess')) && !(await page.isDisabled('#btnStop')), 'Status „wartet auf Freigabe“, Knöpfe gesperrt, Stopp aktiv');
  const chips = await page.locator('#reviewTags .chip').allTextContents();
  check(chips.includes('[S]1 Cyber') && chips.includes('News') && chips.includes('Deutschland') && chips.includes('Schadsoftware') && chips.includes('Hackergruppe'), 'Tag-Vorschlag in der Card: ' + chips.join(', '));
  check(/Cyber/.test(await page.textContent('#reviewMeta')) && /Sergiu Example/.test(await page.textContent('#reviewMeta')), 'Badges: Struktur und Autor');
  const bar = osdp.locator('#osdp-helper-bar');
  await bar.waitFor({ timeout: 5000 });
  const form = await osdp.evaluate(() => ({ source: document.querySelector('input[formcontrolname="article_source"]').value, title: document.querySelector('input[formcontrolname="article_title"]').value, de: document.querySelector('input[formcontrolname="article_title_translatedde"]').value, content: document.querySelector('#mat-tab-content-2-0 .ck-editor__editable').textContent.slice(0, 40), deContent: document.querySelector('#mat-tab-content-2-2 .ck-editor__editable').textContent.slice(0, 30), events: window.__events.map((e) => e[0]) }));
  check(form.source === articleUrl && /^Hackers breach/.test(form.title) && /^Hacker dringen/.test(form.de) && /defence contractor/.test(form.content) && /Deutscher Absatz 1/.test(form.deContent), 'OSDP-Formular ausgefüllt (Quelle, Titel EN/DE, Inhalte): ' + JSON.stringify({ title: form.title, de: form.de }));
  check(!form.events.includes('save'), 'Nichts automatisch gespeichert (kein Save-Event in der Fixture)');
  const callsA = llmCalls.map((c) => c.kind).join(',');
  check(callsA === 'translate,tag', 'Modellaufrufe: eine Übersetzung (Titel+Text), ein Tagging: ' + callsA);
  check(llmCalls[1].system <= 40000, `Tagging-System-Prompt kompakt (${llmCalls[1].system} Zeichen)`);
  await page.click('#btnReviewSkip');
  await page.waitForFunction(() => /übersprungen/.test(document.querySelector('#itemsTable tbody tr td.col-status')?.textContent || ''), null, { timeout: 15000 });
  await page.waitForFunction(() => !document.getElementById('btnProcess').disabled, null, { timeout: 15000 });
  check(await page.locator('#reviewCard').evaluate((c) => c.hidden) && (await bar.count()) === 0, 'Nach „Überspringen“: Status übersprungen, Card und Leiste weg');
  const hist0 = await page.evaluate(async () => ((await chrome.storage.local.get('history')).history || []).length);
  check(hist0 === 0, 'Übersprungene Meldung nicht im Verlauf');

  // b) Erneut eintragen → „Als gespeichert markieren“ → Verlauf
  await firstRow.locator('input.checkbox').click();
  llmCalls.length = 0;
  await page.click('#btnProcess');
  await page.waitForSelector('#reviewCard:not([hidden])', { timeout: 90000 });
  check(/^Hackers breach/.test((await page.textContent('#reviewTitle')).trim()), 'Zweiter Durchlauf: Freigabe-Card erneut sichtbar');
  await bar.waitFor({ timeout: 5000 });
  await page.click('#btnReviewMarkSaved');
  await page.waitForFunction(() => /eingetragen/.test(document.querySelector('#itemsTable tbody tr td.col-status')?.textContent || ''), null, { timeout: 15000 });
  await page.waitForFunction(() => !document.getElementById('btnProcess').disabled, null, { timeout: 15000 });
  const hist = await page.evaluate(async () => (await chrome.storage.local.get('history')).history || []);
  check(hist.length === 1 && hist[0].url === articleUrl && hist[0].saved === true && hist[0].structure === 'Cyber' && /^Hacker dringen/.test(hist[0].titleDe) && hist[0].tags.includes('Struktur → [S]1 Cyber') && hist[0].confirmedBy === 'app', 'Verlauf hat 1 Eintrag: ' + JSON.stringify({ title: hist[0]?.title, structure: hist[0]?.structure, tags: hist[0]?.tags?.length }));
  const processed = await page.evaluate(async () => (await chrome.storage.local.get('processed')).processed || {});
  check(Object.values(processed).some((p) => p.status === 'saved'), 'URL als erledigt gemerkt');
  check((await page.locator('#itemsFilter [data-filter="done"] [data-count]').textContent()) === '1' && (await firstRow.locator('input.checkbox').isDisabled()), 'Filter „Eingetragen“ = 1, Zeile gesperrt');
  await page.click('.nav-link[data-view="history"]');
  await page.waitForTimeout(200);
  const histRows = await page.locator('#historyTable tbody tr').count();
  const histCyber = (await page.textContent('#statCyber')).trim();
  check(histRows === 1 && histCyber === '1' && (await visible('#view-history')), `Verlauf-Ansicht zeigt den Eintrag (${histRows} Zeilen, Cyber ${histCyber}, sichtbar ${await visible('#view-history')}, Hash ${page.url().split('#')[1]})`);
  // Zustand überlebt ein Neuladen der Seite
  await page.goto(`${APP}#lauf`);
  await page.waitForTimeout(500);
  check(/eingetragen/.test(await statusText()), 'Meldungsliste nach Neuladen erhalten');
  if (await page.locator('#correctionDialog').evaluate((d) => d.open)) await page.click('#btnCorrectionDismiss');
  await osdp.close();
}

check(errors.length === 0, `Keine Konsolenfehler während der Tests ${errors.length ? JSON.stringify(errors.slice(0, 5)) : ''}`);

await context.close();
mock.close();
articleServer.close();
fs.rmSync(userDataDir, { recursive: true, force: true });
console.log(failures ? `\n${failures} Test(s) fehlgeschlagen` : '\nAlle App-Tests bestanden');
process.exit(failures ? 1 : 0);
