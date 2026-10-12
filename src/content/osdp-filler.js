// Wird in den OSDP-Tab injiziert (isolierte Welt) und führt einzelne Schritte im
// News-Editor aus. Die Struktur stammt aus dem DOM-Dump (Angular 17 + Material):
//
//   Tab-Gruppe 1: Native | English Translated | German Translated | Summary
//     je Tab: input[formcontrolname=article_source|article_title|article_title_translatedde…]
//             ckeditor[formcontrolname=article_content…]  (CKEditor 5 → wird in der
//             MAIN-Welt über editor.setData() befüllt, siehe lib/osdp-driver.js)
//   Tab-Gruppe 2: Metadata | Tags
//     Tags: mat-tree mit Checkboxen (Struktur, Cyber, KriMiSi, …)
//   Oben: Buttons Save | Extract | Summary | Translate
//
// Aufruf: globalThis.__osdpHelper.run('<schritt>', daten)

(() => {
  if (globalThis.__osdpHelper?.run) return;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const collapse = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const text = (el) => collapse(el ? el.textContent : '');

  function isVisible(el) {
    if (!el || !el.getClientRects || el.getClientRects().length === 0) return false;
    const cs = getComputedStyle(el);
    return cs.display !== 'none' && cs.visibility !== 'hidden';
  }

  // ------------------------------------------------------------ Tabs ----
  const tabGroups = () => [...document.querySelectorAll('mat-tab-group')];
  const groupTabs = (g) => [...g.querySelectorAll('.mat-mdc-tab, [role="tab"]')].filter((t) => t.closest('mat-tab-group') === g);
  const groupBodies = (g) => [...g.querySelectorAll('mat-tab-body')].filter((b) => b.closest('mat-tab-group') === g);

  function findGroup(labelPattern) {
    const re = new RegExp(labelPattern, 'i');
    return tabGroups().find((g) => groupTabs(g).some((t) => re.test(text(t)))) || null;
  }

  /** Tab anklicken und dessen Body zurückgeben (wartet bei lazy gerenderten Tabs). */
  async function selectTab(group, labelPattern) {
    if (!group) return null;
    const re = new RegExp(labelPattern, 'i');
    const tabs = groupTabs(group);
    const idx = tabs.findIndex((t) => re.test(text(t)));
    if (idx < 0) return null;
    const tab = tabs[idx];
    const active = tab.classList.contains('mdc-tab--active') || tab.getAttribute('aria-selected') === 'true';
    if (!active) {
      tab.click();
      await sleep(350);
    }
    let body = groupBodies(group)[idx];
    for (let i = 0; i < 25 && body && !(body.querySelector('input, textarea, button, mat-tree, ckeditor, mat-form-field')); i++) {
      await sleep(200);
      body = groupBodies(group)[idx];
    }
    return body || null;
  }

  // ---------------------------------------------------------- Inputs ----
  function setNativeValue(el, value) {
    const proto = el.localName === 'textarea' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, 'value');
    el.focus();
    if (desc && desc.set) desc.set.call(el, value);
    else el.value = value;
    el.dispatchEvent(new InputEvent('input', { bubbles: true, data: value, inputType: 'insertText' }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
    el.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
  }

  function fillControl(body, controlName, value) {
    const el = body?.querySelector(`input[formcontrolname="${controlName}"], textarea[formcontrolname="${controlName}"]`);
    if (!el) return false;
    setNativeValue(el, value);
    return true;
  }

  /** Eingabefeld über den Label-Text finden (mat-form-field → mat-label). */
  function findLabelField(body, pattern) {
    if (!body) return null;
    const re = new RegExp(pattern, 'i');
    for (const ff of body.querySelectorAll('mat-form-field')) {
      const label = text(ff.querySelector('mat-label, label'));
      const placeholder = ff.querySelector('input, textarea')?.getAttribute('placeholder') || '';
      if (re.test(label) || re.test(placeholder)) {
        const input = ff.querySelector('input, textarea, mat-select, select');
        if (input) return input;
      }
    }
    for (const l of body.querySelectorAll('label')) {
      if (!re.test(text(l))) continue;
      const forId = l.getAttribute('for');
      const el = forId && document.getElementById(forId);
      if (el) return el;
      const inner = l.querySelector('input, textarea, select');
      if (inner) return inner;
    }
    for (const i of body.querySelectorAll('input, textarea')) {
      const hay = [i.getAttribute('placeholder'), i.getAttribute('aria-label'), i.getAttribute('formcontrolname'), i.getAttribute('name')].filter(Boolean).join(' ');
      if (hay && re.test(hay)) return i;
    }
    return null;
  }

  function findButton(root, pattern) {
    const re = new RegExp(pattern, 'i');
    return [...(root || document).querySelectorAll('button, [role="button"], a.mdc-button, mat-icon')].find((b) => {
      const hay = `${text(b)} ${b.getAttribute('aria-label') || ''} ${b.getAttribute('mattooltip') || ''} ${b.getAttribute('title') || ''}`;
      return re.test(hay) && isVisible(b);
    }) || null;
  }

  function describeBody(body) {
    if (!body) return null;
    return {
      labels: [...body.querySelectorAll('mat-label, label, legend')].map(text).filter(Boolean),
      buttons: [...body.querySelectorAll('button, [role="button"]')].map((b) => `${text(b)}${b.getAttribute('aria-label') ? ' [' + b.getAttribute('aria-label') + ']' : ''}`).filter(Boolean),
      inputs: [...body.querySelectorAll('input, textarea, mat-select, select, mat-checkbox, mat-slide-toggle')].map((i) => ({
        tag: i.localName,
        type: i.getAttribute('type') || undefined,
        formControlName: i.getAttribute('formcontrolname') || undefined,
        placeholder: i.getAttribute('placeholder') || undefined,
        id: i.id || undefined,
        value: typeof i.value === 'string' ? i.value.slice(0, 80) : undefined
      }))
    };
  }

  const topBar = () => document.querySelector('app-editor form > div, app-editor form') || document.body;
  const spinnerVisible = () => [...document.querySelectorAll('ngx-spinner .ngx-spinner-overlay, ngx-spinner div')].some(isVisible);
  const snackbarText = () => text(document.querySelector('mat-snack-bar-container, .mat-mdc-snack-bar-container, simple-snack-bar')) || '';

  // ----------------------------------------------------------- Steps ----
  const steps = {
    probe() {
      const native = findGroup('native');
      const body = native ? groupBodies(native)[0] : null;
      return {
        url: location.href,
        hasEditor: !!document.querySelector('app-news-editor, app-editor'),
        loginForm: !!document.querySelector('input[type="password"]'),
        groups: tabGroups().map((g) => groupTabs(g).map(text)),
        sourceValue: body?.querySelector('input[formcontrolname="article_source"]')?.value || '',
        titleValue: body?.querySelector('input[formcontrolname="article_title"]')?.value || '',
        spinner: spinnerVisible(),
        topButtons: [...topBar().querySelectorAll('button')].map(text)
      };
    },

    async fillNative({ url, title }) {
      const group = findGroup('native');
      const body = await selectTab(group, '^\\s*native\\s*$');
      if (!body) return { ok: false, error: 'Tab „Native“ nicht gefunden' };
      const r = { ok: true };
      if (url !== undefined) r.source = fillControl(body, 'article_source', url);
      if (title !== undefined) r.title = fillControl(body, 'article_title', title);
      return r;
    },

    async fillTranslated({ lang, title }) {
      const group = findGroup('native');
      const pattern = lang === 'de' ? 'german' : 'english';
      const body = await selectTab(group, pattern);
      if (!body) return { ok: false, error: `Tab „${lang === 'de' ? 'German' : 'English'} Translated“ nicht gefunden` };
      return { ok: true, title: fillControl(body, `article_title_translated${lang}`, title) };
    },

    async selectTab({ group, tab }) {
      const body = await selectTab(findGroup(group), tab);
      return { ok: !!body };
    },

    /** Titel und Text des Native-Tabs lesen (z. B. nach dem Site-eigenen „Extract“). */
    async readNative() {
      const group = findGroup('native');
      const body = await selectTab(group, '^\\s*native\\s*$');
      if (!body) return { ok: false };
      const editable = body.querySelector('.ck-editor__editable');
      const paragraphs = editable ? [...editable.querySelectorAll('p, h1, h2, h3, h4, li, blockquote')].map(text).filter(Boolean) : [];
      return {
        ok: true,
        title: body.querySelector('input[formcontrolname="article_title"]')?.value || '',
        text: paragraphs.join('\n\n')
      };
    },

    async clickTopButton({ pattern }) {
      const btn = findButton(topBar(), pattern);
      if (!btn) return { ok: false, error: `Button „${pattern}“ nicht gefunden` };
      if (btn.disabled) return { ok: false, error: `Button „${pattern}“ ist deaktiviert` };
      btn.click();
      return { ok: true };
    },

    /** Wartet nach „Extract“, bis Titel/Inhalt befüllt sind und der Spinner weg ist. */
    async waitForExtract({ timeoutMs = 45000 } = {}) {
      const start = Date.now();
      await sleep(800);
      while (Date.now() - start < timeoutMs) {
        const group = findGroup('native');
        const body = group ? groupBodies(group)[0] : null;
        const title = body?.querySelector('input[formcontrolname="article_title"]')?.value || '';
        const content = text(body?.querySelector('.ck-editor__editable'));
        if (!spinnerVisible() && title && content.length > 200) return { ok: true, title, contentLength: content.length };
        await sleep(500);
      }
      return { ok: false, error: 'Extract hat nicht rechtzeitig Daten geliefert' };
    },

    /** Reiter „Metadata“: Autor und Datum. Liefert zusätzlich eine Beschreibung aller Felder. */
    async fillMetadata({ author, authorUnknown, authorUnknownText, date, dateIso }) {
      const group = findGroup('metadata');
      const body = await selectTab(group, 'metadata');
      if (!body) return { ok: false, error: 'Tab „Metadata“ nicht gefunden' };
      await sleep(300);
      const r = { ok: true, found: {}, structure: describeBody(body) };

      // Autor
      const authorField = findLabelField(body, 'author|autor|verfasser|byline');
      r.found.author = authorField ? `${authorField.localName}[${authorField.getAttribute('formcontrolname') || authorField.id || ''}]` : null;
      if (authorUnknown) {
        const btn = findButton(body, 'ungenannt|unknown|anonym|no author|kein autor');
        if (btn) {
          btn.click();
          await sleep(200);
          r.author = 'button';
        } else if (authorField) {
          setNativeValue(authorField, authorUnknownText || 'Autor ungenannt');
          r.author = 'text';
        } else r.author = false;
        r.authorValue = authorField?.value;
      } else if (author !== undefined) {
        if (authorField) {
          setNativeValue(authorField, author);
          r.author = 'text';
        } else r.author = false;
      }

      // Datum
      const dateField = findLabelField(body, 'date|datum|published|veröffentlicht|erschienen');
      r.found.date = dateField ? `${dateField.localName}[type=${dateField.type || ''} ${dateField.getAttribute('formcontrolname') || dateField.id || ''}]` : null;
      if (dateField && (date || dateIso)) {
        const value = dateField.localName === 'input' && dateField.type === 'date' ? dateIso : date;
        setNativeValue(dateField, value);
        await sleep(150);
        r.date = true;
        r.dateValue = dateField.value;
      } else if (date || dateIso) r.date = false;

      return r;
    },

    /** Reiter „Tags“: Checkbox mit passendem Label (z. B. „Cyber“) anhaken. */
    async checkTag({ label }) {
      const group = findGroup('tags');
      const body = await selectTab(group, '^\\s*tags\\s*$');
      if (!body) return { ok: false, error: 'Tab „Tags“ nicht gefunden' };
      await sleep(200);
      const want = collapse(label).toLowerCase();
      const nodes = [...body.querySelectorAll('mat-tree-node, mat-checkbox')];
      const node = nodes.find((n) => text(n.querySelector('label.mdc-label, label')).toLowerCase() === want)
        || nodes.find((n) => text(n.querySelector('label.mdc-label, label')).toLowerCase().includes(want));
      if (!node) return { ok: false, error: `Tag „${label}“ nicht gefunden`, available: nodes.map((n) => text(n.querySelector('label'))).filter(Boolean) };
      const input = node.querySelector('input[type="checkbox"]');
      if (!input) return { ok: false, error: 'Checkbox nicht gefunden' };
      if (!input.checked) {
        input.click();
        await sleep(250);
      }
      return {
        ok: input.checked,
        checked: input.checked,
        chips: [...document.querySelectorAll('mat-chip-listbox mat-chip, mat-chip-listbox .mdc-evolution-chip__text-label, mat-chip-option')].map(text).filter(Boolean)
      };
    },

    /** „Save“ klicken und auf Rückmeldung warten. */
    async save({ timeoutMs = 25000 } = {}) {
      const btn = findButton(topBar(), '^\\s*save\\s*$|speichern');
      if (!btn) return { ok: false, error: 'Button „Save“ nicht gefunden' };
      if (btn.disabled) return { ok: false, error: 'Button „Save“ ist deaktiviert' };
      const urlBefore = location.href;
      btn.click();
      const start = Date.now();
      let spinnerSeen = false;
      let snackbar = '';
      await sleep(400);
      while (Date.now() - start < timeoutMs) {
        if (spinnerVisible()) spinnerSeen = true;
        const sb = snackbarText();
        if (sb) snackbar = sb;
        const sourceNow = document.querySelector('input[formcontrolname="article_source"]')?.value || '';
        const done = (snackbar && !spinnerVisible()) || location.href !== urlBefore || (spinnerSeen && !spinnerVisible() && !sourceNow);
        if (done) break;
        await sleep(300);
      }
      return {
        ok: true,
        snackbar,
        spinnerSeen,
        urlAfter: location.href,
        sourceAfter: document.querySelector('input[formcontrolname="article_source"]')?.value || '',
        errorVisible: [...document.querySelectorAll('mat-error, .mat-mdc-form-field-error')].map(text).filter(Boolean)
      };
    }
  };

  globalThis.__osdpHelper = Object.assign(globalThis.__osdpHelper || {}, {
    run: async (step, data) => {
      if (!steps[step]) throw new Error(`Unbekannter Schritt: ${step}`);
      return steps[step](data || {});
    }
  });
})();
