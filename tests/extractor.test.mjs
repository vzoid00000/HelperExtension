// Tests für den Artikel-Extraktor (src/content/news-extractor.js) auf typischen Seitenlayouts:
// <p>-Absätze mit Störelementen, <div>-Absätze (Reuters), Nuxt-/WordPress-Container, Bot-Prüfseite,
// Bezahlschranke. Läuft im headless Chromium (Playwright) ohne Extension.
import path from 'node:path';
import { createRequire } from 'node:module';
const { chromium } = (() => { try { return createRequire(import.meta.url)('playwright'); } catch { return createRequire('/opt/node-tools/node_modules/')('playwright'); } })();

const EXT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
let failures = 0;
const check = (cond, msg) => { console.log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) failures++; };

const sentence = (i) => `This is sentence number ${i} of the article body, long enough to count as real text about the incident.`;
const para = (n, from = 1) => Array.from({ length: n }, (_, i) => sentence(from + i));

const browser = await chromium.launch({ headless: true, channel: 'chromium' });
const page = await browser.newPage();
async function extract(html, url) {
  await page.setContent(html, { waitUntil: 'domcontentloaded' });
  await page.addScriptTag({ path: path.join(EXT, 'src/content/news-extractor.js') });
  return page.evaluate((u) => globalThis.__newsHelper.extractFrom(document, { url: u, layout: true }), url);
}

// 1) Reuters-Layout: Absätze als <div data-testid="paragraph-N"> ohne <p>
{
  const html = `<!doctype html><html><head><title>Italy minister targeted by hackers | Reuters</title>
    <meta property="og:site_name" content="Reuters"><meta property="article:published_time" content="2026-11-07T10:00:00Z">
    <script type="application/ld+json">{"@type":"NewsArticle","headline":"Italy foreign minister says he has been targeted by pro-Russian hackers","author":[{"@type":"Person","name":"Angelo Amante"}],"datePublished":"2026-11-07T10:00:00Z"}</script></head>
    <body><header><nav><a href="/world/">World</a><a href="/business/">Business</a></nav></header>
    <main><article>
      <h1>Italy foreign minister says he has been targeted by pro-Russian hackers</h1>
      <div class="article-header__meta"><span class="author-name">By Angelo Amante</span><time datetime="2026-11-07T10:00:00Z">November 7, 2026</time></div>
      <div data-testid="ArticleBody" class="article-body__content__17Yit">
        ${para(8).map((t, i) => `<div data-testid="paragraph-${i}" class="text__text__1FZLe">${t}</div>`).join('\n')}
        <div data-testid="paragraph-8" class="text__text__1FZLe">Reporting by Angelo Amante; Editing by Someone Else</div>
      </div>
      <div class="related"><div>Read more: Other story about something else entirely</div></div>
    </article></main>
    <footer><div>© 2026 Reuters. All rights reserved.</div></footer></body></html>`;
  const r = await extract(html, 'https://www.reuters.com/world/italy-foreign-minister-2026-11-07/');
  check(r.text.length > 600 && r.text.includes(sentence(1)) && r.text.includes(sentence(8)), `Reuters-Layout (div-Absätze): ${r.text.length} Zeichen`);
  check(!/Read more|All rights reserved|World Business/.test(r.text), 'Reuters-Layout: Navigation, Related und Footer ausgeschlossen');
  check(r.authorRaw === 'Angelo Amante' && r.title.startsWith('Italy foreign minister') && !r.blocked, `Autor/Titel: ${r.authorRaw} / ${r.title}`);
}

// 2) Nuxt-/WordPress-Layout (The Record, Cybernews): <p> im Container .article__content, Störelemente drumherum
{
  const html = `<!doctype html><html><head><title>AI-aided cyberattack breaches German web host</title>
    <meta property="og:site_name" content="The Record"></head>
    <body><div class="site-header"><ul class="menu"><li><a href="/cybercrime">Cybercrime</a></li><li><a href="/nation-state">Nation-state</a></li></ul></div>
    <div class="article">
      <h1 class="article__title">Alleged AI-aided cyberattack exploits assistant interface to breach German web host</h1>
      <div class="article__byline">By <a href="/author/x">Daryna Antoniuk</a></div>
      <div class="article__content wysiwyg-parsed-content">
        ${para(7).map((t) => `<p>${t} <a href="/tag/ai">AI</a> context.</p>`).join('\n')}
        <h2>What the company said</h2>
        ${para(3, 20).map((t) => `<p>${t}</p>`).join('\n')}
        <ul class="tags"><li><a href="/tag/ai">AI</a></li><li><a href="/tag/germany">Germany</a></li></ul>
      </div>
      <aside class="sidebar"><div>Subscribe to our newsletter for daily cyber news and analysis from experts.</div>
        <div class="promo">Recommended: Ten other articles you might like to read today instead.</div></aside>
    </div></body></html>`;
  const r = await extract(html, 'https://therecord.media/cyberattack-germany-ai-mittwald');
  check(r.text.length > 700 && r.text.includes(sentence(20)) && /What the company said/.test(r.text), `Container-Layout (.article__content): ${r.text.length} Zeichen`);
  check(!/Subscribe to our newsletter|Recommended:|Cybercrime Nation-state/.test(r.text), 'Container-Layout: Sidebar, Promo und Menü ausgeschlossen');
  check(r.authorRaw === 'Daryna Antoniuk', `Autor aus Byline: ${r.authorRaw}`);
}

// 3) Klassische <p>-Seite ohne Container-Klassen: Heuristik, <span> in <p> nicht doppelt
{
  const html = `<!doctype html><html><head><title>Plain page</title></head><body>
    <div id="wrapper"><div id="left">${para(6).map((t) => `<p><span>${t}</span></p>`).join('')}</div>
    <div id="right"><div>Advertisement</div><div>Sign up for our newsletter today</div></div></div></body></html>`;
  const r = await extract(html, 'https://example.org/story-about-things-2026');
  const occurrences = r.text.split(sentence(1)).length - 1;
  check(r.text.length > 500 && occurrences === 1 && !/Advertisement|Sign up/.test(r.text), `Heuristik ohne Container: ${r.text.length} Zeichen, Satz 1 kommt ${occurrences}× vor`);
}

// 4) Cloudflare-Prüfseite → blocked 'challenge', kaum Text
{
  const html = `<!doctype html><html><head><title>Just a moment...</title></head><body>
    <div class="main-wrapper"><h1>cybernews.com</h1><div id="challenge-body-text">Verifying you are human. This may take a few seconds.</div>
    <div>cybernews.com needs to review the security of your connection before proceeding.</div>
    <div class="footer">Ray ID: 8f3c2a1b9d7e6f54 · Performance &amp; security by Cloudflare</div></div></body></html>`;
  const r = await extract(html, 'https://cybernews.com/security/some-article/');
  check(r.blocked === 'challenge' && r.text.length < 300, `Bot-Prüfseite erkannt: blocked=${r.blocked}, ${r.text.length} Zeichen`);
}

// 5) Bezahlschranke → blocked 'paywall'
{
  const html = `<!doctype html><html><head><title>Exclusive report</title></head><body><article>
    <h1>Exclusive report on something</h1><p>The first paragraph is visible to everyone and gives a short teaser of the story.</p>
    <div class="paywall"><p>Subscribe to continue reading. Already a subscriber? Sign in to read the full article.</p></div></article></body></html>`;
  const r = await extract(html, 'https://www.washingtonpost.com/world/2026/11/07/exclusive-report/');
  check(r.blocked === 'paywall' && r.text.length < 300, `Bezahlschranke erkannt: blocked=${r.blocked}, ${r.text.length} Zeichen`);
}

// 6) Normale Seite mit genug Text → blocked bleibt leer, auch wenn im Footer "Subscribe" steht
{
  const html = `<!doctype html><html><head><title>Normal</title></head><body><article>${para(8).map((t) => `<p>${t}</p>`).join('')}</article>
    <footer><p>Subscribe to continue receiving our newsletter. Sign in to read your saved articles.</p></footer></body></html>`;
  const r = await extract(html, 'https://example.org/normal-article-2026');
  check(r.blocked === '' && r.text.length > 600, `Normale Seite: blocked='${r.blocked}', ${r.text.length} Zeichen`);
}

await browser.close();
console.log(failures ? `\n${failures} Test(s) fehlgeschlagen` : '\nExtraktor-Tests bestanden');
process.exit(failures ? 1 : 0);
