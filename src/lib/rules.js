// Lernregeln („Regelwerk“): Korrekturen des Bearbeiters, die in die Prompts für Tagging,
// Relevanzprüfung und Übersetzung eingespeist werden.
//
// Regel: { id, createdAt, scope: 'tagging'|'relevance'|'translation', text (≤ 300 Zeichen, die Anweisung),
//          reason, example: { title, url, wrongTags: [], rightTags: [] } | null, active: true, hits: 0 }
//
// correctionFromChips() vergleicht den Tag-Vorschlag der Extension mit den Chips, die beim Speichern
// tatsächlich im OSDP-Formular standen, und draftRuleFromCorrection() macht daraus einen Regel-Vorschlag
// (reines Template, ohne Modell). distillRule() formuliert optional per Modell eine allgemeine Regel.

import { SEP, TOPIC_ROOTS } from './tag-catalog.js';
import { llmText } from './llm.js';

const KEY = 'rules';
export const MAX_RULE_TEXT = 300;
export const RULE_SCOPES = ['tagging', 'relevance', 'translation'];
export const SCOPE_LABELS = { tagging: 'Tagging', relevance: 'Relevanz', translation: 'Übersetzung' };

const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
const newId = () => `r-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const strList = (v) => (Array.isArray(v) ? v.map((x) => String(x || '').trim()).filter(Boolean) : []);

/** Validiert/bereinigt eine Regel. Wirft bei leerem oder zu langem Text und bei unbekanntem Bereich. */
export function normalizeRule(input = {}) {
  if (!input || typeof input !== 'object') throw new Error('Ungültige Regel.');
  const text = String(input.text ?? '').replace(/\s+/g, ' ').trim();
  if (!text) throw new Error('Regeltext fehlt.');
  if (text.length > MAX_RULE_TEXT) throw new Error(`Regeltext ist zu lang (max. ${MAX_RULE_TEXT} Zeichen, aktuell ${text.length}).`);
  const scope = input.scope == null || input.scope === '' ? 'tagging' : String(input.scope);
  if (!RULE_SCOPES.includes(scope)) throw new Error(`Unbekannter Bereich „${scope}“ (erlaubt: ${RULE_SCOPES.join(', ')}).`);
  let example = null;
  if (input.example && typeof input.example === 'object') {
    example = {
      title: String(input.example.title || '').trim(),
      url: String(input.example.url || '').trim(),
      wrongTags: strList(input.example.wrongTags),
      rightTags: strList(input.example.rightTags)
    };
    if (!example.title && !example.url && !example.wrongTags.length && !example.rightTags.length) example = null;
  }
  return {
    id: input.id ? String(input.id) : newId(),
    createdAt: Number(input.createdAt) || Date.now(),
    scope,
    text,
    reason: String(input.reason ?? '').replace(/\s+/g, ' ').trim().slice(0, 500),
    example,
    active: input.active !== false,
    hits: Math.max(0, Number(input.hits) || 0)
  };
}

// --------------------------------------------------------------- Storage ----

export async function loadRules() {
  const stored = await chrome.storage.local.get(KEY);
  return stored[KEY] || [];
}

export async function saveRules(list) {
  await chrome.storage.local.set({ [KEY]: list });
}

export async function addRule(input) {
  const list = await loadRules();
  const rule = normalizeRule({ ...input, id: '' });
  list.push(rule);
  await saveRules(list);
  return rule;
}

export async function updateRule(id, patch = {}) {
  const list = await loadRules();
  const idx = list.findIndex((r) => r.id === id);
  if (idx < 0) return null;
  const merged = normalizeRule({ ...list[idx], ...patch, id: list[idx].id, createdAt: list[idx].createdAt });
  list[idx] = merged;
  await saveRules(list);
  return merged;
}

export async function removeRule(id) {
  const list = await loadRules();
  const rest = list.filter((r) => r.id !== id);
  if (rest.length === list.length) return false;
  await saveRules(rest);
  return true;
}

/** Zählt für die genannten Regeln einen Treffer (Regel wurde in einen Prompt eingespeist). */
export async function recordRuleHits(ids) {
  const wanted = new Set(ids || []);
  if (!wanted.size) return;
  const list = await loadRules();
  let changed = false;
  for (const r of list) {
    if (wanted.has(r.id)) {
      r.hits = (Number(r.hits) || 0) + 1;
      changed = true;
    }
  }
  if (changed) await saveRules(list);
}

// ---------------------------------------------------------------- Prompt ----

/** Aktive Regeln eines Bereichs, älteste zuerst. */
export function rulesForScope(rules, scope) {
  return (rules || [])
    .filter((r) => r && r.active !== false && r.scope === scope && r.text)
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
}

const HEADINGS = {
  tagging: 'KORREKTURREGELN DES BEARBEITERS (gelten zusätzlich zum Handbuch; bei Widerspruch zum Handbuch gilt das Handbuch):',
  relevance: 'KORREKTURREGELN DES BEARBEITERS (gelten zusätzlich zu den Bereichsdefinitionen; bei Widerspruch gehen sie vor):',
  translation: 'KORREKTURREGELN DES BEARBEITERS (gelten zusätzlich zu den Übersetzungsregeln; bei Widerspruch gehen sie vor):'
};

/**
 * Textblock für den System-Prompt. '' ohne passende Regeln. Hart begrenzt auf maxRules Regeln
 * und maxChars Zeichen (älteste zuerst, weil sie am längsten bewährt sind).
 */
export function rulesPromptBlock(rules, scope, { maxRules = 40, maxChars = 6000 } = {}) {
  const active = rulesForScope(rules, scope).slice(0, Math.max(0, maxRules));
  if (!active.length) return '';
  const heading = HEADINGS[scope] || HEADINGS.tagging;
  const lines = [heading];
  let length = heading.length;
  let n = 0;
  for (const r of active) {
    const line = `${n + 1}. ${r.text}`;
    if (length + 1 + line.length > maxChars) break;
    lines.push(line);
    length += 1 + line.length;
    n++;
  }
  return n ? lines.join('\n') : '';
}

// ------------------------------------------------------------ Korrektur ----

const leafOf = (p) => String(p).split(SEP).slice(-1)[0];
const sharedPrefix = (a, b) => {
  const x = a.split(SEP);
  const y = b.split(SEP);
  let n = 0;
  while (n < x.length && n < y.length && norm(x[n]) === norm(y[n])) n++;
  return n;
};

/** Chip-Blattname → Katalogpfad. Mehrdeutige Namen bevorzugt im Teilbaum eines Vorschlags, sonst erster Treffer. */
function resolveChip(chip, suggested, catalog) {
  if (!catalog) return chip;
  if (/→|>|›/.test(chip)) {
    const direct = catalog.resolve(chip);
    if (direct) return direct.path;
  }
  const candidates = catalog.byName?.get(norm(chip)) || [];
  if (!candidates.length) {
    const fallback = catalog.resolve(chip);
    return fallback ? fallback.path : chip;
  }
  if (candidates.length === 1) return candidates[0].path;
  let best = null;
  let bestScore = -1;
  for (const c of candidates) {
    const shared = suggested.reduce((m, p) => Math.max(m, sharedPrefix(c.path, p)), 0);
    const score = shared * 10 + (catalog.isAllowed(c.path) ? 1 : 0);
    if (score > bestScore) {
      best = c;
      bestScore = score;
    }
  }
  return best.path;
}

/**
 * Differenz zwischen Tag-Vorschlag (Pfade) und den Chips im OSDP-Formular beim Speichern.
 * Rein, ohne Storage. Struktur-/Pflichttags zählen mit. Liefert Pfade:
 *   removed   – vorgeschlagen, aber vom Bearbeiter entfernt
 *   added     – vom Bearbeiter zusätzlich gesetzt (Blattnamen über den Katalog aufgelöst; unauflösbar = Blattname)
 *   unchanged – vorgeschlagen und übernommen
 */
export function correctionFromChips({ suggestedPaths = [], finalChips = [], catalog = null } = {}) {
  const suggested = [...new Set((suggestedPaths || []).map((p) => String(p || '').trim()).filter(Boolean))];
  const chips = [...new Set((finalChips || []).map((c) => String(c || '').replace(/\s*cancel$/i, '').trim()).filter(Boolean))];
  const chipKeys = new Set(chips.map(norm));
  const suggestedLeafKeys = new Set(suggested.map((p) => norm(leafOf(p))));

  const unchanged = suggested.filter((p) => chipKeys.has(norm(leafOf(p))));
  const removed = suggested.filter((p) => !chipKeys.has(norm(leafOf(p))));
  const addedRaw = [];
  for (const chip of chips) {
    if (suggestedLeafKeys.has(norm(chip))) continue;
    const path = resolveChip(chip, suggested, catalog);
    if (!addedRaw.includes(path)) addedRaw.push(path);
  }
  // OSDP zeigt je Tag eine Kette von Pfad-Chips: Vorfahren eines übernommenen/neuen Tags sind kein eigener Tag.
  const kept = [...unchanged, ...addedRaw];
  const added = addedRaw.filter((p) => !kept.some((q) => q !== p && q.startsWith(p + SEP)));
  return { removed, added, unchanged };
}

/** Lesbare Form eines Pfads für Regeltexte: Themen als Pfad mit " > ", sonst der Blattname. */
export function tagLabel(path) {
  const segs = String(path || '').split(SEP);
  if (segs.length > 1 && TOPIC_ROOTS.includes(segs[0])) return segs.join(' > ');
  return segs[segs.length - 1];
}

const shorten = (s, max) => {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max - 1).replace(/\s\S*$/, '') + '…' : t;
};

/**
 * Regel-Vorschlag (Template, ohne Modell) aus einer Korrektur, z. B.
 * „Bei Meldungen wie „<Titel>“ (<Zusammenfassung>) nicht „X“ vergeben, sondern „Y“.“
 * @param {{removed: string[], added: string[]}} correction
 * @param {{title?: string, titleDe?: string, summary?: string, reason?: string}} article
 */
export function draftRuleFromCorrection(correction, article = {}) {
  const removed = strList(correction?.removed);
  const added = strList(correction?.added);
  if (!removed.length && !added.length) return '';
  const quote = (list) => `„${list.map(tagLabel).join('“, „')}“`;
  let tail;
  if (removed.length && added.length) tail = `nicht ${quote(removed)} vergeben, sondern ${quote(added)}.`;
  else if (removed.length) tail = `${quote(removed)} nicht vergeben.`;
  else tail = `zusätzlich ${quote(added)} vergeben.`;

  const title = String(article?.title || article?.titleDe || '').replace(/\s+/g, ' ').trim();
  const ctx = String(article?.summary || article?.reason || '').replace(/\s+/g, ' ').trim();
  const build = (titleMax, ctxMax) => {
    let head = title ? `Bei Meldungen wie „${shorten(title, titleMax)}“` : 'Bei vergleichbaren Meldungen';
    if (ctx && ctxMax > 0) head += ` (${shorten(ctx, ctxMax)})`;
    return `${head} ${tail}`;
  };
  for (const [t, c] of [[120, 140], [100, 80], [80, 0], [50, 0]]) {
    const text = build(t, c);
    if (text.length <= MAX_RULE_TEXT) return text;
  }
  return shorten(build(40, 0), MAX_RULE_TEXT);
}

/**
 * Formuliert per Modell EINE allgemeine Regel (max. 2 Sätze) aus einer Korrektur. Nur auf Knopfdruck.
 * @param {{removed: string[], added: string[], reason?: string, scope?: string}} correction
 * @param {{title?: string, summary?: string, reason?: string}} article
 */
export async function distillRule(correction, article = {}, settings = {}) {
  const removed = strList(correction?.removed).map(tagLabel);
  const added = strList(correction?.added).map(tagLabel);
  const reason = String(correction?.reason || '').trim();
  if (!removed.length && !added.length && !reason) throw new Error('Keine Korrektur vorhanden, aus der eine Regel abgeleitet werden könnte.');
  const scope = RULE_SCOPES.includes(correction?.scope) ? correction.scope : 'tagging';
  const task = {
    tagging: 'Tag-Vergabe nach dem OSDP-Tagging-Handbuch',
    relevance: 'Relevanzprüfung von Schlagzeilen (Bereich cyber/krimisi/none, Wichtigkeit)',
    translation: 'Übersetzung Englisch → Deutsch'
  }[scope];
  const system = `Du formulierst aus einer Korrektur eines Bearbeiters EINE allgemeine Regel für die ${task}. Deutsch, höchstens 2 Sätze, höchstens ${MAX_RULE_TEXT} Zeichen, ohne Einleitung, ohne Anführungszeichen um die Regel. Verallgemeinere auf vergleichbare Fälle, nenne Tags exakt wie angegeben.`;
  const user = [
    article?.title ? `Meldung: ${shorten(article.title, 160)}` : '',
    article?.summary || article?.reason ? `Inhalt: ${shorten(article.summary || article.reason, 300)}` : '',
    removed.length ? `Vom Modell vergeben, vom Bearbeiter entfernt: ${removed.join('; ')}` : '',
    added.length ? `Vom Bearbeiter ergänzt: ${added.join('; ')}` : '',
    reason ? `Begründung des Bearbeiters: ${shorten(reason, 300)}` : ''
  ].filter(Boolean).join('\n');
  const out = await llmText(settings, system, user, { maxTokens: 200, effort: 'low' });
  const text = String(out || '').replace(/\s+/g, ' ').replace(/^["„“']+|["“”']+$/g, '').trim();
  if (!text) throw new Error('Das Modell hat keine Regel geliefert.');
  return text.length > MAX_RULE_TEXT ? shorten(text, MAX_RULE_TEXT) : text;
}

// --------------------------------------------------------- Import/Export ----

export async function exportRules() {
  return (await loadRules()).map((r) => ({ ...r }));
}

/**
 * Importiert Regeln (Array oder { rules }). merge=true behält vorhandene Regeln (gleiche id oder gleicher
 * Text im selben Bereich wird übersprungen), merge=false ersetzt. Liefert { added, skipped, total }.
 */
export async function importRules(list, { merge = true } = {}) {
  const input = Array.isArray(list) ? list : Array.isArray(list?.rules) ? list.rules : null;
  if (!input) throw new Error('Ungültige Regeldaten: Liste erwartet.');
  const current = merge ? await loadRules() : [];
  const ids = new Set(current.map((r) => r.id));
  const texts = new Set(current.map((r) => `${r.scope}|${norm(r.text)}`));
  let added = 0;
  let skipped = 0;
  for (const raw of input) {
    let rule;
    try {
      rule = normalizeRule(raw);
    } catch {
      skipped++;
      continue;
    }
    if (ids.has(rule.id) || texts.has(`${rule.scope}|${norm(rule.text)}`)) {
      skipped++;
      continue;
    }
    ids.add(rule.id);
    texts.add(`${rule.scope}|${norm(rule.text)}`);
    current.push(rule);
    added++;
  }
  current.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  await saveRules(current);
  return { added, skipped, total: current.length };
}
