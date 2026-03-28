// X Time Tracker - Background Service Worker

let activeTabId = null;
let sessionStart = null;
let isTracking = false;

function getTodayKey() {
  const d = new Date();
  return `time_${d.getFullYear()}_${d.getMonth() + 1}_${d.getDate()}`;
}

function isXTab(url) {
  return url && (url.startsWith("https://x.com") || url.startsWith("https://www.x.com"));
}

async function addTime(seconds) {
  if (seconds <= 0) return;
  const key = getTodayKey();
  const result = await chrome.storage.local.get([key, "history"]);
  const current = result[key] || 0;
  const updated = current + seconds;
  
  // Save today's total
  await chrome.storage.local.set({ [key]: updated });

  // Save to history log (last 30 days)
  const history = result.history || {};
  const dateStr = new Date().toISOString().split("T")[0];
  history[dateStr] = updated;

  // Trim history to last 30 days
  const keys = Object.keys(history).sort();
  if (keys.length > 30) {
    delete history[keys[0]];
  }
  await chrome.storage.local.set({ history });
}

function startTracking(tabId) {
  if (!isTracking) {
    activeTabId = tabId;
    sessionStart = Date.now();
    isTracking = true;
  }
}

async function stopTracking() {
  if (isTracking && sessionStart !== null) {
    const elapsed = Math.floor((Date.now() - sessionStart) / 1000);
    await addTime(elapsed);
    sessionStart = null;
    isTracking = false;
    activeTabId = null;
  }
}

// Check if a tab is active and on X
async function checkTab(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (tab && tab.active && isXTab(tab.url)) {
      startTracking(tabId);
    } else {
      await stopTracking();
    }
  } catch {
    await stopTracking();
  }
}

// Tab activated
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  await stopTracking();
  await checkTab(tabId);
});

// Tab updated (URL changed)
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" || changeInfo.url) {
    if (isTracking && activeTabId === tabId && !isXTab(tab.url)) {
      await stopTracking();
    } else if (!isTracking && tab.active && isXTab(tab.url)) {
      startTracking(tabId);
    }
  }
});

// Tab removed
chrome.tabs.onRemoved.addListener(async (tabId) => {
  if (activeTabId === tabId) {
    await stopTracking();
  }
});

// Window focus changed
chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    // Browser lost focus
    await stopTracking();
  } else {
    // Check active tab in focused window
    const [tab] = await chrome.tabs.query({ active: true, windowId });
    if (tab) {
      if (isXTab(tab.url)) {
        startTracking(tab.id);
      } else {
        await stopTracking();
      }
    }
  }
});

// Periodic flush every 30s (in case service worker restarts)
chrome.alarms.create("flush", { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "flush" && isTracking && sessionStart !== null) {
    const elapsed = Math.floor((Date.now() - sessionStart) / 1000);
    await addTime(elapsed);
    sessionStart = Date.now(); // reset session start to avoid double-counting
  }
});
