// Tag-Vorschlag für einen Artikel nach dem OSDP-Tagging-Handbuch.
// Das Modell liest den Artikel und den Katalog und liefert Struktur, Quellentyp,
// Orte, Themen-Tags, KI-Sonderregel, WB-Empfehlung und eine Kurzzusammenfassung.
// buildSelection() prüft alles gegen den Katalog und die festen Regeln.

import { llmJson } from './llm.js';
import { buildSelection, SOURCE_TYPES } from './tag-catalog.js';

const RULES = `Du vergibst Tags für Newsartikel in einem österreichischen Dokumentationssystem (OSDP). Es gelten die Regeln des OSDP-Tagging-Handbuchs:

PFLICHT bei jedem Artikel
1. Genau EINE Struktur: "Cyber" (Kern = Cybervorfall, digitale Bedrohung, Informationssicherheit, Cyberabwehr), "KriMiSi" (Kern = Krisen, Konflikte, Militär, Sicherheit, Verteidigung, sicherheitspolitisches Geschehen) oder ausnahmsweise "InnoTech" (eigenständige, bedeutsame Innovationsmeldung mit militärischem/Cyber-Nutzen). Maßgeblich ist der berichtete Schwerpunkt, nicht ein Schlüsselwort.
2. Quellentyp nach der TATSÄCHLICHEN Quelle: ${SOURCE_TYPES.join(', ')}. Redaktionelle Nachrichtenmedien = "Nachrichtenseite" (der Normalfall). Behörden-/Regierungsseiten = "Behördenseite", Firmenblogs/Herstellerseiten = "Unternehmens- oder Vereinsseite", private Blogs = "Blog".
3. Mindestens eine geografische Zuordnung: nur unmittelbar relevante Staaten/Regionen (Ereignisort, direkt beteiligte oder angegriffene Staaten, zentral handelnde Staaten). Bloße Erwähnung, Nationalität Unbeteiligter oder Sitz eines Mediums zählen nicht. "Global" nur bei wirklich weltweiter, nicht sinnvoll eingrenzbarer Betroffenheit – nicht automatisch bei vielen Ländern. "kein Standort" nur, wenn gar keine Zuordnung möglich ist. Meere, Luftraum, Weltraum nur wenn inhaltlich betroffen.
4. Alle weiteren inhaltlich zutreffenden Themen-Tags aus Cyber, KriMiSi, InnoTech und Allgemeine Tags – unabhängig von der gewählten Struktur. Nicht übertaggen: nur belegte Sachverhalte, keine Schlüsselwort-Treffer.

HIERARCHIE
- Passt ein spezifischer Untertag, diesen wählen und den Übertag NICHT zusätzlich setzen.
- Passt kein Untertag, aber der Themenbereich, den passenden Übertag wählen (z. B. ein Remote-Access-Trojaner → "Schadsoftware", nicht "Computervirus"/"Spyware").
- Über- und Untertag gemeinsam nur in begründeter Ausnahme.
- Nur Tags aus dem Katalog verwenden, exakt so geschrieben. Niemals Tags erfinden.

AUFTRAGSTAGS
- KI-Sonderregel: Ist Künstliche Intelligenz tatsächlich Thema des Artikels (KI-Entwicklung, -Einsatz, -Risiko, -Tool), ki = true (setzt "[KI_]Tools und Usecases"). Beiläufige Erwähnung reicht nicht.
- Wochenbericht (WB): Nur besonders wichtige Nachrichten nach redaktionellem Ermessen bekommen "WB-Cyber" (bei Struktur Cyber) bzw. "WB-KriMiSi" (bei Struktur KriMiSi): größere Cyberkampagnen, Vorfälle mit strategischen Folgen, entscheidende Sicherheitsänderungen, große Konflikteskalationen, bedeutende militärische/diplomatische Maßnahmen. Die meisten Artikel bekommen KEINEN WB-Tag. Bei InnoTech kein WB.
- Keine anderen Auftragstags.

NIE vergeben: Newsinfo → zeitlicher Aspekt, Informationsverschmutzung, Social Media Post (thematische Tags wie "Informationskrieg" oder "Soziale Medien" bleiben erlaubt).

AUSGABE (JSON)
- structure: "Cyber" | "KriMiSi" | "InnoTech"
- sourceType: einer der Quellentypen
- locations: Liste exakter Ortsnamen aus dem Katalog (z. B. "USA", "Ukraine", "Russland", "Vereinigtes Königreich", "Taiwan", "Global")
- topics: Liste von Themen-Tags als vollständige Pfade mit " > " (z. B. "Cyber > Cyberangriff > Schadsoftware > Ransomware", "KriMiSi > Militärische Handlung > Angriff > Luftangriff", "Allgemeine Tags > Akteur > Internationale Organisation > NATO"), typischerweise 2–6 Tags
- ki: true/false
- wb: "none" | "WB-Cyber" | "WB-KriMiSi"
- wbReason: ein kurzer deutscher Satz, warum (nicht) WB-würdig
- summary: 1–2 Sätze deutsche Zusammenfassung des Artikels (Sachverhalt, Akteure, Folge)
- notes: Grenzfälle/Begründungen (sonst leer)`;

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

function catalogText(catalog) {
  return [
    '=== THEMEN-TAGS (Pfadschreibweise mit " > ") ===',
    catalog.treeText('Cyber'),
    catalog.treeText('KriMiSi'),
    catalog.treeText('InnoTech'),
    catalog.treeText('Allgemeine Tags'),
    '',
    '=== GEOGRAFISCHE LOKATIONEN (nur den Ortsnamen angeben) ===',
    catalog.treeText('Newsinfo → geographische Lokationen')
  ].join('\n');
}

let cachedCatalogText = null;

/**
 * @param {object} article  { title, titleDe, text, url, siteName, sourceName, category, score }
 * @param {TagCatalog} catalog
 * @param {object} settings
 * @param {object} [opts]  { forceWb: 'auto'|'yes'|'no' }
 */
export async function suggestTags(article, catalog, settings, opts = {}) {
  if (!cachedCatalogText) cachedCatalogText = catalogText(catalog);
  const system = [
    { type: 'text', text: RULES },
    { type: 'text', text: cachedCatalogText, cache_control: { type: 'ephemeral' } }
  ];
  const text = (article.text || '').slice(0, 14000);
  const hints = [];
  if (article.category) hints.push(`Vorläufige Einordnung aus der Relevanzprüfung: ${article.category === 'krimisi' ? 'KriMiSi' : 'Cyber'}${article.score != null ? `, Wichtigkeit ${article.score}/10` : ''}.`);
  if (opts.forceWb === 'yes') hints.push('Der Bearbeiter hat diese Meldung bereits als WB-würdig markiert.');
  if (opts.forceWb === 'no') hints.push('Der Bearbeiter hat entschieden: kein WB-Tag.');

  const user = [
    `Quelle: ${article.sourceName || ''} (${article.siteName || ''})`,
    `URL: ${article.url || ''}`,
    `Titel: ${article.title || ''}`,
    article.titleDe ? `Titel (DE): ${article.titleDe}` : '',
    hints.length ? hints.join(' ') : '',
    '',
    'ARTIKELTEXT:',
    text
  ].filter((l) => l !== '').join('\n');

  const raw = await llmJson(settings, system, user, SCHEMA, { maxTokens: 4000, effort: 'high' });
  return buildSelection(catalog, raw, { forceWb: opts.forceWb || 'auto', categoryHint: article.category });
}
