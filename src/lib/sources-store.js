// Quellenverwaltung: Quellen liegen als Array `settings.sources` in chrome.storage.local.
//
// Quelle: { id, name, url, category: 'cyber'|'krimisi'|'both', type: 'rss'|'html', pattern: '', enabled: true, addedAt }
//
// Fallback-Reihenfolge von getSources(): settings.sources (wenn nicht leer) → settings.sourcesText
// (alte Textliste, bis zur Migration) → DEFAULT_SOURCES. Jede Quelle bekommt eine stabile id
// (Slug aus dem Namen), damit UI-Zeilen, Zähler und Korrekturen sich darauf beziehen können.

import { DEFAULT_SOURCES, parseSourcesText, sourcesToText, SOURCE_CATEGORIES, SOURCE_KINDS } from './sources.js';
import { toIsoDate } from './dates.js';

export { DEFAULT_SOURCES, parseSourcesText, sourcesToText };

const MAX_NAME = 80;

/** Slug aus einem Namen: 'The Record (Recorded Future)' → 'the-record-recorded-future'. */
export function slugify(name) {
  const s = String(name || '')
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s || 'quelle';
}

/** Vergleichsschlüssel für URLs (Schema/Groß-Klein/abschließender Schrägstrich ignoriert). */
function urlKey(url) {
  return String(url || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/+$/, '');
}

/** Kopie der Liste, in der jede Quelle eine eindeutige id trägt (vorhandene ids bleiben). */
export function withStableIds(list) {
  const used = new Set();
  return (list || []).map((s) => {
    const base = s.id ? String(s.id) : slugify(s.name);
    let id = base;
    for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
    used.add(id);
    return { ...s, id };
  });
}

/**
 * Validiert eine Quelle und liefert ein bereinigtes Objekt.
 * Wirft bei fehlendem Namen, ungültiger URL oder ungültigem URL-Muster (RegExp-Quelltext).
 */
export function normalizeSource(input = {}) {
  if (!input || typeof input !== 'object') throw new Error('Ungültige Quelle.');
  // Führendes „#“ ist im Textformat das Zeichen für „deaktiviert“ und gehört nicht in den Namen
  const name = String(input.name ?? '').replace(/^\s*#+\s*/, '').replace(/\s+/g, ' ').trim();
  if (!name) throw new Error('Name der Quelle fehlt.');
  if (name.length > MAX_NAME) throw new Error(`Name der Quelle ist zu lang (max. ${MAX_NAME} Zeichen).`);

  const url = String(input.url ?? '').trim();
  if (!url) throw new Error('URL der Quelle fehlt.');
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Ungültige URL: „${url}“`);
  }
  if (!/^https?:$/.test(parsed.protocol)) throw new Error('Die URL muss mit http:// oder https:// beginnen.');
  if (!parsed.hostname) throw new Error(`Ungültiger Hostname in der URL: „${url}“`);

  const category = String(input.category ?? 'both').toLowerCase();
  const type = String(input.type ?? 'rss').toLowerCase();
  const pattern = String(input.pattern ?? '').trim();
  if (pattern) {
    try {
      new RegExp(pattern);
    } catch (e) {
      throw new Error(`Ungültiges URL-Muster (regulärer Ausdruck): ${e.message}`);
    }
  }
  const enabled = !(input.enabled === false || input.enabled === 'false' || input.enabled === 0);

  return {
    id: input.id ? String(input.id) : slugify(name),
    name,
    url,
    category: SOURCE_CATEGORIES.includes(category) ? category : 'both',
    type: SOURCE_KINDS.includes(type) ? type : 'rss',
    pattern,
    enabled,
    addedAt: Number(input.addedAt) || Date.now()
  };
}

/** Aktive Quellen-Liste aus den Einstellungen (Fallback auf Textliste bzw. Standardquellen), immer mit ids. */
export function getSources(settings = {}) {
  if (Array.isArray(settings.sources) && settings.sources.length) return withStableIds(settings.sources);
  if (settings.sourcesText) {
    const parsed = parseSourcesText(settings.sourcesText);
    if (parsed.length) return withStableIds(parsed);
  }
  return withStableIds(DEFAULT_SOURCES);
}

/** Gilt gerade die Standardliste (keine eigene Liste gespeichert)? Für den Hinweis in der Quellen-Ansicht. */
export function usesDefaultSources(settings = {}) {
  if (Array.isArray(settings.sources) && settings.sources.length) return false;
  if (settings.sourcesText && parseSourcesText(settings.sourcesText).length) return false;
  return true;
}

/** Quellen eines Bereichs; 'both'-Quellen gehören zu beiden Bereichen, area 'both' liefert alle. */
export function sourcesByArea(list, area = 'both', { enabledOnly = false } = {}) {
  return (list || []).filter((s) => {
    if (enabledOnly && s.enabled === false) return false;
    if (area === 'cyber' || area === 'krimisi') return s.category === area || s.category === 'both' || !s.category;
    return true;
  });
}

// --------------------------------------------------------------- Storage ----

async function readSettings() {
  const stored = await chrome.storage.local.get('settings');
  return stored.settings || {};
}

async function writeSettings(patch) {
  const settings = { ...(await readSettings()), ...patch };
  await chrome.storage.local.set({ settings });
  return settings;
}

/** Aktuelle Quellen-Liste (mit ids). */
export async function loadSourceList() {
  return getSources(await readSettings());
}

/** Speichert die komplette Liste (jede Quelle wird validiert). Leere Liste = Standardquellen. */
export async function saveSourceList(list) {
  const normalized = withStableIds((list || []).map((s) => normalizeSource(s)));
  await writeSettings({ sources: normalized });
  return normalized;
}

/** Fügt eine Quelle hinzu; wirft bei ungültigen Angaben oder bereits vorhandener URL. */
export async function addSource(input) {
  const list = await loadSourceList();
  const src = normalizeSource({ ...input, id: '' });
  const clash = list.find((s) => urlKey(s.url) === urlKey(src.url));
  if (clash) throw new Error(`Diese URL ist bereits als Quelle „${clash.name}“ eingetragen.`);
  const [withId] = withStableIds([...list, src]).slice(-1);
  const saved = await saveSourceList([...list, withId]);
  return saved.find((s) => s.id === withId.id);
}

/** Ändert Felder einer Quelle (id bleibt). Wirft, wenn die id unbekannt ist oder die Änderung ungültig. */
export async function updateSource(id, patch = {}) {
  const list = await loadSourceList();
  const idx = list.findIndex((s) => s.id === id);
  if (idx < 0) throw new Error('Quelle nicht gefunden.');
  const merged = normalizeSource({ ...list[idx], ...patch, id: list[idx].id });
  const clash = list.find((s, i) => i !== idx && urlKey(s.url) === urlKey(merged.url));
  if (clash) throw new Error(`Diese URL ist bereits als Quelle „${clash.name}“ eingetragen.`);
  list[idx] = merged;
  await saveSourceList(list);
  return merged;
}

/** Entfernt eine Quelle. Liefert true, wenn sie existierte. */
export async function removeSource(id) {
  const list = await loadSourceList();
  const rest = list.filter((s) => s.id !== id);
  if (rest.length === list.length) return false;
  await saveSourceList(rest);
  return true;
}

/** Setzt die Liste auf die Standardquellen zurück (gespeichert wird „leer“ = Standard). */
export async function resetSources() {
  await writeSettings({ sources: [], sourcesText: '' });
  return withStableIds(DEFAULT_SOURCES);
}

/**
 * Einmalige Migration der alten Textliste (settings.sourcesText) in settings.sources.
 * Verändert das übergebene settings-Objekt mit und speichert. Liefert { migrated, sources, dropped, droppedNames }:
 * dropped = Zeilen der alten Liste, die heute nicht mehr gültig sind (z. B. kaputtes URL-Muster) und
 * verworfen wurden – der Aufrufer soll sie im Hinweis nennen, der alte Text ist danach weg.
 */
export async function migrateSources(settings = null) {
  const s = settings || (await readSettings());
  const hasList = Array.isArray(s.sources) && s.sources.length > 0;
  if (!s.sourcesText) return { migrated: false, sources: getSources(s), dropped: 0, droppedNames: [] };
  if (hasList) {
    // Liste existiert schon → alter Text ist überholt und wird nur verworfen
    s.sourcesText = '';
    await writeSettings({ sourcesText: '' });
    return { migrated: false, sources: getSources(s), dropped: 0, droppedNames: [] };
  }
  const rawLines = s.sourcesText.split('\n').map((l) => l.trim()).filter(Boolean);
  const parsed = parseSourcesText(s.sourcesText);
  const sources = [];
  const droppedNames = [];
  for (const p of parsed) {
    try {
      sources.push(normalizeSource(p));
    } catch {
      // ungültige Zeile der alten Liste (z. B. Name zu lang, kaputtes Muster) wird verworfen
      droppedNames.push(p.name || p.url);
    }
  }
  // Zeilen, die schon parseSourcesText nicht lesen konnte (keine URL), zählen ebenfalls als verworfen
  const unparsed = Math.max(0, rawLines.length - parsed.length);
  const list = withStableIds(sources);
  s.sources = list;
  s.sourcesText = '';
  await writeSettings({ sources: list, sourcesText: '' });
  return { migrated: list.length > 0, sources: getSources(s), dropped: droppedNames.length + unparsed, droppedNames };
}

/**
 * Lädt eine Quelle probeweise. Liefert { ok, count, sample: [{ title, url, dateIso }], error, empty }.
 * empty=true: Quelle ließ sich laden, enthielt aber keine Meldungen (sonst ist error ein Ladefehler).
 * Läuft nur in einer Extension-Seite (DOMParser, Hintergrund-Tabs).
 */
export async function testSource(source, { limit = 5 } = {}) {
  let src;
  try {
    src = normalizeSource(source);
  } catch (e) {
    return { ok: false, count: 0, sample: [], error: e.message, empty: false };
  }
  try {
    const { loadSource } = await import('./feeds.js');
    const items = await loadSource(src);
    const sample = items.slice(0, Math.max(0, limit)).map((it) => ({
      title: it.title || '',
      url: it.url || '',
      dateIso: it.date ? toIsoDate(it.date) : ''
    }));
    if (!items.length) return { ok: false, count: 0, sample, error: 'Keine Einträge gefunden (Feed leer, Seite ohne Artikel-Links oder URL-Muster passt nicht).', empty: true };
    return { ok: true, count: items.length, sample, error: '', empty: false };
  } catch (e) {
    return { ok: false, count: 0, sample: [], error: e?.message || String(e), empty: false };
  }
}
