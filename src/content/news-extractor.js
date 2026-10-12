// Artikel-Extraktion. Funktioniert in zwei Umgebungen:
//   1. Als Content Script in einem Tab:  globalThis.__newsHelper.extract()
//   2. In einer Extension-Seite auf einem per DOMParser geparsten Dokument:
//      globalThis.__newsHelper.extractFrom(doc, { url, layout: false })
// Außerdem: harvestLinks(doc, { url, pattern }) sammelt Artikel-Links von Übersichtsseiten.
// Keine Abhängigkeiten, kein `export` (wird auch als klassisches Script geladen).

(() => {
  if (globalThis.__newsHelper?.extractFrom) return;

  const JUNK_TEXT = /^(read more|advertisement|sign up|subscribe|share this|follow us|related( articles| stories)?:?|more from|loading\.\.\.|click here|recommended|sponsored|photo:|image:|getty images|reuters\/|ap photo|copyright|all rights reserved)/i;
  const BAD_TAGS = /^(nav|footer|aside|header|script|style|noscript|form|figure|figcaption|button|iframe|svg|template|dialog)$/i;
  const BAD_CLASS = /(^|[\s_-])(comment|share|social|related|promo|advert|ad[-_]|newsletter|sidebar|cookie|subscribe|footer|nav|menu|breadcrumb|caption|credit|byline|tags?|recommend|popular|trending|widget|modal|popup|paywall|teaser|disclaimer|author-bio|bio)([\s_-]|$)/i;
  const SKIP_PATH = /\/(tag|tags|topic|topics|author|authors|category|categories|video|videos|live|podcast|podcasts|newsletter|newsletters|about|contact|privacy|terms|search|login|signup|subscribe|sitemap|rss|feed|gallery|photos|events|jobs|shop|store)(\/|$)/i;

  const collapse = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const text = (el) => collapse(el ? el.textContent : '');

  function flattenLd(node, out) {
    if (!node) return;
    if (Array.isArray(node)) return node.forEach((n) => flattenLd(n, out));
    if (typeof node !== 'object') return;
    out.push(node);
    if (node['@graph']) flattenLd(node['@graph'], out);
    if (node.mainEntity) flattenLd(node.mainEntity, out);
  }
  const typeStr = (o) => (Array.isArray(o?.['@type']) ? o['@type'].join(' ') : String(o?.['@type'] || ''));

  function ldAuthors(a) {
    if (!a) return [];
    if (Array.isArray(a)) return a.flatMap(ldAuthors);
    if (typeof a === 'string') return [a];
    if (typeof a === 'object' && a.name) {
      if (/Organization/i.test(typeStr(a))) return [];
      return [String(a.name)];
    }
    return [];
  }

  function cleanTitle(t, siteName) {
    let s = collapse(t);
    if (!s) return '';
    const parts = s.split(/\s+[|–—-]\s+/);
    if (parts.length > 1) {
      const last = parts[parts.length - 1];
      if ((siteName && last.toLowerCase().includes(siteName.toLowerCase())) || last.length < 25) {
        s = parts.slice(0, -1).join(' - ');
      }
    }
    return s;
  }

  function extractFrom(doc, opts = {}) {
    const baseUrl = opts.url || doc.location?.href || '';
    const layout = opts.layout !== false && !!doc.defaultView;
    const win = doc.defaultView;

    const abs = (href) => {
      try {
        return new URL(href, baseUrl).href;
      } catch {
        return '';
      }
    };
    const meta = (sel) => {
      const el = doc.querySelector(sel);
      return el ? collapse(el.getAttribute('content')) : '';
    };
    const isVisible = (el) => {
      if (!layout) return !el.hidden;
      if (!el.getClientRects || el.getClientRects().length === 0) return false;
      const cs = win.getComputedStyle(el);
      return cs.display !== 'none' && cs.visibility !== 'hidden';
    };
    const isBad = (el) => {
      let depth = 0;
      for (let n = el; n && n !== doc.body && depth < 8; n = n.parentElement, depth++) {
        if (BAD_TAGS.test(n.localName)) return true;
        const cls = `${typeof n.className === 'string' ? n.className : ''} ${n.id || ''}`;
        if (BAD_CLASS.test(cls)) return true;
        if (n.getAttribute && n.getAttribute('aria-hidden') === 'true') return true;
        if (n.hidden) return true;
      }
      return false;
    };
    const linkDensity = (el) => {
      const total = text(el).length || 1;
      let linked = 0;
      el.querySelectorAll('a').forEach((a) => (linked += text(a).length));
      return linked / total;
    };
    const firstTextOf = (selectors, maxLen = 160) => {
      for (const sel of selectors) {
        for (const el of doc.querySelectorAll(sel)) {
          const t = text(el);
          if (t && t.length <= maxLen) return t;
        }
      }
      return '';
    };
    const firstAttrOf = (pairs) => {
      for (const [sel, attr] of pairs) {
        const el = doc.querySelector(sel);
        if (!el) continue;
        const v = collapse(el.getAttribute(attr));
        if (v) return v;
      }
      return '';
    };

    /** Readability-ähnliche Heuristik: Container mit dem meisten Fließtext. */
    function extractBodyFromDom() {
      const scores = new Map();
      const paragraphs = [...doc.querySelectorAll('p')].filter((p) => {
        const t = text(p);
        return t.length >= 25 && !isBad(p) && linkDensity(p) < 0.5 && isVisible(p);
      });
      if (paragraphs.length === 0) return '';

      for (const p of paragraphs) {
        const len = text(p).length;
        let weight = 1;
        let anc = p.parentElement;
        for (let i = 0; i < 3 && anc && anc !== doc.documentElement; i++) {
          scores.set(anc, (scores.get(anc) || 0) + len * weight);
          weight /= 2;
          anc = anc.parentElement;
        }
      }
      let best = null;
      let bestScore = 0;
      for (const [el, score] of scores) {
        let s = score;
        if (/^article$/i.test(el.localName) || el.getAttribute('itemprop') === 'articleBody') s *= 1.3;
        if (/article|story|body|content|text|post/i.test(`${el.className} ${el.id}`)) s *= 1.15;
        if (s > bestScore) {
          bestScore = s;
          best = el;
        }
      }
      if (!best) return '';

      const seen = new Set();
      const out = [];
      for (const el of best.querySelectorAll('p, h2, h3, h4, blockquote, li')) {
        if (isBad(el) || !isVisible(el)) continue;
        const bq = el.closest('blockquote');
        if (bq && bq !== el && el.localName !== 'blockquote') continue;
        if (el.localName === 'li') {
          const list = el.closest('ul, ol');
          if (list && linkDensity(list) > 0.3) continue;
        }
        const t = text(el);
        if (!t || seen.has(t) || JUNK_TEXT.test(t)) continue;
        const isHeading = /^h[2-4]$/.test(el.localName);
        if (!isHeading && t.split(' ').length < 4) continue;
        if (!isHeading && linkDensity(el) > 0.5) continue;
        seen.add(t);
        out.push(t);
      }
      return out.join('\n\n');
    }

    const ld = [];
    doc.querySelectorAll('script[type="application/ld+json"]').forEach((s) => {
      try {
        flattenLd(JSON.parse(s.textContent), ld);
      } catch {
        /* ungültiges JSON ignorieren */
      }
    });
    const article = ld.find((o) => /Article|Report|BlogPosting|WebPage/i.test(typeStr(o)) && (o.headline || o.articleBody || o.datePublished));

    const siteName = meta('meta[property="og:site_name"]') || article?.publisher?.name || (baseUrl ? new URL(baseUrl).hostname.replace(/^www\./, '') : '');

    const h1 = text(doc.querySelector('article h1, main h1, h1'));
    const title = cleanTitle(article?.headline || h1 || meta('meta[property="og:title"]') || meta('meta[name="twitter:title"]') || doc.title, siteName);

    const authorCandidates = [
      ldAuthors(article?.author).join(', '),
      meta('meta[name="author"]'),
      meta('meta[property="article:author"]'),
      meta('meta[name="parsely-author"]'),
      meta('meta[name="sailthru.author"]'),
      firstAttrOf([['[itemprop="author"] [itemprop="name"]', 'content']]),
      firstTextOf(['[itemprop="author"] [itemprop="name"]', '[itemprop="author"]', '[rel="author"]', '[data-testid*="author" i]', '[class*="author-name" i]', '[class*="byline" i] a', '[class*="byline" i]', '[class*="author" i] a', '[class*="author" i]'])
    ].map(collapse).filter((s) => s && !/^https?:\/\//i.test(s));

    const dateCandidates = [
      meta('meta[property="article:published_time"]'),
      article?.datePublished || '',
      meta('meta[name="date"]'),
      meta('meta[name="pubdate"]'),
      meta('meta[name="publish-date"]'),
      meta('meta[name="publication_date"]'),
      meta('meta[name="parsely-pub-date"]'),
      meta('meta[name="sailthru.date"]'),
      meta('meta[name="dc.date"]'),
      meta('meta[name="DC.date.issued"]'),
      meta('meta[itemprop="datePublished"]'),
      firstAttrOf([['[itemprop="datePublished"]', 'content'], ['[itemprop="datePublished"]', 'datetime'], ['article time[datetime]', 'datetime'], ['time[datetime]', 'datetime']]),
      firstTextOf(['article time', 'time', '[class*="date" i]', '[class*="timestamp" i]', '[class*="published" i]'], 80),
      meta('meta[property="og:updated_time"]')
    ].map(collapse).filter(Boolean);

    let bodyText = '';
    let textSource = '';
    if (article?.articleBody && String(article.articleBody).trim().length > 300) {
      bodyText = String(article.articleBody).replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').trim();
      if (!/\n/.test(bodyText)) bodyText = bodyText.replace(/([.!?]["”’)]?)\s{2,}/g, '$1\n\n');
      textSource = 'json-ld';
    }
    const domText = extractBodyFromDom();
    if (domText && (domText.length > bodyText.length * 1.2 || !bodyText)) {
      bodyText = domText;
      textSource = 'dom';
    }
    const MAX = 40000;
    const truncated = bodyText.length > MAX;
    if (truncated) bodyText = bodyText.slice(0, MAX);

    const canonical = doc.querySelector('link[rel="canonical"]');
    return {
      url: (meta('meta[property="og:url"]') || baseUrl).split('#')[0],
      canonicalUrl: canonical ? abs(canonical.getAttribute('href')) : '',
      siteName,
      lang: doc.documentElement?.lang || '',
      title,
      authorRaw: authorCandidates[0] || '',
      authorCandidates: [...new Set(authorCandidates)].slice(0, 5),
      dateCandidates: [...new Set(dateCandidates)].slice(0, 6),
      dateModified: collapse(meta('meta[property="article:modified_time"]') || article?.dateModified || ''),
      text: bodyText,
      textSource,
      truncated,
      extractedAt: new Date().toISOString()
    };
  }

  /** Sammelt Artikel-Links auf einer Übersichtsseite. */
  function harvestLinks(doc, opts = {}) {
    const baseUrl = opts.url || doc.location?.href || '';
    const pattern = opts.pattern ? new RegExp(opts.pattern, 'i') : null;
    const max = opts.max || 150;
    let host = '';
    try {
      host = new URL(baseUrl).hostname.replace(/^www\./, '');
    } catch {
      /* ignorieren */
    }
    const seen = new Map();
    for (const a of doc.querySelectorAll('a[href]')) {
      let url;
      try {
        url = new URL(a.getAttribute('href'), baseUrl);
      } catch {
        continue;
      }
      if (!/^https?:$/.test(url.protocol)) continue;
      if (host && url.hostname.replace(/^www\./, '') !== host && !pattern) continue;
      url.hash = '';
      for (const k of [...url.searchParams.keys()]) if (/^(utm_|fbclid|gclid|ref$|src$)/i.test(k)) url.searchParams.delete(k);
      const href = url.href;
      const path = url.pathname;
      if (SKIP_PATH.test(path)) continue;
      if (pattern) {
        if (!pattern.test(href)) continue;
      } else {
        const segs = path.split('/').filter(Boolean);
        if (segs.length < 1) continue;
        const last = segs[segs.length - 1];
        const slugLike = last.length >= 12 && (last.includes('-') || /\d/.test(last));
        if (!slugLike) continue;
      }
      let title = text(a);
      if (title.length < 20) {
        const box = a.closest('article, li, div, section');
        const h = box && box.querySelector('h1, h2, h3, h4');
        title = h ? text(h) : title;
      }
      if (!seen.has(href)) seen.set(href, { url: href, title });
      else if (!seen.get(href).title && title) seen.get(href).title = title;
      if (seen.size >= max) break;
    }
    return [...seen.values()].filter((l) => l.title && l.title.length >= 15);
  }

  globalThis.__newsHelper = {
    extractFrom,
    harvestLinks,
    extract: () => extractFrom(document, { url: location.href, layout: true }),
    harvest: (opts) => harvestLinks(document, { url: location.href, ...(opts || {}) })
  };
})();
