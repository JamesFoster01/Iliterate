function createMenu() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "iliterate_summarize",
      title: "Go iliterate (summarize selection)",
      contexts: ["selection"],
    });
  });
}

chrome.runtime.onInstalled.addListener(() => createMenu());
chrome.runtime.onStartup.addListener(() => createMenu());
createMenu();

async function getExistingIliterateTabId() {
  const data = await chrome.storage.local.get("iliterate_tabId");
  return data.iliterate_tabId || null;
}

async function setExistingIliterateTabId(tabId) {
  await chrome.storage.local.set({ iliterate_tabId: tabId });
}

async function openOrReuseIliterateTab() {
  const baseUrl = chrome.runtime.getURL("app.html");      // exact
  const matchUrl = baseUrl + "*";                        // wildcard match pattern

  // 1) Try stored tabId first (most reliable)
  const storedId = await getExistingIliterateTabId();
  if (storedId) {
    try {
      const tab = await chrome.tabs.get(storedId);
      if (tab?.url && tab.url.startsWith(baseUrl)) {
        await chrome.windows.update(tab.windowId, { focused: true });
        await chrome.tabs.update(tab.id, { active: true });
        await chrome.tabs.reload(tab.id);
        return;
      }
    } catch {
      // stored tab no longer exists
    }
  }

  // 2) Fallback: search all tabs by URL pattern
  const tabs = await chrome.tabs.query({ url: [matchUrl] });
  if (tabs && tabs.length > 0) {
    const tab = tabs[0];
    await setExistingIliterateTabId(tab.id);

    await chrome.windows.update(tab.windowId, { focused: true });
    await chrome.tabs.update(tab.id, { active: true });
    await chrome.tabs.reload(tab.id);
    return;
  }

  // 3) Create new tab if none found
  const newTab = await chrome.tabs.create({ url: baseUrl });
  await setExistingIliterateTabId(newTab.id);
}

chrome.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId !== "iliterate_summarize") return;

  const selectedText = info.selectionText || "";
  await chrome.storage.local.set({ iliterate_selectedText: selectedText });

  await openOrReuseIliterateTab();
});
