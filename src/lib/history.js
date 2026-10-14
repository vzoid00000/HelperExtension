// Verlauf der eingetragenen News (Tagesprotokoll, WB-Übersicht, Duplikate, Suche, Export).
//
// Eintrag: { id, at, url, title, titleDe, sourceName, siteName, dateIso, structure ('Cyber'|'KriMiSi'|'InnoTech'),
//            wb ('WB-Cyber'|'WB-KriMiSi'|''), ki, tags (Pfade), summary, author, authorUnknown, saved, problems }

import { formatDate } from './dates.js';

const KEY = 'history';
const MAX = 3000;

export async function loadHistory() {
  const stored = await chrome.storage.local.get(KEY);
  return stored[KEY] || [];
}

const newId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

/**
 * @param {object} entry  { url, title, titleDe, sourceName, siteName, dateIso, structure, wb, ki, tags, summary,
 *                          author, authorUnknown, saved }
 */
export async function addHistoryEntry(entry) {
  const list = await loadHistory();
  const e = { id: newId(), at: Date.now(), ...entry };
  list.unshift(e);
  if (list.length > MAX) list.length = MAX;
  await chrome.storage.local.set({ [KEY]: list });
  return e;
}

export async function updateHistoryEntry(id, patch) {
  const list = await loadHistory();
  const e = list.find((x) => x.id === id);
  if (!e) return null;
  Object.assign(e, patch);
  await chrome.storage.local.set({ [KEY]: list });
  return e;
}

export async function removeHistoryEntry(id) {
  const list = (await loadHistory()).filter((x) => x.id !== id);
  await chrome.storage.local.set({ [KEY]: list });
}

/** Löscht den gesamten Verlauf. */
export async function clearHistory() {
  await chrome.storage.local.set({ [KEY]: [] });
}

// ------------------------------------------------------------ Zeiträume ----

export function startOfToday(now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

/** Montag 00:00 der laufenden Woche. */
export function startOfWeek(now = new Date()) {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const back = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - back);
  return d.getTime();
}

/** Erster Tag des laufenden Monats, 00:00. */
export function startOfMonth(now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
}

/** @param {'today'|'week'|'month'|'all'|string} range */
export function filterHistory(list, range, now = new Date()) {
  if (range === 'today') return list.filter((e) => e.at >= startOfToday(now));
  if (range === 'week') return list.filter((e) => e.at >= startOfWeek(now));
  if (range === 'month') return list.filter((e) => e.at >= startOfMonth(now));
  return list;
}

export function historyStats(list, now = new Date()) {
  const today = filterHistory(list, 'today', now);
  const week = filterHistory(list, 'week', now);
  return {
    today: today.length,
    todayCyber: today.filter((e) => e.structure === 'Cyber').length,
    todayKrimisi: today.filter((e) => e.structure === 'KriMiSi').length,
    week: week.length,
    wbCyber: week.filter((e) => e.wb === 'WB-Cyber').length,
    wbKrimisi: week.filter((e) => e.wb === 'WB-KriMiSi').length
  };
}

/**
 * Zähler für einen Zeitraum. `duplicates` = Einträge des Zeitraums, die eine ältere Meldung
 * (gleiche URL oder gleicher Titel) irgendwo im Verlauf wiederholen.
 */
export function statsForRange(list, range = 'all', now = new Date()) {
  const sub = filterHistory(list || [], range, now);
  const dup = findDuplicates(list || []);
  return {
    total: sub.length,
    cyber: sub.filter((e) => e.structure === 'Cyber').length,
    krimisi: sub.filter((e) => e.structure === 'KriMiSi').length,
    innotech: sub.filter((e) => e.structure === 'InnoTech').length,
    wbCyber: sub.filter((e) => e.wb === 'WB-Cyber').length,
    wbKrimisi: sub.filter((e) => e.wb === 'WB-KriMiSi').length,
    ki: sub.filter((e) => !!e.ki).length,
    duplicates: sub.filter((e) => dup.has(e.id)).length
  };
}

// ----------------------------------------------------------- Duplikate ----

const TRACKING_PARAM = /^(utm_|fbclid$|gclid$|dclid$|msclkid$|yclid$|igshid$|mc_cid$|mc_eid$|_hsenc$|_hsmi$|ref$|src$|cmpid$|ocid$|ns_mchannel$|ns_campaign$|s_cid$)/i;

/** URL ohne Fragment, Tracking-Parameter und abschließenden Schrägstrich (Schlüssel für „schon erledigt“). */
export function normalizeUrl(u) {
  try {
    const url = new URL(String(u || '').trim());
    url.hash = '';
    for (const k of [...url.searchParams.keys()]) if (TRACKING_PARAM.test(k)) url.searchParams.delete(k);
    return url.href.replace(/\/$/, '').replace(/\?$/, '');
  } catch {
    return String(u || '').trim();
  }
}

/** Noch strengerer Vergleichsschlüssel: zusätzlich ohne Schema, „www.“ und Groß-/Kleinschreibung. */
export function urlKey(u) {
  return normalizeUrl(u).replace(/^https?:\/\//i, '').replace(/^www\./i, '').toLowerCase();
}

/** Titel für Vergleiche: Kleinschreibung, ohne Satzzeichen, einfache Leerzeichen. */
export function normalizeTitle(t) {
  return String(t || '')
    .toLowerCase()
    .replace(/[‘’‚“”„'"`´]/g, '')
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const MIN_TITLE_KEY = 8;

const titleKeyOf = (e) => {
  const k = normalizeTitle(e.title || e.titleDe);
  return k.length >= MIN_TITLE_KEY ? k : '';
};

/**
 * Duplikate im Verlauf: Map<id, { ofId, by: 'url'|'title' }>. Jeder Eintrag zeigt auf den
 * ÄLTESTEN Eintrag mit derselben URL bzw. (wenn die URL abweicht) mit demselben Titel.
 */
export function findDuplicates(list) {
  const out = new Map();
  const byUrl = new Map();
  const byTitle = new Map();
  const sorted = [...(list || [])].sort((a, b) => (a.at || 0) - (b.at || 0));
  for (const e of sorted) {
    const uk = e.url ? urlKey(e.url) : '';
    const tk = titleKeyOf(e);
    if (uk && byUrl.has(uk)) out.set(e.id, { ofId: byUrl.get(uk), by: 'url' });
    else if (tk && byTitle.has(tk)) out.set(e.id, { ofId: byTitle.get(tk), by: 'title' });
    if (uk && !byUrl.has(uk)) byUrl.set(uk, e.id);
    if (tk && !byTitle.has(tk)) byTitle.set(tk, e.id);
  }
  return out;
}

/** Ältester Verlaufseintrag mit gleicher URL, sonst mit gleichem Titel; null, wenn nichts passt. */
export function findInHistory(list, { url = '', title = '' } = {}) {
  const uk = url ? urlKey(url) : '';
  const tk = normalizeTitle(title);
  const pick = (pred) => {
    let best = null;
    for (const e of list || []) if (pred(e) && (!best || (e.at || 0) < (best.at || 0))) best = e;
    return best;
  };
  if (uk) {
    const hit = pick((e) => e.url && urlKey(e.url) === uk);
    if (hit) return hit;
  }
  if (tk.length >= MIN_TITLE_KEY) {
    const hit = pick((e) => titleKeyOf(e) === tk);
    if (hit) return hit;
  }
  return null;
}

// --------------------------------------------------------------- Suche ----

/** Volltextsuche (alle Wörter müssen vorkommen) über Titel, Titel DE, Quelle, Zusammenfassung, Tags, Autor, URL. */
export function searchHistory(list, query) {
  const words = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return list || [];
  return (list || []).filter((e) => {
    const hay = [
      e.title, e.titleDe, e.sourceName, e.siteName, e.summary, e.author, e.url,
      e.structure, e.wb, ...(e.tags || [])
    ].filter(Boolean).join(' \n ').toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

// --------------------------------------------------------- Import/Export ----

/** Kopie des Verlaufs (für Sicherung/Übertragung). */
export async function exportHistory() {
  return (await loadHistory()).map((e) => ({ ...e }));
}

// Bekannte Felder eines Eintrags in der Reihenfolge, in der der Lauf sie schreibt (alles andere wird
// beim Import verworfen): [Name, Art, Längengrenze]. Die Reihenfolge hält einen Export nach Re-Import identisch.
const ENTRY_FIELDS = [
  ['url', 'str', 2000], ['title', 'str', 500], ['titleDe', 'str', 500], ['sourceName', 'str', 200], ['siteName', 'str', 200],
  ['dateIso', 'str', 40], ['structure', 'str', 40], ['wb', 'str', 40], ['ki', 'bool'], ['tags', 'list'], ['chipsFinal', 'list'],
  ['summary', 'str', 4000], ['author', 'str', 300], ['authorUnknown', 'bool'], ['saved', 'bool?'], ['confirmedBy', 'str', 40],
  ['problems', 'list'], ['warnings', 'list']
];
const MAX_LIST = 100;

/** Zeitstempel aus Zahl (ms), Ziffernfolge oder ISO-Text; sonst fallback (Import-Zeitpunkt). */
export function parseTimestamp(v, fallback) {
  if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? v : fallback;
  if (typeof v === 'string' && v.trim()) {
    const s = v.trim();
    const n = /^\d+$/.test(s) ? Number(s) : Date.parse(s);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  }
  return fallback;
}

/**
 * Reduziert einen fremden Eintrag (Import) auf bekannte Felder mit geprüften Werten: nur http(s)-URLs,
 * Texte gekürzt, Listen nur aus Zeichenketten, `at` als Zahl (fehlend/unlesbar → now). Liefert null,
 * wenn weder URL noch Titel übrig bleiben.
 */
export function sanitizeEntry(raw, now = Date.now()) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const e = {
    id: raw.id != null && String(raw.id).trim() ? String(raw.id).trim().slice(0, 80) : newId(),
    at: parseTimestamp(raw.at, now)
  };
  for (const [k, kind, max] of ENTRY_FIELDS) {
    const v = raw[k];
    if (kind === 'str') {
      if (v == null || typeof v === 'object' || typeof v === 'boolean') continue;
      const s = String(v).trim().slice(0, max);
      if (s) e[k] = s;
    } else if (kind === 'bool') {
      if (k in raw) e[k] = !!v;
    } else if (kind === 'bool?') {
      if (typeof v === 'boolean') e[k] = v;
    } else if (Array.isArray(v)) {
      e[k] = v.filter((x) => typeof x === 'string' || typeof x === 'number').map((x) => String(x).slice(0, 300)).slice(0, MAX_LIST);
    }
  }
  if (e.url && !/^https?:\/\//i.test(e.url)) delete e.url;
  if (!e.url && !e.title) return null;
  return e;
}

/**
 * Vereinigt vorhandene Einträge mit importierten (rein, ohne Storage): gleiche id wird übersprungen,
 * unbrauchbare Einträge ebenfalls; die Liste wird nach Zeit sortiert und auf MAX gekürzt. `added` zählt
 * nur Einträge, die nach dem Kürzen noch da sind; `dropped` nennt die weggeschnittenen (alte wie neue).
 * Liefert { list, added, skipped, dropped }. Wirft, wenn input keine Liste ist.
 */
export function mergeHistory(current, input, { now = Date.now() } = {}) {
  const raws = Array.isArray(input) ? input : Array.isArray(input?.entries) ? input.entries : null;
  if (!raws) throw new Error('Ungültige Verlaufsdaten: Liste erwartet.');
  const list = [...(current || [])];
  const known = new Set(list.map((e) => e.id));
  const addedIds = new Set();
  let skipped = 0;
  for (const raw of raws) {
    const e = sanitizeEntry(raw, now);
    if (!e || known.has(e.id)) {
      skipped++;
      continue;
    }
    known.add(e.id);
    addedIds.add(e.id);
    list.push(e);
  }
  list.sort((a, b) => (b.at || 0) - (a.at || 0));
  const dropped = Math.max(0, list.length - MAX);
  if (dropped) list.length = MAX;
  const added = list.reduce((n, e) => n + (addedIds.has(e.id) ? 1 : 0), 0);
  return { list, added, skipped, dropped };
}

/**
 * Importiert Einträge (Array oder { entries }). merge=true behält vorhandene Einträge (gleiche id wird übersprungen),
 * merge=false ersetzt den Verlauf. Liefert { added, skipped, dropped, total } (siehe mergeHistory).
 */
export async function importHistory(entries, { merge = true } = {}) {
  const current = merge ? await loadHistory() : [];
  const { list, added, skipped, dropped } = mergeHistory(current, entries);
  await chrome.storage.local.set({ [KEY]: list });
  return { added, skipped, dropped, total: list.length };
}

export function historyToMarkdown(list, title = 'Eingetragene Meldungen') {
  const lines = [`# ${title}`, ''];
  for (const e of list) {
    const d = new Date(e.at);
    lines.push(`## ${e.titleDe || e.title}`);
    lines.push(`- Eingetragen: ${formatDate(d)} ${d.toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' })}`);
    lines.push(`- Quelle: ${e.sourceName || e.siteName || ''} – ${e.url}`);
    lines.push(`- Artikeldatum: ${e.dateIso ? formatDate(new Date(e.dateIso)) : '–'} · Autor: ${e.authorUnknown ? 'Autor ungenannt' : e.author || '–'}`);
    lines.push(`- Struktur: ${e.structure || '–'} · WB: ${e.wb || 'nein'}${e.ki ? ' · KI-Tag' : ''}`);
    if (e.tags?.length) lines.push(`- Tags: ${e.tags.map((p) => p.split(' → ').slice(-1)[0]).join(', ')}`);
    if (e.summary) lines.push(`- Zusammenfassung: ${e.summary}`);
    lines.push('');
  }
  return lines.join('\n');
}

export function historyToCsv(list) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = ['Eingetragen', 'Artikeldatum', 'Struktur', 'WB', 'KI', 'Titel', 'Titel (DE)', 'Quelle', 'URL', 'Autor', 'Zusammenfassung', 'Tags'];
  const rows = list.map((e) => [
    new Date(e.at).toLocaleString('de-AT'),
    e.dateIso || '',
    e.structure || '',
    e.wb || '',
    e.ki ? 'ja' : 'nein',
    e.title || '',
    e.titleDe || '',
    e.sourceName || e.siteName || '',
    e.url || '',
    e.authorUnknown ? 'Autor ungenannt' : e.author || '',
    e.summary || '',
    (e.tags || []).join(' | ')
  ].map(esc).join(';'));
  return [head.map(esc).join(';'), ...rows].join('\n');
}
