"""
FastAPI Server for LinkedIn Profiler, Connection Booster & Cleanup System.
Powered by Laya (System 1 Decision Engine), DuckDB, and Customizable Message Templates.
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict, Any

from backend.database import db
from backend.engine.laya_engine import engine
from backend.engine.note_generator import generate_connection_note, fill_template

app = FastAPI(title="LinkedIn JobHunt Profiler & Cleanup API", version="1.1.0")

# Enable CORS for Chrome Extension & local dev
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class UserConfigUpdate(BaseModel):
    resume_text: Optional[str] = None
    target_titles: Optional[List[str]] = None
    target_companies: Optional[List[str]] = None
    skills: Optional[List[str]] = None
    cleanup_blacklist: Optional[List[str]] = None


class ProfilePayload(BaseModel):
    linkedin_url: str
    name: str
    headline: Optional[str] = ""
    current_company: Optional[str] = ""
    location: Optional[str] = ""
    about: Optional[str] = ""
    template_id: Optional[str] = None


class TemplatePayload(BaseModel):
    id: str
    persona: str
    title: str
    template_text: str
    is_default: Optional[bool] = False


class TemplateRenderPayload(BaseModel):
    template_text: str
    profile: ProfilePayload


class StatusUpdate(BaseModel):
    profile_id: str
    status: str  # 'draft', 'sent', 'connected', 'skipped'


class CleanupCandidate(BaseModel):
    profile_url: str
    name: str
    headline: Optional[str] = ""


class CleanupBatchPayload(BaseModel):
    connections: List[CleanupCandidate]


class CleanupActionPayload(BaseModel):
    profile_url: str
    name: str
    headline: Optional[str] = ""
    flag_reason: str
    action_taken: str  # 'unfollowed', 'removed', 'kept'


@app.get("/api/health")
def health_check():
    return {
        "status": "healthy",
        "database": "connected (duckdb)",
        "laya_model_ready": engine.is_model_ready()
    }


@app.get("/api/config")
def get_config():
    return db.get_user_config()


@app.post("/api/config")
def update_config(payload: UserConfigUpdate):
    return db.update_user_config(
        resume_text=payload.resume_text,
        target_titles=payload.target_titles,
        target_companies=payload.target_companies,
        skills=payload.skills,
        cleanup_blacklist=payload.cleanup_blacklist
    )


# --- Template Management Endpoints ---

@app.get("/api/templates")
def list_templates(persona: Optional[str] = None):
    return db.list_templates(persona=persona)


@app.post("/api/templates")
def save_template(payload: TemplatePayload):
    return db.save_template(
        template_id=payload.id,
        persona=payload.persona,
        title=payload.title,
        template_text=payload.template_text,
        is_default=payload.is_default or False
    )


@app.delete("/api/templates/{template_id}")
def delete_template(template_id: str):
    success = db.delete_template(template_id)
    return {"success": success, "deleted_id": template_id}


@app.post("/api/templates/render")
def render_template(payload: TemplateRenderPayload):
    user_config = db.get_user_config()
    note = fill_template(payload.template_text, payload.profile.model_dump(), user_config)
    return {"rendered_note": note, "length": len(note)}


# --- Profile Evaluation ---

@app.post("/api/profile/evaluate")
def evaluate_profile(payload: ProfilePayload):
    user_config = db.get_user_config()
    profile_dict = payload.model_dump()

    # 1. Run Laya System 1 Evaluation (Persona + Fit Score)
    eval_result = engine.evaluate_profile(profile_dict, user_config)
    persona = eval_result["persona"]
    match_score = eval_result["match_score"]
    rationale = eval_result["rationale"]

    # 2. Get Template & Fill Slots
    chosen_template_text = None
    if payload.template_id:
        tmpl = db.get_template(payload.template_id)
        if tmpl:
            chosen_template_text = tmpl["template_text"]

    if not chosen_template_text:
        default_tmpl = db.get_default_template_for_persona(persona)
        if default_tmpl:
            chosen_template_text = default_tmpl["template_text"]

    note = generate_connection_note(profile_dict, persona, user_config, template_text=chosen_template_text)

    # 3. Retrieve available templates for this persona
    available_templates = db.list_templates(persona=persona)
    if not available_templates:
        available_templates = db.list_templates()

    # 4. Save to DuckDB
    record = {
        "profile_id": payload.linkedin_url,
        "linkedin_url": payload.linkedin_url,
        "name": payload.name,
        "headline": payload.headline or "",
        "current_company": payload.current_company or "",
        "location": payload.location or "",
        "about": payload.about or "",
        "persona": persona,
        "match_score": match_score,
        "rationale": rationale,
        "suggested_note": note,
        "note_status": "draft"
    }
    saved = db.save_evaluated_profile(record)

    return {
        "profile": saved,
        "evaluation": eval_result,
        "suggested_note": note,
        "available_templates": available_templates
    }


@app.post("/api/profile/status")
def update_profile_status(payload: StatusUpdate):
    success = db.update_profile_status(payload.profile_id, payload.status)
    return {"success": success, "profile_id": payload.profile_id, "status": payload.status}


@app.get("/api/profiles")
def list_profiles(limit: int = 50, persona: Optional[str] = None, min_score: Optional[float] = None):
    return db.list_profiles(limit=limit, persona=persona, min_score=min_score)


# --- Cleanup & Unfollow Endpoints ---

@app.post("/api/cleanup/evaluate-batch")
def evaluate_cleanup_batch(payload: CleanupBatchPayload):
    user_config = db.get_user_config()
    evaluated = []
    flagged_count = 0

    for conn in payload.connections:
        conn_dict = conn.model_dump()
        res = engine.evaluate_cleanup_candidate(conn_dict, user_config)
        if res["is_flagged"]:
            flagged_count += 1
        evaluated.append(res)

    return {
        "total": len(evaluated),
        "flagged": flagged_count,
        "results": evaluated
    }


@app.post("/api/cleanup/log-action")
def log_cleanup_action(payload: CleanupActionPayload):
    record = db.log_cleanup_action(
        profile_url=payload.profile_url,
        name=payload.name,
        headline=payload.headline or "",
        flag_reason=payload.flag_reason,
        action_taken=payload.action_taken
    )
    return {"success": True, "record": record}


@app.get("/api/cleanup/records")
def list_cleanup_records(limit: int = 50):
    return db.list_cleanup_records(limit=limit)


@app.get("/api/stats")
def get_stats():
    return db.get_stats()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.main:app", host="127.0.0.1", port=8765, reload=True)
