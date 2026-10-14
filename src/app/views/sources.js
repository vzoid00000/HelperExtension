// Ansicht „Quellen“: RSS-Feeds und Übersichtsseiten anlegen, bearbeiten, testen, löschen,
// ein-/ausschalten; Standardliste wiederherstellen; Import/Export als Text (eine Quelle je Zeile).
// Datenhaltung in lib/sources-store.js (settings.sources).

import { addSource, updateSource, removeSource, resetSources, testSource, saveSourceList, parseSourcesText, sourcesToText } from '../../lib/sources-store.js';
import { $, el, clear, areaBadge, iconButton, toastOk, toastWarn, toastError, setStatusEl, bindDialog, openDialog, closeDialog, setInvalid, fmtRelative, shortText, plural } from '../ui.js';

let ctx = null;
let editingId = null;

export async function init(c) {
  ctx = c;
  $('btnAddSource').addEventListener('click', () => openSourceDialog(null));
  $('btnResetSources').addEventListener('click', resetToDefaults);
  $('btnSourcesText').addEventListener('click', openTextDialog);
  $('btnSourceSave').addEventListener('click', saveDialog);
  $('btnSourceCancel').addEventListener('click', () => closeDialog($('sourceDialog')));
  $('btnSourceTest').addEventListener('click', testDialog);
  $('btnSourcesTextApply').addEventListener('click', applyText);
  $('btnSourcesTextCancel').addEventListener('click', () => closeDialog($('sourcesTextDialog')));
  bindDialog($('sourceDialog'), { onSubmit: saveDialog });
  bindDialog($('sourcesTextDialog'), { onSubmit: applyText });
  for (const id of ['srcName', 'srcUrl', 'srcPattern']) $(id).addEventListener('input', () => setInvalid($(id), false));

  $('sourcesManageTable').addEventListener('click', onTableClick);
  $('sourcesManageTable').addEventListener('change', onTableChange);
  render();
  return { render, openSourceDialog };
}

// ---------------------------------------------------------------- Tabelle ----

function scanCell(s) {
  const st = ctx.state.sources?.[s.id] || ctx.state.sources?.[s.name];
  const td = el('td', 'col-scan muted');
  if (!st) {
    td.textContent = '–';
    return td;
  }
  if (st.status === 'ok') {
    td.textContent = `${fmtRelative(st.at)} · ${st.fresh} neu`;
    td.title = `${st.total} Einträge: ${st.fresh} neu, ${st.old} zu alt, ${st.known} bekannt${st.inHistory ? `, ${st.inHistory} im Verlauf` : ''}`;
  } else if (st.status === 'error') {
    td.textContent = `${fmtRelative(st.at)} · Fehler`;
    td.className = 'col-scan st-error';
    td.title = st.error || '';
  } else if (st.status === 'loading') {
    td.textContent = 'lädt …';
    td.className = 'col-scan st-processing';
  } else td.textContent = fmtRelative(st.at);
  return td;
}

function render() {
  const list = ctx.sources || [];
  const tbody = clear($('sourcesManageTable').querySelector('tbody'));
  for (const s of list) {
    const tr = el('tr');
    tr.dataset.id = s.id;
    const tdOn = el('td', 'col-switch');
    const sw = el('input', 'switch');
    sw.type = 'checkbox';
    sw.checked = s.enabled !== false;
    sw.dataset.action = 'toggle';
    sw.title = sw.checked ? 'Quelle ist aktiv' : 'Quelle ist deaktiviert';
    sw.setAttribute('aria-label', `${s.name} aktiv`);
    tdOn.append(sw);
    const tdName = el('td', 'col-name strong', s.name);
    // Block-Element mit .clip, damit lange URLs/Muster in der automatischen Tabellenbreite abgeschnitten werden
    const tdUrl = el('td', 'col-url');
    tdUrl.append(el('div', 'clip mono', s.url));
    tdUrl.title = s.url;
    const tdCat = el('td');
    tdCat.append(areaBadge(s.category || 'both'));
    const tdType = el('td', 'muted', s.type === 'html' ? 'Seite' : 'RSS');
    const tdPattern = el('td', 'col-pattern');
    tdPattern.append(el('div', 'clip mono muted', s.pattern || '–'));
    if (s.pattern) tdPattern.title = s.pattern;
    const tdActions = el('td', 'actions');
    tdActions.append(
      iconButton('test', 'Testen', 'scan'),
      iconButton('edit', 'Bearbeiten', 'pencil'),
      iconButton('delete', 'Löschen', 'trash', { destructive: true })
    );
    tr.append(tdOn, tdName, tdUrl, tdCat, tdType, tdPattern, scanCell(s), tdActions);
    tbody.append(tr);
  }
  $('sourcesEmpty').hidden = list.length > 0;
}

function sourceOf(target) {
  const tr = target.closest('tr[data-id]');
  return tr ? (ctx.sources || []).find((s) => s.id === tr.dataset.id) || null : null;
}

async function onTableChange(e) {
  const sw = e.target;
  if (sw.dataset.action !== 'toggle') return;
  const s = sourceOf(sw);
  if (!s) return;
  try {
    await updateSource(s.id, { enabled: sw.checked });
    await ctx.reloadSources();
    render();
    ctx.views.run?.renderSources();
  } catch (err) {
    sw.checked = !sw.checked;
    toastError('Quelle', err.message);
  }
}

async function onTableClick(e) {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const s = sourceOf(btn);
  if (!s) return;
  if (btn.dataset.action === 'edit') return openSourceDialog(s);
  if (btn.dataset.action === 'delete') {
    if (!confirm(`Quelle „${s.name}“ löschen?`)) return;
    try {
      await removeSource(s.id);
      await ctx.reloadSources();
      render();
      ctx.views.run?.renderSources();
      toastOk('Quelle gelöscht', s.name);
    } catch (err) {
      toastError('Löschen fehlgeschlagen', err.message);
    }
  }
  if (btn.dataset.action === 'test') {
    btn.disabled = true;
    try {
      const r = await testSource(s);
      showTestResult(r, s.name);
    } finally {
      btn.disabled = false;
    }
  }
}

function describeTest(r) {
  if (!r.ok) return r.error || 'Fehler';
  const sample = r.sample.slice(0, 3).map((x) => `„${shortText(x.title, 60)}“${x.dateIso ? ' (' + x.dateIso + ')' : ''}`).join(', ');
  return `${plural(r.count, 'Meldung', 'Meldungen')} gefunden${sample ? ', z. B. ' + sample : ''}.`;
}

function showTestResult(r, name) {
  if (r.ok) toastOk(`${name}: OK`, describeTest(r));
  else toastWarn(`${name}: keine Meldungen`, describeTest(r));
}

// ------------------------------------------------------------- Dialog ----

function readDialog() {
  return {
    name: $('srcName').value,
    url: $('srcUrl').value,
    category: $('srcCategory').value,
    type: $('srcType').value,
    pattern: $('srcPattern').value,
    enabled: $('srcEnabled').checked
  };
}

function openSourceDialog(source) {
  editingId = source ? source.id : null;
  $('sourceDialogTitle').textContent = source ? 'Quelle bearbeiten' : 'Quelle hinzufügen';
  $('srcName').value = source?.name || '';
  $('srcUrl').value = source?.url || '';
  $('srcCategory').value = source?.category || (ctx.views.run?.currentArea?.() === 'krimisi' ? 'krimisi' : 'cyber');
  $('srcType').value = source?.type || 'rss';
  $('srcPattern').value = source?.pattern || '';
  $('srcEnabled').checked = source ? source.enabled !== false : true;
  for (const id of ['srcName', 'srcUrl', 'srcPattern']) setInvalid($(id), false);
  setStatusEl($('sourceTestResult'), '');
  openDialog($('sourceDialog'));
  $('srcName').focus();
}

function markError(message) {
  setStatusEl($('sourceTestResult'), message, 'err');
  if (/URL/i.test(message)) setInvalid($('srcUrl'), true);
  else if (/Name/i.test(message)) setInvalid($('srcName'), true);
  else if (/Muster/i.test(message)) setInvalid($('srcPattern'), true);
}

async function saveDialog() {
  const input = readDialog();
  $('btnSourceSave').disabled = true;
  try {
    const saved = editingId ? await updateSource(editingId, input) : await addSource(input);
    closeDialog($('sourceDialog'));
    await ctx.reloadSources();
    render();
    ctx.views.run?.renderSources();
    toastOk(editingId ? 'Quelle gespeichert' : 'Quelle hinzugefügt', saved.name);
    editingId = null;
  } catch (e) {
    markError(e.message || String(e));
  } finally {
    $('btnSourceSave').disabled = false;
  }
}

async function testDialog() {
  const btn = $('btnSourceTest');
  btn.disabled = true;
  setStatusEl($('sourceTestResult'), 'Lade Quelle …', 'busy');
  try {
    const r = await testSource(readDialog());
    setStatusEl($('sourceTestResult'), r.ok ? `OK: ${describeTest(r)}` : r.error, r.ok ? 'ok' : 'err');
  } finally {
    btn.disabled = false;
  }
}

async function resetToDefaults() {
  if (!confirm('Alle Quellen durch die Standardliste ersetzen? Eigene Quellen gehen verloren.')) return;
  try {
    await resetSources();
    await ctx.reloadSources();
    render();
    ctx.views.run?.renderSources();
    toastOk('Standardliste wiederhergestellt', `${ctx.sources.length} Quellen.`);
  } catch (e) {
    toastError('Zurücksetzen fehlgeschlagen', e.message);
  }
}

// --------------------------------------------------------- Textdialog ----

function openTextDialog() {
  $('sourcesTextArea').value = sourcesToText(ctx.sources || []);
  openDialog($('sourcesTextDialog'));
}

async function applyText() {
  const text = $('sourcesTextArea').value;
  const parsed = parseSourcesText(text);
  if (!parsed.length) return toastError('Keine gültige Zeile', 'Format: Name | URL | cyber/krimisi/both | rss/html | URL-Muster');
  try {
    const saved = await saveSourceList(parsed);
    closeDialog($('sourcesTextDialog'));
    await ctx.reloadSources();
    render();
    ctx.views.run?.renderSources();
    toastOk('Quellen übernommen', `${plural(saved.length, 'Quelle', 'Quellen')} gespeichert.`);
  } catch (e) {
    toastError('Übernehmen fehlgeschlagen', e.message);
  }
}
