// Tests v0.3: Extension-Seiten, Tag-Baum (applyTags, exportTagTree), Verlauf-Helfer, lokaler LLM-Client (Mock)
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { createRequire } from 'node:module';
const { chromium } = (() => { try { return createRequire(import.meta.url)('playwright'); } catch { return createRequire('/opt/node-tools/node_modules/')('playwright'); } })();

const EXT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const FIX = new URL('./fixtures/', import.meta.url).pathname;
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-ext-'));
let failures = 0;
const check = (cond, msg) => { console.log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) failures++; };

// Mock eines OpenAI-kompatiblen Servers (für den lokalen LLM-Client)
const requests = [];
const mock = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    res.setHeader('content-type', 'application/json');
    if (req.url.endsWith('/models')) return res.end(JSON.stringify({ data: [{ id: 'test-model' }] }));
    const parsed = JSON.parse(body || '{}');
    requests.push(parsed);
    if (parsed.response_format?.type === 'json_schema') { res.statusCode = 400; return res.end(JSON.stringify({ error: 'json_schema not supported' })); }
    const wantsJson = /JSON/.test(parsed.messages?.[0]?.content || '');
    const content = wantsJson ? '```json\n{"results":[{"id":0,"category":"cyber","score":8,"reason":"Test"}]}\n```' : 'OK';
    res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content } }] }));
  });
});
await new Promise((r) => mock.listen(0, '127.0.0.1', r));
const mockUrl = `http://127.0.0.1:${mock.address().port}`;

const context = await chromium.launchPersistentContext(userDataDir, {
  headless: true, channel: 'chromium',
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`]
});
let [sw] = context.serviceWorkers();
if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 15000 });
const extId = new URL(sw.url()).host;

// 1) Seiten ohne Fehler
for (const p of ['src/sidepanel/sidepanel.html', 'src/options/options.html', 'src/auto/auto.html']) {
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`chrome-extension://${extId}/${p}`);
  await page.waitForTimeout(900);
  check(errors.length === 0, `${p} ohne Fehler ${errors.length ? JSON.stringify(errors) : ''}`);
  await page.close();
}

// 2) Katalog in der Extension laden + lokaler LLM-Client + Verlauf-Helfer
{
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extId}/src/auto/auto.html`);
  const r = await page.evaluate(async (mockUrl) => {
    const { TagCatalog } = await import('../lib/tag-catalog.js');
    const cat = await TagCatalog.load();
    const { classifyItems } = await import('../lib/classify.js');
    const settings = { llmProvider: 'local', localLlmUrl: mockUrl, localLlmModel: 'test-model' };
    const res = await classifyItems([{ id: 0, title: 'Ransomware hits port', summary: '', sourceName: 'X', sourceCategory: 'cyber' }], settings);
    const { testLocalLlm } = await import('../lib/llm.js');
    const t = await testLocalLlm(settings);
    const { historyStats, filterHistory, historyToMarkdown, historyToCsv, startOfWeek } = await import('../lib/history.js');
    const now = new Date(2026, 9, 14, 10, 0); // Mi
    const list = [
      { id: '1', at: now.getTime() - 3600e3, structure: 'Cyber', wb: 'WB-Cyber', title: 'A', url: 'https://a', summary: 'S' },
      { id: '2', at: now.getTime() - 2 * 86400e3, structure: 'KriMiSi', wb: '', title: 'B', url: 'https://b' },
      { id: '3', at: now.getTime() - 9 * 86400e3, structure: 'KriMiSi', wb: 'WB-KriMiSi', title: 'C', url: 'https://c' }
    ];
    return { catalogSize: cat.byPath.size, classify: res.get(0), local: t, stats: historyStats(list, now), week: filterHistory(list, 'week', now).length, md: historyToMarkdown(list.slice(0, 1)).includes('WB-Cyber'), csv: historyToCsv(list).split('\n').length, weekStart: new Date(startOfWeek(now)).getDay() };
  }, mockUrl);
  check(r.catalogSize === 673, 'Katalog in Extension geladen');
  check(r.classify?.category === 'cyber' && r.classify.score === 8, 'Lokaler LLM-Client: JSON-Fallback nach 400 bei json_schema: ' + JSON.stringify(r.classify));
  check(r.local.models.includes('test-model') && r.local.answer === 'OK', 'Lokaler LLM-Client: Verbindungstest');
  check(r.stats.today === 1 && r.stats.week === 2 && r.stats.wbCyber === 1 && r.stats.wbKrimisi === 0 && r.week === 2 && r.md && r.csv === 4 && r.weekStart === 1, 'Verlauf-Statistik: ' + JSON.stringify(r.stats));
  check(requests.length >= 3 && requests.some((q) => q.response_format?.type === 'json_object'), `Lokaler Client sendete ${requests.length} Anfragen inkl. json_object-Fallback`);
  await page.close();
}

// 3) Tag-Baum: applyTags + exportTagTree auf Fixture
{
  const page = await context.newPage();
  await page.goto('file://' + path.join(FIX, 'osdp-tags.html'));
  await page.addScriptTag({ path: path.join(EXT, 'src/content/osdp-filler.js') });
  const run = (step, data) => page.evaluate(([s, d]) => globalThis.__osdpHelper.run(s, d), [step, data]);

  const paths = [
    'Struktur → [S]1 Cyber',
    'Newsinfo → Dokumententyp → News',
    'Newsinfo → Quellentyp → Nachrichtenseite',
    'Newsinfo → geographische Lokationen → Kontinente und Staaten → Nordamerika → USA',
    'Newsinfo → geographische Lokationen → Kontinente und Staaten → Europa → Ukraine',
    'Cyber → Cyberangriff → Schadsoftware → Ransomware',
    'KriMiSi → Militär → Resilienz',
    'Auftragstags → WB-Cyber',
    'Cyber → Gibtsnicht'
  ];
  const r = await run('applyTags', { paths });
  check(r.applied.length === 8 && r.failed.length === 1 && r.failed[0].path === 'Cyber → Gibtsnicht', `applyTags: ${r.applied.length} gesetzt, ${r.failed.length} fehlgeschlagen (${r.failed[0]?.error})`);
  const clicks = await page.evaluate(() => window.__clicks);
  // Reihenfolge: Eltern (geringere Tiefe) vor Kindern
  check(clicks.map((c) => c[0]).join(',') === '[S]1 Cyber,WB-Cyber,News,Nachrichtenseite,Resilienz,Ransomware,USA,Ukraine', 'Richtige Checkboxen geklickt (Eltern zuerst): ' + clicks.map((c) => c[0]).join(','));
  check(r.chips.includes('Resilienz') && r.chips.length === 8, 'Chips: ' + r.chips.join(', '));
  // Zweiter Aufruf: bereits gesetzte Tags nicht erneut klicken, Untertag von WB-Cyber unberührt
  const r2 = await run('applyTags', { paths: ['Struktur → [S]1 Cyber', 'Cyber → Cyberangriff → APT'] });
  const clicks2 = await page.evaluate(() => window.__clicks);
  check(r2.ok && clicks2.length === 9 && clicks2[8][0] === 'APT', 'Idempotent + neuer Tag APT');
  const wbChild = await page.evaluate(() => [...document.querySelectorAll('mat-tree-node')].filter((n) => n.textContent.includes('[WB-C]1')).map((n) => n.querySelector('input').checked));
  check(wbChild.every((c) => c === false), 'WB-Cyber-Untertag bleibt unausgewählt');

  const exp = await run('exportTagTree', {});
  check(exp.ok && exp.count === 31 && exp.tags.find((t) => t.path === 'Newsinfo → geographische Lokationen → Kontinente und Staaten → Nordamerika → USA')?.tooltip === 'Vereinigte Staaten', `exportTagTree: ${exp.count} Tags, ${exp.expansions} Aufklappungen, Tooltip USA = ${exp.tags.find((t) => t.label === 'USA')?.tooltip}`);
  check(exp.tags.filter((t) => t.label === 'Resilienz').map((t) => t.tooltip).join('|') === 'R1|R2', 'Doppelname Resilienz mit beiden Tooltips');
  check(exp.tags.find((t) => t.label === 'Ransomware')?.checked === true, 'Export zeigt gesetzte Tags');
  await page.close();
}

await context.close();
mock.close();
fs.rmSync(userDataDir, { recursive: true, force: true });
console.log(failures ? `\n${failures} Test(s) fehlgeschlagen` : '\nAlle Tests bestanden');
process.exit(failures ? 1 : 0);
