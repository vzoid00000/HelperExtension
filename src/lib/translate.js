// Übersetzung Englisch → Deutsch über wählbaren Anbieter.
//   'claude' – Claude API (beste Qualität, API-Key nötig)
//   'deepl'  – DeepL API (Free-Key reicht, API-Key nötig)
//   'chrome' – in Chrome eingebaute Übersetzung (ab Chrome 138, kostenlos, ohne Key,
//              Qualität nur mittel)

const TRANSLATION_INSTRUCTIONS = `Du bist ein professioneller Fachübersetzer (Englisch → Deutsch) für ein behördliches Nachrichten-Dokumentationssystem in Österreich.

Aufgabe: Übersetze den vom Nutzer gelieferten englischen Nachrichtentext vollständig und inhaltlich exakt ins Deutsche.

Regeln:
- Sinngetreu, vollständig, nichts weglassen, nichts hinzufügen, nichts zusammenfassen, nicht kommentieren.
- Korrektes, natürliches Standarddeutsch (österreichische Schreibweise ist in Ordnung, z. B. "Jänner").
- Eigennamen, Organisationen, Produktnamen, Malware-Namen, Abkürzungen (z. B. NATO, CISA, APT28) unverändert lassen. Gängige deutsche Bezeichnungen verwenden, wo sie etabliert sind (z. B. "Verteidigungsministerium", "Außenminister").
- Zitate als Zitate übersetzen. Zahlen, Daten, Uhrzeiten und Einheiten korrekt übernehmen.
- Absatzstruktur beibehalten: ein englischer Absatz = ein deutscher Absatz, getrennt durch Leerzeilen.
- Keine Bildunterschriften, Werbung, Navigationsreste oder Markdown erfinden. Nur den übersetzten Text ausgeben, ohne Einleitung oder Nachbemerkung.`;

const TITLE_INSTRUCTIONS = `Du bist ein professioneller Fachübersetzer (Englisch → Deutsch) für ein behördliches Nachrichten-Dokumentationssystem in Österreich.

Übersetze die gelieferte englische Schlagzeile in eine korrekte, präzise deutsche Schlagzeile. Eigennamen und Abkürzungen unverändert lassen. Gib ausschließlich die deutsche Schlagzeile aus, ohne Anführungszeichen, ohne Punkt am Ende, ohne Erklärung.`;

/**
 * Übersetzt Titel und Text.
 * @param {{title: string, text: string}} article
 * @param {object} settings  – siehe lib/settings.js
 * @param {(msg: string) => void} [onProgress]
 * @returns {Promise<{title: string, text: string, provider: string}>}
 */
export async function translateArticle(article, settings, onProgress = () => {}) {
  const provider = settings.translator || 'claude';
  const title = (article.title || '').trim();
  const text = (article.text || '').trim();

  if (!title && !text) throw new Error('Nichts zu übersetzen: Titel und Text sind leer.');

  let result;
  if (provider === 'claude') result = await translateWithClaude(title, text, settings, onProgress);
  else if (provider === 'deepl') result = await translateWithDeepL(title, text, settings, onProgress);
  else if (provider === 'chrome') result = await translateWithChrome(title, text, onProgress);
  else throw new Error(`Unbekannter Übersetzungs-Anbieter: ${provider}`);

  return { ...result, provider };
}

// ---------------------------------------------------------------- Claude ----

async function translateWithClaude(title, text, settings, onProgress) {
  const apiKey = (settings.anthropicApiKey || '').trim();
  if (!apiKey) throw new Error('Kein Claude API-Key hinterlegt (Einstellungen).');
  const model = settings.anthropicModel || 'claude-opus-5-5';

  onProgress('Übersetze mit Claude …');
  const [deTitle, deText] = await Promise.all([
    title ? claudeMessage(apiKey, model, TITLE_INSTRUCTIONS, title, 1024) : Promise.resolve(''),
    text ? claudeMessage(apiKey, model, TRANSLATION_INSTRUCTIONS, text, 16000) : Promise.resolve('')
  ]);
  return { title: deTitle.trim(), text: deText.trim() };
}

/**
 * Ein einzelner Aufruf der Messages API (raw HTTP, da die Extension ohne Bundler läuft).
 * Server-seitiger Fallback ist aktiviert: Lehnt der Sicherheitsklassifikator eine
 * Anfrage ab (kann bei Cyber-Themen passieren), wird sie automatisch auf einem
 * anderen Claude-Modell wiederholt, statt mit "refusal" zu enden.
 */
async function claudeMessage(apiKey, model, system, userText, maxTokens) {
  const body = {
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: userText }],
    output_config: { effort: 'medium' },
    fallbacks: 'default'
  };

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'server-side-fallback-2026-07-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify(body)
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
    throw new Error(`Claude API Fehler ${res.status}: ${detail}`);
  }

  const data = await res.json();
  if (data.stop_reason === 'refusal') {
    const why = data.stop_details?.explanation || data.stop_details?.category || 'ohne Angabe';
    throw new Error(`Claude hat die Übersetzung abgelehnt (${why}). Bitte Text prüfen oder anderen Anbieter wählen.`);
  }
  if (data.stop_reason === 'max_tokens') {
    throw new Error('Claude: Antwort abgeschnitten (max_tokens). Text in kleinere Teile aufteilen.');
  }
  return (data.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('');
}

// ----------------------------------------------------------------- DeepL ----

async function translateWithDeepL(title, text, settings, onProgress) {
  const apiKey = (settings.deeplApiKey || '').trim();
  if (!apiKey) throw new Error('Kein DeepL API-Key hinterlegt (Einstellungen).');
  const endpoint = apiKey.endsWith(':fx')
    ? 'https://api-free.deepl.com/v2/translate'
    : 'https://api.deepl.com/v2/translate';

  onProgress('Übersetze mit DeepL …');
  const inputs = [];
  if (title) inputs.push(title);
  if (text) inputs.push(text);

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `DeepL-Auth-Key ${apiKey}`
    },
    body: JSON.stringify({
      text: inputs,
      source_lang: 'EN',
      target_lang: 'DE',
      formality: 'prefer_more',
      split_sentences: '1',
      preserve_formatting: true
    })
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    if (res.status === 403) throw new Error('DeepL: API-Key ungültig (403).');
    if (res.status === 456) throw new Error('DeepL: Zeichen-Kontingent aufgebraucht (456).');
    throw new Error(`DeepL Fehler ${res.status}: ${detail}`);
  }
  const data = await res.json();
  const out = (data.translations || []).map((t) => t.text);
  let i = 0;
  return {
    title: title ? (out[i++] || '').trim() : '',
    text: text ? (out[i++] || '').trim() : ''
  };
}

// ---------------------------------------------------------- Chrome built-in --

async function translateWithChrome(title, text, onProgress) {
  if (typeof Translator === 'undefined') {
    throw new Error('Die eingebaute Chrome-Übersetzung ist nicht verfügbar (Chrome 138+ nötig, Desktop).');
  }
  onProgress('Prüfe Chrome-Übersetzungsmodell …');
  const availability = await Translator.availability({ sourceLanguage: 'en', targetLanguage: 'de' });
  if (availability === 'unavailable') {
    throw new Error('Chrome kann EN→DE auf diesem Gerät nicht übersetzen.');
  }
  const translator = await Translator.create({
    sourceLanguage: 'en',
    targetLanguage: 'de',
    monitor(m) {
      m.addEventListener('downloadprogress', (e) => {
        onProgress(`Lade Sprachmodell … ${Math.round((e.loaded || 0) * 100)}%`);
      });
    }
  });

  onProgress('Übersetze mit Chrome …');
  const deTitle = title ? await translator.translate(title) : '';
  // Absatzweise übersetzen, damit die Struktur erhalten bleibt.
  const paragraphs = text ? text.split(/\n\s*\n/) : [];
  const deParagraphs = [];
  for (const p of paragraphs) {
    deParagraphs.push(p.trim() ? await translator.translate(p.trim()) : '');
  }
  return { title: deTitle.trim(), text: deParagraphs.join('\n\n').trim() };
}
