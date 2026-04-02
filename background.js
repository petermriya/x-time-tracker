// X Time Tracker - Background Service Worker

let activeTabId = null;
let sessionStart = null;
let isTracking = false;
let trackingInterval = null;

const DAILY_LIMIT_SEC = 3600; // 1 hour

function getTodayKey() {
  const d = new Date();
  return `time_${d.getFullYear()}_${d.getMonth() + 1}_${d.getDate()}`;
}

function isXTab(url) {
  return url && (url.startsWith("https://x.com") || url.startsWith("https://www.x.com") || url.startsWith("https://twitter.com"));
}

function getLocalDateStr() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

async function checkAndBlockTab(tabId, url) {
  if (!isXTab(url)) return false;
  
  const key = getTodayKey();
  const result = await chrome.storage.local.get([key]);
  const current = result[key] || 0;
  
  if (current >= DAILY_LIMIT_SEC) {
    const blockUrl = chrome.runtime.getURL("blocked.html");
    await chrome.tabs.update(tabId, { url: blockUrl });
    return true; // Was blocked
  }
  return false; // Not blocked
}

async function enforceBlockAll() {
  const tabs = await chrome.tabs.query({});
  const blockUrl = chrome.runtime.getURL("blocked.html");
  for (const tab of tabs) {
    if (isXTab(tab.url)) {
      await chrome.tabs.update(tab.id, { url: blockUrl });
    }
  }
}

async function addTime(seconds) {
  if (seconds <= 0) return;
  const key = getTodayKey();
  const result = await chrome.storage.local.get([key, "history"]);
  const current = result[key] || 0;
  let updated = current + seconds;

  // Cap at daily limit to prevent overflow
  if (updated >= DAILY_LIMIT_SEC) {
      updated = DAILY_LIMIT_SEC;
  }
  
  await chrome.storage.local.set({ [key]: updated });

  const history = result.history || {};
  const dateStr = getLocalDateStr();
  history[dateStr] = updated;

  const keys = Object.keys(history).sort();
  if (keys.length > 30) delete history[keys[0]];
  await chrome.storage.local.set({ history });

  // If time's up, block immediately
  if (updated >= DAILY_LIMIT_SEC) {
    await stopTracking();
    await enforceBlockAll();
  }
}

function startTracking(tabId) {
  if (isTracking) return;
  isTracking = true;
  activeTabId = tabId;
  sessionStart = Date.now();
  
  trackingInterval = setInterval(async () => {
    await addTime(1);
  }, 1000);
}

async function stopTracking() {
  if (!isTracking) return;
  isTracking = false;
  activeTabId = null;
  sessionStart = null;
  if (trackingInterval) {
    clearInterval(trackingInterval);
    trackingInterval = null;
  }
}

async function checkTab(tabId) {
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (tab && tab.active && isXTab(tab.url)) {
    const isBlocked = await checkAndBlockTab(tab.id, tab.url);
    if (!isBlocked) startTracking(tab.id);
  }
}

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  await stopTracking();
  await checkTab(tabId);
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" || changeInfo.url) {
    if (isXTab(tab.url)) {
      const isBlocked = await checkAndBlockTab(tabId, tab.url);
      if (isBlocked) {
        await stopTracking();
        return;
      }
    }
    if (isTracking && activeTabId === tabId && !isXTab(tab.url)) {
      await stopTracking();
    } else if (!isTracking && tab.active && isXTab(tab.url)) {
      startTracking(tabId);
    }
  }
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  if (activeTabId === tabId) await stopTracking();
});

chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    await stopTracking();
  } else {
    const tabs = await chrome.tabs.query({ active: true, windowId });
    if (tabs.length > 0) {
      const tab = tabs[0];
      if (isXTab(tab.url)) {
        const isBlocked = await checkAndBlockTab(tab.id, tab.url);
        if (!isBlocked) startTracking(tab.id);
      } else {
        await stopTracking();
      }
    }
  }
});