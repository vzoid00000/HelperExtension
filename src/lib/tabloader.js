// Lädt Seiten in einem Hintergrund-Tab des Browsers (für JS-gerenderte Seiten oder
// Seiten, die einfache fetch()-Aufrufe blockieren) und führt dort den Extractor aus.
//
// Viele Nachrichtenseiten (Cybernews, The Record …) liegen hinter einer Bot-Prüfung (Cloudflare):
// Das erste Laden zeigt eine Prüfseite, die sich nach einigen Sekunden selbst zum Artikel
// weiterleitet. extractViaTab wartet deshalb und liest so lange erneut aus, bis ein Artikeltext
// da ist oder die Wartezeit abläuft.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function waitForTabLoad(tabId, timeoutMs = 30000) {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    };
    const listener = (id, info) => {
      if (id === tabId && info.status === 'complete') finish();
    };
    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs.get(tabId).then((t) => t.status === 'complete' && finish()).catch(finish);
    setTimeout(finish, timeoutMs);
  });
}

export async function withBackgroundTab(url, fn, { timeoutMs = 30000, settleMs = 1500 } = {}) {
  const tab = await chrome.tabs.create({ url, active: false });
  try {
    await waitForTabLoad(tab.id, timeoutMs);
    await sleep(settleMs);
    return await fn(tab.id);
  } finally {
    chrome.tabs.remove(tab.id).catch(() => {});
  }
}

/** Extractor in den Tab injizieren und ausführen; null, wenn die Seite gerade navigiert. */
async function runExtractor(tabId) {
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['src/content/news-extractor.js'] });
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => globalThis.__newsHelper.extract()
    });
    return result || null;
  } catch {
    return null;
  }
}

/**
 * Artikel in einem Hintergrund-Tab laden und auslesen. Wartet bis zu maxWaitMs auf einen
 * Artikeltext von mindestens minChars Zeichen (Bot-Prüfung, nachgeladener Inhalt); liefert sonst
 * das beste Zwischenergebnis (inkl. blocked: 'challenge' | 'paywall' | '').
 */
export async function extractViaTab(url, { maxWaitMs = 15000, minChars = 400 } = {}) {
  return withBackgroundTab(url, async (tabId) => {
    const start = Date.now();
    let best = null;
    for (;;) {
      const result = await runExtractor(tabId);
      if (result && (result.text || '').length > (best?.text || '').length) best = result;
      else if (result && !best) best = result;
      if (best && (best.text || '').length >= minChars && !best.blocked) return best;
      if (Date.now() - start > maxWaitMs) return best;
      await sleep(1000);
    }
  }, { settleMs: 1200 });
}

/** Artikel-Links einer Übersichtsseite in einem Hintergrund-Tab sammeln (wartet eine Bot-Prüfung ab). */
export async function harvestViaTab(url, pattern, { maxWaitMs = 15000 } = {}) {
  return withBackgroundTab(url, async (tabId) => {
    const start = Date.now();
    let best = [];
    for (;;) {
      let links = null;
      try {
        await chrome.scripting.executeScript({ target: { tabId }, files: ['src/content/news-extractor.js'] });
        const [{ result }] = await chrome.scripting.executeScript({
          target: { tabId },
          func: (p) => globalThis.__newsHelper.harvest({ pattern: p }),
          args: [pattern || '']
        });
        links = result || [];
      } catch {
        links = null;
      }
      if (links && links.length > best.length) best = links;
      if (best.length >= 5 || Date.now() - start > maxWaitMs) return best;
      await sleep(1500);
    }
  }, { settleMs: 2500 });
}
