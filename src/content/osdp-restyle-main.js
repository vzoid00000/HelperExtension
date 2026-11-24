// Teil des Aufräumens der OSDP-Oberfläche, der Zugriff auf die Seiten-Objekte braucht (MAIN-Welt,
// siehe manifest.json; der Rest steht in osdp-restyle.js):
//   • CKEditor 5 auf reinen Text begrenzen: Das Schema erlaubt nur Absätze aus Text (und Zeilen-
//     umbrüchen); beim Einfügen, Extract und Übersetzen werden Überschriften, Fett/Kursiv, Links,
//     Bilder, Tabellen, Listen und Zitate zu normalem Text. Dazu werden die Formatier-Befehle
//     abgeschaltet (Tastenkürzel wie Strg+B bleiben wirkungslos).
//   • Rechte Reitergruppe (Metadata | Tags): preserveContent = true über die Angular-Komponente,
//     damit beide Reiterkörper im DOM bleiben und untereinander gezeigt werden können.
//
// Steuerung über Attribute am <html>-Element: data-osdp-helper-restyle="1" (an), data-osdp-helper-
// plain="1" (reiner Text). Ergebnis: data-osdp-helper-preserved="1" | "no-ng" | "error" an der
// Reitergruppe. Einmal eingeschränkte Editoren bleiben bis zum Neuladen so.

(() => {
  if (window.top !== window) return;
  if (globalThis.__osdpHelperRestyleMain) return;
  globalThis.__osdpHelperRestyleMain = true;

  const html = document.documentElement;
  const PLAIN_ID = 'osdpHelperPlain';
  const BLOCK_PARENTS = new Set(['$root', '$clipboardHolder', '$documentFragment']);
  const PARAGRAPH_CHILDREN = new Set(['$text', 'softBreak']);
  const DISABLED_COMMANDS = ['bold', 'italic', 'underline', 'strikethrough', 'code', 'subscript', 'superscript', 'link', 'unlink', 'heading',
    'blockQuote', 'insertTable', 'imageUpload', 'uploadImage', 'imageInsert', 'insertImage', 'imageTextAlternative', 'mediaEmbed',
    'bulletedList', 'numberedList', 'todoList', 'indent', 'outdent', 'indentList', 'outdentList', 'indentBlock', 'outdentBlock',
    'codeBlock', 'horizontalLine', 'fontSize', 'fontFamily', 'fontColor', 'fontBackgroundColor', 'alignment', 'highlight',
    'specialCharacters', 'htmlEmbed', 'sourceEditing'];

  const active = () => html.getAttribute('data-osdp-helper-restyle') === '1';
  const plainWanted = () => html.getAttribute('data-osdp-helper-plain') === '1';

  function restrict(editor) {
    const schema = editor.model.schema;
    schema.addChildCheck((context, child) => {
      const parent = context.last && context.last.name;
      if (BLOCK_PARENTS.has(parent)) return child.name === 'paragraph' ? undefined : false;
      if (parent === 'paragraph') return PARAGRAPH_CHILDREN.has(child.name) ? undefined : false;
      return undefined;
    });
    // Keine Text-Attribute (bold, italic, linkHref …) und keine Absatz-Attribute (Listen sind in
    // CKEditor 5 Absätze mit listItemId/listType, Ausrichtung ist ein Absatz-Attribut)
    schema.addAttributeCheck((context) => (context.endsWith('$text') || context.endsWith('paragraph') ? false : undefined));
    for (const name of DISABLED_COMMANDS) {
      const cmd = editor.commands.get(name);
      if (cmd && typeof cmd.forceDisabled === 'function') cmd.forceDisabled(PLAIN_ID);
    }
    // Vorhandener Inhalt (z. B. ein bestehender Artikel) wird nicht angefasst – nur Neues wird zu Text.
  }

  function makePlain(editor) {
    if (!editor || editor.__osdpHelperPlain) return;
    editor.__osdpHelperPlain = true;
    const run = () => {
      try {
        restrict(editor);
      } catch (e) {
        console.warn('OSDP News Helper: CKEditor konnte nicht auf reinen Text begrenzt werden', e);
      }
    };
    if (editor.state === 'ready') run();
    else if (typeof editor.once === 'function') editor.once('ready', run);
  }

  function plainEditors() {
    for (const el of document.querySelectorAll('.ck-editor__editable')) {
      const ed = el.ckeditorInstance;
      if (ed) makePlain(ed);
    }
  }

  function preserveTabs() {
    for (const g of document.querySelectorAll('mat-tab-group[data-osdp-helper-group="meta"]:not([data-osdp-helper-preserved])')) {
      try {
        const ng = window.ng;
        const cmp = ng && typeof ng.getComponent === 'function' ? ng.getComponent(g) : null;
        if (!cmp) {
          g.setAttribute('data-osdp-helper-preserved', 'no-ng');
          continue;
        }
        cmp.preserveContent = true;
        if (typeof ng.applyChanges === 'function') ng.applyChanges(cmp);
        g.setAttribute('data-osdp-helper-preserved', '1');
      } catch (e) {
        g.setAttribute('data-osdp-helper-preserved', 'error');
        console.warn('OSDP News Helper: preserveContent fehlgeschlagen', e);
      }
    }
  }

  function scan() {
    if (!active()) return;
    if (plainWanted()) plainEditors();
    preserveTabs();
  }

  let timer = 0;
  function scheduleScan() {
    if (timer) return;
    timer = setTimeout(() => {
      timer = 0;
      try {
        scan();
      } catch (e) {
        console.warn('OSDP News Helper (MAIN)', e);
      }
    }, 150);
  }

  new MutationObserver(scheduleScan).observe(html, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-osdp-helper-restyle', 'data-osdp-helper-plain', 'data-osdp-helper-group'] });
  scheduleScan();
  // CKEditor hängt die Instanz erst nach dem Anlegen des Elements an – kurz nachfassen
  let polls = 0;
  const poll = setInterval(() => {
    scheduleScan();
    if (++polls >= 40) clearInterval(poll);
  }, 500);
})();
