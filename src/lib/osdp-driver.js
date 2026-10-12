// Steuert den OSDP News-Editor aus einer Extension-Seite heraus (Side Panel oder
// Automatik-Seite). Die DOM-Schritte liegen in src/content/osdp-filler.js (isolierte
// Welt); die CKEditor-Inhalte werden in der MAIN-Welt über editor.setData() gesetzt.

import { waitForTabLoad } from './tabloader.js';
import { formatDate, toIsoDate } from './dates.js';

export const OSDP_BASE = 'https://osdp.zentdok.at';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Läuft in der MAIN-Welt der OSDP-Seite: CKEditor-Inhalt eines Tabs setzen. */
function ckSetData(groupPattern, tabPattern, html) {
  const text = (el) => (el && el.textContent ? el.textContent : '').replace(/\s+/g, ' ').trim();
  const gre = new RegExp(groupPattern, 'i');
  const tre = new RegExp(tabPattern, 'i');
  const tabsOf = (g) => [...g.querySelectorAll('.mat-mdc-tab, [role="tab"]')].filter((t) => t.closest('mat-tab-group') === g);
  const group = [...document.querySelectorAll('mat-tab-group')].find((g) => tabsOf(g).some((t) => gre.test(text(t))));
  if (!group) return { ok: false, error: 'Tab-Gruppe nicht gefunden' };
  const idx = tabsOf(group).findIndex((t) => tre.test(text(t)));
  const bodies = [...group.querySelectorAll('mat-tab-body')].filter((b) => b.closest('mat-tab-group') === group);
  const editable = bodies[idx] ? bodies[idx].querySelector('.ck-editor__editable') : null;
  const editor = editable ? editable.ckeditorInstance : null;
  if (!editor) return { ok: false, error: `CKEditor-Instanz nicht gefunden (Tab „${tabPattern}“)` };
  editor.setData(html);
  return { ok: true, length: editor.getData().length };
}

/** Läuft in der MAIN-Welt: CKEditor-Inhalt eines Tabs lesen (HTML). */
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
      tab = await chrome.tabs.create({ url: `${OSDP_BASE}/#/newsEditor`, active: false });
      await waitForTabLoad(tab.id, 30000);
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

  async setEditorContent(tabPattern, html) {
    const tabId = await this.ensureTab();
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: ckSetData,
      args: ['native', tabPattern, html]
    });
    return result;
  }

  async getEditorContent(tabPattern) {
    const tabId = await this.ensureTab();
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: ckGetData,
      args: ['native', tabPattern]
    });
    return result;
  }

  async waitForEditor(timeoutMs = 25000) {
    const start = Date.now();
    let probe = null;
    while (Date.now() - start < timeoutMs) {
      probe = await this.exec('probe').catch(() => null);
      if (probe?.loginForm) throw new Error('OSDP verlangt eine Anmeldung – bitte im OSDP-Tab einloggen und erneut starten.');
      if (probe?.hasEditor && probe.groups.length >= 2) return probe;
      await sleep(500);
    }
    throw new Error('OSDP News-Editor wurde nicht geladen (Timeout).');
  }

  /** Editor neu laden, damit ein leeres Formular vorliegt. */
  async freshEditor() {
    const tabId = await this.ensureTab();
    await chrome.tabs.update(tabId, { url: `${OSDP_BASE}/#/newsEditor` });
    await sleep(200);
    await chrome.tabs.reload(tabId);
    await waitForTabLoad(tabId, 30000);
    await sleep(500);
    const probe = await this.waitForEditor();
    if (probe.sourceValue) this.log('Hinweis: Der Editor enthält noch Daten einer vorherigen News.');
    return probe;
  }

  async focusTab() {
    const tabId = await this.ensureTab();
    await chrome.tabs.update(tabId, { active: true });
  }

  /**
   * Trägt einen Artikel vollständig ein.
   * @param {object} a  { url, titleEn, textEn, titleDe, textDe, author, authorUnknown, date (Date), category, tagPaths? }
   * @param {object} opts  { save: boolean, fresh: boolean, translateFn?: ({title,text}) => Promise<{title,text}> }
   */
  async fillArticle(a, { save = false, fresh = true, translateFn = null } = {}) {
    const s = this.settings;
    const report = { steps: {}, problems: [] };
    const note = (key, r) => {
      report.steps[key] = r;
      if (!r || r.ok === false) report.problems.push(`${key}: ${r?.error || 'fehlgeschlagen'}`);
      return r;
    };

    if (fresh) await this.freshEditor();
    else await this.waitForEditor();

    let titleEn = a.titleEn;
    let textEn = a.textEn;
    let titleDe = a.titleDe;
    let textDe = a.textDe;

    // Native: Quelle + Titel + Inhalt
    note('native', await this.exec('fillNative', { url: a.url, title: titleEn }));

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
            this.log('Übersetze den von OSDP extrahierten Text …');
            const tr = await translateFn({ title: titleEn, text: textEn });
            titleDe = tr.title;
            textDe = tr.text;
          }
        }
      }
    }
    if (!(s.useSiteExtract && report.steps.extractWait?.ok)) {
      note('nativeContent', await this.setEditorContent('^\\s*native\\s*$', textToHtml(textEn)));
    }

    // English Translated (Quelle ist Englisch → identisch)
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
      date: date ? formatDate(date, s.osdpDateFormat || 'dd.MM.yyyy') : '',
      dateIso: date ? toIsoDate(date) : ''
    }));
    const m = report.steps.metadata;
    if (m?.ok) {
      if (m.author === false) report.problems.push('Autor-Feld im Reiter „Metadata“ nicht gefunden');
      if (m.date === false) report.problems.push('Datum-Feld im Reiter „Metadata“ nicht gefunden');
    }

    // Tags: vollständige Pfade aus dem Tagger, sonst Minimal-Fallback (nur Struktur-Bereich)
    if (Array.isArray(a.tagPaths) && a.tagPaths.length) {
      const r = note('tags', await this.exec('applyTags', { paths: a.tagPaths }));
      if (r?.failed?.length) report.problems.push(`Tags nicht gesetzt: ${r.failed.map((f) => `${f.path} (${f.error})`).join('; ')}`);
    } else {
      const tagLabel = a.category === 'krimisi' ? s.tagLabelKrimisi || 'KriMiSi' : s.tagLabelCyber || 'Cyber';
      note('tag', await this.exec('checkTag', { label: tagLabel }));
    }

    // Zurück zum Native-Tab, damit der Nutzer den Eintrag sieht
    await this.exec('selectTab', { group: 'native', tab: '^\\s*native\\s*$' }).catch(() => {});

    if (save) {
      note('save', await this.exec('save', { timeoutMs: 25000 }));
      const sv = report.steps.save;
      if (sv?.ok && sv.errorVisible?.length) report.problems.push(`Formularfehler nach Save: ${sv.errorVisible.join('; ')}`);
      report.saved = !!(sv?.ok && !sv.errorVisible?.length);
      report.snackbar = sv?.snackbar || '';
    }
    report.ok = report.problems.length === 0;
    return report;
  }
}
