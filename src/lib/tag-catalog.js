// Tag-Katalog des OSDP-Dashboards (aus docs/OSDP_Tagging_Handbuch.md → src/config/osdp-tags.json).
// Enthält die Regeln aus dem Handbuch als Code: erlaubte/verbotene Zweige, Pflicht-Tags,
// Auflösung von Namen zu vollständigen Pfaden und Validierung einer Tag-Auswahl.

export const SEP = ' → ';

export const STRUCTURE_PATHS = {
  Cyber: 'Struktur → [S]1 Cyber',
  KriMiSi: 'Struktur → [S]2 KriMiSi',
  InnoTech: 'Struktur → [S]3 InnoTech'
};
export const PATH_NEWS = 'Newsinfo → Dokumententyp → News';
export const PATH_SOURCE_TYPE = 'Newsinfo → Quellentyp';
export const PATH_GEO = 'Newsinfo → geographische Lokationen';
export const PATH_NO_LOCATION = 'Newsinfo → geographische Lokationen → kein Standort';
export const PATH_WB = { 'WB-Cyber': 'Auftragstags → WB-Cyber', 'WB-KriMiSi': 'Auftragstags → WB-KriMiSi' };
export const PATH_KI = 'Auftragstags → HSC → HSC-KI → [KI_]Tools und Usecases';
export const TOPIC_ROOTS = ['Cyber', 'KriMiSi', 'InnoTech', 'Allgemeine Tags'];
export const SOURCE_TYPES = ['Nachrichtenseite', 'Behördenseite', 'Blog', 'Unternehmens- oder Vereinsseite', 'wissenschaftliche Fachzeitschrift', 'Konferenz'];

// Zweige, die laut Handbuch nie vergeben werden (inkl. aller Untertags).
const EXCLUDED_PREFIXES = [
  'Newsinfo → zeitlicher Aspekt',
  'Newsinfo → Informationsverschmutzung',
  'Newsinfo → Social Media Post',
  'Newsinfo → Audio',
  'Newsinfo → Video',
  'Newsinfo → Werbung'
];
// Reine Gliederungsknoten, die nie selbst angeklickt werden.
const CONTAINER_PATHS = new Set([
  'Struktur',
  'Newsinfo',
  'Newsinfo → Dokumententyp',
  'Newsinfo → Quellentyp',
  'Newsinfo → geographische Lokationen',
  'Newsinfo → geographische Lokationen → Kontinente und Staaten',
  'Newsinfo → geographische Lokationen → Nicht/Eingeschränkt anerkannt',
  'Newsinfo → geographische Lokationen → Übersee- & Extraterritoriale Gebiete',
  'Newsinfo → geographische Lokationen → Welt- und Randmeere',
  'Auftragstags',
  'Auftragstags → HSC',
  'Auftragstags → HSC → HSC-KI'
]);
const ALLOWED_AUFTRAG = new Set([PATH_WB['WB-Cyber'], PATH_WB['WB-KriMiSi'], PATH_KI]);

const norm = (s) => (s || '').toLowerCase().replace(/\s+/g, ' ').trim();

// ------------------------------------------------- Beschreibungen kompakt ----
// Teilbäume, deren Einträge reine Eigennamen sind (das Modell kennt sie; Beschreibung entfällt).
const PROPER_NOUN_PARENTS = [
  'Allgemeine Tags → Akteur → Internationale Organisation',
  'Cyber → Software → Betriebssystem'
];
// Namen mit ≥ 3 Wörtern, die trotzdem erklärt werden müssen (fremdsprachige Kunstbegriffe).
const EXPLAIN_ALWAYS = new Set([
  'InnoTech → Gesellschaftlicher Wandel → New Economic Patterns'
]);
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Beschreibung bereinigt: Whitespace zusammengefasst, Platzhalter ("null", "NUR EINEN!") → ''. */
export function cleanDescription(description) {
  const d = String(description || '').replace(/\s+/g, ' ').trim();
  if (!d || d === 'null' || /^NUR EINEN/i.test(d)) return '';
  return d;
}

/** Kürzt am Wortende auf max Zeichen (inkl. „…“). */
export function shortenAtWord(text, max) {
  const t = String(text || '');
  if (!max || t.length <= max) return t;
  const cut = t.slice(0, max - 1).replace(/\s\S*$/, '').replace(/[\s,;:–-]+$/, '');
  return (cut || t.slice(0, max - 1)) + '…';
}

/**
 * Beschreibung für den kompakten Katalogtext oder '' (Heuristik siehe TagCatalog.compactText()).
 * @param {string} name  Tagname
 * @param {string} description  Original-Beschreibung
 * @param {string} path  vollständiger Pfad
 * @param {number} depth  0 = Wurzel des ausgegebenen Teilbaums
 */
export function compactDescription(name, description, path, depth) {
  let d = cleanDescription(description);
  if (!d) return '';
  if (depth === 0) return '';
  if (path.startsWith(PATH_GEO + SEP)) return '';
  if (PROPER_NOUN_PARENTS.some((p) => path.startsWith(p + SEP))) return '';
  const words = name.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w));
  if (words.length >= 3 && !EXPLAIN_ALWAYS.has(path)) return '';

  // Beginnt die Beschreibung mit dem Namen und umschreibt nur ihn (Name + höchstens 3 Wörter)?
  const nameRe = escapeRe(name).replace(/ /g, '\\s+');
  const startsWithName = new RegExp(`^(?:(?:ein|eine|der|die|das|als|unter|der begriff)\\s+)?${nameRe}\\b`, 'iu');
  if (startsWithName.test(d)) {
    const rest = d.replace(startsWithName, '').replace(/^[\s.:–-]+/, '');
    const restWords = rest.split(/\s+/).filter(Boolean);
    if (restWords.length <= 3) return '';
    // Selbstbezug am Satzanfang entfernen: "Als X bezeichnet man die …" / "X ist eine …" / "Der Begriff X bezeichnet …"
    const selfRef = new RegExp(`^(?:(?:ein|eine|der|die|das|als|unter|der begriff)\\s+)?${nameRe}(?:\\s*\\([^)]*\\))?\\s+(?:ist|sind|bezeichnet|bezeichnen|versteht man|bezeichnet man)\\s+(?:man\\s+)?(?:als\\s+)?(?:(?:eine|einen|einer|ein|der|die|das|den|dem|des)\\b)?\\s*`, 'iu');
    const stripped = d.replace(selfRef, '');
    if (stripped !== d && stripped.length >= 15) d = stripped;
  }
  // Unbestimmten Artikel am Anfang weglassen ("Eine Software, die …" → "Software, die …"): spart Zeichen ohne Sinnverlust.
  d = d.replace(/^(?:ein|eine|einer)\s+(?=\p{L})/iu, '');
  return d ? d[0].toUpperCase() + d.slice(1) : '';
}

export class TagCatalog {
  constructor(json) {
    this.tree = json.tree;
    this.byPath = new Map();
    this.byName = new Map();
    const walk = (node, parents) => {
      const segments = [...parents, node.name];
      const path = segments.join(SEP);
      const entry = {
        name: node.name,
        path,
        segments,
        note: node.note || '',
        tooltip: node.tooltip || '',
        uid: node.uid ?? null,
        description: node.description || '',
        children: node.children.map((c) => c.name)
      };
      this.byPath.set(path, entry);
      const key = norm(node.name);
      if (!this.byName.has(key)) this.byName.set(key, []);
      this.byName.get(key).push(entry);
      node.children.forEach((c) => walk(c, segments));
    };
    this.tree.forEach((n) => walk(n, []));
  }

  static async load() {
    const res = await fetch(chrome.runtime.getURL('src/config/osdp-tags.json'));
    return new TagCatalog(await res.json());
  }

  get(path) {
    return this.byPath.get(path) || null;
  }

  /** UIDs des Dashboards zu Pfaden (null, wenn unbekannt). */
  uidsFor(paths) {
    return paths.map((p) => this.byPath.get(p)?.uid ?? null);
  }

  /** Darf dieser Tag laut Handbuch angeklickt werden? */
  isAllowed(path) {
    const e = this.byPath.get(path);
    if (!e) return false;
    if (CONTAINER_PATHS.has(path)) return false;
    if (e.note === 'AUSGESCHLOSSEN' || e.note === 'NICHT VERGEBEN') return false;
    if (EXCLUDED_PREFIXES.some((p) => path === p || path.startsWith(p + SEP))) return false;
    if (path.startsWith('Auftragstags')) return ALLOWED_AUFTRAG.has(path);
    return true;
  }

  /**
   * Löst einen Namen oder (Teil-)Pfad zu einem Katalog-Eintrag auf.
   * @param {string} input  z. B. "Ransomware", "Cyber > Cyberangriff > Schadsoftware > Ransomware"
   * @param {string} [within]  Pfad-Präfix, innerhalb dessen gesucht wird
   */
  resolve(input, within = '') {
    if (!input) return null;
    const cleaned = String(input).replace(/\s*(→|>|›|\/|\\)\s*/g, SEP).replace(/\s+/g, ' ').trim();
    const direct = this.byPath.get(cleaned);
    if (direct && (!within || direct.path.startsWith(within))) return direct;

    // Pfad-Suffix (z. B. "Cyberangriff → Ransomware" ohne Wurzel)
    const segs = cleaned.split(SEP).map(norm);
    const last = segs[segs.length - 1];
    let candidates = (this.byName.get(last) || []).filter((e) => !within || e.path.startsWith(within));
    if (candidates.length > 1 && segs.length > 1) {
      const narrowed = candidates.filter((e) => segs.every((s) => e.segments.map(norm).includes(s)));
      if (narrowed.length) candidates = narrowed;
    }
    if (candidates.length > 1) {
      const allowed = candidates.filter((e) => this.isAllowed(e.path));
      if (allowed.length === 1) return allowed[0];
      // Bei Mehrdeutigkeit den tiefsten Treffer nehmen (spezifischster Tag)
      candidates = allowed.length ? allowed : candidates;
      candidates.sort((a, b) => b.segments.length - a.segments.length);
    }
    return candidates[0] || null;
  }

  /** Knoten des Baums zu einem Pfad (null, wenn unbekannt). */
  nodeAt(rootPath) {
    const segments = String(rootPath || '').split(SEP);
    let node = this.tree.find((n) => n.name === segments[0]);
    for (const seg of segments.slice(1)) node = node?.children.find((c) => c.name === seg);
    return node || null;
  }

  /**
   * Eingerückter Text eines Teilbaums (nur erlaubte Tags), für den Prompt. `rootPath` z. B. "Cyber"
   * oder "Newsinfo → geographische Lokationen".
   * Optionen: withDescriptions (Beschreibung hinter " — "), maxDescription (Kürzung am Wortende),
   * compact (Heuristik aus compactText(): Beschreibung nur dort, wo sie den Namen wirklich erklärt).
   */
  treeText(rootPath, { includeRoot = true, withDescriptions = false, maxDescription = 170, compact = false } = {}) {
    const segments = rootPath.split(SEP);
    const node = this.nodeAt(rootPath);
    if (!node) return '';
    const lines = [];
    const walk = (n, parents, depth) => {
      const path = [...parents, n.name].join(SEP);
      const excluded = EXCLUDED_PREFIXES.some((p) => path === p || path.startsWith(p + SEP)) || n.note === 'AUSGESCHLOSSEN' || n.note === 'NICHT VERGEBEN';
      if (excluded) return;
      if (depth > 0 || includeRoot) {
        let desc = '';
        if (withDescriptions) {
          desc = compact ? compactDescription(n.name, n.description, path, depth) : cleanDescription(n.description);
          desc = shortenAtWord(desc, maxDescription);
        }
        lines.push(`${'  '.repeat(depth)}${n.name}${desc ? ' — ' + desc : ''}`);
      }
      n.children.forEach((c) => walk(c, [...parents, n.name], depth + 1));
    };
    walk(node, segments.slice(0, -1), 0);
    return lines.join('\n');
  }

  /**
   * Kompakter Baumtext für den Tagging-Prompt: alle Tagnamen vollständig, Beschreibungen auf
   * maxDescription Zeichen (Standard 90) am Wortende gekürzt und nur dort, wo sie den Namen
   * wirklich erklären. Heuristik, wann eine Beschreibung ENTFÄLLT (siehe compactDescription):
   *   1. Sie ist leer oder nur ein Platzhalter ("null", "NUR EINEN!").
   *   2. Sie beginnt mit dem Tagnamen und umschreibt nur ihn (z. B. "Afrikanische Union — Afrikanische Union",
   *      oder Name plus höchstens drei weitere Wörter).
   *   3. Der Tag ist ein reiner Eigenname: Staaten/Orte (ganzer Geo-Zweig) sowie die Teilbäume aus
   *      PROPER_NOUN_PARENTS (internationale Organisationen, Betriebssysteme).
   *   4. Der Name hat ≥ 3 Wörter und ist damit selbsterklärend (z. B. "Digitalisierung und digitale Kultur"),
   *      außer er steht in EXPLAIN_ALWAYS (fremdsprachige Kunstbegriffe wie "New Economic Patterns").
   *   5. Wurzelknoten (Tiefe 0) bekommen keine Beschreibung; Oberkategorien allein sind ohnehin nicht wählbar.
   * Zusätzlich wird ein Selbstbezug am Satzanfang entfernt ("Als Wirtschaftskrise bezeichnet man die Phase …"
   * → "Phase …"), damit die 90 Zeichen Inhalt tragen. Die Baumstruktur (Pfade) bleibt identisch zu treeText().
   */
  compactText(rootPath, { maxDescription = 90, includeRoot = true } = {}) {
    return this.treeText(rootPath, { includeRoot, withDescriptions: true, maxDescription, compact: true });
  }

  /**
   * Geografische Lokationen kompakt, eine Zeile je Gruppe: "Kontinent: Land, Land, …" für die sechs
   * Kontinente (der Kontinentname ist selbst ein wählbarer Ort), danach die Gruppen
   * "Nicht/Eingeschränkt anerkannt", "Übersee- & Extraterritoriale Gebiete", "Welt- und Randmeere"
   * (Gruppenname nicht wählbar, nur die Einträge) und zuletzt die Sonderknoten
   * (Global, kein Standort, Weltraum, Luftraum, Antarktis …). Nur erlaubte Einträge, keine Namen gehen verloren.
   */
  geoText() {
    const root = this.nodeAt(PATH_GEO);
    if (!root) return '';
    const allowedChildren = (n, parentPath) => n.children.filter((c) => this.isAllowed(`${parentPath}${SEP}${c.name}`));
    const lines = [];
    const singles = [];
    for (const child of root.children) {
      const path = `${PATH_GEO}${SEP}${child.name}`;
      if (child.name === 'Kontinente und Staaten') {
        for (const continent of child.children) {
          const cPath = `${path}${SEP}${continent.name}`;
          lines.push(`${continent.name}: ${allowedChildren(continent, cPath).map((c) => c.name).join(', ')}`);
        }
      } else if (child.children.length) {
        const items = allowedChildren(child, path).map((c) => c.name);
        lines.push(`${child.name}${this.isAllowed(path) ? '' : ' (nur die Einträge)'}: ${items.join(', ')}`);
      } else if (this.isAllowed(path)) singles.push(child.name);
    }
    if (singles.length) lines.push(`Sonstige: ${singles.join(', ')}`);
    return lines.join('\n');
  }

  /** Alle erlaubten Pfade (für Tests/Debug). */
  allowedPaths() {
    return [...this.byPath.keys()].filter((p) => this.isAllowed(p));
  }
}

/**
 * Baut aus der LLM-Antwort die endgültige, regelkonforme Liste anzuklickender Tag-Pfade.
 * @param {TagCatalog} catalog
 * @param {object} raw  { structure, sourceType, locations[], topics[], ki, wb, wbReason, summary, notes }
 * @param {object} [opts]  { forceWb: 'auto'|'yes'|'no', categoryHint: 'cyber'|'krimisi' }
 */
export function buildSelection(catalog, raw, opts = {}) {
  const warnings = [];
  const paths = [];
  const add = (p, label) => {
    if (!p) return false;
    if (!catalog.isAllowed(p)) {
      warnings.push(`${label || 'Tag'} „${p}“ ist nicht erlaubt – übersprungen`);
      return false;
    }
    if (!paths.includes(p)) paths.push(p);
    return true;
  };

  // 1) Genau ein Struktur-Tag
  let structure = ['Cyber', 'KriMiSi', 'InnoTech'].find((s) => norm(s) === norm(raw.structure));
  if (!structure) {
    structure = opts.categoryHint === 'krimisi' ? 'KriMiSi' : 'Cyber';
    warnings.push(`Struktur „${raw.structure}“ unbekannt – ${structure} aus der Relevanzprüfung verwendet`);
  }
  add(STRUCTURE_PATHS[structure], 'Struktur');

  // 2) Dokumententyp News
  add(PATH_NEWS, 'Dokumententyp');

  // 3) Quellentyp
  let sourceType = SOURCE_TYPES.find((s) => norm(s) === norm(raw.sourceType));
  if (!sourceType) {
    sourceType = 'Nachrichtenseite';
    if (raw.sourceType) warnings.push(`Quellentyp „${raw.sourceType}“ unbekannt – Nachrichtenseite verwendet`);
  }
  add(`${PATH_SOURCE_TYPE}${SEP}${sourceType}`, 'Quellentyp');

  // 4) Geografie (mindestens eine)
  const locations = [];
  for (const loc of raw.locations || []) {
    const e = catalog.resolve(loc, PATH_GEO);
    if (e && catalog.isAllowed(e.path)) {
      if (!locations.includes(e.path)) locations.push(e.path);
    } else warnings.push(`Ort „${loc}“ nicht im Katalog – übersprungen`);
  }
  if (!locations.length) {
    locations.push(PATH_NO_LOCATION);
    warnings.push('Keine gültige geografische Zuordnung – „kein Standort“ gesetzt, bitte prüfen');
  }
  locations.forEach((p) => add(p, 'Ort'));

  // 5) Themen-Tags (Cyber, KriMiSi, InnoTech, Allgemeine Tags)
  const topics = [];
  for (const t of raw.topics || []) {
    let e = null;
    for (const root of TOPIC_ROOTS) {
      e = catalog.resolve(t, root);
      if (e) break;
    }
    if (!e) e = catalog.resolve(t);
    if (!e) {
      warnings.push(`Thema „${t}“ nicht im Katalog – übersprungen`);
      continue;
    }
    if (!TOPIC_ROOTS.includes(e.segments[0])) {
      warnings.push(`„${t}“ ist kein Themen-Tag (${e.path}) – übersprungen`);
      continue;
    }
    if (e.segments.length === 1) {
      warnings.push(`Oberkategorie „${e.name}“ allein ist zu unspezifisch – übersprungen`);
      continue;
    }
    if (!topics.includes(e.path)) topics.push(e.path);
  }
  topics.forEach((p) => add(p, 'Thema'));

  // 6) Auftragstags: KI-Sonderregel + WB
  const ki = !!raw.ki;
  if (ki) add(PATH_KI, 'KI-Tag');

  let wb = '';
  const force = opts.forceWb || 'auto';
  if (force === 'yes') wb = structure === 'KriMiSi' ? 'WB-KriMiSi' : 'WB-Cyber';
  else if (force === 'no') wb = '';
  else if (raw.wb === 'WB-Cyber' || raw.wb === 'WB-KriMiSi') wb = raw.wb;
  if (wb && structure === 'InnoTech') {
    warnings.push('WB-Tag bei Struktur InnoTech nicht vergeben');
    wb = '';
  }
  if (wb) add(PATH_WB[wb], 'WB-Tag');

  return {
    paths,
    structure,
    sourceType,
    locations,
    topics,
    ki,
    wb,
    wbReason: raw.wbReason || '',
    summary: raw.summary || '',
    notes: raw.notes || '',
    warnings
  };
}

/** Kompakte Textdarstellung einer Auswahl (für Protokoll und Verlauf). */
export function selectionToText(sel) {
  const short = (p) => p.split(SEP).slice(-1)[0];
  return [
    `Struktur: ${sel.structure}`,
    `Quellentyp: ${sel.sourceType}`,
    `Orte: ${sel.locations.map(short).join(', ')}`,
    `Themen: ${sel.topics.map((p) => p.split(SEP).slice(1).join(' › ')).join('; ') || '–'}`,
    `KI: ${sel.ki ? 'ja' : 'nein'} · WB: ${sel.wb || 'nein'}${sel.wbReason ? ' (' + sel.wbReason + ')' : ''}`
  ].join('\n');
}
