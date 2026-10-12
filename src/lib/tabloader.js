// Lädt Seiten in einem Hintergrund-Tab des Browsers (für JS-gerenderte Seiten oder
// Seiten, die einfache fetch()-Aufrufe blockieren) und führt dort den Extractor aus.

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

/** Artikel in einem Hintergrund-Tab laden und auslesen. */
export async function extractViaTab(url) {
  return withBackgroundTab(url, async (tabId) => {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['src/content/news-extractor.js'] });
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => globalThis.__newsHelper.extract()
    });
    return result;
  });
}

/** Artikel-Links einer Übersichtsseite in einem Hintergrund-Tab sammeln. */
export async function harvestViaTab(url, pattern) {
  return withBackgroundTab(url, async (tabId) => {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['src/content/news-extractor.js'] });
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: (p) => globalThis.__newsHelper.harvest({ pattern: p }),
      args: [pattern || '']
    });
    return result || [];
  }, { settleMs: 2500 });
}
