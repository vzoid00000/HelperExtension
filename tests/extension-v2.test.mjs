// Tests für v0.2: Extension laden, Seiten ohne Fehler, Filler-Schritte + CKEditor auf
// realistischer OSDP-Fixture, Feed-Parsing, Link-Harvesting.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
const { chromium } = (() => { try { return createRequire(import.meta.url)('playwright'); } catch { return createRequire('/opt/node-tools/node_modules/')('playwright'); } })();

const EXT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const FIX = new URL('./fixtures/', import.meta.url).pathname;
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-ext-'));
let failures = 0;
const check = (cond, msg) => { console.log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) failures++; };

const context = await chromium.launchPersistentContext(userDataDir, {
  headless: true, channel: 'chromium',
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`]
});
let [sw] = context.serviceWorkers();
if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 15000 });
const extId = new URL(sw.url()).host;
check(!!extId, 'Extension geladen: ' + extId);

// 1) App-Seite (v0.6: eine Seite für alle Ansichten) ohne Konsolenfehler
const APP = `chrome-extension://${extId}/src/app/app.html`;
for (const p of ['src/app/app.html']) {
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`chrome-extension://${extId}/${p}`);
  await page.waitForTimeout(900);
  check(errors.length === 0, `${p} ohne Fehler ${errors.length ? JSON.stringify(errors) : ''}`);
  const rows = await page.locator('#sourcesManageTable tbody tr').count();
  check(rows >= 20, `App-Seite zeigt ${rows} Quellen in der Quellen-Verwaltung`);
  await page.close();
}

// 2) Feed-Parsing + Link-Harvesting innerhalb der Extension-Seite (Module importierbar)
{
  const page = await context.newPage();
  await page.goto(APP);
  const r = await page.evaluate(async () => {
    const { parseFeed } = await import('../lib/feeds.js');
    const rss = `<?xml version="1.0"?><rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/"><channel><title>T</title>
      <item><title>Ransomware hits port</title><link>https://ex.com/a?utm_source=x</link><pubDate>Fri, 10 Oct 2026 14:05:00 GMT</pubDate><dc:creator>Jane Doe</dc:creator><description><![CDATA[<p>Attack on <b>port</b> systems.</p>]]></description></item>
      <item><title>Old item</title><link>https://ex.com/old</link><pubDate>Mon, 01 Sep 2026 10:00:00 GMT</pubDate></item>
    </channel></rss>`;
    const atom = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>A</title>
      <entry><title>NATO summit agreed</title><link rel="alternate" href="https://ex.org/n1"/><published>2026-10-11T08:00:00Z</published><author><name>John Smith</name></author><summary>Leaders met.</summary></entry></feed>`;
    const a = parseFeed(rss, { name: 'RSS', category: 'cyber' });
    const b = parseFeed(atom, { name: 'Atom', category: 'krimisi' });
    const doc = new DOMParser().parseFromString(`<html><body>
      <nav><a href="/world">World</a><a href="/tag/x">tag</a></nav>
      <a href="/article/us-sends-weapons-to-ukraine-abc123">US sends weapons to Ukraine, officials say</a>
      <a href="https://apnews.com/article/second-story-with-long-slug-999"><h3>Second story headline here</h3></a>
      <a href="/video/clip-1234567890">Video clip</a>
      <a href="https://other.com/article/foreign-site-story-12345">Foreign</a>
    </body></html>`, 'text/html');
    const links = globalThis.__newsHelper.harvestLinks(doc, { url: 'https://apnews.com/world-news', pattern: 'apnews\\.com/article/' });
    return { a: a.map((i) => ({ ...i, date: i.date?.toISOString() })), b: b.map((i) => ({ ...i, date: i.date?.toISOString() })), links };
  });
  check(r.a.length === 2 && r.a[0].author === 'Jane Doe' && r.a[0].summary.startsWith('Attack on port'), 'RSS geparst: ' + JSON.stringify(r.a[0]));
  check(r.b.length === 1 && r.b[0].url === 'https://ex.org/n1' && r.b[0].author === 'John Smith', 'Atom geparst: ' + JSON.stringify(r.b[0]));
  check(r.links.length === 2 && r.links.every((l) => /apnews\.com\/article\//.test(l.url)), 'Links gesammelt: ' + JSON.stringify(r.links));
  await page.close();
}

// 3) Extractor auf DOMParser-Dokument (ohne Layout)
{
  const page = await context.newPage();
  await page.goto(APP);
  const html = fs.readFileSync(path.join(FIX, 'article.html'), 'utf8');
  const r = await page.evaluate((h) => {
    const doc = new DOMParser().parseFromString(h, 'text/html');
    return globalThis.__newsHelper.extractFrom(doc, { url: 'https://news.example.com/2026/10/10/defence-contractor-breach', layout: false });
  }, html);
  check(r.title.startsWith('Hackers breach') && r.authorRaw === 'Sergiu Example' && r.text.length > 800 && !/Related stories|Subscribe|Getty/.test(r.text), `extractFrom ohne Layout: ${r.text.length} Zeichen, Autor ${r.authorRaw}, canonical ${r.canonicalUrl}`);
  await page.close();
}

// 4) Filler-Schritte + CKEditor (MAIN world) auf OSDP-Fixture
{
  const page = await context.newPage();
  await page.goto('file://' + path.join(FIX, 'osdp-real.html'));
  // Content-Script-Datei in "isolierter" Simulation: hier einfach als Script laden
  await page.addScriptTag({ path: path.join(EXT, 'src/content/osdp-filler.js') });
  const run = (step, data) => page.evaluate(([s, d]) => globalThis.__osdpHelper.run(s, d), [step, data]);

  const probe = await run('probe');
  check(probe.hasEditor && probe.groups.length === 2 && probe.groups[0][0] === 'Native', 'probe: ' + JSON.stringify(probe.groups));

  const native = await run('fillNative', { url: 'https://news.example.com/x', title: 'English title' });
  check(native.ok && native.source && native.title, 'fillNative ' + JSON.stringify(native));

  // CKEditor setData über die ckSetData-Funktion aus dem Driver (hier im selben Kontext)
  const driverSrc = fs.readFileSync(path.join(EXT, 'src/lib/osdp-driver.js'), 'utf8');
  const fnStart = driverSrc.indexOf('async function ckSetData(');
  const fnSrc = driverSrc.slice(fnStart, driverSrc.indexOf('\n}\n', fnStart) + 2);
  const ck = await page.evaluate(([src, tab, html]) => { const f = new Function(src + '; return ckSetData;')(); return f('native', tab, html); }, [fnSrc, '^\\s*native\\s*$', '<p>Para one</p><p>Para two</p>']);
  check(ck.ok && ck.length > 10, 'ckSetData Native ' + JSON.stringify(ck));
  const ckDe = await page.evaluate(([src, tab, html]) => { const f = new Function(src + '; return ckSetData;')(); return f('native', tab, html); }, [fnSrc, 'german', '<p>Absatz eins</p>']);
  check(ckDe.ok, 'ckSetData German ' + JSON.stringify(ckDe));

  const de = await run('fillTranslated', { lang: 'de', title: 'Deutscher Titel' });
  check(de.ok && de.title, 'fillTranslated de ' + JSON.stringify(de));
  const en = await run('fillTranslated', { lang: 'en', title: 'English title' });
  check(en.ok && en.title, 'fillTranslated en ' + JSON.stringify(en));

  const meta = await run('fillMetadata', { author: '', authorUnknown: true, authorUnknownText: 'Autor ungenannt', date: '10.10.2026', dateIso: '2026-10-10' });
  check(meta.ok && meta.author === 'button' && meta.date === true && meta.dateValue === '10.10.2026', 'fillMetadata (lazy Tab, Button) ' + JSON.stringify({ ...meta, structure: undefined }));
  check(meta.structure && meta.structure.labels.includes('Author'), 'Metadata-Struktur erkannt: ' + JSON.stringify(meta.structure.labels));

  const meta2 = await run('fillMetadata', { author: 'Jane Doe', authorUnknown: false, date: '10.10.2026', dateIso: '2026-10-10' });
  check(meta2.ok && meta2.author === 'text', 'fillMetadata Person ' + JSON.stringify({ ...meta2, structure: undefined }));

  const tag = await run('checkTag', { label: 'KriMiSi' });
  check(tag.ok && tag.checked && tag.chips.includes('KriMiSi'), 'checkTag ' + JSON.stringify(tag));

  const readBack = await run('readNative');
  check(readBack.ok && readBack.text.includes('Para one'), 'readNative ' + JSON.stringify(readBack));

  const values = await page.evaluate(() => window.__formValues);
  check(values.article_source === 'https://news.example.com/x' && values.article_title === 'English title' && values.article_title_translatedde === 'Deutscher Titel' && values.article_author === 'Jane Doe' && values.article_date === '10.10.2026' && values.article_content.includes('Para one') && values.article_content_translatedde.includes('Absatz eins'), 'Formularwerte: ' + JSON.stringify(values));

  const extractClick = await run('clickTopButton', { pattern: '^\\s*extract\\s*$' });
  const extracted = await run('waitForExtract', { timeoutMs: 5000 });
  check(extractClick.ok && extracted.ok && extracted.title === 'Extracted title from OSDP', 'Extract-Flow ' + JSON.stringify(extracted));

  const save = await run('save', { timeoutMs: 5000 });
  check(save.ok && save.success && save.toasts.some((t) => t.message === 'Item Added!') && save.spinnerSeen, 'save ' + JSON.stringify({ success: save.success, toasts: save.toasts }));
  const events = await page.evaluate(() => window.__events.map((e) => e[0]));
  check(events.includes('save'), 'Save-Event ausgelöst');
  await page.close();
}

// 5) Zeitplan-Berechnung
{
  const page = await context.newPage();
  await page.goto(APP);
  const r = await page.evaluate(async () => {
    const { nextWeekdayRun } = await import('../background.js');
    const fri = new Date(2026, 9, 9, 9, 0); // Fr 09:00
    return [nextWeekdayRun('08:00', fri)?.toString(), nextWeekdayRun('10:00', fri)?.toString(), nextWeekdayRun('x', fri)];
  });
  check(/Mon Oct 12 2026 08:00/.test(r[0]) && /Fri Oct 09 2026 10:00/.test(r[1]) && r[2] === null, 'nextWeekdayRun: ' + JSON.stringify(r));
  await page.close();
}

await context.close();
fs.rmSync(userDataDir, { recursive: true, force: true });
console.log(failures ? `\n${failures} Test(s) fehlgeschlagen` : '\nAlle Tests bestanden');
process.exit(failures ? 1 : 0);
