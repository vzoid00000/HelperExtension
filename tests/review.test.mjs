// Test der Freigabe-Schleife (v0.6): fillArticle ohne Save → waitForReview mit dem echten Driver
// (chrome.tabs + chrome.scripting aus einer Extension-Seite) gegen die OSDP-Fixture in einem file://-Tab.
// Szenarien: a) „Überspringen“ in der Leiste, b) Speichern per Save-Button der Fixture (Toast + Formular-Reset),
// c) external() liefert 'abort', d) Duplicate-Toast, e) Formular-Reset ohne Toast, f) Timeout, g) Tab geschlossen.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
const { chromium } = (() => { try { return createRequire(import.meta.url)('playwright'); } catch { return createRequire('/opt/node-tools/node_modules/')('playwright'); } })();

const EXT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const FIX = new URL('./fixtures/', import.meta.url).pathname;
const FIXTURE_URL = 'file://' + path.join(FIX, 'osdp-real.html');
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-ext-'));
let failures = 0;
const check = (cond, msg) => { console.log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) failures++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const context = await chromium.launchPersistentContext(userDataDir, {
  headless: true, channel: 'chromium',
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`]
});
let [sw] = context.serviceWorkers();
if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 15000 });
const extId = new URL(sw.url()).host;
check(!!extId, 'Extension geladen: ' + extId);

// OSDP-Fixture in eigenem Tab. Erweiterungen aus --load-extension haben Dateizugriff, deshalb erreicht
// chrome.scripting den file://-Tab; die Einstellung osdpUrlPattern = file:///* lässt den Driver ihn finden.
const osdp = await context.newPage();
let loads = 0;
osdp.on('load', () => loads++);
await osdp.goto(FIXTURE_URL);

// Host-Seite im Extension-Kontext für den Driver (irgendeine Extension-Ressource genügt; unabhängig von der App-Seite)
const app = await context.newPage();
await app.goto(`chrome-extension://${extId}/src/lib/osdp-driver.js`);
const ready = await app.evaluate(async () => {
  const mod = await import('/src/lib/osdp-driver.js');
  window.__log = [];
  window.__driver = new mod.OsdpDriver(
    { osdpUrlPattern: 'file:///*', fillEnglishTab: true, useSiteExtract: false, osdpDateFormat: 'dd.MM.yyyy', authorUnknownText: 'Autor ungenannt' },
    (m) => window.__log.push(m)
  );
  window.__ext = null;
  window.__article = (n) => ({
    url: `https://news.example.com/story-${n}`, titleEn: `English title ${n}`, textEn: 'Para one\n\nPara two',
    titleDe: `Deutscher Titel ${n}`, textDe: 'Absatz eins\n\nAbsatz zwei', author: 'Jane Doe', authorUnknown: false,
    date: new Date(2026, 9, 10), category: 'cyber'
  });
  window.__fill = (n) => window.__driver.fillArticle(window.__article(n), { save: false });
  window.__review = (o) => window.__driver.waitForReview({ pollMs: 150, timeoutMs: 20000, external: () => window.__ext, ...o });
  return { tabId: await window.__driver.ensureTab({ create: false }), pattern: mod.patternToRegex('file:///*').test('file:///tmp/x.html') && !mod.patternToRegex('https://osdp.zentdok.at/*').test('https://example.com/') };
});
check(typeof ready.tabId === 'number', 'Driver findet den Fixture-Tab über osdpUrlPattern file:///*');
check(ready.pattern, 'patternToRegex: file:///* und https://osdp.zentdok.at/*');
const bar = () => osdp.locator('#osdp-helper-bar'); // Playwright durchdringt offene Shadow Roots
const barText = async () => (await bar().count()) ? bar().evaluate((h) => [...h.shadowRoot.querySelector('.bar').children].map((c) => c.textContent.trim()).filter(Boolean).join(' ')) : '';

// 0) fillArticle ohne Save: Formular gefüllt, report.chips + report.sourceValue, nichts gespeichert
{
  const r = await app.evaluate(() => window.__fill(1));
  check(r.ok && r.steps.native?.ok && r.steps.de?.ok && r.steps.metadata?.ok && r.steps.tag?.ok, 'fillArticle ohne Save: ' + JSON.stringify(r.problems));
  check(Array.isArray(r.chips) && r.chips.includes('Cyber') && r.sourceValue === 'https://news.example.com/story-1' && r.titleValue === 'English title 1', 'report.chips/sourceValue: ' + JSON.stringify({ chips: r.chips, sourceValue: r.sourceValue }));
  check(r.saved === undefined && !r.duplicate, 'Kein Save-Schritt ausgeführt');
  const events = await osdp.evaluate(() => window.__events.map((e) => e[0]));
  check(!events.includes('save'), 'Fixture: kein Save-Event');
  const alive = await app.evaluate(() => window.__driver.tabAlive());
  check(alive === true, 'tabAlive() = true');
}

// Leiste: zweimal showOverlay → eine Leiste, Texte aktualisiert
{
  await app.evaluate(() => window.__driver.exec('showOverlay', { title: 'Erster Titel', index: 1, total: 5, structure: 'Cyber', wb: '' }));
  const first = await barText();
  await app.evaluate(() => window.__driver.exec('showOverlay', { title: 'Zweiter Titel', index: 2, total: 5, structure: 'KriMiSi', wb: 'WB-KriMiSi', hint: 'Hinweis' }));
  const count = await bar().count();
  const second = await barText();
  check(count === 1 && /1\/5 · Erster Titel Cyber/.test(first) && /2\/5 · Zweiter Titel KriMiSi WB-KriMiSi Hinweis/.test(second), `showOverlay idempotent: "${second}"`);
  const ro = await app.evaluate(() => window.__driver.exec('readOverlay'));
  check(ro.action === null && ro.visible === true, 'readOverlay ohne Klick: action null');
  const hostStyle = await bar().evaluate((h) => { const cs = getComputedStyle(h); return { pos: cs.position, bottom: cs.bottom, z: cs.zIndex, pe: cs.pointerEvents }; });
  check(hostStyle.pos === 'fixed' && hostStyle.bottom === '0px' && Number(hostStyle.z) > 1e9 && hostStyle.pe === 'none', 'Leiste fix unten, pointer-events nur auf der Leiste: ' + JSON.stringify(hostStyle));
  await app.evaluate(() => window.__driver.exec('hideOverlay'));
  check((await bar().count()) === 0, 'hideOverlay entfernt die Leiste');
}

// a) „Überspringen“ in der Leiste → outcome skip; Chips = vor dem Klick gesetzte Tags
{
  const pending = app.evaluate(() => window.__review({ index: 3, total: 12, title: 'English title 1', structure: 'Cyber', wb: 'WB-Cyber' }));
  await bar().waitFor({ timeout: 5000 });
  const txt = await barText();
  check(/OSDP News Helper · 3\/12 · English title 1 Cyber WB-Cyber/.test(txt), `Leiste zeigt Zähler, Titel, Badges: "${txt}"`);
  await sleep(400);
  await osdp.locator('#osdp-helper-bar button.skip').click();
  const r = await pending;
  check(r.outcome === 'skip' && r.reason === 'overlay' && r.chips.includes('Cyber') && r.tookMs < 5000, 'a) Überspringen → ' + JSON.stringify({ outcome: r.outcome, chips: r.chips, tookMs: r.tookMs }));
  check((await bar().count()) === 0, 'a) Leiste nach dem Ende entfernt');
  // Nach skip stehen Inhalte im Formular → freshEditor lädt neu
  const before = loads;
  const p = await app.evaluate(() => window.__driver.freshEditor());
  check(loads === before + 1 && p?.hasEditor && !p.sourceValue && !p.titleValue && !(p.chips || []).length, `a) freshEditor nach skip lädt neu (${loads - before} Reload) und liefert leeres Formular`);
}

// b) Speichern über den Save-Button der Fixture (Toast „Item Added!“ + Formular-Reset) → saved + Chips von vorher
{
  const fill = await app.evaluate(() => window.__fill(2));
  check(fill.ok && fill.chips.includes('Cyber'), 'b) Formular erneut gefüllt');
  const pending = app.evaluate(() => window.__review({ index: 4, total: 12, title: 'English title 2', structure: 'Cyber', wb: '' }));
  await bar().waitFor({ timeout: 5000 });
  await sleep(500);
  await osdp.locator('#btnSave').click(); // so wie der Nutzer in OSDP
  const r = await pending;
  check(r.outcome === 'saved' && r.chips.includes('Cyber') && r.toasts.some((t) => t.message === 'Item Added!'), 'b) Save-Klick → ' + JSON.stringify({ outcome: r.outcome, reason: r.reason, chips: r.chips, toasts: r.toasts.map((t) => t.message) }));
  const state = await osdp.evaluate(() => ({ events: window.__events.map((e) => e[0]), source: document.querySelector('input[formcontrolname="article_source"]').value, chips: document.querySelectorAll('mat-chip').length, bar: !!document.getElementById('osdp-helper-bar') }));
  check(state.events.includes('save') && state.source === '' && state.chips === 0 && !state.bar, 'b) Fixture hat gespeichert und das Formular geleert, Leiste weg: ' + JSON.stringify(state));
  // Nach saved ist das Formular leer → freshEditor lädt NICHT neu
  const before = loads;
  const p = await app.evaluate(() => window.__driver.freshEditor());
  check(loads === before && p?.hasEditor, 'b) freshEditor nach saved ohne Reload');
}

// c) external() liefert 'abort' (App-Button) → outcome abort. Der Erfolgstoast der vorigen Meldung ist
//    noch sichtbar (OSDP zeigt Toasts 10 s) und darf nicht als neuer Erfolg zählen.
{
  const stale = await osdp.evaluate(() => document.querySelectorAll('#toast-container .toast-success').length);
  check(stale === 1, 'c) Alter Erfolgstoast noch sichtbar');
  const fill = await app.evaluate(() => window.__fill(3));
  check(fill.ok && !fill.duplicate, 'c) fillArticle ignoriert alte Toasts');
  const pending = app.evaluate(() => window.__review({ index: 5, total: 12, title: 'English title 3' }));
  await bar().waitFor({ timeout: 5000 });
  await sleep(600);
  await app.evaluate(() => { window.__ext = 'abort'; });
  const r = await pending;
  await app.evaluate(() => { window.__ext = null; });
  check(r.outcome === 'abort' && r.reason === 'app' && r.chips.includes('Cyber') && r.toasts.length === 0, 'c) external → abort, alter Toast ignoriert: ' + JSON.stringify({ outcome: r.outcome, reason: r.reason, toasts: r.toasts }));
  check((await bar().count()) === 0, 'c) Leiste entfernt');
}

// d) Duplicate-Toast (OSDP: HTTP 409 → „Duplicate, URL already in the database!“) → duplicate
{
  await app.evaluate(() => window.__fill(4));
  const pending = app.evaluate(() => window.__review({ index: 6, total: 12, title: 'English title 4' }));
  await bar().waitFor({ timeout: 5000 });
  await osdp.evaluate(() => window.__showToast('error', 'Error', 'Duplicate, URL already in the database!'));
  const r = await pending;
  check(r.outcome === 'duplicate' && r.toasts.some((t) => t.kind === 'error' && /Duplicate/.test(t.message)), 'd) Duplicate-Toast → duplicate: ' + JSON.stringify({ outcome: r.outcome, toasts: r.toasts }));
  await osdp.evaluate(() => document.querySelectorAll('#toast-container .ngx-toastr').forEach((t) => t.remove()));
}

// e) Formular-Reset ohne Toast (Toast schon verschwunden) → saved über formReset; Fehlertoast allein reicht nicht
{
  await app.evaluate(() => window.__fill(5));
  const pending = app.evaluate(() => window.__review({ index: 7, total: 12, title: 'English title 5' }));
  await bar().waitFor({ timeout: 5000 });
  // Fehlertoast (z. B. Validierung) → Lauf geht weiter
  await osdp.evaluate(() => window.__showToast('error', 'Error', 'Set tags before saving', 600));
  await sleep(900);
  const stillWaiting = await app.evaluate(() => window.__driver.formDirty);
  await osdp.evaluate(() => window.__resetForm());
  const r = await pending;
  check(stillWaiting === true && r.outcome === 'saved' && r.reason === 'formReset' && r.chips.includes('Cyber') && r.toasts.some((t) => t.message === 'Set tags before saving'), 'e) Formular-Reset ohne Erfolgstoast → saved (Fehlertoast davor ignoriert): ' + JSON.stringify({ outcome: r.outcome, reason: r.reason, chips: r.chips }));
}

// f) Timeout
{
  await app.evaluate(() => window.__fill(6));
  const r = await app.evaluate(() => window.__review({ index: 8, total: 12, title: 'English title 6', timeoutMs: 700 }));
  check(r.outcome === 'timeout' && r.tookMs >= 700 && (await bar().count()) === 0, 'f) Timeout → timeout, Leiste entfernt');
}

// g) Tab während der Freigabe geschlossen → lost (es wird kein neuer Tab geöffnet)
{
  const pending = app.evaluate(() => window.__review({ index: 9, total: 12, title: 'English title 6' }));
  await bar().waitFor({ timeout: 5000 });
  const pagesBefore = context.pages().length;
  await osdp.close();
  const r = await pending;
  await sleep(300);
  check(r.outcome === 'lost' && r.reason === 'tab', 'g) Tab geschlossen → lost: ' + JSON.stringify({ outcome: r.outcome, reason: r.reason }));
  check(context.pages().length === pagesBefore - 1, 'g) Kein neuer OSDP-Tab geöffnet');
  check((await app.evaluate(() => window.__driver.tabAlive())) === false, 'g) tabAlive() = false');
}

await context.close();
fs.rmSync(userDataDir, { recursive: true, force: true });
console.log(failures ? `\n${failures} Test(s) fehlgeschlagen` : '\nAlle Tests bestanden');
process.exit(failures ? 1 : 0);
