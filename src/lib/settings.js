// Zentrale Defaults und Zugriff auf die Einstellungen (chrome.storage.local).

export const DEFAULT_SETTINGS = {
  // Übersetzungs-Anbieter: 'claude' | 'deepl' | 'chrome'
  translator: 'claude',

  // Claude API (https://console.anthropic.com)
  anthropicApiKey: '',
  anthropicModel: 'claude-opus-5-5',

  // DeepL API (https://www.deepl.com/pro-api) – Free-Keys enden auf ":fx"
  deeplApiKey: '',

  // Datumsformat, das in das OSDP-Datumsfeld geschrieben wird.
  // Platzhalter: dd, MM, yyyy, yy
  osdpDateFormat: 'dd.MM.yyyy',

  // Text, der bei fehlendem Autor eingetragen wird.
  authorUnknownText: 'Autor ungenannt',

  // Welche Titelvariante in das OSDP-Titelfeld soll: 'de' | 'en'
  osdpTitleLanguage: 'de',

  // URL-Muster des OSDP-Tabs
  osdpUrlPattern: 'https://osdp.zentdok.at/*',

  // Optionale Überschreibung der Selektoren (JSON-String, siehe src/config/osdp-selectors.js)
  osdpSelectorOverrides: ''
};

export async function loadSettings() {
  const stored = await chrome.storage.local.get('settings');
  return { ...DEFAULT_SETTINGS, ...(stored.settings || {}) };
}

export async function saveSettings(settings) {
  await chrome.storage.local.set({ settings });
}
