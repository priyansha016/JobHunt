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
        Uses Laya System 1 Decision Engine for:
        - action_decision: CONNECT_HIGH_PRIORITY, CONNECT_PEER, SKIP
        - persona: Recruiter, Hiring Manager, Tech Peer, Other
        - outreach_angle: recruiter_inquiry, manager_pitch, peer_networking
        - career_synergy / match_score: calibrated 0-100%
        - is_spam: account safety and spam detection
        - confidence: calibrated model confidence
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

        # Baseline defaults
        persona = self.classify_persona(headline, about, company)
        action_decision = "CONNECT_PEER"
        outreach_angle = "peer_networking"
        if persona == "Recruiter / Talent Partner":
            action_decision = "CONNECT_HIGH_PRIORITY"
            outreach_angle = "recruiter_inquiry"
        elif persona == "Hiring Manager / Tech Lead":
            action_decision = "CONNECT_HIGH_PRIORITY"
            outreach_angle = "manager_pitch"

        career_synergy = 2.4
        is_spam = False
        confidence = 0.85
        rationale = []

        # 1. Run Laya System 1 Typed Decisions
        agent = self.get_agent()
        if agent is not None:
            try:
                questions = {
                    "action_decision": {
                        "type": "choice",
                        "instructions": "What automation action should be taken for target_profile given candidate_resume?",
                        "criteria": {
                            "connect_high_priority": "target hiring manager, director, or specialized tech recruiter in candidate field",
                            "connect_peer": "relevant engineer, scientist, or researcher in technical domain",
                            "skip_mismatch_or_spam": "unrelated profession, crypto/forex promoter, spam, coach, or no synergy"
                        }
                    },
                    "persona": {
                        "type": "choice",
                        "instructions": "What is the primary professional persona of target_profile?",
                        "criteria": {
                            "recruiter": "technical recruiter, talent acquisition, headhunter, or staffing specialist",
                            "hiring_manager": "engineering manager, director, head of department, or team lead",
                            "tech_peer": "engineer, scientist, developer, researcher, or computational peer",
                            "unrelated": "sales, coach, marketer, crypto/forex promoter, or unrelated field"
                        }
                    },
                    "outreach_angle": {
                        "type": "choice",
                        "instructions": "What is the most effective outreach angle for this profile?",
                        "criteria": {
                            "recruiter_inquiry": "inquire about active open roles and hiring on their teams",
                            "manager_pitch": "highlight technical synergy, domain expertise, and project impact",
                            "peer_networking": "connect as a technical peer to exchange insights and discuss common tools"
                        }
                    },
                    "career_synergy": {
                        "type": "score",
                        "instructions": "Rate the career synergy between target_profile and candidate_resume.",
                        "criteria": [
                            "none: completely unrelated profession or spam",
                            "low: distant field or minimal overlap",
                            "medium: relevant technical or biological domain peer",
                            "high: strong domain overlap or technical leadership",
                            "exceptional: direct hiring decision maker or perfect recruiter match"
                        ]
                    },
                    "is_spam_or_solicitation": {
                        "type": "noul",
                        "instructions": "Does target_profile represent spam, financial coaching, or unsolicited sales promotion?"
                    }
                }

                state = f"Candidate Resume:\n{resume_text[:1200] or 'Bioinformatics Engineer with Python, Nextflow, and Machine Learning.'}\n\nTarget LinkedIn Profile:\n{profile_summary}"
                prediction = agent.predict(state, questions)
                answers = prediction.get("answers", {})

                # Action Decision
                raw_act = answers.get("action_decision", {}).get("choice", "connect_peer")
                if raw_act == "connect_high_priority":
                    action_decision = "CONNECT_HIGH_PRIORITY"
                elif raw_act == "connect_peer":
                    action_decision = "CONNECT_PEER"
                else:
                    action_decision = "SKIP"

                # Persona
                raw_persona = answers.get("persona", {}).get("choice", "tech_peer")
                if raw_persona == "recruiter":
                    persona = "Recruiter / Talent Partner"
                elif raw_persona == "hiring_manager":
                    persona = "Hiring Manager / Tech Lead"
                elif raw_persona == "tech_peer":
                    persona = "Peer / Potential Referral"
                else:
                    persona = "Other / General"

                # Outreach Angle
                outreach_angle = answers.get("outreach_angle", {}).get("choice", "peer_networking")

                # Career Synergy & Spam probability
                career_synergy = float(answers.get("career_synergy", {}).get("score", 2.2))
                is_spam_prob = float(answers.get("is_spam_or_solicitation", {}).get("noul", 0.1))
                confidence = float(answers.get("action_decision", {}).get("answer_confidence", 0.85))

                if is_spam_prob > 0.5:
                    is_spam = True
                    action_decision = "SKIP"
                    rationale.append(f"Flagged by Laya: High solicitation/spam probability ({round(is_spam_prob*100)}%)")

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

        # 3. Calculate Calibrated Match Score (0 - 100)
        base_calc = 32.0 + (career_synergy * 15.5)
        if shared_skills:
            base_calc += min(12.0, len(shared_skills) * 4.0)
        if is_spam:
            base_calc = max(10.0, base_calc - 45.0)

        match_score = round(min(99.0, max(15.0, base_calc)), 1)

        return {
            "persona": persona,
            "match_score": match_score,
            "action_decision": action_decision,
            "outreach_angle": outreach_angle,
            "career_synergy": round(career_synergy, 2),
            "is_spam": is_spam,
            "confidence": round(confidence, 3),
            "rationale": rationale,
            "detected_role": resume_info["primary_role"],
            "detected_skills": resume_info["skills"]
        }

    def evaluate_cleanup_candidate(self, connection: Dict[str, Any], user_config: Dict[str, Any]) -> Dict[str, Any]:
        """
        Evaluates an existing connection for cleanup / unfollow using Laya System 1 Decisions + Blacklist.
        """
        headline = (connection.get("headline") or "").strip()
        headline_lower = headline.lower()
        name = connection.get("name") or "Unknown"
        blacklist = [b.lower() for b in (user_config.get("cleanup_blacklist") or [])]
        resume_text = (user_config.get("resume_text") or "").strip()
        resume_info = extract_resume_profile(resume_text)

        flag_reason = None
        action = "KEEP"
        confidence = 0.88

        # 1. Fast User Blacklist Check
        for bad_word in blacklist:
            if bad_word and bad_word in headline_lower:
                flag_reason = f"Matches blacklist keyword: '{bad_word}'"
                action = "UNFOLLOW"
                break

        # 2. Laya System 1 Cleanup Decision
        if not flag_reason:
            agent = self.get_agent()
            if agent is not None and headline:
                try:
                    cleanup_questions = {
                        "cleanup_action": {
                            "type": "choice",
                            "instructions": "Given the user career in tech, what cleanup action should be taken for this connection?",
                            "criteria": {
                                "keep": "valuable tech connection, industry peer, engineer, scientist, or recruiter",
                                "unfollow": "harmless but noisy connection clogging the feed with off-topic sales, real estate, coaching, or MLM",
                                "remove_disconnect": "blatant spam, crypto/forex promoter, fake account, or aggressive sales pitch"
                            }
                        },
                        "is_spam_or_solicitation": {
                            "type": "noul",
                            "instructions": "Does this connection represent spam, speculative finance, or aggressive solicitation?"
                        }
                    }
                    state = f"User Career:\n{resume_info['primary_role']} with skills {', '.join(resume_info['skills'][:5])}\n\nExisting LinkedIn Connection:\n{name} - {headline}"
                    pred = agent.predict(state, cleanup_questions)
                    answers = pred.get("answers", {})

                    cleanup_choice = answers.get("cleanup_action", {}).get("choice", "keep")
                    is_spam_prob = float(answers.get("is_spam_or_solicitation", {}).get("noul", 0.0))
                    confidence = float(answers.get("cleanup_action", {}).get("answer_confidence", 0.8))

                    if is_spam_prob > 0.5 or cleanup_choice == "remove_disconnect":
                        action = "REMOVE"
                        flag_reason = f"Laya Decision: Spam or solicitation detected ({round(is_spam_prob*100)}% risk)"
                    elif cleanup_choice == "unfollow":
                        action = "UNFOLLOW"
                        flag_reason = "Laya Decision: Off-topic feed noise / non-aligned connection"
                    else:
                        action = "KEEP"
                except Exception as e:
                    print(f"[LayaEngine] Cleanup evaluation note: {e}")

        # 3. Fallback Heuristic Pattern Check
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
                if kw in headline_lower:
                    flag_reason = reason
                    action = "UNFOLLOW"
                    break

        return {
            "profile_url": connection.get("profile_url", ""),
            "name": name,
            "headline": connection.get("headline", ""),
            "action": action,
            "flag_reason": flag_reason,
            "is_flagged": action != "KEEP",
            "confidence": round(confidence, 3)
        }


engine = LayaEngine()
