// Attrappe der Claude-Code-CLI für Tests der Brücke: liest den Prompt von stdin und
// antwortet wie `claude -p --output-format json`.
//   enthält der Prompt "LIMIT_TEST"  → Nutzungslimit-Fehler
//   enthält der Prompt "CRASH_TEST"  → Exit 1 mit Fehlertext
//   verlangt der System-Prompt JSON   → {"results":[...]} bzw. Echo-JSON
import fs from 'node:fs';

const args = process.argv.slice(2);
if (args[0] === 'auth' && args[1] === 'status') {
  process.stdout.write(JSON.stringify({ loggedIn: true, authMethod: 'claude.ai', email: 'fake@example.com' }));
  process.exit(0);
}
const prompt = fs.readFileSync(0, 'utf8');
const sysIdx = args.indexOf('--system-prompt');
const sysFileIdx = args.indexOf('--system-prompt-file');
const system = sysIdx >= 0 ? args[sysIdx + 1] : sysFileIdx >= 0 ? fs.readFileSync(args[sysFileIdx + 1], 'utf8') : '';
const modelIdx = args.indexOf('--model');
const model = modelIdx >= 0 ? args[modelIdx + 1] : 'unknown';
fs.writeFileSync(process.env.FAKE_CLAUDE_LOG || '/dev/null', JSON.stringify({ args, promptLength: prompt.length, systemLength: system.length, hasApiKey: 'ANTHROPIC_API_KEY' in process.env }) + '\n', { flag: 'a' });

const out = (result, extra = {}) => {
  process.stdout.write(JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result, session_id: 'fake', total_cost_usd: 0.0123, duration_ms: 42, num_turns: 1, usage: { input_tokens: 100, output_tokens: 20 }, ...extra }));
};

if (/LIMIT_TEST/.test(prompt)) {
  process.stdout.write(JSON.stringify({ type: 'result', subtype: 'error', is_error: true, result: 'Claude AI usage limit reached|1800000000', session_id: 'fake' }));
  process.exit(1);
}
if (/CRASH_TEST/.test(prompt)) {
  process.stderr.write('Error: something broke\n');
  process.exit(1);
}
if (/ANTWORTFORMAT|JSON/.test(system)) {
  if (/results/.test(system)) out('```json\n{"results":[{"id":0,"category":"cyber","score":8,"reason":"Attrappe"}]}\n```');
  else out(JSON.stringify({ structure: 'Cyber', sourceType: 'Nachrichtenseite', locations: ['USA'], topics: ['Cyber > Cyberangriff > Schadsoftware > Ransomware'], ki: false, wb: 'none', wbReason: 'Attrappe', summary: 'Zusammenfassung.', notes: '' }));
} else {
  out(`[${model}] ÜBERSETZUNG: ${prompt.slice(0, 60)}`);
}
