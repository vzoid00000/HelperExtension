// Ansicht „Verlauf“: alle eingetragenen Meldungen, Zähler je Zeitraum (Cyber, KriMiSi, WB-Cyber,
// WB-KriMiSi, Duplikate), Suche, Duplikat-Markierung (gleiche URL oder gleicher Titel),
// WB umschalten, Korrektur melden (Regel-Dialog), Löschen, Export als Markdown/CSV.

import { updateHistoryEntry, removeHistoryEntry, clearHistory, filterHistory, searchHistory, statsForRange, findDuplicates, historyToMarkdown, historyToCsv } from '../../lib/history.js';
import { toIsoDate, formatDate } from '../../lib/dates.js';
import { $, el, clear, structureBadge, badge, chip, iconButton, leafName, toastOk, toastWarn, toastError, setActive, download, copyText, fmtDateTime, fmtTime, plural } from '../ui.js';

const MAX_ROWS = 400;
const RANGE_LABEL = { today: 'heute', week: 'diese Woche', month: 'dieser Monat', all: 'gesamt' };

let ctx = null;
let range = 'today';
let query = '';

export async function init(c) {
  ctx = c;
  $('historyRange').addEventListener('click', (e) => {
    const b = e.target.closest('[data-range]');
    if (!b) return;
    range = b.dataset.range;
    render();
  });
  $('historySearch').addEventListener('input', () => {
    query = $('historySearch').value;
    render();
  });
  $('btnHistoryMd').addEventListener('click', async () => {
    const list = currentList();
    try {
      await copyText(historyToMarkdown(list, `Eingetragene News (${RANGE_LABEL[range]})`));
      toastOk('Markdown kopiert', `${plural(list.length, 'Eintrag', 'Einträge')} in der Zwischenablage.`);
    } catch (e) {
      toastError('Kopieren fehlgeschlagen', e.message);
    }
  });
  $('btnHistoryCsv').addEventListener('click', async () => {
    const list = currentList();
    try {
      await download(`osdp-verlauf-${toIsoDate(new Date())}.csv`, '﻿' + historyToCsv(list), 'text/csv');
      toastOk('CSV exportiert', `${plural(list.length, 'Eintrag', 'Einträge')}.`);
    } catch (e) {
      toastError('Export fehlgeschlagen', e.message);
    }
  });
  $('btnHistoryClear').addEventListener('click', async () => {
    const n = ctx.history.length;
    if (!n) return toastWarn('Verlauf ist leer');
    if (!confirm(`Den gesamten Verlauf (${n} Einträge) löschen?`)) return;
    if (!confirm('Wirklich? Das kann nicht rückgängig gemacht werden. Vorher „Alle Daten exportieren“ in den Einstellungen sichern.')) return;
    await clearHistory();
    ctx.history = [];
    render();
    toastOk('Verlauf gelöscht');
  });
  $('historyTable').addEventListener('click', onTableClick);
  render();
  return { render, onShow: render };
}

function currentList() {
  return searchHistory(filterHistory(ctx.history || [], range), query);
}

async function onTableClick(e) {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const tr = btn.closest('tr[data-id]');
  const entry = (ctx.history || []).find((x) => x.id === tr?.dataset.id);
  if (!entry) return;
  const action = btn.dataset.action;
  if (action === 'wb') {
    const next = entry.wb ? '' : entry.structure === 'KriMiSi' ? 'WB-KriMiSi' : 'WB-Cyber';
    await updateHistoryEntry(entry.id, { wb: next });
    entry.wb = next;
    render();
  } else if (action === 'delete') {
    if (!confirm('Eintrag aus dem Verlauf entfernen?')) return;
    await removeHistoryEntry(entry.id);
    ctx.history = ctx.history.filter((x) => x.id !== entry.id);
    render();
    toastOk('Eintrag entfernt');
  } else if (action === 'correct') {
    ctx.views.rules?.openRuleDialog({
      scope: 'tagging',
      example: { title: entry.title || entry.titleDe || '', url: entry.url || '', wrongTags: entry.tags || [], rightTags: [] },
      article: { title: entry.title, titleDe: entry.titleDe, summary: entry.summary, url: entry.url }
    });
  }
}

function render() {
  const history = ctx.history || [];
  setActive($('historyRange'), 'range', range);
  const st = statsForRange(history, range);
  $('statTotal').textContent = st.total;
  $('statCyber').textContent = st.cyber;
  $('statKrimisi').textContent = st.krimisi;
  $('statWbCyber').textContent = st.wbCyber;
  $('statWbKrimisi').textContent = st.wbKrimisi;
  $('statDuplicates').textContent = st.duplicates;

  const dup = findDuplicates(history);
  const byId = new Map(history.map((e) => [e.id, e]));
  const list = currentList();
  const tbody = clear($('historyTable').querySelector('tbody'));
  for (const e of list.slice(0, MAX_ROWS)) {
    const tr = el('tr');
    tr.dataset.id = e.id;
    const d = new Date(e.at);
    const tdTime = el('td', 'col-time muted', `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}. ${fmtTime(d)}`);
    tdTime.title = fmtDateTime(d);
    const tdStruct = el('td', 'col-structure');
    tdStruct.append(structureBadge(e.structure, { sm: true }));
    const tdWb = el('td', 'col-wb');
    const wbBtn = el('button', 'btn btn-ghost btn-xs');
    wbBtn.type = 'button';
    wbBtn.dataset.action = 'wb';
    wbBtn.title = 'WB-Kennzeichnung im Verlauf umschalten';
    if (e.wb) wbBtn.append(badge(e.wb, 'wb', { sm: true }));
    else wbBtn.append(el('span', 'muted', '–'));
    tdWb.append(wbBtn);
    const tdTitle = el('td', 'title-cell');
    const a = el('a', '', e.titleDe || e.title || e.url);
    a.href = e.url || '#';
    a.target = '_blank';
    a.rel = 'noopener';
    a.title = [e.title, e.titleDe].filter(Boolean).join('\n');
    tdTitle.append(a);
    const tdSrc = el('td', 'col-source', e.sourceName || e.siteName || '');
    tdSrc.title = `${e.sourceName || e.siteName || ''}${e.dateIso ? ' · Artikel vom ' + formatDate(new Date(e.dateIso)) : ''}${e.author ? ' · ' + (e.authorUnknown ? 'Autor ungenannt' : e.author) : ''}`;
    const tdSum = el('td', 'col-summary');
    tdSum.append(el('div', 'clip-2 muted', e.summary || ''));
    if (e.summary) tdSum.title = e.summary;
    const tdTags = el('td', 'col-tags');
    const chips = el('div', 'chips');
    const tags = (e.tags || []).filter((p) => !/^Struktur|^Newsinfo → Dokumententyp|^Newsinfo → Quellentyp/.test(p));
    for (const p of tags.slice(0, 6)) chips.append(chip(leafName(p), { cls: 'chip-sm', title: p }));
    if (tags.length > 6) chips.append(chip(`+${tags.length - 6}`, { cls: 'chip-sm', title: tags.slice(6).join('\n') }));
    tdTags.append(chips);
    const tdHint = el('td', 'col-hint');
    const dupInfo = dup.get(e.id);
    if (dupInfo) {
      const orig = byId.get(dupInfo.ofId);
      const when = orig ? fmtDateTime(orig.at) : '?';
      tdHint.append(badge('Duplikat', 'warning', { sm: true, title: `${dupInfo.by === 'url' ? 'gleiche URL' : 'gleicher Titel'} wie Eintrag vom ${when}` }));
    } else if (e.saved === false) {
      tdHint.append(badge('unbestätigt', 'muted', { sm: true, title: 'Formular wurde ausgefüllt, das Speichern in OSDP wurde nicht bestätigt' }));
    }
    const tdActions = el('td', 'actions');
    tdActions.append(iconButton('correct', 'Korrektur melden (Regel anlegen)', 'pencil'), iconButton('delete', 'Löschen', 'trash', { destructive: true }));
    tr.append(tdTime, tdStruct, tdWb, tdTitle, tdSrc, tdSum, tdTags, tdHint, tdActions);
    tbody.append(tr);
  }
  if (list.length > MAX_ROWS) {
    const tr = el('tr');
    const td = el('td', 'muted', `… ${list.length - MAX_ROWS} weitere Einträge – Zeitraum oder Suche eingrenzen.`);
    td.colSpan = 9;
    tr.append(td);
    tbody.append(tr);
  }
  $('historyEmpty').hidden = list.length > 0;
  const emptyTitle = $('historyEmpty').querySelector('.empty-title');
  if (emptyTitle) emptyTitle.textContent = history.length ? 'Keine Einträge im gewählten Zeitraum' : 'Noch keine Einträge';
}
