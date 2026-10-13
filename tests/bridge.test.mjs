// Test der Claude-Code-Brücke mit einer CLI-Attrappe (tests/fake-claude.mjs)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
let failures = 0;
const check = (cond, msg) => { console.log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) failures++; };

const PORT = 4399 + Math.floor(Math.random() * 100);
const logFile = path.join(process.env.TMPDIR || '/tmp', `fake-claude-${PORT}.log`);
fs.rmSync(logFile, { force: true });
// Attrappe als "claude"-Binary: ein Wrapper-Skript, das node mit fake-claude.mjs startet
const wrapper = path.join(process.env.TMPDIR || '/tmp', `fake-claude-${PORT}.sh`);
fs.writeFileSync(wrapper, `#!/bin/sh\nexec node "${ROOT}/tests/fake-claude.mjs" "$@"\n`, { mode: 0o755 });

const srv = spawn('node', [path.join(ROOT, 'tools/claude-bridge.mjs'), '--port', String(PORT), '--model', 'opus', '--claude', wrapper, '--effort', 'medium'], {
  env: { ...process.env, ANTHROPIC_API_KEY: 'sk-should-be-removed', FAKE_CLAUDE_LOG: logFile },
  stdio: ['ignore', 'pipe', 'pipe']
});
let srvOut = '';
srv.stdout.on('data', (d) => (srvOut += d));
srv.stderr.on('data', (d) => (srvOut += d));
await new Promise((r) => setTimeout(r, 700));
const base = `http://localhost:${PORT}`;

try {
  const models = await fetch(`${base}/v1/models`).then((r) => r.json());
  check(models.data.some((m) => m.id === 'opus'), '/v1/models listet opus');

  // Textantwort (Übersetzung)
  const t = await fetch(`${base}/v1/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: 'sonnet', messages: [{ role: 'system', content: 'Du übersetzt.' }, { role: 'user', content: 'Hello world' }] }) });
  const tj = await t.json();
  check(t.status === 200 && /\[sonnet\] ÜBERSETZUNG: Hello world/.test(tj.choices[0].message.content), 'Textantwort über Attrappe: ' + tj.choices?.[0]?.message?.content);
  const logLine = JSON.parse(fs.readFileSync(logFile, 'utf8').trim().split('\n')[0]);
  check(logLine.args.includes('--output-format') && logLine.args.includes('--max-turns') && logLine.args.includes('--system-prompt-file') && logLine.args.includes('--safe-mode') && logLine.args.includes('--tools') && logLine.hasApiKey === false && logLine.systemLength > 0, 'CLI-Argumente gesetzt, System-Prompt per Datei, ANTHROPIC_API_KEY entfernt: ' + logLine.args.join(' '));

  // JSON-Schema-Antwort (Klassifikation) → Brücke fügt Formatanweisung in den System-Prompt ein
  const j = await fetch(`${base}/v1/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'system', content: 'Bewerte.' }, { role: 'user', content: '#0 Ransomware hits port' }], response_format: { type: 'json_schema', json_schema: { name: 'r', schema: { type: 'object', properties: { results: { type: 'array' } }, required: ['results'] } } } }) });
  const jj = await j.json();
  check(j.status === 200 && /"results"/.test(jj.choices[0].message.content), 'JSON-Antwort: ' + jj.choices?.[0]?.message?.content?.slice(0, 80));

  // Nutzungslimit → 429 mit retry_at
  const l = await fetch(`${base}/v1/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'user', content: 'LIMIT_TEST please' }] }) });
  const lj = await l.json();
  check(l.status === 429 && /Nutzungslimit/.test(lj.error.message) && lj.error.retry_at === new Date(1800000000 * 1000).toISOString(), '429 bei Nutzungslimit mit retry_at: ' + JSON.stringify(lj.error));
  // Danach: sofortige 429 ohne CLI-Aufruf, solange die Sperre gilt
  const l2 = await fetch(`${base}/v1/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'user', content: 'again' }] }) });
  check(l2.status === 429, 'Sperre bleibt bis retry_at aktiv (429 ohne neuen CLI-Aufruf)');
  const status = await fetch(`${base}/__bridge/status`).then((r) => r.json());
  check(status.ok === 2 && status.rateLimited === 2 && status.rateLimitUntil, 'Status-Zähler: ' + JSON.stringify({ ok: status.ok, rateLimited: status.rateLimited }));
} finally {
  srv.kill();
}

// Absturz der CLI → 500 (neue Brücke ohne Sperre)
{
  const PORT2 = PORT + 1;
  const srv2 = spawn('node', [path.join(ROOT, 'tools/claude-bridge.mjs'), '--port', String(PORT2), '--claude', wrapper], { env: { ...process.env, FAKE_CLAUDE_LOG: logFile }, stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise((r) => setTimeout(r, 700));
  try {
    const c = await fetch(`http://localhost:${PORT2}/v1/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'user', content: 'CRASH_TEST' }] }) });
    const cj = await c.json();
    check(c.status === 500 && /something broke/.test(cj.error.message), 'CLI-Fehler → 500: ' + cj.error?.message);
  } finally {
    srv2.kill();
  }
}

fs.rmSync(wrapper, { force: true });
console.log(failures ? `\n${failures} Test(s) fehlgeschlagen` : '\nBrücken-Tests bestanden');
if (failures) console.log(srvOut);
process.exit(failures ? 1 : 0);
