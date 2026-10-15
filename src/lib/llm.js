// Einheitlicher Zugriff auf das Sprachmodell für Relevanzprüfung, Tagging und
// Übersetzung. Zwei Anbieter:
//   'claude' – Claude API
//   'local'  – „Lokaler Server“: im Normalfall die Claude-Code-Brücke (tools/claude-bridge.mjs,
//              http://localhost:4310/v1), sonst ein eigenes Modell über eine OpenAI-kompatible
//              Chat-Completions-Schnittstelle (Ollama, LM Studio, vLLM, llama.cpp …)
// Fehlermeldungen des lokalen Pfads nennen immer die URL und sagen, was zu tun ist.

import { claudeRequest, responseText } from './claude.js';

/** Anzeige-Name des lokalen Anbieters (einheitlich in Fehlermeldungen und UI). */
export const LOCAL_SERVER_LABEL = 'Lokaler Server';
/** Standard-URL der Claude-Code-Brücke. */
export const BRIDGE_URL = 'http://localhost:4310/v1';
/** Windows-Starter der Brücke (README). */
export const BRIDGE_START_HINT = 'tools\\start-claude-bridge.cmd';

/**
 * Läuft die Brücke hinter einem ngrok-Tunnel, würde ngrok Browser-Anfragen ohne diesen Header eine
 * HTML-Hinweisseite statt der Antwort liefern. Für andere Server ist der Header bedeutungslos.
 */
const TUNNEL_HEADERS = { 'ngrok-skip-browser-warning': '1' };

/** Zeigt die URL auf die Claude-Code-Brücke (localhost, Port 4310)? */
export const isBridgeUrl = (url) => /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\]):4310(?:[/?#]|$)/i.test(String(url || '').trim());

/** Name des lokalen Anbieters für die Anzeige: „Claude-Code-Brücke“ bei Brücken-URL, sonst „Lokaler Server“. */
export const localServerName = (settings) => (isBridgeUrl(settings?.localLlmUrl) ? 'Claude-Code-Brücke' : LOCAL_SERVER_LABEL);

/** Handlungshinweis für einen nicht erreichbaren lokalen Server (immer mit Brücke und URL). */
function localUnreachableHint(base) {
  return isBridgeUrl(base)
    ? `Claude-Code-Brücke nicht erreichbar (${base}) – Brücke starten (${BRIDGE_START_HINT} bzw. node tools/claude-bridge.mjs; das Fenster offen lassen) oder URL in den Einstellungen prüfen.`
    : `${LOCAL_SERVER_LABEL} nicht erreichbar (${base}) – läuft der Server und erlaubt er Zugriffe aus Chrome-Erweiterungen (CORS)? Für die Claude-Code-Brücke: Brücke starten (${BRIDGE_START_HINT}) oder URL in den Einstellungen prüfen (${BRIDGE_URL}).`;
}

// System-Prompt als String: Für 'local' werden Block-Arrays (wie sie die Claude API mit
// cache_control erwartet) in der gegebenen Reihenfolge zu EINEM String zusammengefügt;
// leere Blöcke (z. B. kein Regelwerk) werden übersprungen.
const sysText = (system) => (Array.isArray(system)
  ? system.filter((b) => b && typeof b.text === 'string' && b.text.trim()).map((b) => b.text).join('\n\n')
  : String(system || ''));

/** Fehler, bei dem Weiterarbeiten keinen Sinn hat: Nutzungslimit/Rate-Limit erreicht. */
export class RateLimitError extends Error {
  constructor(message, { retryAt = null, provider = '' } = {}) {
    super(message);
    this.name = 'RateLimitError';
    this.rateLimited = true;
    this.retryAt = retryAt;
    this.provider = provider;
  }
}

export const isRateLimit = (e) => !!(e && (e.rateLimited || e.name === 'RateLimitError'));

/**
 * Textantwort.
 * @param {object} settings
 * @param {string|Array<{type:'text',text:string,cache_control?:object}>} system
 */
export async function llmText(settings, system, user, { maxTokens = 16000, effort = 'medium' } = {}) {
  if (settings.llmProvider === 'local') {
    return localChat(settings, sysText(system), user, { maxTokens });
  }
  const data = await claudeRequest(settings, {
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: user }],
    output_config: { effort }
  });
  return responseText(data);
}

/**
 * JSON-Antwort nach Schema.
 */
export async function llmJson(settings, system, user, schema, { maxTokens = 16000, effort = 'medium' } = {}) {
  if (settings.llmProvider === 'local') {
    return localJson(settings, sysText(system), user, schema, { maxTokens });
  }
  const data = await claudeRequest(settings, {
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: user }],
    output_config: { effort, format: { type: 'json_schema', schema } }
  });
  return JSON.parse(responseText(data));
}

// ------------------------------------------------------------ lokal ----

/** Basis-URL des lokalen Servers (…/v1); exportiert für Anzeige und Tests. */
export function localBase(settings) {
  const url = (settings?.localLlmUrl || '').trim().replace(/\/+$/, '');
  if (!url) throw new Error(`Keine Server-URL hinterlegt (Einstellungen → ${LOCAL_SERVER_LABEL}). Für die Claude-Code-Brücke: ${BRIDGE_URL} eintragen („Claude-Code-Brücke voreinstellen“) und die Brücke starten (${BRIDGE_START_HINT}).`);
  return /\/v\d+$/.test(url) ? url : `${url}/v1`;
}

async function localRequest(settings, body) {
  const base = localBase(settings);
  const headers = { 'content-type': 'application/json', ...TUNNEL_HEADERS };
  if (settings.localLlmApiKey) headers.authorization = `Bearer ${settings.localLlmApiKey}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), (Number(settings.localLlmTimeoutSec) || 600) * 1000);
  let res;
  try {
    res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model: settings.localLlmModel || undefined, temperature: 0.2, stream: false, ...body }),
      signal: ctrl.signal
    });
  } catch (e) {
    if (e?.name === 'AbortError') {
      throw new Error(`${localServerName(settings)} antwortet nicht (${base}): Zeitlimit von ${Number(settings.localLlmTimeoutSec) || 600} s überschritten – Brücke/Server prüfen oder das Zeitlimit in den Einstellungen erhöhen.`);
    }
    throw new Error(`${localUnreachableHint(base)} (${e.message})`);
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    if (res.status === 429) {
      // Vermittler/Server meldet erschöpftes Kontingent (z. B. Claude-Code-Brücke: {"error":{"message":…,"retry_at":…}})
      let message = 'Nutzungslimit erreicht – bitte eine Weile warten und dann erneut starten.';
      let retryAt = null;
      try {
        const j = JSON.parse(detail);
        message = j?.error?.message || j?.message || message;
        retryAt = j?.error?.retry_at || j?.retry_at || null;
      } catch {
        if (detail) message = detail.slice(0, 300);
      }
      throw new RateLimitError(message, { retryAt, provider: 'local' });
    }
    const err = new Error(`${localServerName(settings)} (${base}): HTTP ${res.status} ${detail.slice(0, 300)}`.trim());
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  const msg = data.choices?.[0]?.message;
  const content = typeof msg?.content === 'string' ? msg.content : (msg?.content || []).map((c) => c.text || '').join('');
  return content;
}

async function localChat(settings, system, user, { maxTokens }) {
  return localRequest(settings, {
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    max_tokens: maxTokens
  });
}

function extractJson(text) {
  const t = String(text).replace(/```(?:json)?/gi, '').trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start < 0 || end < 0) throw new Error(`${LOCAL_SERVER_LABEL}: Antwort enthält kein JSON`);
  return JSON.parse(t.slice(start, end + 1));
}

async function localJson(settings, system, user, schema, { maxTokens }) {
  const messages = [
    { role: 'system', content: `${system}\n\nAntworte ausschließlich mit einem JSON-Objekt nach diesem Schema (keine Erklärungen, kein Markdown):\n${JSON.stringify(schema)}` },
    { role: 'user', content: user }
  ];
  // 1) Strukturierte Ausgabe per json_schema (vLLM, LM Studio, llama.cpp, Ollama ≥ 0.5)
  try {
    const text = await localRequest(settings, {
      messages,
      max_tokens: maxTokens,
      response_format: { type: 'json_schema', json_schema: { name: 'result', schema, strict: true } }
    });
    return extractJson(text);
  } catch (e) {
    if (e.status && e.status !== 400 && e.status !== 422) throw e;
    if (!e.status && !/JSON/.test(e.message)) throw e;
  }
  // 2) Fallback: json_object bzw. freier Text
  try {
    const text = await localRequest(settings, { messages, max_tokens: maxTokens, response_format: { type: 'json_object' } });
    return extractJson(text);
  } catch (e) {
    if (e.status && e.status !== 400 && e.status !== 422) throw e;
  }
  const text = await localRequest(settings, { messages, max_tokens: maxTokens });
  return extractJson(text);
}

/** Verbindungstest für den lokalen Server (Claude-Code-Brücke oder eigenes Modell). */
export async function testLocalLlm(settings) {
  const base = localBase(settings);
  const headers = { ...TUNNEL_HEADERS };
  if (settings.localLlmApiKey) headers.authorization = `Bearer ${settings.localLlmApiKey}`;
  const res = await fetch(`${base}/models`, { headers }).catch((e) => {
    throw new Error(`${localUnreachableHint(base)} (${e.message})`);
  });
  if (!res.ok) throw new Error(`${localServerName(settings)} (${base}): HTTP ${res.status} von ${base}/models`);
  const data = await res.json();
  const models = (data.data || []).map((m) => m.id);
  const answer = await localChat(settings, 'Antworte nur mit dem Wort OK.', 'Test', { maxTokens: 20 });
  return { models, answer: answer.trim().slice(0, 50) };
}
