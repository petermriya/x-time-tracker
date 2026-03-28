function formatTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return { h, m, s };
}

function formatDisplay(seconds) {
  const { h, m } = formatTime(seconds);
  return `${h}<span>h</span> ${m}<span>m</span>`;
}

function getTodayKey() {
  const d = new Date();
  return `time_${d.getFullYear()}_${d.getMonth() + 1}_${d.getDate()}`;
}

function getLast7Days() {
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().split("T")[0]);
  }
  return days;
}

function formatDateLabel(dateStr, index) {
  if (index === 0) return "Today";
  if (index === 1) return "Yesterday";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

async function checkIfLive() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (tab && tab.url && (tab.url.startsWith("https://x.com") || tab.url.startsWith("https://www.x.com"))) {
        resolve(true);
      } else {
        resolve(false);
      }
    });
  });
}

async function render() {
  const todayKey = getTodayKey();
  const data = await chrome.storage.local.get(["history", todayKey]);
  const todaySeconds = data[todayKey] || 0;
  const history = data.history || {};

  // Today
  document.getElementById("todayTime").innerHTML = formatDisplay(todaySeconds);

  // Live status
  const live = await checkIfLive();
  const dot = document.getElementById("statusDot");
  const note = document.getElementById("sessionNote");
  if (live) {
    dot.classList.add("active");
    note.textContent = "● Tracking now";
    note.classList.add("live");
  } else {
    dot.classList.remove("active");
    note.textContent = "Not currently on X";
    note.classList.remove("live");
  }

  // History
  const days = getLast7Days();
  const maxSeconds = Math.max(...days.map(d => history[d] || 0), 1);
  const listEl = document.getElementById("historyList");
  
  // Skip today (already shown above), show past 6 days
  const pastDays = days.slice(1).filter(d => history[d] > 0);
  
  if (pastDays.length === 0) {
    listEl.innerHTML = '<div class="empty">No history yet</div>';
  } else {
    listEl.innerHTML = days.slice(1).filter(d => history[d] > 0).map((dateStr, i) => {
      const secs = history[dateStr] || 0;
      const pct = Math.round((secs / maxSeconds) * 100);
      const label = formatDateLabel(dateStr, i + 1);
      const { h, m } = formatTime(secs);
      const timeLabel = h > 0 ? `${h}h ${m}m` : `${m}m`;
      return `
        <div class="history-row">
          <span class="history-date">${label}</span>
          <div class="bar-wrap"><div class="bar-fill" style="width:${pct}%"></div></div>
          <span class="history-time">${timeLabel}</span>
        </div>
      `;
    }).join("");
  }
}

document.getElementById("resetBtn").addEventListener("click", async () => {
  if (confirm("Reset all tracking data?")) {
    await chrome.storage.local.clear();
    render();
  }
});

render();

// Refresh every second while popup is open
setInterval(render, 1000);
