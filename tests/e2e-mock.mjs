// End-to-End gegen den OSDP-Nachbau (echte Angular-App aus dem HAR) mit geladener Extension:
// Driver.precheckDuplicate (Quelle + Titel, Duplikat-Toast abwarten) → fillArticle({ editorPrepared: true })
// ohne Save → Freigabe-Leiste → „Save“ wird im OSDP-Tab geklickt (wie der Nutzer) → waitForReview liefert
// 'saved' per Nachricht des Beobachters → POST /api/news prüfen → Formular leer. Zum Schluss wird der
// Nachbau mit overrides.json neu gestartet (checkURLDuplicates → 409) und precheckDuplicate meldet duplicate.
// Läuft standalone: baut mock-osdp/ bei Bedarf aus site-dump/osdp.redacted.har und startet den
// Nachbau-Server selbst (Port aus mock-osdp/api.json, sonst MOCK_PORT bzw. 4300).
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
const { chromium } = (() => { try { return createRequire(import.meta.url)('playwright'); } catch { return createRequire('/opt/node-tools/node_modules/')('playwright'); } })();

const EXT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const MOCK_DIR = path.join(EXT, 'mock-osdp');
const HAR = path.join(EXT, 'site-dump/osdp.redacted.har');
let failures = 0;
const check = (cond, msg) => { console.log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) failures++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 1) Nachbau sicherstellen (der Port steckt als mockOrigin in den umgeschriebenen Bundles)
let port = Number(process.env.MOCK_PORT) || 4300;
const apiJson = path.join(MOCK_DIR, 'api.json');
if (fs.existsSync(apiJson)) {
  const m = /:(\d+)/.exec(JSON.parse(fs.readFileSync(apiJson, 'utf8')).mockOrigin || '');
  if (m) port = Number(m[1]);
} else {
  if (!fs.existsSync(HAR)) {
    console.error(`FAIL Weder ${path.relative(EXT, MOCK_DIR)}/ noch ${path.relative(EXT, HAR)} vorhanden – siehe site-dump/README.md`);
    process.exit(1);
  }
  console.log('Baue Nachbau aus ' + path.relative(EXT, HAR) + ' …');
  execFileSync('node', [path.join(EXT, 'tools/har-to-mock.mjs'), HAR, '--out', MOCK_DIR, '--mock-origin', `http://localhost:${port}`], { stdio: 'ignore' });
}
const BASE = `http://localhost:${port}`;

// 2) Server starten – oder einen bereits laufenden Nachbau auf diesem Port weiterverwenden
const serverUp = async () => { try { return (await fetch(`${BASE}/__mock/log`)).ok; } catch { return false; } };
let srv = null;
let srvOut = '';
const startServer = async () => {
  srv = spawn('node', [path.join(EXT, 'tools/mock-osdp-server.mjs'), '--dir', MOCK_DIR, '--port', String(port)], { stdio: ['ignore', 'pipe', 'pipe'] });
  srv.stdout.on('data', (d) => (srvOut += d));
  srv.stderr.on('data', (d) => (srvOut += d));
  for (let i = 0; i < 50 && !(await serverUp()); i++) await sleep(100);
};
const stopServer = async () => {
  if (!srv) return;
  srv.kill();
  for (let i = 0; i < 50 && (await serverUp()); i++) await sleep(100);
  srv = null;
};
// overrides.json wird nur beim Start des Nachbaus gelesen – eine vorhandene Datei bleibt erhalten
const overridesFile = path.join(MOCK_DIR, 'overrides.json');
const overridesBefore = fs.existsSync(overridesFile) ? fs.readFileSync(overridesFile, 'utf8') : null;
const restoreOverrides = () => { if (overridesBefore === null) fs.rmSync(overridesFile, { force: true }); else fs.writeFileSync(overridesFile, overridesBefore); };
let ownServer = false;
if (!(await serverUp())) {
  await startServer();
  ownServer = true;
}
check(await serverUp(), `Nachbau-Server erreichbar: ${BASE}`);
if (!(await serverUp())) { console.log(srvOut); srv?.kill(); process.exit(1); }
const logStart = (await fetch(`${BASE}/__mock/log`).then((r) => r.json())).length;
const mockLog = async () => (await fetch(`${BASE}/__mock/log`).then((r) => r.json())).slice(logStart);

const catalog = JSON.parse(fs.readFileSync(`${EXT}/src/config/osdp-tags.json`, 'utf8'));
const uidByPath = new Map();
const walk = (n, p) => { const q = [...p, n.name]; uidByPath.set(q.join(' → '), n.uid); n.children.forEach((c) => walk(c, q)); };
catalog.tree.forEach((n) => walk(n, []));
const paths = [
  'Struktur → [S]1 Cyber',
  'Newsinfo → Dokumententyp → News',
  'Newsinfo → Quellentyp → Nachrichtenseite',
  'Newsinfo → geographische Lokationen → Kontinente und Staaten → Europa → Deutschland',
  'Cyber → Cyberangriff',
  'Cyber → Cyberangriff → Schadsoftware → Ransomware',
  'Allgemeine Tags → Akteur → Kriminelle Organisation → Hackergruppe',
  'Auftragstags → WB-Cyber'
];
const uids = paths.map((p) => uidByPath.get(p));
check(uids.every((u) => typeof u === 'number'), 'UIDs aus Katalog: ' + uids.join(','));

// 3) Extension laden, OSDP-Nachbau in eigenem Tab, Driver in einer Extension-Seite
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-ext-'));
const context = await chromium.launchPersistentContext(userDataDir, {
  headless: true, channel: 'chromium', viewport: { width: 1500, height: 1000 },
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`]
});
let [sw] = context.serviceWorkers();
if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 15000 });
const extId = new URL(sw.url()).host;

const osdp = await context.newPage();
const pageErrors = [];
let loads = 0;
osdp.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 200)));
osdp.on('load', () => loads++);
await osdp.goto(`${BASE}/#/news`, { waitUntil: 'domcontentloaded' });
await osdp.waitForTimeout(2000);

const app = await context.newPage();
await app.goto(`chrome-extension://${extId}/src/lib/osdp-driver.js`);
await app.evaluate(async (base) => {
  const mod = await import('/src/lib/osdp-driver.js');
  window.__log = [];
  window.__driver = new mod.OsdpDriver(
    { osdpUrlPattern: `${base}/*`, fillEnglishTab: true, useSiteExtract: false, osdpDateFormat: 'dd/MM/yyyy', authorUnknownText: 'Autor ungenannt' },
    (m) => window.__log.push(m)
  );
}, BASE);

// 4) Vorab-Duplikatprüfung wie in der App (vor Übersetzung und Tagging): leerer Editor, Quelle + Titel,
//    das Verlassen des Quellfelds löst POST /api/news/checkURLDuplicates aus; der Nachbau antwortet 200 → kein Duplikat
const article = {
  url: 'https://news.example.com/2026/10/10/defence-contractor-breach',
  titleEn: 'Hackers breach European defence contractor',
  textEn: 'First paragraph of the English source.\n\nSecond paragraph.',
  titleDe: 'Hacker dringen bei europäischem Rüstungsunternehmen ein',
  textDe: 'Erster Absatz.\n\nZweiter Absatz.',
  author: 'Sergiu Example', authorUnknown: false, category: 'cyber', tagPaths: paths, tagUids: uids
};
const pre = await app.evaluate((a) => window.__driver.precheckDuplicate({ url: a.url, title: a.titleEn }), article);
check(pre.ok && pre.duplicate === false && pre.prepared === true && pre.sourceValue === article.url && pre.titleValue === article.titleEn, 'precheckDuplicate ohne Treffer → prepared: ' + JSON.stringify({ ok: pre.ok, duplicate: pre.duplicate, prepared: pre.prepared, sourceValue: pre.sourceValue, error: pre.error }));
const dupChecks = (await mockLog()).filter((l) => l.method === 'POST' && l.path === '/api/news/checkURLDuplicates');
check(dupChecks.length >= 1 && dupChecks.some((l) => (l.body || '').includes(article.url)), `OSDP hat checkURLDuplicates für die Quelle aufgerufen (${dupChecks.length}×)`);
const stateAfterPre = await app.evaluate(() => window.__driver.formState());
check(stateAfterPre.hasContent && stateAfterPre.ours === true && stateAfterPre.sourceValue === article.url, 'formState nach precheck: Inhalt von uns: ' + JSON.stringify(stateAfterPre));

// 5) Artikel im vorbereiteten Editor komplett eintragen (ohne Save, ohne Reload): Felder, CKEditor in drei Reitern, Metadata, Tags über Angular
const loadsBefore = loads;
const report = await app.evaluate(async (a) => {
  const r = await window.__driver.fillArticle({ ...a, date: new Date(Date.UTC(2026, 9, 10, 12)) }, { save: false, editorPrepared: true });
  return { ...r, steps: Object.fromEntries(Object.entries(r.steps).map(([k, v]) => [k, { ...v, structure: undefined }])) };
}, article);
check(report.ok && report.problems.length === 0, 'fillArticle(editorPrepared) ohne Save: ' + JSON.stringify(report.problems) + ' | Log: ' + JSON.stringify(await app.evaluate(() => window.__log)));
check(loads === loadsBefore, `Editor wurde dabei nicht neu geladen (${loads - loadsBefore} Reload)`);
check(report.steps.native?.ok && report.steps.native.sourceValue === article.url, 'Native: ' + JSON.stringify(report.steps.native));
check(report.steps.nativeContent?.ok && report.steps.enContent?.ok && report.steps.deContent?.ok, 'CKEditor in Native/English/German gesetzt');
check(report.steps.en?.ok && report.steps.de?.ok, 'Übersetzte Titel gesetzt');
check(report.steps.metadata?.ok && report.steps.metadata.author === 'text' && report.steps.metadata.date && !report.steps.metadata.dateInvalid, 'Metadata: ' + JSON.stringify(report.steps.metadata));
check(report.steps.tags?.ok && report.steps.tags.method === 'ng' && report.steps.tags.applied.length === 8, 'Tags über Angular (ng): ' + JSON.stringify({ method: report.steps.tags?.method, failed: report.steps.tags?.failed }));
check(['[S]1 Cyber', 'News', 'Nachrichtenseite', 'Deutschland', 'Cyberangriff', 'Ransomware', 'Hackergruppe', 'WB-Cyber'].every((n) => report.chips.includes(n)) && report.sourceValue === article.url, 'report.chips + report.sourceValue: ' + report.chips.join(', '));
check(report.saved === undefined && !report.duplicate, 'Nicht gespeichert (kein Save-Schritt)');
const wbChildChecked = await osdp.evaluate(() => [...document.querySelectorAll('mat-tree-node')].filter((n) => /\[WB-C\]/.test(n.textContent)).map((n) => n.querySelector('input')?.checked));
check(wbChildChecked.every((c) => !c), 'WB-Cyber-Untertags nicht ausgewählt (' + wbChildChecked.length + ' sichtbar)');

// 6) Zusätzlicher Tag per DOM-Klick (Fallback gegen den echten Baum) – wie eine Nachkorrektur
const domRes = await app.evaluate(() => window.__driver.applyTags({ paths: ['KriMiSi → Militär → Cyberstreitkräfte'] }));
check(domRes.ok && domRes.method === 'dom' && domRes.chips.includes('Cyberstreitkräfte'), 'applyTags per DOM ' + JSON.stringify({ method: domRes.method, applied: domRes.applied, failed: domRes.failed }));
await app.evaluate(() => window.__driver.exec('selectTab', { group: 'native', tab: '^\\s*native\\s*$' }));
const noPost = (await mockLog()).some((l) => l.method === 'POST' && l.path === '/api/news');
check(!noPost, 'Bis hierher kein POST /api/news (nichts automatisch gespeichert)');

// 7) Freigabe: Leiste sichtbar, dann „Save“ im OSDP-Tab klicken wie der Nutzer → waitForReview = saved.
//    pollMs 5000: das Ergebnis muss über die Nachricht des Beobachters kommen, nicht über das Polling.
//    Der OSDP-Tab kommt wie in der App in den Vordergrund (Chrome drosselt Timer in Hintergrund-Tabs).
await app.evaluate(() => window.__driver.focusTab());
const pending = app.evaluate(() => window.__driver.waitForReview({ index: 1, total: 1, title: 'Hackers breach European defence contractor', structure: 'Cyber', wb: 'WB-Cyber', pollMs: 5000, timeoutMs: 30000 }));
const bar = osdp.locator('#osdp-helper-bar');
await bar.waitFor({ timeout: 5000 });
const barText = await bar.evaluate((h) => [...h.shadowRoot.querySelector('.bar').children].map((c) => c.textContent.trim()).filter(Boolean).join(' '));
check(/OSDP News Helper · 1\/1 · Hackers breach European defence contractor Cyber WB-Cyber/.test(barText), 'Freigabe-Leiste im OSDP-Tab: "' + barText + '"');
await osdp.waitForTimeout(800);
const clickedAt = Date.now();
await osdp.getByRole('button', { name: /^\s*save\s*$/i }).first().click();
const review = await pending;
const sinceClick = Date.now() - clickedAt;
check(review.outcome === 'saved' && review.via === 'message' && sinceClick < 4000, `waitForReview nach Save-Klick (${sinceClick} ms nach dem Klick): ` + JSON.stringify({ outcome: review.outcome, reason: review.reason, via: review.via, tookMs: review.tookMs, toasts: review.toasts.map((t) => t.message) }));
check(review.chips.includes('Cyberstreitkräfte') && review.chips.includes('[S]1 Cyber') && review.chips.includes('WB-Cyber'), 'Chips vor dem Reset erfasst (inkl. Nachkorrektur): ' + review.chips.join(', '));
check(review.toasts.some((t) => t.message === 'Item Added!'), 'Toast „Item Added!“ gesehen');
check((await bar.count()) === 0, 'Leiste nach der Freigabe entfernt');

// 8) POST /api/news im Mock prüfen
const log = await mockLog();
const post = log.filter((l) => l.method === 'POST' && l.path === '/api/news').pop();
check(!!post, 'POST /api/news aufgezeichnet');
if (post) {
  const body = JSON.parse(post.body);
  console.log('   Titel/Autor/Datum/Lang:', body.article_title, '|', body.article_author, '|', body.article_created_at, '|', body.article_language, '| platforms', JSON.stringify(body.article_platforms));
  console.log('   Tags:', JSON.stringify(body.article_tags), '| content:', (body.article_content || '').slice(0, 60), '| de:', (body.article_content_translatedde || '').slice(0, 40), '| en-title:', body.article_title_translateden);
  check(body.article_title === article.titleEn && body.article_author === article.author, 'Payload Titel + Autor');
  check(/^2026-10-(09|10)T/.test(body.article_created_at || ''), 'Payload Datum ISO: ' + body.article_created_at);
  check(Array.isArray(body.article_tags) && uids.every((u) => body.article_tags.includes(u)) && body.article_tags.length === 9, 'Payload Tags = 9 UIDs');
  check((body.article_content || '').includes('First paragraph') && (body.article_content_translatedde || '').includes('Erster Absatz') && (body.article_content_translateden || '').includes('First paragraph'), 'Payload Inhalte in allen drei Reitern');
  check(body.article_title_translatedde === article.titleDe, 'Payload deutscher Titel');
  check(body.article_source === article.url, 'Payload Quelle');
}

// 9) Nach dem Speichern: Formular leer, freshEditor braucht keinen Reload
const after = await app.evaluate(async () => ({ probe: await window.__driver.probe(), dirty: window.__driver.formDirty }));
check(after.probe && !after.probe.sourceValue && !after.probe.titleValue && !(after.probe.chips || []).length && after.dirty === false, 'Formular nach Save geleert (sourceValue="' + after.probe?.sourceValue + '", chips=' + (after.probe?.chips || []).length + ')');

// 10) Duplikat: Nachbau mit overrides.json neu starten – POST /api/news/checkURLDuplicates antwortet 409 wie OSDP
//     bei einer bekannten URL (Frontend: catchError → duplicateURLError → Toast „Duplicate, URL already in the database!“).
//     Die Angular-App bleibt dabei geladen; nur die API-Antworten kommen vom neuen Server.
if (ownServer) {
  try {
    await stopServer();
    fs.writeFileSync(overridesFile, JSON.stringify({ 'POST /api/news/checkURLDuplicates': { status: 409, body: { error: 'Duplicate' } } }, null, 1));
    await startServer();
    check(await serverUp(), 'Nachbau mit Duplicate-Override neu gestartet');
    const dupBefore = loads;
    const dup = await app.evaluate(() => window.__driver.precheckDuplicate({ url: 'https://news.example.com/2026/10/11/already-in-osdp', title: 'Already in OSDP' }));
    check(dup.ok && dup.duplicate === true && dup.prepared === false && dup.toasts.some((t) => t.kind === 'error' && /Duplicate, URL already/i.test(t.message)), 'precheckDuplicate bei 409 → duplicate, nicht prepared: ' + JSON.stringify({ duplicate: dup.duplicate, prepared: dup.prepared, toasts: dup.toasts.map((t) => t.message) }));
    check(loads === dupBefore && (await app.evaluate(() => window.__driver.formDirty)) === true, 'Leerer Editor nach dem Save ohne Reload genutzt, danach formDirty (nächste Meldung lädt neu)');
    const dupLog = (await fetch(`${BASE}/__mock/log`).then((r) => r.json())).filter((l) => l.method === 'POST' && l.path === '/api/news/checkURLDuplicates');
    check(dupLog.length >= 1 && dupLog.every((l) => l.what === 'override'), `Override hat geantwortet (${dupLog.length}× checkURLDuplicates)`);
  } finally {
    restoreOverrides();
  }
} else {
  console.log('SKIP Duplicate-Override: der Nachbau-Server lief schon vor dem Test (overrides.json wird nur beim Start gelesen)');
}
console.log('Seitenfehler:', pageErrors.slice(0, 5));
await osdp.screenshot({ path: path.join(os.tmpdir(), 'osdp-test.png') }).catch(() => {});

await context.close();
fs.rmSync(userDataDir, { recursive: true, force: true });
if (srv) srv.kill();
if (failures) console.log(srvOut.split('\n').slice(-30).join('\n'));
console.log(failures ? `\n${failures} Test(s) fehlgeschlagen` : '\nE2E gegen Nachbau bestanden');
process.exit(failures ? 1 : 0);
