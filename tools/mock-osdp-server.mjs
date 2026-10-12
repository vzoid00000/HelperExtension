// Lokaler Nachbau-Server für die OSDP-Oberfläche (aus tools/har-to-mock.mjs).
//
//   node tools/mock-osdp-server.mjs [--dir mock-osdp] [--port 4300]
//
// - liefert die statischen Frontend-Dateien (SPA-Fallback auf index.html)
// - beantwortet API-Aufrufe mit den aufgezeichneten Antworten (Methode + Pfad, bei
//   mehreren Treffern passt die Query-String-Übereinstimmung)
// - unbekannte POST/PUT/PATCH/DELETE-Aufrufe werden protokolliert und mit 200 {} beantwortet
// - Datei mock-osdp/overrides.json (optional) überschreibt Antworten:
//   { "POST /api/news": { "status": 200, "body": { "id": 123 } } }
//
// Danach in den Einstellungen der Extension: URL-Muster des OSDP-Tabs = http://localhost:4300/*

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : def;
};
const dir = path.resolve(opt('--dir', 'mock-osdp'));
const port = Number(opt('--port', 4300));
const staticDir = path.join(dir, 'static');
const apiDir = path.join(dir, 'api');

if (!fs.existsSync(path.join(dir, 'api.json'))) {
  console.error(`Kein Nachbau in ${dir} gefunden – zuerst: node tools/har-to-mock.mjs <datei.har>`);
  process.exit(1);
}
const index = JSON.parse(fs.readFileSync(path.join(dir, 'api.json'), 'utf8'));
const overridesFile = path.join(dir, 'overrides.json');
const overrides = fs.existsSync(overridesFile) ? JSON.parse(fs.readFileSync(overridesFile, 'utf8')) : {};

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json',
  '.txt': 'text/plain; charset=utf-8'
};

const requestLog = [];

function findApi(method, pathname, query) {
  const key = `${method} ${pathname}`;
  if (overrides[key]) return { override: overrides[key] };
  const candidates = index.entries.filter((e) => e.method === method && e.path === pathname);
  if (!candidates.length) return null;
  return candidates.find((e) => e.query === query) || candidates[0];
}

const server = http.createServer((req, res) => {
  const u = new URL(req.url, `http://localhost:${port}`);
  const method = req.method.toUpperCase();
  // Diagnose: /__mock/log liefert die letzten Aufrufe (praktisch für Tests)
  if (u.pathname === '/__mock/log') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(requestLog));
    return;
  }
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const hit = findApi(method, u.pathname, u.search.replace(/^\?/, ''));
    if (hit) {
      if (hit.override) {
        const o = hit.override;
        res.writeHead(o.status || 200, { 'content-type': 'application/json; charset=utf-8' });
        res.end(typeof o.body === 'string' ? o.body : JSON.stringify(o.body ?? {}));
      } else {
        const status = hit.status === 304 ? 200 : hit.status || 200;
        res.writeHead(status, { 'content-type': hit.contentType });
        res.end(fs.readFileSync(path.join(apiDir, hit.file)));
      }
      log(method, u, hit.override ? 'override' : `aufgezeichnet (${hit.file})`, body);
      return;
    }
    // Unbekannter API-Aufruf per GET: 404 als JSON (kein SPA-Fallback), damit das Frontend sauber reagiert
    if (/^\/api\//.test(u.pathname) && (method === 'GET' || method === 'HEAD')) {
      res.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
      res.end('{"error":"nicht aufgezeichnet"}');
      log(method, u, 'unbekannter API-Aufruf → 404');
      return;
    }
    if (method === 'GET' || method === 'HEAD') {
      let rel = decodeURIComponent(u.pathname).replace(/^\/+/, '');
      if (!rel || rel.endsWith('/')) rel += 'index.html';
      const file = path.join(staticDir, rel);
      if (file.startsWith(staticDir) && fs.existsSync(file) && fs.statSync(file).isFile()) {
        res.writeHead(200, { 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
        res.end(method === 'HEAD' ? undefined : fs.readFileSync(file));
        return;
      }
      const accept = req.headers.accept || '';
      if (/text\/html/.test(accept) || !path.extname(rel)) {
        const indexFile = path.join(staticDir, 'index.html');
        if (fs.existsSync(indexFile)) {
          res.writeHead(200, { 'content-type': MIME['.html'] });
          res.end(fs.readFileSync(indexFile));
          log(method, u, 'SPA-Fallback index.html');
          return;
        }
      }
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('not found');
      log(method, u, '404');
      return;
    }
    // Unbekannter schreibender Aufruf
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    res.end('{}');
    log(method, u, 'unbekannt → 200 {}', body);
  });
});

function log(method, u, what, body) {
  const line = `${new Date().toISOString().slice(11, 19)} ${method} ${u.pathname}${u.search} → ${what}`;
  console.log(line);
  if (body) console.log('    Body: ' + body.slice(0, 500).replace(/\n/g, ' '));
  requestLog.push({ at: Date.now(), method, path: u.pathname, query: u.search, what, body: body ? body.slice(0, 20000) : undefined });
  if (requestLog.length > 500) requestLog.shift();
}

server.listen(port, '127.0.0.1', () => {
  console.log(`OSDP-Nachbau läuft: http://localhost:${port}/#/newsEditor  (Ordner ${dir}, ${index.entries.length} API-Antworten)`);
  console.log('Extension-Einstellung „URL-Muster des OSDP-Tabs“: http://localhost:' + port + '/*');
});
