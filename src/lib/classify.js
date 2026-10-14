// Relevanzprüfung von Schlagzeilen: Welche Meldungen gehören in
// „Cyber“ bzw. „KriMiSi“ und sind wichtig genug?
// Token-sparsam: kompakte Eingabezeilen (Teaser ≤ 160 Zeichen), 50 Meldungen je Anfrage,
// Begründung ≤ 12 Wörter. Das Regelwerk des Bearbeiters (rulesText) wird an den System-Prompt angehängt.

import { llmJson } from './llm.js';

export const BATCH_SIZE = 50;
export const SUMMARY_MAX = 160;

const SYSTEM = `Du sichtest für eine österreichische Behörde englische Schlagzeilen für ein Dokumentationssystem mit zwei Bereichen.

"cyber": Cyberangriffe mit internationaler, europäischer oder österreichischer Relevanz (auf Staaten, Behörden, kritische Infrastruktur, Militär, große Unternehmen, Lieferketten; Ransomware mit großer Wirkung; staatliche Hackergruppen/APT; Spionage; große Datenlecks); aktiv ausgenutzte, weit verbreitete Schwachstellen und Notfall-Warnungen (CISA, ENISA, BSI); Aufbau oder Ausbau von Cyberabwehr (neue Einheiten, Strategien, Gesetze, große Investitionen, internationale Cyber-Kooperation).

"krimisi" (Krisen, Militär, Sicherheit): Kriege, Kampfhandlungen, Militäroperationen, Waffenlieferungen, Truppenverlegungen, Rüstung, Verteidigungsbudgets, Übungen; Anschläge und Terror von internationaler Bedeutung, Putsche, schwere Krisen und Unruhen, Sanktionen im Sicherheitskontext; wichtige Treffen, Gipfel, Verhandlungen, Abkommen und Waffenstillstände (NATO, EU, UNO, OSZE, Staats-/Regierungschefs, Außen-/Verteidigungsminister).

"none": Sport, Unterhaltung, Lokalkriminalität, Wirtschaft oder Technik ohne Sicherheitsbezug, Produkttests, reine Meinung, Lifestyle, Wetter, Klatsch.

Je Meldung: category ("cyber" | "krimisi" | "none"), score 0–10 (10 = unbedingt dokumentieren, 6 = relevant, 3 = Randnotiz, 0 = irrelevant), reason (deutsch, max. 12 Wörter). Jede Zeile für sich bewerten, auch wenn dieselbe Meldung mehrfach vorkommt. Genau ein Ergebnis je id.`;

const SCHEMA = {
  type: 'object',
  properties: {
    results: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          category: { type: 'string', enum: ['cyber', 'krimisi', 'none'] },
          score: { type: 'integer' },
          reason: { type: 'string' }
        },
        required: ['id', 'category', 'score', 'reason'],
        additionalProperties: false
      }
    }
  },
  required: ['results'],
  additionalProperties: false
};

const oneLine = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const shorten = (s, max) => {
  const t = oneLine(s);
  return t.length > max ? t.slice(0, max - 1).replace(/\s\S*$/, '') + '…' : t;
};

/** System-Prompt der Relevanzprüfung inkl. optionalem Regelwerk-Block. */
export function buildClassifySystem(rulesText = '') {
  const rules = String(rulesText || '').trim();
  return rules ? `${SYSTEM}\n\n${rules}` : SYSTEM;
}

/** Eine kompakte Eingabezeile: "#id|Quelle|Schwerpunkt: Titel — Teaser". */
export function classifyLine(it) {
  const focus = it.sourceCategory && it.sourceCategory !== 'both' ? `|${it.sourceCategory}` : '';
  const summary = it.summary ? ` — ${shorten(it.summary, SUMMARY_MAX)}` : '';
  return `#${it.id}|${oneLine(it.sourceName)}${focus}: ${oneLine(it.title)}${summary}`;
}

/**
 * @param {Array<{id: number, title: string, summary: string, sourceName: string, sourceCategory: string}>} items
 * @param {object} settings
 * @param {(msg: string) => void} [onProgress]
 * @param {{rulesText?: string}} [opts]  rulesText = Regelwerk-Block aus der App
 * @returns {Promise<Map<number, {category: string, score: number, reason: string}>>}
 */
export async function classifyItems(items, settings, onProgress = () => {}, opts = {}) {
  const result = new Map();
  const system = buildClassifySystem(opts.rulesText || '');
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    onProgress(`Relevanzprüfung ${Math.min(i + BATCH_SIZE, items.length)}/${items.length} …`);
    const user = `${batch.length} Meldungen (Format "#id|Quelle|Schwerpunkt der Quelle: Titel — Teaser"):\n${batch.map(classifyLine).join('\n')}`;
    const data = await llmJson(settings, system, user, SCHEMA, { maxTokens: 8000, effort: 'medium' });
    for (const r of data.results || []) {
      result.set(r.id, {
        category: r.category,
        score: Math.max(0, Math.min(10, Math.round(Number(r.score) || 0))),
        reason: String(r.reason || '')
      });
    }
    for (const it of batch) {
      if (!result.has(it.id)) result.set(it.id, { category: 'none', score: 0, reason: 'keine Bewertung erhalten' });
    }
  }
  return result;
}
