// Steuert den OSDP News-Editor aus einer Extension-Seite heraus (Side Panel oder
// Automatik-Seite). Die DOM-Schritte liegen in src/content/osdp-filler.js (isolierte
// Welt); CKEditor-Inhalte und der Tag-Baum werden in der MAIN-Welt direkt über die
// Angular-Objekte gesetzt (die Seite läuft als Dev-Build, `window.ng` ist verfügbar).
//
// Erkenntnisse aus dem Bundle (site-dump, main.js):
//   - Speichern = updateData(): verlangt Source, Titel und Inhalt in Native, English und German,
//     mindestens einen Tag, Datum nicht in der Zukunft. Erfolg: Toast „Item Added!“ + Formular leer.
//   - Duplikat (HTTP 409): Toast „Duplicate, URL already in the database!“.
//   - Datum: mat-datepicker mit Moment-Adapter, Locale en-GB → Eingabe „DD/MM/YYYY“.
//   - Berechtigungs-Guard liest die Rollenrechte synchron; ein Deep-Link direkt nach dem Laden
//     landet daher oft auf #/permissionError. Deshalb: Seite laden, dann per Hash navigieren.
//   - Toasts (ngx-toastr) stehen unten rechts und verschwinden nach 10 s; „Item Added!“ löst
//     resetArticleForm aus (Formular leer). Die Freigabe-Schleife (waitForReview) wertet beides aus –
//     ein leeres Formular zählt aber nur mit Save-Indiz (Klick auf „Save“ oder Spinner gesehen).
//   - Das Verlassen des Quellfelds löst checkURLDuplicates aus (Toast „Duplicate …“ bei Treffer);
//     precheckDuplicate nutzt das, bevor Übersetzung und Tagging Tokens kosten.
//
// Die Extension speichert nie selbst: precheckDuplicate/fillArticle füllen das Formular, waitForReview
// wartet, bis der Nutzer im OSDP-Tab auf „Save“ klickt oder in der Leiste „Überspringen“/„Abbrechen“
// wählt. Ergebnisse meldet der Beobachter des Content-Scripts sofort per chrome.runtime.sendMessage
// ({ type: 'osdp-helper-review', session, event, chips, toasts }); das Polling bleibt Rückfallebene.

import { waitForTabLoad } from './tabloader.js';
import { formatDate, toIsoDate } from './dates.js';

export const OSDP_BASE = 'https://osdp.zentdok.at';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** Typ der Nachrichten, die der Beobachter im OSDP-Tab (osdp-filler.js) an die App schickt. */
export const REVIEW_MESSAGE = 'osdp-helper-review';
const REVIEW_EVENTS = new Set(['saved', 'duplicate', 'skip', 'abort']);

/** Basis-URL aus dem URL-Muster der Einstellungen (z. B. "http://localhost:4300/*" für den Nachbau). */
export function osdpBase(settings) {
  const pattern = (settings?.osdpUrlPattern || '').trim();
  const m = /^(https?:\/\/[^/*]+)/i.exec(pattern);
  return m ? m[1] : OSDP_BASE;
}

/** URL-Muster der Einstellungen (chrome.tabs-Syntax mit *) als RegExp, z. B. "file:///*" für Test-Fixtures. */
export function patternToRegex(pattern) {
  const p = (pattern || '').trim() || `${OSDP_BASE}/*`;
  return new RegExp('^' + p.split('*').map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*'), 'i');
}

// ------------------------------------------------------- MAIN-Welt-Funktionen --
// Diese Funktionen werden serialisiert in die Seite injiziert: keine Closures, keine Imports.

/** CKEditor-Inhalt eines Tabs setzen (wartet, bis die Editor-Instanz existiert). */
async function ckSetData(groupPattern, tabPattern, html) {
  const text = (el) => (el && el.textContent ? el.textContent : '').replace(/\s+/g, ' ').trim();
  const gre = new RegExp(groupPattern, 'i');
  const tre = new RegExp(tabPattern, 'i');
  const tabsOf = (g) => [...g.querySelectorAll('.mat-mdc-tab, [role="tab"]')].filter((t) => t.closest('mat-tab-group') === g);
  const group = [...document.querySelectorAll('mat-tab-group')].find((g) => tabsOf(g).some((t) => gre.test(text(t))));
  if (!group) return { ok: false, error: 'Tab-Gruppe nicht gefunden' };
  const idx = tabsOf(group).findIndex((t) => tre.test(text(t)));
  const bodies = [...group.querySelectorAll('mat-tab-body')].filter((b) => b.closest('mat-tab-group') === group);
  let editor = null;
  for (let i = 0; i < 40 && !editor; i++) {
    const editable = bodies[idx] ? bodies[idx].querySelector('.ck-editor__editable') : null;
    editor = editable ? editable.ckeditorInstance : null;
    if (!editor) await new Promise((r) => setTimeout(r, 150));
  }
  if (!editor) return { ok: false, error: `CKEditor-Instanz nicht gefunden (Tab „${tabPattern}“)` };
  editor.setData(html);
  // Angular übernimmt den Wert über das change:data-Ereignis; kurz warten
  await new Promise((r) => setTimeout(r, 100));
  return { ok: true, length: editor.getData().length };
}

/** CKEditor-Inhalt eines Tabs lesen (HTML). */
function ckGetData(groupPattern, tabPattern) {
  const text = (el) => (el && el.textContent ? el.textContent : '').replace(/\s+/g, ' ').trim();
  const gre = new RegExp(groupPattern, 'i');
  const tre = new RegExp(tabPattern, 'i');
  const tabsOf = (g) => [...g.querySelectorAll('.mat-mdc-tab, [role="tab"]')].filter((t) => t.closest('mat-tab-group') === g);
  const group = [...document.querySelectorAll('mat-tab-group')].find((g) => tabsOf(g).some((t) => gre.test(text(t))));
  if (!group) return { ok: false };
  const idx = tabsOf(group).findIndex((t) => tre.test(text(t)));
  const bodies = [...group.querySelectorAll('mat-tab-body')].filter((b) => b.closest('mat-tab-group') === group);
  const editable = bodies[idx] ? bodies[idx].querySelector('.ck-editor__editable') : null;
  const editor = editable ? editable.ckeditorInstance : null;
  return editor ? { ok: true, html: editor.getData() } : { ok: false };
}

/**
 * Tags direkt über die Angular-Komponente `tag-tree` setzen (ohne Aufklappen/Klicken).
 * Nutzt todoLeafItemSelectionToggle(flatNode) → dispatch addCurrentTag({id: uid}).
 * Reihenfolge: Eltern vor Kindern (sonst wäre der Elternknoten bereits „indeterminate“
 * und der Toggle würde ihn entfernen statt hinzufügen).
 */
async function ngSelectTags(uids) {
  const ng = window.ng;
  const el = document.querySelector('tag-tree');
  if (!ng || typeof ng.getComponent !== 'function') return { ok: false, error: 'window.ng nicht verfügbar (Produktions-Build?)' };
  if (!el) return { ok: false, error: 'tag-tree nicht gerendert (Reiter „Tags“ nicht aktiv?)' };
  let cmp = null;
  for (let i = 0; i < 20 && !cmp; i++) {
    cmp = ng.getComponent(el);
    if (!cmp || !cmp.idToNodeMap || cmp.idToNodeMap.size === 0) {
      cmp = null;
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  if (!cmp) return { ok: false, error: 'tag-tree-Komponente nicht bereit' };
  const applied = [];
  const failed = [];
  const alreadySelected = [];
  for (const uid of uids) {
    const nested = cmp.idToNodeMap.get(uid);
    const flat = nested && cmp.nestedNodeMap ? cmp.nestedNodeMap.get(nested) : null;
    if (!flat) {
      failed.push({ uid, error: 'Knoten nicht gefunden' });
      continue;
    }
    if (cmp.checklistSelection.isSelected(flat) && flat.rlySelected) {
      alreadySelected.push(uid);
      continue;
    }
    try {
      cmp.todoLeafItemSelectionToggle(flat);
      applied.push(uid);
    } catch (e) {
      failed.push({ uid, error: String(e && e.message ? e.message : e) });
    }
    await new Promise((r) => setTimeout(r, 60));
  }
  await new Promise((r) => setTimeout(r, 300));
  const selectedUids = [];
  try {
    for (const n of cmp.checklistSelection.selected) if (n.rlySelected) selectedUids.push(n.uid != null ? n.uid : n.data ? n.data.uid : undefined);
  } catch {
    /* ignorieren */
  }
  return { ok: failed.length === 0, applied, alreadySelected, failed, selectedUids };
}

// ----------------------------------------------------------------------- Helfer --

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

/** Klartext mit Absätzen → einfaches HTML für CKEditor. */
export function textToHtml(textValue) {
  return (textValue || '')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

const leafName = (path) => path.split(' → ').slice(-1)[0].trim().toLowerCase();

// ----------------------------------------------------------------------- Driver --

export class OsdpDriver {
  /**
   * @param {object} settings
   * @param {(msg: string) => void} [log]
   */
  constructor(settings, log = () => {}) {
    this.settings = settings;
    this.log = log;
    this.tabId = null;
    // true, sobald precheckDuplicate/fillArticle Inhalte eingetragen haben, die noch nicht gespeichert/verworfen wurden
    this.formDirty = false;
    // letzter Füllstand ({ url, sourceValue, chips }) als Vorgabe für waitForReview und formState().ours
    this.lastFill = null;
  }

  /** Ist der zuletzt benutzte OSDP-Tab noch offen und zeigt er noch OSDP? Öffnet nie einen neuen Tab. */
  async tabAlive() {
    if (!this.tabId) return false;
    try {
      const t = await chrome.tabs.get(this.tabId);
      if (!t || t.discarded) return false;
      const url = t.url || t.pendingUrl || '';
      return !url || patternToRegex(this.settings.osdpUrlPattern).test(url);
    } catch {
      return false;
    }
  }

  /**
   * OSDP-Tab finden (bei create=false nie einen neuen öffnen, sondern Fehler werfen). Ein gemerkter Tab
   * wird nur weiterverwendet, wenn er noch eine OSDP-Seite zeigt (osdpUrlPattern) – sonst würde eine
   * fremde Seite gescriptet und weggenavigiert.
   */
  async ensureTab({ create = true } = {}) {
    if (this.tabId) {
      let keep = false;
      try {
        const t = await chrome.tabs.get(this.tabId);
        const url = t?.url || t?.pendingUrl || '';
        keep = !!t && (!url || patternToRegex(this.settings.osdpUrlPattern).test(url));
        if (!keep) this.log('Der bisherige OSDP-Tab zeigt keine OSDP-Seite mehr – suche einen anderen.');
      } catch {
        keep = false; // Tab geschlossen
      }
      if (keep) return this.tabId;
      this.tabId = null;
    }
    const tabs = await chrome.tabs.query({ url: this.settings.osdpUrlPattern || `${OSDP_BASE}/*` });
    let tab = tabs.find((t) => /newsEditor/i.test(t.url || '')) || tabs[0];
    if (!tab) {
      if (!create) throw new Error('Kein OSDP-Tab offen');
      this.log('Öffne OSDP in neuem Tab …');
      tab = await chrome.tabs.create({ url: `${osdpBase(this.settings)}/#/news`, active: false });
      await waitForTabLoad(tab.id, 30000);
      await sleep(1500);
    }
    this.tabId = tab.id;
    return tab.id;
  }

  async exec(step, data, { create = true } = {}) {
    const tabId = await this.ensureTab({ create });
    await chrome.scripting.executeScript({ target: { tabId }, files: ['src/content/osdp-filler.js'] });
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: (s, d) => globalThis.__osdpHelper.run(s, d),
      args: [step, data || {}]
    });
    return result;
  }

  async main(func, args) {
    const tabId = await this.ensureTab();
    const [{ result }] = await chrome.scripting.executeScript({ target: { tabId }, world: 'MAIN', func, args });
    return result;
  }

  setEditorContent(tabPattern, html) {
    return this.main(ckSetData, ['native', tabPattern, html]);
  }

  getEditorContent(tabPattern) {
    return this.main(ckGetData, ['native', tabPattern]);
  }

  async probe() {
    return this.exec('probe').catch(() => null);
  }

  async waitForEditor(timeoutMs = 25000) {
    const start = Date.now();
    let probe = null;
    while (Date.now() - start < timeoutMs) {
      probe = await this.probe();
      if (probe?.loginForm) throw new Error('OSDP verlangt eine Anmeldung – bitte im OSDP-Tab einloggen und erneut starten.');
      if (probe?.hasEditor && probe.groups.length >= 2) return probe;
      await sleep(500);
    }
    throw new Error(`OSDP News-Editor wurde nicht geladen (Timeout)${probe?.permissionError ? ' – Seite meldet „keine Berechtigung“' : ''}.`);
  }

  /** App laden, dann per Hash zum Editor navigieren (umgeht den Berechtigungs-Race beim Deep-Link). */
  async openEditor({ reload }) {
    const tabId = await this.ensureTab();
    if (reload) {
      // Nur bei http(s)-Mustern auf /#/news umlenken; andere Muster (z. B. file:///* in Tests) nur neu laden.
      if (/^https?:\/\//i.test((this.settings.osdpUrlPattern || '').trim() || OSDP_BASE)) {
        await chrome.tabs.update(tabId, { url: `${osdpBase(this.settings)}/#/news` });
        await sleep(200);
      }
      await chrome.tabs.reload(tabId);
      this.formDirty = false;
      await waitForTabLoad(tabId, 30000);
      // Warten, bis die App gebootet ist (Navigationsleiste) und die Rollenrechte geladen sein dürften
      for (let i = 0; i < 40; i++) {
        const p = await this.probe();
        if (p?.hasNav) break;
        await sleep(500);
      }
      await sleep(1200);
    }
    for (let attempt = 0; attempt < 3; attempt++) {
      await this.exec('navigate', { hash: '#/newsEditor' });
      await sleep(600);
      const p = await this.probe();
      if (p?.hasEditor && p.groups.length >= 2) return p;
      if (p?.loginForm) throw new Error('OSDP verlangt eine Anmeldung – bitte im OSDP-Tab einloggen und erneut starten.');
      if (p?.permissionError) {
        this.log('OSDP meldet „keine Berechtigung“ (Rechte noch nicht geladen) – neuer Versuch …');
        await this.exec('navigate', { hash: '#/news' });
        await sleep(1500);
      }
    }
    return this.waitForEditor();
  }

  /**
   * Leeres Formular sicherstellen: vorhandenen leeren Editor weiterverwenden, sonst neu laden.
   * Nach „Überspringen“ stehen noch Inhalte im Formular (formDirty) → immer neu laden.
   */
  async freshEditor() {
    const p = this.formDirty ? null : await this.probe();
    const clean = p?.hasEditor && p.groups.length >= 2 && !p.sourceValue && !p.titleValue && !(p.chips || []).length;
    if (clean) return p;
    return this.openEditor({ reload: true });
  }

  async focusTab() {
    const tabId = await this.ensureTab();
    await chrome.tabs.update(tabId, { active: true });
  }

  /**
   * Formularzustand ohne Neuladen (öffnet keinen Tab): Grundlage für die Rückfrage, bevor freshEditor
   * ein nicht von uns gefülltes Formular verwirft.
   * @returns {{ sourceValue: string, titleValue: string, chips: string[], hasContent: boolean, ours: boolean, hasEditor: boolean }}
   *   ours = der Inhalt stammt aus dem letzten fillArticle/precheckDuplicate dieses Drivers
   */
  async formState() {
    const p = await this.exec('probe', {}, { create: false }).catch(() => null);
    const sourceValue = p?.sourceValue || '';
    const titleValue = p?.titleValue || '';
    const chips = p?.chips || [];
    const hasContent = !!(sourceValue || titleValue || chips.length);
    const ours = hasContent && !!sourceValue && !!this.lastFill && sourceValue === this.lastFill.sourceValue;
    return { sourceValue, titleValue, chips, hasContent, ours, hasEditor: !!p?.hasEditor };
  }

  /**
   * Billige Duplikatprüfung VOR Übersetzung und Tagging: leeres Formular, Quelle + Titel eintragen (das
   * Verlassen des Quellfelds löst OSDPs checkURLDuplicates aus) und bis zu waitMs auf den Toast
   * „Duplicate, URL already in the database!“ warten.
   * @returns {{ ok: boolean, duplicate: boolean, prepared: boolean, toasts: object[], sourceValue: string, titleValue: string, error?: string }}
   *   prepared = Quelle + Titel stehen im sauberen Editor → fillArticle(a, { editorPrepared: true }) füllt direkt weiter.
   *   Bei duplicate bleibt formDirty gesetzt: die nächste Meldung lädt den Editor neu.
   */
  async precheckDuplicate({ url, title }, { waitMs = 3000 } = {}) {
    const fresh = await this.freshEditor();
    const staleToastIds = (fresh?.toasts || []).map((t) => t.id).filter(Boolean);
    const native = await this.exec('fillNative', { url, title });
    this.formDirty = true;
    const sourceValue = native?.sourceValue || url || '';
    this.lastFill = { url, sourceValue, chips: [] };
    const toasts = [];
    const seen = (t) => toasts.some((s) => (t.id && s.id === t.id) || (s.kind === t.kind && s.title === t.title && s.message === t.message));
    let state = null;
    let duplicate = false;
    const start = Date.now();
    for (;;) {
      state = await this.exec('watchSave', { ignoreToastIds: staleToastIds }).catch(() => null);
      for (const t of state?.freshToasts || []) if (!seen(t)) toasts.push(t);
      if (state?.duplicate) {
        duplicate = true;
        break;
      }
      if (Date.now() - start >= waitMs) break;
      await sleep(250);
    }
    if (duplicate) this.log('OSDP meldet beim Quellfeld: Duplikat – URL ist bereits in der Datenbank.');
    const ok = !!native?.ok;
    return {
      ok,
      duplicate,
      prepared: ok && !duplicate,
      toasts,
      sourceValue: state?.sourceValue ?? sourceValue,
      titleValue: state?.titleValue ?? '',
      error: native?.error
    };
  }

  /**
   * Tags setzen: bevorzugt über die Angular-Komponente (UIDs), sonst per DOM-Klick (Pfade).
   * @returns {{ok: boolean, applied: string[], failed: Array<{path?: string, uid?: number, error: string}>, chips: string[], method: string}}
   */
  async applyTags({ paths = [], uids = [] }) {
    await this.exec('selectTab', { group: 'tags', tab: '^\\s*tags\\s*$' });
    await sleep(300);
    let method = 'dom';
    let result = null;
    if (uids.length && uids.length === paths.length) {
      const r = await this.main(ngSelectTags, [uids]).catch((e) => ({ ok: false, error: e.message }));
      if (r && !r.error) {
        method = 'ng';
        result = r;
      } else this.log(`Tag-Setzen über Angular nicht möglich (${r?.error || 'unbekannt'}) – nutze Klick-Methode.`);
    }
    if (!result) {
      result = await this.exec('applyTags', { paths });
      method = 'dom';
    }
    const chipsNow = (await this.exec('readChips').catch(() => ({ chips: [] }))).chips || [];
    const missing = paths.filter((p) => !chipsNow.map((c) => c.toLowerCase()).includes(leafName(p)));
    const failed = [...(result.failed || [])];
    for (const p of missing) if (!failed.some((f) => f.path === p)) failed.push({ path: p, error: 'nicht in der Tag-Auswahl (Chips) sichtbar' });
    return { ok: failed.length === 0, applied: paths.filter((p) => !missing.includes(p)), failed, chips: chipsNow, method };
  }

  /**
   * Trägt einen Artikel vollständig ein (ohne zu speichern – das macht der Nutzer, siehe waitForReview).
   * @param {object} a  { url, titleEn, textEn, titleDe, textDe, author, authorUnknown, date (Date), category,
   *                      tagPaths?: string[], tagUids?: number[] }
   * @param {object} opts  { save: boolean (nur Tests, Standard false), translateFn?: ({title,text}) => Promise<{title,text}>,
   *                         editorPrepared: boolean (true = precheckDuplicate hat Quelle + Titel gerade in den sauberen
   *                         Editor eingetragen → kein freshEditor; fillNative läuft trotzdem, ist idempotent) }
   * @returns report { ok, steps, problems, chips: string[] (Chips nach dem Tag-Setzen), sourceValue, titleValue, saved?, duplicate? }
   */
  async fillArticle(a, { save = false, translateFn = null, editorPrepared = false } = {}) {
    const s = this.settings;
    const report = { steps: {}, problems: [] };
    const note = (key, r) => {
      report.steps[key] = r;
      if (!r || r.ok === false) report.problems.push(`${key}: ${r?.error || 'fehlgeschlagen'}`);
      return r;
    };

    let fresh = editorPrepared === true ? await this.probe() : null;
    // Ohne vorbereiteten Editor (oder wenn er inzwischen weg ist): leeres Formular sicherstellen
    if (!fresh?.hasEditor || (fresh.groups || []).length < 2) fresh = await this.freshEditor();
    // Toasts, die jetzt schon sichtbar sind (z. B. „Item Added!“ der vorigen Meldung), zählen nicht
    const staleToastIds = (fresh?.toasts || []).map((t) => t.id).filter(Boolean);

    let titleEn = a.titleEn;
    let textEn = a.textEn;
    let titleDe = a.titleDe;
    let textDe = a.textDe;

    // Native: Quelle + Titel (+ Inhalt)
    note('native', await this.exec('fillNative', { url: a.url, title: titleEn }));

    let extracted = false;
    if (s.useSiteExtract && translateFn) {
      this.log('Nutze OSDP-„Extract“ für den Quelltext …');
      const clicked = note('extract', await this.exec('clickTopButton', { pattern: '^\\s*extract\\s*$' }));
      if (clicked.ok) {
        const waited = note('extractWait', await this.exec('waitForExtract', { timeoutMs: 45000 }));
        if (waited.ok) {
          const read = await this.exec('readNative');
          if (read.ok && read.text.length > 200) {
            titleEn = read.title || titleEn;
            textEn = read.text;
            extracted = true;
          }
        }
      }
    }
    if (!extracted) note('nativeContent', await this.setEditorContent('^\\s*native\\s*$', textToHtml(textEn)));
    if ((!textDe || !titleDe) && translateFn) {
      this.log('Übersetze …');
      const tr = await translateFn({ title: titleEn, text: textEn });
      titleDe = tr.title;
      textDe = tr.text;
    }

    // English Translated (Quelle ist Englisch → identisch); Pflichtfeld beim Speichern
    if (s.fillEnglishTab !== false) {
      note('en', await this.exec('fillTranslated', { lang: 'en', title: titleEn }));
      note('enContent', await this.setEditorContent('english', textToHtml(textEn)));
    }

    // German Translated
    note('de', await this.exec('fillTranslated', { lang: 'de', title: titleDe }));
    note('deContent', await this.setEditorContent('german', textToHtml(textDe)));

    // Metadata: Autor + Datum
    const date = a.date instanceof Date ? a.date : null;
    note('metadata', await this.exec('fillMetadata', {
      author: a.authorUnknown ? '' : a.author,
      authorUnknown: !!a.authorUnknown,
      authorUnknownText: s.authorUnknownText || 'Autor ungenannt',
      date: date ? formatDate(date, s.osdpDateFormat || 'dd/MM/yyyy') : '',
      dateIso: date ? toIsoDate(date) : '',
      dateGb: date ? formatDate(date, 'dd/MM/yyyy') : ''
    }));
    const m = report.steps.metadata;
    if (m?.ok) {
      if (m.author === false) report.problems.push('Autor-Feld im Reiter „Metadata“ nicht gefunden');
      if (m.date === false) report.problems.push('Datum-Feld im Reiter „Metadata“ nicht gefunden');
      if (m.dateInvalid) report.problems.push(`Datum wurde nicht akzeptiert (${m.dateValue})`);
    }

    // Tags
    if (Array.isArray(a.tagPaths) && a.tagPaths.length) {
      const r = note('tags', await this.applyTags({ paths: a.tagPaths, uids: a.tagUids || [] }));
      if (r.failed?.length) report.problems.push(`Tags nicht gesetzt: ${r.failed.map((f) => `${f.path || f.uid} (${f.error})`).join('; ')}`);
    } else {
      const tagLabel = a.category === 'krimisi' ? s.tagLabelKrimisi || 'KriMiSi' : s.tagLabelCyber || 'Cyber';
      note('tag', await this.exec('checkTag', { label: tagLabel }));
    }

    await this.exec('selectTab', { group: 'native', tab: '^\\s*native\\s*$' }).catch(() => {});
    this.formDirty = true;

    // Endzustand des Formulars: Chips (Grundlage der Korrekturerkennung) und Quellfeld
    const state = await this.exec('watchSave', { ignoreToastIds: staleToastIds }).catch(() => null);
    report.chips = state?.chips || report.steps.tags?.chips || report.steps.tag?.chips || [];
    report.sourceValue = state?.sourceValue ?? (report.steps.native?.sourceValue || a.url || '');
    report.titleValue = state?.titleValue ?? '';
    if (state?.duplicate) {
      // Duplikatprüfung beim Verlassen des Quellfelds hat bereits angeschlagen
      report.duplicate = true;
      report.problems.push('OSDP: Duplikat – URL ist bereits in der Datenbank');
    }
    this.lastFill = { url: a.url, sourceValue: report.sourceValue, chips: report.chips };

    if (save) {
      const sv = note('save', await this.exec('save', { timeoutMs: 25000 }));
      report.saved = !!(sv?.ok && sv.success);
      report.duplicate = !!sv?.duplicate;
      report.snackbar = (sv?.toasts || []).map((t) => `${t.title}: ${t.message}`).join(' | ');
      if (report.saved) this.formDirty = false;
      if (sv?.ok && !sv.success) {
        report.problems.push(sv.duplicate ? 'OSDP: Duplikat – URL ist bereits in der Datenbank' : `Speichern ohne Erfolgsmeldung${sv.errors?.length ? ': ' + sv.errors.join('; ') : ''}`);
      }
    }
    report.ok = report.problems.length === 0;
    return report;
  }

  /**
   * Freigabe-Schleife: Leiste im OSDP-Tab anzeigen und warten, bis der Nutzer gespeichert hat
   * (Toast „Item Added!“ oder Formular-Reset nach einem Save-Indiz), „Überspringen“/„Abbrechen“
   * gewählt hat oder die App per external() eine Entscheidung liefert ('skip' | 'abort' | 'saved').
   *
   * Zwei Wege: Der Beobachter im Content-Script meldet Ergebnisse per chrome.runtime.sendMessage
   * ({ type: 'osdp-helper-review', session, event, reason, chips, toasts }) – die Schleife wacht dann
   * sofort auf. Zusätzlich wird alle pollMs gemessen (Rückfallebene). Reihenfolge je Tick: Tab da? →
   * watchSave (erkannter Save/Duplikat gewinnt) → Nachricht → external() → readOverlay (Leiste).
   * Ein leeres Formular (formReset) zählt nur als gespeichert, wenn vorher ein Save-Indiz zu sehen war
   * (saveClicked aus dem Content-Script oder ein Spinner); ohne Indiz wird weiter gewartet.
   *
   * @param {object} o
   *   index, total, title, structure, wb  → Anzeige in der Leiste
   *   pollMs (1000), timeoutMs (4 h)
   *   external: () => 'skip'|'abort'|'saved'|null|Promise  (App-Buttons)
   *   onTick: (info) => void  ({ tick, elapsedMs, chips, watch })
   *   expectSource: Quell-URL im Formular (Standard: Wert aus dem letzten fillArticle bzw. erster Messung)
   *   hint: Text in der Leiste; beginnt er mit „⚠“, wird die Leiste als Warnung gestylt („Bitte prüfen“)
   * @returns {{ outcome: 'saved'|'duplicate'|'skip'|'abort'|'timeout'|'lost', chips: string[], toasts: object[], tookMs: number, reason?: string, via: 'message'|'poll'|'app' }}
   *   chips = zuletzt gesehene nicht-leere Chip-Liste VOR dem Reset (für die Korrekturerkennung)
   */
  async waitForReview({ index = 0, total = 0, title = '', structure = '', wb = '', pollMs = 1000, timeoutMs = 4 * 3600 * 1000, external = () => null, onTick = () => {}, expectSource, hint } = {}) {
    const start = Date.now();
    let expect = expectSource ?? this.lastFill?.sourceValue ?? '';
    let chips = this.lastFill?.chips?.slice() || [];
    const toastsSeen = [];
    const seenToast = (t) => toastsSeen.some((s) => (t.id && s.id === t.id) || (s.kind === t.kind && s.title === t.title && s.message === t.message));
    const noteToasts = (list) => {
      for (const t of list || []) if (t && !seenToast(t)) toastsSeen.push(t);
    };
    let outcome = 'timeout';
    let reason = '';
    let via = 'poll';
    let session = null;
    let failures = 0;
    let tick = 0;
    // Save-Indiz (Klick auf „Save“ laut Content-Script oder Spinner): erst damit zählt ein leeres Formular als gespeichert
    let saveIndicated = false;
    // Toasts, die beim Start schon sichtbar sind (OSDP zeigt sie 10 s), sind Reste der vorigen Meldung
    let staleToastIds = [];

    // Nachrichten des Beobachters aus dem OSDP-Tab: Posteingang + Wecker für die Wartezeit
    const inbox = [];
    let wake = null;
    const wait = (ms) => new Promise((resolve) => {
      if (inbox.length) return resolve();
      const timer = setTimeout(() => {
        wake = null;
        resolve();
      }, ms);
      wake = () => {
        clearTimeout(timer);
        wake = null;
        resolve();
      };
    });
    const takeMessage = () => {
      while (inbox.length) {
        const m = inbox.shift();
        if (session && m.session && m.session !== session) continue;
        if (REVIEW_EVENTS.has(m.event)) return m;
      }
      return null;
    };
    const onMessage = (msg, sender, sendResponse) => {
      if (!msg || msg.type !== REVIEW_MESSAGE) return undefined;
      if (sender?.tab?.id != null && this.tabId != null && sender.tab.id !== this.tabId) return undefined;
      if (session && msg.session && msg.session !== session) return undefined;
      sendResponse({ ack: true });
      if (REVIEW_EVENTS.has(msg.event)) {
        inbox.push(msg);
        if (wake) wake();
      }
      return undefined;
    };
    const runtime = typeof chrome !== 'undefined' && chrome.runtime?.onMessage ? chrome.runtime : null;
    const watch = (ignoreToasts) => this.exec('watchSave', { expectSource: expect, ignoreToastIds: ignoreToasts }, { create: false });
    /** Messpunkt auswerten; true = Ergebnis gefunden (outcome/reason gesetzt). */
    const evaluate = (w) => {
      if (!w) return false;
      if (!expect && w.sourceValue) expect = w.sourceValue;
      if (w.chips?.length) chips = w.chips;
      noteToasts(w.freshToasts || w.toasts);
      if (w.saveClicked || w.spinnerSeen || w.spinner) saveIndicated = true;
      if (w.success) {
        outcome = 'saved';
        reason = 'toast';
        return true;
      }
      if (w.duplicate) {
        outcome = 'duplicate';
        reason = 'toast';
        return true;
      }
      if (w.formReset && saveIndicated && !w.errorToast && !(w.errorVisible || []).length && !w.spinner) {
        outcome = 'saved';
        reason = 'formReset';
        return true;
      }
      return false;
    };
    /** Nachricht des Beobachters übernehmen; bei Überspringen/Abbrechen gewinnt ein inzwischen sichtbarer Save/Duplikat. */
    const applyMessage = async (m) => {
      via = 'message';
      if (m.chips?.length) chips = m.chips;
      noteToasts(m.toasts);
      if (m.event === 'saved' || m.event === 'duplicate') {
        outcome = m.event;
        reason = m.reason || 'message';
        return;
      }
      const w = await watch(staleToastIds).catch(() => null);
      if (w && evaluate(w)) return;
      outcome = m.event;
      reason = m.reason || 'overlay';
    };

    const overlay = { title, index, total, structure, wb, hint, expectSource: expect };
    if (runtime) runtime.onMessage.addListener(onMessage);
    try {
      const shown = await this.exec('showOverlay', overlay, { create: false }).catch(() => null);
      if (shown?.session) session = shown.session;
      const base = await watch([]).catch(() => null);
      if (base) {
        staleToastIds = (base.toasts || []).map((t) => t.id).filter(Boolean);
        if (!expect && base.sourceValue) expect = base.sourceValue;
        if (base.chips?.length) chips = base.chips;
      }
      while (Date.now() - start < timeoutMs) {
        tick++;
        // 1) Tab noch da?
        if (!(await this.tabAlive())) {
          outcome = 'lost';
          reason = 'tab';
          break;
        }
        // 2) Messpunkt zuerst: ein erkannter Save/Duplikat gewinnt gegen Überspringen/Abbrechen im selben Tick
        let w = null;
        let ov = null;
        try {
          w = await watch(staleToastIds);
          ov = await this.exec('readOverlay', {}, { create: false });
          failures = 0;
        } catch {
          // Seite lädt gerade oder ist nicht erreichbar: ein paar Ticks tolerieren
          if (++failures >= 3) {
            outcome = 'lost';
            reason = 'unreachable';
            break;
          }
        }
        if (evaluate(w)) break;
        // 3) Nachricht des Beobachters (sofortiger Weg)
        const msg = takeMessage();
        if (msg) {
          await applyMessage(msg);
          break;
        }
        // 4) App-Entscheidung (Buttons in der Extension-Seite)
        let ext = null;
        try {
          ext = await external();
        } catch {
          ext = null;
        }
        if (ext === 'skip' || ext === 'abort' || ext === 'saved') {
          outcome = ext;
          reason = 'app';
          via = 'app';
          break;
        }
        // 5) Leiste
        if (ov) {
          if (session && ov.session && ov.session !== session) {
            // Neue isolierte Welt → Dokument wurde neu geladen; die Eingaben sind weg
            outcome = 'lost';
            reason = 'reload';
            break;
          }
          if (!session && ov.session) session = ov.session;
          if (ov.action === 'skip' || ov.action === 'abort') {
            outcome = ov.action;
            reason = 'overlay';
            break;
          }
          if (!ov.visible) await this.exec('showOverlay', overlay, { create: false }).catch(() => {});
        }
        try {
          onTick({ tick, elapsedMs: Date.now() - start, chips, watch: w });
        } catch {
          /* ignorieren */
        }
        // Warten – eine Nachricht aus dem OSDP-Tab weckt sofort
        await wait(pollMs);
        const woke = takeMessage();
        if (woke) {
          await applyMessage(woke);
          break;
        }
      }
    } finally {
      if (runtime) runtime.onMessage.removeListener(onMessage);
      await this.exec('hideOverlay', {}, { create: false }).catch(() => {});
    }
    if (outcome === 'saved' || outcome === 'lost') this.formDirty = false; // Formular ist leer bzw. weg
    if (outcome === 'saved') this.lastFill = null;
    return { outcome, reason, chips, toasts: toastsSeen, tookMs: Date.now() - start, via };
  }
}
