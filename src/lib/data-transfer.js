// Gesamtsicherung und -wiederherstellung: Einstellungen, Quellen, Regeln, Verlauf und
// „erledigt“-Liste als ein JSON-Objekt (chrome.storage.local).
//
// Format: { version: 1, exportedAt, includeSecrets, settings, sources, rules, history, processed }

import { getSources, normalizeSource, withStableIds, saveSourceList } from './sources-store.js';
import { exportHistory, importHistory } from './history.js';
import { exportRules, importRules } from './rules.js';

export const EXPORT_VERSION = 1;
export const SECRET_KEYS = ['anthropicApiKey', 'localLlmApiKey', 'deeplApiKey'];

const isObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * Alle Daten als JSON-Objekt. includeSecrets=false lässt API-Keys weg.
 */
export async function exportAllData({ includeSecrets = true } = {}) {
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

/** Prüft ein Import-Objekt; wirft mit deutscher Meldung. Liefert die vorhandenen Abschnitte. */
export function validateImport(obj) {
  if (typeof obj === 'string') {
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

/**
 * Importiert ein Export-Objekt. merge=true ergänzt (Einstellungen werden überlagert, Quellen/Regeln/Verlauf
 * vereinigt, leere API-Keys überschreiben vorhandene nicht); merge=false ersetzt die Abschnitte der Datei.
 * Liefert { settings, sources: { added, skipped, total }, rules, history, processed }.
 */
export async function importAllData(obj, { merge = true } = {}) {
  const data = validateImport(obj);
  const report = { settings: false, sources: null, rules: null, history: null, processed: 0 };

  if (data.settings) {
    const current = (await chrome.storage.local.get('settings')).settings || {};
    const incoming = { ...data.settings };
    delete incoming.sources;
    delete incoming.sourcesText;
    for (const k of SECRET_KEYS) if (!incoming[k]) delete incoming[k];
    const next = merge ? { ...current, ...incoming } : { ...incoming };
    if (!merge) {
      // Quellen kommen gleich aus dem Abschnitt „sources“; vorhandene Keys nicht verlieren, wenn die Datei keine hat
      for (const k of SECRET_KEYS) if (!next[k] && current[k]) next[k] = current[k];
      if (!data.sources && Array.isArray(current.sources)) next.sources = current.sources;
    }
    await chrome.storage.local.set({ settings: next });
    report.settings = true;
  }

  if (data.sources) {
    let current = [];
    if (merge) current = (await chrome.storage.local.get('settings')).settings?.sources || [];
    const list = [...current];
    const urlKey = (u) => String(u || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/+$/, '');
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
    const saved = await saveSourceList(withStableIds(list));
    report.sources = { added, skipped, total: saved.length };
  }

  if (data.rules) report.rules = await importRules(data.rules, { merge });
  if (data.history) report.history = await importHistory(data.history, { merge });

  if (data.processed) {
    const current = merge ? (await chrome.storage.local.get('processed')).processed || {} : {};
    const next = { ...current, ...data.processed };
    await chrome.storage.local.set({ processed: next });
    report.processed = Object.keys(data.processed).length;
  }
  return report;
}
