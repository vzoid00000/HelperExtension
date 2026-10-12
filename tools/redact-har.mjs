// Entfernt Zugangsdaten aus einem HAR-Export, bevor er ins Repository kommt.
//
//   node tools/redact-har.mjs site-dump/osdp.har            → site-dump/osdp.redacted.har
//   node tools/redact-har.mjs site-dump/osdp.har out.har
//
// Entfernt/ersetzt: Cookie- und Set-Cookie-Header, Authorization, X-XSRF-/CSRF-Token,
// API-Keys in Headern, JWT-ähnliche Strings überall, Passwort-Felder in Request-Bodies,
// Token-Parameter in URLs. Die Struktur bleibt erhalten, damit der Nachbau funktioniert.

import fs from 'node:fs';
import path from 'node:path';

const input = process.argv[2];
if (!input) {
  console.error('Aufruf: node tools/redact-har.mjs <datei.har> [ausgabe.har]');
  process.exit(1);
}
const output = process.argv[3] || input.replace(/(\.redacted)?\.har$/i, '') + '.redacted.har';

const SENSITIVE_HEADERS = /^(cookie|set-cookie|authorization|proxy-authorization|x-xsrf-token|x-csrf-token|x-api-key|api-key|x-auth-token|x-access-token)$/i;
const SENSITIVE_PARAMS = /^(token|access_token|refresh_token|id_token|apikey|api_key|key|session|sessionid|sid|auth|code)$/i;
const JWT_RE = /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g;
const PASSWORD_KEY_RE = /("?(password|passwd|pwd|secret|client_secret|refresh_token|access_token|id_token|token)"?\s*[:=]\s*")([^"]*)(")/gi;
const FORM_PASSWORD_RE = /((?:^|&)(?:password|passwd|pwd|token|access_token)=)[^&]*/gi;

const stats = { headers: 0, cookies: 0, jwt: 0, params: 0, bodies: 0 };

function redactText(s) {
  if (typeof s !== 'string' || !s) return s;
  let out = s.replace(JWT_RE, () => {
    stats.jwt++;
    return 'REDACTED.JWT.TOKEN';
  });
  out = out.replace(PASSWORD_KEY_RE, (m, pre, key, val, post) => {
    if (!val) return m;
    stats.bodies++;
    return `${pre}REDACTED${post}`;
  });
  out = out.replace(FORM_PASSWORD_RE, (m, pre) => {
    stats.bodies++;
    return `${pre}REDACTED`;
  });
  return out;
}

function redactUrl(url) {
  try {
    const u = new URL(url);
    for (const k of [...u.searchParams.keys()]) {
      if (SENSITIVE_PARAMS.test(k)) {
        u.searchParams.set(k, 'REDACTED');
        stats.params++;
      }
    }
    return redactText(u.href);
  } catch {
    return redactText(url);
  }
}

function redactHeaders(list) {
  if (!Array.isArray(list)) return list;
  return list.map((h) => {
    if (SENSITIVE_HEADERS.test(h.name || '')) {
      stats.headers++;
      return { ...h, value: 'REDACTED' };
    }
    return { ...h, value: redactText(h.value) };
  });
}

function redactCookies(list) {
  if (!Array.isArray(list)) return list;
  stats.cookies += list.length;
  return list.map((c) => ({ ...c, value: 'REDACTED' }));
}

const har = JSON.parse(fs.readFileSync(input, 'utf8'));
for (const e of har.log?.entries || []) {
  const req = e.request || {};
  req.url = redactUrl(req.url || '');
  req.headers = redactHeaders(req.headers);
  req.cookies = redactCookies(req.cookies);
  if (Array.isArray(req.queryString)) {
    req.queryString = req.queryString.map((q) => (SENSITIVE_PARAMS.test(q.name || '') ? { ...q, value: 'REDACTED' } : { ...q, value: redactText(q.value) }));
  }
  if (req.postData) {
    if (req.postData.text) req.postData.text = redactText(req.postData.text);
    if (Array.isArray(req.postData.params)) {
      req.postData.params = req.postData.params.map((p) => (/pass|token|secret/i.test(p.name || '') ? { ...p, value: 'REDACTED' } : p));
    }
  }
  const res = e.response || {};
  res.headers = redactHeaders(res.headers);
  res.cookies = redactCookies(res.cookies);
  if (res.content && res.content.text && !res.content.encoding) {
    // Nur Textinhalte (JSON/HTML/JS) prüfen; base64-kodierte Binärdaten bleiben unverändert.
    res.content.text = redactText(res.content.text);
  }
  if (res.redirectURL) res.redirectURL = redactUrl(res.redirectURL);
}
if (har.log?.creator) har.log.creator = { ...har.log.creator, comment: 'redacted by tools/redact-har.mjs' };

fs.writeFileSync(output, JSON.stringify(har));

// Übersicht der enthaltenen Hosts und API-Aufrufe
const hosts = {};
const apis = new Set();
for (const e of har.log?.entries || []) {
  try {
    const u = new URL(e.request.url);
    hosts[u.origin] = (hosts[u.origin] || 0) + 1;
    const mime = e.response?.content?.mimeType || '';
    if (/json/i.test(mime) || e.request.method !== 'GET') apis.add(`${e.request.method} ${u.origin}${u.pathname}`);
  } catch {
    /* ignorieren */
  }
}
console.log(`Geschrieben: ${path.relative(process.cwd(), output)} (${(fs.statSync(output).size / 1024 / 1024).toFixed(1)} MB)`);
console.log(`Entfernt: ${stats.headers} Header, ${stats.cookies} Cookies, ${stats.jwt} JWT-Strings, ${stats.params} URL-Parameter, ${stats.bodies} Body-Felder`);
console.log('Hosts:', Object.entries(hosts).map(([h, n]) => `${h} (${n})`).join(', '));
console.log('API-Aufrufe:');
for (const a of [...apis].sort()) console.log('  ' + a);
console.log('\nBitte die Datei vor dem Commit noch einmal selbst durchsehen (z. B. Suche nach dem eigenen Benutzernamen oder Passwort).');
