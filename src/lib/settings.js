// Zentrale Defaults und Zugriff auf die Einstellungen (chrome.storage.local).

import { DEFAULT_SOURCES, parseSourcesText } from './sources.js';

export const DEFAULT_SETTINGS = {
  // Sprachmodell für Relevanzprüfung und Tagging: 'claude' | 'local'
  llmProvider: 'claude',

  // Claude API (https://console.anthropic.com)
  anthropicApiKey: '',
  anthropicModel: 'claude-opus-5-5',

  // Lokales Modell am Heim-PC (OpenAI-kompatible Schnittstelle: Ollama, LM Studio, vLLM …)
  localLlmUrl: '',              // z. B. http://192.168.1.50:11434/v1
  localLlmModel: '',            // z. B. qwen2.5:32b
  localLlmApiKey: '',           // optional
  localLlmTimeoutSec: 600,

  // Übersetzungs-Anbieter: 'claude' | 'local' | 'deepl' | 'chrome'
  translator: 'claude',
  deeplApiKey: '',              // Free-Keys enden auf ":fx"

  // OSDP
  osdpUrlPattern: 'https://osdp.zentdok.at/*',
  osdpDateFormat: 'dd.MM.yyyy', // Platzhalter: dd, MM, yyyy, yy
  authorUnknownText: 'Autor ungenannt',
  tagLabelCyber: 'Cyber',       // Fallback-Tag, falls das Tagging ausfällt
  tagLabelKrimisi: 'KriMiSi',
  fillEnglishTab: true,         // Reiter „English Translated“ mit dem Original befüllen
  useSiteExtract: false,        // OSDP-eigenen „Extract“-Button für den Quelltext nutzen
  autoTags: true,               // Tags per Modell nach dem Tagging-Handbuch vergeben

  // Automatik
  sourcesText: '',              // leer = Standardquellen (lib/sources.js)
  minScore: 6,                  // Relevanz-Schwelle 0–10
  autoSave: true,               // nach dem Ausfüllen automatisch „Save“ klicken
  maxItemsPerRun: 25,
  autoRunTime: ''               // z. B. "08:00" → Mo–Fr automatisch starten; leer = aus
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

/** Ist das Sprachmodell für Relevanzprüfung/Tagging konfiguriert? Liefert '' oder eine Fehlermeldung. */
export function llmMissing(settings) {
  if (settings.llmProvider === 'local') return settings.localLlmUrl ? '' : 'URL des lokalen Modells fehlt (Einstellungen).';
  return settings.anthropicApiKey ? '' : 'Claude API-Key fehlt (Einstellungen).';
}
