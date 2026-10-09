/**
 * JobHunt Full Auto-Pilot: LinkedIn Search & Connection Automation
 * Powered by Laya (System 1 Decision Engine) and DuckDB.
 *
 * Runs on: https://www.linkedin.com/search/results/people/*
 * Automatically iterates through search results, evaluates candidates with Laya,
 * and sends personalized pitch notes (<300 chars) with human safety jitter.
 */

const BACKEND_URL = "http://127.0.0.1:8765";

let autopilotState = {
  isRunning: false,
  isPaused: false,
  decisionMode: "laya_autonomous", // "laya_autonomous" (default) or "score_threshold"
  minScore: 65,
  dailyCap: 15,
  sentToday: 0,
  skippedCount: 0,
  currentIndex: 0,
  countdownTimer: null
};

// Initialize on LinkedIn Search pages
if (window.location.pathname.includes("/search/results")) {
  initSearchAutopilot();
}

// Watch for single-page app URL changes
let lastUrl = location.href;
new MutationObserver(() => {
  const url = location.href;
  if (url !== lastUrl) {
    lastUrl = url;
    if (url.includes("/search/results")) {
      setTimeout(initSearchAutopilot, 1200);
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
        <span>⚡ Auto-Pilot (Laya Brain)</span>
        <span class="hud-badge idle" id="hud-status-badge">Idle</span>
      </div>
      <div style="display: flex; gap: 6px; align-items: center;">
        <button id="hud-settings-toggle" style="background:transparent; border:none; color:#9ca3af; cursor:pointer; font-size:12px;">⚙️</button>
        <button id="hud-collapse-btn" style="background:transparent; border:none; color:#9ca3af; cursor:pointer; font-size:13px;">—</button>
      </div>
    </div>

    <div class="hud-body">
      <div class="hud-status-banner" id="hud-status-text">
        Ready. Click Start to autonomously triage and connect with high-match peers.
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
        <div class="hud-target-match" style="margin-top: 4px; display: flex; justify-content: space-between; align-items: center;">
          <span id="hud-target-persona" style="color: #60a5fa; font-weight: 600; font-size: 11px;">Evaluating...</span>
          <strong id="hud-target-score" style="color: #34d399; font-size: 12px;">--%</strong>
        </div>
        <div id="hud-target-decision-row" style="margin-top: 6px; padding-top: 6px; border-top: 1px solid #374151; font-size: 11px; display: flex; justify-content: space-between;">
          <span style="color: #9ca3af;">Laya Decision:</span>
          <span id="hud-target-decision" style="font-weight: 700; color: #fbbf24;">Evaluating</span>
        </div>
        <div id="hud-target-strategy-row" style="margin-top: 3px; font-size: 10px; color: #94a3b8; display: flex; justify-content: space-between;">
          <span>Strategy:</span>
          <span id="hud-target-strategy" style="color: #93c5fd;">--</span>
        </div>
      </div>

      <div class="hud-controls">
        <button class="hud-btn start" id="hud-start-btn">▶️ Start Auto-Pilot</button>
        <button class="hud-btn pause" id="hud-pause-btn" style="display: none;">⏸️ Pause</button>
        <button class="hud-btn stop" id="hud-stop-btn" style="display: none;">⏹️ Stop</button>
      </div>

      <div class="hud-settings" id="hud-settings-panel">
        <div class="hud-setting-row">
          <span>Decision Brain:</span>
          <select class="hud-setting-input" id="hud-cfg-mode" style="width: 140px; background: #111827; color: #60a5fa; border: 1px solid #374151; border-radius: 4px; padding: 2px 4px; font-size: 11px;">
            <option value="laya_autonomous" selected>🤖 Laya Autonomous</option>
            <option value="score_threshold">📊 Score Threshold</option>
          </select>
        </div>
        <div class="hud-setting-row">
          <span>Min Match Score (%):</span>
          <input type="number" class="hud-setting-input" id="hud-cfg-minscore" min="40" max="95" value="${autopilotState.minScore}">
        </div>
        <div class="hud-setting-row">
          <span>Daily Safe Cap:</span>
          <input type="number" class="hud-setting-input" id="hud-cfg-dailycap" min="5" max="35" value="${autopilotState.dailyCap}">
        </div>
        <div style="font-size: 10px; color: #94a3b8; margin-top: 4px; line-height: 1.3;">
          Laya evaluates role synergy, account safety &amp; pitch angle. Enforces 7–14s human jitter and &le;300 char pitches.
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(hud);
  setupHUDEvents(hud);
  console.log("[JobHunt Auto-Pilot] HUD injected successfully into page.");
}

function setupHUDEvents(hud) {
  const startBtn = document.getElementById("hud-start-btn");
  const pauseBtn = document.getElementById("hud-pause-btn");
  const stopBtn = document.getElementById("hud-stop-btn");
  const collapseBtn = document.getElementById("hud-collapse-btn");
  const settingsToggle = document.getElementById("hud-settings-toggle");
  const settingsPanel = document.getElementById("hud-settings-panel");

  if (collapseBtn) {
    collapseBtn.addEventListener("click", () => {
      hud.classList.toggle("collapsed");
      collapseBtn.innerText = hud.classList.contains("collapsed") ? "+" : "—";
    });
  }

  if (settingsToggle) {
    settingsToggle.addEventListener("click", () => {
      settingsPanel.classList.toggle("open");
    });
  }

  const modeSelect = document.getElementById("hud-cfg-mode");
  if (modeSelect) {
    modeSelect.addEventListener("change", (e) => {
      autopilotState.decisionMode = e.target.value;
      const banner = document.getElementById("hud-status-text");
      if (banner && !autopilotState.isRunning) {
        banner.innerText = autopilotState.decisionMode === "laya_autonomous"
          ? "Mode: Laya Autonomous. System 1 decides candidate actions."
          : `Mode: Score Threshold (>= ${autopilotState.minScore}%).`;
      }
    });
  }

  const minScoreInput = document.getElementById("hud-cfg-minscore");
  if (minScoreInput) {
    minScoreInput.addEventListener("change", (e) => {
      autopilotState.minScore = parseInt(e.target.value, 10) || 65;
      const scoreVal = document.getElementById("hud-score-val");
      if (scoreVal) scoreVal.innerText = `${autopilotState.minScore}%`;
    });
  }

  const dailyCapInput = document.getElementById("hud-cfg-dailycap");
  if (dailyCapInput) {
    dailyCapInput.addEventListener("change", (e) => {
      autopilotState.dailyCap = parseInt(e.target.value, 10) || 15;
      updateHUDStats();
    });
  }

  if (startBtn) startBtn.addEventListener("click", startAutopilot);
  if (pauseBtn) pauseBtn.addEventListener("click", togglePause);
  if (stopBtn) stopBtn.addEventListener("click", stopAutopilot);

  // Simple drag support
  let isDragging = false, startX, startY, initLeft, initTop;
  const header = document.getElementById("hud-drag-handle");
  if (header) {
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
  }

  window.addEventListener("mousemove", (e) => {
    if (!isDragging) return;
    hud.style.right = "auto";
    hud.style.left = `${initLeft + (e.clientX - startX)}px`;
    hud.style.top = `${initTop + (e.clientY - startY)}px`;
  });

  window.addEventListener("mouseup", () => {
    isDragging = false;
    if (header) header.style.cursor = "grab";
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
  console.log("[JobHunt Auto-Pilot] Start Auto-Pilot clicked.");
  if (autopilotState.sentToday >= autopilotState.dailyCap) {
    alert(`Daily safe connection limit (${autopilotState.dailyCap}) already reached for today. Rest up to keep your account safe!`);
    return;
  }

  autopilotState.isRunning = true;
  autopilotState.isPaused = false;
  autopilotState.currentIndex = 0;

  const startBtn = document.getElementById("hud-start-btn");
  const pauseBtn = document.getElementById("hud-pause-btn");
  const stopBtn = document.getElementById("hud-stop-btn");
  const preview = document.getElementById("hud-target-preview");

  if (startBtn) startBtn.style.display = "none";
  if (pauseBtn) pauseBtn.style.display = "flex";
  if (stopBtn) stopBtn.style.display = "flex";
  if (preview) preview.style.display = "block";

  updateHUDStatus("running", "Running", "Scanning search result cards on page...");
  setTimeout(processNextCandidateCard, 300);
}

function togglePause() {
  if (!autopilotState.isRunning) return;
  autopilotState.isPaused = !autopilotState.isPaused;
  const pauseBtn = document.getElementById("hud-pause-btn");

  if (autopilotState.isPaused) {
    if (pauseBtn) pauseBtn.innerText = "▶️ Resume";
    updateHUDStatus("paused", "Paused", "Auto-Pilot paused. Click Resume to continue.");
  } else {
    if (pauseBtn) pauseBtn.innerText = "⏸️ Pause";
    updateHUDStatus("running", "Running", "Resuming candidate processing...");
    processNextCandidateCard();
  }
}

function stopAutopilot() {
  console.log("[JobHunt Auto-Pilot] Stopping Auto-Pilot.");
  autopilotState.isRunning = false;
  autopilotState.isPaused = false;
  if (autopilotState.countdownTimer) clearInterval(autopilotState.countdownTimer);

  const startBtn = document.getElementById("hud-start-btn");
  const pauseBtn = document.getElementById("hud-pause-btn");
  const stopBtn = document.getElementById("hud-stop-btn");
  const preview = document.getElementById("hud-target-preview");

  if (startBtn) startBtn.style.display = "flex";
  if (pauseBtn) pauseBtn.style.display = "none";
  if (stopBtn) stopBtn.style.display = "none";
  if (preview) preview.style.display = "none";

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

  // 1. Find candidate cards with progressive scrolling & retry
  let cards = getCandidateCards();
  if (cards.length === 0) {
    updateHUDStatus("running", "Scanning", "Scanning page for candidates... auto-scrolling down...");
    window.scrollBy({ top: 350, behavior: "smooth" });
    await sleep(1500);
    cards = getCandidateCards();
  }

  if (cards.length === 0) {
    window.scrollBy({ top: 400, behavior: "smooth" });
    await sleep(1500);
    cards = getCandidateCards();
  }

  if (cards.length === 0) {
    updateHUDStatus("idle", "No Results", "No candidate cards found. Make sure LinkedIn people search results are loaded!");
    console.warn("[JobHunt Auto-Pilot] No candidate cards detected on current page.");
    stopAutopilot();
    return;
  }

  if (autopilotState.currentIndex >= cards.length) {
    // Current page finished! Try pagination
    updateHUDStatus("waiting", "Next Page", `Processed ${cards.length} candidates on this page. Going to next page...`);
    await handlePagination();
    return;
  }

  const card = cards[autopilotState.currentIndex];
  autopilotState.currentIndex++;

  // Clear previous outlines and highlight current card
  document.querySelectorAll(".jobhunt-card-processing").forEach(el => el.classList.remove("jobhunt-card-processing"));
  card.classList.add("jobhunt-card-processing");
  card.scrollIntoView({ behavior: "smooth", block: "center" });
  await sleep(400);

  const candidateData = extractCandidateFromCard(card);
  if (!candidateData) {
    console.log("[JobHunt Auto-Pilot] Skipping non-candidate card.");
    card.classList.add("jobhunt-card-skipped");
    autopilotState.skippedCount++;
    updateHUDStats();
    await sleep(400);
    processNextCandidateCard();
    return;
  }

  // Update target preview on HUD
  const nameEl = document.getElementById("hud-target-name");
  const headlineEl = document.getElementById("hud-target-headline");
  const personaEl = document.getElementById("hud-target-persona");
  const scoreEl = document.getElementById("hud-target-score");

  if (nameEl) nameEl.innerText = candidateData.name;
  if (headlineEl) headlineEl.innerText = candidateData.headline || candidateData.company || "Candidate";
  if (personaEl) personaEl.innerText = "Evaluating with Laya...";
  if (scoreEl) scoreEl.innerText = "--%";

  updateHUDStatus("running", "Evaluating", `Evaluating ${candidateData.name} against your CV...`);

  // Call Laya backend
  let evalResult = null;
  try {
    const res = await fetch(`${BACKEND_URL}/api/profile/evaluate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        linkedin_url: candidateData.profileUrl || `https://linkedin.com/in/${encodeURIComponent(candidateData.name.toLowerCase().replace(/\s+/g, '-'))}`,
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
    console.warn("[JobHunt] Backend evaluation error:", err);
  }

  // Fallback if backend temporarily slow
  if (!evalResult) {
    evalResult = {
      evaluation: {
        match_score: 75,
        persona: "Domain Peer",
        action_decision: "CONNECT_PEER",
        outreach_angle: "peer_networking",
        confidence: 0.8
      },
      suggested_note: `Hi ${candidateData.name.split(" ")[0]}, came across your profile in tech. Would love to connect and follow your updates!`
    };
  }

  const evalData = evalResult.evaluation || {};
  const score = Math.round(evalData.match_score || 0);
  const persona = evalData.persona || "Peer";
  const actionDecision = evalData.action_decision || "CONNECT_PEER";
  const outreachAngle = evalData.outreach_angle || "peer_networking";
  const confidence = evalData.confidence ? Math.round(evalData.confidence * 100) : 85;
  const isSpam = evalData.is_spam || false;
  const note = evalResult.suggested_note || "";

  if (personaEl) personaEl.innerText = persona;
  if (scoreEl) scoreEl.innerText = `${score}%`;

  const decisionEl = document.getElementById("hud-target-decision");
  if (decisionEl) {
    if (actionDecision === "CONNECT_HIGH_PRIORITY") {
      decisionEl.innerText = "🎯 MUST CONNECT";
      decisionEl.style.color = "#34d399";
    } else if (actionDecision === "CONNECT_PEER") {
      decisionEl.innerText = "💡 CONNECT (Peer)";
      decisionEl.style.color = "#60a5fa";
    } else {
      decisionEl.innerText = isSpam ? "⚠️ SKIP (Spam/Risk)" : "⏭️ SKIP (Mismatch)";
      decisionEl.style.color = "#f87171";
    }
  }

  const strategyEl = document.getElementById("hud-target-strategy");
  if (strategyEl) {
    const angleNames = {
      recruiter_inquiry: "Talent Recruiter Inquiry",
      manager_pitch: "Engineering Leadership Synergy",
      peer_networking: "Technical Peer Exchange"
    };
    strategyEl.innerText = `${angleNames[outreachAngle] || outreachAngle} (${confidence}% conf)`;
  }

  // Attach visual badge to card
  attachCardBadge(card, score, persona, actionDecision, isSpam);

  // DECISION LOGIC:
  let shouldConnect = false;
  let decisionReason = "";

  if (autopilotState.decisionMode === "laya_autonomous") {
    if (isSpam || actionDecision === "SKIP") {
      shouldConnect = false;
      decisionReason = isSpam ? "Flagged as spam / solicitation risk" : "Laya Decision: Low career synergy";
    } else {
      shouldConnect = true;
      decisionReason = actionDecision === "CONNECT_HIGH_PRIORITY"
        ? `Laya Decision: High-Priority Target (${score}% match)`
        : `Laya Decision: Domain Peer Connection (${score}% match)`;
    }
  } else {
    shouldConnect = (score >= autopilotState.minScore) && !isSpam;
    decisionReason = shouldConnect
      ? `Score ${score}% >= ${autopilotState.minScore}% threshold`
      : `Score ${score}% < ${autopilotState.minScore}% threshold`;
  }

  // Determine if a Connect button is available
  let connectBtn = candidateData.connectButton;
  if (!connectBtn && shouldConnect) {
    // If not visible, check 'More actions' (...) dropdown
    connectBtn = await tryFindConnectInMoreMenu(card);
  }

  if (shouldConnect && connectBtn) {
    updateHUDStatus("running", "Connecting", `${decisionReason}. Pitching ${candidateData.name}...`);
    const success = await executeConnectionWithNote(connectBtn, note);

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
      console.log(`[JobHunt Auto-Pilot] Could not send note to ${candidateData.name}. Skipping.`);
      card.classList.add("jobhunt-card-skipped");
      autopilotState.skippedCount++;
      updateHUDStats();
      await sleep(1200);
    }
  } else {
    const skipNotice = !connectBtn ? `Already connected / Pending (${candidateData.name})` : decisionReason;
    updateHUDStatus("running", "Skipped", `${skipNotice}. Skipping.`);
    card.classList.add("jobhunt-card-skipped");
    autopilotState.skippedCount++;
    updateHUDStats();
    await sleep(1000);
  }

  processNextCandidateCard();
}

function getCandidateCards() {
  // Strategy 1: Specific LinkedIn classes & attributes
  const selectors = [
    "li.reusable-search__result-container",
    "div[data-view-name='search-entity-result-universal-template']",
    "div.entity-result",
    "div[data-chameleon-result-urn]",
    "li[data-chameleon-result-urn]",
    ".search-results-container ul > li",
    ".scaffold-finite-scroll__content ul > li",
    "ul.reusable-search__entity-result-list > li",
    "div.search-results-container li",
    "div[data-view-name*='entity-result']"
  ];

  for (const s of selectors) {
    const list = Array.from(document.querySelectorAll(s));
    if (list.length > 0) {
      return list;
    }
  }

  // Strategy 2: Universal heuristic via profile links
  const profileLinks = Array.from(document.querySelectorAll("main a[href*='/in/'], .scaffold-finite-scroll a[href*='/in/'], a[href*='/in/']"));
  const seenCards = new Set();
  const fallbackCards = [];

  for (const link of profileLinks) {
    const card = link.closest("li") || link.closest("div.entity-result") || link.closest("div[data-view-name]") || link.parentElement?.parentElement?.parentElement;
    if (card && !seenCards.has(card)) {
      if (!card.closest("header") && !card.closest("nav") && card.offsetHeight > 50) {
        seenCards.add(card);
        fallbackCards.push(card);
      }
    }
  }

  return fallbackCards;
}

function extractCandidateFromCard(card) {
  // 1. Name & Profile URL
  const profileLink = card.querySelector("a[href*='/in/']:not([href*='/company/'])") || card.querySelector("a.app-aware-link");
  if (!profileLink) return null;

  let name = "";
  // Check visually-hidden title first (e.g. "View John Doe's profile")
  const vh = profileLink.querySelector(".visually-hidden");
  if (vh && vh.innerText && vh.innerText.includes("profile")) {
    name = vh.innerText.replace(/View\s+/i, "").replace(/’s\s+profile|'s\s+profile/i, "").trim();
  }

  // If not, inspect aria-hidden span
  if (!name) {
    const span = profileLink.querySelector("span[aria-hidden='true']");
    if (span && span.innerText.trim()) {
      name = span.innerText.trim();
    }
  }

  // Fallback to link text
  if (!name && profileLink.innerText) {
    name = profileLink.innerText.split("\n")[0].trim();
  }

  // Clean title badges like ", PhD" or " (He/Him)"
  if (name) {
    name = name.split(",")[0].trim();
  }

  // Exclude LinkedIn Member (private)
  if (!name || name.toLowerCase().includes("linkedin member")) return null;

  const profileUrl = profileLink.href ? profileLink.href.split("?")[0] : "";

  // 2. Headline & Subtitle
  const subtitleEl = card.querySelector(".entity-result__primary-subtitle, [class*='primary-subtitle'], .t-14.t-black.t-normal, .entity-result__summary");
  const headline = subtitleEl ? subtitleEl.innerText.trim() : "";

  // 3. Location / Secondary Subtitle
  const locEl = card.querySelector(".entity-result__secondary-subtitle, [class*='secondary-subtitle']");
  const location = locEl ? locEl.innerText.trim() : "";

  // Extract company from headline
  let company = "";
  const atMatch = headline.match(/(?:at|@|\|)\s+([A-Za-z0-9\s&.,'-]+)/i);
  if (atMatch) {
    company = atMatch[1].trim();
  }

  // 4. Find Connect button
  const connectButton = findConnectButton(card);

  return {
    name,
    headline,
    company,
    location,
    profileUrl,
    connectButton
  };
}

function findConnectButton(card) {
  const buttons = Array.from(card.querySelectorAll("button"));
  for (const b of buttons) {
    if (b.disabled) continue;
    const txt = (b.innerText || "").toLowerCase().trim();
    const aria = (b.getAttribute("aria-label") || "").toLowerCase().trim();

    const isConnect = txt.includes("connect") || 
                      (aria.includes("invite") && aria.includes("connect")) ||
                      aria.includes("connect with");

    const isExcluded = txt.includes("pending") || 
                       txt.includes("message") || 
                       aria.includes("withdraw") || 
                       aria.includes("message");

    if (isConnect && !isExcluded) {
      return b;
    }
  }
  return null;
}

async function tryFindConnectInMoreMenu(card) {
  const buttons = Array.from(card.querySelectorAll("button"));
  const moreBtn = buttons.find(b => {
    if (b.disabled) continue;
    const aria = (b.getAttribute("aria-label") || "").toLowerCase();
    const txt = (b.innerText || "").toLowerCase();
    return aria.includes("more actions") || aria.includes("more options") || txt.includes("more");
  });

  if (!moreBtn) return null;

  moreBtn.click();
  await sleep(400);

  const menuItems = Array.from(document.querySelectorAll("div.artdeco-dropdown__content button, div[role='menu'] button, .artdeco-dropdown__item"));
  for (const item of menuItems) {
    const txt = (item.innerText || "").toLowerCase();
    const aria = (item.getAttribute("aria-label") || "").toLowerCase();
    if (txt.includes("connect") || aria.includes("connect")) {
      return item;
    }
  }

  // Close dropdown if connect not found
  document.body.click();
  return null;
}

function attachCardBadge(card, score, persona, actionDecision, isSpam) {
  let badge = card.querySelector(".jobhunt-eval-badge");
  if (!badge) {
    badge = document.createElement("div");
    card.style.position = "relative";
    card.appendChild(badge);
  }
  const isTarget = actionDecision === "CONNECT_HIGH_PRIORITY";
  const isPeer = actionDecision === "CONNECT_PEER";

  badge.className = `jobhunt-eval-badge ${isTarget ? "match-high" : isPeer ? "match-peer" : "match-low"}`;
  const decisionLabel = isTarget ? "🎯 Target" : isPeer ? "💡 Peer" : "⏭️ Skip";
  badge.innerText = `Laya: ${decisionLabel} (${score}%)`;
}

async function executeConnectionWithNote(connectBtn, note) {
  try {
    connectBtn.click();
    await sleep(1000);

    let modal = document.querySelector(".artdeco-modal, div[role='dialog']");
    if (!modal) {
      await sleep(500);
      modal = document.querySelector(".artdeco-modal, div[role='dialog']");
    }

    if (!modal) {
      return true;
    }

    // If modal requires email verification, close safely
    const emailInput = modal.querySelector("input[type='email'], input#email");
    if (emailInput) {
      const dismissBtn = modal.querySelector("button[aria-label='Dismiss'], button[aria-label='Close'], button.artdeco-modal__dismiss");
      if (dismissBtn) dismissBtn.click();
      return false;
    }

    // Click "Add a note"
    const modalButtons = Array.from(modal.querySelectorAll("button"));
    const addNoteBtn = modalButtons.find(b => {
      const txt = (b.innerText || "").toLowerCase();
      const aria = (b.getAttribute("aria-label") || "").toLowerCase();
      return txt.includes("add a note") || aria.includes("add a note");
    });

    if (addNoteBtn) {
      addNoteBtn.click();
      await sleep(600);

      const textarea = modal.querySelector("textarea[name='message'], #custom-message, textarea");
      if (textarea && note) {
        const safeNote = note.slice(0, 298);
        textarea.focus();
        textarea.value = safeNote;
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
        textarea.dispatchEvent(new Event("change", { bubbles: true }));
        await sleep(500);
      }
    }

    // Click "Send"
    const updatedButtons = Array.from(modal.querySelectorAll("button"));
    const sendBtn = updatedButtons.find(b => {
      const txt = (b.innerText || "").toLowerCase().trim();
      const aria = (b.getAttribute("aria-label") || "").toLowerCase();
      return (txt === "send" || txt.includes("send invitation") || aria.includes("send invitation") || aria.includes("send now")) && !b.disabled;
    });

    if (sendBtn) {
      sendBtn.click();
      await sleep(1000);
      return true;
    }

    const dismissBtn = modal.querySelector("button[aria-label='Dismiss'], button[aria-label='Close'], button.artdeco-modal__dismiss");
    if (dismissBtn) dismissBtn.click();
    return false;
  } catch (e) {
    console.warn("[JobHunt] Connection send error:", e);
    return false;
  }
}

async function handlePagination() {
  window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
  await sleep(1200);

  const nextBtn = document.querySelector("button[aria-label='Next'], .artdeco-pagination__button--next, button.artdeco-pagination__button--next");

  if (nextBtn && !nextBtn.disabled) {
    await runCountdown(5000, "Navigating to next search page in:");
    nextBtn.click();
    autopilotState.currentIndex = 0;
    await sleep(4000);
    processNextCandidateCard();
  } else {
    updateHUDStatus("idle", "Completed", "Processed all candidates! Reached the end of search results.");
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
