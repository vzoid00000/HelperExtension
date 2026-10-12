// Test der HAR-Werkzeuge: schwärzen → Nachbau bauen → Server starten → Antworten prüfen
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const WORK = '/tmp/osdp-har-test';
fs.rmSync(WORK, { recursive: true, force: true });
fs.mkdirSync(WORK, { recursive: true });
let failures = 0;
const check = (cond, msg) => { console.log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) failures++; };

const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJub3Zha3YiLCJleHAiOjE3MH0.abcDEF123456_-xyzXYZ7890abcdef';
const entry = (method, url, status, mime, text, extra = {}) => ({
  request: { method, url, headers: [{ name: 'Cookie', value: 'session=abc123' }, { name: 'Authorization', value: 'Bearer ' + jwt }], cookies: [{ name: 'session', value: 'abc123' }], queryString: [], ...extra.request },
  response: { status, headers: [{ name: 'Set-Cookie', value: 'session=abc123; Path=/' }, { name: 'Content-Type', value: mime }], cookies: [], content: { mimeType: mime, text, ...(extra.encoding ? { encoding: extra.encoding } : {}) } }
});
const har = { log: { version: '1.2', creator: { name: 'test' }, entries: [
  entry('GET', 'https://osdp.zentdok.at/', 200, 'text/html', '<!doctype html><html><head><base href="/"><link rel="stylesheet" href="styles.css"></head><body><app-root></app-root><script src="main.js"></script></body></html>'),
  entry('GET', 'https://osdp.zentdok.at/main.js', 200, 'application/javascript', 'const API="https://api.zentdok.at/api"; fetch(API+"/tags"); const self="https://osdp.zentdok.at/assets"; const other="https://osdp.zentdok.atX";'),
  entry('GET', 'https://osdp.zentdok.at/styles.css', 200, 'text/css', 'body{margin:0}'),
  entry('GET', 'https://osdp.zentdok.at/assets/logo.png', 200, 'image/png', Buffer.from('PNGDATA').toString('base64'), { encoding: 'base64' }),
  entry('POST', 'https://api.zentdok.at/api/login', 200, 'application/json', JSON.stringify({ token: jwt, user: 'novakv' }), { request: { postData: { mimeType: 'application/json', text: JSON.stringify({ username: 'novakv', password: 'geheim123' }) } } }),
  entry('GET', 'https://api.zentdok.at/api/tags', 200, 'application/json', JSON.stringify([{ name: 'Struktur', children: [{ name: 'Cyber' }] }])),
  entry('GET', 'https://api.zentdok.at/api/news?query=test', 200, 'application/json', JSON.stringify([{ id: 1 }])),
  entry('POST', 'https://api.zentdok.at/api/news', 201, 'application/json', JSON.stringify({ id: 42 }), { request: { postData: { mimeType: 'application/json', text: JSON.stringify({ article_title: 'T' }) } } }),
  entry('GET', 'https://fonts.gstatic.com/x.woff2', 200, 'font/woff2', Buffer.from('FONT').toString('base64'), { encoding: 'base64' })
] } };
const harFile = path.join(WORK, 'osdp.har');
fs.writeFileSync(harFile, JSON.stringify(har));

// 1) Schwärzen
const redOut = execFileSync('node', [path.join(ROOT, 'tools/redact-har.mjs'), harFile], { encoding: 'utf8' });
const redacted = JSON.parse(fs.readFileSync(path.join(WORK, 'osdp.redacted.har'), 'utf8'));
const txt = JSON.stringify(redacted);
check(!txt.includes('abc123') && !txt.includes(jwt) && !txt.includes('geheim123'), 'Cookies, JWT und Passwort entfernt');
check(redacted.log.entries[4].response.content.text.includes('"token":"REDACTED"') && redacted.log.entries[4].request.postData.text.includes('"password":"REDACTED"'), 'Platzhalter eingesetzt: ' + redacted.log.entries[4].request.postData.text + ' / ' + redacted.log.entries[4].response.content.text);
check(/API-Aufrufe:[\s\S]*POST https:\/\/api\.zentdok\.at\/api\/news/.test(redOut), 'Übersicht der API-Aufrufe ausgegeben');

// 2) Nachbau bauen
const mockDir = path.join(WORK, 'mock');
const buildOut = execFileSync('node', [path.join(ROOT, 'tools/har-to-mock.mjs'), path.join(WORK, 'osdp.redacted.har'), '--out', mockDir, '--mock-origin', 'http://localhost:4399'], { encoding: 'utf8' });
check(/Frontend-Origin: https:\/\/osdp\.zentdok\.at/.test(buildOut), 'Frontend-Origin erkannt');
check(fs.existsSync(path.join(mockDir, 'static/index.html')) && fs.existsSync(path.join(mockDir, 'static/assets/logo.png')) && fs.readFileSync(path.join(mockDir, 'static/assets/logo.png'), 'utf8') === 'PNGDATA', 'Statische Dateien inkl. base64-Binärdatei');
const mainJs = fs.readFileSync(path.join(mockDir, 'static/main.js'), 'utf8');
check(mainJs.includes('http://localhost:4399/api') && mainJs.includes('http://localhost:4399/assets') && mainJs.includes('https://osdp.zentdok.atX'), 'API- und Frontend-Origin im Bundle umgeschrieben, Fremdtreffer unverändert');
const api = JSON.parse(fs.readFileSync(path.join(mockDir, 'api.json'), 'utf8'));
check(api.entries.length === 4 && api.entries.some((e) => e.method === 'POST' && e.path === '/api/news' && e.status === 201), `${api.entries.length} API-Antworten erfasst`);
check(!fs.existsSync(path.join(mockDir, 'static/x.woff2')), 'Fremde Hosts nicht als statische Dateien übernommen');

// 3) Server starten
fs.writeFileSync(path.join(mockDir, 'overrides.json'), JSON.stringify({ 'GET /api/override': { status: 200, body: { ok: true } } }));
const srv = spawn('node', [path.join(ROOT, 'tools/mock-osdp-server.mjs'), '--dir', mockDir, '--port', '4399'], { stdio: ['ignore', 'pipe', 'pipe'] });
let srvOut = '';
srv.stdout.on('data', (d) => (srvOut += d));
srv.stderr.on('data', (d) => (srvOut += d));
await new Promise((r) => setTimeout(r, 800));
try {
  const base = 'http://localhost:4399';
  const idx = await fetch(base + '/').then((r) => r.text());
  check(idx.includes('<app-root>'), 'index.html geliefert');
  const spa = await fetch(base + '/newsEditor', { headers: { accept: 'text/html' } }).then((r) => r.text());
  check(spa.includes('<app-root>'), 'SPA-Fallback');
  const js = await fetch(base + '/main.js');
  check(js.headers.get('content-type').startsWith('text/javascript') && (await js.text()).includes('localhost:4399'), 'main.js mit MIME-Typ');
  const tags = await fetch(base + '/api/tags').then((r) => r.json());
  check(tags[0]?.name === 'Struktur', 'Aufgezeichnete API-Antwort (GET /api/tags)');
  const news = await fetch(base + '/api/news', { method: 'POST', body: '{"article_title":"X"}', headers: { 'content-type': 'application/json' } });
  check(news.status === 201 && (await news.json()).id === 42, 'Aufgezeichnete API-Antwort (POST /api/news, Status 201)');
  const q = await fetch(base + '/api/news?query=test').then((r) => r.json());
  check(Array.isArray(q) && q[0].id === 1, 'Query-Match');
  const unknown = await fetch(base + '/api/unbekannt', { method: 'PUT', body: 'x' });
  check(unknown.status === 200 && (await unknown.text()) === '{}', 'Unbekannter schreibender Aufruf → 200 {}');
  const ov = await fetch(base + '/api/override').then((r) => r.json());
  check(ov.ok === true, 'overrides.json greift');
  const logList = await fetch(base + '/__mock/log').then((r) => r.json());
  check(logList.some((l) => l.method === 'POST' && l.path === '/api/news' && l.body?.includes('article_title')), 'Request-Protokoll unter /__mock/log');
} finally {
  srv.kill();
}
console.log(failures ? `\n${failures} Test(s) fehlgeschlagen` : '\nAlle Werkzeug-Tests bestanden');
if (failures) console.log(srvOut);
process.exit(failures ? 1 : 0);
