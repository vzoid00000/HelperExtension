// Node-Tests für Prompts und Token-Effizienz (ohne Browser): kompakter Katalogtext, Tagging-
// System-Prompt mit Regelwerk, Übersetzung in einer Anfrage mit Plausibilitätsprüfung,
// Relevanzprüfung mit Regelwerk. chrome.storage.local und fetch werden durch Shims ersetzt;
// der lokale LLM-Client (OpenAI-kompatibel) und die Claude API werden über den fetch-Shim bedient.
import fs from 'node:fs';

let failures = 0;
const check = (cond, msg) => { console.log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) failures++; };

// ---------------------------------------------------------------- Shims ----
const store = new Map();
globalThis.chrome = {
  storage: {
    local: {
      async get(keys) {
        const list = typeof keys === 'string' ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys || {});
        const out = {};
        for (const k of list) if (store.has(k)) out[k] = JSON.parse(JSON.stringify(store.get(k)));
        return out;
      },
      async set(obj) { for (const [k, v] of Object.entries(obj)) store.set(k, JSON.parse(JSON.stringify(v))); },
      async remove(keys) { for (const k of (Array.isArray(keys) ? keys : [keys])) store.delete(k); }
    }
  },
  runtime: { getURL: (p) => new URL('../' + p, import.meta.url).href }
};

// Aufgezeichnete Anfragen und die jeweils eingestellte Antwort des Modell-Mocks
const requests = [];   // lokaler Client: { messages, response_format, max_tokens }
const apiBodies = [];  // Claude API: { system, messages, output_config, … }
let mockReply = () => 'OK';
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  if (/unreachable/.test(u)) throw new TypeError('Failed to fetch');
  if (/osdp-tags\.json$/.test(u)) {
    return { ok: true, status: 200, json: async () => JSON.parse(fs.readFileSync(new URL('../src/config/osdp-tags.json', import.meta.url), 'utf8')) };
  }
  if (/\/chat\/completions$/.test(u)) {
    const body = JSON.parse(init.body || '{}');
    requests.push(body);
    const content = mockReply(body);
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: { role: 'assistant', content } }] }), text: async () => '' };
  }
  if (/api\.anthropic\.com\/v1\/messages$/.test(u)) {
    const body = JSON.parse(init.body || '{}');
    apiBodies.push(body);
    return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ content: [{ type: 'text', text: mockReply(body) }], stop_reason: 'end_turn' }) };
  }
  throw new Error('Netzwerk im Test gesperrt: ' + u);
};

const { TagCatalog, TOPIC_ROOTS, PATH_GEO, SEP, GEO_LIST_SEP, compactDescription, shortenAtWord } = await import('../src/lib/tag-catalog.js');
const tagger = await import('../src/lib/tagger.js');
const translate = await import('../src/lib/translate.js');
const classify = await import('../src/lib/classify.js');
const llm = await import('../src/lib/llm.js');

const cat = await TagCatalog.load();
check(cat.byPath.size === 673, `Katalog über chrome.runtime.getURL geladen: ${cat.byPath.size} Pfade`);

// Pfade aus einem eingerückten Baumtext rekonstruieren (2 Leerzeichen je Ebene, Name vor " — ")
function pathsFromTree(text) {
  const stack = [];
  const out = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const depth = (line.match(/^ */)[0].length) / 2;
    const name = line.trim().split(' — ')[0];
    stack.length = depth;
    stack[depth] = name;
    out.push(stack.join(SEP));
  }
  return out;
}

// ------------------------------------------------- Katalog: compactText ----
console.log('\n# Katalog: compactText / geoText / catalogPromptText');
{
  for (const root of TOPIC_ROOTS) {
    const plain = pathsFromTree(cat.treeText(root));
    const compact = pathsFromTree(cat.compactText(root));
    check(plain.length === compact.length && plain.every((p, i) => p === compact[i]), `compactText(${root}): ${compact.length} Pfade identisch zu treeText`);
    const tooLong = cat.compactText(root).split('\n').map((l) => (l.split(' — ')[1] || '').length).filter((n) => n > 90);
    check(tooLong.length === 0, `compactText(${root}): alle Beschreibungen ≤ 90 Zeichen`);
  }
  const geo = cat.geoText();
  const geoEntries = [...cat.byPath.values()].filter((e) => e.path.startsWith(PATH_GEO + SEP) && cat.isAllowed(e.path));
  const missingGeo = geoEntries.filter((e) => !geo.includes(e.name)).map((e) => e.name);
  check(geoEntries.length > 280 && missingGeo.length === 0, `geoText: ${geoEntries.length} erlaubte Orte enthalten (${geo.length} Zeichen, ${geo.split('\n').length} Zeilen)${missingGeo.length ? ' – fehlt: ' + missingGeo.join(', ') : ''}`);
  check(/^Europa: .*Österreich.*Ukraine/m.test(geo) && /^Sonstige: .*Global.*kein Standort/m.test(geo) && /Nicht\/Eingeschränkt anerkannt \(nur die Einträge\): .*Taiwan/.test(geo), 'geoText: Kontinentzeilen, Sonderknoten und Gruppen');
  // Befund 38: Listentrenner "; " – Ortsnamen mit Komma bleiben ein Eintrag
  check(GEO_LIST_SEP === '; ' && /^Afrika: .*Komoren; Kongo, Demokratische Republik; Kongo, Republik der; Lesotho/m.test(geo), 'geoText: Kongo-Namen durch "; " getrennt, Komma bleibt im Namen');
  check(/^Europa: Albanien; Andorra; Belarus \(Weißrussland\); Belgien/m.test(geo) && !/^Europa: .*Albanien, Andorra/m.test(geo), 'geoText: kein Komma mehr als Listentrenner');
  check(/St\. Helena, Ascension und Tristan da Cunha \(GBR\); /.test(geo), 'geoText: Übersee-Eintrag mit Komma bleibt zusammen');

  const legacy = tagger.catalogText(cat);
  const prompt = tagger.catalogPromptText(cat);
  console.log(`  Katalogtext alt ${legacy.length.toLocaleString('de-AT')} Zeichen → kompakt ${prompt.length.toLocaleString('de-AT')} Zeichen (${Math.round((1 - prompt.length / legacy.length) * 100)} % weniger)`);
  check(legacy.length > 40000, `Vergleich: alter Katalogtext ${legacy.length} Zeichen (Baseline 46.077)`);
  check(prompt.length <= 30000, `catalogPromptText ≤ 30.000 Zeichen (${prompt.length})`);
  // Themen-Bäume: jeder Knoten (auch Oberkategorien); Geo-Baum: jeder vergebbare Ort (die reinen
  // Gliederungsknoten „geographische Lokationen“ und „Kontinente und Staaten“ sind keine Tags und entfallen bewusst).
  const names = [...cat.byPath.values()].filter((e) => TOPIC_ROOTS.includes(e.segments[0]) || (e.path.startsWith(PATH_GEO + SEP) && cat.isAllowed(e.path)));
  const missing = names.filter((e) => !prompt.includes(e.name)).map((e) => e.path);
  check(names.length === 294 + 288 && missing.length === 0, `catalogPromptText enthält alle ${names.length} Tagnamen der Themen- und Geo-Bäume${missing.length ? ' – fehlt: ' + missing.slice(0, 5).join('; ') : ''}`);
  check(prompt.includes('=== THEMEN-TAGS') && prompt.includes('=== ORTE') && prompt.includes('WB-Cyber — ') && prompt.includes('WB-KriMiSi — '), 'catalogPromptText: Abschnitte Themen, Orte, WB');
  check(prompt.includes('=== ORTE (Einträge durch ";" getrennt') && prompt.includes('Kurzform'), 'ORTE-Kopf nennt den Trenner ";" und die Kurzform bei Klammerzusatz');

  // Befund 46: RULES ohne Wiederholung des Ausgabeformats (Schema) – kürzer als v0.6 (3.028 Zeichen), Pflichtinhalt bleibt
  const rules = tagger.TAGGING_RULES;
  const must = ['Tagging-Handbuch', 'PFLICHT', 'Genau EINE Struktur', '"Cyber"', '"KriMiSi"', '"InnoTech"', 'Quellentyp', 'Nachrichtenseite', 'Mindestens ein Ort', '"Global"', '"kein Standort"', 'Themen-Tags', 'HIERARCHIE', 'AUFTRAGSTAGS', 'ki = true', 'WB-Cyber', 'WB-KriMiSi', 'wb = "none"', 'NIE', 'zeitlicher Aspekt', 'AUSGABE', 'JSON', 'Schema', ' > ', 'summary', 'wbReason', 'notes', 'kein Text außerhalb'];
  const missingRules = must.filter((k) => !rules.includes(k));
  check(rules.length < 3028 && rules.length < 2800 && missingRules.length === 0, `RULES ${rules.length} Zeichen (v0.6: 3.028), Pflichtinhalt vollständig${missingRules.length ? ' – fehlt: ' + missingRules.join(', ') : ''}`);
  check(!rules.includes('- structure:') && !rules.includes('"none" | "WB-Cyber" | "WB-KriMiSi"') && !rules.includes('ki: true | false') && !rules.includes('- sourceType:'), 'RULES: Aufzählung der Felder/Enum-Werte entfernt (trägt das Schema)');
  check(prompt.includes('Ransomware — Schadprogramme') && prompt.includes('      NATO\n') && !/NATO — /.test(prompt), 'Beschreibungen: Ransomware erklärt, NATO (Eigenname) ohne Beschreibung');

  // Heuristik der Beschreibungen
  check(compactDescription('Afrikanische Union', 'Afrikanische Union', 'Allgemeine Tags → Akteur → Afrikanische Union', 2) === '', 'Beschreibung = Name → entfällt');
  check(compactDescription('Android', 'Betriebssystem von Google für mobile Geräte', 'Cyber → Software → Betriebssystem → Android', 3) === '', 'Eigenname (Betriebssystem) → entfällt');
  check(compactDescription('Digitalisierung und digitale Kultur', 'Prozess der Einführung digitaler Technik', 'InnoTech → Gesellschaftlicher Wandel → Digitalisierung und digitale Kultur', 2) === '', 'Name mit ≥ 3 Wörtern → entfällt');
  check(compactDescription('New Economic Patterns', 'Neue wirtschaftliche Muster', 'InnoTech → Gesellschaftlicher Wandel → New Economic Patterns', 2) === 'Neue wirtschaftliche Muster', 'Ausnahme: fremdsprachiger Kunstbegriff behält Beschreibung');
  check(compactDescription('Wirtschaftskrise', 'Als Wirtschaftskrise bezeichnet man die Phase einer deutlich negativen Entwicklung.', 'KriMiSi → Krisen & Konflikte → Wirtschaftskrise', 2) === 'Phase einer deutlich negativen Entwicklung.', 'Selbstbezug am Satzanfang entfernt');
  check(compactDescription('Datenleck', 'Ein Vorfall, bei dem Unberechtigte Zugriff erhalten.', 'Cyber → Cyber Security → Datenleck', 2) === 'Vorfall, bei dem Unberechtigte Zugriff erhalten.', 'Unbestimmter Artikel am Anfang entfernt');
  check(compactDescription('Cyber', 'Auf Datenebene vernetzte IT-Systeme', 'Cyber', 0) === '' && compactDescription('Innovationen', 'null', 'InnoTech → Innovationen', 1) === '', 'Wurzel und Platzhalter "null" ohne Beschreibung');
  check(shortenAtWord('Eins zwei drei vier fünf', 12) === 'Eins zwei…' && shortenAtWord('kurz', 12) === 'kurz', 'shortenAtWord kürzt am Wortende');
}

// ------------------------------------------------------------- Tagger ----
console.log('\n# Tagger: System-Prompt mit Regelblock, Artikeltext begrenzt');
{
  const tagJson = { structure: 'Cyber', sourceType: 'Nachrichtenseite', locations: ['USA'], topics: ['Cyber > Cyberangriff > Schadsoftware > Ransomware'], ki: false, wb: 'none', wbReason: 'Routinefall.', summary: 'Ransomware trifft einen Hafen.', notes: '' };
  mockReply = () => JSON.stringify(tagJson);
  const rulesText = 'KORREKTURREGELN DES BEARBEITERS:\n1. Bei Hafen-Angriffen zusätzlich „Allgemeine Tags > Infrastruktur > Transport“ vergeben.';
  const longText = ('Lorem ipsum dolor sit amet, consectetur adipiscing elit. ').repeat(400); // ≈ 22.800 Zeichen
  const article = { title: 'Ransomware hits port', text: longText, url: 'https://example.org/a', siteName: 'Example', sourceName: 'Example News', category: 'cyber', score: 8 };

  // lokaler Anbieter (Brücke): ein System-String
  requests.length = 0;
  const local = { llmProvider: 'local', localLlmUrl: 'http://mock.local/v1', localLlmModel: 'test' };
  const sel = await tagger.suggestTags(article, cat, local, { forceWb: 'auto', rulesText });
  check(requests.length === 1, 'lokal: genau eine Anfrage');
  const sys = requests[0]?.messages?.[0]?.content || '';
  const usr = requests[0]?.messages?.[1]?.content || '';
  const iCatalog = sys.indexOf('=== THEMEN-TAGS');
  const iGeo = sys.indexOf('=== ORTE');
  const iRules = sys.indexOf('KORREKTURREGELN DES BEARBEITERS');
  check(typeof sys === 'string' && sys.includes('PFLICHT') && iCatalog > 0 && iGeo > iCatalog && iRules > iGeo, `lokal: System-String = Regeln → Katalog → Regelwerk (Positionen ${iCatalog}/${iGeo}/${iRules})`);
  check(iRules < sys.indexOf('Antworte ausschließlich mit einem JSON-Objekt'), 'lokal: Regelwerk vor der JSON-Anweisung des lokalen Clients');
  const articlePart = usr.slice(usr.indexOf('ARTIKELTEXT:\n') + 'ARTIKELTEXT:\n'.length);
  check(articlePart.length <= 10000 && articlePart.endsWith('[…]') && articlePart.length > 9900, `Artikeltext auf 10.000 Zeichen begrenzt (${articlePart.length})`);
  check(usr.includes('Relevanzprüfung: Cyber, Wichtigkeit 8/10') && usr.includes('Titel: Ransomware hits port'), 'Nutzer-Nachricht mit Hinweis aus der Relevanzprüfung');
  check(sel.structure === 'Cyber' && sel.paths.includes('Cyber → Cyberangriff → Schadsoftware → Ransomware') && sel.locations[0].endsWith('USA'), 'Ergebnis über buildSelection: ' + sel.paths.length + ' Pfade');
  check(requests[0].max_tokens === 8000, 'lokal: max_tokens 8000 für das Tagging');
  check(tagger.limitArticleText('kurz').length === 4 && tagger.limitArticleText('a'.repeat(20000)).length <= 10000, 'limitArticleText');

  // Claude API: drei Blöcke, Katalog gecacht, Regelwerk ohne cache_control
  apiBodies.length = 0;
  const api = { llmProvider: 'claude', anthropicApiKey: 'sk-test', anthropicModel: 'claude-opus-5-5' };
  await tagger.suggestTags(article, cat, api, { rulesText });
  const blocks = apiBodies[0]?.system;
  check(Array.isArray(blocks) && blocks.length === 3 && blocks[0].text.includes('PFLICHT') && !blocks[0].cache_control, 'API: Block 1 = Regeln ohne cache_control');
  check(blocks?.[1]?.cache_control?.type === 'ephemeral' && blocks[1].text.includes('=== THEMEN-TAGS') && blocks[1].text.length <= 30000, 'API: Block 2 = Katalog mit cache_control');
  check(blocks?.[2]?.text === rulesText && !blocks[2].cache_control, 'API: Block 3 = Regelwerk NACH dem Katalog ohne cache_control');
  // Befund 34: Thinking zählt auf Opus in max_tokens mit – 8.000 statt 2.000, effort bleibt 'high'
  check(tagger.TAGGING_MAX_TOKENS === 8000 && apiBodies[0].max_tokens === 8000 && apiBodies[0].output_config?.format?.type === 'json_schema', 'API: Structured Output, max_tokens 8000');
  check(apiBodies[0].output_config?.effort === 'high', 'API: effort high beim Tagging');
  apiBodies.length = 0;
  await tagger.suggestTags(article, cat, api, {});
  check(apiBodies[0]?.system?.length === 2, 'API ohne Regelwerk: nur zwei Blöcke');
  const sameCatalog = apiBodies[0].system[1].text === blocks[1].text;
  check(sameCatalog, 'Katalogblock ist byteidentisch (stabil für Prompt-Caching)');
}

// --------------------------------------------------------- Übersetzung ----
console.log('\n# Übersetzung: eine Anfrage, Zerlegung, Warnungen');
{
  const local = { translator: 'local', llmProvider: 'local', localLlmUrl: 'http://mock.local/v1', localLlmModel: 'test' };
  const p = (n) => `This is paragraph number ${n} of the English source article, long enough to be measured properly by the plausibility check. `.repeat(2).trim();
  const srcText = [p(1), p(2), p(3)].join('\n\n');
  const title = 'Hackers breach port authority';
  const deP = (n) => `Dies ist Absatz Nummer ${n} des englischen Quellartikels, lang genug, um von der Plausibilitätsprüfung richtig gemessen zu werden. `.repeat(2).trim();

  // 1) Normalfall mit Einleitungs-Floskel: Titel/Text zerlegt, Floskel entfernt, eine Anfrage, Regelwerk im System-Prompt
  requests.length = 0;
  const progress = [];
  mockReply = () => `Hier ist die Übersetzung:\n\nHacker dringen in Hafenbehörde ein\n\n${deP(1)}\n\n${deP(2)}\n\n${deP(3)}`;
  const r1 = await translate.translateArticle({ title, text: srcText }, local, (m) => progress.push(m), { rulesText: 'GLOSSAR: port authority = Hafenbehörde' });
  check(requests.length === 1, 'Titel + Text in EINER Anfrage');
  check(r1.title === 'Hacker dringen in Hafenbehörde ein' && r1.text.startsWith(deP(1)) && r1.text.split(/\n\s*\n/).length === 3, 'Schlagzeile und Text korrekt zerlegt');
  check(r1.warnings.some((w) => /Floskel/.test(w)) && r1.warnings.length === 1, 'Einleitungs-Floskel entfernt und gemeldet: ' + JSON.stringify(r1.warnings));
  check(requests[0].messages[0].content.includes('GLOSSAR: port authority') && requests[0].messages[0].content.includes('Nichts ergänzen, nichts weglassen'), 'Regelwerk und Anweisungen im System-Prompt');
  check(/^SCHLAGZEILE:\n.+\n\nTEXT:\n/.test(requests[0].messages[1].content), 'Nutzer-Nachricht mit SCHLAGZEILE/TEXT');
  check(r1.provider === 'local', 'provider wird mitgeliefert');
  check(progress.some((m) => /lokalem Server/.test(m)) && !progress.some((m) => /lokalem Modell/i.test(m)), 'Befund 64: Fortschritt nennt „lokalem Server“, nicht „lokales Modell“: ' + JSON.stringify(progress));

  // 2) Zu kurze Übersetzung → Warnung Längenverhältnis + Absatzanzahl (Vorlage 6 Absätze, Übersetzung 1 → Differenz 5 > Toleranz 2)
  const srcText6 = [p(1), p(2), p(3), p(4), p(5), p(6)].join('\n\n');
  mockReply = () => 'Hacker dringen in Hafenbehörde ein\n\nKurzfassung.';
  const r2 = await translate.translateArticle({ title, text: srcText6 }, local);
  check(r2.warnings.some((w) => /Längenverhältnis/.test(w)) && r2.warnings.some((w) => /Absatzanzahl.*Vorlage 6, Übersetzung 1/.test(w)), 'Zu kurze Übersetzung: ' + JSON.stringify(r2.warnings));

  // 3) Nur Schlagzeile: umschließende Anführungszeichen und Schlusspunkt entfernt
  mockReply = () => '„Hacker dringen in Hafenbehörde ein.“';
  const r3 = await translate.translateArticle({ title, text: '' }, local);
  check(r3.title === 'Hacker dringen in Hafenbehörde ein' && r3.text === '' && r3.warnings.length === 0, 'Nur Schlagzeile, Anführungszeichen entfernt');

  // 4) Labels und fehlende Leerzeile (reine Zerlegung)
  const s4 = translate.splitTranslation('Schlagzeile: Titel hier\nTEXT:\nErster Absatz.\n\nZweiter Absatz.', { hasTitle: true, hasText: true });
  check(s4.title === 'Titel hier' && s4.text === 'Erster Absatz.\n\nZweiter Absatz.' && s4.warnings.length === 1, 'Labels entfernt, fehlende Leerzeile gemeldet: ' + JSON.stringify(s4));
  const s5 = translate.splitTranslation('```\nTitel\n\nText.\n```', { hasTitle: true, hasText: true });
  check(s5.title === 'Titel' && s5.text === 'Text.', 'Codeblock entfernt; Schlagzeile „Titel“ ist kein Label');
  const s6 = translate.splitTranslation('SCHLAGZEILE:\nTitel\n\nTEXT:\nErster Absatz.\n\nZweiter Absatz.', { hasTitle: true, hasText: true });
  check(s6.title === 'Titel' && s6.text === 'Erster Absatz.\n\nZweiter Absatz.' && s6.warnings.length === 0, 'Labels auf eigenen Zeilen entfernt');

  // Befund 44: Markdown-/Label-Reste in der Schlagzeile
  const s7 = translate.splitTranslation('**Schlagzeile:** Hacker greifen Hafen an\n\n**Text:**\nErster Absatz.', { hasTitle: true, hasText: true });
  check(s7.title === 'Hacker greifen Hafen an' && s7.text === 'Erster Absatz.' && s7.warnings.length === 0, 'Markdown-Label „**Schlagzeile:**“ und „**Text:**“ entfernt: ' + JSON.stringify(s7));
  const s8 = translate.splitTranslation('# Hacker greifen Hafen an\n\nErster Absatz.', { hasTitle: true, hasText: true });
  check(s8.title === 'Hacker greifen Hafen an' && s8.text === 'Erster Absatz.', 'Markdown-Überschrift „# “ entfernt');
  const s9 = translate.splitTranslation('**Überschrift**\nHacker greifen Hafen an\n\nErster Absatz.', { hasTitle: true, hasText: true });
  check(s9.title === 'Hacker greifen Hafen an' && s9.text === 'Erster Absatz.', 'Fettes Label auf eigener Zeile entfernt: ' + JSON.stringify(s9));
  check(translate.cleanTitle('Headline: **Hacker greifen Hafen an**') === 'Hacker greifen Hafen an' && translate.cleanTitle('## Titel: Hafen') === 'Hafen', 'cleanTitle: Label + Fettdruck, Überschrift + Label');

  // Befund 40: Anführungszeichen nur entfernen, wenn sie den ganzen Titel umschließen; Abkürzungspunkt bleibt
  check(translate.cleanTitle('„Wir werden antworten“: NATO-Chef warnt Russland') === '„Wir werden antworten“: NATO-Chef warnt Russland', 'cleanTitle: Zitat am Titelanfang bleibt unverändert');
  check(translate.cleanTitle('„Hacker dringen ein“') === 'Hacker dringen ein' && translate.cleanTitle('"Hacker dringen ein"') === 'Hacker dringen ein' && translate.cleanTitle('»Hacker dringen ein«') === 'Hacker dringen ein', 'cleanTitle: umschließende Anführungszeichen (deutsch, gerade, Guillemets) entfernt');
  check(translate.cleanTitle('„A“ und „B“') === '„A“ und „B“' && translate.cleanTitle('\'Russia\'s war\'') === '\'Russia\'s war\'', 'cleanTitle: zwei Zitate bzw. Apostroph innen → unverändert');
  check(translate.cleanTitle('Übernahme der Werft AG und Co.') === 'Übernahme der Werft AG und Co.' && translate.cleanTitle('Hacker greifen Hafen an.') === 'Hacker greifen Hafen an' && translate.cleanTitle('Und dann …') === 'Und dann …', 'cleanTitle: Satzpunkt entfernt, Abkürzungspunkt und Auslassung bleiben');

  // Befund 43: fehlende Schlagzeile – erster Absatz wird NICHT zum Titel, Text bleibt vollständig
  const lede = 'Die Hafenbehörde von Rotterdam wurde am Montag Ziel eines Angriffs, wie die Behörde mitteilte.';
  const s10 = translate.splitTranslation(`${lede}\n\n${deP(2)}\n\n${deP(3)}`, { hasTitle: true, hasText: true });
  check(s10.title === '' && s10.text.startsWith(lede) && s10.text.split(/\n\s*\n/).length === 3 && s10.warnings.includes('Schlagzeile fehlt in der Antwort'), 'Erste Zeile mit Satzpunkt + weitere Absätze → kein Titel, Text vollständig: ' + JSON.stringify(s10.warnings));
  const longLine = 'Sehr lange Zeile ohne Punkt '.repeat(9).trim(); // > 220 Zeichen
  const s11 = translate.splitTranslation(`${longLine}\n\n${deP(2)}`, { hasTitle: true, hasText: true });
  check(longLine.length > 220 && s11.title === '' && s11.text.startsWith(longLine) && s11.warnings.includes('Schlagzeile fehlt in der Antwort'), 'Erste Zeile > 220 Zeichen → kein Titel');
  const s12 = translate.splitTranslation(`Hacker greifen Hafen an\n${deP(1)}`, { hasTitle: true, hasText: true });
  check(s12.title === 'Hacker greifen Hafen an' && s12.text === deP(1) && s12.warnings.length === 1, 'Kurze Zeile ohne Punkt bleibt Titel (fehlende Leerzeile gemeldet)');
  const s13 = translate.splitTranslation('Hacker greifen Hafen an.', { hasTitle: true, hasText: true });
  check(s13.title === 'Hacker greifen Hafen an' && s13.text === '' && s13.warnings.some((w) => /keinen Text/.test(w)), 'Einzeilige Antwort ohne Folgeabsätze bleibt Titel (Punkt entfernt)');
  const s14 = translate.splitTranslation(`Hacker dringen bei europäischem Rüstungsunternehmen ein.\n\n${deP(1)}\n\n${deP(2)}`, { hasTitle: true, hasText: true });
  check(s14.title === 'Hacker dringen bei europäischem Rüstungsunternehmen ein' && s14.text === `${deP(1)}\n\n${deP(2)}` && s14.warnings.length === 0, 'Kurze Schlagzeile mit angehängtem Punkt bleibt Titel: ' + JSON.stringify(s14));
  const twoSentences = 'Der Angriff begann am Montag. Die Behörde bestätigte den Vorfall.';
  const s15 = translate.splitTranslation(`${twoSentences}\n\n${deP(2)}`, { hasTitle: true, hasText: true });
  check(s15.title === '' && s15.text.startsWith(twoSentences), 'Zwei Sätze in der ersten Zeile → Fließtext, kein Titel');
  const r4w = translate.checkTranslation({ title, text: srcText }, { title: '', text: `${lede}\n\n${deP(2)}\n\n${deP(3)}` });
  check(r4w.includes('Schlagzeile fehlt in der Übersetzung'), 'checkTranslation meldet die fehlende Schlagzeile zusätzlich');

  // 5) Plausibilität ohne Auffälligkeit
  const ok = translate.checkTranslation({ title, text: srcText }, { title: 'Hacker dringen in Hafenbehörde ein', text: [deP(1), deP(2), deP(3)].join('\n\n') });
  check(ok.length === 0, 'checkTranslation: unauffällig → keine Warnungen');
  const bad = translate.checkTranslation({ title, text: srcText }, { title: '', text: `${deP(1)}\n\n${deP(2)}\n\n${deP(3)}\n\nAnmerkung: Begriff frei übersetzt.` });
  check(bad.some((w) => /Schlagzeile fehlt/.test(w)) && bad.some((w) => /Anmerkung/.test(w)), 'checkTranslation: fehlende Schlagzeile und Anmerkung erkannt');

  // Befund 45: Absatz-Toleranz max(2, 25 %) – Listen (jedes <li> ein Absatz) werden vom Modell oft zusammengefasst
  const paras = (n, mk) => Array.from({ length: n }, (_, i) => mk(i + 1)).join('\n\n');
  const li = (i) => `- Listenpunkt ${i} mit etwas Text, damit die Längenprüfung nicht anschlägt und nur die Absätze zählen.`;
  const deLi = (i) => `- Listenpunkt ${i} mit etwas Text, damit die Längenprüfung nicht anschlägt und nur die Absätze zählen.`;
  const absatz = (w) => w.some((x) => /Absatzanzahl/.test(x));
  check(translate.paragraphTolerance(3) === 2 && translate.paragraphTolerance(8) === 2 && translate.paragraphTolerance(12) === 3 && translate.paragraphTolerance(20) === 5, 'paragraphTolerance: max(2, 25 %)');
  const w5 = translate.checkTranslation({ title, text: paras(5, li) }, { title: 'T', text: Array.from({ length: 5 }, (_, i) => deLi(i + 1)).join('\n') + '\n\n' + deLi(6) + '\n\n' + deLi(7) });
  check(!absatz(w5), 'Vorlage 5 Absätze, Übersetzung 3 (Liste zusammengefasst) → keine Absatz-Warnung');
  const w12 = translate.checkTranslation({ title, text: paras(12, li) }, { title: 'T', text: paras(9, deLi) + '\n\n' + Array.from({ length: 3 }, (_, i) => deLi(i + 10)).join('\n') });
  check(!absatz(w12), 'Vorlage 12, Übersetzung 10 (Differenz 2 ≤ 3) → keine Warnung');
  const w12b = translate.checkTranslation({ title, text: paras(12, li) }, { title: 'T', text: paras(8, deLi) + '\n\n' + Array.from({ length: 4 }, (_, i) => deLi(i + 9)).join('\n') });
  check(!absatz(w12b), 'Vorlage 12, Übersetzung 9 (Differenz 3 = Toleranz 3) → keine Warnung');
  const w12c = translate.checkTranslation({ title, text: paras(12, li) }, { title: 'T', text: paras(7, deLi) + '\n\n' + Array.from({ length: 5 }, (_, i) => deLi(i + 8)).join('\n') });
  check(absatz(w12c), 'Vorlage 12, Übersetzung 8 (Differenz 4 > Toleranz 3) → Warnung: ' + JSON.stringify(w12c));
}

// ----------------------------------------------------- Relevanzprüfung ----
console.log('\n# Relevanzprüfung: Batch 50, kompakte Zeilen, Regelwerk');
{
  requests.length = 0;
  mockReply = (body) => {
    const ids = [...(body.messages[1].content.matchAll(/^#(\d+)\|/gm))].map((m) => Number(m[1]));
    return JSON.stringify({ results: ids.map((id) => ({ id, category: id % 2 ? 'krimisi' : 'cyber', score: 7, reason: 'Test' })) });
  };
  const items = Array.from({ length: 120 }, (_, i) => ({ id: i, title: `Headline ${i}`, summary: 'x'.repeat(400), sourceName: 'Src', sourceCategory: i % 3 ? 'cyber' : 'both' }));
  const local = { llmProvider: 'local', localLlmUrl: 'http://mock.local/v1', localLlmModel: 'test' };
  const res = await classify.classifyItems(items, local, () => {}, { rulesText: 'KORREKTURREGELN: Meldungen über Übungen des Bundesheers immer krimisi ≥ 7.' });
  check(requests.length === 3 && requests.map((r) => (r.messages[1].content.match(/^#\d+\|/gm) || []).length).join(',') === '50,50,20', 'Batches 50/50/20');
  check(requests.every((r) => r.messages[0].content.includes('KORREKTURREGELN: Meldungen über Übungen')), 'Regelwerk im System-Prompt jeder Anfrage');
  const line = requests[0].messages[1].content.split('\n')[1];
  check(/^#0\|Src: Headline 0 — x{159}…$/.test(line), 'Kompakte Eingabezeile, Teaser auf 160 Zeichen: ' + line.slice(0, 40) + '…');
  check(/^#1\|Src\|cyber: /.test(requests[0].messages[1].content.split('\n')[2]), 'Quellen-Schwerpunkt als Kurzform');
  check(res.size === 120 && res.get(1).category === 'krimisi' && res.get(2).category === 'cyber' && res.get(2).score === 7, 'Ergebnisse für alle 120 ids');
  check(requests[0].messages[0].content.includes('max. 12 Wörter') && requests[0].max_tokens === 8000, 'Begründung ≤ 12 Wörter, max_tokens 8000');

  // Befund 41 (lokaler Pfad): Kategorie normalisieren, fremde ids ignorieren, score klemmen
  requests.length = 0;
  mockReply = (body) => {
    const ids = [...(body.messages[1].content.matchAll(/^#(\d+)\|/gm))].map((m) => Number(m[1]));
    const results = ids.map((id) => ({ id, category: id === 0 ? 'Cyber' : id === 2 ? 'cybersecurity' : id === 4 ? ' KRIMISI ' : 'krimisi', score: id === 4 ? 99 : id === 6 ? -3 : 7, reason: 'Test' }));
    if (ids.includes(50)) results.push({ id: 7, category: 'none', score: 0, reason: 'fremde id aus Batch 2' }); // gehört zu Batch 1
    if (ids.includes(50)) results.push({ id: 999, category: 'cyber', score: 9, reason: 'unbekannte id' });
    return JSON.stringify({ results });
  };
  const res2 = await classify.classifyItems(items.slice(0, 60), local);
  check(res2.get(0).category === 'cyber' && res2.get(0).score === 7, 'Kategorie „Cyber“ → „cyber“');
  check(res2.get(2).category === 'none' && /ungültige Kategorie „cybersecurity“/.test(res2.get(2).reason), 'Unbekannte Kategorie → none mit Hinweis: ' + res2.get(2).reason);
  check(res2.get(4).category === 'krimisi' && res2.get(4).score === 10 && res2.get(6).score === 0, 'Leerzeichen/Großschreibung normalisiert, score auf 0–10 geklemmt');
  check(res2.get(7).category === 'krimisi' && res2.get(7).reason === 'Test' && !res2.has(999) && res2.size === 60, 'Fremde id aus Batch 2 überschreibt Batch 1 nicht, unbekannte id wird ignoriert');
  check(classify.normalizeResult({ category: 'NONE', score: '3.6', reason: 7 }).category === 'none' && classify.normalizeResult({ category: 'NONE', score: '3.6' }).score === 4, 'normalizeResult: Typen gezähmt');
}

// ------------------------------------------------- Lokaler Server: Fehlertexte ----
console.log('\n# Lokaler Server (Befunde 64/70): Fehlermeldungen nennen Brücke, URL und Abhilfe');
{
  let msg = '';
  try { await llm.llmText({ llmProvider: 'local', localLlmUrl: '' }, 'S', 'U'); } catch (e) { msg = e.message; }
  check(/Keine Server-URL/.test(msg) && /Lokaler Server/.test(msg) && /localhost:4310\/v1/.test(msg) && /start-claude-bridge\.cmd/.test(msg) && !/lokale[sn]? Modell/i.test(msg), 'Ohne URL: ' + msg);
  msg = '';
  try { await llm.llmText({ llmProvider: 'local', localLlmUrl: 'http://localhost:4310/unreachable/v1' }, 'S', 'U'); } catch (e) { msg = e.message; }
  check(/^Claude-Code-Brücke nicht erreichbar \(http:\/\/localhost:4310\/unreachable\/v1\)/.test(msg) && /Brücke starten \(tools\\start-claude-bridge\.cmd/.test(msg) && /URL in den Einstellungen prüfen/.test(msg) && /Failed to fetch/.test(msg), 'Brücken-URL nicht erreichbar: ' + msg);
  msg = '';
  try { await llm.llmJson({ llmProvider: 'local', localLlmUrl: 'http://192.168.1.5:11434/unreachable' }, 'S', 'U', { type: 'object' }); } catch (e) { msg = e.message; }
  check(/^Lokaler Server nicht erreichbar \(http:\/\/192\.168\.1\.5:11434\/unreachable\/v1\)/.test(msg) && /CORS/.test(msg) && /Claude-Code-Brücke/.test(msg) && /start-claude-bridge\.cmd/.test(msg), 'Eigener Server nicht erreichbar: ' + msg);
  msg = '';
  try { await llm.testLocalLlm({ localLlmUrl: 'http://localhost:4310/unreachable' }); } catch (e) { msg = e.message; }
  check(/^Claude-Code-Brücke nicht erreichbar/.test(msg) && /start-claude-bridge\.cmd/.test(msg), 'Verbindungstest: ' + msg);
  check(llm.isBridgeUrl('http://localhost:4310/v1') && llm.isBridgeUrl('http://127.0.0.1:4310') && !llm.isBridgeUrl('http://localhost:43100/v1') && !llm.isBridgeUrl('http://pc:11434/v1'), 'isBridgeUrl erkennt nur localhost:4310');
  check(llm.localServerName({ localLlmUrl: 'http://localhost:4310/v1' }) === 'Claude-Code-Brücke' && llm.localServerName({ localLlmUrl: 'http://pc:11434/v1' }) === 'Lokaler Server' && llm.LOCAL_SERVER_LABEL === 'Lokaler Server', 'localServerName: Brücke bzw. „Lokaler Server“');
}

console.log(failures ? `\n${failures} Test(s) fehlgeschlagen` : '\nAlle Prompt-Tests bestanden');
process.exit(failures ? 1 : 0);
