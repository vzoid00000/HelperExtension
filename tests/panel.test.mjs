// Panel in der OSDP-Seite (src/content/osdp-panel.js) gegen den lokalen Nachbau (echte Angular-App):
// Reiter erscheint, Panel öffnet die App als iframe im eingebetteten Modus, Seite rückt zusammen,
// Driver bindet sich an den eigenen Tab und leert das Formular über den Editor-Store statt per Neuladen.
// Standalone: baut mock-osdp/ bei Bedarf und startet den Nachbau-Server auf Port 4300.
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

// Nachbau bereitstellen
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

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-panel-'));
const context = await chromium.launchPersistentContext(userDataDir, {
  headless: true, channel: 'chromium', viewport: { width: 1500, height: 900 },
  args: [`--disable-extensions-except=${ROOT}`, `--load-extension=${ROOT}`]
});
let [sw] = context.serviceWorkers();
if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 15000 });
const extId = new URL(sw.url()).host;

try {
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${BASE}/#/news`, { waitUntil: 'load' });
  await page.waitForTimeout(2500);

  // 1) Reiter vorhanden, Panel zu
  const host = page.locator('#osdp-helper-panel');
  check(await host.count() === 1, 'Panel-Host in die OSDP-Seite injiziert');
  const tabText = await host.evaluate((h) => h.shadowRoot.querySelector('.tab')?.textContent || '');
  check(/OSDP Helper/.test(tabText), 'Reiter „OSDP Helper“ sichtbar');
  check(await host.evaluate((h) => !h.shadowRoot.querySelector('.panel').classList.contains('open')), 'Panel anfangs geschlossen');

  // 2) Öffnen per Reiter → iframe mit app.html?embedded=1, Seite rückt zusammen
  await host.evaluate((h) => h.shadowRoot.querySelector('.tab').click());
  await page.waitForTimeout(1500);
  const frame = page.frames().find((f) => f.url().startsWith(`chrome-extension://${extId}/src/app/app.html`));
  check(!!frame && /embedded=1/.test(frame.url()), 'App als iframe im Panel geladen: ' + frame?.url());
  const margin = await page.evaluate(() => getComputedStyle(document.documentElement).marginRight);
  check(parseInt(margin, 10) >= 380, 'OSDP-Seite rückt zusammen (html margin-right ' + margin + ')');
  await frame.waitForSelector('#view-run', { timeout: 10000 });
  check(await frame.evaluate(() => document.body.classList.contains('embedded')), 'App im eingebetteten Modus (body.embedded)');
  check(await frame.evaluate(() => getComputedStyle(document.querySelector('.sidebar')).flexDirection === 'row'), 'Seitenleiste als Kopfleiste');
  const stored = await frame.evaluate(() => chrome.storage.local.get('panel'));
  check(stored.panel?.open === true, 'Zustand „offen“ gespeichert');

  // 3) Driver im Panel: an eigenen Tab gebunden, Formular füllen und über den Store leeren (kein Neuladen)
  const result = await frame.evaluate(async (base) => {
    const { OsdpDriver } = await import('../lib/osdp-driver.js');
    const settings = { osdpUrlPattern: `${base}/*`, osdpDateFormat: 'dd/MM/yyyy', authorUnknownText: 'Autor ungenannt', fillEnglishTab: true };
    const driver = new OsdpDriver(settings, () => {});
    const t = await chrome.tabs.getCurrent();
    let tabId = t?.id ?? null;
    if (tabId == null) tabId = (await chrome.runtime.sendMessage({ type: 'osdp-helper-whoami' }))?.tabId ?? null;
    driver.pin(tabId);
    const navBefore = performance.now();
    const pre = await driver.precheckDuplicate({ url: 'https://example.org/panel-test-article', title: 'Panel test title' });
    const probe1 = await driver.probe();
    const reset = await driver.resetForm();
    const probe2 = await driver.probe();
    // Ein zweites Mal füllen: freshEditor darf nicht neu laden (noReload)
    const pre2 = await driver.precheckDuplicate({ url: 'https://example.org/panel-test-article-2', title: 'Second' });
    const probe3 = await driver.probe();
    return { tabId, pre: { ok: pre.ok, prepared: pre.prepared, duplicate: pre.duplicate }, source1: probe1?.sourceValue, reset, source2: probe2?.sourceValue, title2: probe2?.titleValue, chips2: probe2?.chips?.length, pre2: pre2.ok, source3: probe3?.sourceValue, ms: Math.round(performance.now() - navBefore) };
  }, BASE);
  check(Number.isInteger(result.tabId), 'Eigener Tab ermittelt: ' + result.tabId);
  check(result.pre.ok && result.pre.prepared && result.source1 === 'https://example.org/panel-test-article', 'Formular im eigenen Tab befüllt: ' + JSON.stringify(result.pre));
  check(result.reset.ok && result.source2 === '' && result.title2 === '' && result.chips2 === 0, 'resetForm über den Editor-Store leert das Formular: ' + JSON.stringify(result.reset));
  check(result.pre2 && result.source3 === 'https://example.org/panel-test-article-2', `Erneut befüllt ohne Neuladen (${result.ms} ms gesamt)`);
  // Die Seite wurde nicht neu geladen: der Panel-Host existiert weiterhin, das iframe ist dasselbe
  check(await host.count() === 1 && page.frames().some((f) => f === frame), 'Seite wurde nicht neu geladen (Panel und iframe unverändert)');

  // 4) Schließen per Nachricht (wie Klick auf das Extension-Symbol), Zustand gespeichert
  await frame.evaluate(async (tabId) => chrome.tabs.sendMessage(tabId, { type: 'osdp-helper-panel', action: 'close' }), result.tabId);
  await page.waitForTimeout(400);
  check(await host.evaluate((h) => !h.shadowRoot.querySelector('.panel').classList.contains('open')), 'Panel per Nachricht geschlossen');
  check(parseInt(await page.evaluate(() => getComputedStyle(document.documentElement).marginRight), 10) === 0, 'Seitenrand wieder 0');
  check(errors.length === 0, 'Keine Seitenfehler ' + (errors.length ? JSON.stringify(errors) : ''));
} finally {
  await context.close();
  fs.rmSync(userDataDir, { recursive: true, force: true });
  if (server) server.kill();
}
console.log(failures ? `\n${failures} Test(s) fehlgeschlagen` : '\nPanel-Tests bestanden');
process.exit(failures ? 1 : 0);
