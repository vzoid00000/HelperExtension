// Tag-Vorschlag für einen Artikel nach dem OSDP-Tagging-Handbuch.
// Das Modell liest den Artikel und den (kompakten) Katalog und liefert Struktur, Quellentyp,
// Orte, Themen-Tags, KI-Sonderregel, WB-Empfehlung und eine Kurzzusammenfassung.
// buildSelection() prüft alles gegen den Katalog und die festen Regeln.
//
// Token-Haushalt: Der Katalog geht als eigener System-Block (API: mit cache_control, damit er
// zwischen Anfragen gecacht wird). Das Regelwerk des Bearbeiters (rulesText) folgt als eigener
// Block OHNE cache_control, damit der gecachte Katalogblock stabil bleibt. Für 'local'
// (Claude-Code-Brücke, eigenes Modell) werden alle Blöcke zu einem System-String zusammengefügt.
// Das Ausgabeformat (Felder, erlaubte Werte) trägt allein das JSON-Schema (API: output_config,
// lokal: an den System-Prompt angehängt); RULES wiederholt es nicht.
//
// Hinweis zur Einstellung useSiteExtract (experimentell): Das Tagging läuft in der App VOR dem
// Ausfüllen auf dem per fetch extrahierten Artikeltext (article.text) und dem dort übersetzten
// Titel. Ist useSiteExtract aktiv, holt der Driver den Quelltext erst beim Ausfüllen über den
// OSDP-„Extract“-Button und übersetzt ihn dort; Tags und Freigabe-Card beziehen sich dann auf
// einen anderen Text als den in OSDP eingetragenen, und titleDe kann in der Meldung leer bleiben.
// Bewusst nicht umgebaut – die Standardeinstellung (aus) ist der getestete Pfad.

import { llmJson } from './llm.js';
import { buildSelection, SOURCE_TYPES, shortenAtWord } from './tag-catalog.js';

/** Obergrenze für den Artikeltext im Prompt (Zeichen). */
export const MAX_ARTICLE_CHARS = 10000;
/** Obergrenze für den Katalogtext im Prompt (Zeichen); Baseline (alt, treeText mit Beschreibungen) war 46.077. */
export const MAX_CATALOG_CHARS = 30000;
/**
 * max_tokens für die Tagging-Antwort. Auf dem Standardmodell (Opus) zählt das Nachdenken bei
 * effort 'high' mit in max_tokens; 2.000 reichten dafür nicht (stop_reason max_tokens → Fehler).
 */
export const TAGGING_MAX_TOKENS = 8000;

// Pflichtregeln aus dem Handbuch. Enthält KEINE Wiederholung des Ausgabeformats (steht im Schema)
// und keine Wiederholung der Katalogköpfe (Pfadschreibweise, Ortsliste, WB-Definition).
const RULES = `Du vergibst Tags für englische Newsartikel im österreichischen Dokumentationssystem OSDP nach dem Tagging-Handbuch. Nur Tags aus dem Katalog, exakt so geschrieben; nie Tags erfinden.

PFLICHT
1. Genau EINE Struktur: "Cyber" (Kern: Cybervorfall, digitale Bedrohung, Informationssicherheit, Cyberabwehr), "KriMiSi" (Kern: Krisen, Konflikte, Militär, Sicherheit, Verteidigung, Sicherheitspolitik) oder ausnahmsweise "InnoTech" (eigenständige, bedeutsame Innovationsmeldung mit militärischem/Cyber-Nutzen). Maßgeblich ist der Schwerpunkt, nicht ein Schlüsselwort.
2. Quellentyp nach der TATSÄCHLICHEN Quelle: ${SOURCE_TYPES.join(', ')}. Redaktionelle Medien = "Nachrichtenseite" (Normalfall); Behörden/Regierung = "Behördenseite"; Hersteller-/Firmenseiten = "Unternehmens- oder Vereinsseite"; private Blogs = "Blog".
3. Mindestens ein Ort: nur unmittelbar betroffene Staaten/Regionen (Ereignisort, angegriffene oder zentral handelnde Staaten). Bloße Erwähnung, Nationalität Unbeteiligter oder Sitz des Mediums zählen nicht. "Global" nur bei weltweiter, nicht eingrenzbarer Betroffenheit (nicht automatisch bei vielen Ländern); "kein Standort" nur ohne jede Zuordnung; Meere/Luftraum/Weltraum nur wenn inhaltlich betroffen.
4. Themen-Tags aus Cyber, KriMiSi, InnoTech und Allgemeine Tags – unabhängig von der Struktur, nur belegte Sachverhalte, typischerweise 2–6, kein Übertaggen.

HIERARCHIE: Passt ein Untertag, nur diesen (ohne Übertag). Passt keiner, den Übertag (z. B. Remote-Access-Trojaner → "Schadsoftware", nicht "Spyware"). Über- und Untertag gemeinsam nur in begründeter Ausnahme.

AUFTRAGSTAGS: ki = true nur, wenn Künstliche Intelligenz tatsächlich Thema ist (Entwicklung, Einsatz, Risiko, Tool), nicht bei beiläufiger Erwähnung. WB (Definition im Katalog; WB-Cyber zu Struktur Cyber, WB-KriMiSi zu KriMiSi, nie bei InnoTech) nur für besonders wichtige Meldungen: große Cyberkampagnen, Vorfälle mit strategischen Folgen, entscheidende Sicherheitsänderungen, große Konflikteskalationen, bedeutende militärische/diplomatische Maßnahmen. Die meisten Artikel: wb = "none". Keine anderen Auftragstags.

NIE: Newsinfo → zeitlicher Aspekt, Informationsverschmutzung, Social Media Post (thematische Tags wie "Informationskrieg" oder "Soziale Medien" bleiben erlaubt).

AUSGABE: JSON gemäß Schema, knapp, kein Text außerhalb. topics als vollständige Pfade mit " > " (z. B. "Cyber > Cyberangriff > Schadsoftware > Ransomware"), locations als Namen aus der ORTE-Liste; summary = EIN deutscher Satz (Sachverhalt, Akteure, Folge), wbReason ein Satz, notes nur bei Grenzfällen, sonst "".`;

const SCHEMA = {
  type: 'object',
  properties: {
    structure: { type: 'string', enum: ['Cyber', 'KriMiSi', 'InnoTech'] },
    sourceType: { type: 'string', enum: SOURCE_TYPES },
    locations: { type: 'array', items: { type: 'string' } },
    topics: { type: 'array', items: { type: 'string' } },
    ki: { type: 'boolean' },
    wb: { type: 'string', enum: ['none', 'WB-Cyber', 'WB-KriMiSi'] },
    wbReason: { type: 'string' },
    summary: { type: 'string' },
    notes: { type: 'string' }
  },
  required: ['structure', 'sourceType', 'locations', 'topics', 'ki', 'wb', 'wbReason', 'summary', 'notes'],
  additionalProperties: false
};

/** Alter, ausführlicher Katalogtext (treeText mit vollen Beschreibungen) – nur noch als Vergleichsgröße. */
export function catalogText(catalog) {
  const opts = { withDescriptions: true };
  return [
    '=== THEMEN-TAGS (Pfadschreibweise mit " > "; nach "—" steht die offizielle Tag-Definition aus dem Dashboard) ===',
    catalog.treeText('Cyber', opts),
    catalog.treeText('KriMiSi', opts),
    catalog.treeText('InnoTech', opts),
    catalog.treeText('Allgemeine Tags', opts),
    '',
    '=== GEOGRAFISCHE LOKATIONEN (nur den Ortsnamen angeben) ===',
    catalog.treeText('Newsinfo → geographische Lokationen'),
    '',
    '=== AUFTRAGSTAGS (Definitionen) ===',
    `WB-Cyber — ${catalog.get('Auftragstags → WB-Cyber')?.description || ''}`,
    `WB-KriMiSi — ${catalog.get('Auftragstags → WB-KriMiSi')?.description || ''}`
  ].join('\n');
}

function composeCatalogPrompt(catalog, maxDescription) {
  const wbCyber = shortenAtWord((catalog.get('Auftragstags → WB-Cyber')?.description || '').replace(/\s+/g, ' ').trim(), 160);
  return [
    '=== THEMEN-TAGS (Einrückung = Hierarchie; Pfad mit " > " angeben; nach "—" eine Kurzdefinition) ===',
    catalog.compactText('Cyber', { maxDescription }),
    catalog.compactText('KriMiSi', { maxDescription }),
    catalog.compactText('InnoTech', { maxDescription }),
    catalog.compactText('Allgemeine Tags', { maxDescription }),
    '',
    '=== ORTE (Einträge durch ";" getrennt; Namen exakt wie hier, bei Klammerzusatz genügt die Kurzform; Kontinentnamen sind selbst wählbar, Gruppenbezeichnungen mit "(nur die Einträge)" nicht) ===',
    catalog.geoText(),
    '',
    '=== WB (Auftragstags) ===',
    `WB-Cyber — ${wbCyber || 'besonders wichtige Cyber-Meldung für den Wochenbericht'}`,
    'WB-KriMiSi — analog für besonders wichtige KriMiSi-Meldungen'
  ].join('\n');
}

/**
 * Kompakter Katalogtext für den Tagging-Prompt (≤ maxChars Zeichen, Standard 30.000). Alle Tagnamen
 * bleiben vollständig; Beschreibungen beginnen bei 90 Zeichen und werden nur dann schrittweise
 * (um 5 Zeichen) gekürzt, wenn der Gesamttext sonst das Budget überschreitet.
 */
export function catalogPromptText(catalog, { maxChars = MAX_CATALOG_CHARS } = {}) {
  let text = '';
  for (let maxDescription = 90; maxDescription >= 40; maxDescription -= 5) {
    text = composeCatalogPrompt(catalog, maxDescription);
    if (text.length <= maxChars) return text;
  }
  return text;
}

const promptCache = new WeakMap();
function cachedCatalogPrompt(catalog) {
  let text = promptCache.get(catalog);
  if (!text) {
    text = catalogPromptText(catalog);
    promptCache.set(catalog, text);
  }
  return text;
}

/** Artikeltext auf MAX_ARTICLE_CHARS begrenzen (Schnitt am Wortende, Markierung „[…]“ inklusive). */
export function limitArticleText(text, max = MAX_ARTICLE_CHARS) {
  const t = String(text || '').trim();
  if (t.length <= max) return t;
  const marker = ' […]';
  const cut = t.slice(0, max - marker.length).replace(/\s+\S*$/, '');
  return (cut || t.slice(0, max - marker.length)) + marker;
}

/** Die festen Handbuch-Regeln (erster System-Block) – für Tests und Prompt-Vergleiche. */
export const TAGGING_RULES = RULES;

/**
 * System-Prompt für das Tagging.
 * - API ('claude'): drei Blöcke – Regeln, Katalog (cache_control) und optional das Regelwerk (ohne cache_control).
 * - 'local' (Brücke/eigenes Modell): ein einziger String in derselben Reihenfolge.
 * @returns {string|Array<{type:'text',text:string,cache_control?:object}>}
 */
export function buildTaggingSystem(settings, catalog, rulesText = '') {
  const rules = String(rulesText || '').trim();
  const blocks = [
    { type: 'text', text: RULES },
    { type: 'text', text: cachedCatalogPrompt(catalog), cache_control: { type: 'ephemeral' } }
  ];
  if (rules) blocks.push({ type: 'text', text: rules });
  if ((settings?.llmProvider || 'claude') === 'local') return blocks.map((b) => b.text).join('\n\n');
  return blocks;
}

/** Nutzer-Nachricht für das Tagging (Quelle, URL, Titel, Hinweise, begrenzter Artikeltext). */
export function buildTaggingUser(article, { forceWb = 'auto' } = {}) {
  const hints = [];
  if (article.category === 'cyber' || article.category === 'krimisi') {
    hints.push(`Relevanzprüfung: ${article.category === 'krimisi' ? 'KriMiSi' : 'Cyber'}${article.score != null ? `, Wichtigkeit ${article.score}/10` : ''}.`);
  }
  if (forceWb === 'yes') hints.push('Der Bearbeiter hat diese Meldung bereits als WB-würdig markiert.');
  if (forceWb === 'no') hints.push('Der Bearbeiter hat entschieden: kein WB-Tag.');
  return [
    `Quelle: ${article.sourceName || ''}${article.siteName ? ` (${article.siteName})` : ''}`,
    `URL: ${article.url || ''}`,
    `Titel: ${article.title || ''}`,
    article.titleDe ? `Titel (DE): ${article.titleDe}` : '',
    hints.length ? hints.join(' ') : '',
    '',
    'ARTIKELTEXT:',
    limitArticleText(article.text)
  ].filter((l) => l !== '').join('\n');
}

/**
 * @param {object} article  { title, titleDe, text, url, siteName, sourceName, category, score }
 * @param {TagCatalog} catalog
 * @param {object} settings
 * @param {object} [opts]  { forceWb: 'auto'|'yes'|'no', rulesText: string (Regelwerk-Block aus der App) }
 */
export async function suggestTags(article, catalog, settings, opts = {}) {
  const forceWb = opts.forceWb || 'auto';
  const system = buildTaggingSystem(settings, catalog, opts.rulesText || '');
  const user = buildTaggingUser(article, { forceWb });
  const raw = await llmJson(settings, system, user, SCHEMA, { maxTokens: TAGGING_MAX_TOKENS, effort: 'high' });
  return buildSelection(catalog, raw, { forceWb, categoryHint: article.category });
}
