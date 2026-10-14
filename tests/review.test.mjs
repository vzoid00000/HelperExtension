// Test der Freigabe-Schleife (v0.6): fillArticle ohne Save → waitForReview mit dem echten Driver
// (chrome.tabs + chrome.scripting aus einer Extension-Seite) gegen die OSDP-Fixture in einem file://-Tab.
// Szenarien: a) „Überspringen“ in der Leiste, b) Speichern per Save-Button der Fixture (Toast + Formular-Reset),
// c) external() liefert 'abort', d) Duplicate-Toast, e) Nachricht des Beobachters (pollMs 5000),
// f) Formular-Reset nach Save-Klick ohne Erfolgstoast, g) Formular-Reset OHNE Save-Klick (kein saved),
// h) precheckDuplicate / formState / fillArticle(editorPrepared), i) Timeout, j) ensureTab prüft die Tab-URL,
// k) Tab geschlossen, l) Leiste entfernt sich selbst, wenn die App-Seite weg ist.
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
let osdp = await context.newPage();
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
  window.__fill = (n, opts) => window.__driver.fillArticle(window.__article(n), { save: false, ...(opts || {}) });
  window.__review = (o) => window.__driver.waitForReview({ pollMs: 150, timeoutMs: 20000, external: () => window.__ext, ...o });
  return { tabId: await window.__driver.ensureTab({ create: false }), pattern: mod.patternToRegex('file:///*').test('file:///tmp/x.html') && !mod.patternToRegex('https://osdp.zentdok.at/*').test('https://example.com/') };
});
check(typeof ready.tabId === 'number', 'Driver findet den Fixture-Tab über osdpUrlPattern file:///*');
check(ready.pattern, 'patternToRegex: file:///* und https://osdp.zentdok.at/*');
const bar = () => osdp.locator('#osdp-helper-bar'); // Playwright durchdringt offene Shadow Roots
const barText = async () => (await bar().count()) ? bar().evaluate((h) => [...h.shadowRoot.querySelector('.bar').children].map((c) => c.textContent.trim()).filter(Boolean).join(' ')) : '';
const barStyle = () => bar().evaluate((h) => {
  const b = h.shadowRoot.querySelector('.bar');
  return { warn: b.classList.contains('warn'), badge: h.shadowRoot.querySelector('.badge.check').textContent, border: getComputedStyle(b).borderTopColor, hint: getComputedStyle(h.shadowRoot.querySelector('.hint')).display };
});

// 0) fillArticle ohne Save: Formular gefüllt, report.chips + report.sourceValue, nichts gespeichert
{
  const r = await app.evaluate(() => window.__fill(1));
  check(r.ok && r.steps.native?.ok && r.steps.de?.ok && r.steps.metadata?.ok && r.steps.tag?.ok, 'fillArticle ohne Save: ' + JSON.stringify(r.problems));
  check(Array.isArray(r.chips) && r.chips.includes('Cyber') && r.sourceValue === 'https://news.example.com/story-1' && r.titleValue === 'English title 1', 'report.chips/sourceValue: ' + JSON.stringify({ chips: r.chips, sourceValue: r.sourceValue }));
  check(r.saved === undefined && !r.duplicate, 'Kein Save-Schritt ausgeführt');
  const events = await osdp.evaluate(() => window.__events.map((e) => e[0]));
  check(!events.includes('save') && events.includes('checkURLDuplicates'), 'Fixture: kein Save-Event, Duplikatprüfung beim Quellfeld ausgelöst');
  const alive = await app.evaluate(() => window.__driver.tabAlive());
  check(alive === true, 'tabAlive() = true');
}

// Leiste: zweimal showOverlay → eine Leiste, Texte aktualisiert; Warn-Stil bei Hinweis mit „⚠“
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
  // Warnung: schmales Fenster blendet den normalen Hinweis aus, die Warnung bleibt sichtbar
  await osdp.setViewportSize({ width: 800, height: 600 });
  const normal = await barStyle();
  const shown = await app.evaluate(() => window.__driver.exec('showOverlay', { title: 'Dritter Titel', index: 3, total: 5, hint: '⚠ 2 Problem(e): Tags nicht gesetzt · Datum wurde nicht akzeptiert' }));
  const warn = await barStyle();
  const warnText = await barText();
  await osdp.setViewportSize({ width: 1280, height: 720 });
  check(!normal.warn && normal.badge === '' && normal.hint === 'none', 'Normaler Hinweis: kein Warn-Stil, unter 900px ausgeblendet: ' + JSON.stringify(normal));
  check(shown.warn === true && warn.warn && warn.badge === 'Bitte prüfen' && warn.border === 'rgb(217, 119, 6)' && warn.hint !== 'none' && /Bitte prüfen ⚠ 2 Problem\(e\)/.test(warnText), 'Hinweis mit „⚠“: Warn-Rahmen, Badge „Bitte prüfen“, Hinweis sichtbar: ' + JSON.stringify(warn));
  await app.evaluate(() => window.__driver.exec('showOverlay', { title: 'Vierter Titel', index: 4, total: 5 }));
  const back = await barStyle();
  check(!back.warn && back.badge === '', 'Ohne „⚠“ wieder normaler Stil');
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
  check(r.outcome === 'skip' && r.reason === 'overlay' && r.chips.includes('Cyber') && r.tookMs < 5000, 'a) Überspringen → ' + JSON.stringify({ outcome: r.outcome, reason: r.reason, via: r.via, chips: r.chips, tookMs: r.tookMs }));
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
  await app.evaluate(() => window.__driver.focusTab()); // wie die App: OSDP-Tab in den Vordergrund
  const pending = app.evaluate(() => window.__review({ index: 4, total: 12, title: 'English title 2', structure: 'Cyber', wb: '' }));
  await bar().waitFor({ timeout: 5000 });
  await sleep(500);
  await osdp.locator('#btnSave').click(); // so wie der Nutzer in OSDP
  const r = await pending;
  check(r.outcome === 'saved' && r.reason === 'toast' && r.chips.includes('Cyber') && r.toasts.some((t) => t.message === 'Item Added!'), 'b) Save-Klick → ' + JSON.stringify({ outcome: r.outcome, reason: r.reason, via: r.via, chips: r.chips, toasts: r.toasts.map((t) => t.message) }));
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
  check(r.outcome === 'duplicate' && r.toasts.some((t) => t.kind === 'error' && /Duplicate/.test(t.message)), 'd) Duplicate-Toast → duplicate: ' + JSON.stringify({ outcome: r.outcome, reason: r.reason, via: r.via, toasts: r.toasts }));
  await osdp.evaluate(() => document.querySelectorAll('#toast-container .ngx-toastr').forEach((t) => t.remove()));
}

// e) Nachricht des Beobachters aus dem OSDP-Tab: mit pollMs 5000 käme das Polling frühestens nach 5 s –
//    der Save-Klick muss trotzdem binnen 2 s als saved ankommen (chrome.runtime.sendMessage → waitForReview).
//    Der OSDP-Tab ist dabei wie in der App im Vordergrund (sonst drosselt Chrome Timer auf 1 s).
{
  await app.evaluate(() => window.__fill(5));
  await app.evaluate(() => window.__driver.focusTab());
  const pending = app.evaluate(() => window.__review({ index: 7, total: 12, title: 'English title 5', pollMs: 5000 }));
  await bar().waitFor({ timeout: 5000 });
  await sleep(400);
  const t0 = Date.now();
  await osdp.locator('#btnSave').click();
  const r = await pending;
  const elapsed = Date.now() - t0;
  check(r.outcome === 'saved' && r.reason === 'toast' && r.via === 'message' && elapsed < 2000 && r.chips.includes('Cyber') && r.toasts.some((t) => t.message === 'Item Added!'), `e) Save-Klick bei pollMs 5000 → saved per Nachricht nach ${elapsed} ms: ` + JSON.stringify({ outcome: r.outcome, reason: r.reason, via: r.via, chips: r.chips }));
  check((await bar().count()) === 0, 'e) Leiste entfernt');
  await osdp.evaluate(() => document.querySelectorAll('#toast-container .ngx-toastr').forEach((t) => t.remove()));
}

// f) Save-Klick, aber der Erfolgstoast ist sofort weg (nur Formular-Reset bleibt) → saved über formReset +
//    saveClicked; ein Fehlertoast davor (z. B. Validierung) ändert nichts.
{
  await app.evaluate(() => window.__fill(6));
  await app.evaluate(() => window.__driver.focusTab());
  const pending = app.evaluate(() => window.__review({ index: 8, total: 12, title: 'English title 6' }));
  await bar().waitFor({ timeout: 5000 });
  await osdp.evaluate(() => window.__showToast('error', 'Error', 'Set tags before saving', 600));
  await sleep(900);
  const stillWaiting = await app.evaluate(() => window.__driver.formDirty);
  // Erfolgstoast „sofort entfernen“: die Fixture zeigt ihn gar nicht erst
  await osdp.evaluate(() => { window.__showToastOrig = window.__showToast; window.__showToast = (kind, ...rest) => (kind === 'success' ? null : window.__showToastOrig(kind, ...rest)); });
  await osdp.locator('#btnSave').click();
  const r = await pending;
  await osdp.evaluate(() => { window.__showToast = window.__showToastOrig; });
  check(stillWaiting === true && r.outcome === 'saved' && r.reason === 'formReset' && r.chips.includes('Cyber') && r.toasts.some((t) => t.message === 'Set tags before saving') && !r.toasts.some((t) => t.message === 'Item Added!'), 'f) Save-Klick + Formular-Reset ohne Erfolgstoast → saved (formReset, Fehlertoast davor ignoriert): ' + JSON.stringify({ outcome: r.outcome, reason: r.reason, via: r.via, chips: r.chips }));
}

// g) Gegentest: Formular-Reset OHNE Save-Klick (Nutzer leert die Felder von Hand) → kein saved; die Leiste
//    bleibt, der Nutzer kann weiter überspringen.
{
  await app.evaluate(() => window.__fill(7));
  let done = null;
  const pending = app.evaluate(() => window.__review({ index: 9, total: 12, title: 'English title 7' })).then((r) => (done = r));
  await bar().waitFor({ timeout: 5000 });
  await sleep(400);
  await osdp.evaluate(() => window.__resetForm());
  await sleep(3000);
  const formEmpty = await osdp.evaluate(() => !document.querySelector('input[formcontrolname="article_source"]').value);
  check(formEmpty && done === null && (await bar().count()) === 1, 'g) Formular von Hand geleert: nach 3 s kein Ergebnis, Leiste bleibt');
  await osdp.locator('#osdp-helper-bar button.skip').click();
  const r = await pending;
  check(r.outcome === 'skip' && r.reason === 'overlay' && r.chips.includes('Cyber'), 'g) danach Überspringen → skip: ' + JSON.stringify({ outcome: r.outcome, reason: r.reason, via: r.via }));
}

// h) precheckDuplicate vor Übersetzung/Tagging, formState, fillArticle mit vorbereitetem Editor
{
  const url8 = 'https://news.example.com/story-8';
  const t0 = Date.now();
  const pre = await app.evaluate(() => window.__driver.precheckDuplicate({ url: 'https://news.example.com/story-8', title: 'English title 8' }));
  const took = Date.now() - t0;
  check(pre.ok && pre.duplicate === false && pre.prepared === true && pre.sourceValue === url8 && pre.titleValue === 'English title 8' && took >= 3000, 'h) precheckDuplicate ohne Treffer → prepared (wartet 3 s auf den Toast): ' + JSON.stringify({ ...pre, toasts: pre.toasts.length, took }));
  const fs1 = await app.evaluate(() => window.__driver.formState());
  check(fs1.hasEditor && fs1.hasContent && fs1.ours === true && fs1.sourceValue === url8 && fs1.titleValue === 'English title 8', 'h) formState: Inhalt stammt von uns: ' + JSON.stringify(fs1));
  const before = loads;
  const fill = await app.evaluate(() => window.__fill(8, { editorPrepared: true }));
  check(fill.ok && loads === before && fill.sourceValue === url8 && fill.titleValue === 'English title 8' && fill.chips.includes('Cyber'), `h) fillArticle(editorPrepared) füllt ohne Reload weiter (${loads - before} Reload): ` + JSON.stringify(fill.problems));
  check((await app.evaluate(() => window.__driver.formDirty)) === true, 'h) formDirty nach dem Füllen');

  // Duplikat beim Quellfeld (Fixture antwortet wie OSDP mit dem Toast; die Liste überlebt den Reload) → duplicate, nicht prepared, Editor bleibt dirty
  await osdp.evaluate(() => window.__markDuplicate('https://news.example.com/dup-1'));
  const before2 = loads;
  const t1 = Date.now();
  const dup = await app.evaluate(() => window.__driver.precheckDuplicate({ url: 'https://news.example.com/dup-1', title: 'Already there' }));
  const took2 = Date.now() - t1;
  check(dup.ok && dup.duplicate === true && dup.prepared === false && dup.toasts.some((t) => /Duplicate/.test(t.message)) && took2 < 4500, 'h) precheckDuplicate mit Treffer → duplicate (Toast abgewartet): ' + JSON.stringify({ duplicate: dup.duplicate, prepared: dup.prepared, took: took2 }));
  check(loads === before2 + 1 && (await app.evaluate(() => window.__driver.formDirty)) === true, 'h) Editor vor der Prüfung neu geladen (Reste der vorigen Meldung), danach dirty');
  // Nächste Prüfung lädt wegen formDirty neu und ist wieder sauber vorbereitet
  const before3 = loads;
  const pre2 = await app.evaluate(() => window.__driver.precheckDuplicate({ url: 'https://news.example.com/story-9', title: 'English title 9' }));
  check(pre2.prepared === true && !pre2.duplicate && loads === before3 + 1, 'h) nach dem Duplikat lädt die nächste Prüfung neu und ist vorbereitet');
  await osdp.evaluate(() => window.__clearDuplicates());

  // formState: fremder Inhalt (Quelle von Hand geändert) → ours=false; leeres Formular → hasContent=false
  await osdp.evaluate(() => { document.querySelector('input[formcontrolname="article_source"]').value = 'https://manual.example.com/x'; });
  const fs2 = await app.evaluate(() => window.__driver.formState());
  await osdp.evaluate(() => window.__resetForm());
  const fs3 = await app.evaluate(() => window.__driver.formState());
  check(fs2.hasContent && fs2.ours === false && fs2.sourceValue === 'https://manual.example.com/x', 'h) formState: fremder Inhalt → ours=false: ' + JSON.stringify(fs2));
  check(!fs3.hasContent && fs3.ours === false, 'h) formState: leeres Formular → hasContent=false');
}

// i) Timeout
{
  await app.evaluate(() => window.__fill(10));
  const r = await app.evaluate(() => window.__review({ index: 10, total: 12, title: 'English title 10', timeoutMs: 700 }));
  check(r.outcome === 'timeout' && r.tookMs >= 700 && (await bar().count()) === 0, 'i) Timeout → timeout, Leiste entfernt');
}

// j) ensureTab: zeigt der gemerkte Tab keine OSDP-Seite mehr, wird er verworfen (nichts injiziert)
{
  const tabBefore = await app.evaluate(() => window.__driver.tabId);
  await osdp.goto('about:blank');
  const err = await app.evaluate(() => window.__driver.ensureTab({ create: false }).then(() => null, (e) => e.message));
  const tabAfter = await app.evaluate(() => window.__driver.tabId);
  check(typeof tabBefore === 'number' && /Kein OSDP-Tab/.test(err || '') && tabAfter === null, `j) ensureTab verwirft den Tab mit fremder URL: ${err}`);
  await osdp.goto(FIXTURE_URL);
  const again = await app.evaluate(() => window.__driver.ensureTab({ create: false }));
  check(again === tabBefore, 'j) Nach Rückkehr zur OSDP-Seite wird derselbe Tab wieder gefunden');
  await app.evaluate(() => window.__fill(11));
}

// k) Tab während der Freigabe geschlossen → lost (es wird kein neuer Tab geöffnet)
{
  const pending = app.evaluate(() => window.__review({ index: 11, total: 12, title: 'English title 11' }));
  await bar().waitFor({ timeout: 5000 });
  const pagesBefore = context.pages().length;
  await osdp.close();
  const r = await pending;
  await sleep(300);
  check(r.outcome === 'lost' && r.reason === 'tab', 'k) Tab geschlossen → lost: ' + JSON.stringify({ outcome: r.outcome, reason: r.reason }));
  check(context.pages().length === pagesBefore - 1, 'k) Kein neuer OSDP-Tab geöffnet');
  check((await app.evaluate(() => window.__driver.tabAlive())) === false, 'k) tabAlive() = false');
}

// l) App-Seite während der Freigabe geschlossen → der Beobachter im OSDP-Tab bekommt keine Antwort mehr
//    und entfernt die Leiste nach ca. 10 s selbst (keine wirkungslosen Buttons im OSDP-Tab).
{
  osdp = await context.newPage();
  await osdp.goto(FIXTURE_URL);
  await app.evaluate(() => window.__fill(12));
  app.evaluate(() => window.__review({ index: 12, total: 12, title: 'English title 12', pollMs: 500 })).catch(() => {});
  await bar().waitFor({ timeout: 5000 });
  await sleep(300);
  const t0 = Date.now();
  await app.close();
  let gone = false;
  while (Date.now() - t0 < 25000) {
    if ((await bar().count()) === 0) { gone = true; break; }
    await sleep(250);
  }
  const elapsed = Date.now() - t0;
  check(gone && elapsed >= 6000 && elapsed <= 20000, `l) Leiste entfernt sich selbst nach ${elapsed} ms ohne Empfänger`);
  const formIntact = await osdp.evaluate(() => document.querySelector('input[formcontrolname="article_source"]').value);
  check(formIntact === 'https://news.example.com/story-12', 'l) Formularinhalt bleibt dabei unangetastet');
}

await context.close();
fs.rmSync(userDataDir, { recursive: true, force: true });
console.log(failures ? `\n${failures} Test(s) fehlgeschlagen` : '\nAlle Tests bestanden');
process.exit(failures ? 1 : 0);
