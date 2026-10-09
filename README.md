# LinkedIn JobHunt Profiler & Network Cleanup

An intelligent Chrome Extension and local intelligence backend designed to accelerate your job search on LinkedIn by profiling potential connections against your target roles, generating high-conversion connection request notes (<300 chars), and cleaning up low-value connections from your feed.

Powered by **NandhaKishorM/laya** (System 1 fast decision engine) and **DuckDB**.

---

## Architecture Overview

```
LinkedIn Web (Chrome)
  ├── Profile Page (/in/*)           --> JobHunt Profiler Floating Widget
  │                                      (Match score, Persona badge, Note generator & autofill)
  ├── Connections Page (/mynetwork)  --> Network Cleanup & Audit Toolbar
  │                                      (Flag spam/blacklist, 1-click or safe batch unfollow)
  └── Extension Popup                --> Dashboard, Targets Configuration, Blacklist Rules, History
         │
         ▼ (HTTP JSON REST API)
Local Backend (http://127.0.0.1:8765)
  ├── Laya Decision Engine (convaiinnovations/laya)
  ├── Note Synthesizer (strict <=300 char LinkedIn limits)
  └── DuckDB Persistent Storage (data/jobhunt.duckdb)
```

---

## Quick Start Guide

### 1. Start the Local Backend
The backend server is already running, but you can launch or restart it anytime:
```bash
./start.sh
```
Or directly:
```bash
./venv/bin/python -m uvicorn backend.main:app --host 127.0.0.1 --port 8765 --reload
```

Health check: [http://127.0.0.1:8765/api/health](http://127.0.0.1:8765/api/health)

---

### 2. Load the Chrome Extension
1. Open Google Chrome and go to: `chrome://extensions`
2. Turn ON **Developer mode** in the top-right corner.
3. Click **Load unpacked** in the top-left corner.
4. Select the `extension/` directory from this project:
   `/Users/priyanshasinha/Development/JobHunt/extension`
5. Pin the **JobHunt Profiler** extension to your Chrome toolbar.

---

### 3. Set Your Resume (PDF or Text)
1. Click the **JobHunt Profiler** icon in your Chrome toolbar.
2. Go to the **Resume** tab:
   - **Upload Resume PDF**: Drag & drop or pick your resume `.pdf` file. Text, role, and skills are auto-extracted!
   - **Or Paste Text**: Paste or edit your resume text directly into the editor.
   - Click **Save & Analyze Resume**.
3. Go to the **Cleanup** tab to customize blacklist keywords (e.g., `Crypto, Forex, Lead Gen, Financial Advisor`).

---

### 4. Direct Matcher (Upload PDF or Paste Text)
You can match ANY profile or CV directly from the extension popup without even visiting LinkedIn:
1. Open the extension and click the **Matcher** tab.
2. Choose **Upload PDF** (e.g. LinkedIn "Save to PDF" export or candidate CV PDF) or **Paste Text**.
3. Click **Run Laya Match**.
4. View instant **Match Score**, **Persona Badge**, and tailored **<=300 char Connection Note** with 1-click clipboard copy!

---

### 5. Use on LinkedIn

#### A. When Browsing Profiles (`/in/*`):
- A sleek floating widget appears on the right side of the screen.
- Displays:
  - **Match Score Circle** (e.g., `92% Match`).
  - **Persona Badge** (`Recruiter / Talent Partner`, `Hiring Manager / Tech Lead`, `Peer`).
  - **Synergy Highlights** (shared skills, target company match).
  - **Customized Connection Note** (editable, with real-time `<300` char counter).
- Click **"Auto-Fill Note"** to automatically paste the pitch into LinkedIn's invitation modal when clicking "Connect".
- Click **"Log as Sent"** to mark it as sent in your DuckDB database.

#### B. When Cleaning Up Your Network (`/mynetwork`):
- Go to [LinkedIn Connections](https://www.linkedin.com/mynetwork/invite-connect/connections/).
- A top toolbar appears: **"JobHunt Network Cleanup"**.
- Click **"Audit Page Connections"** to scan visible connections against your blacklist rules.
- Flagged accounts are outlined in red with their flag reason and quick-action buttons:
  - **Unfollow**: Keeps your 500+ connection count for search visibility, but cleans your feed of their junk posts.
  - **Disconnect**: Completely severs the connection.
  - **Whitelist**: Clears the flag.
- Click **"Safe Batch Unfollow"** to run through flagged accounts with human-like jitter delays (2.5–4.5s) to keep your account 100% safe from rate limits.

---

## Inspecting Data in DuckDB

All profiles, notes, configurations, and cleanup logs are stored in `data/jobhunt.duckdb`.

Query via Python:
```python
import duckdb
con = duckdb.connect("data/jobhunt.duckdb")

# View evaluated profiles
print(con.execute("SELECT name, persona, match_score, suggested_note FROM evaluated_profiles").df())

# View cleanup audit trail
print(con.execute("SELECT name, flag_reason, action_taken, action_date FROM cleanup_records").df())
```
