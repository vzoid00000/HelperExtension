// Wird in den OSDP-Tab injiziert und trägt die Daten in den News-Editor ein.
// Die Feldzuordnung kommt aus src/config/osdp-selectors.js (plus Overrides aus den
// Einstellungen) und wird als Argument übergeben – RegEx-Muster sind Strings.

(() => {
  if (globalThis.__osdpHelper?.fill) return;

  const text = (el) => (el ? (el.textContent || '').replace(/\s+/g, ' ').trim() : '');
  const re = (pattern) => (pattern ? new RegExp(pattern, 'i') : null);

  function isVisible(el) {
    if (!el || !el.getClientRects || el.getClientRects().length === 0) return false;
    const cs = getComputedStyle(el);
    return cs.display !== 'none' && cs.visibility !== 'hidden';
  }

  const INPUT_SELECTOR = 'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]), textarea, select, [contenteditable="true"], [contenteditable=""], .ql-editor, .ProseMirror, [role="textbox"], mat-select, ng-select, p-dropdown';
  const CONTAINER_SELECTOR = 'mat-form-field, .mat-form-field, .mat-mdc-form-field, .form-group, .form-field, .field, .input-group, .p-field, .el-form-item, .ant-form-item, .v-input, .q-field, fieldset, div, li, tr, section';

  /** Sucht das Eingabeelement für ein Feld anhand der Konfiguration. */
  function findField(cfg) {
    if (!cfg) return null;
    const exclude = re(cfg.exclude);

    // 1) Expliziter Selektor
    if (cfg.selector) {
      for (const sel of cfg.selector.split(',').map((s) => s.trim()).filter(Boolean)) {
        try {
          const el = [...document.querySelectorAll(sel)].find(isVisible) || document.querySelector(sel);
          if (el) return el;
        } catch {
          /* ungültiger Selektor */
        }
      }
    }

    // 2) Über Label-Text
    const labelRe = re(cfg.label);
    if (labelRe) {
      const labels = [...document.querySelectorAll('label, mat-label, legend, .label, [class*="label" i], th, dt, span, div, p')]
        .filter((l) => {
          const t = text(l);
          return t && t.length <= 60 && labelRe.test(t) && !(exclude && exclude.test(t)) && isVisible(l);
        })
        // Kürzeste (präziseste) Treffer zuerst
        .sort((a, b) => text(a).length - text(b).length);

      for (const label of labels) {
        const forId = label.getAttribute('for');
        if (forId) {
          const el = document.getElementById(forId);
          if (el && isVisible(el)) return el;
        }
        const inside = label.querySelector(INPUT_SELECTOR);
        if (inside && isVisible(inside)) return inside;

        // Im umgebenden Feld-Container suchen (ohne zu weit nach oben zu gehen)
        let anc = label.parentElement;
        for (let i = 0; i < 4 && anc && anc !== document.body; i++, anc = anc.parentElement) {
          const candidates = [...anc.querySelectorAll(INPUT_SELECTOR)].filter(isVisible);
          if (candidates.length === 1) return candidates[0];
          if (candidates.length > 1) {
            // Das Element, das im DOM direkt nach dem Label kommt
            const after = candidates.find((c) => label.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING);
            if (after) return after;
          }
        }
        // Nächstes Geschwister-Element
        let next = label.nextElementSibling;
        for (let i = 0; i < 3 && next; i++, next = next.nextElementSibling) {
          if (next.matches(INPUT_SELECTOR) && isVisible(next)) return next;
          const inner = next.querySelector(INPUT_SELECTOR);
          if (inner && isVisible(inner)) return inner;
        }
      }
    }

    // 3) Über Platzhalter / aria-label / name / id / formControlName
    const attrRe = re(cfg.placeholder || cfg.label);
    if (attrRe) {
      const el = [...document.querySelectorAll(INPUT_SELECTOR)].find((e) => {
        const hay = [e.getAttribute('placeholder'), e.getAttribute('aria-label'), e.getAttribute('name'), e.id, e.getAttribute('formcontrolname'), e.getAttribute('data-placeholder')]
          .filter(Boolean)
          .join(' ');
        return hay && attrRe.test(hay) && !(exclude && exclude.test(hay)) && isVisible(e);
      });
      if (el) return el;
    }
    return null;
  }

  function findButton(cfg) {
    if (!cfg) return null;
    if (cfg.selector) {
      try {
        const el = [...document.querySelectorAll(cfg.selector)].find(isVisible);
        if (el) return el;
      } catch {
        /* ignorieren */
      }
    }
    const textRe = re(cfg.text);
    if (!textRe) return null;
    const candidates = [...document.querySelectorAll('button, a, [role="button"], mat-icon, .btn, input[type="button"], span[class*="button" i], span[class*="btn" i]')];
    return candidates.find((b) => {
      const hay = `${text(b)} ${b.getAttribute('title') || ''} ${b.getAttribute('aria-label') || ''} ${b.getAttribute('matTooltip') || ''} ${b.value || ''}`;
      return textRe.test(hay) && isVisible(b);
    }) || null;
  }

  /** Setzt den Wert eines <input>/<textarea> so, dass Angular/React/Vue es mitbekommen. */
  function setNativeValue(el, value) {
    const proto = el.localName === 'textarea' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, 'value');
    el.focus();
    if (desc && desc.set) desc.set.call(el, value);
    else el.value = value;
    el.dispatchEvent(new InputEvent('input', { bubbles: true, data: value, inputType: 'insertText' }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  function setContentEditable(el, value) {
    el.focus();
    let ok = false;
    try {
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(el);
      sel.removeAllRanges();
      sel.addRange(range);
      ok = document.execCommand('insertText', false, value);
    } catch {
      ok = false;
    }
    if (!ok || text(el).length < Math.min(value.length, 20)) {
      const html = value
        .split(/\n\s*\n/)
        .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
        .join('');
      el.innerHTML = html;
      el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
    el.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }

  function setSelect(el, value) {
    const want = String(value).toLowerCase();
    const opt = [...el.options].find((o) => o.value.toLowerCase() === want || o.text.trim().toLowerCase() === want)
      || [...el.options].find((o) => o.text.trim().toLowerCase().includes(want));
    if (!opt) return false;
    el.focus();
    el.value = opt.value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  /** Allgemeines Setzen eines Werts, je nach Elementtyp. */
  function setValue(el, value) {
    if (!el) return false;
    el.scrollIntoView?.({ block: 'center', behavior: 'instant' });
    if (el.localName === 'select') return setSelect(el, value);
    if (el.localName === 'input' || el.localName === 'textarea') {
      setNativeValue(el, value);
      return true;
    }
    if (el.localName === 'iframe') {
      const body = el.contentDocument?.body;
      if (body && body.isContentEditable) {
        setContentEditable(body, value);
        return true;
      }
      return false;
    }
    if (el.isContentEditable || el.getAttribute('role') === 'textbox' || el.classList.contains('ql-editor') || el.classList.contains('ProseMirror')) {
      setContentEditable(el, value);
      return true;
    }
    // Custom-Dropdowns (mat-select, ng-select …) brauchen eine eigene Behandlung – siehe setChoice.
    const inner = el.querySelector('input, textarea, [contenteditable="true"]');
    if (inner) return setValue(inner, value);
    return false;
  }

  /** Auswahl in Dropdowns/Radios (z. B. Bereich: Cyber / KriMiSi). */
  async function setChoice(el, value) {
    const want = String(value).toLowerCase();
    if (el.localName === 'select') return setSelect(el, value);
    if (el.matches('input[type="radio"], input[type="checkbox"], mat-radio-button, mat-checkbox, [role="radio"]')) {
      el.click();
      return true;
    }
    // Custom-Dropdown öffnen und Option mit passendem Text anklicken.
    el.click();
    await new Promise((r) => setTimeout(r, 250));
    const options = [...document.querySelectorAll('mat-option, .mat-mdc-option, .ng-option, [role="option"], li.p-dropdown-item, .el-select-dropdown__item, .ant-select-item-option')].filter(isVisible);
    const opt = options.find((o) => text(o).toLowerCase() === want) || options.find((o) => text(o).toLowerCase().includes(want));
    if (opt) {
      opt.click();
      return true;
    }
    document.body.click(); // Dropdown wieder schließen
    return false;
  }

  /**
   * @param {object} data  { url, title, author, authorUnknown, authorUnknownText, date, dateIso,
   *                         sourceText, translatedText, category, categoryLabel }
   * @param {object} selectors  siehe src/config/osdp-selectors.js
   */
  globalThis.__osdpHelper = globalThis.__osdpHelper || {};
  globalThis.__osdpHelper.fill = async function fill(data, selectors) {
    const report = { filled: [], missing: [], notes: [], fields: {} };

    const simple = [
      ['url', data.url],
      ['title', data.title],
      ['sourceText', data.sourceText],
      ['translatedText', data.translatedText]
    ];
    for (const [key, value] of simple) {
      if (!value) continue;
      const el = findField(selectors[key]);
      report.fields[key] = el ? describeShort(el) : null;
      if (el && setValue(el, value)) report.filled.push(key);
      else report.missing.push(key);
    }

    // Datum: <input type="date"> braucht ISO, sonst das konfigurierte Format.
    if (data.date || data.dateIso) {
      const el = findField(selectors.date);
      report.fields.date = el ? describeShort(el) : null;
      const value = el && el.localName === 'input' && el.type === 'date' ? data.dateIso : data.date;
      if (el && setValue(el, value)) report.filled.push('date');
      else report.missing.push('date');
    }

    // Autor: Person eintragen, sonst "Autor ungenannt"-Button bzw. Text.
    if (data.authorUnknown) {
      const btn = findButton(selectors.authorUnknownButton);
      if (btn) {
        btn.click();
        report.filled.push('author (Button „Autor ungenannt“)');
      } else {
        const el = findField(selectors.author);
        report.fields.author = el ? describeShort(el) : null;
        if (el && setValue(el, data.authorUnknownText || 'Autor ungenannt')) {
          report.filled.push('author (Text „Autor ungenannt“)');
          report.notes.push('Kein „Autor ungenannt“-Button gefunden – Text direkt eingetragen.');
        } else report.missing.push('author');
      }
    } else if (data.author) {
      const el = findField(selectors.author);
      report.fields.author = el ? describeShort(el) : null;
      if (el && setValue(el, data.author)) report.filled.push('author');
      else report.missing.push('author');
    }

    // Bereich (Cyber / KriMiSi), falls ein Feld dafür existiert.
    if (data.categoryLabel && selectors.category && (selectors.category.selector || selectors.category.label)) {
      const el = findField(selectors.category);
      report.fields.category = el ? describeShort(el) : null;
      if (el && (await setChoice(el, data.categoryLabel))) report.filled.push('category');
      else report.missing.push('category');
    }

    return report;
  };

  function describeShort(el) {
    return `${el.localName}${el.id ? '#' + el.id : ''}${el.getAttribute('formcontrolname') ? '[formcontrolname=' + el.getAttribute('formcontrolname') + ']' : ''}${el.getAttribute('placeholder') ? '[placeholder=' + el.getAttribute('placeholder') + ']' : ''}`;
  }
})();
