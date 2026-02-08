"""FastAPI server wrapping Google ADK agent for RAW Studio Prompt Generator."""

import base64
import json
import os
import re
import time
import uuid
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types

from prompt_agent import create_generate_agent, create_refine_agent
from motion_director import (
    create_analyst_agent,
    create_motion_writer_agent,
    create_editor_agent,
    create_refine_agent as create_motion_refine_agent,
    parse_json_from_text,
    STYLE_PRESETS,
)


# ---------------------------------------------------------------------------
# Session store (in-memory, 30-min expiry)
# ---------------------------------------------------------------------------
SESSION_TTL = 30 * 60  # 30 minutes

class SessionEntry:
    def __init__(self, session_id: str, prompts: list[dict], mode: str):
        self.session_id = session_id
        self.prompts = prompts
        self.mode = mode
        self.last_access = time.time()

sessions: dict[str, SessionEntry] = {}


def cleanup_sessions():
    """Remove sessions older than TTL."""
    now = time.time()
    expired = [sid for sid, entry in sessions.items() if now - entry.last_access > SESSION_TTL]
    for sid in expired:
        del sessions[sid]


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------
class GenerateRequest(BaseModel):
    api_key: str
    image_base64: str
    image_mime_type: str = "image/jpeg"
    mode: str = "photoset"
    count: int = Field(default=6, ge=1, le=20)
    scene_context: Optional[str] = None


class RefineRequest(BaseModel):
    api_key: str
    session_id: str
    message: str
    prompt_index: Optional[int] = None


class PromptItem(BaseModel):
    id: str
    text: str
    shotType: str
    expression: str
    pose: str
    cameraAngle: str
    negativePrompt: str = ""


class GenerateResponse(BaseModel):
    session_id: str
    prompts: list[PromptItem]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def parse_prompts_from_text(text: str) -> list[dict]:
    """Extract JSON array of prompts from agent response text."""
    # Try to find JSON array in the response
    # First, try direct parse
    cleaned = text.strip()
    
    # Remove markdown code fences if present
    cleaned = re.sub(r'^```(?:json)?\s*\n?', '', cleaned)
    cleaned = re.sub(r'\n?```\s*$', '', cleaned)
    cleaned = cleaned.strip()
    
    try:
        data = json.loads(cleaned)
        if isinstance(data, list):
            return data
    except json.JSONDecodeError:
        pass
    
    # Try to find JSON array within the text
    match = re.search(r'\[[\s\S]*?\](?=\s*$)', cleaned)
    if match:
        try:
            data = json.loads(match.group())
            if isinstance(data, list):
                return data
        except json.JSONDecodeError:
            pass
    
    # More aggressive: find anything between [ and ]
    match = re.search(r'\[[\s\S]*\]', text)
    if match:
        try:
            data = json.loads(match.group())
            if isinstance(data, list):
                return data
        except json.JSONDecodeError:
            pass
    
    raise ValueError(f"Could not parse JSON array from agent response: {text[:500]}")


def prompts_to_response(raw_prompts: list[dict]) -> list[PromptItem]:
    """Convert raw prompt dicts to PromptItem models with IDs."""
    items = []
    for p in raw_prompts:
        items.append(PromptItem(
            id=str(uuid.uuid4()),
            text=p.get("text", ""),
            shotType=p.get("shotType", ""),
            expression=p.get("expression", ""),
            pose=p.get("pose", ""),
            cameraAngle=p.get("cameraAngle", ""),
            negativePrompt=p.get("negativePrompt", p.get("negative_prompt", "")),
        ))
    return items


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    yield

app = FastAPI(
    title="RAW Studio Prompt Generator",
    description="ADK-powered agent for generating photography/storyboard prompts",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------
@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/generate", response_model=GenerateResponse)
async def generate(req: GenerateRequest):
    """Generate initial prompts from a reference image."""
    cleanup_sessions()
    
    # Set API key for this request
    os.environ["GOOGLE_API_KEY"] = req.api_key
    
    try:
        # Create agent
        agent = create_generate_agent(
            mode=req.mode,
            count=req.count,
            scene_context=req.scene_context or "",
        )
        
        # Set up session service and runner
        session_service = InMemorySessionService()
        app_name = "raw_studio"
        user_id = "user"
        session_id = str(uuid.uuid4())
        
        session = await session_service.create_session(
            app_name=app_name,
            user_id=user_id,
            session_id=session_id,
        )
        
        runner = Runner(
            agent=agent,
            app_name=app_name,
            session_service=session_service,
        )
        
        # Build the message with image
        image_bytes = base64.b64decode(req.image_base64)
        
        content = types.Content(
            role="user",
            parts=[
                types.Part.from_bytes(data=image_bytes, mime_type=req.image_mime_type),
                types.Part.from_text(text=f"Analyze this reference image and generate {req.count} prompts."),
            ],
        )
        
        # Run agent
        final_text = ""
        async for event in runner.run_async(
            user_id=user_id,
            session_id=session_id,
            new_message=content,
        ):
            if event.is_final_response() and event.content and event.content.parts:
                for part in event.content.parts:
                    if part.text:
                        final_text += part.text
        
        if not final_text:
            raise HTTPException(status_code=500, detail="Agent returned no response")
        
        # Parse prompts from response
        raw_prompts = parse_prompts_from_text(final_text)
        prompt_items = prompts_to_response(raw_prompts)
        
        # Store session
        our_session_id = str(uuid.uuid4())
        sessions[our_session_id] = SessionEntry(
            session_id=our_session_id,
            prompts=raw_prompts,
            mode=req.mode,
        )
        
        return GenerateResponse(session_id=our_session_id, prompts=prompt_items)
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/refine", response_model=GenerateResponse)
async def refine(req: RefineRequest):
    """Refine previously generated prompts based on user feedback."""
    cleanup_sessions()
    
    # Look up session
    entry = sessions.get(req.session_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Session not found or expired")
    
    entry.last_access = time.time()
    
    # Set API key for this request
    os.environ["GOOGLE_API_KEY"] = req.api_key
    
    try:
        # Create refine agent with current prompts context
        current_prompts_json = json.dumps(entry.prompts, indent=2)
        agent = create_refine_agent(
            current_prompts=current_prompts_json,
            prompt_index=req.prompt_index,
        )
        
        # Set up session service and runner
        session_service = InMemorySessionService()
        app_name = "raw_studio_refine"
        user_id = "user"
        session_id = str(uuid.uuid4())
        
        session = await session_service.create_session(
            app_name=app_name,
            user_id=user_id,
            session_id=session_id,
        )
        
        runner = Runner(
            agent=agent,
            app_name=app_name,
            session_service=session_service,
        )
        
        # Build refinement message
        content = types.Content(
            role="user",
            parts=[types.Part.from_text(text=req.message)],
        )
        
        # Run agent
        final_text = ""
        async for event in runner.run_async(
            user_id=user_id,
            session_id=session_id,
            new_message=content,
        ):
            if event.is_final_response() and event.content and event.content.parts:
                for part in event.content.parts:
                    if part.text:
                        final_text += part.text
        
        if not final_text:
            raise HTTPException(status_code=500, detail="Agent returned no response")
        
        # Parse prompts from response
        raw_prompts = parse_prompts_from_text(final_text)
        prompt_items = prompts_to_response(raw_prompts)
        
        # Update session
        entry.prompts = raw_prompts
        
        return GenerateResponse(session_id=req.session_id, prompts=prompt_items)
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ===========================================================================
# Motion Director Endpoints
# ===========================================================================

import asyncio

# ---------------------------------------------------------------------------
# Motion session store (separate from prompt sessions)
# ---------------------------------------------------------------------------
class MotionSessionEntry:
    def __init__(self, session_id: str, prompts: list[dict], scene_plan: dict, style_preset: str):
        self.session_id = session_id
        self.prompts = prompts
        self.scene_plan = scene_plan
        self.style_preset = style_preset
        self.last_access = time.time()

motion_sessions: dict[str, MotionSessionEntry] = {}


def cleanup_motion_sessions():
    """Remove motion sessions older than TTL."""
    now = time.time()
    expired = [sid for sid, entry in motion_sessions.items() if now - entry.last_access > SESSION_TTL]
    for sid in expired:
        del motion_sessions[sid]


# ---------------------------------------------------------------------------
# Motion request / response models
# ---------------------------------------------------------------------------
class MotionImageInput(BaseModel):
    base64: str
    mime_type: str = "image/jpeg"


class MotionGenerateRequest(BaseModel):
    api_key: str
    images: list[MotionImageInput]
    style_preset: str = "cinematic_narrative"
    user_note: Optional[str] = None


class MotionRefineRequest(BaseModel):
    api_key: str
    session_id: str
    message: str
    scene_index: Optional[int] = None


class MotionPromptItem(BaseModel):
    scene_index: int
    motion_prompt: str
    camera_move: str
    subject_motion: str
    duration_suggestion: str
    negative_prompt: Optional[str] = None


class MotionGenerateResponse(BaseModel):
    session_id: str
    prompts: list[MotionPromptItem]


# ---------------------------------------------------------------------------
# Helper: run a single agent with content
# ---------------------------------------------------------------------------
async def _run_agent(agent, content: types.Content, app_name: str) -> str:
    """Run an ADK agent and return the final text response."""
    session_service = InMemorySessionService()
    user_id = "user"
    session_id = str(uuid.uuid4())

    await session_service.create_session(
        app_name=app_name,
        user_id=user_id,
        session_id=session_id,
    )

    runner = Runner(
        agent=agent,
        app_name=app_name,
        session_service=session_service,
    )

    final_text = ""
    async for event in runner.run_async(
        user_id=user_id,
        session_id=session_id,
        new_message=content,
    ):
        if event.is_final_response() and event.content and event.content.parts:
            for part in event.content.parts:
                if part.text:
                    final_text += part.text

    return final_text


# ---------------------------------------------------------------------------
# POST /motion/generate
# ---------------------------------------------------------------------------
@app.post("/motion/generate", response_model=MotionGenerateResponse)
async def motion_generate(req: MotionGenerateRequest):
    """Generate Kling 2.6 I2V motion prompts for a set of images using 3-agent pipeline."""
    cleanup_motion_sessions()

    if not req.images:
        raise HTTPException(status_code=400, detail="At least one image is required")
    if len(req.images) > 10:
        raise HTTPException(status_code=400, detail="Maximum 10 images allowed")
    if req.style_preset not in STYLE_PRESETS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid style preset. Choose from: {', '.join(STYLE_PRESETS.keys())}",
        )

    # Set API key for this request
    os.environ["GOOGLE_API_KEY"] = req.api_key

    try:
        # ── STAGE 1: ANALYST ──────────────────────────────────────────────
        analyst = create_analyst_agent(
            style_preset=req.style_preset,
            user_note=req.user_note,
        )

        # Build content with ALL images
        parts: list[types.Part] = []
        for i, img in enumerate(req.images):
            image_bytes = base64.b64decode(img.base64)
            parts.append(types.Part.from_bytes(data=image_bytes, mime_type=img.mime_type))

        parts.append(types.Part.from_text(
            text=f"Analyze these {len(req.images)} images as a sequence and create a scene plan. "
                 f"Style preset: {req.style_preset}."
        ))

        analyst_content = types.Content(role="user", parts=parts)
        analyst_text = await _run_agent(analyst, analyst_content, "motion_analyst")

        if not analyst_text:
            raise HTTPException(status_code=500, detail="Analyst agent returned no response")

        scene_plan = parse_json_from_text(analyst_text)

        # Ensure scene_plan has the right number of scenes
        if isinstance(scene_plan, dict) and "scenes" in scene_plan:
            # Pad or trim scenes to match image count
            while len(scene_plan["scenes"]) < len(req.images):
                scene_plan["scenes"].append({
                    "scene_index": len(scene_plan["scenes"]),
                    "shot_type_detected": "medium shot",
                    "subject_description": "subject",
                    "environment": "ambient setting",
                    "energy_level": 5,
                    "recommended_camera_move": "slow dolly forward",
                    "recommended_subject_motion": "subtle movement",
                    "recommended_environment_motion": "ambient motion",
                    "direction_notes": "Follow style preset guidelines",
                    "duration_suggestion": "5s",
                })
            scene_plan["scenes"] = scene_plan["scenes"][:len(req.images)]
        else:
            raise HTTPException(status_code=500, detail="Analyst returned invalid scene plan format")

        # ── STAGE 2: MOTION WRITERS (parallel) ────────────────────────────
        async def write_motion_prompt(idx: int) -> dict:
            writer = create_motion_writer_agent(scene_plan, idx)
            image_bytes = base64.b64decode(req.images[idx].base64)
            writer_content = types.Content(
                role="user",
                parts=[
                    types.Part.from_bytes(data=image_bytes, mime_type=req.images[idx].mime_type),
                    types.Part.from_text(
                        text=f"Write a Kling 2.6 I2V motion prompt for scene {idx}."
                    ),
                ],
            )
            writer_text = await _run_agent(writer, writer_content, f"motion_writer_{idx}")
            if not writer_text:
                return {
                    "scene_index": idx,
                    "motion_prompt": "++slow dolly forward++, subtle ambient movement, consistent lighting",
                    "camera_move": "slow dolly forward",
                    "subject_motion": "subtle movement",
                    "duration_suggestion": "5s",
                    "negative_prompt": "sudden movements, flickering",
                }
            return parse_json_from_text(writer_text)

        writer_tasks = [write_motion_prompt(i) for i in range(len(req.images))]
        raw_motion_prompts = await asyncio.gather(*writer_tasks, return_exceptions=True)

        # Handle any exceptions in parallel tasks
        motion_prompts = []
        for i, result in enumerate(raw_motion_prompts):
            if isinstance(result, Exception):
                motion_prompts.append({
                    "scene_index": i,
                    "motion_prompt": "++slow dolly forward++, subtle ambient movement, consistent lighting",
                    "camera_move": "slow dolly forward",
                    "subject_motion": "subtle movement",
                    "duration_suggestion": "5s",
                    "negative_prompt": "sudden movements, flickering",
                })
            else:
                motion_prompts.append(result)

        # ── STAGE 3: EDITOR ───────────────────────────────────────────────
        editor = create_editor_agent(
            style_preset=req.style_preset,
            scene_plan=scene_plan,
            motion_prompts=motion_prompts,
        )

        editor_content = types.Content(
            role="user",
            parts=[types.Part.from_text(
                text="Review and polish all motion prompts for consistency and flow."
            )],
        )
        editor_text = await _run_agent(editor, editor_content, "motion_editor")

        # Parse editor output
        if editor_text:
            try:
                editor_result = parse_json_from_text(editor_text)
                if isinstance(editor_result, dict) and "prompts" in editor_result:
                    final_prompts = editor_result["prompts"]
                elif isinstance(editor_result, list):
                    final_prompts = editor_result
                else:
                    final_prompts = motion_prompts
            except (ValueError, json.JSONDecodeError):
                final_prompts = motion_prompts
        else:
            final_prompts = motion_prompts

        # Build response
        prompt_items = []
        for i, p in enumerate(final_prompts):
            prompt_items.append(MotionPromptItem(
                scene_index=p.get("scene_index", i),
                motion_prompt=p.get("motion_prompt", ""),
                camera_move=p.get("camera_move", ""),
                subject_motion=p.get("subject_motion", ""),
                duration_suggestion=p.get("duration_suggestion", "5s"),
                negative_prompt=p.get("negative_prompt"),
            ))

        # Store session for refinement
        our_session_id = str(uuid.uuid4())
        motion_sessions[our_session_id] = MotionSessionEntry(
            session_id=our_session_id,
            prompts=final_prompts,
            scene_plan=scene_plan,
            style_preset=req.style_preset,
        )

        return MotionGenerateResponse(session_id=our_session_id, prompts=prompt_items)

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ---------------------------------------------------------------------------
# POST /motion/refine
# ---------------------------------------------------------------------------
@app.post("/motion/refine", response_model=MotionGenerateResponse)
async def motion_refine(req: MotionRefineRequest):
    """Refine previously generated motion prompts based on user feedback."""
    cleanup_motion_sessions()

    entry = motion_sessions.get(req.session_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Motion session not found or expired")

    entry.last_access = time.time()
    os.environ["GOOGLE_API_KEY"] = req.api_key

    try:
        agent = create_motion_refine_agent(
            current_prompts=entry.prompts,
            scene_plan=entry.scene_plan,
            scene_index=req.scene_index,
        )

        content = types.Content(
            role="user",
            parts=[types.Part.from_text(text=req.message)],
        )

        refine_text = await _run_agent(agent, content, "motion_refine")

        if not refine_text:
            raise HTTPException(status_code=500, detail="Refine agent returned no response")

        result = parse_json_from_text(refine_text)
        if isinstance(result, dict) and "prompts" in result:
            final_prompts = result["prompts"]
        elif isinstance(result, list):
            final_prompts = result
        else:
            raise HTTPException(status_code=500, detail="Refine agent returned invalid format")

        prompt_items = []
        for i, p in enumerate(final_prompts):
            prompt_items.append(MotionPromptItem(
                scene_index=p.get("scene_index", i),
                motion_prompt=p.get("motion_prompt", ""),
                camera_move=p.get("camera_move", ""),
                subject_motion=p.get("subject_motion", ""),
                duration_suggestion=p.get("duration_suggestion", "5s"),
                negative_prompt=p.get("negative_prompt"),
            ))

        # Update session
        entry.prompts = final_prompts

        return MotionGenerateResponse(session_id=req.session_id, prompts=prompt_items)

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
