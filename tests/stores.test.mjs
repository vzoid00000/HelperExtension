// Node-Tests für die Datenhaltung (ohne Browser): Quellenverwaltung, Verlauf-Erweiterung,
// Lernregeln, Gesamtexport/-import. chrome.storage.local wird durch einen Speicher im RAM ersetzt.
import fs from 'node:fs';

let failures = 0;
const check = (cond, msg) => { console.log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) failures++; };
const throwsDe = async (fn, re, msg) => {
  try { await fn(); check(false, `${msg} (kein Fehler)`); } catch (e) { check(re.test(e.message), `${msg}: ${e.message}`); }
};

// ---------------------------------------------------------------- Shims ----
const store = new Map();
const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
globalThis.chrome = {
  storage: {
    local: {
      async get(keys) {
        if (keys == null) return Object.fromEntries([...store].map(([k, v]) => [k, clone(v)]));
        const list = typeof keys === 'string' ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys);
        const out = {};
        for (const k of list) if (store.has(k)) out[k] = clone(store.get(k));
        if (!Array.isArray(keys) && typeof keys === 'object') for (const [k, d] of Object.entries(keys)) if (!(k in out)) out[k] = d;
        return out;
      },
      async set(obj) { for (const [k, v] of Object.entries(obj)) store.set(k, clone(v)); },
      async remove(keys) { for (const k of (Array.isArray(keys) ? keys : [keys])) store.delete(k); },
      async clear() { store.clear(); }
    }
  },
  runtime: { getURL: (p) => new URL('../' + p, import.meta.url).href }
};
const fetchLog = [];
globalThis.fetch = async (url, init = {}) => {
  fetchLog.push({ url: String(url), init });
  if (/osdp-tags\.json$/.test(String(url))) {
    return { ok: true, status: 200, json: async () => JSON.parse(fs.readFileSync(new URL('../src/config/osdp-tags.json', import.meta.url), 'utf8')) };
  }
  if (/\/chat\/completions$/.test(String(url))) {
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: { role: 'assistant', content: '„Bei reinen Cyber-Vorfällen in Österreich zusätzlich „Österreich“ als Ort vergeben.“' } }] }), text: async () => '' };
  }
  throw new Error('Netzwerk im Test gesperrt');
};

const { DEFAULT_SOURCES } = await import('../src/lib/sources.js');
const sourcesStore = await import('../src/lib/sources-store.js');
const { normalizeSource, getSources, sourcesByArea, loadSourceList, saveSourceList, addSource, updateSource, removeSource, resetSources, migrateSources, testSource, slugify } = sourcesStore;
const settingsMod = await import('../src/lib/settings.js');
const history = await import('../src/lib/history.js');
const rules = await import('../src/lib/rules.js');
const transfer = await import('../src/lib/data-transfer.js');
const { TagCatalog } = await import('../src/lib/tag-catalog.js');

// ------------------------------------------------------- normalizeSource ----
console.log('\n# Quellen: normalizeSource');
{
  const s = normalizeSource({ name: '  Test  Quelle ', url: 'https://example.org/feed', category: 'CYBER', type: 'RSS', pattern: '', enabled: 'false' });
  check(s.id === 'test-quelle' && s.name === 'Test Quelle' && s.category === 'cyber' && s.type === 'rss' && s.enabled === false && typeof s.addedAt === 'number', 'gültige Quelle normalisiert: ' + JSON.stringify(s));
  check(normalizeSource({ name: 'X', url: 'http://x.org', category: 'unsinn', type: 'egal' }).category === 'both', 'unbekannte Kategorie → both, unbekannter Typ → rss');
  check(normalizeSource({ name: 'X', url: 'http://x.org', pattern: 'apnews\\.com/article/' }).pattern === 'apnews\\.com/article/', 'gültiges Muster bleibt');
  await throwsDe(() => normalizeSource({ name: '', url: 'https://x.org' }), /Name der Quelle fehlt/, 'leerer Name wirft');
  await throwsDe(() => normalizeSource({ name: 'X', url: 'nix' }), /Ungültige URL/, 'ungültige URL wirft');
  await throwsDe(() => normalizeSource({ name: 'X', url: 'ftp://x.org/feed' }), /http:\/\/ oder https:\/\//, 'ftp-URL wirft');
  await throwsDe(() => normalizeSource({ name: 'X', url: 'https://x.org', type: 'html', pattern: '([' }), /Ungültiges URL-Muster/, 'kaputtes RegExp-Muster wirft');
  check(slugify('The Register – Security') === 'the-register-security' && slugify('Zürich Ärger') === 'zuerich-aerger', 'slugify');
}

// ------------------------------------------------------ getSources-Fallbacks ----
console.log('\n# Quellen: getSources, Migration');
{
  const def = getSources({});
  check(def.length === DEFAULT_SOURCES.length && def.every((s) => s.id) && new Set(def.map((s) => s.id)).size === def.length, `leere Einstellungen → ${def.length} Standardquellen mit eindeutigen ids`);
  check(def[0].id === 'bleepingcomputer' && DEFAULT_SOURCES[0].id === undefined, 'Standardquellen bekommen ids, Original bleibt unverändert');
  check(settingsMod.getSources === getSources, 'settings.js re-exportiert getSources');
  check(settingsMod.DEFAULT_SETTINGS.sources.length === 0 && !('autoSave' in settingsMod.DEFAULT_SETTINGS), 'DEFAULT_SETTINGS: sources [], kein autoSave');
  const fromText = getSources({ sourcesText: 'Meine Quelle | https://mein.org/feed | cyber | rss\n#Aus | https://aus.org/ | krimisi | html | foo' });
  check(fromText.length === 2 && fromText[0].id === 'meine-quelle' && fromText[1].enabled === false, 'sourcesText wird geparst: ' + JSON.stringify(fromText.map((s) => s.id)));
  const fromList = getSources({ sources: [{ id: 'a', name: 'A', url: 'https://a.org' }], sourcesText: 'Ignoriert | https://x.org' });
  check(fromList.length === 1 && fromList[0].id === 'a', 'sources-Array hat Vorrang vor sourcesText');
  check(getSources({ sources: [], sourcesText: '' }).length === DEFAULT_SOURCES.length, 'leeres Array → Standardquellen');
  const two = getSources({ sources: [{ name: 'Gleich', url: 'https://1.org' }, { name: 'Gleich', url: 'https://2.org' }] });
  check(two[0].id === 'gleich' && two[1].id === 'gleich-2', 'gleiche Namen → eindeutige ids');

  // Migration
  await chrome.storage.local.set({ settings: { anthropicApiKey: 'k', sourcesText: 'Alt | https://alt.org/feed | krimisi | rss\nKaputt | nix\nAlt2 | https://alt2.org/x | both | html | alt2\\.org/\\d+' } });
  const m = await migrateSources();
  const st = (await chrome.storage.local.get('settings')).settings;
  check(m.migrated && st.sources.length === 2 && st.sourcesText === '' && st.anthropicApiKey === 'k', 'Migration: 2 Quellen übernommen, Text geleert, andere Einstellungen bleiben');
  check(st.sources[1].pattern === 'alt2\\.org/\\d+' && st.sources[1].type === 'html', 'Migration behält Muster/Typ');
  const m2 = await migrateSources();
  check(m2.migrated === false && m2.sources.length === 2, 'zweite Migration ist ein No-op');
  const passed = { sources: [], sourcesText: 'Neu | https://neu.org/feed' };
  await migrateSources(passed);
  check(passed.sources.length === 1 && passed.sourcesText === '', 'übergebenes settings-Objekt wird mitgeändert');
}

// ------------------------------------------------------------ sourcesByArea ----
console.log('\n# Quellen: sourcesByArea');
{
  const list = [
    { id: 'c', category: 'cyber', enabled: true }, { id: 'k', category: 'krimisi', enabled: true },
    { id: 'b', category: 'both', enabled: true }, { id: 'x', category: 'cyber', enabled: false }
  ];
  const ids = (l) => l.map((s) => s.id).join(',');
  check(ids(sourcesByArea(list, 'cyber')) === 'c,b,x' && ids(sourcesByArea(list, 'krimisi')) === 'k,b' && ids(sourcesByArea(list, 'both')) === 'c,k,b,x', 'Bereichsfilter (both gehört zu beiden)');
  check(ids(sourcesByArea(list, 'cyber', { enabledOnly: true })) === 'c,b', 'enabledOnly');
}

// ------------------------------------------------------------------ CRUD ----
console.log('\n# Quellen: CRUD');
{
  await chrome.storage.local.set({ settings: { anthropicApiKey: 'k' } });
  const before = await loadSourceList();
  check(before.length === DEFAULT_SOURCES.length, 'loadSourceList liefert Standardquellen');
  const added = await addSource({ name: 'Neue Quelle', url: 'https://neu.example/feed', category: 'cyber' });
  const after = await loadSourceList();
  check(added.id === 'neue-quelle' && after.length === DEFAULT_SOURCES.length + 1 && after.at(-1).id === 'neue-quelle', 'addSource persistiert Standard + neue Quelle');
  await throwsDe(() => addSource({ name: 'Doppelt', url: 'HTTPS://neu.example/feed/' }), /bereits als Quelle/, 'doppelte URL wirft');
  await throwsDe(() => addSource({ name: 'Doppelt', url: 'kaputt' }), /Ungültige URL/, 'addSource validiert');
  const upd = await updateSource('neue-quelle', { name: 'Umbenannt', enabled: false, category: 'krimisi' });
  check(upd.id === 'neue-quelle' && upd.name === 'Umbenannt' && upd.enabled === false && (await loadSourceList()).find((s) => s.id === 'neue-quelle').category === 'krimisi', 'updateSource: id bleibt, Felder geändert');
  await throwsDe(() => updateSource('gibtsnicht', { name: 'x' }), /nicht gefunden/, 'updateSource unbekannte id wirft');
  await throwsDe(() => updateSource('neue-quelle', { url: DEFAULT_SOURCES[0].url }), /bereits als Quelle/, 'updateSource auf fremde URL wirft');
  check((await removeSource('neue-quelle')) === true && (await removeSource('neue-quelle')) === false, 'removeSource true/false');
  check((await loadSourceList()).length === DEFAULT_SOURCES.length && (await chrome.storage.local.get('settings')).settings.sources.length === DEFAULT_SOURCES.length, 'nach Entfernen bleibt die (jetzt gespeicherte) Standardliste');
  const reset = await resetSources();
  const st = (await chrome.storage.local.get('settings')).settings;
  check(reset.length === DEFAULT_SOURCES.length && st.sources.length === 0 && st.sourcesText === '' && st.anthropicApiKey === 'k', 'resetSources → leer gespeichert = Standard, andere Einstellungen bleiben');
  const saved = await saveSourceList([{ name: 'A', url: 'https://a.org' }, { name: 'B', url: 'https://b.org', type: 'html' }]);
  check(saved.length === 2 && saved[1].type === 'html' && (await loadSourceList()).length === 2, 'saveSourceList ersetzt die Liste');
  await throwsDe(() => saveSourceList([{ name: 'A', url: '' }]), /URL der Quelle fehlt/, 'saveSourceList validiert jede Quelle');

  const t1 = await testSource({ name: 'X', url: 'nix' });
  check(t1.ok === false && /Ungültige URL/.test(t1.error) && t1.count === 0, 'testSource: ungültige Quelle → ok=false mit Meldung');
  const t2 = await testSource({ name: 'X', url: 'https://x.org/feed' });
  check(t2.ok === false && /Netzwerk im Test gesperrt/.test(t2.error) && Array.isArray(t2.sample), 'testSource: Ladefehler → ok=false mit Fehlertext: ' + t2.error);
}

// --------------------------------------------------------------- Verlauf ----
console.log('\n# Verlauf');
{
  const { normalizeUrl, normalizeTitle, findDuplicates, findInHistory, filterHistory, searchHistory, statsForRange, historyStats, startOfWeek, startOfMonth } = history;
  check(normalizeUrl('https://www.example.com/a/b/?utm_source=x&utm_medium=y&id=5#frag') === 'https://www.example.com/a/b/?id=5', 'normalizeUrl entfernt utm/Hash, behält echte Parameter: ' + normalizeUrl('https://www.example.com/a/b/?utm_source=x&utm_medium=y&id=5#frag'));
  check(normalizeUrl('https://example.com/x?fbclid=1') === 'https://example.com/x' && normalizeUrl('kein url') === 'kein url', 'normalizeUrl: nur Tracking → ohne „?“; Nicht-URL unverändert');
  check(normalizeTitle('  Hackers  Hit “Port of  LA”: 3,000 systems down! ') === 'hackers hit port of la 3 000 systems down', 'normalizeTitle: ' + normalizeTitle('  Hackers  Hit “Port of  LA”: 3,000 systems down! '));

  const now = new Date(2026, 9, 14, 10, 0); // Mi 14.10.2026
  const day = 86400e3;
  const list = [
    { id: 'n1', at: now.getTime() - 3600e3, structure: 'Cyber', wb: 'WB-Cyber', ki: true, title: 'Ransomware hits Port of LA', url: 'https://news.example/port-la?utm_source=rss', sourceName: 'BleepingComputer', summary: 'Hafen lahmgelegt', tags: ['Cyber → Cyberangriff → Schadsoftware → Ransomware'] },
    { id: 'n2', at: now.getTime() - 2 * day, structure: 'KriMiSi', wb: '', title: 'Troops move to border', url: 'https://world.example/troops', sourceName: 'BBC World', tags: ['KriMiSi → Militär → Resilienz'] },
    { id: 'n3', at: now.getTime() - 9 * day, structure: 'KriMiSi', wb: 'WB-KriMiSi', title: 'Troops Move To Border!', url: 'https://other.example/troops-2', sourceName: 'Guardian' },
    { id: 'n4', at: now.getTime() - 20 * day, structure: 'Cyber', wb: '', title: 'Ransomware hits port of LA', url: 'https://NEWS.example/port-la/', sourceName: 'The Record' },
    { id: 'n5', at: now.getTime() - 40 * day, structure: 'InnoTech', wb: '', title: 'New drone unveiled', url: 'https://tech.example/drone' }
  ];
  const dup = findDuplicates(list);
  check(dup.size === 2 && dup.get('n1')?.ofId === 'n4' && dup.get('n1').by === 'url', 'Duplikat per URL (utm, Groß/Klein, Schrägstrich) zeigt auf ältesten: ' + JSON.stringify([...dup]));
  check(dup.get('n2')?.ofId === 'n3' && dup.get('n2').by === 'title' && !dup.has('n3') && !dup.has('n4'), 'Duplikat per Titel (andere Schreibweise/Satzzeichen); Originale nicht markiert');
  check(findInHistory(list, { url: 'https://news.example/port-la?utm_campaign=z' })?.id === 'n4', 'findInHistory per URL → ältester');
  check(findInHistory(list, { url: 'https://nirgends.example/', title: 'troops move to border' })?.id === 'n3' && findInHistory(list, { title: 'Nie gesehen' }) === null, 'findInHistory per Titel, sonst null');

  // Oktober 2026: n1 (13.10.), n2 (12.10.), n3 (05.10.); n4 (24.09.) und n5 liegen davor
  check(filterHistory(list, 'month', now).length === 3 && new Date(startOfMonth(now)).getDate() === 1 && filterHistory(list, 'week', now).length === 2 && filterHistory(list, 'all', now).length === 5, 'filterHistory month/week/all');
  const st = historyStats(list, now);
  check(st.today === 1 && st.week === 2 && st.wbCyber === 1 && st.wbKrimisi === 0 && new Date(startOfWeek(now)).getDay() === 1, 'historyStats unverändert: ' + JSON.stringify(st));
  const r = statsForRange(list, 'month', now);
  // duplicates: n1 wiederholt n4 (September, per URL), n2 wiederholt n3 (per Titel) – Duplikate zählen gegen den ganzen Verlauf
  check(r.total === 3 && r.cyber === 1 && r.krimisi === 2 && r.innotech === 0 && r.wbCyber === 1 && r.wbKrimisi === 1 && r.ki === 1 && r.duplicates === 2, 'statsForRange month: ' + JSON.stringify(r));
  const ra = statsForRange(list, 'all', now);
  check(ra.total === 5 && ra.innotech === 1 && ra.duplicates === 2, 'statsForRange all: ' + JSON.stringify(ra));
  check(searchHistory(list, 'ransomware').length === 2 && searchHistory(list, 'bbc troops').length === 1 && searchHistory(list, 'hafen').length === 1 && searchHistory(list, 'Resilienz')[0].id === 'n2' && searchHistory(list, '').length === 5 && searchHistory(list, 'xyz').length === 0, 'searchHistory über Titel/Quelle/Zusammenfassung/Tags');

  // Storage-Funktionen
  await history.clearHistory();
  const e1 = await history.addHistoryEntry({ url: 'https://a.example/1', title: 'Eins', structure: 'Cyber' });
  const imp = await history.importHistory([{ id: e1.id, url: 'https://a.example/1', title: 'Eins' }, { id: 'imp-2', url: 'https://a.example/2', title: 'Zwei', at: 5 }, { kaputt: true }], { merge: true });
  const stored = await history.loadHistory();
  check(imp.added === 1 && imp.skipped === 2 && stored.length === 2 && stored[0].id === e1.id && stored[1].id === 'imp-2', 'importHistory merge: id-Duplikat + ungültig übersprungen, neu sortiert: ' + JSON.stringify(imp));
  const exp = await history.exportHistory();
  check(exp.length === 2 && exp !== stored, 'exportHistory liefert Kopie');
  const imp2 = await history.importHistory({ entries: [{ url: 'https://a.example/3', title: 'Drei' }] }, { merge: false });
  check(imp2.total === 1 && (await history.loadHistory())[0].title === 'Drei', 'importHistory ersetzt ohne merge, vergibt id');
  await throwsDe(() => history.importHistory('nix'), /Liste erwartet/, 'importHistory validiert');
  await history.clearHistory();
  check((await history.loadHistory()).length === 0, 'clearHistory');
}

// ---------------------------------------------------------------- Regeln ----
console.log('\n# Regeln: CRUD + Prompt-Block');
{
  const { normalizeRule, addRule, updateRule, removeRule, loadRules, rulesPromptBlock, recordRuleHits } = rules;
  await chrome.storage.local.remove('rules');
  await throwsDe(() => normalizeRule({ text: '   ' }), /Regeltext fehlt/, 'leerer Text wirft');
  await throwsDe(() => normalizeRule({ text: 'x'.repeat(301) }), /zu lang/, 'zu langer Text wirft');
  await throwsDe(() => normalizeRule({ text: 'ok', scope: 'egal' }), /Unbekannter Bereich/, 'unbekannter Bereich wirft');
  const r1 = await addRule({ text: 'Erste Regel.', scope: 'tagging', reason: 'weil', example: { title: 'T', wrongTags: ['A'], rightTags: ['B'] } });
  check(r1.id && r1.active === true && r1.hits === 0 && r1.example.wrongTags[0] === 'A' && r1.scope === 'tagging', 'addRule: ' + JSON.stringify(r1));
  const r2 = await addRule({ text: 'Zweite Regel.', createdAt: r1.createdAt + 1 });
  const r3 = await addRule({ text: 'Relevanz-Regel.', scope: 'relevance', createdAt: r1.createdAt + 2 });
  const r4 = await addRule({ text: 'Inaktive Regel.', active: false, createdAt: r1.createdAt + 3 });
  check((await loadRules()).length === 4, '4 Regeln gespeichert');
  const u = await updateRule(r2.id, { text: 'Zweite Regel, geändert.', scope: 'translation' });
  check(u.id === r2.id && u.text === 'Zweite Regel, geändert.' && u.scope === 'translation' && u.createdAt === r2.createdAt, 'updateRule');
  check((await updateRule('nix', { text: 'x' })) === null, 'updateRule unbekannt → null');
  await throwsDe(() => updateRule(r1.id, { text: '' }), /Regeltext fehlt/, 'updateRule validiert');
  await recordRuleHits([r1.id, 'nix']);
  check((await loadRules()).find((r) => r.id === r1.id).hits === 1, 'recordRuleHits');

  const all = await loadRules();
  const blockT = rulesPromptBlock(all, 'tagging');
  check(blockT.startsWith('KORREKTURREGELN DES BEARBEITERS') && /Handbuch/.test(blockT) && blockT.includes('1. Erste Regel.') && !blockT.includes('Inaktive') && !blockT.includes('Relevanz') && !blockT.includes('Zweite'), 'Block tagging: nur aktive Regeln des Bereichs:\n' + blockT);
  check(rulesPromptBlock(all, 'relevance').includes('1. Relevanz-Regel.') && rulesPromptBlock(all, 'translation').includes('1. Zweite Regel, geändert.'), 'Block relevance/translation');
  check(rulesPromptBlock([], 'tagging') === '' && rulesPromptBlock(all.filter((r) => r.scope === 'relevance'), 'tagging') === '', 'ohne passende Regeln → leer');
  check((await removeRule(r4.id)) === true && (await removeRule(r4.id)) === false && (await loadRules()).length === 3, 'removeRule');

  // Begrenzung und Reihenfolge (älteste zuerst)
  const many = Array.from({ length: 60 }, (_, i) => normalizeRule({ text: `Regel Nummer ${i + 1} mit etwas Text, damit Zeichen zusammenkommen.`, createdAt: 1000 - i }));
  const b1 = rulesPromptBlock(many, 'tagging');
  const lines = b1.split('\n').slice(1);
  check(lines.length === 40 && lines[0] === '1. Regel Nummer 60 mit etwas Text, damit Zeichen zusammenkommen.' && lines[39].startsWith('40. Regel Nummer 21'), `maxRules 40, älteste zuerst (${lines.length} Zeilen, erste: ${lines[0]})`);
  const b2 = rulesPromptBlock(many, 'tagging', { maxRules: 100, maxChars: 800 });
  check(b2.length <= 800 && b2.split('\n').length > 5 && b2.split('\n').length < 60, `maxChars 800 eingehalten: ${b2.length} Zeichen, ${b2.split('\n').length} Zeilen`);
  check(rulesPromptBlock(many, 'tagging', { maxRules: 3 }).split('\n').length === 4, 'maxRules 3');
}

// ------------------------------------------------ Korrekturen mit Katalog ----
console.log('\n# Regeln: correctionFromChips / draftRuleFromCorrection / distillRule');
{
  const { correctionFromChips, draftRuleFromCorrection, distillRule, tagLabel } = rules;
  const catalog = await TagCatalog.load();
  check(catalog.byPath.size === 673, 'Katalog über fetch-Shim geladen');
  check(catalog.byName.get('resilienz').length === 2, 'Name „Resilienz“ existiert zweimal im Katalog');

  const suggested = [
    'Struktur → [S]1 Cyber',
    'Newsinfo → Dokumententyp → News',
    'Newsinfo → Quellentyp → Nachrichtenseite',
    'Newsinfo → geographische Lokationen → Kontinente und Staaten → Nordamerika → USA',
    'Cyber → Cyberangriff → Schadsoftware → Ransomware',
    'Auftragstags → WB-Cyber'
  ];
  const c1 = correctionFromChips({ suggestedPaths: suggested, finalChips: ['[S]2 KriMiSi', 'News', 'Nachrichtenseite', 'USA', 'Ransomware', 'Resilienz', 'Gibtsnicht'], catalog });
  check(c1.removed.length === 2 && c1.removed.includes('Struktur → [S]1 Cyber') && c1.removed.includes('Auftragstags → WB-Cyber'), 'removed: Struktur-Tag und WB-Tag zählen mit: ' + JSON.stringify(c1.removed));
  check(c1.unchanged.length === 4 && c1.unchanged.includes('Cyber → Cyberangriff → Schadsoftware → Ransomware'), 'unchanged: 4 übernommene Pfade');
  check(c1.added.includes('Struktur → [S]2 KriMiSi') && c1.added.includes('Cyber → Cyber Security → Resilienz') && c1.added.includes('Gibtsnicht') && c1.added.length === 3, 'added: Struktur aufgelöst, Resilienz im Cyber-Teilbaum (wie Vorschlag), unauflösbar als Blattname: ' + JSON.stringify(c1.added));

  const c2 = correctionFromChips({ suggestedPaths: ['Struktur → [S]2 KriMiSi', 'Allgemeine Tags → Politik → Sicherheitspolitik → Sanktionen'], finalChips: ['[S]2 KriMiSi', 'Sanktionen', 'Resilienz'], catalog });
  check(c2.added.length === 1 && c2.added[0] === 'Allgemeine Tags → Politik → Sicherheitspolitik → Resilienz' && c2.removed.length === 0, 'Resilienz bevorzugt im Teilbaum eines Vorschlags (Allgemeine Tags): ' + JSON.stringify(c2.added));
  const c3 = correctionFromChips({ suggestedPaths: ['Struktur → [S]2 KriMiSi'], finalChips: ['[S]2 KriMiSi', 'Resilienz'], catalog });
  check(c3.added[0] === 'Cyber → Cyber Security → Resilienz', 'ohne Teilbaum-Hinweis: erster Treffer: ' + c3.added[0]);
  const c4 = correctionFromChips({ suggestedPaths: ['Struktur → [S]1 Cyber'], finalChips: ['[S]1 Cyber', 'Cyber', 'Cyberangriff', 'Schadsoftware', 'Ransomware', 'USA'], catalog });
  check(c4.added.length === 2 && c4.added.includes('Cyber → Cyberangriff → Schadsoftware → Ransomware') && c4.added.some((p) => p.endsWith('→ USA')) && c4.removed.length === 0, 'Pfad-Ketten-Chips: Vorfahren werden nicht als eigene Tags gezählt: ' + JSON.stringify(c4.added));
  const c5 = correctionFromChips({ suggestedPaths: suggested, finalChips: ['[S]1 Cyber', 'News', 'Nachrichtenseite', 'USA', 'Ransomware', 'WB-Cyber'], catalog });
  check(c5.removed.length === 0 && c5.added.length === 0 && c5.unchanged.length === 6, 'identische Chips → keine Korrektur');
  const c6 = correctionFromChips({ suggestedPaths: ['Cyber → Cyberangriff → Schadsoftware → Ransomware'], finalChips: ['Ransomware', 'Phishing'] });
  check(c6.added[0] === 'Phishing' && c6.unchanged.length === 1, 'ohne Katalog bleiben Blattnamen');

  const article = { title: 'Ransomware hits Port of LA', summary: 'Angriff legt Hafenlogistik lahm, US-Behörden ermitteln.' };
  const d1 = draftRuleFromCorrection({ removed: ['Auftragstags → WB-Cyber'], added: ['Cyber → Cyber Security → Resilienz'] }, article);
  check(d1 === 'Bei Meldungen wie „Ransomware hits Port of LA“ (Angriff legt Hafenlogistik lahm, US-Behörden ermitteln.) nicht „WB-Cyber“ vergeben, sondern „Cyber > Cyber Security > Resilienz“.', 'Vorschlagstext: ' + d1);
  const d2 = draftRuleFromCorrection({ removed: ['Struktur → [S]1 Cyber', 'Auftragstags → WB-Cyber'], added: [] }, { title: 'T' });
  check(d2 === 'Bei Meldungen wie „T“ „[S]1 Cyber“, „WB-Cyber“ nicht vergeben.', 'nur entfernt: ' + d2);
  const d3 = draftRuleFromCorrection({ removed: [], added: ['Newsinfo → geographische Lokationen → Kontinente und Staaten → Europa → Österreich'] }, {});
  check(d3 === 'Bei vergleichbaren Meldungen zusätzlich „Österreich“ vergeben.', 'nur ergänzt, ohne Titel: ' + d3);
  const dLong = draftRuleFromCorrection({ removed: ['Auftragstags → WB-Cyber'], added: ['Cyber → Cyber Security → Resilienz'] }, { title: 'Sehr langer Titel '.repeat(20), summary: 'Lange Zusammenfassung '.repeat(30) });
  check(dLong.length <= 300 && dLong.endsWith('„Cyber > Cyber Security > Resilienz“.') && dLong.includes('…'), `langer Kontext wird auf ≤ 300 Zeichen gekürzt (${dLong.length})`);
  check(draftRuleFromCorrection({ removed: [], added: [] }, article) === '' && tagLabel('Struktur → [S]2 KriMiSi') === '[S]2 KriMiSi', 'leere Korrektur → leer; tagLabel');

  const before = fetchLog.length;
  const rule = await distillRule({ removed: [], added: ['Newsinfo → geographische Lokationen → Kontinente und Staaten → Europa → Österreich'], reason: 'Österreichischer Bezug fehlte' }, article, { llmProvider: 'local', localLlmUrl: 'http://127.0.0.1:1/v1', localLlmModel: 'm' });
  const req = JSON.parse(fetchLog[fetchLog.length - 1].init.body);
  check(rule === 'Bei reinen Cyber-Vorfällen in Österreich zusätzlich „Österreich“ als Ort vergeben.' && fetchLog.length === before + 1, 'distillRule: eine Anfrage, Anführungszeichen entfernt: ' + rule);
  check(req.messages[1].content.includes('Österreichischer Bezug fehlte') && req.messages[1].content.includes('Österreich') && req.max_tokens === 200, 'distillRule-Prompt enthält Begründung und Tags, kurze Ausgabe');
  await throwsDe(() => distillRule({ removed: [], added: [] }, article, {}), /Keine Korrektur/, 'distillRule ohne Korrektur wirft');
}

// --------------------------------------------------- Regeln: Import/Export ----
console.log('\n# Regeln: Import/Export');
{
  const exp = await rules.exportRules();
  check(exp.length === 3, 'exportRules: 3 Regeln');
  const imp = await rules.importRules([...exp, { text: 'Neue importierte Regel.' }, { text: 'erste regel.' }, { text: '' }], { merge: true });
  check(imp.added === 1 && imp.skipped === 5 && imp.total === 4, 'importRules merge: ids + gleicher Text + ungültig übersprungen: ' + JSON.stringify(imp));
  const imp2 = await rules.importRules({ rules: [{ text: 'Einzige.' }] }, { merge: false });
  check(imp2.total === 1 && (await rules.loadRules())[0].text === 'Einzige.', 'importRules ersetzt ohne merge');
  await throwsDe(() => rules.importRules({}), /Liste erwartet/, 'importRules validiert');
}

// ------------------------------------------------- Gesamtexport/-import ----
console.log('\n# exportAllData / importAllData');
{
  await chrome.storage.local.clear();
  await chrome.storage.local.set({
    settings: { anthropicApiKey: 'geheim', deeplApiKey: 'd:fx', minScore: 7, sources: [{ id: 'q1', name: 'Q1', url: 'https://q1.org/feed', category: 'cyber', type: 'rss', pattern: '', enabled: true, addedAt: 1 }] },
    processed: { 'https://q1.org/a': { at: 1, title: 'A', status: 'saved' } }
  });
  await rules.addRule({ text: 'Regel A.' });
  await history.addHistoryEntry({ url: 'https://q1.org/a', title: 'A', structure: 'Cyber' });
  const full = await transfer.exportAllData();
  check(full.version === 1 && typeof full.exportedAt === 'string' && full.settings.anthropicApiKey === 'geheim' && !('sources' in full.settings) && full.sources.length === 1 && full.sources[0].id === 'q1' && full.rules.length === 1 && full.history.length === 1 && Object.keys(full.processed).length === 1, 'exportAllData vollständig (mit Keys): ' + JSON.stringify(Object.keys(full)));
  const noSecrets = await transfer.exportAllData({ includeSecrets: false });
  check(!('anthropicApiKey' in noSecrets.settings) && !('deeplApiKey' in noSecrets.settings) && noSecrets.settings.minScore === 7 && noSecrets.includeSecrets === false, 'includeSecrets=false entfernt API-Keys');
  check(JSON.parse(JSON.stringify(full)).history[0].id === full.history[0].id, 'Export ist JSON-serialisierbar');

  await chrome.storage.local.clear();
  const rep = await transfer.importAllData(JSON.parse(JSON.stringify(full)), { merge: false });
  const st = await chrome.storage.local.get(null);
  check(rep.settings && rep.sources.added === 1 && rep.rules.added === 1 && rep.history.added === 1 && rep.processed === 1, 'importAllData Bericht: ' + JSON.stringify(rep));
  check(st.settings.anthropicApiKey === 'geheim' && st.settings.minScore === 7 && st.settings.sources.length === 1 && st.settings.sources[0].id === 'q1', 'Round-Trip: Einstellungen + Quellen');
  check(st.rules.length === 1 && st.rules[0].text === 'Regel A.' && st.history.length === 1 && st.history[0].url === 'https://q1.org/a' && st.processed['https://q1.org/a'].status === 'saved', 'Round-Trip: Regeln, Verlauf, erledigt');
  const again = await transfer.exportAllData();
  check(JSON.stringify(again.sources) === JSON.stringify(full.sources) && JSON.stringify(again.history) === JSON.stringify(full.history) && JSON.stringify(again.rules) === JSON.stringify(full.rules), 'zweiter Export identisch');

  // merge: nichts doppelt, leere Keys überschreiben nicht
  const rep2 = await transfer.importAllData({ ...noSecrets, settings: { ...noSecrets.settings, anthropicApiKey: '', minScore: 5 }, sources: [...full.sources, { name: 'Q2', url: 'https://q2.org/feed' }] }, { merge: true });
  const st2 = await chrome.storage.local.get(null);
  check(rep2.sources.added === 1 && rep2.sources.skipped === 1 && rep2.rules.skipped === 1 && rep2.history.skipped === 1 && st2.settings.anthropicApiKey === 'geheim' && st2.settings.minScore === 5 && st2.settings.sources.length === 2, 'merge-Import: Duplikate übersprungen, leerer Key überschreibt nicht: ' + JSON.stringify(rep2));
  await throwsDe(() => transfer.importAllData('{kaputt'), /kein gültiges JSON/, 'Import: kaputtes JSON');
  await throwsDe(() => transfer.importAllData({ version: 2, settings: {} }), /Unbekannte Dateiversion/, 'Import: falsche Version');
  await throwsDe(() => transfer.importAllData({ foo: 1 }), /keine bekannten Daten/, 'Import: keine Abschnitte');
  await throwsDe(() => transfer.importAllData({ history: 'x' }), /„history“ muss eine Liste/, 'Import: Typprüfung');
  check(transfer.validateImport(JSON.stringify({ rules: [] })).rules.length === 0, 'validateImport akzeptiert JSON-String');
}

console.log(failures ? `\n${failures} Test(s) fehlgeschlagen` : '\nAlle Store-Tests bestanden');
process.exit(failures ? 1 : 0);
