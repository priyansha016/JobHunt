/**
 * JobHunt Full Auto-Pilot: LinkedIn Search & Connection Automation
 * Powered by Laya (System 1 Decision Engine) and DuckDB.
 *
 * Runs strictly on: https://www.linkedin.com/search/results/people/*
 * Automatically iterates through search results, evaluates candidates with Laya,
 * and sends personalized pitch notes (<300 chars) with human safety jitter.
 */

const BACKEND_URL = "http://127.0.0.1:8765";

let autopilotState = {
  isRunning: false,
  isPaused: false,
  minScore: 65,
  dailyCap: 15,
  sentToday: 0,
  skippedCount: 0,
  currentIndex: 0,
  countdownTimer: null
};

// Initialize only on LinkedIn People Search
if (window.location.pathname.includes("/search/results/people")) {
  initSearchAutopilot();
}

// Watch for single-page app URL changes
let lastUrl = location.href;
new MutationObserver(() => {
  const url = location.href;
  if (url !== lastUrl) {
    lastUrl = url;
    if (url.includes("/search/results/people")) {
      setTimeout(initSearchAutopilot, 1500);
    }
  }
}).observe(document, { subtree: true, childList: true });

function initSearchAutopilot() {
  if (document.getElementById("jobhunt-autopilot-hud")) return;
  loadStoredDailyStats();
  injectAutopilotHUD();
}

function loadStoredDailyStats() {
  const todayKey = `jobhunt_autopilot_${new Date().toISOString().split("T")[0]}`;
  try {
    const saved = localStorage.getItem(todayKey);
    if (saved) {
      autopilotState.sentToday = parseInt(saved, 10) || 0;
    }
  } catch (e) {
    console.warn("Storage read error", e);
  }
}

function recordInviteSent() {
  autopilotState.sentToday++;
  const todayKey = `jobhunt_autopilot_${new Date().toISOString().split("T")[0]}`;
  try {
    localStorage.setItem(todayKey, autopilotState.sentToday.toString());
  } catch (e) {}
  updateHUDStats();
}

function injectAutopilotHUD() {
  if (document.getElementById("jobhunt-autopilot-hud")) return;

  const hud = document.createElement("div");
  hud.id = "jobhunt-autopilot-hud";
  hud.innerHTML = `
    <div class="hud-header" id="hud-drag-handle">
      <div class="hud-title">
        <span>⚡ Auto-Pilot</span>
        <span class="hud-badge idle" id="hud-status-badge">Idle</span>
      </div>
      <div style="display: flex; gap: 6px; align-items: center;">
        <button id="hud-settings-toggle" style="background:transparent; border:none; color:#9ca3af; cursor:pointer; font-size:12px;">⚙️</button>
        <button id="hud-collapse-btn" style="background:transparent; border:none; color:#9ca3af; cursor:pointer; font-size:13px;">—</button>
      </div>
    </div>

    <div class="hud-body">
      <div class="hud-status-banner" id="hud-status-text">
        Ready. Set keywords and click Start to auto-connect with high-match peers.
      </div>

      <div class="hud-stats-grid">
        <div class="hud-stat-box">
          <span class="hud-stat-num sent" id="hud-sent-val">${autopilotState.sentToday}</span>
          <span class="hud-stat-lbl">Sent / ${autopilotState.dailyCap}</span>
        </div>
        <div class="hud-stat-box">
          <span class="hud-stat-num skipped" id="hud-skip-val">0</span>
          <span class="hud-stat-lbl">Skipped</span>
        </div>
        <div class="hud-stat-box">
          <span class="hud-stat-num" id="hud-score-val">${autopilotState.minScore}%</span>
          <span class="hud-stat-lbl">Min Match</span>
        </div>
      </div>

      <div class="hud-target-card" id="hud-target-preview" style="display: none;">
        <div class="hud-target-name" id="hud-target-name">Target Candidate</div>
        <div class="hud-target-headline" id="hud-target-headline">Headline...</div>
        <div class="hud-target-match">
          <span id="hud-target-persona" style="color: #60a5fa; font-weight: 600;">Evaluating...</span>
          <strong id="hud-target-score" style="color: #34d399;">--%</strong>
        </div>
      </div>

      <div class="hud-controls">
        <button class="hud-btn start" id="hud-start-btn">▶️ Start Auto-Pilot</button>
        <button class="hud-btn pause" id="hud-pause-btn" style="display: none;">⏸️ Pause</button>
        <button class="hud-btn stop" id="hud-stop-btn" style="display: none;">⏹️ Stop</button>
      </div>

      <div class="hud-settings" id="hud-settings-panel">
        <div class="hud-setting-row">
          <span>Min Match Score (%):</span>
          <input type="number" class="hud-setting-input" id="hud-cfg-minscore" min="40" max="95" value="${autopilotState.minScore}">
        </div>
        <div class="hud-setting-row">
          <span>Daily Safe Cap:</span>
          <input type="number" class="hud-setting-input" id="hud-cfg-dailycap" min="5" max="35" value="${autopilotState.dailyCap}">
        </div>
        <div style="font-size: 10px; color: #94a3b8; margin-top: 4px; line-height: 1.3;">
          Enforces 7–14s human jitter and strictly &le;300 char pitches to keep account 100% safe.
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(hud);
  setupHUDEvents(hud);
}

function setupHUDEvents(hud) {
  const startBtn = document.getElementById("hud-start-btn");
  const pauseBtn = document.getElementById("hud-pause-btn");
  const stopBtn = document.getElementById("hud-stop-btn");
  const collapseBtn = document.getElementById("hud-collapse-btn");
  const settingsToggle = document.getElementById("hud-settings-toggle");
  const settingsPanel = document.getElementById("hud-settings-panel");

  collapseBtn.addEventListener("click", () => {
    hud.classList.toggle("collapsed");
    collapseBtn.innerText = hud.classList.contains("collapsed") ? "+" : "—";
  });

  settingsToggle.addEventListener("click", () => {
    settingsPanel.classList.toggle("open");
  });

  document.getElementById("hud-cfg-minscore").addEventListener("change", (e) => {
    autopilotState.minScore = parseInt(e.target.value, 10) || 65;
    document.getElementById("hud-score-val").innerText = `${autopilotState.minScore}%`;
  });

  document.getElementById("hud-cfg-dailycap").addEventListener("change", (e) => {
    autopilotState.dailyCap = parseInt(e.target.value, 10) || 15;
    updateHUDStats();
  });

  startBtn.addEventListener("click", startAutopilot);
  pauseBtn.addEventListener("click", togglePause);
  stopBtn.addEventListener("click", stopAutopilot);

  // Simple drag support
  let isDragging = false, startX, startY, initLeft, initTop;
  const header = document.getElementById("hud-drag-handle");
  header.addEventListener("mousedown", (e) => {
    if (e.target.tagName === "BUTTON") return;
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    const rect = hud.getBoundingClientRect();
    initLeft = rect.left;
    initTop = rect.top;
    header.style.cursor = "grabbing";
  });

  window.addEventListener("mousemove", (e) => {
    if (!isDragging) return;
    hud.style.right = "auto";
    hud.style.left = `${initLeft + (e.clientX - startX)}px`;
    hud.style.top = `${initTop + (e.clientY - startY)}px`;
  });

  window.addEventListener("mouseup", () => {
    isDragging = false;
    header.style.cursor = "grab";
  });
}

function updateHUDStatus(badgeClass, badgeText, bannerText) {
  const badge = document.getElementById("hud-status-badge");
  const banner = document.getElementById("hud-status-text");
  if (badge) {
    badge.className = `hud-badge ${badgeClass}`;
    badge.innerText = badgeText;
  }
  if (banner) {
    banner.innerText = bannerText;
  }
}

function updateHUDStats() {
  const sentEl = document.getElementById("hud-sent-val");
  const skipEl = document.getElementById("hud-skip-val");
  if (sentEl) sentEl.innerText = autopilotState.sentToday;
  if (skipEl) skipEl.innerText = autopilotState.skippedCount;
}

function startAutopilot() {
  if (autopilotState.sentToday >= autopilotState.dailyCap) {
    alert(`Daily safe connection limit (${autopilotState.dailyCap}) already reached for today. Rest up to keep your account 100% safe!`);
    return;
  }

  autopilotState.isRunning = true;
  autopilotState.isPaused = false;
  autopilotState.currentIndex = 0;

  document.getElementById("hud-start-btn").style.display = "none";
  document.getElementById("hud-pause-btn").style.display = "flex";
  document.getElementById("hud-stop-btn").style.display = "flex";
  document.getElementById("hud-target-preview").style.display = "block";

  updateHUDStatus("running", "Running", "Scanning search result cards on this page...");
  processNextCandidateCard();
}

function togglePause() {
  if (!autopilotState.isRunning) return;
  autopilotState.isPaused = !autopilotState.isPaused;
  const pauseBtn = document.getElementById("hud-pause-btn");

  if (autopilotState.isPaused) {
    pauseBtn.innerText = "▶️ Resume";
    updateHUDStatus("paused", "Paused", "Auto-Pilot paused. Click Resume to continue.");
  } else {
    pauseBtn.innerText = "⏸️ Pause";
    updateHUDStatus("running", "Running", "Resuming candidate processing...");
    processNextCandidateCard();
  }
}

function stopAutopilot() {
  autopilotState.isRunning = false;
  autopilotState.isPaused = false;
  if (autopilotState.countdownTimer) clearInterval(autopilotState.countdownTimer);

  document.getElementById("hud-start-btn").style.display = "flex";
  document.getElementById("hud-pause-btn").style.display = "none";
  document.getElementById("hud-stop-btn").style.display = "none";
  document.getElementById("hud-target-preview").style.display = "none";

  // Clean card highlights
  document.querySelectorAll(".jobhunt-card-processing").forEach(el => el.classList.remove("jobhunt-card-processing"));

  updateHUDStatus("idle", "Idle", "Auto-Pilot stopped. Click Start anytime.");
}

async function processNextCandidateCard() {
  if (!autopilotState.isRunning || autopilotState.isPaused) return;

  if (autopilotState.sentToday >= autopilotState.dailyCap) {
    updateHUDStatus("idle", "Completed", `🎉 Daily cap of ${autopilotState.dailyCap} invites reached! Stopping safely.`);
    stopAutopilot();
    return;
  }

  const cards = getCandidateCards();
  if (autopilotState.currentIndex >= cards.length) {
    // Current page finished! Try pagination
    updateHUDStatus("waiting", "Next Page", "Processed all candidates on page. Navigating to next page...");
    await handlePagination();
    return;
  }

  const card = cards[autopilotState.currentIndex];
  autopilotState.currentIndex++;

  // Clear previous active card outlines
  document.querySelectorAll(".jobhunt-card-processing").forEach(el => el.classList.remove("jobhunt-card-processing"));
  card.classList.add("jobhunt-card-processing");
  card.scrollIntoView({ behavior: "smooth", block: "center" });

  const candidateData = extractCandidateFromCard(card);
  if (!candidateData || !candidateData.connectButton) {
    card.classList.add("jobhunt-card-skipped");
    autopilotState.skippedCount++;
    updateHUDStats();
    await sleep(800);
    processNextCandidateCard();
    return;
  }

  // Update target preview on HUD
  document.getElementById("hud-target-name").innerText = candidateData.name;
  document.getElementById("hud-target-headline").innerText = candidateData.headline || candidateData.company || "Candidate";
  document.getElementById("hud-target-persona").innerText = "Evaluating with Laya...";
  document.getElementById("hud-target-score").innerText = "--%";

  updateHUDStatus("running", "Evaluating", `Evaluating ${candidateData.name} against your resume...`);

  // Call Laya backend
  let evalResult = null;
  try {
    const res = await fetch(`${BACKEND_URL}/api/profile/evaluate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        linkedin_url: candidateData.profileUrl || `https://linkedin.com/search-result-${Date.now()}`,
        name: candidateData.name,
        headline: candidateData.headline,
        current_company: candidateData.company,
        location: candidateData.location,
        about: candidateData.headline
      })
    });

    if (res.ok) {
      evalResult = await res.json();
    }
  } catch (err) {
    console.warn("Backend evaluation error:", err);
  }

  if (!evalResult) {
    card.classList.add("jobhunt-card-skipped");
    autopilotState.skippedCount++;
    updateHUDStats();
    await sleep(1000);
    processNextCandidateCard();
    return;
  }

  const score = Math.round(evalResult.evaluation.match_score || 0);
  const persona = evalResult.evaluation.persona || "Peer";
  const note = evalResult.suggested_note || "";

  document.getElementById("hud-target-persona").innerText = persona;
  document.getElementById("hud-target-score").innerText = `${score}%`;

  // Attach visual badge to card
  attachCardBadge(card, score, persona);

  if (score >= autopilotState.minScore) {
    updateHUDStatus("running", "Connecting", `Match: ${score}% >= ${autopilotState.minScore}%. Sending pitch to ${candidateData.name}...`);
    const success = await executeConnectionWithNote(candidateData.connectButton, note);

    if (success) {
      recordInviteSent();
      card.classList.remove("jobhunt-card-processing");
      card.classList.add("jobhunt-card-connected");

      // Log sent status in backend DuckDB
      if (evalResult.profile && evalResult.profile.profile_id) {
        fetch(`${BACKEND_URL}/api/profile/status`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            profile_id: evalResult.profile.profile_id,
            status: "sent"
          })
        }).catch(() => {});
      }

      // Safe Human Jitter Delay (7 - 14 seconds)
      const jitterMs = Math.floor(Math.random() * (14000 - 7000 + 1)) + 7000;
      await runCountdown(jitterMs, `Sent invite to ${candidateData.name}. Jitter delay:`);
    } else {
      card.classList.add("jobhunt-card-skipped");
      autopilotState.skippedCount++;
      updateHUDStats();
      await sleep(1500);
    }
  } else {
    updateHUDStatus("running", "Skipped", `Score ${score}% < ${autopilotState.minScore}% threshold. Skipping.`);
    card.classList.add("jobhunt-card-skipped");
    autopilotState.skippedCount++;
    updateHUDStats();
    await sleep(1500);
  }

  processNextCandidateCard();
}

function getCandidateCards() {
  const selectors = [
    "li.reusable-search__result-container",
    "div.entity-result",
    "div[data-view-name='search-entity-result-universal-template']",
    "ul.reusable-search__entity-result-list > li"
  ];

  for (const s of selectors) {
    const list = Array.from(document.querySelectorAll(s));
    if (list.length > 0) return list;
  }
  return [];
}

function extractCandidateFromCard(card) {
  // 1. Name & Profile URL
  const nameLink = card.querySelector("a.app-aware-link") || card.querySelector("span[aria-hidden='true']");
  if (!nameLink) return null;

  let name = "";
  const nameSpan = card.querySelector("span[aria-hidden='true']");
  if (nameSpan) {
    name = nameSpan.innerText.trim();
  } else if (nameLink.innerText) {
    name = nameLink.innerText.split("\n")[0].trim();
  }

  // Exclude LinkedIn Member (private)
  if (!name || name.toLowerCase().includes("linkedin member")) return null;

  const profileUrl = (card.querySelector("a[href*='/in/']") || {}).href || "";

  // 2. Headline & Subtitle
  const headlineEl = card.querySelector(".entity-result__primary-subtitle") || 
                     card.querySelector(".t-14.t-black.t-normal") ||
                     card.querySelector(".entity-result__summary");
  const headline = headlineEl ? headlineEl.innerText.trim() : "";

  // 3. Location / Secondary Subtitle
  const locEl = card.querySelector(".entity-result__secondary-subtitle");
  const location = locEl ? locEl.innerText.trim() : "";

  // Extract company from headline or secondary
  let company = "";
  const atMatch = headline.match(/(?:at|@|\|)\s+([A-Za-z0-9\s&.,'-]+)/i);
  if (atMatch) {
    company = atMatch[1].trim();
  }

  // 4. Find Connect button
  const buttons = Array.from(card.querySelectorAll("button"));
  let connectButton = null;

  for (const b of buttons) {
    const txt = (b.innerText || "").toLowerCase().trim();
    const aria = (b.getAttribute("aria-label") || "").toLowerCase();

    if ((txt === "connect" || aria.includes("invite") && aria.includes("to connect")) && 
        !txt.includes("pending") && !txt.includes("message") && !b.disabled) {
      connectButton = b;
      break;
    }
  }

  return {
    name,
    headline,
    company,
    location,
    profileUrl,
    connectButton
  };
}

function attachCardBadge(card, score, persona) {
  let badge = card.querySelector(".jobhunt-eval-badge");
  if (!badge) {
    badge = document.createElement("div");
    card.style.position = "relative";
    card.appendChild(badge);
  }
  const isHigh = score >= autopilotState.minScore;
  badge.className = `jobhunt-eval-badge ${isHigh ? "match-high" : "match-low"}`;
  badge.innerText = `Laya: ${score}% (${persona.split("/")[0].trim()})`;
}

async function executeConnectionWithNote(connectBtn, note) {
  try {
    // Click Connect button
    connectBtn.click();
    await sleep(1200);

    // Look for connection modal
    const modal = document.querySelector(".artdeco-modal") || document.querySelector("div[role='dialog']");
    if (!modal) {
      // Direct connection sent without modal
      return true;
    }

    // Look for "Add a note" button
    const modalButtons = Array.from(modal.querySelectorAll("button"));
    const addNoteBtn = modalButtons.find(b => {
      const txt = (b.innerText || "").toLowerCase();
      const aria = (b.getAttribute("aria-label") || "").toLowerCase();
      return txt.includes("add a note") || aria.includes("add a note");
    });

    if (addNoteBtn) {
      addNoteBtn.click();
      await sleep(500);

      const textarea = modal.querySelector("textarea[name='message']") || 
                       modal.querySelector("#custom-message") ||
                       modal.querySelector("textarea");

      if (textarea && note) {
        // Enforce strictly <= 300 chars
        const safeNote = note.slice(0, 298);
        textarea.value = safeNote;
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
        textarea.dispatchEvent(new Event("change", { bubbles: true }));
        await sleep(400);
      }
    }

    // Look for "Send invitation" button in modal
    const updatedButtons = Array.from(modal.querySelectorAll("button"));
    const sendBtn = updatedButtons.find(b => {
      const txt = (b.innerText || "").toLowerCase();
      const aria = (b.getAttribute("aria-label") || "").toLowerCase();
      return (txt.includes("send") || aria.includes("send invitation")) && !b.disabled;
    });

    if (sendBtn) {
      sendBtn.click();
      await sleep(800);
      return true;
    }

    // If modal requires email or is blocked, close modal safely
    const dismissBtn = modal.querySelector("button[aria-label='Dismiss']") || modal.querySelector("button[aria-label='Close']");
    if (dismissBtn) dismissBtn.click();
    return false;
  } catch (e) {
    console.warn("Connection send error:", e);
    return false;
  }
}

async function handlePagination() {
  const nextBtn = document.querySelector("button[aria-label='Next']") || 
                  document.querySelector(".artdeco-pagination__button--next");

  if (nextBtn && !nextBtn.disabled) {
    await runCountdown(5000, "Navigating to next search page in:");
    nextBtn.click();
    autopilotState.currentIndex = 0;
    await sleep(3500);
    processNextCandidateCard();
  } else {
    updateHUDStatus("idle", "Completed", "Reached the end of search results!");
    stopAutopilot();
  }
}

function runCountdown(durationMs, prefixText) {
  return new Promise((resolve) => {
    let remaining = Math.ceil(durationMs / 1000);
    updateHUDStatus("waiting", "Safety Jitter", `${prefixText} ${remaining}s`);

    autopilotState.countdownTimer = setInterval(() => {
      remaining--;
      if (remaining <= 0) {
        clearInterval(autopilotState.countdownTimer);
        resolve();
      } else {
        updateHUDStatus("waiting", "Safety Jitter", `${prefixText} ${remaining}s`);
      }
    }, 1000);
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
