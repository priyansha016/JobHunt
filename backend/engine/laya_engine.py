"""
Laya Decision Engine for LinkedIn Profiling & Connection Cleanup.
Direct Resume-to-Profile Comparison using NandhaKishorM/laya:
- No manual target role needed: compares LinkedIn profile directly against user's resume text.
- Auto-extracts candidate role & top skills from resume text.
- Laya predicts: Persona, Relevance (noul), and Match Level (score).
- Handles cleanup decisions (KEEP, UNFOLLOW, REMOVE).
"""

import os
import re
import threading
from typing import Dict, Any, List, Tuple

_LAYA_AGENT = None
_LOADER_THREAD = None
_LOCK = threading.Lock()


def _ensure_laya_loaded():
    global _LAYA_AGENT, _LOADER_THREAD
    if _LAYA_AGENT is not None:
        return

    with _LOCK:
        if _LOADER_THREAD is not None and _LOADER_THREAD.is_alive():
            return

        def _loader():
            global _LAYA_AGENT
            try:
                import laya
                agent = laya.load("typed-decisions")
                with _LOCK:
                    _LAYA_AGENT = agent
                print("[LayaEngine] Laya agent loaded successfully.")
            except Exception as e:
                print(f"[LayaEngine] Laya agent background load note: {e}")

        _LOADER_THREAD = threading.Thread(target=_loader, daemon=True)
        _LOADER_THREAD.start()


# Common tech titles and skills dictionary for quick resume extraction
TECH_ROLES = [
    # Bioinformatics & Computational Biology
    "Bioinformatics Engineer", "Bioinformatics Scientist", "Computational Biologist",
    "Computational Genomics Scientist", "Genomics Data Scientist", "Genomics Engineer",
    "Biomedical Data Scientist", "Research Scientist",
    # AI, ML & Data
    "Machine Learning Engineer", "MLOps Engineer", "AI Engineer", "Deep Learning Engineer",
    "Data Scientist", "Applied Scientist", "Data Engineer",
    # Software & Systems
    "Staff Software Engineer", "Principal Software Engineer", "Lead Software Engineer",
    "Senior Software Engineer", "Senior Full Stack Engineer", "Senior Backend Engineer",
    "Senior Frontend Engineer", "Software Engineer", "Full Stack Developer",
    "Full Stack Engineer", "Backend Developer", "Backend Engineer", "DevOps Engineer",
    "Platform Engineer", "Cloud Engineer", "Engineering Manager", "Technical Lead"
]

COMMON_SKILLS = [
    # AI, ML, & GenAI
    "Machine Learning", "Deep Learning", "PyTorch", "TensorFlow", "Scikit-learn", "XGBoost",
    "Random Forest", "GNNs", "CNNs", "SHAP", "LangChain", "RAG", "Ollama", "Neo4j",
    "Knowledge Graphs", "NLP",
    # Bioinformatics, Genomics, & Science
    "Bioinformatics", "Computational Genomics", "NGS Analysis", "NGS", "RNA-Seq", "scRNA-Seq",
    "Multi-Omics", "Variant Calling", "WES", "Structural Bioinformatics", "Nextflow", "Seurat",
    # Languages, Data, & Frameworks
    "Python", "pandas", "NumPy", "R", "SQL", "PostgreSQL", "MySQL", "MongoDB", "Redis",
    "FastAPI", "Django", "Flask", "JavaScript", "TypeScript", "React", "Next.js", "Node.js",
    "Go", "Rust", "Java", "C++",
    # Cloud, DevOps, & Infrastructure
    "Docker", "Kubernetes", "AWS", "Azure", "GCP", "Git", "Bash", "Linux", "REST APIs"
]


def extract_resume_profile(resume_text: str) -> Dict[str, Any]:
    """
    Auto-extracts primary title and skills directly from resume text.
    Handles engineering, bioinformatics, genomics, machine learning, and data science profiles.
    """
    if not resume_text:
        return {
            "primary_role": "Bioinformatics Engineer",
            "skills": ["Python", "Machine Learning", "Bioinformatics", "Nextflow"]
        }

    resume_lower = resume_text.lower()

    # 1. Detect role: First inspect headline lines with '·' (excluding skill category lines with ':')
    detected_role = None
    for line in resume_text.splitlines()[:30]:
        line_clean = line.strip()
        if "·" in line_clean and ":" not in line_clean and any(
            k in line_clean.lower() for k in ["engineer", "scientist", "genomics", "developer", "biologist", "researcher"]
        ):
            parts = [p.strip() for p in line_clean.split("·") if p.strip()]
            if parts:
                detected_role = parts[0]
                break

    # Next check summary statements like "... Engineer with X years of experience"
    if not detected_role:
        summary_match = re.search(
            r"\b([A-Z][a-zA-Z\s]{3,35}(?:Engineer|Scientist|Biologist|Developer|Specialist))\s+with\s+\d+\s+years",
            resume_text
        )
        if summary_match:
            detected_role = summary_match.group(1).strip()

    # Next check ordered TECH_ROLES
    if not detected_role:
        for role in TECH_ROLES:
            if role.lower() in resume_lower:
                detected_role = role
                break

    detected_role = detected_role or "Software Engineer"

    # 2. Detect skills using boundary matching and preserve appearance order
    found_skills = []
    for skill in COMMON_SKILLS:
        pattern = r"(?<![a-zA-Z0-9])" + re.escape(skill.lower()) + r"(?![a-zA-Z0-9])"
        match = re.search(pattern, resume_lower)
        if match:
            found_skills.append((match.start(), skill))

    # Sort skills by order of prominence in the resume
    found_skills.sort(key=lambda x: x[0])
    detected_skills = [s[1] for s in found_skills]

    if not detected_skills:
        detected_skills = ["Python", "Machine Learning", "Data Engineering"]

    return {
        "primary_role": detected_role,
        "skills": detected_skills
    }


class LayaEngine:
    def __init__(self):
        _ensure_laya_loaded()

    def is_model_ready(self) -> bool:
        return _LAYA_AGENT is not None

    def get_agent(self):
        global _LAYA_AGENT, _LOADER_THREAD
        if _LAYA_AGENT is not None:
            return _LAYA_AGENT

        if _LOADER_THREAD is not None and _LOADER_THREAD.is_alive():
            _LOADER_THREAD.join(timeout=10)

        if _LAYA_AGENT is None:
            with _LOCK:
                if _LAYA_AGENT is None:
                    try:
                        import laya
                        _LAYA_AGENT = laya.load("typed-decisions")
                    except Exception as e:
                        print(f"[LayaEngine] get_agent error: {e}")
        return _LAYA_AGENT

    def classify_persona(self, headline: str, about: str, company: str) -> str:
        text = f"{headline} {company} {about}".lower()
        if any(k in text for k in ["recruiter", "talent acquisition", "sourcer", "headhunter", "talent partner", "staffing", "hiring"]):
            return "Recruiter / Talent Partner"
        if any(k in text for k in ["engineering manager", "director of engineering", "vp engineering", "cto", "tech lead", "head of engineering"]):
            return "Hiring Manager / Tech Lead"
        if any(k in text for k in ["software engineer", "developer", "full stack", "backend", "frontend", "sde"]):
            return "Peer / Potential Referral"
        return "Other / General"

    def evaluate_profile(self, profile: Dict[str, Any], user_config: Any) -> Dict[str, Any]:
        """
        Directly compares candidate's Resume against LinkedIn profile.
        Uses Laya for System 1 Persona, Relevance, and Fit Level.
        user_config can be a Dict containing 'resume_text' or the raw resume text string.
        """
        if isinstance(user_config, str):
            resume_text = user_config.strip()
        elif isinstance(user_config, dict):
            resume_text = (user_config.get("resume_text") or "").strip()
        else:
            resume_text = ""
        resume_info = extract_resume_profile(resume_text)

        headline = profile.get("headline", "")
        company = profile.get("current_company", "")
        about = profile.get("about", "")
        profile_name = profile.get("name", "LinkedIn Member")
        profile_summary = f"{profile_name} - {headline} at {company}. {about[:300]}"

        # Base persona from text clues
        persona = self.classify_persona(headline, about, company)
        match_score = 65.0
        rationale = []

        # 1. Run Laya System 1 Inference
        agent = self.get_agent()
        if agent is not None:
            try:
                questions = {
                    "persona": {
                        "type": "choice",
                        "instructions": "What is the primary professional persona of this LinkedIn profile?",
                        "criteria": ["recruiter", "engineering_manager", "software_peer", "unrelated"]
                    },
                    "is_relevant": {
                        "type": "noul",
                        "instructions": "Is this LinkedIn profile relevant to connect with given the candidate's resume?"
                    },
                    "match_level": {
                        "type": "score",
                        "instructions": "Rate the career relevance between this profile and candidate resume.",
                        "criteria": ["irrelevant", "low", "medium", "high", "top_tier"]
                    }
                }

                state = f"Candidate Resume:\n{resume_text[:1200] or 'Software Engineer with experience in Python and cloud systems.'}\n\nLinkedIn Profile:\n{profile_summary}"
                prediction = agent.predict(state, questions)
                answers = prediction.get("answers", {})

                # Map Persona
                raw_persona = answers.get("persona", {}).get("choice", "software_peer")
                if raw_persona == "recruiter":
                    persona = "Recruiter / Talent Partner"
                elif raw_persona == "engineering_manager":
                    persona = "Hiring Manager / Tech Lead"
                elif raw_persona == "software_peer":
                    persona = "Peer / Potential Referral"
                else:
                    persona = "Other / General"

                # Calculate Score from Laya match_level & relevance
                score_val = float(answers.get("match_level", {}).get("score", 2.0)) # 0 to 4
                is_rel_prob = float(answers.get("is_relevant", {}).get("noul", 0.5)) # 0.0 to 1.0

                # Scale to 0-100: baseline + score_val * 15 + is_rel_prob * 20
                match_score = round(min(98.0, max(20.0, 25.0 + (score_val * 12.0) + (is_rel_prob * 25.0))), 1)

            except Exception as e:
                print(f"[LayaEngine] Model inference note: {e}")

        # 2. Check overlap between Resume Skills and Profile for clear rationale
        combined_profile_text = f"{headline} {company} {about}".lower()
        shared_skills = []
        for s in resume_info["skills"]:
            if re.search(r'\b' + re.escape(s.lower()) + r'\b', combined_profile_text):
                shared_skills.append(s)

        if shared_skills:
            rationale.append(f"Shared technical domain: {', '.join(shared_skills[:4])}")

        if company:
            rationale.append(f"Company: {company}")

        if persona == "Recruiter / Talent Partner":
            rationale.append("Talent Recruiter with active tech hiring visibility")
        elif persona == "Hiring Manager / Tech Lead":
            rationale.append("Engineering Manager / Team Lead")
        else:
            rationale.append(f"Relevant tech peer in {resume_info['primary_role']}")

        return {
            "persona": persona,
            "match_score": match_score,
            "rationale": rationale,
            "detected_role": resume_info["primary_role"],
            "detected_skills": resume_info["skills"]
        }

    def evaluate_cleanup_candidate(self, connection: Dict[str, Any], user_config: Dict[str, Any]) -> Dict[str, Any]:
        """
        Evaluates an existing connection for cleanup / unfollow.
        """
        headline = (connection.get("headline") or "").lower()
        name = connection.get("name") or "Unknown"
        blacklist = [b.lower() for b in (user_config.get("cleanup_blacklist") or [])]

        flag_reason = None
        action = "KEEP"

        # Check blacklist
        for bad_word in blacklist:
            if bad_word and bad_word in headline:
                flag_reason = f"Matches blacklist keyword: '{bad_word}'"
                action = "UNFOLLOW"
                break

        # Check common spammy or irrelevant patterns
        if not flag_reason:
            spam_triggers = [
                ("crypto", "Crypto / Web3 speculative promoter"),
                ("forex", "Forex trading promoter"),
                ("lead generation", "Lead generation / agency outreach"),
                ("appointment setter", "Appointment setter"),
                ("affiliate marketer", "Affiliate marketing sales"),
                ("dropshipping", "E-commerce dropshipping"),
                ("financial advisor", "Financial sales advisor")
            ]
            for kw, reason in spam_triggers:
                if kw in headline:
                    flag_reason = reason
                    action = "UNFOLLOW"
                    break

        return {
            "profile_url": connection.get("profile_url", ""),
            "name": name,
            "headline": connection.get("headline", ""),
            "action": action,
            "flag_reason": flag_reason,
            "is_flagged": action != "KEEP"
        }


engine = LayaEngine()
