// Helper als Reiter im OSDP-News-Editor (src/content/osdp-tabs.js) gegen den lokalen Nachbau (echte
// Angular-App): Reiter „Lauf | Quellen | Verlauf | Regeln | Einstellungen“ neben „German Translated“,
// Klick zeigt die App-Ansicht über dem Reiterkörper-Bereich (Formular bleibt erhalten), Klick auf
// einen OSDP-Reiter bringt das Formular zurück, kein Panel/Dock/Reiter am Rand, iframe überlebt die
// Navigation innerhalb von OSDP, Status-Punkt im Reiter „Lauf“, Driver bindet sich an den eigenen Tab,
// Alt+H, Zeitplan-Start per Nachricht, Farbschema folgt OSDP. Standalone: baut mock-osdp/ bei Bedarf
// und startet den Nachbau auf Port 4300.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const { chromium } = (() => { try { return createRequire(import.meta.url)('playwright'); } catch { return createRequire('/opt/node-tools/node_modules/')('playwright'); } })();

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const PORT = 4300;
const BASE = `http://localhost:${PORT}`;
const SHOTS = process.env.TABS_SHOTS || '';
let failures = 0;
const check = (cond, msg) => { console.log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) failures++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let server = null;
const alive = await fetch(`${BASE}/`).then((r) => r.ok).catch(() => false);
if (!alive) {
  if (!fs.existsSync(path.join(ROOT, 'mock-osdp', 'api.json'))) {
    await new Promise((res, rej) => {
      const p = spawn('node', [path.join(ROOT, 'tools/har-to-mock.mjs'), path.join(ROOT, 'site-dump/osdp.redacted.har')], { cwd: ROOT, stdio: 'ignore' });
      p.on('exit', (c) => (c === 0 ? res() : rej(new Error('har-to-mock fehlgeschlagen'))));
    });
  }
  server = spawn('node', [path.join(ROOT, 'tools/mock-osdp-server.mjs'), '--port', String(PORT)], { cwd: ROOT, stdio: 'ignore' });
  for (let i = 0; i < 30 && !(await fetch(`${BASE}/`).then((r) => r.ok).catch(() => false)); i++) await sleep(300);
}

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-tabs-'));
const context = await chromium.launchPersistentContext(userDataDir, {
  headless: true, channel: 'chromium', viewport: { width: 1500, height: 1000 },
  args: [`--disable-extensions-except=${ROOT}`, `--load-extension=${ROOT}`]
});
let [sw] = context.serviceWorkers();
if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 15000 });
const extId = new URL(sw.url()).host;
const appFrame = (page) => page.frames().find((f) => f.url().startsWith(`chrome-extension://${extId}/src/app/app.html`));
const TABS = () => [...document.querySelectorAll('app-news-editor mat-tab-group .mat-mdc-tab-labels .mat-mdc-tab')].map((t) => ({ label: t.textContent.replace(/\s+/g, ' ').trim(), own: t.classList.contains('osdp-helper-tab'), active: t.classList.contains('mdc-tab--active'), visible: t.getBoundingClientRect().width > 0 }));

try {
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const dialogs = [];
  page.on('dialog', (d) => { dialogs.push(d.message().slice(0, 60)); d.accept(); });
  await page.goto(`${BASE}/#/news`, { waitUntil: 'load' });
  await page.waitForTimeout(2500);

  // 1) Außerhalb des Editors: iframe lebt schon (unsichtbar), kein Panel, kein Dock, keine Verschiebung
  check(await page.evaluate(() => !!document.querySelector('#osdp-helper-tabs') && !document.querySelector('#osdp-helper-tabs').hasAttribute('data-active')), 'iframe-Host vorhanden und unsichtbar auf der News-Liste');
  check(await page.evaluate(() => !document.querySelector('#osdp-helper-panel') && !document.querySelector('#osdp-helper-dock')), 'Kein Seitenpanel, kein Dock');
  let frame = appFrame(page);
  check(!!frame && /embedded=1/.test(frame.url()), 'App als iframe geladen: ' + frame?.url());
  await frame.waitForSelector('#view-run', { timeout: 10000, state: 'attached' });

  // 2) Im Editor: eigene Reiter hinter „German Translated“, Formular aktiv, nichts über dem Formular
  await page.evaluate(() => { location.hash = '#/newsEditor'; });
  await page.waitForFunction(() => document.querySelectorAll('app-news-editor .osdp-helper-tab').length === 5, null, { timeout: 15000 });
  await page.waitForTimeout(500);
  let tabs = await page.evaluate(TABS);
  const visibleLabels = tabs.filter((t) => t.visible).map((t) => t.label.replace(/\s*$/, ''));
  check(JSON.stringify(visibleLabels) === JSON.stringify(['Native', 'English Translated', 'German Translated', 'Lauf', 'Quellen', 'Verlauf', 'Regeln', 'Einstellungen']), 'Reiterleiste: ' + visibleLabels.join(' | '));
  check(tabs[0].active && tabs.filter((t) => t.own).every((t) => !t.active), 'Anfangs ist „Native“ aktiv');
  check(await page.evaluate(() => !document.querySelector('#osdp-helper-tabs').hasAttribute('data-active')), 'App-iframe anfangs verborgen');
  const saveTop = await page.evaluate(() => [...document.querySelectorAll('app-editor button')].find((b) => /^\s*save\s*$/i.test(b.textContent)).getBoundingClientRect().top);
  const navBottom = await page.evaluate(() => document.querySelector('app-nav mat-toolbar').getBoundingClientRect().bottom);
  check(saveTop - navBottom < 40, `Nichts zwischen Kopfleiste und Save-Zeile (${Math.round(saveTop - navBottom)} px)`);
  // Status-Punkt im Reiter „Lauf“: ohne Lauf unauffällig
  check(await page.evaluate(() => { const d = document.querySelector('.osdp-helper-tab[data-view="run"] .osdp-helper-dot'); return !!d && !d.dataset.kind; }), 'Status-Punkt im Reiter „Lauf“ (ruhig)');

  // 3) Klick auf „Lauf“: App über dem Reiterkörper, „Native“ optisch abgewählt, Formularinhalt bleibt
  await page.evaluate(() => { const i = document.querySelector('[formcontrolname="article_title"]'); const d = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value'); d.set.call(i, 'bleibt erhalten'); i.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.click('.osdp-helper-tab[data-view="run"]');
  await page.waitForTimeout(600);
  tabs = await page.evaluate(TABS);
  check(tabs.find((t) => t.label.startsWith('Lauf'))?.active && !tabs[0].active, 'Reiter „Lauf“ aktiv, „Native“ abgewählt');
  const over = await page.evaluate(() => {
    const h = document.querySelector('#osdp-helper-tabs').getBoundingClientRect();
    const wrapEl = document.querySelector('app-news-editor mat-tab-group .mat-mdc-tab-body-wrapper');
    const w = wrapEl.getBoundingClientRect();
    const hdr = document.querySelector('app-news-editor mat-tab-group .mat-mdc-tab-header').getBoundingClientRect();
    return { active: document.querySelector('#osdp-helper-tabs').hasAttribute('data-active'), left: Math.round(h.left - w.left), top: Math.round(h.top - w.top), width: Math.round(h.width - w.width), height: Math.round(h.height), belowHeader: h.top >= hdr.bottom - 1, covered: wrapEl.hasAttribute('data-osdp-helper-covered'), formHidden: getComputedStyle(document.querySelector('[formcontrolname="article_title"]')).visibility === 'hidden' };
  });
  check(over.active && Math.abs(over.left) <= 1 && Math.abs(over.top) <= 1 && Math.abs(over.width) <= 1 && over.belowHeader && over.height >= 360, 'App-iframe deckt den Reiterkörper-Bereich genau ab: ' + JSON.stringify(over));
  check(over.covered && over.formHidden, 'Formular darunter nur unsichtbar (Platz und Zustand bleiben)');
  check(await frame.evaluate(() => !document.getElementById('view-run').hidden && getComputedStyle(document.querySelector('.sidebar')).display === 'none' && getComputedStyle(document.querySelector('#view-run .page-title')).display === 'none'), 'App zeigt „Lauf“ ohne eigene Navigation und ohne großen Titel');
  check((await frame.evaluate(() => chrome.storage.local.get('tabs'))).tabs?.view === 'run', 'Zustand „Lauf“ gespeichert');
  if (SHOTS) {
    fs.mkdirSync(SHOTS, { recursive: true });
    await page.screenshot({ path: path.join(SHOTS, 'tabs-lauf.png') });
  }

  // 4) Weitere Reiter: Einstellungen, Quellen → jeweils passende Ansicht; Wechsel durch die App (Hash) zieht den Reiter nach
  await page.click('.osdp-helper-tab[data-view="settings"]');
  await page.waitForTimeout(400);
  check(await frame.evaluate(() => !document.getElementById('view-settings').hidden && document.getElementById('view-run').hidden), 'Reiter „Einstellungen“ zeigt die Einstellungen');
  check((await page.evaluate(TABS)).find((t) => t.label === 'Einstellungen')?.active, 'Reiter „Einstellungen“ aktiv');
  await frame.evaluate(() => { location.hash = '#quellen'; });
  await page.waitForTimeout(500);
  check((await page.evaluate(TABS)).find((t) => t.label === 'Quellen')?.active && await frame.evaluate(() => !document.getElementById('view-sources').hidden), 'App-interner Wechsel auf „Quellen“ zieht den OSDP-Reiter nach');

  // 5) Klick auf „German Translated“: Formular zurück, dieser Reiter aktiv, Titel noch da
  await page.click('app-news-editor mat-tab-group .mat-mdc-tab:not(.osdp-helper-tab):nth-child(3)');
  await page.waitForTimeout(700);
  tabs = await page.evaluate(TABS);
  check(tabs[2].active && tabs.filter((t) => t.own).every((t) => !t.active), 'Reiter „German Translated“ aktiv, eigene Reiter abgewählt');
  check(await page.evaluate(() => !document.querySelector('#osdp-helper-tabs').hasAttribute('data-active') && !document.querySelector('app-news-editor .mat-mdc-tab-body-wrapper').hasAttribute('data-osdp-helper-covered')), 'App-iframe verborgen, Reiterkörper wieder sichtbar');
  check(await page.evaluate(() => document.querySelector('[formcontrolname="article_title_translatedde"]')?.getBoundingClientRect().height > 0), 'Reiterkörper „German Translated“ sichtbar');
  await page.click('app-news-editor mat-tab-group .mat-mdc-tab:not(.osdp-helper-tab):nth-child(1)');
  await page.waitForTimeout(500);
  check(await page.evaluate(() => document.querySelector('[formcontrolname="article_title"]').value === 'bleibt erhalten'), 'Formularinhalt blieb erhalten');
  // Klick auf den (laut Angular) noch gewählten Reiter nach einem eigenen Reiter: Klassen stimmen
  await page.click('.osdp-helper-tab[data-view="run"]');
  await page.waitForTimeout(300);
  await page.click('app-news-editor mat-tab-group .mat-mdc-tab:not(.osdp-helper-tab):nth-child(1)');
  await page.waitForTimeout(500);
  tabs = await page.evaluate(TABS);
  check(tabs[0].active && !tabs.find((t) => t.label.startsWith('Lauf')).active, 'Zurück auf „Native“ (gleicher Angular-Index) wird wieder als aktiv gezeigt');

  // 6) Alt+H wechselt zwischen „Lauf“ und Formular
  await page.keyboard.press('Alt+h');
  await page.waitForTimeout(400);
  check((await page.evaluate(TABS)).find((t) => t.label.startsWith('Lauf'))?.active, 'Alt+H öffnet „Lauf“');
  await page.keyboard.press('Alt+h');
  await page.waitForTimeout(400);
  check((await page.evaluate(TABS))[0].active && await page.evaluate(() => !document.querySelector('#osdp-helper-tabs').hasAttribute('data-active')), 'Alt+H zurück zum Formular');

  // 7) Driver im iframe: an eigenen Tab gebunden, füllen und über den Store leeren (kein Neuladen)
  const result = await frame.evaluate(async (base) => {
    const { OsdpDriver } = await import('../lib/osdp-driver.js');
    const driver = new OsdpDriver({ osdpUrlPattern: `${base}/*`, osdpDateFormat: 'dd/MM/yyyy', authorUnknownText: 'Autor ungenannt', fillEnglishTab: true }, () => {});
    const t = await chrome.tabs.getCurrent();
    let tabId = t?.id ?? null;
    if (tabId == null) tabId = (await chrome.runtime.sendMessage({ type: 'osdp-helper-whoami' }))?.tabId ?? null;
    driver.pin(tabId);
    await driver.resetForm();
    const pre = await driver.precheckDuplicate({ url: 'https://example.org/tabs-test-article', title: 'Tabs test title' });
    const probe1 = await driver.probe();
    const reset = await driver.resetForm();
    const probe2 = await driver.probe();
    return { tabId, pre: { ok: pre.ok, prepared: pre.prepared }, source1: probe1?.sourceValue, reset, source2: probe2?.sourceValue };
  }, BASE);
  check(Number.isInteger(result.tabId) && result.pre.ok && result.pre.prepared && result.source1 === 'https://example.org/tabs-test-article', 'Driver füllt das Formular im eigenen Tab: ' + JSON.stringify(result.pre));
  check(result.reset.ok && result.source2 === '', 'resetForm über den Editor-Store leert das Formular');
  check(page.frames().some((f) => f === frame), 'Seite wurde nicht neu geladen (iframe unverändert)');

  // 8) Navigation innerhalb von OSDP: iframe lebt weiter, zurück im Editor stehen die Reiter wieder
  await page.evaluate(() => { location.hash = '#/news'; });
  await page.waitForFunction(() => !document.querySelector('app-news-editor'), null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(500);
  check(page.frames().some((f) => f === frame) && await frame.evaluate(() => !!document.querySelector('#view-run')) && await page.evaluate(() => !document.querySelector('#osdp-helper-tabs').hasAttribute('data-active')), 'Auf der Liste: iframe lebt weiter, nichts sichtbar' + (dialogs.length ? ` (OSDP-Rückfrage bestätigt)` : ''));
  await page.evaluate(() => { location.hash = '#/newsEditor'; });
  await page.waitForFunction(() => document.querySelectorAll('app-news-editor .osdp-helper-tab').length === 5, null, { timeout: 15000 });
  check(page.frames().some((f) => f === frame), 'Zurück im Editor: Reiter wieder da, gleiches iframe');

  // 9) Farbschema folgt OSDP: hell → App hell
  await page.evaluate(() => [...document.querySelectorAll('mat-toolbar button mat-icon')].find((i) => /light_mode/.test(i.textContent)).closest('button').click());
  await page.waitForTimeout(500);
  check(await frame.evaluate(() => document.body.classList.contains('theme-light') && getComputedStyle(document.body).backgroundColor === 'rgb(255, 255, 255)'), 'OSDP hell → App hell');
  await page.evaluate(() => [...document.querySelectorAll('mat-toolbar button mat-icon')].find((i) => /dark_mode/.test(i.textContent)).closest('button').click());
  await page.waitForTimeout(500);
  check(await frame.evaluate(() => !document.body.classList.contains('theme-light')), 'OSDP dunkel → App dunkel');

  check(errors.length === 0, 'Keine Seitenfehler ' + (errors.length ? JSON.stringify(errors) : ''));
  await page.close();

  // 10) Zeitplan ohne offenen Tab: Hintergrund öffnet OSDP, schickt 'autorun', bis die Reiter antworten; die App startet, sobald sie bereit ist
  const page2 = await context.newPage();
  const nav2 = page2.goto(`${BASE}/#/news`, { waitUntil: 'commit' });
  const delivered = await sw.evaluate(async (base) => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    for (let i = 0; i < 60; i++) {
      const tabs = (await chrome.tabs.query({})).filter((t) => (t.url || t.pendingUrl || '').startsWith(base)).sort((a, b) => b.id - a.id);
      try {
        const r = await chrome.tabs.sendMessage(tabs[0].id, { type: 'osdp-helper-panel', action: 'autorun' });
        if (r?.ok) return { ok: true, appReady: r.appReady, attempt: i + 1 };
      } catch {
        /* Content-Script noch nicht da */
      }
      await sleep(250);
    }
    return { ok: false };
  }, BASE);
  await nav2;
  check(delivered.ok, 'Autorun-Nachricht angenommen (Versuch ' + delivered.attempt + ', App bereit: ' + delivered.appReady + ')');
  let started = false;
  for (let i = 0; i < 80 && !started; i++) {
    const f2 = appFrame(page2);
    try {
      started = !!f2 && (await f2.evaluate(() => /Automatischer Start/.test(document.getElementById('log')?.textContent || '')));
    } catch {
      started = false;
    }
    if (!started) await sleep(250);
  }
  check(started, 'App startet den Zeitplan-Lauf, sobald sie bereit ist (Protokoll „Automatischer Start“)');
  await page2.close();
} finally {
  await context.close();
  fs.rmSync(userDataDir, { recursive: true, force: true });
  if (server) server.kill();
}
console.log(failures ? `\n${failures} Test(s) fehlgeschlagen` : '\nReiter-Tests bestanden');
process.exit(failures ? 1 : 0);
