// Verlauf der eingetragenen News (Tagesprotokoll, WB-Übersicht, Export).

import { formatDate } from './dates.js';

const KEY = 'history';
const MAX = 3000;

export async function loadHistory() {
  const stored = await chrome.storage.local.get(KEY);
  return stored[KEY] || [];
}

/**
 * @param {object} entry  { url, title, titleDe, sourceName, siteName, dateIso, structure, wb, ki, tags, summary,
 *                          author, authorUnknown, saved }
 */
export async function addHistoryEntry(entry) {
  const list = await loadHistory();
  const e = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, at: Date.now(), ...entry };
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

export function filterHistory(list, range, now = new Date()) {
  if (range === 'today') return list.filter((e) => e.at >= startOfToday(now));
  if (range === 'week') return list.filter((e) => e.at >= startOfWeek(now));
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

export function historyToMarkdown(list, title = 'Eingetragene News') {
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
