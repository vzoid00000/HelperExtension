// Baut aus einem (geschwärzten) HAR-Export einen lokalen Nachbau der OSDP-Oberfläche:
//
//   node tools/har-to-mock.mjs site-dump/osdp.redacted.har [--origin https://osdp.zentdok.at] [--out mock-osdp]
//
// Ergebnis:
//   mock-osdp/static/…     alle statischen Dateien des Frontends (index.html, main.js, styles.css, assets)
//   mock-osdp/api/…        aufgezeichnete API-Antworten
//   mock-osdp/api.json     Zuordnung Methode+Pfad → Antwortdatei
//
// Absolute API-Adressen in den JS-Bundles werden auf den lokalen Server umgeschrieben,
// damit das Frontend gegen die aufgezeichneten Antworten läuft (tools/mock-osdp-server.mjs).

import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const input = args.find((a) => !a.startsWith('--'));
if (!input) {
  console.error('Aufruf: node tools/har-to-mock.mjs <datei.har> [--origin <frontend-origin>] [--out <ordner>] [--mock-origin http://localhost:4300]');
  process.exit(1);
}
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : def;
};
const outDir = path.resolve(opt('--out', 'mock-osdp'));
const mockOrigin = opt('--mock-origin', 'http://localhost:4300');

const har = JSON.parse(fs.readFileSync(input, 'utf8'));
const entries = (har.log?.entries || []).filter((e) => e.request?.url && e.response);

// Frontend-Origin: angegeben oder der Origin, der index.html/HTML geliefert hat, sonst der häufigste
let origin = opt('--origin', '');
if (!origin) {
  const counts = {};
  for (const e of entries) {
    try {
      const u = new URL(e.request.url);
      const mime = e.response.content?.mimeType || '';
      const weight = /text\/html/i.test(mime) ? 50 : 1;
      counts[u.origin] = (counts[u.origin] || 0) + weight;
    } catch {
      /* ignorieren */
    }
  }
  origin = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
}
if (!origin) {
  console.error('Kein Origin erkennbar – bitte --origin angeben.');
  process.exit(1);
}

const staticDir = path.join(outDir, 'static');
const apiDir = path.join(outDir, 'api');
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(staticDir, { recursive: true });
fs.mkdirSync(apiDir, { recursive: true });

const isApi = (e, u) => {
  const mime = e.response.content?.mimeType || '';
  if (e.request.method !== 'GET') return true;
  if (/application\/json|text\/json/i.test(mime)) return true;
  if (/\/api\//i.test(u.pathname)) return true;
  return false;
};

function bodyBuffer(content) {
  if (!content || content.text == null) return Buffer.alloc(0);
  return content.encoding === 'base64' ? Buffer.from(content.text, 'base64') : Buffer.from(content.text, 'utf8');
}

const apiIndex = [];
const apiOrigins = new Set();
let staticCount = 0;
const staticTextFiles = [];
const seenStatic = new Set();

for (const e of entries) {
  let u;
  try {
    u = new URL(e.request.url);
  } catch {
    continue;
  }
  // 304 (aus dem Browser-Cache beantwortet) wird als 200 gespeichert – der Inhalt ist im HAR enthalten.
  const status = e.response.status === 304 ? 200 : e.response.status || 0;
  if (isApi(e, u)) {
    apiOrigins.add(u.origin);
    const slug = `${e.request.method}_${u.pathname.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '') || 'root'}`;
    const n = apiIndex.filter((a) => a.file.startsWith(slug)).length;
    const file = `${slug}${n ? '_' + n : ''}.body`;
    fs.writeFileSync(path.join(apiDir, file), bodyBuffer(e.response.content));
    apiIndex.push({
      method: e.request.method,
      origin: u.origin,
      path: u.pathname,
      query: u.search.replace(/^\?/, ''),
      status,
      contentType: e.response.content?.mimeType || 'application/octet-stream',
      requestBody: e.request.postData?.text ? e.request.postData.text.slice(0, 4000) : undefined,
      file
    });
    continue;
  }
  if (u.origin !== origin || status < 200 || status >= 300) continue;
  let rel = decodeURIComponent(u.pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  if (!path.extname(rel) && /text\/html/i.test(e.response.content?.mimeType || '')) rel = rel.replace(/\/?$/, '') + '/index.html';
  rel = rel.replace(/^\/+/, '');
  if (seenStatic.has(rel)) continue;
  seenStatic.add(rel);
  const target = path.join(staticDir, rel);
  if (!target.startsWith(staticDir)) continue;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, bodyBuffer(e.response.content));
  staticCount++;
  if (/javascript|json|html|css|text/i.test(e.response.content?.mimeType || '')) staticTextFiles.push(target);
}

// API-Origins (und den Frontend-Origin) in Textdateien auf den Mock-Server umschreiben
const rewriteOrigins = [...new Set([...apiOrigins, origin])];
let rewrites = 0;
for (const file of staticTextFiles) {
  let text = fs.readFileSync(file, 'utf8');
  let changed = false;
  for (const o of rewriteOrigins) {
    const escaped = o.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(escaped + '(?=[/"\'`\\s)]|$)', 'g');
    const count = (text.match(re) || []).length;
    if (count) {
      text = text.replace(re, mockOrigin);
      rewrites += count;
      changed = true;
    }
  }
  if (changed) fs.writeFileSync(file, text);
}

// Fehlt die index.html (Aufzeichnung ohne Neuladen), eine Standard-Angular-index.html ergänzen.
if (!seenStatic.has('index.html')) {
  const template = path.resolve(path.dirname(new URL(import.meta.url).pathname), 'mock-osdp-index.html');
  if (fs.existsSync(template)) {
    fs.copyFileSync(template, path.join(staticDir, 'index.html'));
    seenStatic.add('index.html');
    console.log('index.html fehlte im HAR – Standardvorlage (tools/mock-osdp-index.html) eingesetzt.');
  }
}

fs.writeFileSync(path.join(outDir, 'api.json'), JSON.stringify({ origin, apiOrigins: [...apiOrigins], mockOrigin, generatedAt: new Date().toISOString(), entries: apiIndex }, null, 1));

console.log(`Frontend-Origin: ${origin}`);
console.log(`Statische Dateien: ${staticCount} → ${path.relative(process.cwd(), staticDir)}`);
console.log(`API-Antworten: ${apiIndex.length} → ${path.relative(process.cwd(), apiDir)} (Origins: ${[...apiOrigins].join(', ') || '–'})`);
console.log(`Umgeschriebene absolute Adressen in Bundles: ${rewrites}`);
if (!seenStatic.has('index.html')) console.log('⚠ Keine index.html – bitte die Aufzeichnung mit einem vollständigen Neuladen der Seite (F5) beginnen.');
console.log('\nAPI-Aufrufe:');
for (const a of apiIndex) console.log(`  ${a.method} ${a.path}${a.query ? '?' + a.query : ''} → ${a.status} ${a.contentType}`);
console.log(`\nStarten: node tools/mock-osdp-server.mjs --dir ${path.relative(process.cwd(), outDir)}`);
