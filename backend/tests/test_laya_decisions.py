import unittest
from backend.engine.laya_engine import LayaEngine, extract_resume_profile
from backend.engine.note_generator import generate_connection_note


class TestLayaDecisions(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.engine = LayaEngine()

    def test_evaluate_profile_returns_typed_decisions(self):
        resume = """Bioinformatics Engineer · Computational Genomics · Machine Learning
Priyansha Sinha
Skills: Python, Nextflow, PyTorch, Multi-Omics, RNA-Seq, AWS, Docker, FastAPI"""

        candidate = {
            "name": "Sarah Connor",
            "headline": "Senior Technical Recruiter at Genentech",
            "current_company": "Genentech",
            "about": "Hiring for Computational Biology, Bioinformatics, and AI/ML teams."
        }

        result = self.engine.evaluate_profile(candidate, resume)
        self.assertIn("action_decision", result)
        self.assertIn("outreach_angle", result)
        self.assertIn("career_synergy", result)
        self.assertIn("confidence", result)
        self.assertIn("is_spam", result)
        self.assertIn(result["action_decision"], ["CONNECT_HIGH_PRIORITY", "CONNECT_PEER", "SKIP"])
        self.assertIn(result["outreach_angle"], ["recruiter_inquiry", "manager_pitch", "peer_networking"])
        self.assertTrue(result["match_score"] >= 20.0)

    def test_outreach_angle_note_generation(self):
        user_config = {
            "resume_text": "Bioinformatics Engineer with Python, Nextflow, and PyTorch",
            "skills": ["Python", "Nextflow", "PyTorch"]
        }
        profile = {
            "name": "Dr. Alex Vance",
            "current_company": "Illumina",
            "headline": "Head of Computational Genomics"
        }

        note_recruiter = generate_connection_note(profile, "Recruiter", user_config, outreach_angle="recruiter_inquiry")
        self.assertTrue(len(note_recruiter) <= 300)
        self.assertIn("opportunities", note_recruiter.lower())

        note_manager = generate_connection_note(profile, "Manager", user_config, outreach_angle="manager_pitch")
        self.assertTrue(len(note_manager) <= 300)
        self.assertIn("leadership", note_manager.lower())

        note_peer = generate_connection_note(profile, "Peer", user_config, outreach_angle="peer_networking")
        self.assertTrue(len(note_peer) <= 300)
        self.assertIn("ideas", note_peer.lower())

    def test_cleanup_evaluation(self):
        user_config = {
            "resume_text": "Bioinformatics Engineer with Python and Nextflow",
            "cleanup_blacklist": ["crypto", "forex"]
        }

        # Blacklist match
        conn_blacklist = {
            "name": "Forex Trader",
            "headline": "Forex Signals Expert",
            "profile_url": "https://linkedin.com/in/forex"
        }
        res_bl = self.engine.evaluate_cleanup_candidate(conn_blacklist, user_config)
        self.assertTrue(res_bl["is_flagged"])
        self.assertEqual(res_bl["action"], "UNFOLLOW")

        # Spam/scam candidate without explicit keyword
        conn_spam = {
            "name": "Dropship King",
            "headline": "E-commerce dropshipping coach | DM for passive income",
            "profile_url": "https://linkedin.com/in/dropship"
        }
        res_spam = self.engine.evaluate_cleanup_candidate(conn_spam, user_config)
        self.assertTrue(res_spam["is_flagged"])


if __name__ == "__main__":
    unittest.main()
