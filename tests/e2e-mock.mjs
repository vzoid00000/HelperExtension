// End-to-End gegen den OSDP-Nachbau (echte Angular-App aus dem HAR):
// Editor öffnen → Felder, CKEditor, Metadata, Tags (ng + DOM) → Save → POST /api/news prüfen.
import fs from 'node:fs';
import { createRequire } from 'node:module';
const { chromium } = (() => { try { return createRequire(import.meta.url)('playwright'); } catch { return createRequire('/opt/node-tools/node_modules/')('playwright'); } })();

const EXT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const BASE = 'http://localhost:4300';
let failures = 0;
const check = (cond, msg) => { console.log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) failures++; };

const driverSrc = fs.readFileSync(`${EXT}/src/lib/osdp-driver.js`, 'utf8');
const fnSource = (name) => {
  const start = driverSrc.indexOf(`function ${name}(`);
  const next = driverSrc.indexOf('\n}\n', start);
  return driverSrc.slice(driverSrc.lastIndexOf('\n', start) + 1, next + 2);
};
const ckSetDataSrc = fnSource('ckSetData');
const ngSelectTagsSrc = fnSource('ngSelectTags');

const catalog = JSON.parse(fs.readFileSync(`${EXT}/src/config/osdp-tags.json`, 'utf8'));
const uidByPath = new Map();
const walk = (n, p) => { const q = [...p, n.name]; uidByPath.set(q.join(' → '), n.uid); n.children.forEach((c) => walk(c, q)); };
catalog.tree.forEach((n) => walk(n, []));

const browser = await chromium.launch({ headless: true, channel: 'chromium' });
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 200)));

// Editor öffnen wie der Driver: App laden, dann per Hash navigieren
await page.goto(`${BASE}/#/news`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);
await page.addScriptTag({ path: `${EXT}/src/content/osdp-filler.js` });
const run = (step, data) => page.evaluate(([s, d]) => globalThis.__osdpHelper.run(s, d), [step, data || {}]);
const main = (src, name, args) => page.evaluate(([src, name, args]) => new Function(src + `; return ${name};`)()(...args), [src, name, args]);

await run('navigate', { hash: '#/newsEditor' });
let probe = null;
for (let i = 0; i < 30; i++) { await page.waitForTimeout(400); probe = await run('probe'); if (probe.hasEditor && probe.groups.length >= 2) break; }
check(probe.hasEditor && probe.groups.length === 2, 'Editor geöffnet: ' + JSON.stringify(probe.groups));

// 1) Native
const native = await run('fillNative', { url: 'https://news.example.com/2026/10/10/defence-contractor-breach', title: 'Hackers breach European defence contractor' });
check(native.ok && native.source && native.title, 'fillNative ' + JSON.stringify(native));
const ck1 = await main(ckSetDataSrc, 'ckSetData', ['native', '^\\s*native\\s*$', '<p>First paragraph of the English source.</p><p>Second paragraph.</p>']);
check(ck1.ok, 'CKEditor Native ' + JSON.stringify(ck1));

// 2) English Translated
const en = await run('fillTranslated', { lang: 'en', title: 'Hackers breach European defence contractor' });
check(en.ok && en.title, 'fillTranslated en ' + JSON.stringify(en));
const ck2 = await main(ckSetDataSrc, 'ckSetData', ['native', 'english', '<p>First paragraph of the English source.</p><p>Second paragraph.</p>']);
check(ck2.ok, 'CKEditor English ' + JSON.stringify(ck2));

// 3) German Translated
const de = await run('fillTranslated', { lang: 'de', title: 'Hacker dringen bei europäischem Rüstungsunternehmen ein' });
check(de.ok && de.title, 'fillTranslated de ' + JSON.stringify(de));
const ck3 = await main(ckSetDataSrc, 'ckSetData', ['native', 'german', '<p>Erster Absatz.</p><p>Zweiter Absatz.</p>']);
check(ck3.ok, 'CKEditor German ' + JSON.stringify(ck3));

// 4) Metadata
const meta = await run('fillMetadata', { author: '', authorUnknown: true, authorUnknownText: 'Autor ungenannt', date: '10/10/2026', dateIso: '2026-10-10', dateGb: '10/10/2026' });
check(meta.ok && meta.author === 'button' && meta.authorValue === 'Autor ungenannt', 'Metadata Autor ungenannt per Button: ' + JSON.stringify({ ...meta, structure: undefined }));
check(meta.date && meta.dateValue && !meta.dateInvalid, 'Metadata Datum gesetzt: ' + meta.dateValue + (meta.dateInvalid ? ' (UNGÜLTIG)' : ''));
console.log('   Metadata-Struktur:', JSON.stringify(meta.structure.labels));
const meta2 = await run('fillMetadata', { author: 'Sergiu Example', authorUnknown: false, date: '10/10/2026', dateIso: '2026-10-10', dateGb: '10/10/2026' });
check(meta2.ok && meta2.author === 'text', 'Metadata Autor Person');

// 5) Tags über Angular (ng)
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
await run('selectTab', { group: 'tags', tab: '^\\s*tags\\s*$' });
await page.waitForTimeout(500);
const ngRes = await main(ngSelectTagsSrc, 'ngSelectTags', [uids]);
check(ngRes.ok && ngRes.applied.length === 8, 'ngSelectTags ' + JSON.stringify(ngRes));
await page.waitForTimeout(500);
const chips = (await run('readChips')).chips;
check(['[S]1 Cyber', 'News', 'Nachrichtenseite', 'Deutschland', 'Cyberangriff', 'Ransomware', 'Hackergruppe', 'WB-Cyber'].every((n) => chips.includes(n)), 'Chips nach ng: ' + chips.join(', '));
const wbChildChecked = await page.evaluate(() => [...document.querySelectorAll('mat-tree-node')].filter((n) => /\[WB-C\]/.test(n.textContent)).map((n) => n.querySelector('input')?.checked));
check(wbChildChecked.every((c) => !c), 'WB-Cyber-Untertags nicht ausgewählt (' + wbChildChecked.length + ' sichtbar)');

// 6) Tags per DOM-Klick (zusätzlicher Tag) – prüft den Klick-Fallback gegen den echten Baum
const domRes = await run('applyTags', { paths: ['KriMiSi → Militär → Cyberstreitkräfte'] });
check(domRes.ok && domRes.applied.length === 1 && domRes.chips.includes('Cyberstreitkräfte'), 'applyTags per DOM ' + JSON.stringify({ applied: domRes.applied, failed: domRes.failed }));

// 7) Speichern → POST /api/news im Mock
await run('selectTab', { group: 'native', tab: '^\\s*native\\s*$' });
const save = await run('save', { timeoutMs: 15000 });
check(save.ok && save.success && !save.duplicate, 'save: ' + JSON.stringify({ success: save.success, toasts: save.toasts, sourceAfter: save.sourceAfter }));
const log = await fetch(`${BASE}/__mock/log`).then((r) => r.json());
const post = log.filter((l) => l.method === 'POST' && l.path === '/api/news').pop();
check(!!post, 'POST /api/news aufgezeichnet');
if (post) {
  const body = JSON.parse(post.body);
  console.log('   Payload-Felder:', Object.keys(body).join(', '));
  console.log('   Titel/Autor/Datum/Lang:', body.article_title, '|', body.article_author, '|', body.article_created_at, '|', body.article_language, '| platforms', JSON.stringify(body.article_platforms));
  console.log('   Tags:', JSON.stringify(body.article_tags), '| content:', (body.article_content || '').slice(0, 60), '| de:', (body.article_content_translatedde || '').slice(0, 40), '| en-title:', body.article_title_translateden);
  check(body.article_title === 'Hackers breach European defence contractor' && body.article_author === 'Sergiu Example', 'Payload Titel + Autor');
  check(/^2026-10-(09|10)T/.test(body.article_created_at || ''), 'Payload Datum ISO: ' + body.article_created_at);
  check(Array.isArray(body.article_tags) && uids.every((u) => body.article_tags.includes(u)) && body.article_tags.length === 9, 'Payload Tags = 9 UIDs');
  check((body.article_content || '').includes('First paragraph') && (body.article_content_translatedde || '').includes('Erster Absatz') && (body.article_content_translateden || '').includes('First paragraph'), 'Payload Inhalte in allen drei Reitern');
  check(body.article_title_translatedde === 'Hacker dringen bei europäischem Rüstungsunternehmen ein', 'Payload deutscher Titel');
}
// Nach dem Speichern: Formular leer?
const after = await run('probe');
check(!after.sourceValue && !after.titleValue, 'Formular nach Save geleert (sourceValue="' + after.sourceValue + '")');
console.log('Seitenfehler:', pageErrors.slice(0, 5));
await page.screenshot({ path: '/tmp/' + 'osdp-test.png' });
await browser.close();
console.log(failures ? `\n${failures} Test(s) fehlgeschlagen` : '\nE2E gegen Nachbau bestanden');
process.exit(failures ? 1 : 0);
