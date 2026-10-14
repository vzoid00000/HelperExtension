// Ansicht „Regeln“: Lernregeln aus Korrekturen des Bearbeiters (lib/rules.js). Aktive Regeln
// fließen in die Prompts für Tagging, Relevanz und Übersetzung ein (rulesPromptBlock in views/run.js).
// Der Korrektur-Dialog wird nach einem Save mit geänderten Tags aus dem Lauf geöffnet (openCorrection)
// und blockiert den Lauf nicht; weitere Korrekturen werden nacheinander angezeigt.

import { addRule, updateRule, removeRule, distillRule, draftRuleFromCorrection, SCOPE_LABELS, MAX_RULE_TEXT } from '../../lib/rules.js';
import { formatDate } from '../../lib/dates.js';
import { $, el, clear, chip, iconButton, leafName, toastOk, toastWarn, toastError, bindDialog, openDialog, closeDialog, setInvalid, shortText, plural } from '../ui.js';

let ctx = null;
let editingId = null;
// Kontext des offenen Regel-Dialogs (Beispiel/Korrektur für „Mit KI verallgemeinern“)
let dialogCtx = { example: null, correction: null, article: null };
let currentCorrection = null;
const pendingCorrections = [];

export async function init(c) {
  ctx = c;
  $('btnAddRule').addEventListener('click', () => openRuleDialog());
  $('btnRuleSave').addEventListener('click', saveRule);
  $('btnRuleCancel').addEventListener('click', () => closeDialog($('ruleDialog')));
  $('btnRuleDistill').addEventListener('click', distill);
  bindDialog($('ruleDialog'), { onSubmit: saveRule });
  $('ruleText').addEventListener('input', () => setInvalid($('ruleText'), false));

  $('btnCorrectionSave').addEventListener('click', saveCorrection);
  $('btnCorrectionDismiss').addEventListener('click', () => closeDialog($('correctionDialog')));
  bindDialog($('correctionDialog'), { onSubmit: saveCorrection, onClose: nextCorrection });

  $('rulesTable').addEventListener('click', onTableClick);
  $('rulesTable').addEventListener('change', onTableChange);
  render();
  return { render, openRuleDialog, openCorrection };
}

// ---------------------------------------------------------------- Tabelle ----

function scopeBadge(scope) {
  const b = el('span', `badge badge-outline scope-${scope}`);
  b.append(el('span', 'dot'), document.createTextNode(SCOPE_LABELS[scope] || scope));
  return b;
}

function render() {
  const list = [...(ctx.rules || [])].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const tbody = clear($('rulesTable').querySelector('tbody'));
  for (const r of list) {
    const tr = el('tr');
    tr.dataset.id = r.id;
    const tdOn = el('td', 'col-switch');
    const sw = el('input', 'switch');
    sw.type = 'checkbox';
    sw.checked = r.active !== false;
    sw.dataset.action = 'toggle';
    sw.title = sw.checked ? 'Regel ist aktiv' : 'Regel ist deaktiviert';
    sw.setAttribute('aria-label', 'Regel aktiv');
    tdOn.append(sw);
    const tdScope = el('td');
    tdScope.append(scopeBadge(r.scope));
    const tdText = el('td', 'col-rule', r.text);
    if (r.hits) tdText.title = `${plural(r.hits, 'Mal', 'Mal')} in Prompts verwendet`;
    const tdReason = el('td', 'col-reason muted', r.reason || '–');
    const tdExample = el('td', 'col-example');
    const ex = r.example;
    const exText = ex ? ex.title || ex.url || (ex.wrongTags?.length || ex.rightTags?.length ? 'Tags' : '') : '';
    const exDiv = el('div', 'clip muted', exText || '–');
    if (ex) exDiv.title = [ex.title, ex.url, ex.wrongTags?.length ? `Falsch: ${ex.wrongTags.map(leafName).join(', ')}` : '', ex.rightTags?.length ? `Richtig: ${ex.rightTags.map(leafName).join(', ')}` : ''].filter(Boolean).join('\n');
    tdExample.append(exDiv);
    const tdCreated = el('td', 'col-created muted', r.createdAt ? formatDate(new Date(r.createdAt)) : '–');
    const tdActions = el('td', 'actions');
    tdActions.append(iconButton('edit', 'Bearbeiten', 'pencil'), iconButton('delete', 'Löschen', 'trash', { destructive: true }));
    tr.append(tdOn, tdScope, tdText, tdReason, tdExample, tdCreated, tdActions);
    tbody.append(tr);
  }
  $('rulesEmpty').hidden = list.length > 0;
  const active = list.filter((r) => r.active !== false).length;
  $('navRulesCount').textContent = active ? String(active) : '';
}

function ruleOf(target) {
  const tr = target.closest('tr[data-id]');
  return tr ? (ctx.rules || []).find((r) => r.id === tr.dataset.id) || null : null;
}

async function onTableChange(e) {
  if (e.target.dataset.action !== 'toggle') return;
  const r = ruleOf(e.target);
  if (!r) return;
  try {
    await updateRule(r.id, { active: e.target.checked });
    await ctx.reloadRules();
    render();
  } catch (err) {
    e.target.checked = !e.target.checked;
    toastError('Regel', err.message);
  }
}

async function onTableClick(e) {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const r = ruleOf(btn);
  if (!r) return;
  if (btn.dataset.action === 'edit') openRuleDialog({ id: r.id, scope: r.scope, text: r.text, reason: r.reason, example: r.example });
  if (btn.dataset.action === 'delete') {
    if (!confirm('Regel löschen?')) return;
    await removeRule(r.id);
    await ctx.reloadRules();
    render();
    toastOk('Regel gelöscht');
  }
}

// -------------------------------------------------------- Regel-Dialog ----

/**
 * Regel-Dialog öffnen (leer, zum Bearbeiten oder vorbefüllt aus Verlauf/Korrektur).
 * example: { title, url, wrongTags, rightTags } · correction: { removed, added, reason } · article: { title, summary … }
 */
function openRuleDialog({ id = null, scope = 'tagging', text = '', reason = '', example = null, correction = null, article = null } = {}) {
  editingId = id;
  dialogCtx = { example, correction, article };
  $('ruleDialogTitle').textContent = id ? 'Regel bearbeiten' : example?.title || example?.url ? 'Korrektur melden' : 'Regel hinzufügen';
  $('ruleScope').value = scope;
  $('ruleText').value = text || '';
  $('ruleReason').value = reason || '';
  $('ruleExample').value = example?.title || example?.url || '';
  setInvalid($('ruleText'), false);
  openDialog($('ruleDialog'));
  (text ? $('ruleReason') : $('ruleText')).focus();
}

function readExample() {
  const typed = $('ruleExample').value.trim();
  const ex = dialogCtx.example ? { ...dialogCtx.example } : { title: '', url: '', wrongTags: [], rightTags: [] };
  if (typed && typed !== ex.title && typed !== ex.url) {
    if (/^https?:\/\//i.test(typed)) ex.url = typed;
    else ex.title = typed;
  }
  if (!typed) {
    ex.title = '';
    ex.url = '';
  }
  return ex;
}

async function saveRule() {
  const input = { scope: $('ruleScope').value, text: $('ruleText').value, reason: $('ruleReason').value, example: readExample() };
  $('btnRuleSave').disabled = true;
  try {
    if (editingId) await updateRule(editingId, input);
    else await addRule(input);
    closeDialog($('ruleDialog'));
    await ctx.reloadRules();
    render();
    toastOk(editingId ? 'Regel gespeichert' : 'Regel angelegt', `Gilt ab der nächsten Anfrage (${SCOPE_LABELS[input.scope]}).`);
    editingId = null;
  } catch (e) {
    setInvalid($('ruleText'), true);
    toastError('Regel nicht gespeichert', e.message);
  } finally {
    $('btnRuleSave').disabled = false;
  }
}

/** „Mit KI verallgemeinern“: aus Korrektur/Begründung/Regeltext eine kurze allgemeine Regel formulieren. */
async function distill() {
  const missing = ctx.llmMissing();
  if (missing) return toastWarn('Kein Modell', missing);
  const btn = $('btnRuleDistill');
  const scope = $('ruleScope').value;
  const reason = [$('ruleReason').value.trim(), $('ruleText').value.trim()].filter(Boolean).join(' – ');
  const correction = { removed: dialogCtx.correction?.removed || dialogCtx.example?.wrongTags || [], added: dialogCtx.correction?.added || dialogCtx.example?.rightTags || [], reason, scope };
  const article = dialogCtx.article || { title: $('ruleExample').value.trim() };
  if (!correction.removed.length && !correction.added.length && !reason) return toastWarn('Nichts zu verallgemeinern', 'Bitte zuerst Regel oder Begründung eintragen.');
  btn.disabled = true;
  try {
    const text = await distillRule(correction, article, ctx.settings);
    $('ruleText').value = text;
    toastOk('Regel verallgemeinert', 'Bitte prüfen und speichern.');
  } catch (e) {
    toastError('Verallgemeinern fehlgeschlagen', e.message);
  } finally {
    btn.disabled = false;
  }
}

// --------------------------------------------------- Korrektur-Dialog ----

/** Aus dem Lauf: Tags wurden vor dem Save geändert. Nicht blockierend; bei offenem Dialog wird gewartet. */
function openCorrection({ correction, article }) {
  if (!correction || (!correction.removed?.length && !correction.added?.length)) return;
  if ($('correctionDialog').open) {
    pendingCorrections.push({ correction, article });
    return;
  }
  currentCorrection = { correction, article: article || {} };
  $('correctionTitle').textContent = article?.titleDe || article?.title || '–';
  const removed = clear($('correctionRemoved'));
  for (const p of correction.removed) removed.append(chip(leafName(p), { cls: 'chip-removed', title: p }));
  const added = clear($('correctionAdded'));
  for (const p of correction.added) added.append(chip(leafName(p), { cls: 'chip-added', title: p }));
  $('correctionReason').value = '';
  $('correctionRuleText').value = draftRuleFromCorrection(correction, article || {});
  openDialog($('correctionDialog'));
}

function nextCorrection() {
  currentCorrection = null;
  const next = pendingCorrections.shift();
  if (next) setTimeout(() => openCorrection(next), 150);
}

async function saveCorrection() {
  if (!currentCorrection) return closeDialog($('correctionDialog'));
  const { correction, article } = currentCorrection;
  const text = $('correctionRuleText').value.trim();
  if (!text) return toastWarn('Regeltext fehlt', `Bitte eine Regel formulieren (max. ${MAX_RULE_TEXT} Zeichen).`);
  $('btnCorrectionSave').disabled = true;
  try {
    await addRule({
      scope: 'tagging',
      text,
      reason: $('correctionReason').value,
      example: { title: article.title || '', url: article.url || '', wrongTags: correction.removed, rightTags: correction.added }
    });
    closeDialog($('correctionDialog'));
    await ctx.reloadRules();
    render();
    toastOk('Regel gespeichert', shortText(text, 100));
  } catch (e) {
    toastError('Regel nicht gespeichert', e.message);
  } finally {
    $('btnCorrectionSave').disabled = false;
  }
}
