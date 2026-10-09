"""
DuckDB Database Manager for LinkedIn JobHunt Profiler & Cleanup System.
Stores:
- User configuration (resume, target titles, target companies, skills, blacklist)
- Evaluated LinkedIn profiles & match decisions
- Connection request history
- Cleanup & unfollow audit trail
"""

import json
import os
import duckdb
from typing import Dict, List, Any, Optional
from datetime import datetime

DB_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "data"))
DB_PATH = os.path.join(DB_DIR, "jobhunt.duckdb")


class Database:
    def __init__(self, db_path: str = DB_PATH):
        self.db_path = db_path
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
        self._init_tables()

    def _get_connection(self):
        return duckdb.connect(self.db_path)

    def _init_tables(self):
        with self._get_connection() as con:
            con.execute("""
                CREATE TABLE IF NOT EXISTS user_config (
                    id VARCHAR PRIMARY KEY,
                    resume_text TEXT,
                    target_titles TEXT,       -- JSON list
                    target_companies TEXT,    -- JSON list
                    skills TEXT,              -- JSON list
                    cleanup_blacklist TEXT,   -- JSON list
                    updated_at TIMESTAMP
                );
            """)

            con.execute("""
                CREATE TABLE IF NOT EXISTS evaluated_profiles (
                    profile_id VARCHAR PRIMARY KEY,
                    linkedin_url VARCHAR,
                    name VARCHAR,
                    headline VARCHAR,
                    current_company VARCHAR,
                    location VARCHAR,
                    about TEXT,
                    persona VARCHAR,
                    match_score DOUBLE,
                    rationale TEXT,          -- JSON list
                    suggested_note VARCHAR,
                    note_status VARCHAR DEFAULT 'draft',
                    action_decision VARCHAR DEFAULT 'CONNECT_PEER',
                    outreach_angle VARCHAR DEFAULT 'peer_networking',
                    confidence DOUBLE DEFAULT 0.85,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            """)

            # Ensure columns exist if table was created previously
            for col_name, col_type in [
                ("action_decision", "VARCHAR DEFAULT 'CONNECT_PEER'"),
                ("outreach_angle", "VARCHAR DEFAULT 'peer_networking'"),
                ("confidence", "DOUBLE DEFAULT 0.85")
            ]:
                try:
                    con.execute(f"ALTER TABLE evaluated_profiles ADD COLUMN IF NOT EXISTS {col_name} {col_type};")
                except Exception:
                    pass

            con.execute("""
                CREATE TABLE IF NOT EXISTS cleanup_records (
                    id VARCHAR PRIMARY KEY,
                    profile_url VARCHAR,
                    name VARCHAR,
                    headline VARCHAR,
                    flag_reason VARCHAR,
                    action_taken VARCHAR,    -- 'unfollowed', 'removed', 'kept'
                    action_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            """)

            con.execute("""
                CREATE TABLE IF NOT EXISTS message_templates (
                    id VARCHAR PRIMARY KEY,
                    persona VARCHAR,
                    title VARCHAR,
                    template_text TEXT,
                    is_default BOOLEAN DEFAULT FALSE,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            """)

            # Ensure default user_config exists if empty
            rows = con.execute("SELECT COUNT(*) FROM user_config WHERE id = 'default'").fetchone()
            if rows[0] == 0:
                con.execute("""
                    INSERT INTO user_config (id, resume_text, target_titles, target_companies, skills, cleanup_blacklist, updated_at)
                    VALUES ('default', '', '["Software Engineer", "Full Stack Engineer", "Backend Engineer"]', '[]', '["Python", "JavaScript", "TypeScript", "React", "Docker", "SQL"]', '["Crypto", "Forex", "Lead Generation", "SEO Specialist", "Virtual Assistant", "Sales Development Representative"]', CURRENT_TIMESTAMP);
                """)

            # Seed default templates if empty
            tmpl_rows = con.execute("SELECT COUNT(*) FROM message_templates").fetchone()
            if tmpl_rows[0] == 0:
                default_tmpls = [
                    ("recruiter_direct", "Recruiter / Talent Partner", "Direct Tech Hiring", "Hi {first_name}, noticed you lead tech hiring at {company}. I'm a {my_role} specializing in {top_skill}. Would love to connect and keep in touch for upcoming opportunities on your radar!", True),
                    ("recruiter_referral", "Recruiter / Talent Partner", "Open Pipeline Inquiry", "Hi {first_name}, saw your recruiting updates for {company}. As a {my_role} with strong background in {top_skill} & {second_skill}, I'd love to connect and stay in touch regarding engineering roles!", False),
                    ("manager_leadership", "Hiring Manager / Tech Lead", "Engineering Leadership", "Hi {first_name}, saw your engineering leadership at {company}. I'm a {my_role} focused on {top_skill}. Really admire your team's work and would value connecting with you here!", True),
                    ("manager_initiative", "Hiring Manager / Tech Lead", "Tech Innovation / Team Work", "Hi {first_name}, came across your team's initiatives at {company}. As a {my_role} specializing in {top_skill}, I'd love to connect to follow your engineering updates and share insights!", False),
                    ("peer_exchange", "Peer / Potential Referral", "Peer Exchange", "Hi {first_name}, always great connecting with fellow engineers at {company}! I work across {top_skill} and would love to connect, follow your work, and exchange ideas.", True),
                    ("peer_casual", "Peer / Potential Referral", "Casual Networking", "Hi {first_name}, came across your work in tech. Always looking to learn from fellow engineers in the community. Would love to connect!", False),
                    ("general_network", "Other / General", "Expand Tech Network", "Hi {first_name}, came across your profile at {company}. As a {my_role}, I'd love to connect and expand our professional network here on LinkedIn!", True)
                ]
                for tid, persona, title, text, is_def in default_tmpls:
                    con.execute("""
                        INSERT INTO message_templates (id, persona, title, template_text, is_default, updated_at)
                        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                    """, [tid, persona, title, text, is_def])

    def get_user_config(self) -> Dict[str, Any]:
        with self._get_connection() as con:
            row = con.execute("""
                SELECT resume_text, target_titles, target_companies, skills, cleanup_blacklist, updated_at
                FROM user_config WHERE id = 'default'
            """).fetchone()

            if not row:
                return {
                    "resume_text": "",
                    "target_titles": [],
                    "target_companies": [],
                    "skills": [],
                    "cleanup_blacklist": [],
                    "updated_at": datetime.now().isoformat()
                }

            return {
                "resume_text": row[0] or "",
                "target_titles": json.loads(row[1]) if row[1] else [],
                "target_companies": json.loads(row[2]) if row[2] else [],
                "skills": json.loads(row[3]) if row[3] else [],
                "cleanup_blacklist": json.loads(row[4]) if row[4] else [],
                "updated_at": row[5].isoformat() if row[5] else datetime.now().isoformat()
            }

    def update_user_config(self, resume_text: Optional[str] = None,
                           target_titles: Optional[List[str]] = None,
                           target_companies: Optional[List[str]] = None,
                           skills: Optional[List[str]] = None,
                           cleanup_blacklist: Optional[List[str]] = None) -> Dict[str, Any]:
        current = self.get_user_config()
        if resume_text is not None:
            current["resume_text"] = resume_text
        if target_titles is not None:
            current["target_titles"] = target_titles
        if target_companies is not None:
            current["target_companies"] = target_companies
        if skills is not None:
            current["skills"] = skills
        if cleanup_blacklist is not None:
            current["cleanup_blacklist"] = cleanup_blacklist

        with self._get_connection() as con:
            con.execute("""
                INSERT OR REPLACE INTO user_config (id, resume_text, target_titles, target_companies, skills, cleanup_blacklist, updated_at)
                VALUES ('default', ?, ?, ?, ?, ?, CURRENT_TIMESTAMP);
            """, [
                current["resume_text"],
                json.dumps(current["target_titles"]),
                json.dumps(current["target_companies"]),
                json.dumps(current["skills"]),
                json.dumps(current["cleanup_blacklist"])
            ])

        return self.get_user_config()

    def save_evaluated_profile(self, profile: Dict[str, Any]) -> Dict[str, Any]:
        profile_id = profile.get("profile_id") or profile.get("linkedin_url", "")
        with self._get_connection() as con:
            con.execute("""
                INSERT OR REPLACE INTO evaluated_profiles (
                    profile_id, linkedin_url, name, headline, current_company,
                    location, about, persona, match_score, rationale,
                    suggested_note, note_status, action_decision, outreach_angle,
                    confidence, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            """, [
                profile_id,
                profile.get("linkedin_url", ""),
                profile.get("name", "Unknown"),
                profile.get("headline", ""),
                profile.get("current_company", ""),
                profile.get("location", ""),
                profile.get("about", ""),
                profile.get("persona", "Peer"),
                float(profile.get("match_score", 0.0)),
                json.dumps(profile.get("rationale", [])),
                profile.get("suggested_note", ""),
                profile.get("note_status", "draft"),
                profile.get("action_decision", "CONNECT_PEER"),
                profile.get("outreach_angle", "peer_networking"),
                float(profile.get("confidence", 0.85))
            ])
        return self.get_profile(profile_id)

    def update_profile_status(self, profile_id: str, status: str) -> bool:
        with self._get_connection() as con:
            con.execute("""
                UPDATE evaluated_profiles
                SET note_status = ?, updated_at = CURRENT_TIMESTAMP
                WHERE profile_id = ?
            """, [status, profile_id])
            return True

    def get_profile(self, profile_id: str) -> Optional[Dict[str, Any]]:
        with self._get_connection() as con:
            row = con.execute("""
                SELECT profile_id, linkedin_url, name, headline, current_company,
                       location, about, persona, match_score, rationale,
                       suggested_note, note_status, action_decision, outreach_angle,
                       confidence, created_at, updated_at
                FROM evaluated_profiles WHERE profile_id = ?
            """, [profile_id]).fetchone()

            if not row:
                return None

            return {
                "profile_id": row[0],
                "linkedin_url": row[1],
                "name": row[2],
                "headline": row[3],
                "current_company": row[4],
                "location": row[5],
                "about": row[6],
                "persona": row[7],
                "match_score": row[8],
                "rationale": json.loads(row[9]) if row[9] else [],
                "suggested_note": row[10],
                "note_status": row[11],
                "action_decision": row[12] if len(row) > 12 else "CONNECT_PEER",
                "outreach_angle": row[13] if len(row) > 13 else "peer_networking",
                "confidence": row[14] if len(row) > 14 else 0.85,
                "created_at": row[15].isoformat() if len(row) > 15 and row[15] else None,
                "updated_at": row[16].isoformat() if len(row) > 16 and row[16] else None
            }

    def list_profiles(self, limit: int = 50, persona: Optional[str] = None, min_score: Optional[float] = None) -> List[Dict[str, Any]]:
        query = "SELECT profile_id, linkedin_url, name, headline, current_company, location, persona, match_score, rationale, suggested_note, note_status, action_decision, outreach_angle, confidence, updated_at FROM evaluated_profiles WHERE 1=1"
        params = []
        if persona:
            query += " AND persona = ?"
            params.append(persona)
        if min_score is not None:
            query += " AND match_score >= ?"
            params.append(min_score)

        query += " ORDER BY updated_at DESC LIMIT ?"
        params.append(limit)

        with self._get_connection() as con:
            rows = con.execute(query, params).fetchall()
            results = []
            for r in rows:
                results.append({
                    "profile_id": r[0],
                    "linkedin_url": r[1],
                    "name": r[2],
                    "headline": r[3],
                    "current_company": r[4],
                    "location": r[5],
                    "persona": r[6],
                    "match_score": r[7],
                    "rationale": json.loads(r[8]) if r[8] else [],
                    "suggested_note": r[9],
                    "note_status": r[10],
                    "action_decision": r[11] if len(r) > 11 else "CONNECT_PEER",
                    "outreach_angle": r[12] if len(r) > 12 else "peer_networking",
                    "confidence": r[13] if len(r) > 13 else 0.85,
                    "updated_at": r[14].isoformat() if len(r) > 14 and r[14] else None
                })
            return results

    def log_cleanup_action(self, profile_url: str, name: str, headline: str, flag_reason: str, action_taken: str) -> Dict[str, Any]:
        record_id = f"{profile_url}_{datetime.now().strftime('%Y%m%d%H%M%S')}"
        with self._get_connection() as con:
            con.execute("""
                INSERT OR REPLACE INTO cleanup_records (
                    id, profile_url, name, headline, flag_reason, action_taken, action_date
                ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            """, [record_id, profile_url, name, headline, flag_reason, action_taken])

        return {
            "id": record_id,
            "profile_url": profile_url,
            "name": name,
            "headline": headline,
            "flag_reason": flag_reason,
            "action_taken": action_taken,
            "action_date": datetime.now().isoformat()
        }

    def list_cleanup_records(self, limit: int = 50) -> List[Dict[str, Any]]:
        with self._get_connection() as con:
            rows = con.execute("""
                SELECT id, profile_url, name, headline, flag_reason, action_taken, action_date
                FROM cleanup_records ORDER BY action_date DESC LIMIT ?
            """, [limit]).fetchall()
            return [{
                "id": r[0],
                "profile_url": r[1],
                "name": r[2],
                "headline": r[3],
                "flag_reason": r[4],
                "action_taken": r[5],
                "action_date": r[6].isoformat() if r[6] else None
            } for r in rows]

    def get_stats(self) -> Dict[str, Any]:
        with self._get_connection() as con:
            total_profiles = con.execute("SELECT COUNT(*) FROM evaluated_profiles").fetchone()[0]
            avg_score = con.execute("SELECT COALESCE(AVG(match_score), 0.0) FROM evaluated_profiles").fetchone()[0]
            high_matches = con.execute("SELECT COUNT(*) FROM evaluated_profiles WHERE match_score >= 70").fetchone()[0]
            notes_sent = con.execute("SELECT COUNT(*) FROM evaluated_profiles WHERE note_status = 'sent'").fetchone()[0]

            persona_counts = {}
            for row in con.execute("SELECT persona, COUNT(*) FROM evaluated_profiles GROUP BY persona").fetchall():
                persona_counts[row[0]] = row[1]

            total_cleanups = con.execute("SELECT COUNT(*) FROM cleanup_records").fetchone()[0]
            unfollowed_count = con.execute("SELECT COUNT(*) FROM cleanup_records WHERE action_taken = 'unfollowed'").fetchone()[0]
            removed_count = con.execute("SELECT COUNT(*) FROM cleanup_records WHERE action_taken = 'removed'").fetchone()[0]

            return {
                "total_profiles_evaluated": total_profiles,
                "avg_match_score": round(float(avg_score), 1),
                "high_priority_matches": high_matches,
                "notes_sent": notes_sent,
                "persona_breakdown": persona_counts,
                "cleanup_stats": {
                    "total_cleanups": total_cleanups,
                    "unfollowed": unfollowed_count,
                    "removed": removed_count
                }
            }

    def list_templates(self, persona: Optional[str] = None) -> List[Dict[str, Any]]:
        query = "SELECT id, persona, title, template_text, is_default, updated_at FROM message_templates"
        params = []
        if persona:
            query += " WHERE persona = ?"
            params.append(persona)
        query += " ORDER BY persona, is_default DESC, title"

        with self._get_connection() as con:
            rows = con.execute(query, params).fetchall()
            return [{
                "id": r[0],
                "persona": r[1],
                "title": r[2],
                "template_text": r[3],
                "is_default": bool(r[4]),
                "updated_at": r[5].isoformat() if r[5] else None
            } for r in rows]

    def get_template(self, template_id: str) -> Optional[Dict[str, Any]]:
        with self._get_connection() as con:
            r = con.execute("SELECT id, persona, title, template_text, is_default, updated_at FROM message_templates WHERE id = ?", [template_id]).fetchone()
            if not r:
                return None
            return {
                "id": r[0],
                "persona": r[1],
                "title": r[2],
                "template_text": r[3],
                "is_default": bool(r[4]),
                "updated_at": r[5].isoformat() if r[5] else None
            }

    def get_default_template_for_persona(self, persona: str) -> Optional[Dict[str, Any]]:
        with self._get_connection() as con:
            r = con.execute("SELECT id, persona, title, template_text, is_default, updated_at FROM message_templates WHERE persona = ? AND is_default = TRUE LIMIT 1", [persona]).fetchone()
            if not r:
                # fallback to any template for persona
                r = con.execute("SELECT id, persona, title, template_text, is_default, updated_at FROM message_templates WHERE persona = ? LIMIT 1", [persona]).fetchone()
            if not r:
                # fallback to first general template
                r = con.execute("SELECT id, persona, title, template_text, is_default, updated_at FROM message_templates LIMIT 1").fetchone()
            if not r:
                return None
            return {
                "id": r[0],
                "persona": r[1],
                "title": r[2],
                "template_text": r[3],
                "is_default": bool(r[4]),
                "updated_at": r[5].isoformat() if r[5] else None
            }

    def save_template(self, template_id: str, persona: str, title: str, template_text: str, is_default: bool = False) -> Dict[str, Any]:
        with self._get_connection() as con:
            if is_default:
                con.execute("UPDATE message_templates SET is_default = FALSE WHERE persona = ?", [persona])
            con.execute("""
                INSERT OR REPLACE INTO message_templates (id, persona, title, template_text, is_default, updated_at)
                VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            """, [template_id, persona, title, template_text, is_default])
        return self.get_template(template_id)

    def delete_template(self, template_id: str) -> bool:
        with self._get_connection() as con:
            con.execute("DELETE FROM message_templates WHERE id = ?", [template_id])
            return True


# Singleton database instance
db = Database()
