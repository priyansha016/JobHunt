/**
 * LinkedIn JobHunt Profiler Content Script
 * Injects on LinkedIn profile pages (/in/*)
 * Interacts with local FastAPI backend (DuckDB + Laya) on http://127.0.0.1:8765
 */

(() => {
  const BACKEND_URL = "http://127.0.0.1:8765";
  let lastEvaluatedUrl = "";
  let currentProfileData = null;

  function isProfilePage() {
    return window.location.pathname.startsWith("/in/");
  }

  function cleanUrl(url) {
    try {
      const u = new URL(url);
      return u.origin + u.pathname;
    } catch {
      return url;
    }
  }

  function scrapeProfileData() {
    const linkedinUrl = cleanUrl(window.location.href);

    // 1. Name
    let name = "";
    const nameEl = document.querySelector("h1.inline.t-24") ||
                   document.querySelector("h1.text-heading-xlarge") ||
                   document.querySelector("h1");
    if (nameEl) {
      name = nameEl.innerText.trim().split("\n")[0].trim();
    }

    // 2. Headline
    let headline = "";
    const headlineEl = document.querySelector(".text-body-medium.break-words") ||
                       document.querySelector("div.ph5 div.text-body-medium") ||
                       document.querySelector(".pv-text-details__left-panel .text-body-medium");
    if (headlineEl) {
      headline = headlineEl.innerText.trim();
    }

    // 3. Current Company
    let company = "";
    const companyBtn = document.querySelector("button[aria-label*='Current company']") ||
                       document.querySelector("ul.pv-text-details__right-panel li button");
    if (companyBtn) {
      company = companyBtn.innerText.trim();
    } else if (headline.includes(" at ")) {
      company = headline.split(" at ")[1].split("|")[0].split("•")[0].trim();
    } else if (headline.includes(" @ ")) {
      company = headline.split(" @ ")[1].split("|")[0].split("•")[0].trim();
    }

    // 4. Location
    let location = "";
    const locEl = document.querySelector("span.text-body-small.inline.t-black--light.break-words") ||
                  document.querySelector(".pv-text-details__left-panel span.text-body-small");
    if (locEl) {
      location = locEl.innerText.trim();
    }

    // 5. About
    let about = "";
    const aboutSection = document.querySelector("#about");
    if (aboutSection) {
      const container = aboutSection.closest("section");
      if (container) {
        const textSpan = container.querySelector(".inline-show-more-text") || container.querySelector(".pv-shared-text-with-see-more");
        if (textSpan) {
          about = textSpan.innerText.trim();
        }
      }
    }

    return {
      linkedin_url: linkedinUrl,
      name: name || "LinkedIn Member",
      headline: headline,
      current_company: company,
      location: location,
      about: about
    };
  }

  async function evaluateCurrentProfile() {
    if (!isProfilePage()) {
      removeWidget();
      return;
    }

    const currentUrl = cleanUrl(window.location.href);
    if (currentUrl === lastEvaluatedUrl && document.getElementById("jobhunt-profiler-widget")) {
      return;
    }
    lastEvaluatedUrl = currentUrl;

    const profile = scrapeProfileData();
    currentProfileData = profile;

    // Show loading state widget
    renderLoadingWidget(profile.name);

    try {
      const resp = await fetch(`${BACKEND_URL}/api/profile/evaluate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile)
      });

      if (!resp.ok) {
        throw new Error(`Server returned ${resp.status}`);
      }

      const data = await resp.json();
      renderEvaluatedWidget(data);
    } catch (err) {
      console.warn("[JobHunt] Backend evaluate failed:", err);
      renderErrorWidget(err.message);
    }
  }

  function getPersonaClass(persona) {
    if (persona.includes("Recruiter")) return "recruiter";
    if (persona.includes("Manager")) return "manager";
    if (persona.includes("Peer")) return "peer";
    return "other";
  }

  function getScoreClass(score) {
    if (score >= 75) return "high";
    if (score >= 50) return "medium";
    return "low";
  }

  function renderLoadingWidget(name) {
    let widget = document.getElementById("jobhunt-profiler-widget");
    if (!widget) {
      widget = document.createElement("div");
      widget.id = "jobhunt-profiler-widget";
      document.body.appendChild(widget);
    }

    widget.innerHTML = `
      <div class="jhp-header">
        <div class="jhp-header-title">⚡ JobHunt Profiler</div>
        <button class="jhp-toggle-btn" id="jhp-min-btn">−</button>
      </div>
      <div class="jhp-body">
        <div style="font-size: 13px; color: #9ca3af; text-align: center; padding: 20px 0;">
          Analyzing <strong>${name}</strong> with Laya...
        </div>
      </div>
    `;

    setupWidgetControls(widget);
  }

  function renderErrorWidget(message) {
    let widget = document.getElementById("jobhunt-profiler-widget");
    if (!widget) return;

    widget.innerHTML = `
      <div class="jhp-header">
        <div class="jhp-header-title">⚡ JobHunt Profiler</div>
        <button class="jhp-toggle-btn" id="jhp-min-btn">−</button>
      </div>
      <div class="jhp-body">
        <div style="color: #ef4444; font-size: 12px; margin-bottom: 8px;">
          Backend not connected at <code>${BACKEND_URL}</code>.
        </div>
        <div style="font-size: 11px; color: #9ca3af;">
          Run: <code>python backend/main.py</code>
        </div>
        <button class="jhp-btn jhp-btn-secondary" id="jhp-retry-btn" style="margin-top: 10px;">Retry</button>
      </div>
    `;

    setupWidgetControls(widget);
    const retryBtn = widget.querySelector("#jhp-retry-btn");
    if (retryBtn) {
      retryBtn.addEventListener("click", () => {
        lastEvaluatedUrl = "";
        evaluateCurrentProfile();
      });
    }
  }

  function renderEvaluatedWidget(data) {
    const profile = data.profile;
    const evalData = data.evaluation;
    const note = data.suggested_note;

    let widget = document.getElementById("jobhunt-profiler-widget");
    if (!widget) {
      widget = document.createElement("div");
      widget.id = "jobhunt-profiler-widget";
      document.body.appendChild(widget);
    }

    const personaClass = getPersonaClass(evalData.persona);
    const scoreClass = getScoreClass(evalData.match_score);

    const rationaleHtml = (evalData.rationale || []).map(r => `<li>${r}</li>`).join("");
    const templates = data.available_templates || [];
    const templatesOptionsHtml = templates.map(t => 
      `<option value="${t.id}" ${t.is_default ? 'selected' : ''}>${t.title}</option>`
    ).join("");

    widget.innerHTML = `
      <div class="jhp-header">
        <div class="jhp-header-title">
          <span>⚡ JobHunt Profiler</span>
          <span style="font-size: 10px; color: #9ca3af; font-weight: normal;">(Laya + DuckDB)</span>
        </div>
        <button class="jhp-toggle-btn" id="jhp-min-btn">−</button>
      </div>

      <div class="jhp-body">
        <!-- Score Card -->
        <div class="jhp-score-row">
          <div class="jhp-score-circle ${scoreClass}">
            ${Math.round(evalData.match_score)}%
          </div>
          <div class="jhp-score-info">
            <span class="jhp-persona-badge ${personaClass}">${evalData.persona}</span>
            <div class="jhp-name-headline">${profile.name}</div>
          </div>
        </div>

        <!-- Rationale -->
        <div class="jhp-rationale-section">
          <div class="jhp-section-title">Synergy Highlights</div>
          <ul class="jhp-rationale-list">
            ${rationaleHtml || "<li>General professional alignment</li>"}
          </ul>
        </div>

        <!-- Connection Note -->
        <div class="jhp-note-section">
          <div class="jhp-note-header">
            <div class="jhp-section-title">Template Note</div>
            <div class="jhp-char-counter" id="jhp-counter">${note.length}/300</div>
          </div>
          ${templates.length > 0 ? `
          <div class="jhp-template-row">
            <select class="jhp-template-select" id="jhp-template-select">
              ${templatesOptionsHtml}
            </select>
          </div>` : ''}
          <textarea class="jhp-note-textarea" id="jhp-note-input" maxlength="300">${note}</textarea>
        </div>

        <!-- Actions -->
        <div class="jhp-actions-row">
          <button class="jhp-btn jhp-btn-primary" id="jhp-fill-btn" title="Paste note into LinkedIn connect modal">
            ✍️ Auto-Fill Note
          </button>
          <button class="jhp-btn jhp-btn-secondary" id="jhp-copy-btn" title="Copy to clipboard">
            📋 Copy
          </button>
        </div>

        <div class="jhp-actions-row">
          <button class="jhp-btn jhp-btn-success" id="jhp-sent-btn">
            ✅ Log as Sent
          </button>
        </div>
      </div>

      <div class="jhp-footer">
        <span class="jhp-status-tag" id="jhp-status-tag">Status: ${profile.note_status || "draft"}</span>
        <span>Saved to DuckDB</span>
      </div>
    `;

    setupWidgetControls(widget);

    // Template selector listener
    const templateSelect = widget.querySelector("#jhp-template-select");
    const textarea = widget.querySelector("#jhp-note-input");
    const counter = widget.querySelector("#jhp-counter");

    if (templateSelect) {
      templateSelect.addEventListener("change", async () => {
        const selectedId = templateSelect.value;
        const selectedTmpl = templates.find(t => t.id === selectedId);
        if (!selectedTmpl) return;

        try {
          const rResp = await fetch(`${BACKEND_URL}/api/templates/render`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              template_text: selectedTmpl.template_text,
              profile: currentProfileData
            })
          });
          if (rResp.ok) {
            const rData = await rResp.json();
            textarea.value = rData.rendered_note;
            counter.innerText = `${textarea.value.length}/300`;
          }
        } catch (e) {
          console.warn("Could not render template:", e);
        }
      });
    }

    // Character counter listener
    textarea.addEventListener("input", () => {
      const len = textarea.value.length;
      counter.innerText = `${len}/300`;
      if (len >= 290) {
        counter.classList.add("limit-warn");
      } else {
        counter.classList.remove("limit-warn");
      }
    });

    // Copy Button
    const copyBtn = widget.querySelector("#jhp-copy-btn");
    copyBtn.addEventListener("click", () => {
      navigator.clipboard.writeText(textarea.value).then(() => {
        copyBtn.innerText = "Copied!";
        setTimeout(() => { copyBtn.innerText = "📋 Copy"; }, 1500);
      });
    });

    // Auto-fill Note Button
    const fillBtn = widget.querySelector("#jhp-fill-btn");
    fillBtn.addEventListener("click", () => {
      handleAutoFillNote(textarea.value);
    });

    // Mark as Sent Button
    const sentBtn = widget.querySelector("#jhp-sent-btn");
    sentBtn.addEventListener("click", async () => {
      try {
        await fetch(`${BACKEND_URL}/api/profile/status`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            profile_id: profile.profile_id,
            status: "sent"
          })
        });
        const statusTag = widget.querySelector("#jhp-status-tag");
        if (statusTag) statusTag.innerText = "Status: sent";
        sentBtn.innerText = "Sent & Logged";
      } catch (err) {
        console.error("Failed to update status:", err);
      }
    });
  }

  function handleAutoFillNote(noteText) {
    // 1. Look for active textarea inside LinkedIn connection modal
    const noteArea = document.querySelector("textarea#custom-message") ||
                     document.querySelector("textarea[name='message']") ||
                     document.querySelector(".send-invite textarea");

    if (noteArea) {
      noteArea.value = noteText;
      // Trigger native react events
      noteArea.dispatchEvent(new Event("input", { bubbles: true }));
      noteArea.dispatchEvent(new Event("change", { bubbles: true }));
      noteArea.focus();
    } else {
      // If modal is not open, look for "Add a note" button in any open modal
      const addNoteBtn = document.querySelector("button[aria-label='Add a note']") ||
                         Array.from(document.querySelectorAll("button")).find(b => b.innerText.trim() === "Add a note");

      if (addNoteBtn) {
        addNoteBtn.click();
        setTimeout(() => {
          handleAutoFillNote(noteText);
        }, 300);
      } else {
        // Fallback: Copy to clipboard and instruct user
        navigator.clipboard.writeText(noteText);
        alert("Note copied to clipboard! Click 'Connect' on LinkedIn -> 'Add a note' -> paste.");
      }
    }
  }

  function setupWidgetControls(widget) {
    const minBtn = widget.querySelector("#jhp-min-btn");
    if (minBtn) {
      minBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        widget.classList.toggle("minimized");
        minBtn.innerText = widget.classList.contains("minimized") ? "+" : "−";
      });
    }

    widget.addEventListener("click", () => {
      if (widget.classList.contains("minimized")) {
        widget.classList.remove("minimized");
        if (minBtn) minBtn.innerText = "−";
      }
    });
  }

  function removeWidget() {
    const widget = document.getElementById("jobhunt-profiler-widget");
    if (widget) widget.remove();
  }

  // Observe navigation changes on LinkedIn's single-page app
  let prevUrl = window.location.href;
  const observer = new MutationObserver(() => {
    if (window.location.href !== prevUrl) {
      prevUrl = window.location.href;
      if (isProfilePage()) {
        setTimeout(evaluateCurrentProfile, 600);
      } else {
        removeWidget();
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // Initial check on load
  if (isProfilePage()) {
    setTimeout(evaluateCurrentProfile, 1000);
  }
})();
