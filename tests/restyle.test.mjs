// Aufgeräumte OSDP-Oberfläche (src/content/osdp-restyle.js + osdp-restyle-main.js) gegen den lokalen
// Nachbau (echte Angular-App): dunkles Design beim Laden, Subtitle/Summary/Place … ausgeblendet,
// Metadata und Tags auf einer Seite, CKEditor nur Text (Schema + Befehle, auch beim Einfügen),
// Chips neben dem Tag-Baum, der Driver füllt das Formular weiterhin vollständig, Abschalten per
// Einstellung. Standalone: baut mock-osdp/ bei Bedarf und startet den Nachbau-Server auf Port 4300.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const { chromium } = (() => { try { return createRequire(import.meta.url)('playwright'); } catch { return createRequire('/opt/node-tools/node_modules/')('playwright'); } })();

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const PORT = 4300;
const BASE = `http://localhost:${PORT}`;
const SHOTS = process.env.RESTYLE_SHOTS || '';
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

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-restyle-'));
const context = await chromium.launchPersistentContext(userDataDir, {
  headless: true, channel: 'chromium', viewport: { width: 1600, height: 1000 },
  args: [`--disable-extensions-except=${ROOT}`, `--load-extension=${ROOT}`]
});
let [sw] = context.serviceWorkers();
if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 15000 });
const extId = new URL(sw.url()).host;

// Sichtbarkeit wie der Nutzer sie sieht (Fläche > 0, nicht display:none)
const VIS = `(sel) => { const el = typeof sel === 'string' ? document.querySelector(sel) : sel; if (!el) return null; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden'; }`;

try {
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${BASE}/#/news`, { waitUntil: 'load' });
  await page.waitForTimeout(2500);
  await page.evaluate(() => { location.hash = '#/newsEditor'; });
  await page.waitForSelector('mat-tab-group.osdp-helper-onepage tag-tree mat-tree-node', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(800);

  // 1) Dunkel + Aufräumen
  const s1 = await page.evaluate((visSrc) => {
    const vis = eval(visSrc);
    const txt = (e) => (e?.textContent || '').replace(/\s+/g, ' ').trim();
    const g = document.querySelector('mat-tab-group[data-osdp-helper-group="meta"]');
    return {
      html: document.documentElement.className, dark: document.body.classList.contains('dark-theme'),
      bodyBg: getComputedStyle(document.body).backgroundColor,
      preserved: g?.getAttribute('data-osdp-helper-preserved'), onepage: !!g?.classList.contains('osdp-helper-onepage'),
      summaryBtn: vis([...document.querySelectorAll('app-editor form > div.tw-flex > button')].find((b) => /^summary$/i.test(txt(b)))),
      saveBtn: vis([...document.querySelectorAll('app-editor form > div.tw-flex > button')].find((b) => /^save$/i.test(txt(b)))),
      summaryTab: vis([...document.querySelectorAll('.mat-mdc-tab')].find((b) => /^summary$/i.test(txt(b)))),
      nativeTab: vis([...document.querySelectorAll('.mat-mdc-tab')].find((b) => /^native$/i.test(txt(b)))),
      subtitle: vis('[formcontrolname="article_subtitle"]'), place: vis('[formcontrolname="article_place"]'), lat: vis('[formcontrolname="lat"]'),
      translation: vis('[formcontrolname="translation_service"]'), files: vis('file-upload'),
      author: vis('[formcontrolname="article_author"]'), date: vis('[formcontrolname="article_created_at"]'), lang: vis('[formcontrolname="article_language"]'),
      tree: vis('tag-tree mat-tree-node'), search: vis('mat-tab-group[data-osdp-helper-group="meta"] input[placeholder="Search Terms"]'),
      toolbar: vis('.ck-editor__top'), editable: vis('.ck-editor__editable'),
      chipsBox: !!document.querySelector('.mat-mdc-tab-body-wrapper > .osdp-helper-chips mat-chip-listbox'),
      metaHeader: vis('mat-tab-group[data-osdp-helper-group="meta"] > .mat-mdc-tab-header'),
      treeLabel: getComputedStyle(document.querySelector('tag-tree mat-tree-node label')).color
    };
  }, VIS);
  check(/osdp-helper-restyle/.test(s1.html) && /osdp-helper-dark/.test(s1.html), 'Flags am <html>: ' + s1.html);
  check(s1.dark && s1.bodyBg === 'rgb(9, 9, 11)', `Dunkles Design beim Laden eingeschaltet (body.dark-theme, Hintergrund ${s1.bodyBg})`);
  check(s1.summaryBtn === false && s1.saveBtn === true, 'Button „Summary“ ausgeblendet, „Save“ sichtbar');
  check(s1.summaryTab === false && s1.nativeTab === true, 'Reiter „Summary“ ausgeblendet, „Native“ sichtbar');
  check(s1.subtitle === false, 'Subtitle-Feld ausgeblendet');
  check(s1.place === false && s1.lat === false && s1.translation === false && s1.files === false, 'Place, Koordinaten, Translation Service, Files ausgeblendet');
  check(s1.preserved === '1' && s1.onepage, 'Rechte Reitergruppe: preserveContent gesetzt, Ein-Seiten-Modus aktiv');
  check(s1.author && s1.date && s1.lang && s1.tree && s1.search, 'Date, Author, Language Source und Tag-Baum (mit Suche) gleichzeitig sichtbar');
  check(s1.metaHeader === false, 'Reiterleiste Metadata/Tags ausgeblendet');
  check(s1.toolbar === false && s1.editable === true, 'CKEditor: Werkzeugleiste ausgeblendet, Textfeld sichtbar');
  check(s1.chipsBox, 'Chip-Liste der gewählten Tags steht zwischen Metadaten und Tag-Baum');
  check(s1.treeLabel === 'rgb(228, 228, 231)', 'Tag-Baum lesbar (Beschriftung hell): ' + s1.treeLabel);

  // 2) Reiner Text im CKEditor: setData (wie Extract/Übersetzung) und Einfügen aus der Zwischenablage
  const s2 = await page.evaluate(async () => {
    const ed = document.querySelector('.ck-editor__editable').ckeditorInstance;
    const cmds = ['bold', 'italic', 'link', 'heading', 'insertTable', 'blockQuote', 'bulletedList', 'imageUpload', 'mediaEmbed'].map((c) => [c, ed.commands.get(c)?.isEnabled]);
    ed.setData('<h2>Head</h2><p><strong>fett</strong> <a href="https://x.example">link</a> <i>kursiv</i></p><ul><li>eins</li><li>zwei</li></ul><blockquote><p>zitat</p></blockquote><figure class="table"><table><tbody><tr><td>zelle</td></tr></tbody></table></figure><p style="text-align:center">mitte<br>umbruch</p>');
    const viaSetData = ed.getData();
    ed.setData('');
    ed.editing.view.focus();
    const dt = new DataTransfer();
    dt.setData('text/html', '<h1>Pasted</h1><p><b>bold</b> <a href="https://y">normal</a></p><ol><li>one</li></ol>');
    dt.setData('text/plain', 'Pasted\nbold normal\none');
    document.querySelector('.ck-editor__editable').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 400));
    const afterPaste = ed.getData();
    ed.setData('');
    return { cmds, viaSetData, afterPaste, plain: ed.__osdpHelperPlain === true };
  });
  check(s2.plain && s2.cmds.every(([, en]) => en === false), 'Formatier-Befehle abgeschaltet: ' + JSON.stringify(s2.cmds));
  check(s2.viaSetData === '<p>Head</p><p>fett link kursiv</p><p>eins</p><p>zwei</p><p>zitat</p><p>zelle</p><p>mitte<br>umbruch</p>', 'setData: Überschrift, Fett, Link, Liste, Zitat, Tabelle → Absätze mit Text: ' + s2.viaSetData);
  check(s2.afterPaste === '<p>Pasted</p><p>bold normal</p><p>one</p>', 'Einfügen aus der Zwischenablage → nur Absätze: ' + s2.afterPaste);

  // 3) Der Driver füllt das aufgeräumte Formular weiterhin vollständig (Metadata + Tags ohne sichtbare Reiter)
  const app = await context.newPage();
  await app.goto(`chrome-extension://${extId}/src/lib/osdp-driver.js`);
  const fill = await app.evaluate(async (base) => {
    const mod = await import('/src/lib/osdp-driver.js');
    const log = [];
    const driver = new mod.OsdpDriver({ osdpUrlPattern: `${base}/*`, fillEnglishTab: true, useSiteExtract: false, osdpDateFormat: 'dd/MM/yyyy', authorUnknownText: 'Autor ungenannt' }, (m) => log.push(m));
    const a = {
      url: 'https://news.example.com/2026/11/20/restyle-test', titleEn: 'Restyle test article', textEn: 'First paragraph.\n\nSecond paragraph.',
      titleDe: 'Restyle-Testartikel', textDe: 'Erster Absatz.\n\nZweiter Absatz.', author: 'Jane Example', authorUnknown: false, category: 'cyber',
      tagPaths: ['Struktur → [S]1 Cyber', 'Newsinfo → Dokumententyp → News'], date: new Date(Date.UTC(2026, 10, 20, 12))
    };
    const pre = await driver.precheckDuplicate({ url: a.url, title: a.titleEn });
    const r = await driver.fillArticle(a, { save: false, editorPrepared: true });
    const state = await driver.formState();
    return { pre: { ok: pre.ok, duplicate: pre.duplicate, prepared: pre.prepared }, ok: r.ok, problems: r.problems, chips: r.chips, metadata: { author: r.steps.metadata?.authorValue, date: r.steps.metadata?.dateValue }, state: { source: state.sourceValue, title: state.titleValue }, log };
  }, BASE);
  check(fill.pre.ok && fill.pre.prepared && fill.ok && fill.problems.length === 0, 'Driver: precheckDuplicate + fillArticle ohne Probleme: ' + JSON.stringify(fill.problems) + ' ' + JSON.stringify(fill.log).slice(0, 300));
  check(fill.metadata.date === '20/11/2026', 'Datum gesetzt: ' + JSON.stringify(fill.metadata));
  check(Array.isArray(fill.chips) && fill.chips.length >= 2, 'Tags gesetzt, Chips gelesen: ' + JSON.stringify(fill.chips));
  const s3 = await page.evaluate((visSrc) => {
    const vis = eval(visSrc);
    const chips = [...document.querySelectorAll('.osdp-helper-chips mat-chip-option')];
    return { chipsInBox: chips.length, chipsVisible: chips.every((c) => vis(c)), colored: chips.filter((c) => c.hasAttribute('data-osdp-helper-color')).length,
      author: vis('[formcontrolname="article_author"]'), tree: vis('tag-tree mat-tree-node'), authorValue: document.querySelector('[formcontrolname="article_author"]')?.value };
  }, VIS);
  check(s3.chipsInBox >= 2 && s3.chipsVisible && s3.author && s3.tree && s3.authorValue === 'Jane Example', 'Nach dem Befüllen: Autor gesetzt, Chips neben dem Baum sichtbar, Metadaten und Baum weiterhin auf einer Seite: ' + JSON.stringify(s3));
  if (SHOTS) {
    fs.mkdirSync(SHOTS, { recursive: true });
    await page.screenshot({ path: path.join(SHOTS, 'restyle-dark.png'), fullPage: true });
  }

  // 4) Hell schalten (OSDP-Schalter) bleibt möglich: kein erneutes Umschalten durch die Extension
  await page.evaluate(() => [...document.querySelectorAll('mat-toolbar button mat-icon')].find((i) => /light_mode/.test(i.textContent)).closest('button').click());
  await page.waitForTimeout(600);
  check(await page.evaluate(() => !document.body.classList.contains('dark-theme')), 'Manuell auf hell geschaltet – bleibt hell');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'restyle-light.png'), fullPage: true });

  // 5) Einstellung aus → Seite wieder wie OSDP (Reiterleiste, Summary, Subtitle sichtbar)
  await app.evaluate(async () => {
    const stored = (await chrome.storage.local.get('settings')).settings || {};
    await chrome.storage.local.set({ settings: { ...stored, osdpRestyle: false } });
  });
  await page.waitForTimeout(600);
  const s5 = await page.evaluate((visSrc) => {
    const vis = eval(visSrc);
    const txt = (e) => (e?.textContent || '').replace(/\s+/g, ' ').trim();
    return { html: document.documentElement.className, subtitle: vis('[formcontrolname="article_subtitle"]'),
      summaryTab: vis([...document.querySelectorAll('.mat-mdc-tab')].find((b) => /^summary$/i.test(txt(b)))),
      metaHeader: vis('mat-tab-group[data-osdp-helper-group="meta"] > .mat-mdc-tab-header') };
  }, VIS);
  check(!/osdp-helper-restyle/.test(s5.html) && s5.subtitle === true && s5.summaryTab === true && s5.metaHeader === true, 'Einstellung aus: Subtitle, Reiter „Summary“ und Metadata/Tags-Leiste wieder sichtbar: ' + JSON.stringify(s5));
  await app.evaluate(async () => {
    const stored = (await chrome.storage.local.get('settings')).settings || {};
    await chrome.storage.local.set({ settings: { ...stored, osdpRestyle: true } });
  });
  await page.waitForTimeout(600);
  check(await page.evaluate(() => document.documentElement.classList.contains('osdp-helper-restyle') && document.querySelector('mat-tab-group[data-osdp-helper-group="meta"]').classList.contains('osdp-helper-onepage')), 'Einstellung wieder an: Ein-Seiten-Modus sofort zurück');
  check(errors.length === 0, 'Keine Seitenfehler ' + (errors.length ? JSON.stringify(errors) : ''));
} finally {
  await context.close();
  fs.rmSync(userDataDir, { recursive: true, force: true });
  if (server) server.kill();
}
console.log(failures ? `\n${failures} Test(s) fehlgeschlagen` : '\nRestyle-Tests bestanden');
process.exit(failures ? 1 : 0);
