"""
PDF text extraction and profile parsing utilities.
Supports standard resumes and LinkedIn 'Save to PDF' exports.
"""

import io
import re
from typing import Dict, Any, BinaryIO, Union
from pypdf import PdfReader


def is_valid_pdf(content: bytes) -> bool:
    """Checks if raw bytes start with PDF header."""
    return content.startswith(b"%PDF-")


def extract_text_from_pdf(source: Union[bytes, BinaryIO]) -> str:
    """
    Extracts text from a PDF file stream or raw bytes.
    Returns clean plain text with preserved line breaks.
    """
    if isinstance(source, bytes):
        stream = io.BytesIO(source)
    else:
        stream = source

    reader = PdfReader(stream)
    pages_text = []

    for i, page in enumerate(reader.pages):
        text = page.extract_text()
        if text:
            pages_text.append(text.strip())

    full_text = "\n\n".join(pages_text)
    # Normalize excessive carriage returns and non-breaking spaces
    full_text = full_text.replace("\r\n", "\n").replace("\xa0", " ")
    # Collapse multiple blank lines to at most 2
    full_text = re.sub(r"\n{3,}", "\n\n", full_text)
    return full_text.strip()


def parse_profile_from_text(raw_text: str) -> Dict[str, Any]:
    """
    Intelligently extracts candidate/contact fields from unstructured text
    (e.g., LinkedIn 'Save to PDF' export, CV text, or pasted bio).
    """
    lines = [l.strip() for l in raw_text.splitlines() if l.strip()]
    if not lines:
        return {
            "name": "Candidate",
            "headline": "Professional",
            "current_company": "",
            "location": "",
            "about": "",
            "raw_text": ""
        }

    # LinkedIn PDF format detection:
    # First 1-3 lines usually contain the Name and Headline
    name = lines[0]
    headline = ""
    current_company = ""
    location = ""
    about = ""

    # Check if first line is a common header instead of a name
    if any(h in name.lower() for h in ["curriculum vitae", "resume", "contact", "summary", "profile"]):
        if len(lines) > 1:
            name = lines[1]

    # Clean name (remove contact icons, degrees or extra junk)
    name = re.sub(r"[,|].*$", "", name).strip()
    if len(name.split()) > 4:  # If name is suspiciously long, trim to first 2-3 words
        name = " ".join(name.split()[:3])

    # Find Headline (usually line following name or containing role keywords)
    for i, line in enumerate(lines[1:6]):
        if any(role_word in line.lower() for role_word in [
            "engineer", "developer", "recruiter", "manager", "lead", "director", "head of",
            "designer", "specialist", "consultant", "architect", "scientist", "vp", "founder"
        ]):
            headline = line
            # Try to parse company from "at Company" or "@ Company" or "| Company"
            company_match = re.search(r"(?:at|@|\|)\s+([A-Za-z0-9\s&.,'-]+)", line, re.IGNORECASE)
            if company_match:
                current_company = company_match.group(1).strip()
            break

    # If headline not found from keywords, use 2nd line
    if not headline and len(lines) > 1:
        headline = lines[1]

    # Look for Location clues (e.g. "San Francisco Bay Area", "New York, NY", "London, UK", "India")
    for line in lines[1:8]:
        if any(loc_word in line.lower() for loc_word in [
            "area", "united states", "india", "canada", "germany", "united kingdom",
            "san francisco", "new york", "seattle", "austin", "bangalore", "london", "remote"
        ]):
            location = line
            break

    # Extract Summary / About section
    summary_match = re.search(
        r"(?:Summary|About|Professional Summary|Overview|Profile)\s*\n+(.*?)(?=\n+(?:Experience|Employment|Skills|Education|Certifications|\Z))",
        raw_text,
        re.DOTALL | re.IGNORECASE
    )
    if summary_match:
        about = summary_match.group(1).strip()[:1000]
    else:
        # Fallback to the first 400 chars of text after name/headline
        body_lines = [l for l in lines[2:] if len(l) > 20]
        about = " ".join(body_lines[:3])[:500] if body_lines else ""

    # Company search if still empty: look under Experience section
    if not current_company:
        exp_match = re.search(
            r"(?:Experience|Work Experience)\s*\n+(?:[^\n]+\n+)?([A-Za-z0-9\s&.,'-]{2,30})\s*(?:·|-|\n)",
            raw_text,
            re.IGNORECASE
        )
        if exp_match:
            candidate_comp = exp_match.group(1).strip()
            if not any(k in candidate_comp.lower() for k in ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec", "present"]):
                current_company = candidate_comp

    return {
        "name": name,
        "headline": headline,
        "current_company": current_company,
        "location": location,
        "about": about,
        "raw_text": raw_text
    }
