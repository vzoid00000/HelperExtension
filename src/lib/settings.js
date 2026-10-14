// Zentrale Defaults und Zugriff auf die Einstellungen (chrome.storage.local).
//
// Die Quellen-Liste liegt seit v0.6 als Array `settings.sources` vor (Verwaltung in
// lib/sources-store.js). `sourcesText` bleibt nur für die einmalige Migration alter
// Einstellungen erhalten; `autoSave` gibt es nicht mehr (die Extension speichert nie selbst).
//
// validateUrlPattern() prüft das Tab-Muster für OSDP (chrome.tabs.query verlangt ein vollständiges
// Match-Pattern); sanitizeSettings() übernimmt fremde Einstellungen (Import) nur mit bekannten
// Schlüsseln und geprüften Werten.

export { getSources } from './sources-store.js';

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
  osdpDateFormat: 'dd/MM/yyyy', // OSDP-Datepicker (Moment, Locale en-GB). Platzhalter: dd, MM, yyyy, yy
  authorUnknownText: 'Autor ungenannt',
  tagLabelCyber: 'Cyber',       // Fallback-Tag, falls das Tagging ausfällt
  tagLabelKrimisi: 'KriMiSi',
  fillEnglishTab: true,         // Reiter „English Translated“ mit dem Original befüllen
  useSiteExtract: false,        // OSDP-eigenen „Extract“-Button für den Quelltext nutzen
  autoTags: true,               // Tags per Modell nach dem Tagging-Handbuch vergeben

  // Automatik
  sources: [],                  // Quellen-Objekte (leer = Standardquellen aus lib/sources.js)
  sourcesText: '',              // veraltet: nur noch für die Migration alter Einstellungen
  minScore: 6,                  // Relevanz-Schwelle 0–10
  maxItemsPerRun: 25,
  autoRunTime: ''               // z. B. "08:00" → Mo–Fr automatisch starten; leer = aus
};

/** Erlaubte Werte der Auswahlfelder und lesbare Namen der Anbieter (für Status-/Toast-Texte). */
export const LLM_PROVIDERS = ['claude', 'local'];
export const TRANSLATORS = ['claude', 'local', 'deepl', 'chrome'];
export const PROVIDER_LABELS = { claude: 'Claude API', local: 'Lokaler Server', deepl: 'DeepL', chrome: 'Chrome' };

/** Grenzen der Zahlenfelder (wie im Formular der Einstellungen). */
export const SETTING_RANGES = {
  minScore: { min: 0, max: 10 },
  maxItemsPerRun: { min: 1, max: 200 },
  localLlmTimeoutSec: { min: 30, max: 86400 }
};

export async function loadSettings() {
  const stored = await chrome.storage.local.get('settings');
  return { ...DEFAULT_SETTINGS, ...(stored.settings || {}) };
}

export async function saveSettings(settings) {
  await chrome.storage.local.set({ settings });
}

/** Ist das Sprachmodell für Relevanzprüfung/Tagging konfiguriert? Liefert '' oder eine Fehlermeldung. */
export function llmMissing(settings) {
  if (settings.llmProvider === 'local') return settings.localLlmUrl ? '' : 'URL des lokalen Modells fehlt (Einstellungen).';
  return settings.anthropicApiKey ? '' : 'Claude API-Key fehlt (Einstellungen).';
}

// ------------------------------------------------------------- Prüfungen ----

const PATTERN_EXAMPLE = 'https://osdp.zentdok.at/*';

/**
 * Prüft das URL-Muster des OSDP-Tabs (Match-Pattern für chrome.tabs.query). Liefert '' wenn gültig,
 * sonst den Fehlertext mit Beispiel. Regeln: beginnt mit http://, https:// oder file:///; der Host ist
 * ein konkreter Rechner (nicht nur „*“, Teil-Wildcard wie *.example.org ist erlaubt); der Pfad endet
 * auf „/*“ oder ist eine vollständige URL mit Pfad (chrome.tabs.query lehnt „http://host“ ohne Pfad ab).
 */
export function validateUrlPattern(pattern) {
  const p = String(pattern ?? '').trim();
  if (!p) return '';
  if (/\s/.test(p)) return `Das URL-Muster darf keine Leerzeichen enthalten, z. B. ${PATTERN_EXAMPLE}`;
  if (/^file:\/\//i.test(p)) {
    return /^file:\/\/\/\S*$/i.test(p) ? '' : `Ein file-Muster beginnt mit file:/// (drei Schrägstriche), z. B. file:///*`;
  }
  const m = /^(https?):\/\/([^/]*)(\/.*)?$/i.exec(p);
  if (!m) return `Das URL-Muster muss mit http://, https:// oder file:/// beginnen, z. B. ${PATTERN_EXAMPLE}`;
  const host = m[2];
  const path = m[3] || '';
  if (!host) return `Dem URL-Muster fehlt der Rechnername, z. B. ${PATTERN_EXAMPLE}`;
  if (host === '*' || /^\*(:\d+)?$/.test(host) || /^\*\.?$/.test(host)) return `Das URL-Muster muss einen konkreten OSDP-Rechner nennen – „${host}“ würde jeden Tab treffen. Beispiel: ${PATTERN_EXAMPLE}`;
  if (/\*/.test(host) && !/^\*\.[^*]+$/.test(host)) return `Ein Platzhalter im Rechnernamen ist nur als „*.“ am Anfang erlaubt (z. B. https://*.zentdok.at/*), Beispiel: ${PATTERN_EXAMPLE}`;
  if (!path) return `Das URL-Muster muss auf „/*“ enden oder eine vollständige URL mit Pfad sein, z. B. ${p}/*`;
  return '';
}

const clampNumber = (v, { min, max }, fallback) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
};

/**
 * Übernimmt fremde Einstellungen (z. B. aus einer Importdatei) nur mit Schlüsseln aus DEFAULT_SETTINGS
 * und geprüften Werten: Booleans müssen Booleans sein, Zahlen liegen in ihrem Bereich, Auswahlfelder
 * kennen nur ihre Werte, URL-Muster/Server-URL/Uhrzeit werden wie beim Speichern geprüft. Quellen
 * (`sources`, `sourcesText`) gehören nicht dazu – sie laufen über lib/sources-store.js.
 * Liefert { settings, skipped } – skipped nennt die verworfenen Schlüssel mit Grund.
 */
export function sanitizeSettings(input) {
  const settings = {};
  const skipped = [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { settings, skipped };
  for (const [key, raw] of Object.entries(input)) {
    if (!Object.prototype.hasOwnProperty.call(DEFAULT_SETTINGS, key) || key === 'sources' || key === 'sourcesText') {
      skipped.push({ key, reason: 'unbekannte Einstellung' });
      continue;
    }
    const def = DEFAULT_SETTINGS[key];
    if (typeof def === 'boolean') {
      if (typeof raw !== 'boolean') {
        skipped.push({ key, reason: 'kein Ja/Nein-Wert' });
        continue;
      }
      settings[key] = raw;
      continue;
    }
    if (typeof def === 'number') {
      const range = SETTING_RANGES[key] || { min: -Infinity, max: Infinity };
      const n = Number(raw);
      if (typeof raw === 'boolean' || raw === null || raw === '' || !Number.isFinite(n)) {
        skipped.push({ key, reason: 'keine Zahl' });
        continue;
      }
      settings[key] = clampNumber(n, range, def);
      continue;
    }
    // Zeichenketten
    if (typeof raw !== 'string' && typeof raw !== 'number') {
      skipped.push({ key, reason: 'kein Text' });
      continue;
    }
    const value = String(raw).trim().slice(0, 2000);
    let error = '';
    if (key === 'llmProvider' && !LLM_PROVIDERS.includes(value)) error = 'unbekannter Anbieter';
    else if (key === 'translator' && !TRANSLATORS.includes(value)) error = 'unbekannter Übersetzer';
    else if (key === 'osdpUrlPattern') error = validateUrlPattern(value);
    else if (key === 'localLlmUrl' && value && !/^https?:\/\/[^\s/]+/i.test(value)) error = 'Server-URL muss mit http:// oder https:// beginnen';
    else if (key === 'autoRunTime' && value && !/^\d{1,2}:\d{2}$/.test(value)) error = 'Uhrzeit nicht als HH:MM';
    if (error) {
      skipped.push({ key, reason: error });
      continue;
    }
    settings[key] = value;
  }
  return { settings, skipped };
}
