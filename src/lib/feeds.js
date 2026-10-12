// Laden von Quellen: RSS/Atom-Feeds parsen oder Artikel-Links von Übersichtsseiten sammeln.
// Läuft in einer Extension-Seite (DOMParser verfügbar).

import { harvestViaTab } from './tabloader.js';

const FETCH_TIMEOUT_MS = 25000;

function childByLocalName(el, names) {
  for (const c of el.children) if (names.includes(c.localName)) return c;
  return null;
}
function childText(el, names) {
  const c = childByLocalName(el, names);
  return c ? (c.textContent || '').trim() : '';
}

/** HTML → Klartext (für Feed-Beschreibungen). */
export function htmlToText(html, max = 500) {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script, style, img, figure').forEach((n) => n.remove());
  const t = (doc.body?.textContent || '').replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max) + '…' : t;
}

export async function fetchText(url, accept = '*/*') {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { accept }, redirect: 'follow' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

/** Parst RSS 2.0, Atom oder RDF. */
export function parseFeed(xmlText, source) {
  const doc = new DOMParser().parseFromString(xmlText, 'text/xml');
  if (doc.querySelector('parsererror')) throw new Error('Feed ist kein gültiges XML');

  const root = doc.documentElement;
  let entries = [];
  if (root.localName === 'feed') entries = [...root.children].filter((c) => c.localName === 'entry');
  else entries = [...doc.getElementsByTagName('item')];
  if (!entries.length) entries = [...doc.querySelectorAll('entry')];

  const items = [];
  for (const e of entries) {
    const title = childText(e, ['title']).replace(/\s+/g, ' ');
    let link = '';
    const linkEls = [...e.children].filter((c) => c.localName === 'link');
    for (const l of linkEls) {
      const rel = l.getAttribute('rel') || 'alternate';
      const href = l.getAttribute('href') || l.textContent.trim();
      if (href && (rel === 'alternate' || !link)) link = href;
      if (rel === 'alternate' && href) break;
    }
    if (!link) link = childText(e, ['guid']);
    if (!/^https?:\/\//i.test(link)) continue;

    const dateStr = childText(e, ['pubDate', 'published', 'updated', 'date', 'dc:date', 'issued']);
    const date = dateStr ? new Date(dateStr) : null;
    const summaryHtml = childText(e, ['description', 'summary', 'content', 'encoded']);
    let author = childText(e, ['creator', 'dc:creator']);
    if (!author) {
      const a = childByLocalName(e, ['author']);
      author = a ? childText(a, ['name']) || a.textContent.trim() : '';
    }
    items.push({
      url: link.trim(),
      title: title || '(ohne Titel)',
      summary: htmlToText(summaryHtml, 400),
      author: author.replace(/\s+/g, ' ').trim(),
      date: date && !isNaN(date.getTime()) ? date : null,
      sourceName: source.name,
      sourceCategory: source.category || 'both'
    });
  }
  return items;
}

/** Artikel-Links von einer Übersichtsseite (per fetch, Fallback: Hintergrund-Tab). */
export async function loadHtmlSource(source) {
  let links = [];
  let fetchError = null;
  try {
    const html = await fetchText(source.url, 'text/html');
    const doc = new DOMParser().parseFromString(html, 'text/html');
    links = globalThis.__newsHelper.harvestLinks(doc, { url: source.url, pattern: source.pattern || '' });
  } catch (e) {
    fetchError = e;
  }
  if (links.length < 3) {
    // Seite ist vermutlich JS-gerendert oder blockiert Bots → im echten Browser-Tab laden.
    links = await harvestViaTab(source.url, source.pattern || '');
    if (!links.length && fetchError) throw fetchError;
  }
  return links.map((l) => ({
    url: l.url,
    title: l.title,
    summary: '',
    author: '',
    date: null,
    sourceName: source.name,
    sourceCategory: source.category || 'both'
  }));
}

/** Lädt eine Quelle und liefert normalisierte Einträge. */
export async function loadSource(source) {
  if (source.type === 'html') return loadHtmlSource(source);
  const xml = await fetchText(source.url, 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8');
  return parseFeed(xml, source);
}
