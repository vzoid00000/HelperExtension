// Übersetzung Englisch → Deutsch über wählbaren Anbieter.
//   'claude' – Claude API (beste Qualität, API-Key nötig)
//   'local'  – eigenes Modell am Heim-PC (OpenAI-kompatible Schnittstelle, siehe lib/llm.js)
//   'deepl'  – DeepL API (Free-Key reicht, API-Key nötig)
//   'chrome' – in Chrome eingebaute Übersetzung (ab Chrome 138, kostenlos, ohne Key,
//              Qualität nur mittel)
//
// Grundsatz: Es wird ausschließlich der gescrapte Artikeltext übersetzt – wortgetreu, nichts
// hinzugedichtet, nichts weggelassen, nichts zusammengefasst. Jede Übersetzung durchläuft eine
// Plausibilitätsprüfung (checkTranslation), deren Ergebnis als warnings mitgeliefert wird.
// Für Claude/lokal geht Titel + Text in EINER Anfrage (Protokoll: erste Zeile Schlagzeile,
// Leerzeile, dann Text), siehe splitTranslation().

import { llmText } from './llm.js';

const TRANSLATION_INSTRUCTIONS = `Du bist Fachübersetzer Englisch → Deutsch für ein behördliches Nachrichten-Dokumentationssystem in Österreich.

Übersetze AUSSCHLIESSLICH den gelieferten Text – wortgetreu und vollständig.
- Nichts ergänzen, nichts weglassen, nichts zusammenfassen, nichts umstellen, nichts kommentieren oder erklären.
- Absatzstruktur 1:1: jeder Absatz der Vorlage wird genau ein Absatz, getrennt durch eine Leerzeile; Sätze nicht zusammenziehen oder teilen.
- Zitate bleiben Zitate. Zahlen, Daten, Uhrzeiten, Einheiten exakt übernehmen. Eigennamen, Organisationen, Produkt- und Malware-Namen, Abkürzungen (NATO, CISA, APT28) unverändert lassen; etablierte deutsche Bezeichnungen für Ämter sind erlaubt ("Verteidigungsministerium", "Außenminister").
- Korrektes, natürliches Standarddeutsch (österreichische Schreibweise erlaubt, z. B. "Jänner").
- Keine Bildunterschriften, Werbung, Navigationsreste oder Markdown hinzufügen.

AUSGABEFORMAT (ohne Überschriften, Labels, Einleitung oder Nachbemerkung):
Zeile 1: die deutsche Schlagzeile (ohne Anführungszeichen, ohne Punkt am Ende)
Zeile 2: leer
ab Zeile 3: der übersetzte Text
Fehlt in der Vorlage die Schlagzeile, nur den Text ausgeben; fehlt der Text, nur die Schlagzeile.`;

/**
 * Übersetzt Titel und Text.
 * @param {{title: string, text: string}} article
 * @param {object} settings  – siehe lib/settings.js
 * @param {(msg: string) => void} [onProgress]
 * @param {{rulesText?: string}} [opts]  rulesText = Regelwerk-Block (z. B. Glossar), wird an die Anweisungen angehängt
 * @returns {Promise<{title: string, text: string, provider: string, warnings: string[]}>}
 */
export async function translateArticle(article, settings, onProgress = () => {}, opts = {}) {
  const provider = settings.translator || 'claude';
  const title = (article.title || '').trim();
  const text = (article.text || '').trim();
  const rulesText = String(opts.rulesText || '').trim();

  if (!title && !text) throw new Error('Nichts zu übersetzen: Titel und Text sind leer.');

  let result;
  if (provider === 'claude') result = await translateWithLlm(title, text, { ...settings, llmProvider: 'claude' }, onProgress, 'Claude', rulesText);
  else if (provider === 'local') result = await translateWithLlm(title, text, { ...settings, llmProvider: 'local' }, onProgress, 'lokalem Modell', rulesText);
  else if (provider === 'deepl') result = await translateWithDeepL(title, text, settings, onProgress);
  else if (provider === 'chrome') result = await translateWithChrome(title, text, onProgress);
  else throw new Error(`Unbekannter Übersetzungs-Anbieter: ${provider}`);

  const warnings = [...(result.warnings || []), ...checkTranslation({ title, text }, result)];
  return { title: result.title, text: result.text, provider, warnings };
}

// ------------------------------------------------------ Claude / lokal ----

/** Nutzer-Nachricht: Schlagzeile und Text klar getrennt, damit die Ausgabe zerlegt werden kann. */
export function buildTranslationUser(title, text) {
  const parts = [];
  if (title) parts.push(`SCHLAGZEILE:\n${title}`);
  if (text) parts.push(`TEXT:\n${text}`);
  return parts.join('\n\n');
}

/** System-Anweisungen plus optionalem Regelwerk-Block. */
export function buildTranslationSystem(rulesText = '') {
  const rules = String(rulesText || '').trim();
  return rules ? `${TRANSLATION_INSTRUCTIONS}\n\n${rules}` : TRANSLATION_INSTRUCTIONS;
}

async function translateWithLlm(title, text, settings, onProgress, label, rulesText = '') {
  onProgress(`Übersetze mit ${label} …`);
  const out = await llmText(settings, buildTranslationSystem(rulesText), buildTranslationUser(title, text), { maxTokens: 16000 });
  return splitTranslation(out, { hasTitle: !!title, hasText: !!text });
}

// Floskeln, mit denen Modelle eine Übersetzung gern einleiten („Hier ist die Übersetzung:“).
const LEAD_IN_RE = [
  /^(?:hier|gerne|natürlich|selbstverständlich|nachfolgend|im folgenden|ok(?:ay)?|sehr gern)\b[^\n]*übersetz[^\n]*$/i,
  /^(?:die |deine |ihre )?(?:deutsche |vollständige )?übersetzung(?: des (?:artikels|textes))?\s*:?\s*$/i,
  /^[^\n]*übersetzung[^\n]*:\s*$/i
];
const LABEL_RE = /^(?:schlagzeile|titel|überschrift|headline|title)\s*:\s*/i;
const TEXT_LABEL_RE = /^(?:text|artikeltext|artikel|body)\s*:\s*\n?/i;

function cleanTitle(s) {
  let t = String(s || '').replace(/\s+/g, ' ').trim();
  t = t.replace(LABEL_RE, '').trim();
  t = t.replace(/^[„“"»‚'‘]+/, '').replace(/[“”"«‘’']+$/, '').trim();
  if (/[^.]\.$/.test(t) && !/\.\.\.$|…$/.test(t)) t = t.slice(0, -1);
  return t;
}

/**
 * Zerlegt die Modellantwort in Schlagzeile und Text (Protokoll: erste Zeile Schlagzeile, Leerzeile, Text).
 * Entfernt Einleitungs-Floskeln, Labels und Codeblöcke; meldet Abweichungen als warnings.
 * @param {string} output
 * @param {{hasTitle: boolean, hasText: boolean}} parts  was in der Vorlage vorhanden war
 * @returns {{title: string, text: string, warnings: string[]}}
 */
export function splitTranslation(output, { hasTitle = true, hasText = true } = {}) {
  const warnings = [];
  let out = String(output || '').replace(/\r\n?/g, '\n').replace(/^\s*```[a-z]*\s*\n?|\n?```\s*$/gi, '').trim();

  // Einleitungs-Floskel in der ersten Zeile entfernen
  const firstBreak = out.indexOf('\n');
  const firstLine = (firstBreak < 0 ? out : out.slice(0, firstBreak)).trim();
  if (firstBreak >= 0 && LEAD_IN_RE.some((re) => re.test(firstLine))) {
    out = out.slice(firstBreak + 1).trim();
    warnings.push(`Einleitungs-Floskel entfernt: „${firstLine.slice(0, 60)}“`);
  }
  // Label auf eigener Zeile („SCHLAGZEILE:“ ↵ Titel) mit der Zeile zusammenziehen
  out = out.replace(/^(?:schlagzeile|titel|überschrift|headline|title)\s*:\s*\n+/i, '');

  let title = '';
  let text = '';
  if (hasTitle && hasText) {
    const gap = out.search(/\n[ \t]*\n/);
    if (gap < 0) {
      const nl = out.indexOf('\n');
      if (nl < 0) {
        title = out;
        warnings.push('Übersetzung enthält keinen Text (nur eine Zeile erhalten)');
      } else {
        title = out.slice(0, nl);
        text = out.slice(nl + 1).trim();
        warnings.push('Schlagzeile und Text waren nicht durch eine Leerzeile getrennt');
      }
    } else {
      const first = out.slice(0, gap).trim();
      text = out.slice(gap).trim();
      const nl = first.indexOf('\n');
      if (nl >= 0) {
        title = first.slice(0, nl);
        text = `${first.slice(nl + 1).trim()}\n\n${text}`.trim();
        warnings.push('Schlagzeile und erster Absatz waren nicht durch eine Leerzeile getrennt');
      } else title = first;
    }
  } else if (hasTitle) {
    title = out.split('\n')[0] || '';
  } else {
    text = out;
  }

  title = cleanTitle(title);
  text = text.replace(TEXT_LABEL_RE, '').trim();
  return { title, text, warnings };
}

const splitParagraphs = (s) => String(s || '').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);

/**
 * Plausibilitätsprüfung Vorlage ↔ Übersetzung. Liefert Warnungen (leer = unauffällig):
 * Längenverhältnis DE/EN außerhalb 0,7–1,6, Absatzanzahl weicht um mehr als 1 ab, Schlagzeile
 * fehlt/zu lang, Text fehlt, Übersetzer-Anmerkung am Ende.
 */
export function checkTranslation(source, result) {
  const warnings = [];
  const srcTitle = String(source?.title || '').trim();
  const srcText = String(source?.text || '').trim();
  const deTitle = String(result?.title || '').trim();
  const deText = String(result?.text || '').trim();

  if (srcTitle && !deTitle) warnings.push('Schlagzeile fehlt in der Übersetzung');
  if (deTitle && (deTitle.length > 200 || (srcTitle && deTitle.length > srcTitle.length * 2.5 + 40))) {
    warnings.push(`Schlagzeile ungewöhnlich lang (${deTitle.length} Zeichen)`);
  }
  if (srcText && !deText) warnings.push('Text fehlt in der Übersetzung');
  if (srcText && deText) {
    const ratio = deText.length / srcText.length;
    if (ratio < 0.7 || ratio > 1.6) {
      warnings.push(`Längenverhältnis DE/EN = ${ratio.toFixed(2)} (erwartet 0,7–1,6) – auf Auslassungen oder Ergänzungen prüfen`);
    }
    const pSrc = splitParagraphs(srcText).length;
    const pDe = splitParagraphs(deText).length;
    if (Math.abs(pSrc - pDe) > 1) warnings.push(`Absatzanzahl weicht ab: Vorlage ${pSrc}, Übersetzung ${pDe}`);
    const last = splitParagraphs(deText).slice(-1)[0] || '';
    if (/^(?:anmerkung|hinweis|übersetzerhinweis|note)\s*(?:des übersetzers)?\s*[:(]/i.test(last)) {
      warnings.push('Übersetzung endet mit einer Anmerkung – prüfen, ob sie zum Artikel gehört');
    }
  }
  return warnings;
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
    text: text ? (out[i++] || '').trim() : '',
    warnings: []
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
  const paragraphs = text ? text.split(/\n\s*\n/) : [];
  const deParagraphs = [];
  for (const p of paragraphs) {
    deParagraphs.push(p.trim() ? await translator.translate(p.trim()) : '');
  }
  return { title: deTitle.trim(), text: deParagraphs.join('\n\n').trim(), warnings: [] };
}
