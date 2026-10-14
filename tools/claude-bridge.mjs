// Claude-Code-Brücke: lokaler Server, der Anfragen der Extension an die Claude-Code-CLI
// (`claude -p`, angemeldet mit dem eigenen claude.ai-Konto) weiterreicht. Dadurch läuft
// Relevanzprüfung, Tagging und Übersetzung über das Abo-Kontingent statt über API-Tokens.
//
//   node tools/claude-bridge.mjs [--port 4310] [--model opus] [--effort medium] [--claude <pfad>] [--parallel 2]
//                               [--token <t> | --token-file <datei>] [--host 127.0.0.1]
//   Zugriff von außen (Tunnel): Token Pflicht, siehe README „Brücke von der Arbeit aus nutzen“.
//
// Schnittstelle (OpenAI-kompatibel, wie sie die Extension unter „Lokaler Server“ erwartet):
//   GET  /v1/models
//   POST /v1/chat/completions   { model?, messages: [{role, content}], response_format?, max_tokens? }
//   GET  /__bridge/status       Diagnose: Konfiguration, Zähler, letzte Fehler
//
// Erreicht das Abo-Kontingent sein Limit, antwortet die Brücke mit HTTP 429 und
// {"error": {"message": "…", "retry_at": "<ISO-Zeit, falls bekannt>"}}; die Extension hält dann an.
//
// Voraussetzungen: Node ≥ 20, Claude Code installiert (Windows: `irm https://claude.ai/install.ps1 | iex`
// in PowerShell, sonst `npm install -g @anthropic-ai/claude-code`) und mit dem claude.ai-Abo
// angemeldet (`claude auth login`, Pro/Max nötig). Es darf KEIN ANTHROPIC_API_KEY gesetzt sein,
// sonst würde Claude Code über die API abrechnen – die Brücke entfernt die Variable für den Aufruf.

import http from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : def;
};
/**
 * Unter Windows liegt Claude Code je nach Installation als claude.exe (nativer Installer,
 * %USERPROFILE%\.local\bin) oder als claude.cmd (npm) vor. Eine .exe wird direkt gestartet,
 * eine .cmd braucht die Shell (cmd.exe) und selbst gesetzte Anführungszeichen.
 */
function resolveClaudeBin(name) {
  if (process.platform !== 'win32' || /[\\/]/.test(name)) return name;
  const candidates = [];
  try {
    candidates.push(...execFileSync('where.exe', [name], { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] })
      .split(/\r?\n/).map((s) => s.trim()).filter(Boolean));
  } catch {
    /* nicht im PATH */
  }
  // Bekannte Installationsorte, falls der PATH (noch) nicht stimmt
  const home = process.env.USERPROFILE || os.homedir();
  candidates.push(path.join(home, '.local', 'bin', `${name}.exe`));
  if (process.env.APPDATA) candidates.push(path.join(process.env.APPDATA, 'npm', `${name}.cmd`));
  const existing = candidates.filter((p) => { try { return fs.statSync(p).isFile(); } catch { return false; } });
  return existing.find((p) => /\.exe$/i.test(p)) || existing[0] || name;
}

const PORT = Number(opt('--port', process.env.BRIDGE_PORT || 4310));
const DEFAULT_MODEL = opt('--model', process.env.BRIDGE_MODEL || 'opus');
const EFFORT = opt('--effort', process.env.BRIDGE_EFFORT || 'medium');
const CLAUDE_BIN = resolveClaudeBin(opt('--claude', process.env.CLAUDE_BIN || 'claude'));
const PARALLEL = Math.max(1, Number(opt('--parallel', process.env.BRIDGE_PARALLEL || 2)));
const TIMEOUT_MS = Number(opt('--timeout', 600)) * 1000;
const VERBOSE = args.includes('--verbose');
// Erreichbarkeit: Standard nur localhost. --host 0.0.0.0 öffnet die Brücke im Netz (dann Token Pflicht).
const HOST = opt('--host', process.env.BRIDGE_HOST || '127.0.0.1');
// Zugangs-Token (Pflicht für Zugriff von außen, z. B. über einen Tunnel): --token <t>, BRIDGE_TOKEN
// oder --token-file <datei> (wird beim ersten Start mit einem Zufallswert angelegt).
const TOKEN = loadToken();

function loadToken() {
  const direct = opt('--token', process.env.BRIDGE_TOKEN || '');
  if (direct) return String(direct).trim();
  const file = opt('--token-file', '');
  if (!file) return '';
  try {
    const existing = fs.readFileSync(file, 'utf8').trim();
    if (existing) return existing;
  } catch {
    /* Datei fehlt → anlegen */
  }
  const fresh = crypto.randomBytes(24).toString('base64url');
  fs.writeFileSync(file, fresh + '\n', { mode: 0o600 });
  console.log(`Neuer Zugangs-Token erzeugt und in ${file} gespeichert.`);
  return fresh;
}

/** Bearer-Token prüfen (zeitkonstanter Vergleich). Ohne konfigurierten Token ist alles erlaubt (nur localhost). */
function authorized(req) {
  if (!TOKEN) return true;
  const m = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '');
  if (!m) return false;
  const a = Buffer.from(m[1].trim());
  const b = Buffer.from(TOKEN);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const stats = { started: new Date().toISOString(), requests: 0, ok: 0, failed: 0, rateLimited: 0, lastErrors: [], lastUsage: null, totalCostUsd: 0 };
let rateLimitUntil = null; // ISO-Zeit, bis zu der Anfragen sofort mit 429 beantwortet werden

// ------------------------------------------------------------ Warteschlange --
let running = 0;
const queue = [];
function schedule(task) {
  return new Promise((resolve, reject) => {
    queue.push({ task, resolve, reject });
    pump();
  });
}
function pump() {
  while (running < PARALLEL && queue.length) {
    const { task, resolve, reject } = queue.shift();
    running++;
    task().then(resolve, reject).finally(() => {
      running--;
      pump();
    });
  }
}

// --------------------------------------------------------------- Claude CLI --
// Meldungen von Claude Code bei erschöpftem Kontingent, z. B.
//   "You've hit your session limit · resets 3:45pm", "You've hit your weekly limit · resets Mon 12:00am",
//   "Claude AI usage limit reached|1760356800", "You've hit your monthly spend limit", 429 "rate limit"
const LIMIT_RE = /hit your .*limit|usage limit|rate limit|limit reached|out of (extra )?usage|too many requests|overloaded|resets? (at|in)\b|quota/i;
const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function parseResetTime(text) {
  const epoch = /\|(\d{9,11})\b/.exec(text);
  if (epoch) return new Date(Number(epoch[1]) * 1000).toISOString();
  const iso = /(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?)/.exec(text);
  if (iso) return new Date(iso[1]).toISOString();
  const clock = /resets?\s+(?:at\s+|um\s+)?(?:(sun|mon|tue|wed|thu|fri|sat)[a-z]*\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i.exec(text);
  if (clock) {
    const d = new Date();
    let h = Number(clock[2]);
    if (clock[4]) {
      if (/pm/i.test(clock[4]) && h < 12) h += 12;
      if (/am/i.test(clock[4]) && h === 12) h = 0;
    }
    d.setHours(h, Number(clock[3] || 0), 0, 0);
    if (clock[1]) {
      const want = WEEKDAYS.indexOf(clock[1].toLowerCase());
      while (d.getDay() !== want || d < new Date()) d.setDate(d.getDate() + 1);
    } else if (d < new Date()) d.setDate(d.getDate() + 1);
    return d.toISOString();
  }
  return null;
}

/** Beim Start prüfen, ob Claude Code mit dem claude.ai-Konto angemeldet ist. */
function checkAuth() {
  return new Promise((resolve) => {
    // `claude auth status` liefert standardmäßig JSON ({ loggedIn, authMethod, … })
    const child = spawnClaude(['auth', 'status']);
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('error', (e) => resolve({ ok: false, message: `Claude Code nicht gefunden (${CLAUDE_BIN}): ${e.message}` }));
    child.on('close', (code) => {
      let info = null;
      try {
        info = JSON.parse(out.trim());
      } catch {
        /* Textausgabe */
      }
      const text = `${out}\n${err}`.trim();
      const method = info?.authMethod || (/claude\.ai/i.test(text) ? 'claude.ai' : /api[_ ]?key/i.test(text) ? 'api_key' : '');
      const loggedIn = info ? info.loggedIn !== false && code === 0 : code === 0 && !/not logged in|nicht angemeldet/i.test(text);
      resolve({ ok: loggedIn, method, message: text.split('\n')[0].slice(0, 200), raw: info });
    });
  });
}

/**
 * Führt `claude -p` aus. System-Prompt und Nutzertext werden über stdin übergeben
 * (keine Probleme mit Argumentlängen/Anführungszeichen unter Windows).
 */
const WORK_DIR = path.join(os.tmpdir(), 'osdp-claude-bridge');
fs.mkdirSync(WORK_DIR, { recursive: true });

/** Umgebung für Claude Code: nie über die API abrechnen, immer das Abo-Login verwenden. */
function claudeEnv() {
  const env = { ...process.env };
  for (const k of ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX', 'CLAUDE_CODE_USE_FOUNDRY', 'ANTHROPIC_MODEL']) delete env[k];
  env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = '1';
  env.CLAUDE_CODE_SKIP_PROMPT_HISTORY = '1';
  // Unbeaufsichtigter Betrieb: bei erschöpftem Kontingent (429) sofort abbrechen statt lange zu warten
  env.CLAUDE_CODE_RETRY_WATCHDOG = '1';
  return env;
}

/** Nur für claude.cmd über die Shell: Argumente müssen selbst in Anführungszeichen. */
function winQuote(arg) {
  if (arg === '') return '""';
  return /[\s"]/.test(arg) ? `"${arg.replace(/"/g, '\\"')}"` : arg;
}

// Shell nur, wenn Claude Code als Skript (claude.cmd/.bat) vorliegt; claude.exe läuft direkt.
const USE_SHELL = process.platform === 'win32' && !/\.exe$/i.test(CLAUDE_BIN);

function spawnClaude(cliArgs, { input } = {}) {
  const child = spawn(CLAUDE_BIN, USE_SHELL ? cliArgs.map(winQuote) : cliArgs, {
    env: claudeEnv(),
    cwd: WORK_DIR,
    shell: USE_SHELL,
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe']
  });
  child.stdin.on('error', () => {});
  if (input !== undefined) child.stdin.end(input);
  else child.stdin.end();
  return child;
}

/**
 * Führt `claude -p` aus. Der System-Prompt geht über eine temporäre Datei (--system-prompt-file,
 * Argumentlängen-Grenze unter Windows), der Nutzertext über stdin.
 * Werkzeuge sind abgeschaltet (--tools "" / --disallowedTools "*"), keine Sitzung, kein CLAUDE.md.
 */
function runClaude({ system, user, model }) {
  return new Promise((resolve, reject) => {
    const systemFile = path.join(WORK_DIR, `system-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.txt`);
    fs.writeFileSync(systemFile, system || 'Du bist ein präziser Assistent. Antworte nur mit dem Ergebnis.', 'utf8');
    const cliArgs = [
      '-p',
      '--output-format', 'json',
      '--model', model || DEFAULT_MODEL,
      '--system-prompt-file', systemFile,
      '--max-turns', '1',
      '--tools', '',
      '--disallowedTools', '*',
      '--permission-mode', 'dontAsk',
      '--safe-mode',
      '--no-session-persistence'
    ];
    if (EFFORT) cliArgs.push('--effort', EFFORT);
    const prompt = user;

    const child = spawnClaude(cliArgs, { input: prompt });
    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Claude Code hat nach ${TIMEOUT_MS / 1000}s nicht geantwortet`));
    }, TIMEOUT_MS);
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(new Error(`Claude Code konnte nicht gestartet werden (${CLAUDE_BIN}): ${e.message}. Ist Claude Code installiert und im PATH?`));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      fs.rm(systemFile, { force: true }, () => {});
      resolve({ code, out, err });
    });
  });
}

function interpret({ code, out, err }) {
  let data = null;
  try {
    data = JSON.parse(out.trim());
  } catch {
    // Bei stream/mehrzeiliger Ausgabe: letzte JSON-Zeile mit "result"
    const lines = out.trim().split('\n').filter((l) => l.trim().startsWith('{'));
    for (const l of lines.reverse()) {
      try {
        const j = JSON.parse(l);
        if (j && (j.result !== undefined || j.type === 'result')) {
          data = j;
          break;
        }
      } catch {
        /* weiter */
      }
    }
  }
  const errors = Array.isArray(data?.errors) ? data.errors.join('\n') : '';
  const text = data ? String(data.result ?? '') : out.trim();
  const errorText = `${data?.is_error ? text : ''} ${errors} ${err}`.trim();
  if ((data && data.is_error) || (code !== 0 && !data)) {
    const combined = `${text}\n${errors}\n${err}`.trim();
    if (LIMIT_RE.test(combined)) {
      const retryAt = parseResetTime(combined);
      const e = new Error(`Claude-Abo: Nutzungslimit erreicht.${retryAt ? ' Wieder verfügbar ab ' + new Date(retryAt).toLocaleString('de-AT') + '.' : ' Bitte später erneut versuchen.'} (${combined.split('\n')[0].slice(0, 160)})`);
      e.rateLimited = true;
      e.retryAt = retryAt;
      throw e;
    }
    throw new Error(`Claude Code Fehler (Exit ${code}): ${(errorText || combined || 'keine Ausgabe').slice(0, 500)}`);
  }
  if (!text) throw new Error(`Claude Code lieferte keine Antwort (Exit ${code}). stderr: ${err.slice(0, 300)}`);
  return { text, usage: data?.usage || null, costUsd: data?.total_cost_usd ?? null, sessionId: data?.session_id || null, durationMs: data?.duration_ms ?? null };
}

// --------------------------------------------------------------------- HTTP --
function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*' });
  res.end(JSON.stringify(body));
}

function buildPrompts(body) {
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const content = (m) => (typeof m.content === 'string' ? m.content : (m.content || []).map((c) => c.text || '').join('\n'));
  let system = messages.filter((m) => m.role === 'system').map(content).join('\n\n');
  const user = messages.filter((m) => m.role !== 'system').map((m) => (m.role === 'assistant' ? `[Vorherige Antwort]\n${content(m)}` : content(m))).join('\n\n');
  const rf = body.response_format;
  if (rf && (rf.type === 'json_schema' || rf.type === 'json_object')) {
    const schema = rf.json_schema?.schema || rf.schema;
    system += `\n\nANTWORTFORMAT: Antworte ausschließlich mit einem einzigen gültigen JSON-Objekt – ohne Markdown, ohne Codeblock, ohne Text davor oder danach.${schema ? ' Es muss diesem JSON-Schema entsprechen:\n' + JSON.stringify(schema) : ''}`;
  }
  return { system: system.trim(), user: user.trim() };
}

const server = http.createServer((req, res) => {
  const u = new URL(req.url, `http://localhost:${PORT}`);
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS' });
    return res.end();
  }
  if (!authorized(req)) {
    stats.unauthorized = (stats.unauthorized || 0) + 1;
    console.log(`${new Date().toISOString().slice(11, 19)} ABGELEHNT ${req.method} ${u.pathname} von ${req.socket.remoteAddress} (Token fehlt oder falsch)`);
    return json(res, 401, { error: { message: 'Zugangs-Token fehlt oder ist falsch – in den Extension-Einstellungen unter „Lokaler Server“ als API-Key eintragen.', type: 'unauthorized' } });
  }
  if (req.method === 'GET' && /\/models$/.test(u.pathname)) {
    return json(res, 200, { object: 'list', data: ['opus', 'sonnet', 'haiku', DEFAULT_MODEL].filter((v, i, a) => a.indexOf(v) === i).map((id) => ({ id, object: 'model', owned_by: 'claude-code' })) });
  }
  if (req.method === 'GET' && u.pathname === '/__bridge/status') {
    return json(res, 200, { ...stats, model: DEFAULT_MODEL, effort: EFFORT, claude: CLAUDE_BIN, parallel: PARALLEL, queue: queue.length, running, rateLimitUntil });
  }
  if (req.method === 'POST' && /\/chat\/completions$/.test(u.pathname)) {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', async () => {
      stats.requests++;
      let body;
      try {
        body = JSON.parse(raw || '{}');
      } catch {
        return json(res, 400, { error: { message: 'ungültiges JSON' } });
      }
      if (rateLimitUntil && new Date(rateLimitUntil) > new Date()) {
        stats.rateLimited++;
        return json(res, 429, { error: { message: `Claude-Abo: Nutzungslimit erreicht. Wieder verfügbar ab ${new Date(rateLimitUntil).toLocaleString('de-AT')}.`, retry_at: rateLimitUntil, type: 'rate_limit' } });
      }
      const { system, user } = buildPrompts(body);
      if (!user) return json(res, 400, { error: { message: 'keine Nutzernachricht' } });
      const model = body.model && body.model !== 'default' ? body.model : DEFAULT_MODEL;
      const started = Date.now();
      try {
        const result = await schedule(() => runClaude({ system, user, model }).then(interpret));
        stats.ok++;
        stats.lastUsage = result.usage;
        if (typeof result.costUsd === 'number') stats.totalCostUsd += result.costUsd;
        console.log(`${new Date().toISOString().slice(11, 19)} ok   ${model} ${(system.length + user.length).toLocaleString('de-AT')} Zeichen → ${result.text.length} Zeichen in ${((Date.now() - started) / 1000).toFixed(1)}s`);
        if (VERBOSE) console.log('   ' + result.text.slice(0, 200).replace(/\n/g, ' '));
        return json(res, 200, {
          id: `bridge-${Date.now()}`,
          object: 'chat.completion',
          model,
          choices: [{ index: 0, message: { role: 'assistant', content: result.text }, finish_reason: 'stop' }],
          usage: result.usage || {}
        });
      } catch (e) {
        if (e.rateLimited) {
          stats.rateLimited++;
          const until = e.retryAt && new Date(e.retryAt) > new Date() ? e.retryAt : new Date(Date.now() + 10 * 60 * 1000).toISOString();
          rateLimitUntil = until;
          console.log(`${new Date().toISOString().slice(11, 19)} LIMIT ${e.message}`);
          return json(res, 429, { error: { message: e.message, retry_at: e.retryAt, type: 'rate_limit' } });
        }
        stats.failed++;
        stats.lastErrors.unshift({ at: new Date().toISOString(), message: e.message });
        stats.lastErrors.length = Math.min(stats.lastErrors.length, 10);
        console.log(`${new Date().toISOString().slice(11, 19)} FEHLER ${e.message}`);
        return json(res, 500, { error: { message: e.message } });
      }
    });
    return;
  }
  json(res, 404, { error: { message: 'unbekannter Pfad' } });
});

if (HOST !== '127.0.0.1' && HOST !== 'localhost' && !TOKEN) {
  console.error(`Abbruch: --host ${HOST} macht die Brücke im Netz erreichbar – dafür ist ein Zugangs-Token Pflicht (--token, BRIDGE_TOKEN oder --token-file).`);
  process.exit(1);
}

server.listen(PORT, HOST, async () => {
  console.log(`Claude-Code-Brücke läuft: http://localhost:${PORT}/v1  (Modell ${DEFAULT_MODEL}, Effort ${EFFORT}, max. ${PARALLEL} parallel${HOST !== '127.0.0.1' ? ', Host ' + HOST : ''})`);
  if (TOKEN) console.log(`Zugangs-Token aktiv – in der Extension als API-Key unter „Lokaler Server“ eintragen: ${TOKEN}`);
  console.log('Extension-Einstellungen: Anbieter „Lokaler Server“, URL http://localhost:' + PORT + '/v1, Modell ' + DEFAULT_MODEL);
  console.log('Status: http://localhost:' + PORT + '/__bridge/status');
  console.log(`Claude Code: ${CLAUDE_BIN}${USE_SHELL ? ' (über cmd.exe)' : ''}`);
  if (!args.includes('--skip-auth-check')) {
    const auth = await checkAuth();
    stats.auth = auth;
    if (!auth.ok) console.log(`⚠ Claude Code meldet keine Anmeldung: ${auth.message}\n  Bitte einmal „claude auth login“ ausführen (claude.ai-Konto mit Pro/Max) und die Brücke neu starten.`);
    else if (auth.method && auth.method !== 'claude.ai') console.log(`⚠ Claude Code ist mit „${auth.method}“ angemeldet, nicht mit dem claude.ai-Abo – Anfragen würden über die API abgerechnet.`);
    else console.log(`Anmeldung: ${auth.method || 'ok'} – Abo-Kontingent wird verwendet.`);
  }
});
