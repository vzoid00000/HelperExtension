// Feldzuordnung für den OSDP News-Editor (https://osdp.zentdok.at/#/newsEditor).
//
// STATUS: Vorläufig. Die genaue Struktur des Editors ist noch nicht bekannt –
// bis der DOM-Dump (Side Panel → „OSDP-Formular analysieren“) vorliegt, versucht der
// Filler die Felder über Label-Text / Platzhalter zu finden.
//
// Pro Feld:
//   selector    – CSS-Selektor (hat Vorrang; mehrere mit Komma möglich)
//   label       – RegEx (String) für den sichtbaren Label-Text
//   placeholder – RegEx (String) für placeholder / aria-label / name / id / formControlName
//   exclude     – RegEx (String): Treffer, die ausgeschlossen werden (z. B. Untertitel)
// Für Buttons:
//   selector / text – RegEx (String) für den Button-Text
//
// Kein `export`, damit die Datei sowohl im Side Panel als auch als Content Script
// ohne Module-Loader funktioniert.

globalThis.OSDP_SELECTORS = {
  url: {
    selector: '',
    label: '^(url|link|quelle|quell-?url|adresse)\\b',
    placeholder: 'url|link|http'
  },
  title: {
    selector: '',
    label: '^(titel|title|überschrift|schlagzeile)\\b',
    placeholder: '^(titel|title)$|^titel\\b',
    exclude: 'sub|unter|zusatz'
  },
  // Wird NIE befüllt – nur dokumentiert, damit die Titelsuche ihn ausschließen kann.
  subtitle: {
    selector: '',
    label: '(sub|unter)titel'
  },
  author: {
    selector: '',
    label: '^(autor|autor:in|author|verfasser)\\b',
    placeholder: 'autor|author'
  },
  authorUnknownButton: {
    selector: '',
    text: 'autor\\s*ungenannt|ungenannt'
  },
  date: {
    selector: '',
    label: '^(datum|date|veröffentlicht|erscheinungsdatum|news-?datum)\\b',
    placeholder: 'datum|date|tt\\.mm|dd\\.mm'
  },
  sourceText: {
    selector: '',
    label: '(quell|original|source|englisch|english)',
    placeholder: 'quell|original|source|englisch|english'
  },
  translatedText: {
    selector: '',
    label: '(übersetz|deutsch|german|translat)',
    placeholder: 'übersetz|deutsch|german|translat'
  },
  category: {
    selector: '',
    label: '^(bereich|kategorie|thema|rubrik)\\b',
    placeholder: 'bereich|kategorie|rubrik'
  }
};

// Anzeige-Namen der Bereiche, wie sie vermutlich im OSDP-Dropdown stehen.
globalThis.OSDP_CATEGORY_LABELS = {
  cyber: 'Cyber',
  krimisi: 'KriMiSi'
};
