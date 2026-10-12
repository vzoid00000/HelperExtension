// Erzeugt src/config/osdp-tags.json aus docs/OSDP_Tagging_Handbuch.md (Abschnitt 12).
// Aufruf: node tools/build-tag-catalog.mjs
//
// Format im Handbuch (2 Leerzeichen Einrückung je Ebene):
//   - `Name` [**[Hinweis]**] — HTML-Tooltip (30 Z.): `Ausschnitt`

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(root, 'docs/OSDP_Tagging_Handbuch.md'), 'utf8');

const lines = src.split('\n');
const start = lines.findIndex((l) => l.startsWith('## 12. '));
const end = lines.findIndex((l, i) => i > start && l.startsWith('## 13.'));
const section = lines.slice(start, end);

const roots = [];
const stack = []; // [{ node, depth }]
let count = 0;

for (const line of section) {
  const m = /^(\s*)- `([^`]+)`(.*)$/.exec(line);
  if (!m) continue;
  const depth = m[1].length / 2;
  const name = m[2];
  const rest = m[3];
  const tooltip = /HTML-Tooltip \(30 Z\.\): `([^`]*)`/.exec(rest)?.[1] || '';
  const note = /\*\*\[([^\]]+)\]\*\*/.exec(rest)?.[1] || '';
  const node = { name, tooltip, children: [] };
  if (note) node.note = note;
  while (stack.length && stack[stack.length - 1].depth >= depth) stack.pop();
  if (!stack.length) roots.push(node);
  else stack[stack.length - 1].node.children.push(node);
  stack.push({ node, depth });
  count++;
}

// Vollständige Tooltips und UIDs aus einem Export der Extension (site-dump/osdp-tags-*.json) übernehmen.
// Tooltip-Format im Dashboard: "Tags<Pfad mit Leerzeichen> | <Beschreibung> UID: <Zahl>"
const dumpDir = path.join(root, 'site-dump');
const exportFile = fs.existsSync(dumpDir)
  ? fs.readdirSync(dumpDir).filter((f) => /^osdp-tags-.*\.json$/.test(f)).sort().pop()
  : null;
const fullByPath = new Map();
if (exportFile) {
  const exp = JSON.parse(fs.readFileSync(path.join(dumpDir, exportFile), 'utf8'));
  for (const t of exp.tags || []) {
    const m = /\|\s*([\s\S]*?)\s*UID:\s*(\d+)\s*$/.exec(t.tooltip || '');
    const description = m ? m[1].trim() : '';
    fullByPath.set(t.path, {
      uid: m ? Number(m[2]) : null,
      description: /<<<+\s*ohne Beschreibung/i.test(description) ? '' : description
    });
  }
  console.log(`Tooltips/UIDs aus site-dump/${exportFile}: ${fullByPath.size} Einträge`);
}

// Pfade ergänzen und flache Liste erzeugen
const flat = [];
let matched = 0;
function walk(node, pathArr) {
  const p = [...pathArr, node.name];
  node.path = p.join(' → ');
  const full = fullByPath.get(node.path);
  if (full) {
    if (full.uid != null) node.uid = full.uid;
    if (full.description) node.description = full.description;
    matched++;
  }
  flat.push({ name: node.name, path: node.path, depth: p.length - 1, leaf: node.children.length === 0 });
  for (const c of node.children) walk(c, p);
}
roots.forEach((r) => walk(r, []));
if (exportFile) {
  console.log(`Davon dem Handbuch-Katalog zugeordnet: ${matched}/${count}`);
  const unmatched = [...fullByPath.keys()].filter((p) => !flat.some((f) => f.path === p));
  if (unmatched.length) console.log(`Im Export, aber nicht im Handbuch (${unmatched.length}): ${unmatched.slice(0, 10).join(' | ')}${unmatched.length > 10 ? ' …' : ''}`);
}

const out = {
  source: `docs/OSDP_Tagging_Handbuch.md (Version 1.0, Stand 2026-10-08)${exportFile ? ' + site-dump/' + exportFile : ''}`,
  generatedAt: new Date().toISOString().slice(0, 10),
  count,
  tree: roots
};
fs.mkdirSync(path.join(root, 'src/config'), { recursive: true });
fs.writeFileSync(path.join(root, 'src/config/osdp-tags.json'), JSON.stringify(out, null, 1) + '\n');

console.log(`Tags: ${count}`);
for (const r of roots) console.log(`- ${r.name}: ${flat.filter((f) => f.path.startsWith(r.name + ' → ')).length} Untertags`);
const summary = process.argv.includes('--summary');
if (summary) {
  const newsinfo = roots.find((r) => r.name === 'Newsinfo');
  for (const c of newsinfo.children) {
    console.log(`Newsinfo → ${c.name} (${c.children.length} Kinder): ${c.children.slice(0, 40).map((x) => x.name + (x.children.length ? ` [${x.children.length}]` : '')).join(', ')}`);
  }
  const auftrag = roots.find((r) => r.name === 'Auftragstags');
  const dump = (n, d = 0) => { console.log('  '.repeat(d) + n.name); n.children.forEach((c) => dump(c, d + 1)); };
  dump(auftrag);
}
