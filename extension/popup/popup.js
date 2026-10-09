const BACKEND_URL = "http://127.0.0.1:8765";

document.addEventListener("DOMContentLoaded", () => {
  setupTabs();
  checkBackendHealth();
  loadConfig();
  loadMetrics();
  setupAutopilotLaunchpad();
  setupResumeManagement();
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
      if (btn.dataset.tab === "autopilot") {
        loadMetrics();
        loadConfig();
      }
    });
  });
}

async function checkBackendHealth() {
  const badge = document.getElementById("backend-status");
  if (!badge) return;
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

    const activeView = document.getElementById("resume-active-view");
    const dropzoneView = document.getElementById("resume-dropzone-view");
    const filenameEl = document.getElementById("active-resume-filename");
    const roleEl = document.getElementById("detected-role");
    const skillsEl = document.getElementById("detected-skills");
    const queryInput = document.getElementById("autopilot-query");

    const hasResume = cfg.has_resume || (cfg.resume_text && cfg.resume_text.trim().length > 0);
    const role = cfg.detected_role || "Software Engineer";

    if (hasResume) {
      if (activeView) activeView.style.display = "block";
      if (dropzoneView) dropzoneView.style.display = "none";
      if (filenameEl) filenameEl.innerText = cfg.resume_filename || "Active Profile Resume (.pdf)";
      if (roleEl) roleEl.innerText = role;
      if (skillsEl && cfg.detected_skills && cfg.detected_skills.length > 0) {
        skillsEl.innerText = cfg.detected_skills.slice(0, 8).join(", ");
      }
    } else {
      if (activeView) activeView.style.display = "none";
      if (dropzoneView) dropzoneView.style.display = "block";
    }

    // Set dynamic presets and default query based on detected role
    renderPresets(role);
    if (queryInput && (!queryInput.value || queryInput.value === "Bioinformatics Recruiter")) {
      queryInput.value = `${role} Recruiter`;
    }
  } catch (e) {
    console.warn("Could not load config:", e);
  }
}

function renderPresets(role) {
  const container = document.getElementById("presets-container");
  const queryInput = document.getElementById("autopilot-query");
  if (!container) return;

  const rLower = (role || "").toLowerCase();
  let presets = [];

  if (rLower.includes("bio") || rLower.includes("genom") || rLower.includes("computational bio")) {
    presets = [
      { label: "🧬 Bio Recruiter", q: "Bioinformatics Recruiter" },
      { label: "🔬 Comp Bio Lead", q: "Computational Biology Manager" },
      { label: "🧪 Genomics Lead", q: "Genomics Scientist Illumina" },
      { label: "🤖 ML Bio Lead", q: "Bioinformatics Machine Learning" },
      { label: "💼 Bio Director", q: "Director Bioinformatics" }
    ];
  } else if (rLower.includes("machine learning") || rLower.includes("data scientist") || rLower.includes("ai ")) {
    presets = [
      { label: "🤖 ML Recruiter", q: "Machine Learning Recruiter" },
      { label: "🧠 AI Manager", q: "AI Engineering Manager" },
      { label: "📊 Data Lead", q: "Head of Data Science" },
      { label: "💼 Tech Recruiter", q: "Technical Recruiter Machine Learning" },
      { label: "🤝 Senior ML Peer", q: "Senior Machine Learning Engineer" }
    ];
  } else if (rLower.includes("software") || rLower.includes("full stack") || rLower.includes("backend") || rLower.includes("frontend")) {
    presets = [
      { label: "💼 Tech Recruiter", q: "Technical Recruiter" },
      { label: "🚀 Eng Manager", q: "Engineering Manager" },
      { label: "💻 Senior Dev", q: "Senior Software Engineer" },
      { label: "🤝 Talent Partner", q: "Software Talent Partner" },
      { label: "🎯 VP Eng", q: "VP of Engineering" }
    ];
  } else {
    // Universal presets for any role
    const cleanRole = role.split(/[\/|·,-]/)[0].trim() || "Professional";
    presets = [
      { label: `💼 ${cleanRole} Recruiter`, q: `${cleanRole} Recruiter` },
      { label: `🚀 ${cleanRole} Manager`, q: `${cleanRole} Hiring Manager` },
      { label: `🎯 ${cleanRole} Lead`, q: `${cleanRole} Team Lead` },
      { label: `🤝 Senior ${cleanRole}`, q: `Senior ${cleanRole}` },
      { label: `🏢 Head of ${cleanRole}`, q: `Head of ${cleanRole}` }
    ];
  }

  container.innerHTML = "";
  presets.forEach(p => {
    const btn = document.createElement("button");
    btn.className = "autopilot-preset-btn";
    btn.innerText = p.label;
    btn.dataset.q = p.q;
    btn.addEventListener("click", () => {
      if (queryInput) {
        queryInput.value = p.q;
        btn.style.borderColor = "#3b82f6";
        setTimeout(() => {
          btn.style.borderColor = "#374151";
        }, 300);
      }
    });
    container.appendChild(btn);
  });
}

function setupResumeManagement() {
  const activeView = document.getElementById("resume-active-view");
  const dropzoneView = document.getElementById("resume-dropzone-view");
  const changeBtn = document.getElementById("change-resume-btn");
  const fileInput = document.getElementById("resume-file-input");
  const statusEl = document.getElementById("resume-upload-status");

  if (changeBtn && fileInput) {
    changeBtn.addEventListener("click", () => {
      fileInput.click();
    });
  }

  if (dropzoneView && fileInput) {
    dropzoneView.addEventListener("click", () => {
      fileInput.click();
    });

    dropzoneView.addEventListener("dragover", (e) => {
      e.preventDefault();
      dropzoneView.style.borderColor = "#3b82f6";
    });

    dropzoneView.addEventListener("dragleave", () => {
      dropzoneView.style.borderColor = "#4b5563";
    });

    dropzoneView.addEventListener("drop", (e) => {
      e.preventDefault();
      dropzoneView.style.borderColor = "#4b5563";
      if (e.dataTransfer.files.length > 0) {
        uploadResumeFile(e.dataTransfer.files[0]);
      }
    });
  }

  if (fileInput) {
    fileInput.addEventListener("change", () => {
      if (fileInput.files.length > 0) {
        uploadResumeFile(fileInput.files[0]);
      }
    });
  }

  async function uploadResumeFile(file) {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      if (statusEl) {
        statusEl.style.color = "#f87171";
        statusEl.innerText = "Please upload a valid PDF file (.pdf)";
      }
      return;
    }

    if (statusEl) {
      statusEl.style.color = "#60a5fa";
      statusEl.innerText = `Extracting skills with Laya from ${file.name}...`;
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
      if (statusEl) {
        statusEl.style.color = "#34d399";
        statusEl.innerText = `✓ Profile loaded: ${data.detected_role || "Updated"}`;
      }

      // Switch views to active state
      if (activeView) activeView.style.display = "block";
      if (dropzoneView) dropzoneView.style.display = "none";

      const filenameEl = document.getElementById("active-resume-filename");
      const roleEl = document.getElementById("detected-role");
      const skillsEl = document.getElementById("detected-skills");
      const queryInput = document.getElementById("autopilot-query");

      if (filenameEl) filenameEl.innerText = file.name;
      if (roleEl && data.detected_role) roleEl.innerText = data.detected_role;
      if (skillsEl && data.detected_skills) skillsEl.innerText = data.detected_skills.slice(0, 8).join(", ");

      // Re-tune presets & target query for the newly extracted role
      if (data.detected_role) {
        renderPresets(data.detected_role);
        if (queryInput) queryInput.value = `${data.detected_role} Recruiter`;
      }
    } catch (err) {
      if (statusEl) {
        statusEl.style.color = "#f87171";
        statusEl.innerText = `Error: ${err.message}`;
      }
    }
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

  // Read all-time metrics from DuckDB backend
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

  if (!launchBtn) return;

  launchBtn.addEventListener("click", () => {
    const query = queryInput ? queryInput.value.trim() : "";
    if (!query) {
      if (feedbackEl) {
        feedbackEl.style.color = "#f87171";
        feedbackEl.innerText = "Please enter search keywords or click a preset.";
      }
      return;
    }

    const searchUrl = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(query)}&origin=SWITCH_SEARCH_VERTICAL&jobhunt_autostart=1`;

    if (feedbackEl) {
      feedbackEl.style.color = "#34d399";
      feedbackEl.innerText = "🚀 Opening LinkedIn Search with Auto-Pilot enabled...";
    }

    if (typeof chrome !== "undefined" && chrome.tabs && chrome.tabs.create) {
      chrome.tabs.create({ url: searchUrl });
    } else {
      window.open(searchUrl, "_blank");
    }
  });
}

async function loadHistory() {
  const container = document.getElementById("history-list-container");
  if (!container) return;

  try {
    const res = await fetch(`${BACKEND_URL}/api/profiles?limit=40`);
    if (!res.ok) return;
    const profiles = await res.json();

    if (profiles.length === 0) {
      container.innerHTML = `<div style="font-size: 11px; color: #9ca3af; text-align: center; padding: 24px 0;">No contacts reached out to yet. Start Auto-Pilot above!</div>`;
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
