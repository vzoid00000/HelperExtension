// Ansicht „Quellen“: RSS-Feeds und Übersichtsseiten anlegen, bearbeiten, testen, löschen,
// ein-/ausschalten; Standardliste wiederherstellen; Import/Export als Text (eine Quelle je Zeile).
// Datenhaltung in lib/sources-store.js (settings.sources).

import { addSource, updateSource, removeSource, resetSources, testSource, saveSourceList, parseSourcesText, sourcesToText, usesDefaultSources, DEFAULT_SOURCES } from '../../lib/sources-store.js';
import { $, el, clear, svgIcon, areaBadge, iconButton, toastOk, toastWarn, toastError, setStatusEl, bindDialog, openDialog, closeDialog, setInvalid, fmtRelative, shortText, plural } from '../ui.js';

let ctx = null;
let editingId = null;
const DEFAULT_COUNT = DEFAULT_SOURCES.length;

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

/**
 * Hinweis über der Tabelle, solange die Standardliste gilt (keine eigene Liste gespeichert): Eine leere
 * Liste ist nicht speicherbar – wird die letzte Quelle gelöscht, erscheint die Standardliste wieder.
 */
function renderDefaultNotice() {
  let box = $('sourcesDefaultNotice');
  if (!box) {
    box = el('div', 'alert alert-info');
    box.id = 'sourcesDefaultNotice';
    box.append(svgIcon('info'));
    const body = el('div');
    body.append(el('div', 'alert-title', 'Standardliste aktiv'), el('div', 'muted', `Es ist keine eigene Quellenliste gespeichert – es gelten die ${DEFAULT_COUNT} Standardquellen. Jede Änderung (Hinzufügen, Bearbeiten, Ein-/Ausschalten, Löschen) speichert die Liste als eigene. Eine leere Liste gibt es nicht: Wird die letzte Quelle gelöscht, gilt wieder diese Standardliste.`));
    box.append(body);
    const card = $('sourcesManageTable').closest('.card');
    if (card?.parentNode) card.parentNode.insertBefore(box, card);
    else $('view-sources')?.append(box);
  }
  box.hidden = !usesDefaultSources(ctx.settings || {});
}

function render() {
  const list = ctx.sources || [];
  renderDefaultNotice();
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
    const last = (ctx.sources || []).length === 1;
    const question = last
      ? `Quelle „${s.name}“ löschen? Das ist die letzte Quelle – eine leere Liste gibt es nicht. Danach gilt wieder die Standardliste (${DEFAULT_COUNT} Quellen).`
      : `Quelle „${s.name}“ löschen?`;
    if (!confirm(question)) return;
    try {
      await removeSource(s.id);
      await ctx.reloadSources();
      render();
      ctx.views.run?.renderSources();
      if (last) toastWarn('Letzte Quelle gelöscht', `„${s.name}“ entfernt – es gilt wieder die Standardliste (${ctx.sources.length} Quellen).`);
      else toastOk('Quelle gelöscht', s.name);
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
  else if (r.empty || /^Keine Einträge gefunden/.test(r.error || '')) toastWarn(`${name}: keine Meldungen`, describeTest(r));
  else toastWarn(`${name}: Quelle nicht ladbar`, describeTest(r));
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
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const unreadable = Math.max(0, lines.length - parsed.length);
  if (!parsed.length) return toastError('Keine gültige Zeile', 'Format: Name | URL | cyber/krimisi/both | rss/html | URL-Muster');
  // Zeilen ohne lesbare URL würden stillschweigend verschwinden – vorher nachfragen
  if (unreadable && !confirm(`${plural(unreadable, 'Zeile', 'Zeilen')} ohne gültige URL (Format: Name | URL | …) würden verworfen. Trotzdem ${plural(parsed.length, 'Quelle', 'Quellen')} übernehmen?`)) return;
  try {
    const saved = await saveSourceList(parsed);
    closeDialog($('sourcesTextDialog'));
    await ctx.reloadSources();
    render();
    ctx.views.run?.renderSources();
    if (unreadable) toastWarn('Quellen übernommen', `${plural(saved.length, 'Quelle', 'Quellen')} gespeichert, ${plural(unreadable, 'Zeile', 'Zeilen')} ohne gültige URL verworfen.`);
    else toastOk('Quellen übernommen', `${plural(saved.length, 'Quelle', 'Quellen')} gespeichert.`);
  } catch (e) {
    toastError('Übernehmen fehlgeschlagen', e.message);
  }
}
