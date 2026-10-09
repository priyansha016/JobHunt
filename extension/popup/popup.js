const BACKEND_URL = "http://127.0.0.1:8765";

document.addEventListener("DOMContentLoaded", () => {
  setupTabs();
  checkBackendHealth();
  loadConfig();
  loadMetrics();
  setupAutopilotLaunchpad();
  setupResumePdfUpload();
  setupResumeCollapsible();
  loadHistory();

  const refreshHistoryBtn = document.getElementById("refresh-history-btn");
  if (refreshHistoryBtn) {
    refreshHistoryBtn.addEventListener("click", loadHistory);
  }
});

function setupTabs() {
  const tabBtns = document.querySelectorAll(".tab-btn");
  tabBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      tabBtns.forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));

      btn.classList.add("active");
      const targetId = `tab-${btn.dataset.tab}`;
      const targetContent = document.getElementById(targetId);
      if (targetContent) targetContent.classList.add("active");

      if (btn.dataset.tab === "history") loadHistory();
      if (btn.dataset.tab === "autopilot") loadMetrics();
    });
  });
}

async function checkBackendHealth() {
  const badge = document.getElementById("backend-status");
  try {
    const res = await fetch(`${BACKEND_URL}/api/health`);
    if (res.ok) {
      const data = await res.json();
      badge.className = "status-badge online";
      badge.innerText = data.laya_model_ready ? "● Laya Online" : "● DuckDB Online";
    } else {
      throw new Error();
    }
  } catch {
    badge.className = "status-badge offline";
    badge.innerText = "● Backend Offline";
  }
}

async function loadConfig() {
  try {
    const res = await fetch(`${BACKEND_URL}/api/config`);
    if (!res.ok) return;
    const cfg = await res.json();

    const roleEl = document.getElementById("detected-role");
    const skillsEl = document.getElementById("detected-skills");

    if (roleEl && cfg.detected_role) {
      roleEl.innerText = cfg.detected_role;
    }
    if (skillsEl && cfg.detected_skills && cfg.detected_skills.length > 0) {
      skillsEl.innerText = cfg.detected_skills.slice(0, 10).join(", ");
    }
  } catch (e) {
    console.warn("Could not load config:", e);
  }
}

async function loadMetrics() {
  // Read today's invites from localStorage
  const todayKey = `jobhunt_autopilot_${new Date().toISOString().split("T")[0]}`;
  let sentToday = 0;
  try {
    sentToday = parseInt(localStorage.getItem(todayKey) || "0", 10);
  } catch (e) {}

  const sentTodayEl = document.getElementById("stat-sent-today");
  if (sentTodayEl) {
    sentTodayEl.innerText = `${sentToday} / 15`;
  }

  // Read all-time metrics from backend
  try {
    const res = await fetch(`${BACKEND_URL}/api/stats`);
    if (!res.ok) return;
    const stats = await res.json();
    const statSentEl = document.getElementById("stat-sent");
    if (statSentEl) {
      statSentEl.innerText = stats.notes_sent || 0;
    }
  } catch (e) {
    console.warn("Could not load stats:", e);
  }
}

function setupAutopilotLaunchpad() {
  const queryInput = document.getElementById("autopilot-query");
  const launchBtn = document.getElementById("launch-autopilot-btn");
  const feedbackEl = document.getElementById("autopilot-feedback");
  const presetBtns = document.querySelectorAll(".autopilot-preset-btn");

  if (!launchBtn) return;

  presetBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      const q = btn.dataset.q;
      if (q && queryInput) {
        queryInput.value = q;
        btn.style.borderColor = "#3b82f6";
        setTimeout(() => {
          btn.style.borderColor = "#374151";
        }, 300);
      }
    });
  });

  launchBtn.addEventListener("click", () => {
    const query = queryInput ? queryInput.value.trim() : "";
    if (!query) {
      if (feedbackEl) {
        feedbackEl.style.color = "#f87171";
        feedbackEl.innerText = "Please enter search keywords or click a preset.";
      }
      return;
    }

    const searchUrl = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(query)}&origin=SWITCH_SEARCH_VERTICAL`;

    if (feedbackEl) {
      feedbackEl.style.color = "#34d399";
      feedbackEl.innerText = "Opening LinkedIn search with Auto-Pilot HUD...";
    }

    if (typeof chrome !== "undefined" && chrome.tabs && chrome.tabs.create) {
      chrome.tabs.create({ url: searchUrl });
    } else {
      window.open(searchUrl, "_blank");
    }
  });
}

function setupResumeCollapsible() {
  const toggleBtn = document.getElementById("toggle-resume-section");
  const body = document.getElementById("resume-collapsible-body");
  const arrow = document.getElementById("resume-toggle-arrow");

  if (toggleBtn && body) {
    toggleBtn.addEventListener("click", () => {
      const isOpen = body.style.display !== "none";
      body.style.display = isOpen ? "none" : "block";
      if (arrow) arrow.innerText = isOpen ? "▼" : "▲";
    });
  }
}

function setupResumePdfUpload() {
  const dropzone = document.getElementById("resume-pdf-dropzone");
  const input = document.getElementById("resume-pdf-input");
  const fileNameEl = document.getElementById("resume-file-name");

  if (!dropzone || !input) return;

  dropzone.addEventListener("click", () => input.click());

  dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.style.borderColor = "#3b82f6";
  });

  dropzone.addEventListener("dragleave", () => {
    dropzone.style.borderColor = "#3b82f6";
  });

  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    if (e.dataTransfer.files.length > 0) {
      handleResumeFileUpload(e.dataTransfer.files[0]);
    }
  });

  input.addEventListener("change", () => {
    if (input.files.length > 0) {
      handleResumeFileUpload(input.files[0]);
    }
  });

  async function handleResumeFileUpload(file) {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      alert("Please upload a PDF file.");
      return;
    }

    if (fileNameEl) {
      fileNameEl.style.color = "#60a5fa";
      fileNameEl.innerText = `Extracting skills with Laya from ${file.name}...`;
    }

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch(`${BACKEND_URL}/api/resume/upload-pdf`, {
        method: "POST",
        body: formData
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Upload failed");
      }

      const data = await res.json();
      if (fileNameEl) {
        fileNameEl.style.color = "#34d399";
        fileNameEl.innerText = `✓ Loaded: ${data.detected_role || "Bioinformatics Engineer"}`;
      }

      const roleEl = document.getElementById("detected-role");
      const skillsEl = document.getElementById("detected-skills");
      if (roleEl && data.detected_role) roleEl.innerText = data.detected_role;
      if (skillsEl && data.detected_skills) skillsEl.innerText = data.detected_skills.slice(0, 10).join(", ");
    } catch (err) {
      if (fileNameEl) {
        fileNameEl.style.color = "#f87171";
        fileNameEl.innerText = `Error: ${err.message}`;
      }
    }
  }
}

async function loadHistory() {
  const container = document.getElementById("history-list-container");
  if (!container) return;

  try {
    const res = await fetch(`${BACKEND_URL}/api/profiles?limit=40`);
    if (!res.ok) return;
    const profiles = await res.json();

    if (profiles.length === 0) {
      container.innerHTML = `<div style="font-size: 11px; color: #9ca3af; text-align: center; padding: 20px 0;">No contacts reached out to yet. Start Auto-Pilot above!</div>`;
      return;
    }

    container.innerHTML = profiles.map(p => {
      const score = Math.round(p.match_score || 0);
      const scoreColor = score >= 70 ? "#34d399" : score >= 50 ? "#fbbf24" : "#9ca3af";
      const isSent = p.note_status === "sent";

      return `
        <div style="background: #1f2937; border: 1px solid #374151; border-radius: 6px; padding: 10px; margin-bottom: 8px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
            <div style="font-weight: 700; color: #f3f4f6; font-size: 12px;">${p.name || "Candidate"}</div>
            <div style="font-weight: 800; font-size: 11px; color: ${scoreColor};">${score}%</div>
          </div>
          <div style="font-size: 11px; color: #9ca3af; margin-bottom: 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
            ${p.headline || "LinkedIn Profile"}
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; font-size: 10px;">
            <span style="background: rgba(59, 130, 246, 0.15); color: #60a5fa; padding: 2px 6px; border-radius: 4px;">${p.persona || "Domain Peer"}</span>
            <span style="color: ${isSent ? '#34d399' : '#9ca3af'}; font-weight: 600;">
              ${isSent ? '✓ Sent Invite' : 'Drafted'}
            </span>
          </div>
          ${p.suggested_note ? `
            <div style="font-size: 10px; color: #d1d5db; background: #111827; padding: 6px; border-radius: 4px; margin-top: 6px; line-height: 1.3;">
              ${p.suggested_note}
            </div>
          ` : ''}
        </div>
      `;
    }).join("");
  } catch (e) {
    console.warn("Could not load history:", e);
  }
}
