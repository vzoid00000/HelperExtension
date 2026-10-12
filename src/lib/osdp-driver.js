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

import { waitForTabLoad } from './tabloader.js';
import { formatDate, toIsoDate } from './dates.js';

export const OSDP_BASE = 'https://osdp.zentdok.at';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Basis-URL aus dem URL-Muster der Einstellungen (z. B. "http://localhost:4300/*" für den Nachbau). */
export function osdpBase(settings) {
  const pattern = (settings?.osdpUrlPattern || '').trim();
  const m = /^(https?:\/\/[^/*]+)/i.exec(pattern);
  return m ? m[1] : OSDP_BASE;
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
  }

  async ensureTab() {
    if (this.tabId) {
      try {
        await chrome.tabs.get(this.tabId);
        return this.tabId;
      } catch {
        this.tabId = null;
      }
    }
    const tabs = await chrome.tabs.query({ url: this.settings.osdpUrlPattern || `${OSDP_BASE}/*` });
    let tab = tabs.find((t) => /newsEditor/i.test(t.url || '')) || tabs[0];
    if (!tab) {
      this.log('Öffne OSDP in neuem Tab …');
      tab = await chrome.tabs.create({ url: `${osdpBase(this.settings)}/#/news`, active: false });
      await waitForTabLoad(tab.id, 30000);
      await sleep(1500);
    }
    this.tabId = tab.id;
    return tab.id;
  }

  async exec(step, data) {
    const tabId = await this.ensureTab();
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
      await chrome.tabs.update(tabId, { url: `${osdpBase(this.settings)}/#/news` });
      await sleep(200);
      await chrome.tabs.reload(tabId);
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

  /** Leeres Formular sicherstellen: vorhandenen leeren Editor weiterverwenden, sonst neu laden. */
  async freshEditor() {
    const p = await this.probe();
    const clean = p?.hasEditor && p.groups.length >= 2 && !p.sourceValue && !p.titleValue && !(p.chips || []).length;
    if (clean) return p;
    return this.openEditor({ reload: true });
  }

  async focusTab() {
    const tabId = await this.ensureTab();
    await chrome.tabs.update(tabId, { active: true });
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
   * Trägt einen Artikel vollständig ein.
   * @param {object} a  { url, titleEn, textEn, titleDe, textDe, author, authorUnknown, date (Date), category,
   *                      tagPaths?: string[], tagUids?: number[] }
   * @param {object} opts  { save: boolean, translateFn?: ({title,text}) => Promise<{title,text}> }
   */
  async fillArticle(a, { save = false, translateFn = null } = {}) {
    const s = this.settings;
    const report = { steps: {}, problems: [] };
    const note = (key, r) => {
      report.steps[key] = r;
      if (!r || r.ok === false) report.problems.push(`${key}: ${r?.error || 'fehlgeschlagen'}`);
      return r;
    };

    await this.freshEditor();

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

    if (save) {
      const sv = note('save', await this.exec('save', { timeoutMs: 25000 }));
      report.saved = !!(sv?.ok && sv.success);
      report.duplicate = !!sv?.duplicate;
      report.snackbar = (sv?.toasts || []).map((t) => `${t.title}: ${t.message}`).join(' | ');
      if (sv?.ok && !sv.success) {
        report.problems.push(sv.duplicate ? 'OSDP: Duplikat – URL ist bereits in der Datenbank' : `Speichern ohne Erfolgsmeldung${sv.errors?.length ? ': ' + sv.errors.join('; ') : ''}`);
      }
    }
    report.ok = report.problems.length === 0;
    return report;
  }
}
