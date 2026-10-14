// Gesamtsicherung und -wiederherstellung: Einstellungen, Quellen, Regeln, Verlauf und
// „erledigt“-Liste als ein JSON-Objekt (chrome.storage.local).
//
// Format: { version: 1, exportedAt, includeSecrets, settings, sources, rules, history, processed }
//
// Der Import prüft und berechnet zuerst alle Abschnitte im Speicher (Einstellungen nur mit bekannten
// Schlüsseln und geprüften Werten, Quellen validiert, Verlaufseinträge auf bekannte Felder reduziert)
// und schreibt dann alles mit EINEM chrome.storage.local.set – schlägt etwas fehl, bleibt der alte
// Stand vollständig erhalten.

import { getSources, normalizeSource, withStableIds } from './sources-store.js';
import { exportHistory, mergeHistory, parseTimestamp } from './history.js';
import { exportRules, mergeRules, withRulesLock } from './rules.js';
import { sanitizeSettings } from './settings.js';

export const EXPORT_VERSION = 1;
export const SECRET_KEYS = ['anthropicApiKey', 'localLlmApiKey', 'deeplApiKey'];
/** Obergrenze für Importdateien (Text). */
export const MAX_IMPORT_BYTES = 20 * 1024 * 1024;

const isObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * Alle Daten als JSON-Objekt. API-Keys nur mit includeSecrets=true (Standard: ohne).
 */
export async function exportAllData({ includeSecrets = false } = {}) {
  const stored = await chrome.storage.local.get(['settings', 'processed']);
  const settings = { ...(stored.settings || {}) };
  const sources = getSources(settings);
  delete settings.sources;
  delete settings.sourcesText;
  if (!includeSecrets) for (const k of SECRET_KEYS) delete settings[k];
  return {
    version: EXPORT_VERSION,
    app: 'OSDP News Helper',
    exportedAt: new Date().toISOString(),
    includeSecrets: !!includeSecrets,
    settings,
    sources,
    rules: await exportRules(),
    history: await exportHistory(),
    processed: isObject(stored.processed) ? stored.processed : {}
  };
}

/** Prüft ein Import-Objekt (oder JSON-Text); wirft mit deutscher Meldung. Liefert die vorhandenen Abschnitte. */
export function validateImport(obj) {
  if (typeof obj === 'string') {
    if (obj.length > MAX_IMPORT_BYTES) throw new Error(`Datei zu groß (${(obj.length / 1048576).toFixed(1)} MB, erlaubt sind ${MAX_IMPORT_BYTES / 1048576} MB).`);
    try {
      obj = JSON.parse(obj);
    } catch {
      throw new Error('Ungültige Datei: kein gültiges JSON.');
    }
  }
  if (!isObject(obj)) throw new Error('Ungültige Datei: JSON-Objekt erwartet.');
  if (obj.version != null && Number(obj.version) !== EXPORT_VERSION) throw new Error(`Unbekannte Dateiversion ${obj.version} (erwartet ${EXPORT_VERSION}).`);
  const out = {};
  if (obj.settings != null) {
    if (!isObject(obj.settings)) throw new Error('Ungültige Datei: „settings“ muss ein Objekt sein.');
    out.settings = obj.settings;
  }
  if (obj.sources != null) {
    if (!Array.isArray(obj.sources)) throw new Error('Ungültige Datei: „sources“ muss eine Liste sein.');
    out.sources = obj.sources;
  }
  if (obj.rules != null) {
    if (!Array.isArray(obj.rules)) throw new Error('Ungültige Datei: „rules“ muss eine Liste sein.');
    out.rules = obj.rules;
  }
  if (obj.history != null) {
    if (!Array.isArray(obj.history)) throw new Error('Ungültige Datei: „history“ muss eine Liste sein.');
    out.history = obj.history;
  }
  if (obj.processed != null) {
    if (!isObject(obj.processed)) throw new Error('Ungültige Datei: „processed“ muss ein Objekt sein.');
    out.processed = obj.processed;
  }
  if (!Object.keys(out).length) throw new Error('Die Datei enthält keine bekannten Daten (settings, sources, rules, history, processed).');
  return out;
}

const urlKey = (u) => String(u || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/+$/, '');

/**
 * Importiert ein Export-Objekt. merge=true ergänzt (Einstellungen werden überlagert, Quellen/Regeln/Verlauf
 * vereinigt, leere API-Keys überschreiben vorhandene nicht); merge=false ersetzt die Abschnitte der Datei.
 * Alles wird erst berechnet und dann in einem Schreibvorgang gespeichert (kein Teil-Import).
 * Liefert { settings: { applied, skipped: [{ key, reason }] } | null, sources: { added, skipped, total } | null,
 *           rules: { added, skipped, total } | null, history: { added, skipped, dropped, total } | null, processed: n }.
 */
export async function importAllData(obj, { merge = true } = {}) {
  const data = validateImport(obj);
  const report = { settings: null, sources: null, rules: null, history: null, processed: 0 };
  const now = Date.now();
  const stored = await chrome.storage.local.get(['settings', 'rules', 'history', 'processed']);
  const currentSettings = isObject(stored.settings) ? stored.settings : {};
  const payload = {};

  // 1) Einstellungen: nur bekannte Schlüssel mit gültigen Werten (Whitelist aus DEFAULT_SETTINGS)
  let nextSettings = null;
  if (data.settings) {
    const { settings: incoming, skipped } = sanitizeSettings(data.settings);
    for (const k of SECRET_KEYS) if (!incoming[k]) delete incoming[k];
    const next = merge ? { ...currentSettings, ...incoming } : { ...incoming };
    if (!merge) {
      // Quellen kommen gleich aus dem Abschnitt „sources“; vorhandene Keys nicht verlieren, wenn die Datei keine hat
      for (const k of SECRET_KEYS) if (!next[k] && currentSettings[k]) next[k] = currentSettings[k];
      if (!data.sources && Array.isArray(currentSettings.sources)) next.sources = currentSettings.sources;
    }
    nextSettings = next;
    report.settings = { applied: Object.keys(incoming).length, skipped };
  }

  // 2) Quellen: Basis der Vereinigung ist die wirksame Liste (inklusive Standardquellen), nicht der Rohwert
  if (data.sources) {
    const list = merge ? getSources(currentSettings) : [];
    let added = 0;
    let skipped = 0;
    for (const raw of data.sources) {
      let src;
      try {
        src = normalizeSource(raw);
      } catch {
        skipped++;
        continue;
      }
      if (list.some((s) => s.id === src.id || urlKey(s.url) === urlKey(src.url))) {
        skipped++;
        continue;
      }
      list.push(src);
      added++;
    }
    // wie saveSourceList: jede Quelle (auch vorhandene) validiert – ein Fehler bricht VOR dem Schreiben ab
    const normalized = withStableIds(list.map((s) => normalizeSource(s)));
    nextSettings = { ...(nextSettings || currentSettings), sources: normalized };
    report.sources = { added, skipped, total: normalized.length };
  }
  if (nextSettings) payload.settings = nextSettings;

  // 3) Regeln
  if (data.rules) {
    const { list, added, skipped } = mergeRules(merge ? stored.rules || [] : [], data.rules);
    payload.rules = list;
    report.rules = { added, skipped, total: list.length };
  }

  // 4) Verlauf (Einträge auf bekannte Felder reduziert, nur http(s)-URLs)
  if (data.history) {
    const { list, added, skipped, dropped } = mergeHistory(merge ? stored.history || [] : [], data.history, { now });
    payload.history = list;
    report.history = { added, skipped, dropped, total: list.length };
  }

  // 5) „erledigt“: Schlüssel sind Artikel-URLs, Werte { at, title, status }
  if (data.processed) {
    const next = merge && isObject(stored.processed) ? { ...stored.processed } : {};
    let n = 0;
    for (const [key, value] of Object.entries(data.processed)) {
      if (!/^https?:\/\//i.test(key) || key.length > 2000 || !isObject(value)) continue;
      next[key] = { at: parseTimestamp(value.at, now), title: String(value.title ?? '').slice(0, 500), status: String(value.status || 'saved').slice(0, 40) };
      n++;
    }
    payload.processed = next;
    report.processed = n;
  }

  // Ein einziger Schreibvorgang – in der Regel-Warteschlange, damit kein gleichzeitiges recordRuleHits dazwischenschreibt
  await withRulesLock(() => chrome.storage.local.set(payload));
  return report;
}
