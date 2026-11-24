// Dock in der OSDP-Seite (src/content/osdp-dock.js) gegen den lokalen Nachbau (echte Angular-App):
// Der Helper sitzt als Bereich direkt unter der OSDP-Kopfleiste (kein Reiter am Rand, kein Panel, kein
// eigener Tab), die App läuft als iframe im eingebetteten Modus, der Driver bindet sich an den eigenen
// Tab und leert das Formular über den Editor-Store. Das Dock überlebt die Navigation innerhalb von
// OSDP (gleiches iframe), ist außerhalb des Editors ausgeblendet, meldet den App-Status in der
// Kopfzeile, lässt sich per Nachricht/Alt+H ein- und ausklappen und startet den Zeitplan per
// ?osdpHelperAutorun=1. Standalone: baut mock-osdp/ bei Bedarf und startet den Nachbau auf Port 4300.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const { chromium } = (() => { try { return createRequire(import.meta.url)('playwright'); } catch { return createRequire('/opt/node-tools/node_modules/')('playwright'); } })();

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const PORT = 4300;
const BASE = `http://localhost:${PORT}`;
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

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-dock-'));
const context = await chromium.launchPersistentContext(userDataDir, {
  headless: true, channel: 'chromium', viewport: { width: 1500, height: 1000 },
  args: [`--disable-extensions-except=${ROOT}`, `--load-extension=${ROOT}`]
});
let [sw] = context.serviceWorkers();
if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 15000 });
const extId = new URL(sw.url()).host;
const appFrame = (page) => page.frames().find((f) => f.url().startsWith(`chrome-extension://${extId}/src/app/app.html`));

try {
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  // OSDP fragt beim Verlassen des Editors mit confirm() nach ungespeicherten Änderungen – im Test bestätigen
  const dialogs = [];
  page.on('dialog', (d) => { dialogs.push(d.message().slice(0, 60)); d.accept(); });
  await page.goto(`${BASE}/#/news`, { waitUntil: 'load' });
  await page.waitForTimeout(2500);

  // 1) Dock hängt hinter <app-nav>, ist auf der Liste ausgeblendet, kein Reiter, kein Panel
  const host = page.locator('#osdp-helper-dock');
  check(await host.count() === 1, 'Dock-Host in die OSDP-Seite injiziert');
  check(await page.evaluate(() => document.querySelector('#osdp-helper-dock')?.previousElementSibling?.localName === 'app-nav'), 'Dock direkt hinter <app-nav> in <app-root>');
  check(await page.evaluate(() => document.querySelector('#osdp-helper-dock').hasAttribute('hidden')), 'Auf der News-Liste ausgeblendet');
  check(await page.evaluate(() => !document.querySelector('#osdp-helper-panel')), 'Kein Seitenpanel/Reiter mehr');
  let frame = appFrame(page);
  check(!!frame && /embedded=1/.test(frame.url()), 'App läuft trotzdem schon als iframe: ' + frame?.url());
  check(parseInt(await page.evaluate(() => getComputedStyle(document.documentElement).marginRight), 10) === 0, 'Seite wird nicht zur Seite geschoben');

  // 2) Im Editor sichtbar, in der Seite platziert (unter der Kopfleiste, über dem Formular)
  await page.evaluate(() => { location.hash = '#/newsEditor'; });
  await page.waitForTimeout(2500);
  check(await page.evaluate(() => !document.querySelector('#osdp-helper-dock').hasAttribute('hidden')), 'Im News-Editor sichtbar');
  const geo = await page.evaluate(() => {
    const d = document.querySelector('#osdp-helper-dock').getBoundingClientRect();
    const nav = document.querySelector('app-nav mat-toolbar').getBoundingClientRect();
    const save = [...document.querySelectorAll('app-editor button')].find((b) => /^\s*save\s*$/i.test(b.textContent)).getBoundingClientRect();
    return { top: Math.round(d.top), navBottom: Math.round(nav.bottom), height: Math.round(d.height), width: Math.round(d.width), saveTop: Math.round(save.top), vw: innerWidth };
  });
  check(geo.top >= geo.navBottom - 1 && geo.saveTop >= geo.top + geo.height - 1 && geo.width === geo.vw, 'Dock liegt zwischen Kopfleiste und Save-Zeile, volle Breite: ' + JSON.stringify(geo));
  check(geo.height > 300, 'Dock aufgeklappt (Höhe ' + geo.height + ')');
  await frame.waitForSelector('#view-run', { timeout: 10000 });
  check(await frame.evaluate(() => document.body.classList.contains('embedded')), 'App im eingebetteten Modus (body.embedded)');
  check(await frame.evaluate(() => getComputedStyle(document.querySelector('.sidebar')).flexDirection === 'row'), 'Navigation als Kopfleiste');
  check(await frame.evaluate(() => getComputedStyle(document.querySelector('.grid-2')).gridTemplateColumns.split(' ').length === 2), 'Lauf-Ansicht zweispaltig in voller Breite');
  const headStatus = await host.evaluate((h) => h.shadowRoot.querySelector('.status').textContent);
  check(/Bereit/.test(headStatus), 'App-Status in der Dock-Kopfzeile: ' + JSON.stringify(headStatus));

  // 3) Driver im Dock: an eigenen Tab gebunden, Formular füllen und über den Store leeren (kein Neuladen)
  const result = await frame.evaluate(async (base) => {
    const { OsdpDriver } = await import('../lib/osdp-driver.js');
    const settings = { osdpUrlPattern: `${base}/*`, osdpDateFormat: 'dd/MM/yyyy', authorUnknownText: 'Autor ungenannt', fillEnglishTab: true };
    const driver = new OsdpDriver(settings, () => {});
    const t = await chrome.tabs.getCurrent();
    let tabId = t?.id ?? null;
    if (tabId == null) tabId = (await chrome.runtime.sendMessage({ type: 'osdp-helper-whoami' }))?.tabId ?? null;
    driver.pin(tabId);
    const pre = await driver.precheckDuplicate({ url: 'https://example.org/dock-test-article', title: 'Dock test title' });
    const probe1 = await driver.probe();
    const reset = await driver.resetForm();
    const probe2 = await driver.probe();
    const pre2 = await driver.precheckDuplicate({ url: 'https://example.org/dock-test-article-2', title: 'Second' });
    const probe3 = await driver.probe();
    return { tabId, pre: { ok: pre.ok, prepared: pre.prepared, duplicate: pre.duplicate }, source1: probe1?.sourceValue, reset, source2: probe2?.sourceValue, title2: probe2?.titleValue, chips2: probe2?.chips?.length, pre2: pre2.ok, source3: probe3?.sourceValue };
  }, BASE);
  check(Number.isInteger(result.tabId), 'Eigener Tab ermittelt: ' + result.tabId);
  check(result.pre.ok && result.pre.prepared && result.source1 === 'https://example.org/dock-test-article', 'Formular im eigenen Tab befüllt: ' + JSON.stringify(result.pre));
  check(result.reset.ok && result.source2 === '' && result.title2 === '' && result.chips2 === 0, 'resetForm über den Editor-Store leert das Formular: ' + JSON.stringify(result.reset));
  check(result.pre2 && result.source3 === 'https://example.org/dock-test-article-2', 'Erneut befüllt ohne Neuladen');
  check(page.frames().some((f) => f === frame), 'Seite wurde nicht neu geladen (iframe unverändert)');

  // 4) Navigation innerhalb von OSDP: Dock verborgen, iframe lebt weiter; zurück im Editor wieder sichtbar
  //    (Formular vorher leeren, sonst hält OSDP die Navigation mit einer Rückfrage an)
  await frame.evaluate(async (base) => {
    const { OsdpDriver } = await import('../lib/osdp-driver.js');
    const driver = new OsdpDriver({ osdpUrlPattern: `${base}/*` }, () => {});
    driver.pin((await chrome.tabs.getCurrent()).id);
    await driver.resetForm();
  }, BASE);
  await page.evaluate(() => { location.hash = '#/news'; });
  await page.waitForFunction(() => !document.querySelector('app-editor'), null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(500);
  check(await page.evaluate(() => document.querySelector('#osdp-helper-dock').hasAttribute('hidden')), 'Auf der Liste wieder ausgeblendet' + (dialogs.length ? ` (OSDP-Rückfrage bestätigt: ${JSON.stringify(dialogs)})` : ''));
  check(page.frames().some((f) => f === frame) && await frame.evaluate(() => !!document.querySelector('#view-run')), 'iframe lebt während der Navigation weiter');
  await page.evaluate(() => { location.hash = '#/newsEditor'; });
  await page.waitForTimeout(2000);
  check(await page.evaluate(() => !document.querySelector('#osdp-helper-dock').hasAttribute('hidden')) && page.frames().some((f) => f === frame), 'Zurück im Editor sichtbar, gleiches iframe');

  // 5) Ein-/Ausklappen per Nachricht (wie Klick auf das Extension-Symbol) und Alt+H, Zustand gespeichert
  await frame.evaluate(async (tabId) => chrome.tabs.sendMessage(tabId, { type: 'osdp-helper-panel', action: 'close' }), result.tabId);
  await page.waitForTimeout(400);
  const collapsed = await host.evaluate((h) => ({ body: h.shadowRoot.querySelector('.body').classList.contains('collapsed'), height: h.getBoundingClientRect().height }));
  check(collapsed.body && collapsed.height < 60, 'Per Nachricht eingeklappt (nur Kopfzeile, ' + Math.round(collapsed.height) + ' px)');
  check((await frame.evaluate(() => chrome.storage.local.get('dock'))).dock?.collapsed === true, 'Zustand „eingeklappt“ gespeichert');
  await page.keyboard.press('Alt+h');
  await page.waitForTimeout(400);
  check(await host.evaluate((h) => !h.shadowRoot.querySelector('.body').classList.contains('collapsed')), 'Alt+H klappt wieder aus');
  check(page.frames().some((f) => f === frame), 'iframe beim Ein-/Ausklappen unverändert');

  // 6) Zeitplan ohne offenen Tab: der Hintergrund öffnet OSDP und schickt 'autorun', bis das Dock antwortet;
  //    das Dock hebt die Aktion auf, bis die App bereit ist, und reicht sie dann per postMessage weiter
  check(errors.length === 0, 'Keine Seitenfehler ' + (errors.length ? JSON.stringify(errors) : ''));
  await page.close(); // nur noch ein OSDP-Tab, damit der Hintergrund eindeutig diesen trifft
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
        /* Dock noch nicht da */
      }
      await sleep(250);
    }
    return { ok: false };
  }, BASE);
  await nav2;
  check(delivered.ok, 'Autorun-Nachricht vom Dock angenommen (Versuch ' + delivered.attempt + ', App bereit: ' + delivered.appReady + ')');
  let f2 = null;
  let started = false;
  for (let i = 0; i < 80 && !started; i++) {
    f2 = appFrame(page2);
    try {
      started = !!f2 && (await f2.evaluate(() => /Automatischer Start/.test(document.getElementById('log')?.textContent || '')));
    } catch {
      started = false; // Ausführungskontext gerade gewechselt – weiter warten
    }
    if (!started) await sleep(250);
  }
  const dockState = await page2.evaluate(() => { const h = document.querySelector('#osdp-helper-dock'); return { hidden: h?.hasAttribute('hidden'), status: h?.shadowRoot.querySelector('.status').textContent }; });
  check(started, 'App startet den Zeitplan-Lauf, sobald sie bereit ist (Protokoll „Automatischer Start“)' + (started ? '' : ' | Dock: ' + JSON.stringify(dockState) + ' | Log: ' + JSON.stringify(await f2?.evaluate(() => document.getElementById('log')?.textContent.slice(0, 300)))));
  await page2.close();
} finally {
  await context.close();
  fs.rmSync(userDataDir, { recursive: true, force: true });
  if (server) server.kill();
}
console.log(failures ? `\n${failures} Test(s) fehlgeschlagen` : '\nDock-Tests bestanden');
process.exit(failures ? 1 : 0);
