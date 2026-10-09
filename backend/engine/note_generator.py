"""
Template-Based Connection Note Generator for LinkedIn.
No AI required for messaging -- pure customizable templates with dynamic slot filling.
LinkedIn hard limit: 300 characters.

Available Template Variables:
- {first_name}: First name of recipient
- {name}: Full name of recipient
- {company}: Recipient's current company
- {my_role}: User's target job title (e.g. Senior Software Engineer)
- {top_skill}: User's primary skill (e.g. Python)
- {second_skill}: User's secondary skill (e.g. React)
- {headline}: Recipient's LinkedIn headline
- {location}: Recipient's location
"""

from typing import Dict, Any, List, Optional
import re


def fill_template(
    template_text: str,
    profile: Dict[str, Any],
    user_config: Dict[str, Any]
) -> str:
    """
    Fills a message template with profile and user target data.
    Ensures final length is strictly <= 300 characters.
    """
    full_name = (profile.get("name") or "there").strip()
    first_name = full_name.split()[0] if full_name else "there"
    company = (profile.get("current_company") or "").strip()
    headline = (profile.get("headline") or "").strip()
    location = (profile.get("location") or "").strip()

    resume_text = user_config.get("resume_text") or ""
    from backend.engine.laya_engine import extract_resume_profile
    resume_info = extract_resume_profile(resume_text)

    target_titles: List[str] = user_config.get("target_titles") or []
    skills: List[str] = user_config.get("skills") or []

    my_role = target_titles[0] if target_titles else resume_info["primary_role"]
    active_skills = skills if skills else resume_info["skills"]
    top_skill = active_skills[0] if active_skills else "software development"
    second_skill = active_skills[1] if len(active_skills) > 1 else "cloud systems"

    # Contextual fallback for company
    company_replacement = company if company else "your team"

    variables = {
        "first_name": first_name,
        "name": full_name,
        "company": company_replacement,
        "my_role": my_role,
        "top_skill": top_skill,
        "second_skill": second_skill,
        "headline": headline[:40],
        "location": location
    }

    # Safe variable replacement
    note = template_text
    for key, val in variables.items():
        note = note.replace(f"{{{key}}}", str(val))

    # Clean up double spaces or orphan formatting
    note = re.sub(r'\s+', ' ', note).strip()

    # If company was missing and text now says "at your team", polish phrasing
    note = note.replace(" at your team", "")

    # Strict enforcement of LinkedIn 300 character limit
    if len(note) > 300:
        # Trim gracefully
        note = note[:297].rstrip() + "..."

    return note


def generate_connection_note(
    profile: Dict[str, Any],
    persona: str,
    user_config: Dict[str, Any],
    template_text: Optional[str] = None
) -> str:
    """
    Generates a personalized connection request note from a chosen template or persona default.
    """
    if template_text:
        return fill_template(template_text, profile, user_config)

    # Built-in defaults per persona if no custom template provided
    default_templates = {
        "Recruiter / Talent Partner": (
            "Hi {first_name}, noticed you lead tech hiring at {company}. "
            "I'm a {my_role} specializing in {top_skill}. "
            "Would love to connect and keep in touch for upcoming opportunities on your radar!"
        ),
        "Hiring Manager / Tech Lead": (
            "Hi {first_name}, saw your engineering leadership at {company}. "
            "I'm a {my_role} focused on {top_skill}. "
            "Really admire your team's work and would value connecting with you here!"
        ),
        "Peer / Potential Referral": (
            "Hi {first_name}, always great connecting with fellow engineers at {company}! "
            "I work across {top_skill} and would love to connect, follow your work, and exchange ideas."
        ),
        "Other / General": (
            "Hi {first_name}, came across your profile at {company}. "
            "As a {my_role}, I'd love to connect and expand our professional network here on LinkedIn!"
        )
    }

    chosen = default_templates.get(persona, default_templates["Other / General"])
    return fill_template(chosen, profile, user_config)
