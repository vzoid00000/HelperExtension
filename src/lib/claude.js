// Gemeinsamer Zugriff auf die Claude Messages API (raw HTTP, da die Extension ohne
// Bundler/SDK läuft).
//
// Server-seitiger Fallback ist aktiviert: Lehnt der Sicherheitsklassifikator eine
// Anfrage ab (bei Cyber-Themen möglich), wird sie automatisch auf einem anderen
// Claude-Modell wiederholt, statt mit "refusal" zu enden.

export const DEFAULT_CLAUDE_MODEL = 'claude-opus-5-5';

/**
 * @param {object} settings  { anthropicApiKey, anthropicModel }
 * @param {object} body      Request-Body ohne model (system, messages, max_tokens, output_config …)
 * @returns {Promise<object>} vollständige API-Antwort
 */
export async function claudeRequest(settings, body) {
  const apiKey = (settings.anthropicApiKey || '').trim();
  if (!apiKey) throw new Error('Kein Claude API-Key hinterlegt (Einstellungen).');
  const model = settings.anthropicModel || DEFAULT_CLAUDE_MODEL;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'server-side-fallback-2026-07-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({ model, fallbacks: 'default', ...body })
  });

  if (!res.ok) {
    let detail = '';
    try {
      const err = await res.json();
      detail = err?.error?.message || JSON.stringify(err);
    } catch {
      detail = await res.text().catch(() => '');
    }
    if (res.status === 401) throw new Error('Claude API: API-Key ungültig (401).');
    if (res.status === 429) throw new Error('Claude API: Rate-Limit erreicht (429). Kurz warten und erneut versuchen.');
    if (res.status === 529 || res.status >= 500) throw new Error(`Claude API vorübergehend nicht erreichbar (${res.status}).`);
    throw new Error(`Claude API Fehler ${res.status}: ${detail}`);
  }

  const data = await res.json();
  if (data.stop_reason === 'refusal') {
    const why = data.stop_details?.explanation || data.stop_details?.category || 'ohne Angabe';
    throw new Error(`Claude hat die Anfrage abgelehnt (${why}).`);
  }
  if (data.stop_reason === 'max_tokens') {
    throw new Error('Claude: Antwort abgeschnitten (max_tokens).');
  }
  return data;
}

/** Nur den Text der Antwort. */
export function responseText(data) {
  return (data.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('');
}

/** Einfache Text-Anfrage mit System-Prompt. */
export async function claudeText(settings, system, userText, { maxTokens = 16000, effort = 'medium' } = {}) {
  const data = await claudeRequest(settings, {
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: userText }],
    output_config: { effort }
  });
  return responseText(data);
}

/** Anfrage mit garantiert gültigem JSON (Structured Outputs). */
export async function claudeJson(settings, system, userText, schema, { maxTokens = 16000, effort = 'medium' } = {}) {
  const data = await claudeRequest(settings, {
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: userText }],
    output_config: { effort, format: { type: 'json_schema', schema } }
  });
  return JSON.parse(responseText(data));
}
