"""
Comprehensive Unit Tests for LinkedIn Profiler & Cleanup Backend:
- Database CRUD & DuckDB persistence
- Laya Decision Engine & Scoring
- Note Generator (<300 chars)
- FastAPI Endpoints (TestClient)
"""

import unittest
import os
import json
from fastapi.testclient import TestClient

from backend.database import Database
from backend.engine.laya_engine import LayaEngine
from backend.engine.note_generator import generate_connection_note
from backend.main import app


class TestDatabase(unittest.TestCase):
    def setUp(self):
        self.test_db_path = "/tmp/test_jobhunt.duckdb"
        if os.path.exists(self.test_db_path):
            os.remove(self.test_db_path)
        self.db = Database(self.test_db_path)

    def tearDown(self):
        if os.path.exists(self.test_db_path):
            os.remove(self.test_db_path)

    def test_user_config(self):
        cfg = self.db.get_user_config()
        self.assertIn("target_titles", cfg)
        
        updated = self.db.update_user_config(
            resume_text="Senior Python Developer with 6 years experience",
            target_titles=["AI Engineer", "Staff Backend"],
            target_companies=["OpenAI", "Anthropic"]
        )
        self.assertEqual(updated["resume_text"], "Senior Python Developer with 6 years experience")
        self.assertEqual(updated["target_titles"], ["AI Engineer", "Staff Backend"])
        self.assertEqual(updated["target_companies"], ["OpenAI", "Anthropic"])

    def test_save_and_retrieve_profile(self):
        prof = {
            "profile_id": "https://linkedin.com/in/test-recruiter",
            "linkedin_url": "https://linkedin.com/in/test-recruiter",
            "name": "Alex Recruiter",
            "headline": "Lead Tech Recruiter at OpenAI",
            "current_company": "OpenAI",
            "persona": "Recruiter / Talent Partner",
            "match_score": 92.5,
            "rationale": ["Direct company match", "Recruiter persona"],
            "suggested_note": "Hi Alex, would love to connect!"
        }
        saved = self.db.save_evaluated_profile(prof)
        self.assertEqual(saved["name"], "Alex Recruiter")
        self.assertEqual(saved["match_score"], 92.5)

        # Retrieve profile
        retrieved = self.db.get_profile("https://linkedin.com/in/test-recruiter")
        self.assertIsNotNone(retrieved)
        self.assertEqual(retrieved["current_company"], "OpenAI")

    def test_cleanup_record_logging(self):
        rec = self.db.log_cleanup_action(
            profile_url="https://linkedin.com/in/spammer",
            name="Spam Bot",
            headline="Crypto Signals 100x",
            flag_reason="Crypto keyword",
            action_taken="unfollowed"
        )
        self.assertEqual(rec["action_taken"], "unfollowed")
        records = self.db.list_cleanup_records()
        self.assertEqual(len(records), 1)


class TestEngineAndNotes(unittest.TestCase):
    def setUp(self):
        self.engine = LayaEngine()
        self.config = {
            "target_titles": ["Full Stack Engineer", "Backend Engineer"],
            "target_companies": ["Google", "Stripe"],
            "skills": ["Python", "TypeScript", "React"],
            "cleanup_blacklist": ["crypto", "forex", "lead generation"]
        }

    def test_persona_classification(self):
        self.assertEqual(
            self.engine.classify_persona("Senior Technical Recruiter at Stripe", "", "Stripe"),
            "Recruiter / Talent Partner"
        )
        self.assertEqual(
            self.engine.classify_persona("Director of Engineering", "Leading platform teams", "Google"),
            "Hiring Manager / Tech Lead"
        )
        self.assertEqual(
            self.engine.classify_persona("Senior Full Stack Developer", "Building web apps", "Acme"),
            "Peer / Potential Referral"
        )

    def test_note_character_limit(self):
        profile = {
            "name": "Jane Longname-Recruiter-Person",
            "headline": "Principal Global Executive Talent Acquisition Lead at Incredible Mega Corporate Enterprise Inc",
            "current_company": "Incredible Mega Corporate Enterprise Inc"
        }
        note = generate_connection_note(profile, "Recruiter / Talent Partner", self.config)
        self.assertLessEqual(len(note), 300)
        self.assertGreater(len(note), 20)
        self.assertTrue(note.startswith("Hi Jane,"))

    def test_cleanup_evaluation(self):
        conn_bad = {
            "name": "Forex Trader",
            "headline": "Financial Markets & Crypto Forex signals",
            "profile_url": "https://linkedin.com/in/forex"
        }
        res_bad = self.engine.evaluate_cleanup_candidate(conn_bad, self.config)
        self.assertTrue(res_bad["is_flagged"])
        self.assertEqual(res_bad["action"], "UNFOLLOW")

        conn_good = {
            "name": "Alice Engineer",
            "headline": "Software Engineer at Google",
            "profile_url": "https://linkedin.com/in/alice"
        }
        res_good = self.engine.evaluate_cleanup_candidate(conn_good, self.config)
        self.assertFalse(res_good["is_flagged"])
        self.assertEqual(res_good["action"], "KEEP")


class TestAPIEndpoints(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_health(self):
        res = self.client.get("/api/health")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["status"], "healthy")

    def test_evaluate_and_stats(self):
        prof_payload = {
            "linkedin_url": "https://linkedin.com/in/test-eval-user",
            "name": "David Miller",
            "headline": "Senior Engineering Manager at Google",
            "current_company": "Google",
            "location": "San Francisco, CA",
            "about": "Leading cloud infrastructure and distributed systems"
        }
        res = self.client.post("/api/profile/evaluate", json=prof_payload)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn("evaluation", data)
        self.assertIn("suggested_note", data)
        self.assertLessEqual(len(data["suggested_note"]), 300)

        # Check stats endpoint
        stats_res = self.client.get("/api/stats")
        self.assertEqual(stats_res.status_code, 200)
        stats = stats_res.json()
        self.assertGreaterEqual(stats["total_profiles_evaluated"], 1)

    def test_templates_api(self):
        # List templates
        list_res = self.client.get("/api/templates")
        self.assertEqual(list_res.status_code, 200)
        tmpls = list_res.json()
        self.assertGreaterEqual(len(tmpls), 1)

        # Save new custom template
        new_tmpl = {
            "id": "custom_lead",
            "persona": "Recruiter / Talent Partner",
            "title": "Custom Quick Intro",
            "template_text": "Hello {first_name}! I see you're building teams at {company}. Let's connect!",
            "is_default": False
        }
        save_res = self.client.post("/api/templates", json=new_tmpl)
        self.assertEqual(save_res.status_code, 200)
        self.assertEqual(save_res.json()["title"], "Custom Quick Intro")

        # Render preview
        render_payload = {
            "template_text": "Hey {first_name}, how is {company}?",
            "profile": {
                "linkedin_url": "https://linkedin.com/in/john",
                "name": "John Doe",
                "current_company": "Apple"
            }
        }
        render_res = self.client.post("/api/templates/render", json=render_payload)
        self.assertEqual(render_res.status_code, 200)
        self.assertEqual(render_res.json()["rendered_note"], "Hey John, how is Apple?")


if __name__ == "__main__":
    unittest.main()

