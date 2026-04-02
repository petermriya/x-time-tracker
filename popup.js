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

function getLocalDateStr(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function getLast7Days() {
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(getLocalDateStr(d));
  }
  return days;
}

function formatDateLabel(dateStr, index) {
  if (index === 0) return "Today";
  if (index === 1) return "Yest";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short" });
}

async function updateUI() {
  const key = getTodayKey();
  const result = await chrome.storage.local.get([key, "history"]);
  const todaySecs = result[key] || 0;
  const history = result.history || {};

  // Update Today
  document.getElementById("todayTime").innerHTML = formatDisplay(todaySecs);
  
  // Show Warning if Limit Reached
  if (todaySecs >= 3600) {
    document.getElementById("limitNote").classList.add("show");
  } else {
    document.getElementById("limitNote").classList.remove("show");
  }

  // Calculate & Update 7-Day Total
  const days = getLast7Days();
  let weeklyTotalSec = 0;
  days.forEach(d => {
      weeklyTotalSec += (history[d] || 0);
  });
  // Ensure today's live time is included even if history isn't fully flushed
  if (!history[days[0]] || todaySecs > history[days[0]]) {
      weeklyTotalSec = weeklyTotalSec - (history[days[0]] || 0) + todaySecs;
  }
  document.getElementById("weeklyTotal").innerHTML = formatDisplay(weeklyTotalSec);

  // Is Tracking currently?
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const activeTab = tabs[0];
  const dot = document.getElementById("statusDot");
  const note = document.getElementById("currentNote");
  
  const isX = activeTab && activeTab.url && (activeTab.url.includes("x.com") || activeTab.url.includes("twitter.com"));
  
  if (isX && todaySecs < 3600) {
    dot.classList.add("active");
    note.textContent = "Tracking now...";
  } else {
    dot.classList.remove("active");
    note.textContent = "Today";
  }

  // History List (Past 6 Days)
  const maxSeconds = Math.max(...days.map(d => history[d] || 0), 1);
  const listEl = document.getElementById("historyList");
  const pastDays = days.slice(1).filter(d => history[d] > 0);
  
  if (pastDays.length === 0) {
    listEl.innerHTML = '<div class="empty">No history yet</div>';
  } else {
    listEl.innerHTML = pastDays.map((dateStr, i) => {
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

// Initial load
updateUI();

// Refresh UI every second if popup is left open
setInterval(updateUI, 1000);