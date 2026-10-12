// Wird per chrome.scripting in den Tab einer News-Seite injiziert.
// Liest URL, Titel, Autor, Datum und den Artikeltext (Englisch) aus.
// Keine Abhängigkeiten – läuft in der isolierten Welt der Extension.

(() => {
  if (globalThis.__newsHelper?.extract) return;

  const JUNK_TEXT = /^(read more|advertisement|sign up|subscribe|share this|follow us|related( articles| stories)?:?|more from|loading\.\.\.|click here|recommended|sponsored|photo:|image:|getty images|reuters\/|ap photo)/i;
  const BAD_TAGS = /^(nav|footer|aside|header|script|style|noscript|form|figure|figcaption|button|iframe|svg|template|dialog)$/i;
  const BAD_CLASS = /(^|[\s_-])(comment|share|social|related|promo|advert|ad[-_]|newsletter|sidebar|cookie|subscribe|footer|nav|menu|breadcrumb|caption|credit|byline|tags?|recommend|popular|trending|widget|modal|popup|paywall|teaser|disclaimer|author-bio|bio)([\s_-]|$)/i;

  const meta = (sel) => {
    const el = document.querySelector(sel);
    return el ? (el.getAttribute('content') || '').trim() : '';
  };
  const text = (el) => (el ? (el.textContent || '').replace(/\s+/g, ' ').trim() : '');

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
      const type = typeStr(a);
      if (/Organization/i.test(type)) return [];
      return [String(a.name)];
    }
    return [];
  }

  function isBad(el) {
    let depth = 0;
    for (let n = el; n && n !== document.body && depth < 8; n = n.parentElement, depth++) {
      if (BAD_TAGS.test(n.localName)) return true;
      const cls = `${n.className && typeof n.className === 'string' ? n.className : ''} ${n.id || ''}`;
      if (BAD_CLASS.test(cls)) return true;
      if (n.getAttribute && n.getAttribute('aria-hidden') === 'true') return true;
      if (n.hidden) return true;
    }
    return false;
  }

  function linkDensity(el) {
    const total = text(el).length || 1;
    let linked = 0;
    el.querySelectorAll('a').forEach((a) => (linked += text(a).length));
    return linked / total;
  }

  function isVisible(el) {
    if (!el.getClientRects || el.getClientRects().length === 0) return false;
    const cs = getComputedStyle(el);
    return cs.display !== 'none' && cs.visibility !== 'hidden';
  }

  /** Readability-ähnliche Heuristik: den Container mit dem meisten Fließtext finden. */
  function extractBodyFromDom() {
    const scores = new Map();
    const paragraphs = [...document.querySelectorAll('p')].filter((p) => {
      const t = text(p);
      return t.length >= 25 && !isBad(p) && linkDensity(p) < 0.5 && isVisible(p);
    });
    if (paragraphs.length === 0) return { container: null, text: '' };

    for (const p of paragraphs) {
      const len = text(p).length;
      let weight = 1;
      let anc = p.parentElement;
      for (let i = 0; i < 3 && anc && anc !== document.documentElement; i++) {
        scores.set(anc, (scores.get(anc) || 0) + len * weight);
        weight /= 2;
        anc = anc.parentElement;
      }
    }

    // Vorzugsweise semantische Container.
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
    if (!best) return { container: null, text: '' };

    const seen = new Set();
    const out = [];
    const nodes = best.querySelectorAll('p, h2, h3, h4, blockquote, li');
    for (const el of nodes) {
      if (isBad(el)) continue;
      if (!isVisible(el)) continue;
      // Verschachtelte Treffer (z. B. <p> in <blockquote>) nur einmal zählen.
      if (el.closest('blockquote') && el.closest('blockquote') !== el && el.localName !== 'blockquote') continue;
      if (el.localName === 'li' && el.closest('ul, ol') && linkDensity(el.closest('ul, ol')) > 0.3) continue;
      const t = text(el);
      if (!t || seen.has(t)) continue;
      if (JUNK_TEXT.test(t)) continue;
      const isHeading = /^h[2-4]$/.test(el.localName);
      if (!isHeading && t.split(' ').length < 4) continue;
      if (!isHeading && linkDensity(el) > 0.5) continue;
      seen.add(t);
      out.push(t);
    }
    return { container: best, text: out.join('\n\n') };
  }

  function cleanTitle(t, siteName) {
    let s = (t || '').replace(/\s+/g, ' ').trim();
    if (!s) return '';
    // " | Site" / " - Site" am Ende entfernen.
    const parts = s.split(/\s+[|–—-]\s+/);
    if (parts.length > 1) {
      const last = parts[parts.length - 1];
      if ((siteName && last.toLowerCase().includes(siteName.toLowerCase())) || last.length < 25) {
        s = parts.slice(0, -1).join(' - ');
      }
    }
    return s;
  }

  function firstTextOf(selectors, maxLen = 160) {
    for (const sel of selectors) {
      for (const el of document.querySelectorAll(sel)) {
        const t = text(el);
        if (t && t.length <= maxLen) return t;
      }
    }
    return '';
  }

  function firstAttrOf(pairs) {
    for (const [sel, attr] of pairs) {
      const el = document.querySelector(sel);
      if (!el) continue;
      const v = (el.getAttribute(attr) || '').trim();
      if (v) return v;
    }
    return '';
  }

  globalThis.__newsHelper = globalThis.__newsHelper || {};
  globalThis.__newsHelper.extract = function extract() {
    const ld = [];
    document.querySelectorAll('script[type="application/ld+json"]').forEach((s) => {
      try {
        flattenLd(JSON.parse(s.textContent), ld);
      } catch {
        /* ungültiges JSON ignorieren */
      }
    });
    const article = ld.find((o) => /Article|Report|BlogPosting|WebPage/i.test(typeStr(o)) && (o.headline || o.articleBody || o.datePublished));

    const siteName = meta('meta[property="og:site_name"]') || article?.publisher?.name || location.hostname.replace(/^www\./, '');

    // --- Titel
    const h1 = text(document.querySelector('article h1, main h1, h1'));
    const title = cleanTitle(article?.headline || h1 || meta('meta[property="og:title"]') || meta('meta[name="twitter:title"]') || document.title, siteName);

    // --- Autor (Rohwert, Normalisierung passiert im Panel)
    const authorCandidates = [
      ldAuthors(article?.author).join(', '),
      meta('meta[name="author"]'),
      meta('meta[property="article:author"]'),
      meta('meta[name="parsely-author"]'),
      meta('meta[name="sailthru.author"]'),
      firstAttrOf([['[itemprop="author"] [itemprop="name"]', 'content']]),
      firstTextOf(['[itemprop="author"] [itemprop="name"]', '[itemprop="author"]', '[rel="author"]', '[data-testid*="author" i]', '[class*="author-name" i]', '[class*="byline" i] a', '[class*="byline" i]', '[class*="author" i] a', '[class*="author" i]'])
    ].map((s) => (s || '').trim()).filter((s) => s && !/^https?:\/\//i.test(s));
    const authorRaw = authorCandidates[0] || '';

    // --- Datum
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
    ].map((s) => (s || '').trim()).filter(Boolean);
    const dateModified = (meta('meta[property="article:modified_time"]') || article?.dateModified || '').trim();

    // --- Text
    let bodyText = '';
    let textSource = '';
    if (article?.articleBody && String(article.articleBody).trim().length > 300) {
      bodyText = String(article.articleBody).replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').trim();
      // JSON-LD articleBody hat oft keine Absätze – an Satzgrenzen mit doppeltem Leerzeichen trennen.
      if (!/\n/.test(bodyText)) bodyText = bodyText.replace(/([.!?]["”’)]?)\s{2,}/g, '$1\n\n');
      textSource = 'json-ld';
    }
    const dom = extractBodyFromDom();
    if (dom.text && (dom.text.length > bodyText.length * 1.2 || !bodyText)) {
      bodyText = dom.text;
      textSource = 'dom';
    }
    const MAX = 40000;
    const truncated = bodyText.length > MAX;
    if (truncated) bodyText = bodyText.slice(0, MAX);

    return {
      url: (meta('meta[property="og:url"]') || location.href).split('#')[0],
      canonicalUrl: document.querySelector('link[rel="canonical"]')?.href || '',
      siteName,
      lang: document.documentElement.lang || '',
      title,
      authorRaw,
      authorCandidates: [...new Set(authorCandidates)].slice(0, 5),
      dateCandidates: [...new Set(dateCandidates)].slice(0, 6),
      dateModified,
      text: bodyText,
      textSource,
      truncated,
      extractedAt: new Date().toISOString()
    };
  };
})();
