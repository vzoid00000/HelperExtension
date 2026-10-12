// Analyse-Werkzeug: Wird in den OSDP-Tab injiziert und exportiert die Struktur des
// News-Editors (alle Formularfelder, Buttons, Labels, Framework-Hinweise und ein
// bereinigter HTML-Ausschnitt). Das Ergebnis dient dazu, die Selektoren für den
// Filler (src/content/osdp-filler.js) festzulegen.

(() => {
  if (globalThis.__osdpHelper?.inspect) return;

  const text = (el) => (el ? (el.textContent || '').replace(/\s+/g, ' ').trim() : '');

  function isVisible(el) {
    if (!el.getClientRects || el.getClientRects().length === 0) return false;
    const cs = getComputedStyle(el);
    return cs.display !== 'none' && cs.visibility !== 'hidden';
  }

  function cssPath(el) {
    const parts = [];
    let node = el;
    while (node && node.nodeType === 1 && node !== document.body && node !== document.documentElement) {
      let sel = node.localName;
      if (node.id && !/\d{3,}/.test(node.id)) {
        parts.unshift(`${sel}#${CSS.escape(node.id)}`);
        break;
      }
      const cls = [...node.classList].filter((c) => !/^(ng-|mat-focused|mat-form-field-(should|hide)|cdk-|_ng|v-|is-|has-)/.test(c) && !/\d{3,}/.test(c)).slice(0, 2);
      if (cls.length) sel += '.' + cls.map((c) => CSS.escape(c)).join('.');
      const parent = node.parentElement;
      if (parent) {
        const sib = [...parent.children].filter((e) => e.localName === node.localName);
        if (sib.length > 1) sel += `:nth-of-type(${sib.indexOf(node) + 1})`;
      }
      parts.unshift(sel);
      node = node.parentElement;
    }
    return parts.join(' > ');
  }

  function labelFor(el) {
    const out = [];
    if (el.id) {
      document.querySelectorAll(`label[for="${CSS.escape(el.id)}"]`).forEach((l) => out.push(text(l)));
    }
    const lbl = el.getAttribute('aria-labelledby');
    if (lbl) lbl.split(/\s+/).forEach((id) => out.push(text(document.getElementById(id))));
    const closestLabel = el.closest('label');
    if (closestLabel) out.push(text(closestLabel));
    const field = el.closest('mat-form-field, .mat-form-field, .mat-mdc-form-field, .form-group, .form-field, .field, .input-group, .p-field, .el-form-item, .ant-form-item, .v-input, .q-field, .form-control-wrapper, fieldset');
    if (field) {
      field.querySelectorAll('mat-label, label, legend, .label, [class*="label" i]').forEach((l) => {
        const t = text(l);
        if (t && t.length < 80) out.push(t);
      });
    }
    // Vorhergehendes Geschwister-Element mit kurzem Text (häufiges Layout: <span>Titel</span><input>)
    let prev = el.previousElementSibling;
    for (let i = 0; i < 2 && prev; i++, prev = prev.previousElementSibling) {
      const t = text(prev);
      if (t && t.length < 60 && !prev.querySelector('input, textarea, select, button')) out.push(t);
    }
    return [...new Set(out.filter(Boolean))];
  }

  const CONTROL_SELECTOR = [
    'input', 'textarea', 'select', 'button', '[role="button"]', '[role="textbox"]', '[role="combobox"]',
    '[role="listbox"]', '[role="checkbox"]', '[role="radio"]', '[contenteditable]', '.ql-editor',
    '.ProseMirror', '.tox-edit-area', '.cke_editable', 'mat-select', 'mat-checkbox', 'mat-radio-button',
    'mat-datepicker-toggle', 'ng-select', 'p-dropdown', 'p-calendar', '.ant-select', '.el-select', 'iframe'
  ].join(',');

  function describe(el) {
    const d = {
      tag: el.localName,
      type: el.getAttribute('type') || undefined,
      id: el.id || undefined,
      name: el.getAttribute('name') || undefined,
      placeholder: el.getAttribute('placeholder') || undefined,
      ariaLabel: el.getAttribute('aria-label') || undefined,
      role: el.getAttribute('role') || undefined,
      formControlName: el.getAttribute('formcontrolname') || el.getAttribute('formControlName') || undefined,
      ngModel: el.getAttribute('ng-model') || el.getAttribute('[(ngModel)]') || undefined,
      dataAttrs: undefined,
      classes: [...el.classList].slice(0, 12),
      labels: labelFor(el),
      text: /^(button|a)$/.test(el.localName) || el.getAttribute('role') === 'button' ? text(el).slice(0, 80) : undefined,
      value: undefined,
      contentEditable: el.isContentEditable || undefined,
      disabled: el.disabled || el.getAttribute('aria-disabled') === 'true' || undefined,
      visible: isVisible(el),
      path: cssPath(el)
    };
    const data = {};
    for (const a of el.attributes) {
      if (/^(data-|formcontrolname|ng-reflect-name|ng-reflect-placeholder|maxlength|required|readonly|autocomplete)/i.test(a.name)) {
        data[a.name] = a.value.slice(0, 120);
      }
    }
    if (Object.keys(data).length) d.dataAttrs = data;
    if ('value' in el && typeof el.value === 'string' && el.value) d.value = el.value.slice(0, 300);
    if (el.isContentEditable || el.classList.contains('ql-editor')) d.value = text(el).slice(0, 300);
    if (el.localName === 'iframe') d.value = `iframe src=${(el.getAttribute('src') || '').slice(0, 120)}`;
    if (el.localName === 'select') d.options = [...el.options].slice(0, 50).map((o) => ({ value: o.value, text: o.text }));
    const r = el.getBoundingClientRect();
    d.rect = { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
    return d;
  }

  function cleanHtml(root) {
    const clone = root.cloneNode(true);
    clone.querySelectorAll('script, style, svg, noscript, link, video, audio, canvas').forEach((n) => n.remove());
    const walker = document.createTreeWalker(clone, NodeFilter.SHOW_ELEMENT);
    const toStrip = [];
    while (walker.nextNode()) {
      const el = walker.currentNode;
      for (const a of [...el.attributes]) {
        if (a.value.length > 200 || /^(src|href)$/i.test(a.name) && /^data:/i.test(a.value)) {
          el.setAttribute(a.name, a.value.slice(0, 60) + '…[gekürzt]');
        }
      }
      if (el.localName === 'img') toStrip.push(el);
    }
    toStrip.forEach((img) => img.setAttribute('src', '[entfernt]'));
    let html = clone.outerHTML;
    const MAX = 600000;
    if (html.length > MAX) html = html.slice(0, MAX) + '\n<!-- … gekürzt auf 600 kB … -->';
    return html;
  }

  function commonAncestor(elements) {
    if (!elements.length) return document.body;
    let anc = elements[0];
    for (const el of elements.slice(1)) {
      while (anc && !anc.contains(el)) anc = anc.parentElement;
      if (!anc) return document.body;
    }
    return anc || document.body;
  }

  globalThis.__osdpHelper = globalThis.__osdpHelper || {};
  globalThis.__osdpHelper.inspect = function inspect() {
    const all = [...document.querySelectorAll(CONTROL_SELECTOR)];
    const controls = all.map(describe);

    const customElements = {};
    document.querySelectorAll('*').forEach((el) => {
      if (el.localName.includes('-')) customElements[el.localName] = (customElements[el.localName] || 0) + 1;
    });

    const framework = {
      angularVersion: document.querySelector('[ng-version]')?.getAttribute('ng-version') || null,
      angularLike: !!document.querySelector('[ng-version], [_nghost-ng-c0], [_ngcontent-ng-c0], [ng-reflect-name]') || [...document.querySelectorAll('*')].some((e) => [...e.attributes].some((a) => /^_ng(content|host)/.test(a.name))),
      reactLike: !!document.querySelector('[data-reactroot], [data-reactid]') || [...document.querySelectorAll('#root, #app, body > div')].some((e) => Object.keys(e).some((k) => k.startsWith('__react'))),
      vueLike: !!document.querySelector('[data-v-app]') || [...document.querySelectorAll('*')].some((e) => [...e.attributes].some((a) => /^data-v-[0-9a-f]{6,}/.test(a.name))),
      angularMaterial: !!document.querySelector('mat-form-field, .mat-mdc-form-field, .mat-form-field'),
      primeNg: !!document.querySelector('[class*="p-inputtext"], p-calendar, p-dropdown'),
      quill: !!document.querySelector('.ql-editor'),
      tinyMce: !!document.querySelector('.tox-tinymce, .mce-container'),
      ckEditor: !!document.querySelector('.ck-editor, .cke'),
      proseMirror: !!document.querySelector('.ProseMirror')
    };

    const visibleControls = all.filter(isVisible);
    const region = commonAncestor(visibleControls.length ? visibleControls : all);
    const regionEl = region === document.body ? document.querySelector('main, [role="main"], form, app-root, #app, #root') || document.body : region;

    const labels = [...document.querySelectorAll('label, mat-label, legend, .label')].map((l) => ({
      tag: l.localName,
      text: text(l).slice(0, 80),
      for: l.getAttribute('for') || undefined,
      path: cssPath(l)
    })).filter((l) => l.text);

    return {
      capturedAt: new Date().toISOString(),
      url: location.href,
      title: document.title,
      userAgent: navigator.userAgent,
      framework,
      customElements,
      scripts: [...document.scripts].map((s) => s.src).filter(Boolean).slice(0, 40),
      stylesheets: [...document.querySelectorAll('link[rel="stylesheet"]')].map((l) => l.href).slice(0, 20),
      counts: { controls: controls.length, visibleControls: visibleControls.length, labels: labels.length },
      labels,
      controls,
      regionPath: cssPath(regionEl),
      html: cleanHtml(regionEl)
    };
  };
})();
