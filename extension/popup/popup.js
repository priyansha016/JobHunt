const BACKEND_URL = "http://127.0.0.1:8765";

document.addEventListener("DOMContentLoaded", () => {
  setupTabs();
  checkBackendHealth();
  loadMetrics();
  loadConfig();
  loadTemplates();
  loadHistory();
  setupResumePdfUpload();
  setupDirectMatcher();
  setupAutopilotLaunchpad();

  document.getElementById("save-targets-btn").addEventListener("click", saveTargets);
  document.getElementById("save-cleanup-btn").addEventListener("click", saveBlacklist);
  document.getElementById("save-template-btn").addEventListener("click", saveTemplate);
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

      if (btn.dataset.tab === "metrics") loadMetrics();
      if (btn.dataset.tab === "templates") loadTemplates();
      if (btn.dataset.tab === "history") loadHistory();
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

async function loadMetrics() {
  try {
    const res = await fetch(`${BACKEND_URL}/api/stats`);
    if (!res.ok) return;
    const stats = await res.json();

    document.getElementById("stat-total").innerText = stats.total_profiles_evaluated || 0;
    document.getElementById("stat-avg").innerText = `${stats.avg_match_score || 0}%`;
    document.getElementById("stat-priority").innerText = stats.high_priority_matches || 0;
    document.getElementById("stat-sent").innerText = stats.notes_sent || 0;

    if (stats.cleanup_stats) {
      document.getElementById("stat-unfollowed").innerText = stats.cleanup_stats.unfollowed || 0;
      document.getElementById("stat-removed").innerText = stats.cleanup_stats.removed || 0;
    }
  } catch (e) {
    console.warn("Could not load metrics:", e);
  }
}

async function loadConfig() {
  try {
    const res = await fetch(`${BACKEND_URL}/api/config`);
    if (!res.ok) return;
    const cfg = await res.json();

    const resumeVal = cfg.resume_text || "";
    document.getElementById("cfg-resume").value = resumeVal;
    document.getElementById("cfg-blacklist").value = (cfg.cleanup_blacklist || []).join(", ");

    if (cfg.detected_role) {
      document.getElementById("detected-role").innerText = cfg.detected_role;
      if (cfg.detected_skills && cfg.detected_skills.length > 0) {
        document.getElementById("detected-skills").innerText = cfg.detected_skills.slice(0, 15).join(", ");
      }
    } else {
      updateDetectedResumeStats(resumeVal);
    }
  } catch (e) {
    console.warn("Could not load config:", e);
  }
}

async function loadTemplates() {
  const container = document.getElementById("templates-list-container");
  if (!container) return;
  try {
    const res = await fetch(`${BACKEND_URL}/api/templates`);
    if (!res.ok) return;
    const templates = await res.json();

    if (templates.length === 0) {
      container.innerHTML = `<div style="font-size: 11px; color: #9ca3af; text-align: center;">No templates found.</div>`;
      return;
    }

    container.innerHTML = templates.map(t => `
      <div style="background: #1f2937; border: 1px solid #374151; border-radius: 6px; padding: 10px; margin-bottom: 8px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
          <div style="font-weight: 700; color: #60a5fa; font-size: 12px;">
            ${t.title} ${t.is_default ? '<span style="font-size: 9px; background: #059669; color: #fff; padding: 1px 5px; border-radius: 4px; margin-left: 4px;">DEFAULT</span>' : ''}
          </div>
          <button class="delete-tmpl-btn" data-id="${t.id}" style="background: transparent; border: none; color: #ef4444; cursor: pointer; font-size: 13px;">✕</button>
        </div>
        <div style="font-size: 10px; color: #9ca3af; margin-bottom: 4px;">Persona: <strong>${t.persona}</strong></div>
        <div style="font-size: 11px; color: #d1d5db; line-height: 1.3; background: #111827; padding: 6px 8px; border-radius: 4px;">${t.template_text}</div>
      </div>
    `).join("");

    container.querySelectorAll(".delete-tmpl-btn").forEach(btn => {
      btn.addEventListener("click", async () => {
        const tid = btn.dataset.id;
        await fetch(`${BACKEND_URL}/api/templates/${tid}`, { method: "DELETE" });
        loadTemplates();
      });
    });
  } catch (e) {
    console.warn("Could not load templates:", e);
  }
}

async function saveTemplate() {
  const title = document.getElementById("tmpl-title").value.trim();
  const persona = document.getElementById("tmpl-persona").value;
  const text = document.getElementById("tmpl-text").value.trim();
  const isDefault = document.getElementById("tmpl-is-default").checked;
  const feedback = document.getElementById("template-feedback");

  if (!title || !text) {
    feedback.innerText = "Please provide both title and template text.";
    feedback.style.color = "#ef4444";
    return;
  }

  const id = `tmpl_${Date.now()}`;
  try {
    const res = await fetch(`${BACKEND_URL}/api/templates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: id,
        persona: persona,
        title: title,
        template_text: text,
        is_default: isDefault
      })
    });
    if (res.ok) {
      feedback.innerText = "Template saved!";
      feedback.style.color = "#34d399";
      document.getElementById("tmpl-title").value = "";
      document.getElementById("tmpl-text").value = "";
      document.getElementById("tmpl-is-default").checked = false;
      loadTemplates();
      setTimeout(() => { feedback.innerText = ""; }, 2000);
    }
  } catch (e) {
    feedback.innerText = "Failed to save template.";
    feedback.style.color = "#ef4444";
  }
}

async function saveTargets() {
  const resume = document.getElementById("cfg-resume").value;
  const feedback = document.getElementById("targets-feedback");

  try {
    const res = await fetch(`${BACKEND_URL}/api/config`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resume_text: resume
      })
    });
    if (res.ok) {
      const data = await res.json();
      if (data.detected_role) {
        document.getElementById("detected-role").innerText = data.detected_role;
        if (data.detected_skills && data.detected_skills.length > 0) {
          document.getElementById("detected-skills").innerText = data.detected_skills.slice(0, 15).join(", ");
        }
      } else {
        updateDetectedResumeStats(resume);
      }
      feedback.innerText = "Resume saved! Laya is ready for profiling.";
      setTimeout(() => { feedback.innerText = ""; }, 2500);
    }
  } catch {
    feedback.innerText = "Error saving. Is backend running?";
  }
}

function updateDetectedResumeStats(resumeText) {
  const roleEl = document.getElementById("detected-role");
  const skillsEl = document.getElementById("detected-skills");
  if (!roleEl || !skillsEl) return;

  const roles = [
    "Bioinformatics Engineer", "Bioinformatics Scientist", "Computational Biologist",
    "Computational Genomics Scientist", "Genomics Data Scientist", "Genomics Engineer",
    "Machine Learning Engineer", "AI Engineer", "Data Scientist", "Research Scientist",
    "Staff Software Engineer", "Senior Software Engineer", "Senior Full Stack Engineer",
    "Senior Backend Engineer", "Software Engineer", "Full Stack Engineer", "Backend Engineer"
  ];
  const skills = [
    "Machine Learning", "Deep Learning", "PyTorch", "TensorFlow", "Scikit-learn", "Nextflow",
    "Bioinformatics", "Computational Genomics", "NGS Analysis", "RNA-Seq", "Multi-Omics",
    "LangChain", "RAG", "Neo4j", "Python", "pandas", "NumPy", "R", "SQL", "PostgreSQL",
    "Docker", "AWS", "FastAPI", "Git"
  ];

  const lines = (resumeText || "").split("\n");
  let foundRole = null;

  // Check for headline line with '·' (and NOT colons ':' which belong to skill categories)
  for (const line of lines.slice(0, 30)) {
    const trimmed = line.trim();
    if (trimmed.includes("·") && !trimmed.includes(":") && 
        /\b(engineer|scientist|genomics|developer|biologist)\b/i.test(trimmed)) {
      const parts = trimmed.split("·").map(p => p.trim()).filter(Boolean);
      if (parts.length > 0) {
        foundRole = parts[0];
        break;
      }
    }
  }

  const lower = (resumeText || "").toLowerCase();
  if (!foundRole) {
    const summaryMatch = resumeText.match(/\b([A-Z][a-zA-Z\s]{3,35}(?:Engineer|Scientist|Biologist|Developer))\s+with\s+\d+\s+years/);
    if (summaryMatch) {
      foundRole = summaryMatch[1].trim();
    }
  }

  if (!foundRole) {
    for (const r of roles) {
      if (lower.includes(r.toLowerCase())) {
        foundRole = r;
        break;
      }
    }
  }

  foundRole = foundRole || "Bioinformatics Engineer";
  const foundSkills = skills.filter(s => lower.includes(s.toLowerCase()));
  roleEl.innerText = foundRole;
  skillsEl.innerText = foundSkills.length > 0 ? foundSkills.join(", ") : "Python, Machine Learning, Bioinformatics";
}

async function saveBlacklist() {
  const blacklist = parseCsv(document.getElementById("cfg-blacklist").value);
  const feedback = document.getElementById("cleanup-feedback");

  try {
    const res = await fetch(`${BACKEND_URL}/api/config`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cleanup_blacklist: blacklist
      })
    });
    if (res.ok) {
      feedback.innerText = "Blacklist rules saved to DuckDB!";
      setTimeout(() => { feedback.innerText = ""; }, 2000);
    }
  } catch {
    feedback.innerText = "Error saving. Is backend running?";
  }
}

async function loadHistory() {
  const container = document.getElementById("history-list");
  try {
    const res = await fetch(`${BACKEND_URL}/api/profiles?limit=20`);
    if (!res.ok) return;
    const profiles = await res.json();

    if (profiles.length === 0) {
      container.innerHTML = `
        <div style="font-size: 12px; color: #9ca3af; text-align: center; padding: 20px 0;">
          No evaluated profiles yet. Browse LinkedIn to start profiling!
        </div>
      `;
      return;
    }

    container.innerHTML = profiles.map(p => {
      const score = Math.round(p.match_score);
      const scoreClass = score >= 75 ? "high" : score >= 50 ? "medium" : "low";
      return `
        <div class="profile-item">
          <div>
            <div class="profile-item-name">${p.name}</div>
            <div class="profile-item-headline">${p.headline || p.current_company || "LinkedIn Member"}</div>
          </div>
          <span class="score-badge ${scoreClass}">${score}%</span>
        </div>
      `;
    }).join("");
  } catch (e) {
    console.warn("Could not load history:", e);
  }
}

function parseCsv(str) {
  if (!str) return [];
  return str.split(",")
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

function setupResumePdfUpload() {
  const dropzone = document.getElementById("resume-pdf-dropzone");
  const fileInput = document.getElementById("resume-pdf-input");
  const statusEl = document.getElementById("resume-upload-status");
  if (!dropzone || !fileInput) return;

  dropzone.addEventListener("click", () => fileInput.click());

  dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.classList.add("dragover");
  });

  dropzone.addEventListener("dragleave", () => {
    dropzone.classList.remove("dragover");
  });

  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("dragover");
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleResumeFileUpload(e.dataTransfer.files[0]);
    }
  });

  fileInput.addEventListener("change", () => {
    if (fileInput.files && fileInput.files.length > 0) {
      handleResumeFileUpload(fileInput.files[0]);
    }
  });

  async function handleResumeFileUpload(file) {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      statusEl.style.color = "#f87171";
      statusEl.innerText = "Please select a .pdf file.";
      return;
    }

    statusEl.style.color = "#60a5fa";
    statusEl.innerText = `Uploading and parsing ${file.name}...`;

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch(`${BACKEND_URL}/api/resume/upload-pdf`, {
        method: "POST",
        body: formData
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Failed to parse PDF");
      }

      const data = await res.json();
      document.getElementById("cfg-resume").value = data.extracted_text;
      document.getElementById("detected-role").innerText = data.detected_role || "Software Engineer";
      document.getElementById("detected-skills").innerText = (data.detected_skills || []).join(", ") || "General Tech Stack";

      statusEl.style.color = "#34d399";
      statusEl.innerText = `✓ Loaded ${file.name} (${data.char_count} chars). Saved to DuckDB!`;
      setTimeout(() => { statusEl.innerText = ""; }, 4000);
    } catch (e) {
      statusEl.style.color = "#f87171";
      statusEl.innerText = `Error: ${e.message}`;
    }
  }
}

function setupDirectMatcher() {
  let activeMode = "pdf";
  const btnPdf = document.getElementById("btn-mode-pdf");
  const btnText = document.getElementById("btn-mode-text");
  const containerPdf = document.getElementById("matcher-pdf-container");
  const containerText = document.getElementById("matcher-text-container");
  const dropzone = document.getElementById("matcher-pdf-dropzone");
  const fileInput = document.getElementById("matcher-pdf-input");
  const fileNameEl = document.getElementById("matcher-file-name");
  const textInput = document.getElementById("matcher-text-input");
  const runBtn = document.getElementById("run-match-btn");
  const feedbackEl = document.getElementById("matcher-feedback");
  const resultCard = document.getElementById("matcher-result-card");
  const noteTextarea = document.getElementById("matcher-res-note");
  const charCountEl = document.getElementById("matcher-char-count");
  const copyBtn = document.getElementById("matcher-copy-btn");

  if (!btnPdf || !runBtn) return;

  let selectedPdfFile = null;

  btnPdf.addEventListener("click", () => {
    activeMode = "pdf";
    btnPdf.classList.add("active");
    btnText.classList.remove("active");
    containerPdf.style.display = "block";
    containerText.style.display = "none";
  });

  btnText.addEventListener("click", () => {
    activeMode = "text";
    btnText.classList.add("active");
    btnPdf.classList.remove("active");
    containerText.style.display = "block";
    containerPdf.style.display = "none";
  });

  dropzone.addEventListener("click", () => fileInput.click());

  dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.classList.add("dragover");
  });

  dropzone.addEventListener("dragleave", () => {
    dropzone.classList.remove("dragover");
  });

  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("dragover");
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      selectedPdfFile = e.dataTransfer.files[0];
      fileNameEl.innerText = `Selected: ${selectedPdfFile.name}`;
    }
  });

  fileInput.addEventListener("change", () => {
    if (fileInput.files && fileInput.files.length > 0) {
      selectedPdfFile = fileInput.files[0];
      fileNameEl.innerText = `Selected: ${selectedPdfFile.name}`;
    }
  });

  noteTextarea.addEventListener("input", () => {
    const len = noteTextarea.value.length;
    charCountEl.innerText = `${len} / 300`;
    charCountEl.style.color = len > 300 ? "#f87171" : "#9ca3af";
  });

  copyBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(noteTextarea.value);
      const originalText = copyBtn.innerText;
      copyBtn.innerText = "✓ Copied!";
      copyBtn.style.background = "#059669";
      setTimeout(() => {
        copyBtn.innerText = originalText;
        copyBtn.style.background = "#374151";
      }, 2000);
    } catch {
      noteTextarea.select();
      document.execCommand("copy");
    }
  });

  runBtn.addEventListener("click", async () => {
    feedbackEl.innerText = "";
    resultCard.style.display = "none";

    if (activeMode === "pdf") {
      if (!selectedPdfFile) {
        feedbackEl.style.color = "#f87171";
        feedbackEl.innerText = "Please select or drop a profile PDF file first.";
        return;
      }
      runBtn.disabled = true;
      runBtn.innerText = "Running Laya Evaluation...";

      try {
        const formData = new FormData();
        formData.append("file", selectedPdfFile);
        formData.append("save_to_db", "true");

        const res = await fetch(`${BACKEND_URL}/api/profile/match-pdf`, {
          method: "POST",
          body: formData
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.detail || "Evaluation failed");
        }

        const data = await res.json();
        renderMatchResult(data);
      } catch (err) {
        feedbackEl.style.color = "#f87171";
        feedbackEl.innerText = `Error: ${err.message}`;
      } finally {
        runBtn.disabled = false;
        runBtn.innerText = "Run Laya Match";
      }
    } else {
      const rawText = textInput.value.trim();
      if (!rawText) {
        feedbackEl.style.color = "#f87171";
        feedbackEl.innerText = "Please paste candidate/profile text to compare.";
        return;
      }
      runBtn.disabled = true;
      runBtn.innerText = "Running Laya Evaluation...";

      try {
        const res = await fetch(`${BACKEND_URL}/api/profile/match-text`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            raw_text: rawText,
            save_to_db: true
          })
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.detail || "Evaluation failed");
        }

        const data = await res.json();
        renderMatchResult(data);
      } catch (err) {
        feedbackEl.style.color = "#f87171";
        feedbackEl.innerText = `Error: ${err.message}`;
      } finally {
        runBtn.disabled = false;
        runBtn.innerText = "Run Laya Match";
      }
    }
  });

  function renderMatchResult(data) {
    resultCard.style.display = "block";
    const profile = data.profile || {};
    const evaluation = data.evaluation || {};
    const score = Math.round(evaluation.match_score || 0);

    document.getElementById("matcher-res-name").innerText = profile.name || "Candidate";
    document.getElementById("matcher-res-score").innerText = `${score}% Match`;
    document.getElementById("matcher-res-score").style.color = score >= 70 ? "#34d399" : score >= 50 ? "#fbbf24" : "#9ca3af";

    const personaEl = document.getElementById("matcher-res-persona");
    personaEl.innerText = evaluation.persona || "Professional";

    const headlineText = (profile.headline || "") + (profile.current_company ? ` at ${profile.current_company}` : "");
    document.getElementById("matcher-res-headline").innerText = headlineText || "No headline provided";

    const note = data.suggested_note || "";
    noteTextarea.value = note;
    charCountEl.innerText = `${note.length} / 300`;
    charCountEl.style.color = note.length > 300 ? "#f87171" : "#9ca3af";
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
        feedbackEl.innerText = "Please enter search keywords or select a preset.";
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
