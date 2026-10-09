"""
Unit & Integration Tests for PDF Upload, Text Extraction, and Laya Matching.
Tests both PDF files and raw text inputs for user resume and target candidate profiles.
"""

import io
import unittest
from fastapi.testclient import TestClient

from backend.main import app
from backend.database import db
from backend.utils.pdf_parser import is_valid_pdf, extract_text_from_pdf, parse_profile_from_text


def make_sample_pdf_bytes(name: str, headline: str, company: str, about: str) -> bytes:
    """Creates a valid PDF binary payload with embedded text stream."""
    stream_content = f"BT\n/F1 12 Tf\n72 712 Td\n({name}) Tj\n0 -20 Td\n({headline}) Tj\n0 -20 Td\n({company}) Tj\n0 -20 Td\n({about}) Tj\nET\n".encode("utf-8")
    length = len(stream_content)
    
    pdf_content = (
        b"%PDF-1.4\n"
        b"1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n"
        b"2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n"
        b"3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n"
        b"4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n"
        b"5 0 obj\n<< /Length " + str(length).encode("utf-8") + b" >>\nstream\n"
        + stream_content +
        b"endstream\nendobj\n"
        b"xref\n0 6\n0000000000 65535 f \n"
        b"trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n350\n%%EOF\n"
    )
    return pdf_content


class TestPDFAndTextMatcher(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        # Ensure clean state with a default software resume
        db.update_user_config(
            resume_text="Senior Full Stack Engineer with 6 years experience in Python, FastAPI, React, TypeScript, and DuckDB."
        )

    def test_pdf_validation(self):
        valid = b"%PDF-1.4 sample content"
        invalid = b"Not a pdf file header"
        self.assertTrue(is_valid_pdf(valid))
        self.assertFalse(is_valid_pdf(invalid))

    def test_pdf_text_extraction(self):
        pdf_bytes = make_sample_pdf_bytes(
            name="Alice Smith",
            headline="Lead Recruiter @ Snowflake",
            company="Snowflake",
            about="Scaling distributed database teams"
        )
        text = extract_text_from_pdf(pdf_bytes)
        self.assertIn("Alice Smith", text)
        self.assertIn("Snowflake", text)

    def test_parse_profile_from_unstructured_text(self):
        raw = """
        John Doe
        Engineering Manager at Datadog | Distributed Systems
        New York, NY

        Summary
        Leading high throughput observability engineering teams.
        """
        parsed = parse_profile_from_text(raw)
        self.assertEqual(parsed["name"], "John Doe")
        self.assertIn("Engineering Manager", parsed["headline"])
        self.assertEqual(parsed["current_company"], "Datadog")
        self.assertIn("New York", parsed["location"])
        self.assertIn("observability", parsed["about"])

    def test_endpoint_upload_resume_pdf(self):
        resume_pdf = make_sample_pdf_bytes(
            name="Candidate Alex",
            headline="Staff Software Engineer",
            company="Tech Corp",
            about="Expert in Python, React, and Cloud infrastructure."
        )
        files = {"file": ("my_resume.pdf", io.BytesIO(resume_pdf), "application/pdf")}
        response = self.client.post("/api/resume/upload-pdf", files=files)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data["success"])
        self.assertEqual(data["detected_role"], "Staff Software Engineer")
        self.assertIn("Python", data["detected_skills"])

        # Verify DuckDB updated
        config = db.get_user_config()
        self.assertIn("Candidate Alex", config["resume_text"])

    def test_endpoint_match_profile_pdf(self):
        candidate_pdf = make_sample_pdf_bytes(
            name="Jessica Miller",
            headline="Senior Technical Recruiter at Stripe",
            company="Stripe",
            about="Recruiting backend and full stack engineers for core payments."
        )
        files = {"file": ("jessica_stripe.pdf", io.BytesIO(candidate_pdf), "application/pdf")}
        response = self.client.post("/api/profile/match-pdf", files=files)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["source"], "pdf")
        self.assertEqual(data["profile"]["name"], "Jessica Miller")
        self.assertEqual(data["evaluation"]["persona"], "Recruiter / Talent Partner")
        self.assertGreater(data["evaluation"]["match_score"], 40.0)
        # Note limit enforcement
        self.assertLessEqual(len(data["suggested_note"]), 300)
        self.assertIn("Jessica", data["suggested_note"])

    def test_endpoint_match_profile_text(self):
        payload = {
            "raw_text": """
            David Park
            Director of Engineering at Stripe
            San Francisco, CA
            Leading core infrastructure and database engineering.
            """,
            "save_to_db": True
        }
        response = self.client.post("/api/profile/match-text", json=payload)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["source"], "text")
        self.assertEqual(data["profile"]["name"], "David Park")
        self.assertEqual(data["evaluation"]["persona"], "Hiring Manager / Tech Lead")
        self.assertLessEqual(len(data["suggested_note"]), 300)
        self.assertIsNotNone(data["saved_record"])

    def test_endpoint_extract_pdf_text_utility(self):
        pdf_bytes = make_sample_pdf_bytes(
            name="Test User",
            headline="Architect",
            company="Acme",
            about="Cloud"
        )
        files = {"file": ("doc.pdf", io.BytesIO(pdf_bytes), "application/pdf")}
        response = self.client.post("/api/pdf/extract-text", files=files)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("Test User", data["text"])
        self.assertGreater(data["char_count"], 0)


if __name__ == "__main__":
    unittest.main()
