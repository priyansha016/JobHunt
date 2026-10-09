"""
Dedicated Test Suite: Pure Resume Comparison using Laya (Zero Target Role Configuration Required).
Tests:
1. Auto-extraction of role & skills from resume text.
2. Direct comparison of resume against LinkedIn profiles with Laya.
3. Verification that Laya model makes accurate System 1 decisions.
4. Template generation with auto-extracted resume variables.
"""

import unittest
from backend.engine.laya_engine import LayaEngine, extract_resume_profile
from backend.engine.note_generator import generate_connection_note, fill_template


class TestPureResumeMatching(unittest.TestCase):
    def setUp(self):
        self.engine = LayaEngine()
        self.sample_resume = """
Priyansha Sinha
Senior Full Stack Engineer
Summary: 6+ years building distributed backend services and responsive frontends.
Experience:
- Senior Engineer at CloudScale: Python, FastAPI, React, TypeScript, Docker, PostgreSQL, AWS, Microservices.
- Software Engineer at DataStream: Built event-driven ingestion pipelines using Kafka, Redis, and Golang.
Skills: Python, TypeScript, React, Docker, FastAPI, PostgreSQL, AWS, Microservices, Redis.
        """

    def test_resume_auto_extraction(self):
        extracted = extract_resume_profile(self.sample_resume)
        self.assertEqual(extracted["primary_role"], "Senior Full Stack Engineer")
        self.assertIn("Python", extracted["skills"])
        self.assertIn("FastAPI", extracted["skills"])
        self.assertIn("React", extracted["skills"])
        self.assertIn("Docker", extracted["skills"])

    def test_pure_resume_evaluation_recruiter(self):
        # User config has ONLY resume_text, no target titles, no target companies!
        user_config = {
            "resume_text": self.sample_resume,
            "target_titles": [],
            "target_companies": [],
            "skills": []
        }

        profile_recruiter = {
            "name": "Sarah Connor",
            "headline": "Lead Technical Recruiter at Stripe",
            "current_company": "Stripe",
            "about": "Hiring senior full stack and backend engineers for platform infra."
        }

        eval_res = self.engine.evaluate_profile(profile_recruiter, user_config)
        
        # Verify Persona and Score
        self.assertEqual(eval_res["persona"], "Recruiter / Talent Partner")
        self.assertGreaterEqual(eval_res["match_score"], 60.0)
        self.assertEqual(eval_res["detected_role"], "Senior Full Stack Engineer")

        # Test Note Generation with NO target roles provided
        note = generate_connection_note(profile_recruiter, eval_res["persona"], user_config)
        self.assertIn("Sarah", note)
        self.assertIn("Stripe", note)
        self.assertIn("Senior Full Stack Engineer", note)
        self.assertLessEqual(len(note), 300)

    def test_pure_resume_evaluation_unrelated(self):
        user_config = {
            "resume_text": self.sample_resume,
            "target_titles": [],
            "target_companies": [],
            "skills": []
        }

        profile_unrelated = {
            "name": "Bob Miller",
            "headline": "Real Estate Broker & Commercial Property Sales",
            "current_company": "Premier Properties",
            "about": "Helping buyers and sellers close commercial properties."
        }

        eval_res = self.engine.evaluate_profile(profile_unrelated, user_config)
        self.assertIn(eval_res["persona"], ["Other / General", "Peer / Potential Referral"])

    def test_template_filling_without_manual_roles(self):
        user_config = {
            "resume_text": self.sample_resume,
            "target_titles": [],
            "target_companies": [],
            "skills": []
        }

        tmpl = "Hi {first_name}, I'm a {my_role} specializing in {top_skill} and {second_skill} at {company}. Let's connect!"
        profile = {
            "name": "Jessica Taylor",
            "current_company": "Figma"
        }

        note = fill_template(tmpl, profile, user_config)
        self.assertEqual(
            note,
            "Hi Jessica, I'm a Senior Full Stack Engineer specializing in Python and TypeScript at Figma. Let's connect!"
        )
        self.assertLessEqual(len(note), 300)

    def test_priyansha_cv_extraction(self):
        import os
        cv_path = "/Users/priyanshasinha/Documents/CV/PriyanshaRS_CV.pdf"
        if not os.path.exists(cv_path):
            self.skipTest("PriyanshaRS_CV.pdf not found in Documents/CV/")

        from backend.utils.pdf_parser import extract_text_from_pdf
        with open(cv_path, "rb") as f:
            text = extract_text_from_pdf(f.read())

        info = extract_resume_profile(text)
        self.assertEqual(info["primary_role"], "Bioinformatics Engineer")
        self.assertIn("Bioinformatics", info["skills"])
        self.assertIn("Computational Genomics", info["skills"])
        self.assertIn("Machine Learning", info["skills"])
        self.assertIn("PyTorch", info["skills"])
        self.assertIn("Nextflow", info["skills"])
        self.assertIn("Python", info["skills"])


if __name__ == "__main__":
    unittest.main()

