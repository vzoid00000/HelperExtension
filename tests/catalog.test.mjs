// Node-Tests für tag-catalog.js (reine Logik, ohne Browser)
import fs from 'node:fs';
import { TagCatalog, buildSelection, selectionToText } from '../src/lib/tag-catalog.js';

let failures = 0;
const check = (cond, msg) => { console.log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) failures++; };

const json = JSON.parse(fs.readFileSync(new URL('../src/config/osdp-tags.json', import.meta.url), 'utf8'));
const cat = new TagCatalog(json);

check(cat.byPath.size === 673, `Katalog geladen: ${cat.byPath.size} Pfade`);
check(cat.isAllowed('Struktur → [S]1 Cyber') && !cat.isAllowed('Struktur'), 'Struktur: Untertag erlaubt, Container nicht');
check(!cat.isAllowed('Newsinfo → zeitlicher Aspekt → 2026-2030') && !cat.isAllowed('Newsinfo → Social Media Post → Post-Twitter'), 'Ausgeschlossene Zweige gesperrt');
check(cat.isAllowed('Auftragstags → WB-Cyber') && cat.isAllowed('Auftragstags → HSC → HSC-KI → [KI_]Tools und Usecases') && !cat.isAllowed('Auftragstags → WB-Cyber → [WB-C]1 Cyber International') && !cat.isAllowed('Auftragstags → HSC'), 'Auftragstags: nur WB + KI-Tag');

const r1 = cat.resolve('Cyber > Cyberangriff > Schadsoftware > Ransomware', 'Cyber');
check(r1?.path === 'Cyber → Cyberangriff → Schadsoftware → Ransomware', 'Pfad mit > aufgelöst');
const r2 = cat.resolve('Ransomware');
check(r2?.path === 'Cyber → Cyberangriff → Schadsoftware → Ransomware', 'Name allein aufgelöst');
const r3 = cat.resolve('USA', 'Newsinfo → geographische Lokationen');
check(r3?.path === 'Newsinfo → geographische Lokationen → Kontinente und Staaten → Nordamerika → USA', 'Ort USA aufgelöst');
const r4 = cat.resolve('Cyber', 'Newsinfo → geographische Lokationen');
check(r4 === null, 'Cyber ist kein Ort');
const r5 = cat.resolve('NATO');
check(r5?.path === 'Allgemeine Tags → Akteur → Internationale Organisation → NATO', 'NATO aufgelöst: ' + r5?.path);
const r6 = cat.resolve('Resilienz', 'Cyber');
check(r6?.path.startsWith('Cyber → Cyber Security'), 'Doppelname Resilienz innerhalb Cyber: ' + r6?.path);

const sel = buildSelection(cat, {
  structure: 'Cyber',
  sourceType: 'Nachrichtenseite',
  locations: ['USA', 'Ukraine', 'Atlantis'],
  topics: ['Cyber > Cyberangriff > Schadsoftware > Ransomware', 'Allgemeine Tags > Akteur > Hackergruppe', 'Erfundener Tag', 'Cyber', 'Newsinfo > zeitlicher Aspekt > 2026-2030'],
  ki: true,
  wb: 'WB-Cyber',
  wbReason: 'Großer Vorfall',
  summary: 'Test.',
  notes: ''
}, { forceWb: 'auto', categoryHint: 'cyber' });
console.log(selectionToText(sel));
console.log('Pfade:', sel.paths);
console.log('Warnungen:', sel.warnings);
check(sel.paths[0] === 'Struktur → [S]1 Cyber', 'Struktur zuerst');
check(sel.paths.includes('Newsinfo → Dokumententyp → News') && sel.paths.includes('Newsinfo → Quellentyp → Nachrichtenseite'), 'Pflichttags News + Quellentyp');
check(sel.locations.length === 2 && sel.warnings.some((w) => w.includes('Atlantis')), 'Orte: 2 gültig, Atlantis verworfen');
check(sel.topics.length === 2 && sel.warnings.some((w) => w.includes('Erfundener Tag')) && sel.warnings.some((w) => w.includes('Oberkategorie')), 'Themen: 2 gültig, Erfundener/Oberkategorie/ausgeschlossen verworfen');
check(sel.paths.includes('Auftragstags → HSC → HSC-KI → [KI_]Tools und Usecases') && sel.paths.includes('Auftragstags → WB-Cyber'), 'KI-Tag und WB-Cyber gesetzt');
check(!sel.paths.some((p) => p.includes('zeitlicher Aspekt')), 'Ausgeschlossener Zweig nicht in Pfaden');

const sel2 = buildSelection(cat, { structure: 'KriMiSi', sourceType: 'Unbekannt', locations: [], topics: [], ki: false, wb: 'WB-Cyber' }, { forceWb: 'no' });
check(sel2.locations[0].endsWith('kein Standort') && sel2.sourceType === 'Nachrichtenseite' && sel2.wb === '' && sel2.paths.length === 4, 'Fallbacks: kein Standort, Nachrichtenseite, WB erzwungen aus: ' + JSON.stringify(sel2.paths));
const sel3 = buildSelection(cat, { structure: 'KriMiSi', sourceType: 'Nachrichtenseite', locations: ['Israel'], topics: [], ki: false, wb: 'none' }, { forceWb: 'yes' });
check(sel3.wb === 'WB-KriMiSi' && sel3.paths.includes('Auftragstags → WB-KriMiSi'), 'WB erzwungen ja → WB-KriMiSi');

const text = cat.treeText('Newsinfo → geographische Lokationen');
check(text.startsWith('geographische Lokationen\n  Antarktis') && text.includes('      Deutschland') && !text.includes('zeitlicher'), `Geo-Baumtext ${text.length} Zeichen`);
const topics = ['Cyber', 'KriMiSi', 'InnoTech', 'Allgemeine Tags'].map((r) => cat.treeText(r)).join('\n');
check(topics.length > 3000 && topics.length < 9000, `Themen-Baumtext ${topics.length} Zeichen`);

console.log(failures ? `\n${failures} Test(s) fehlgeschlagen` : '\nAlle Katalog-Tests bestanden');
process.exit(failures ? 1 : 0);
