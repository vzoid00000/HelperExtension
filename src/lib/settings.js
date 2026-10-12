// Zentrale Defaults und Zugriff auf die Einstellungen (chrome.storage.local).

import { DEFAULT_SOURCES, parseSourcesText } from './sources.js';

export const DEFAULT_SETTINGS = {
  // Übersetzungs-Anbieter: 'claude' | 'deepl' | 'chrome'
  translator: 'claude',

  // Claude API (https://console.anthropic.com) – auch für die Relevanzprüfung
  anthropicApiKey: '',
  anthropicModel: 'claude-opus-5-5',

  // DeepL API (https://www.deepl.com/pro-api) – Free-Keys enden auf ":fx"
  deeplApiKey: '',

  // OSDP
  osdpUrlPattern: 'https://osdp.zentdok.at/*',
  osdpDateFormat: 'dd.MM.yyyy',     // Platzhalter: dd, MM, yyyy, yy
  authorUnknownText: 'Autor ungenannt',
  tagLabelCyber: 'Cyber',           // Bezeichnung der Checkbox im Reiter „Tags“
  tagLabelKrimisi: 'KriMiSi',
  fillEnglishTab: true,             // Reiter „English Translated“ mit dem Original befüllen
  useSiteExtract: false,            // OSDP-eigenen „Extract“-Button für den Quelltext nutzen

  // Automatik
  sourcesText: '',                  // leer = Standardquellen (lib/sources.js)
  minScore: 6,                      // Relevanz-Schwelle 0–10
  autoSave: true,                   // nach dem Ausfüllen automatisch „Save“ klicken
  maxItemsPerRun: 25,               // Obergrenze je Durchlauf
  autoRunTime: ''                   // z. B. "08:00" → Mo–Fr automatisch starten; leer = aus
};

export async function loadSettings() {
  const stored = await chrome.storage.local.get('settings');
  return { ...DEFAULT_SETTINGS, ...(stored.settings || {}) };
}

export async function saveSettings(settings) {
  await chrome.storage.local.set({ settings });
}

/** Aktive Quellen-Liste (aus den Einstellungen oder Defaults). */
export function getSources(settings) {
  const custom = settings.sourcesText ? parseSourcesText(settings.sourcesText) : [];
  return custom.length ? custom : DEFAULT_SOURCES;
}
