// Relevanzprüfung von Schlagzeilen per Claude: Welche Meldungen gehören in
// „Cyber“ bzw. „KriMiSi“ und sind wichtig genug?

import { claudeJson } from './claude.js';

const BATCH_SIZE = 40;

const SYSTEM = `Du bist Analyst in einer österreichischen Behörde und sichtest englischsprachige Nachrichten für ein Dokumentationssystem mit zwei Bereichen.

BEREICH "cyber":
- Cyberangriffe mit internationaler, europäischer oder österreichischer Relevanz: Angriffe auf Staaten, Behörden, kritische Infrastruktur, Militär, große Unternehmen, Lieferketten; Ransomware mit großer Wirkung; staatlich gesteuerte Hackergruppen (APT); Spionage; große Datenlecks
- Aktiv ausgenutzte, weit verbreitete Schwachstellen und Notfall-Warnungen (z. B. CISA, ENISA, BSI)
- Aufstockung, Aufbau oder Verbesserung von Cyberabwehr-Systemen: neue Cyber-Einheiten, Strategien, Gesetze, große Investitionen, internationale Cyber-Kooperationen

BEREICH "krimisi" (Krisen, Militär, Sicherheit):
- Kriege, Kampfhandlungen, militärische Operationen, Waffenlieferungen, Truppenverlegungen, Rüstung, Verteidigungsbudgets, Übungen/Manöver
- Anschläge und Terror mit internationaler Bedeutung, Putsche, schwere Krisen und Unruhen, Sanktionen im Sicherheitskontext
- Wichtige diplomatische Treffen, Gipfel, Verhandlungen, Abkommen und Waffenstillstände (NATO, EU, UNO, OSZE, bilaterale Treffen von Staats-/Regierungschefs, Außen- und Verteidigungsministern)

NICHT relevant ("none"): Sport, Unterhaltung, Lokalkriminalität ohne internationale Bedeutung, Wirtschaft ohne Sicherheitsbezug, Produkttests, reine Meinungsbeiträge, Lifestyle, Wetter, Klatsch, allgemeine Technik-News ohne Sicherheitsbezug.

Bewerte jede Meldung:
- category: "cyber", "krimisi" oder "none"
- score: Wichtigkeit 0–10 (10 = muss unbedingt dokumentiert werden, 6 = relevant, 3 = Randnotiz, 0 = irrelevant)
- reason: eine kurze deutsche Begründung (max. 15 Wörter)

Dieselbe Meldung von mehreren Quellen ist ausdrücklich erwünscht – bewerte jede Zeile für sich.`;

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

/**
 * @param {Array<{id: number, title: string, summary: string, sourceName: string, sourceCategory: string}>} items
 * @param {object} settings
 * @param {(msg: string) => void} [onProgress]
 * @returns {Promise<Map<number, {category: string, score: number, reason: string}>>}
 */
export async function classifyItems(items, settings, onProgress = () => {}) {
  const result = new Map();
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    onProgress(`Relevanzprüfung ${Math.min(i + BATCH_SIZE, items.length)}/${items.length} …`);
    const lines = batch.map((it) => {
      const hint = it.sourceCategory && it.sourceCategory !== 'both' ? ` [Quelle-Schwerpunkt: ${it.sourceCategory}]` : '';
      const summary = it.summary ? ` — ${it.summary.slice(0, 220)}` : '';
      return `#${it.id} (${it.sourceName}${hint}): ${it.title}${summary}`;
    });
    const user = `Bewerte die folgenden ${batch.length} Meldungen. Gib für JEDE id genau ein Ergebnis zurück.\n\n${lines.join('\n')}`;
    const data = await claudeJson(settings, SYSTEM, user, SCHEMA, { maxTokens: 16000, effort: 'medium' });
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
