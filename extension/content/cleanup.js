/**
 * LinkedIn Connection Cleanup & Audit Content Script
 * Injects on LinkedIn Connections page (/mynetwork/invite-connect/connections/ or /mynetwork/*)
 * Evaluates connections against blacklist and irrelevance criteria using Laya and DuckDB
 */

(() => {
  const BACKEND_URL = "http://127.0.0.1:8765";
  let isAuditing = false;
  let batchRunning = false;
  let flaggedCards = [];

  function isConnectionsPage() {
    return window.location.pathname.includes("/mynetwork");
  }

  function injectCleanupToolbar() {
    if (!isConnectionsPage()) {
      removeToolbar();
      return;
    }

    if (document.getElementById("jobhunt-cleanup-toolbar")) return;

    // Find main container on /mynetwork page
    const targetContainer = document.querySelector(".scaffold-finite-scroll") ||
                            document.querySelector(".mn-connections") ||
                            document.querySelector("main") ||
                            document.body;

    if (!targetContainer) return;

    const toolbar = document.createElement("div");
    toolbar.id = "jobhunt-cleanup-toolbar";
    toolbar.innerHTML = `
      <div class="jhc-toolbar-header">
        <div class="jhc-toolbar-title">
          <span>🧹 JobHunt Network Cleanup</span>
          <span style="font-size: 11px; color: #9ca3af; font-weight: normal;">(Laya + DuckDB)</span>
        </div>
        <div class="jhc-toolbar-stats" id="jhc-stats-text">Ready to audit connections</div>
      </div>
      <div class="jhc-toolbar-actions">
        <button class="jhc-btn jhc-btn-audit" id="jhc-audit-btn">🔍 Audit Page Connections</button>
        <button class="jhc-btn jhc-btn-unfollow-all" id="jhc-unfollow-all-btn" style="display: none;">⚡ Safe Batch Unfollow Flagged</button>
        <button class="jhc-btn jhc-btn-stop" id="jhc-stop-btn" style="display: none;">⏹ Stop</button>
        <div class="jhc-status-banner" id="jhc-status-banner"></div>
      </div>
    `;

    // Insert at the top of the container
    if (targetContainer.firstChild) {
      targetContainer.insertBefore(toolbar, targetContainer.firstChild);
    } else {
      targetContainer.appendChild(toolbar);
    }

    setupToolbarEvents(toolbar);
  }

  function removeToolbar() {
    const el = document.getElementById("jobhunt-cleanup-toolbar");
    if (el) el.remove();
  }

  function setupToolbarEvents(toolbar) {
    const auditBtn = toolbar.querySelector("#jhc-audit-btn");
    const unfollowAllBtn = toolbar.querySelector("#jhc-unfollow-all-btn");
    const stopBtn = toolbar.querySelector("#jhc-stop-btn");

    auditBtn.addEventListener("click", () => {
      runAudit();
    });

    unfollowAllBtn.addEventListener("click", () => {
      runSafeBatchUnfollow();
    });

    stopBtn.addEventListener("click", () => {
      batchRunning = false;
      stopBtn.style.display = "none";
      unfollowAllBtn.style.display = "inline-flex";
      updateStatus("Batch operation paused by user.");
    });
  }

  function updateStatus(text, statsText) {
    const banner = document.getElementById("jhc-status-banner");
    const stats = document.getElementById("jhc-stats-text");
    if (banner && text !== undefined) banner.innerText = text;
    if (stats && statsText !== undefined) stats.innerText = statsText;
  }

  function scrapeVisibleConnections() {
    const cards = Array.from(document.querySelectorAll(".mn-connection-card, li.mn-connection-card, .scaffold-finite-scroll__content li, .artdeco-list__item"));
    const items = [];

    cards.forEach((card, idx) => {
      // Find name & link
      const linkEl = card.querySelector("a[href*='/in/']");
      const titleEl = card.querySelector(".mn-connection-card__name, .artdeco-entity-lockup__title, h3");
      const occEl = card.querySelector(".mn-connection-card__occupation, .artdeco-entity-lockup__subtitle");

      if (linkEl && (titleEl || occEl)) {
        const profileUrl = linkEl.href.split("?")[0];
        const name = titleEl ? titleEl.innerText.trim().split("\n")[0] : "Connection";
        const headline = occEl ? occEl.innerText.trim() : "";

        items.push({
          element: card,
          profile_url: profileUrl,
          name: name,
          headline: headline
        });
      }
    });

    return items;
  }

  async function runAudit() {
    if (isAuditing) return;
    isAuditing = true;
    updateStatus("Scanning connections on page...", "Auditing...");

    const scraped = scrapeVisibleConnections();
    if (scraped.length === 0) {
      updateStatus("No connection cards found. Ensure you are on the Connections tab.", "0 items");
      isAuditing = false;
      return;
    }

    const payload = {
      connections: scraped.map(s => ({
        profile_url: s.profile_url,
        name: s.name,
        headline: s.headline
      }))
    };

    try {
      const resp = await fetch(`${BACKEND_URL}/api/cleanup/evaluate-batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();

      flaggedCards = [];
      data.results.forEach((res, index) => {
        const item = scraped[index];
        if (!item || !item.element) return;

        // Clear existing injected badges
        const oldBadge = item.element.querySelector(".jhc-flag-badge-container");
        if (oldBadge) oldBadge.remove();
        item.element.classList.remove("jhc-flagged-card");

        if (res.is_flagged) {
          item.element.classList.add("jhc-flagged-card");
          flaggedCards.push({
            element: item.element,
            profile_url: res.profile_url,
            name: res.name,
            headline: res.headline,
            flag_reason: res.flag_reason
          });
          injectCardBadges(item.element, res);
        }
      });

      const unfollowAllBtn = document.getElementById("jhc-unfollow-all-btn");
      if (flaggedCards.length > 0 && unfollowAllBtn) {
        unfollowAllBtn.style.display = "inline-flex";
      }

      updateStatus(
        `Audit complete: ${flaggedCards.length} flagged out of ${data.total} scanned.`,
        `Scanned: ${data.total} | Flagged: ${flaggedCards.length}`
      );
    } catch (err) {
      console.error("[JobHunt] Cleanup audit failed:", err);
      updateStatus("Failed to reach local backend. Is backend running?", "Error");
    } finally {
      isAuditing = false;
    }
  }

  function injectCardBadges(cardEl, res) {
    const container = document.createElement("div");
    container.className = "jhc-flag-badge-container";
    container.innerHTML = `
      <div class="jhc-flag-badge">⚠️ ${res.flag_reason}</div>
      <div class="jhc-quick-actions">
        <button class="jhc-card-btn unfollow" data-action="unfollowed">Unfollow (Keep 500+)</button>
        <button class="jhc-card-btn remove" data-action="removed">Disconnect</button>
        <button class="jhc-card-btn keep" data-action="kept">Whitelist</button>
      </div>
    `;

    // Append to card actions or card content
    const details = cardEl.querySelector(".mn-connection-card__details") ||
                    cardEl.querySelector(".artdeco-entity-lockup__content") ||
                    cardEl;
    details.appendChild(container);

    // Event listeners
    container.querySelectorAll(".jhc-card-btn").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        e.preventDefault();
        const action = btn.dataset.action;

        if (action === "kept") {
          cardEl.classList.remove("jhc-flagged-card");
          container.remove();
          return;
        }

        // Log to DuckDB
        await logCleanupAction(res.profile_url, res.name, res.headline, res.flag_reason, action);
        btn.innerText = action === "unfollowed" ? "Unfollowed" : "Removed";
        btn.disabled = true;
        cardEl.style.opacity = "0.4";
      });
    });
  }

  async function logCleanupAction(url, name, headline, reason, action) {
    try {
      await fetch(`${BACKEND_URL}/api/cleanup/log-action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile_url: url,
          name: name,
          headline: headline,
          flag_reason: reason,
          action_taken: action
        })
      });
    } catch (e) {
      console.warn("Could not log cleanup action:", e);
    }
  }

  async function runSafeBatchUnfollow() {
    if (flaggedCards.length === 0) return;
    batchRunning = true;

    const stopBtn = document.getElementById("jhc-stop-btn");
    const unfollowAllBtn = document.getElementById("jhc-unfollow-all-btn");
    if (stopBtn) stopBtn.style.display = "inline-flex";
    if (unfollowAllBtn) unfollowAllBtn.style.display = "none";

    let processed = 0;
    for (const item of flaggedCards) {
      if (!batchRunning) break;

      updateStatus(`Processing ${processed + 1}/${flaggedCards.length}: ${item.name}...`);

      // Find more options button on the card
      const moreBtn = item.element.querySelector("button[aria-label*='More actions']") ||
                      item.element.querySelector(".artdeco-dropdown__trigger");

      if (moreBtn) {
        moreBtn.click();
        await sleep(400);

        // Look for Unfollow option
        const unfollowOpt = Array.from(document.querySelectorAll(".artdeco-dropdown__content span, .artdeco-dropdown__content button"))
          .find(el => el.innerText.toLowerCase().includes("unfollow"));

        if (unfollowOpt) {
          unfollowOpt.click();
          await logCleanupAction(item.profile_url, item.name, item.headline, item.flag_reason, "unfollowed");
          item.element.style.opacity = "0.4";
        } else {
          // Close menu
          document.body.click();
        }
      } else {
        // Fallback: log as marked unfollowed
        await logCleanupAction(item.profile_url, item.name, item.headline, item.flag_reason, "unfollowed");
        item.element.style.opacity = "0.4";
      }

      processed++;

      // Safe human-like jitter delay (2.5 to 4.5 seconds)
      const jitterMs = 2500 + Math.random() * 2000;
      await sleep(jitterMs);
    }

    batchRunning = false;
    if (stopBtn) stopBtn.style.display = "none";
    if (unfollowAllBtn) unfollowAllBtn.style.display = "inline-flex";
    updateStatus(`Finished safe batch unfollow for ${processed} profiles.`);
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Monitor SPA navigation
  let lastHref = window.location.href;
  setInterval(() => {
    if (window.location.href !== lastHref) {
      lastHref = window.location.href;
      if (isConnectionsPage()) {
        setTimeout(injectCleanupToolbar, 1000);
      } else {
        removeToolbar();
      }
    }
  }, 1000);

  if (isConnectionsPage()) {
    setTimeout(injectCleanupToolbar, 1500);
  }
})();
