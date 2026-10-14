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

const { TagCatalog, TOPIC_ROOTS, PATH_GEO, SEP, compactDescription, shortenAtWord } = await import('../src/lib/tag-catalog.js');
const tagger = await import('../src/lib/tagger.js');
const translate = await import('../src/lib/translate.js');
const classify = await import('../src/lib/classify.js');

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
  check(tagger.limitArticleText('kurz').length === 4 && tagger.limitArticleText('a'.repeat(20000)).length <= 10000, 'limitArticleText');

  // Claude API: drei Blöcke, Katalog gecacht, Regelwerk ohne cache_control
  apiBodies.length = 0;
  const api = { llmProvider: 'claude', anthropicApiKey: 'sk-test', anthropicModel: 'claude-opus-5-5' };
  await tagger.suggestTags(article, cat, api, { rulesText });
  const blocks = apiBodies[0]?.system;
  check(Array.isArray(blocks) && blocks.length === 3 && blocks[0].text.includes('PFLICHT') && !blocks[0].cache_control, 'API: Block 1 = Regeln ohne cache_control');
  check(blocks?.[1]?.cache_control?.type === 'ephemeral' && blocks[1].text.includes('=== THEMEN-TAGS') && blocks[1].text.length <= 30000, 'API: Block 2 = Katalog mit cache_control');
  check(blocks?.[2]?.text === rulesText && !blocks[2].cache_control, 'API: Block 3 = Regelwerk NACH dem Katalog ohne cache_control');
  check(apiBodies[0].max_tokens === 2000 && apiBodies[0].output_config?.format?.type === 'json_schema', 'API: Structured Output, max_tokens 2000');
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
  mockReply = () => `Hier ist die Übersetzung:\n\nHacker dringen in Hafenbehörde ein.\n\n${deP(1)}\n\n${deP(2)}\n\n${deP(3)}`;
  const r1 = await translate.translateArticle({ title, text: srcText }, local, () => {}, { rulesText: 'GLOSSAR: port authority = Hafenbehörde' });
  check(requests.length === 1, 'Titel + Text in EINER Anfrage');
  check(r1.title === 'Hacker dringen in Hafenbehörde ein' && r1.text.startsWith(deP(1)) && r1.text.split(/\n\s*\n/).length === 3, 'Schlagzeile (ohne Punkt) und Text korrekt zerlegt');
  check(r1.warnings.some((w) => /Floskel/.test(w)) && r1.warnings.length === 1, 'Einleitungs-Floskel entfernt und gemeldet: ' + JSON.stringify(r1.warnings));
  check(requests[0].messages[0].content.includes('GLOSSAR: port authority') && requests[0].messages[0].content.includes('Nichts ergänzen, nichts weglassen'), 'Regelwerk und Anweisungen im System-Prompt');
  check(/^SCHLAGZEILE:\n.+\n\nTEXT:\n/.test(requests[0].messages[1].content), 'Nutzer-Nachricht mit SCHLAGZEILE/TEXT');
  check(r1.provider === 'local', 'provider wird mitgeliefert');

  // 2) Zu kurze Übersetzung → Warnung Längenverhältnis + Absatzanzahl
  mockReply = () => 'Hacker dringen in Hafenbehörde ein\n\nKurzfassung.';
  const r2 = await translate.translateArticle({ title, text: srcText }, local);
  check(r2.warnings.some((w) => /Längenverhältnis/.test(w)) && r2.warnings.some((w) => /Absatzanzahl/.test(w)), 'Zu kurze Übersetzung: ' + JSON.stringify(r2.warnings));

  // 3) Nur Schlagzeile
  mockReply = () => '„Hacker dringen in Hafenbehörde ein“';
  const r3 = await translate.translateArticle({ title, text: '' }, local);
  check(r3.title === 'Hacker dringen in Hafenbehörde ein' && r3.text === '' && r3.warnings.length === 0, 'Nur Schlagzeile, Anführungszeichen entfernt');

  // 4) Labels und fehlende Leerzeile (reine Zerlegung)
  const s4 = translate.splitTranslation('Schlagzeile: Titel hier\nTEXT:\nErster Absatz.\n\nZweiter Absatz.', { hasTitle: true, hasText: true });
  check(s4.title === 'Titel hier' && s4.text === 'Erster Absatz.\n\nZweiter Absatz.' && s4.warnings.length === 1, 'Labels entfernt, fehlende Leerzeile gemeldet: ' + JSON.stringify(s4));
  const s5 = translate.splitTranslation('```\nTitel\n\nText.\n```', { hasTitle: true, hasText: true });
  check(s5.title === 'Titel' && s5.text === 'Text.', 'Codeblock entfernt');
  const s6 = translate.splitTranslation('SCHLAGZEILE:\nTitel\n\nTEXT:\nErster Absatz.\n\nZweiter Absatz.', { hasTitle: true, hasText: true });
  check(s6.title === 'Titel' && s6.text === 'Erster Absatz.\n\nZweiter Absatz.' && s6.warnings.length === 0, 'Labels auf eigenen Zeilen entfernt');

  // 5) Plausibilität ohne Auffälligkeit
  const ok = translate.checkTranslation({ title, text: srcText }, { title: 'Hacker dringen in Hafenbehörde ein', text: [deP(1), deP(2), deP(3)].join('\n\n') });
  check(ok.length === 0, 'checkTranslation: unauffällig → keine Warnungen');
  const bad = translate.checkTranslation({ title, text: srcText }, { title: '', text: `${deP(1)}\n\n${deP(2)}\n\n${deP(3)}\n\nAnmerkung: Begriff frei übersetzt.` });
  check(bad.some((w) => /Schlagzeile fehlt/.test(w)) && bad.some((w) => /Anmerkung/.test(w)), 'checkTranslation: fehlende Schlagzeile und Anmerkung erkannt');
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
}

console.log(failures ? `\n${failures} Test(s) fehlgeschlagen` : '\nAlle Prompt-Tests bestanden');
process.exit(failures ? 1 : 0);
