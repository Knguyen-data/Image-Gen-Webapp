"""FastAPI server wrapping Google ADK agent for RAW Studio Prompt Generator."""

import base64
import json
import logging
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

# ---------------------------------------------------------------------------
# Logging setup
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("motion-pipeline")
from motion_director import (
    create_config_agent,
    create_analyst_agent,  # legacy alias
    create_motion_writer_agent,
    create_editor_agent,
    create_refine_agent as create_motion_refine_agent,
    build_pipeline_state,
    parse_json_from_text,
    STYLE_PRESETS,
    # Motion Control (Pipeline B) agents
    create_video_analyzer_agent,
    create_mc_config_agent,
    create_mc_context_writer_agent,
    create_mc_editor_agent,
    create_mc_refine_agent as create_mc_motion_refine_agent,
    build_mc_pipeline_state,
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
    def __init__(
        self,
        session_id: str,
        prompts: list[dict],
        scene_plan: dict,
        style_preset: str,
        pipeline_type: str = "pro-i2v",
        pipeline_state: dict = None,
        final_order: list[int] = None,
        video_analysis: dict = None,
        character_orientation: str = None,
        keep_original_sound: bool = None,
    ):
        self.session_id = session_id
        self.prompts = prompts
        self.scene_plan = scene_plan
        self.style_preset = style_preset
        self.pipeline_type = pipeline_type  # "pro-i2v" or "motion-control"
        self.pipeline_state = pipeline_state or {}
        self.final_order = final_order  # The final scene order (editor may override config agent)
        self.video_analysis = video_analysis  # Motion Control: video analysis result
        self.character_orientation = character_orientation  # Motion Control: "image" or "video"
        self.keep_original_sound = keep_original_sound  # Motion Control: bool
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
    # Pipeline type: "pro-i2v" (Pipeline A) or "motion-control" (Pipeline B)
    pipeline_type: str = "pro-i2v"
    # Motion Control only fields
    global_reference_video_base64: Optional[str] = None
    global_reference_video_mime_type: str = "video/mp4"
    character_orientation: Optional[str] = None  # "image" or "video" for Motion Control
    keep_original_sound: bool = True


class MotionRefineRequest(BaseModel):
    api_key: str
    session_id: str
    message: str
    scene_index: Optional[int] = None


class StructuredPrompt(BaseModel):
    scene: str = ""
    action: str = ""
    camera: str = ""
    audio_dialogue: str = "No dialogue"
    audio_ambience_sfx: str = ""
    music: str = "None"
    avoid: str = ""


class MotionPromptItem(BaseModel):
    scene_index: int
    motion_prompt: str
    structured_prompt: Optional[StructuredPrompt] = None
    camera_move: str
    subject_motion: str
    duration_suggestion: str
    negative_prompt: Optional[str] = None


class MotionGenerateResponse(BaseModel):
    session_id: str
    prompts: list[MotionPromptItem]
    recommended_order: Optional[list[int]] = None
    order_reasoning: Optional[str] = None
    # Pipeline identification
    pipeline_type: str = "pro-i2v"
    # Motion Control only: video analysis output
    video_analysis: Optional[dict] = None


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
# Pipeline A: Pro I2V (kling-2.6-pro) — 3-agent pipeline
# ---------------------------------------------------------------------------
async def _run_pro_i2v_pipeline(req: MotionGenerateRequest) -> MotionGenerateResponse:
    """Run Pipeline A: Pro I2V (kling-2.6-pro) — 3-agent pipeline.

    Pipeline: Config Agent → Motion Writers (parallel) → Editor Agent
    All agents share pipeline_state for chain-of-thought continuity.
    """
    pipeline_start = time.time()
    log.info("=" * 60)
    log.info("PIPELINE A (Pro I2V) START — %d images, style=%s", len(req.images), req.style_preset)
    if req.user_note:
        log.info("User note: %s", req.user_note)

    try:
        # ── STAGE 1: CONFIG AGENT ─────────────────────────────────────────
        log.info("─── STAGE 1: CONFIG AGENT ───")
        config_agent = create_config_agent(
            style_preset=req.style_preset,
            user_note=req.user_note,
        )

        # Build content with ALL images
        parts: list[types.Part] = []
        for i, img in enumerate(req.images):
            image_bytes = base64.b64decode(img.base64)
            parts.append(types.Part.from_bytes(data=image_bytes, mime_type=img.mime_type))

        parts.append(types.Part.from_text(
            text=f"Analyze these {len(req.images)} images as a sequence. "
                 f"Plan the scene sequence, recommend the optimal order for minimal editing. "
                 f"Style preset: {req.style_preset}."
        ))

        config_content = types.Content(role="user", parts=parts)
        config_text = await _run_agent(config_agent, config_content, "config_agent")

        if not config_text:
            raise HTTPException(status_code=500, detail="Config agent returned no response")

        log.info("Config Agent raw response length: %d chars", len(config_text))
        log.debug("Config Agent raw: %s", config_text[:500])

        scene_plan = parse_json_from_text(config_text)

        # Ensure scene_plan has the right number of scenes
        if isinstance(scene_plan, dict) and "scenes" in scene_plan:
            while len(scene_plan["scenes"]) < len(req.images):
                scene_plan["scenes"].append({
                    "scene_index": len(scene_plan["scenes"]),
                    "original_position": len(scene_plan["scenes"]),
                    "shot_type_detected": "medium shot",
                    "subject_description": "subject",
                    "environment": "ambient setting",
                    "color_temperature": "neutral",
                    "energy_level": 5,
                    "recommended_camera_move": "steady dolly forward",
                    "recommended_subject_motion": "subtle movement",
                    "recommended_environment_motion": "ambient motion",
                    "recommended_audio": {
                        "dialogue": "none",
                        "ambience": "ambient room tone",
                        "sfx": "none",
                        "music": "none",
                    },
                    "direction_notes": "Follow style preset guidelines",
                    "duration_suggestion": "5s",
                    "transition_to_next": "natural cut",
                })
            scene_plan["scenes"] = scene_plan["scenes"][:len(req.images)]
        else:
            raise HTTPException(status_code=500, detail="Config agent returned invalid scene plan format")

        # Ensure recommended_order exists
        if "recommended_order" not in scene_plan:
            scene_plan["recommended_order"] = list(range(len(req.images)))

        log.info("Config Agent done — %d scenes planned", len(scene_plan["scenes"]))
        log.info("Recommended order: %s", scene_plan["recommended_order"])
        log.info("Mood arc: %s", scene_plan.get("overall_mood_arc", "n/a"))
        log.info("Pacing: %s", scene_plan.get("pacing_curve", "n/a"))
        log.info("Audio arc: %s", scene_plan.get("audio_arc", "n/a"))
        for s in scene_plan["scenes"]:
            log.info("  Scene %d: energy=%s, camera=%s, duration=%s",
                     s.get("scene_index", "?"), s.get("energy_level", "?"),
                     s.get("recommended_camera_move", "?"), s.get("duration_suggestion", "?"))

        # Build shared pipeline state
        pipeline_state = build_pipeline_state(
            scene_plan=scene_plan,
            style_preset=req.style_preset,
        )

        # ── STAGE 2: MOTION WRITERS (parallel, with shared context) ──────
        recommended_order = scene_plan["recommended_order"]
        log.info("─── STAGE 2: MOTION WRITERS (%d parallel) ───", len(req.images))

        async def write_motion_prompt(idx: int) -> dict:
            # Find this scene's position in the recommended sequence
            try:
                seq_pos = recommended_order.index(idx)
            except ValueError:
                seq_pos = idx

            writer = create_motion_writer_agent(pipeline_state, idx, seq_pos)
            image_bytes = base64.b64decode(req.images[idx].base64)
            writer_content = types.Content(
                role="user",
                parts=[
                    types.Part.from_bytes(data=image_bytes, mime_type=req.images[idx].mime_type),
                    types.Part.from_text(
                        text=f"Write a full Kling 2.6 structured prompt (visual + audio) for scene {idx}. "
                             f"This scene is at position {seq_pos} in the final sequence."
                    ),
                ],
            )
            writer_text = await _run_agent(writer, writer_content, f"motion_writer_{idx}")
            if not writer_text:
                return {
                    "scene_index": idx,
                    "structured_prompt": {
                        "scene": "Ambient setting, natural lighting",
                        "action": "Subtle ambient movement",
                        "camera": "++steady dolly forward++",
                        "audio_dialogue": "No dialogue",
                        "audio_ambience_sfx": "Quiet room tone",
                        "music": "None",
                        "avoid": "sudden movements, flickering",
                    },
                    "motion_prompt": "++steady dolly forward++, subtle ambient movement, consistent lighting",
                    "camera_move": "steady dolly forward",
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
                log.warning("Writer %d FAILED: %s", i, str(result))
                motion_prompts.append({
                    "scene_index": i,
                    "structured_prompt": {
                        "scene": "Ambient setting, natural lighting",
                        "action": "Subtle ambient movement",
                        "camera": "++steady dolly forward++",
                        "audio_dialogue": "No dialogue",
                        "audio_ambience_sfx": "Quiet room tone",
                        "music": "None",
                        "avoid": "sudden movements, flickering",
                    },
                    "motion_prompt": "++steady dolly forward++, subtle ambient movement, consistent lighting",
                    "camera_move": "steady dolly forward",
                    "subject_motion": "subtle movement",
                    "duration_suggestion": "5s",
                    "negative_prompt": "sudden movements, flickering",
                })
            else:
                log.info("Writer %d OK — prompt: %.80s...", i, result.get("motion_prompt", "")[:80])
                motion_prompts.append(result)

        log.info("All writers done — %d/%d succeeded",
                 sum(1 for r in raw_motion_prompts if not isinstance(r, Exception)), len(req.images))

        # Update pipeline state with writer outputs
        pipeline_state["motion_prompts"] = motion_prompts

        # ── STAGE 3: EDITOR AGENT ─────────────────────────────────────────
        log.info("─── STAGE 3: EDITOR AGENT ───")
        editor = create_editor_agent(
            style_preset=req.style_preset,
            pipeline_state=pipeline_state,
            motion_prompts=motion_prompts,
        )

        editor_content = types.Content(
            role="user",
            parts=[types.Part.from_text(
                text="Review all motion prompts for consistency, flow, and audio continuity. "
                     "Verify or improve the scene order. Polish all prompts."
            )],
        )
        editor_text = await _run_agent(editor, editor_content, "editor_agent")

        # Parse editor output
        final_order = recommended_order
        order_reasoning = scene_plan.get("order_reasoning", "")

        log.info("Editor raw response length: %d chars", len(editor_text) if editor_text else 0)

        if editor_text:
            try:
                editor_result = parse_json_from_text(editor_text)
                if isinstance(editor_result, dict) and "prompts" in editor_result:
                    final_prompts = editor_result["prompts"]
                    # Check if editor changed the order
                    if editor_result.get("order_changed") and "final_order" in editor_result:
                        final_order = editor_result["final_order"]
                        order_reasoning = editor_result.get("order_change_reason", order_reasoning)
                        log.info("⚡ Editor CHANGED order: %s — reason: %s", final_order, order_reasoning)
                    elif "final_order" in editor_result:
                        final_order = editor_result["final_order"]
                        log.info("Editor confirmed order: %s", final_order)
                    # Capture editor notes
                    pipeline_state["editor_notes"] = editor_result.get("review_notes", "")
                    log.info("Editor notes: %s", editor_result.get("review_notes", "n/a"))
                elif isinstance(editor_result, list):
                    final_prompts = editor_result
                else:
                    final_prompts = motion_prompts
            except (ValueError, json.JSONDecodeError):
                final_prompts = motion_prompts
        else:
            final_prompts = motion_prompts

        # Build response with structured prompts
        prompt_items = []
        for i, p in enumerate(final_prompts):
            # Parse structured_prompt if present
            sp = p.get("structured_prompt")
            structured = None
            if sp and isinstance(sp, dict):
                structured = StructuredPrompt(
                    scene=sp.get("scene", ""),
                    action=sp.get("action", ""),
                    camera=sp.get("camera", ""),
                    audio_dialogue=sp.get("audio_dialogue", "No dialogue"),
                    audio_ambience_sfx=sp.get("audio_ambience_sfx", ""),
                    music=sp.get("music", "None"),
                    avoid=sp.get("avoid", ""),
                )

            prompt_items.append(MotionPromptItem(
                scene_index=p.get("scene_index", i),
                motion_prompt=p.get("motion_prompt", ""),
                structured_prompt=structured,
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
            pipeline_type="pro-i2v",
            pipeline_state=pipeline_state,
            final_order=final_order,
        )

        elapsed = time.time() - pipeline_start
        log.info("=" * 60)
        log.info("PIPELINE A COMPLETE — %.1fs total, %d prompts, order=%s, session=%s",
                 elapsed, len(prompt_items), final_order, our_session_id[:8])
        for i, p in enumerate(prompt_items):
            log.info("  Final prompt %d: %.100s", i, p.motion_prompt[:100])
        log.info("=" * 60)

        return MotionGenerateResponse(
            session_id=our_session_id,
            prompts=prompt_items,
            recommended_order=final_order,
            order_reasoning=order_reasoning,
            pipeline_type="pro-i2v",
        )

    except HTTPException:
        raise
    except Exception as e:
        log.error("PIPELINE A FAILED: %s", str(e), exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# ---------------------------------------------------------------------------
# Pipeline B: Motion Control (kling-2.6) — 4-agent pipeline
# ---------------------------------------------------------------------------
async def _run_motion_control_pipeline(req: MotionGenerateRequest) -> MotionGenerateResponse:
    """Run Pipeline B: Motion Control (kling-2.6) — 4-agent pipeline.

    Pipeline: Video Analyzer → MC Config → MC Context Writers (parallel) → MC Editor
    Key difference from Pipeline A: Context-only prompts (no motion description).
    Reference video defines motion, prompt defines scene/environment/style.
    """
    # Validate required fields for Motion Control
    if not req.global_reference_video_base64:
        raise HTTPException(status_code=400, detail="Motion Control requires global_reference_video_base64")
    if not req.character_orientation:
        raise HTTPException(status_code=400, detail="Motion Control requires character_orientation ('image' or 'video')")

    pipeline_start = time.time()
    log.info("=" * 60)
    log.info("PIPELINE B (Motion Control) START — %d images, style=%s, orientation=%s",
             len(req.images), req.style_preset, req.character_orientation)
    if req.user_note:
        log.info("User note: %s", req.user_note)

    try:
        # Decode reference video
        video_bytes = base64.b64decode(req.global_reference_video_base64)
        log.info("Reference video size: %d bytes", len(video_bytes))

        # ── STAGE 1: VIDEO ANALYZER ──────────────────────────────────────
        log.info("─── STAGE 1: VIDEO ANALYZER ───")
        video_analyzer = create_video_analyzer_agent()

        video_content = types.Content(
            role="user",
            parts=[
                types.Part.from_bytes(data=video_bytes, mime_type=req.global_reference_video_mime_type),
                types.Part.from_text(text="Analyze this reference video. Extract camera movements, subject motion patterns, energy curve, beat detection, color grading, and key visual elements in motion."),
            ],
        )
        video_analysis_text = await _run_agent(video_analyzer, video_content, "video_analyzer")

        if not video_analysis_text:
            raise HTTPException(status_code=500, detail="Video analyzer returned no response")

        log.info("Video Analyzer raw response length: %d chars", len(video_analysis_text))
        video_analysis = parse_json_from_text(video_analysis_text)

        log.info("Video Analysis: camera=%s, subject=%s, energy=%s",
                 video_analysis.get("subject_motion_patterns", {}).get("activity", "n/a"),
                 video_analysis.get("subject_motion_patterns", {}).get("energy_level", "n/a"),
                 video_analysis.get("color_grading", {}).get("temperature", "n/a"))

        # ── STAGE 2: MC CONFIG AGENT ─────────────────────────────────────
        log.info("─── STAGE 2: MC CONFIG AGENT ───")
        mc_config_agent = create_mc_config_agent(
            style_preset=req.style_preset,
            video_analysis=video_analysis,
            user_note=req.user_note,
        )

        # Build content with ALL images
        parts: list[types.Part] = []
        for i, img in enumerate(req.images):
            image_bytes = base64.b64decode(img.base64)
            parts.append(types.Part.from_bytes(data=image_bytes, mime_type=img.mime_type))

        parts.append(types.Part.from_text(
            text=f"Analyze these {len(req.images)} character images as a sequence. "
                 f"Plan which image pairs with which segment of the reference video motion. "
                 f"Style preset: {req.style_preset}. "
                 f"Character orientation mode: {req.character_orientation}."
        ))

        config_content = types.Content(role="user", parts=parts)
        config_text = await _run_agent(mc_config_agent, config_content, "mc_config_agent")

        if not config_text:
            raise HTTPException(status_code=500, detail="MC Config agent returned no response")

        log.info("MC Config Agent raw response length: %d chars", len(config_text))
        scene_plan = parse_json_from_text(config_text)

        # Ensure scene_plan has the right number of scenes
        if isinstance(scene_plan, dict) and "scenes" in scene_plan:
            while len(scene_plan["scenes"]) < len(req.images):
                scene_plan["scenes"].append({
                    "scene_index": len(scene_plan["scenes"]),
                    "original_position": len(scene_plan["scenes"]),
                    "reference_motion_segment": "match reference video motion",
                    "shot_type_detected": "medium shot",
                    "subject_pose_notes": "pose compatible with reference motion",
                    "environment_style": "complementary environment",
                    "lighting_direction": "neutral",
                    "duration_suggestion": "5s",
                    "transition_to_next": "natural cut",
                    "background_animation_cues": "ambient background motion",
                })
            scene_plan["scenes"] = scene_plan["scenes"][:len(req.images)]
        else:
            raise HTTPException(status_code=500, detail="MC Config agent returned invalid scene plan format")

        # Ensure recommended_order exists
        if "recommended_order" not in scene_plan:
            scene_plan["recommended_order"] = list(range(len(req.images)))

        log.info("MC Config Agent done — %d scenes planned", len(scene_plan["scenes"]))
        log.info("Recommended order: %s", scene_plan["recommended_order"])
        log.info("Overall approach: %s", scene_plan.get("overall_approach", "n/a"))

        # Build Motion Control pipeline state
        mc_pipeline_state = build_mc_pipeline_state(
            video_analysis=video_analysis,
            scene_plan=scene_plan,
            style_preset=req.style_preset,
        )

        # ── STAGE 3: MC CONTEXT WRITERS (parallel) ─────────────────────────
        recommended_order = scene_plan["recommended_order"]
        log.info("─── STAGE 3: MC CONTEXT WRITERS (%d parallel) ───", len(req.images))

        async def write_context_prompt(idx: int) -> dict:
            # Find this scene's position in the recommended sequence
            try:
                seq_pos = recommended_order.index(idx)
            except ValueError:
                seq_pos = idx

            writer = create_mc_context_writer_agent(mc_pipeline_state, idx, seq_pos)
            image_bytes = base64.b64decode(req.images[idx].base64)
            writer_content = types.Content(
                role="user",
                parts=[
                    types.Part.from_bytes(data=image_bytes, mime_type=req.images[idx].mime_type),
                    types.Part.from_text(
                        text=f"Write a CONTEXT-ONLY prompt for Motion Control scene {idx}. "
                             f"This scene is at position {seq_pos} in the final sequence. "
                             f"DO NOT describe motion — the reference video provides that. "
                             f"Only describe: scene setting, environment, background animation, lighting, style."
                    ),
                ],
            )
            writer_text = await _run_agent(writer, writer_content, f"mc_context_writer_{idx}")
            if not writer_text:
                return {
                    "scene_index": idx,
                    "context_prompt": {
                        "scene": "Ambient setting, natural lighting",
                        "environment_background": "subtle background motion",
                        "style_modifiers": "cinematic, professional",
                        "audio_ambience": "quiet room tone",
                        "audio_sfx": "none",
                        "music_suggestion": "None",
                    },
                    "motion_context_prompt": "Ambient setting with subtle background motion, cinematic lighting",
                    "duration_suggestion": "5s",
                    "negative_prompt": "sudden movements, flickering",
                }
            return parse_json_from_text(writer_text)

        writer_tasks = [write_context_prompt(i) for i in range(len(req.images))]
        raw_context_prompts = await asyncio.gather(*writer_tasks, return_exceptions=True)

        # Handle any exceptions in parallel tasks
        context_prompts = []
        for i, result in enumerate(raw_context_prompts):
            if isinstance(result, Exception):
                log.warning("Context Writer %d FAILED: %s", i, str(result))
                context_prompts.append({
                    "scene_index": i,
                    "context_prompt": {
                        "scene": "Ambient setting, natural lighting",
                        "environment_background": "subtle background motion",
                        "style_modifiers": "cinematic, professional",
                        "audio_ambience": "quiet room tone",
                        "audio_sfx": "none",
                        "music_suggestion": "None",
                    },
                    "motion_context_prompt": "Ambient setting with subtle background motion, cinematic lighting",
                    "duration_suggestion": "5s",
                    "negative_prompt": "sudden movements, flickering",
                })
            else:
                log.info("Context Writer %d OK — prompt: %.80s...", i,
                         result.get("motion_context_prompt", "")[:80])
                context_prompts.append(result)

        log.info("All context writers done — %d/%d succeeded",
                 sum(1 for r in raw_context_prompts if not isinstance(r, Exception)), len(req.images))

        # Update pipeline state with context outputs
        mc_pipeline_state["context_prompts"] = context_prompts

        # ── STAGE 4: MC EDITOR AGENT ─────────────────────────────────────
        log.info("─── STAGE 4: MC EDITOR AGENT ───")
        mc_editor = create_mc_editor_agent(
            style_preset=req.style_preset,
            video_analysis=video_analysis,
            pipeline_state=mc_pipeline_state,
            motion_prompts=context_prompts,
        )

        editor_content = types.Content(
            role="user",
            parts=[types.Part.from_text(
                text="Review all Motion Control prompts. VALIDATE: (1) No motion description (reference video provides motion), "
                     "(2) Backgrounds are alive with specific animation, (3) Lighting consistent, "
                     "(4) Scene transitions work. Fix any issues. Polish prompts."
            )],
        )
        editor_text = await _run_agent(mc_editor, editor_content, "mc_editor_agent")

        # Parse editor output
        final_order = recommended_order
        order_reasoning = scene_plan.get("order_reasoning", "")

        log.info("MC Editor raw response length: %d chars", len(editor_text) if editor_text else 0)

        final_prompts = context_prompts
        if editor_text:
            try:
                editor_result = parse_json_from_text(editor_text)
                if isinstance(editor_result, dict) and "prompts" in editor_result:
                    final_prompts = editor_result["prompts"]
                    # Check if editor changed the order
                    if editor_result.get("order_changed") and "final_order" in editor_result:
                        final_order = editor_result["final_order"]
                        order_reasoning = editor_result.get("order_change_reason", order_reasoning)
                        log.info("⚡ MC Editor CHANGED order: %s — reason: %s", final_order, order_reasoning)
                    elif "final_order" in editor_result:
                        final_order = editor_result["final_order"]
                        log.info("MC Editor confirmed order: %s", final_order)
                    # Capture editor notes
                    mc_pipeline_state["editor_notes"] = editor_result.get("review_notes", "")
                    log.info("MC Editor notes: %s", editor_result.get("review_notes", "n/a"))
                elif isinstance(editor_result, list):
                    final_prompts = editor_result
            except (ValueError, json.JSONDecodeError):
                pass

        # Build response with context prompts
        prompt_items = []
        for i, p in enumerate(final_prompts):
            cp = p.get("context_prompt")
            structured = None
            if cp and isinstance(cp, dict):
                structured = StructuredPrompt(
                    scene=cp.get("scene", ""),
                    action="",  # Motion Control: no action description
                    camera="",  # Motion Control: no camera description
                    audio_dialogue="No dialogue",
                    audio_ambience_sfx=cp.get("audio_ambience", ""),
                    music=cp.get("music_suggestion", "None"),
                    avoid=p.get("negative_prompt", ""),
                )

            prompt_items.append(MotionPromptItem(
                scene_index=p.get("scene_index", i),
                motion_prompt=p.get("motion_context_prompt", ""),
                structured_prompt=structured,
                camera_move="",  # From reference video
                subject_motion="",  # From reference video
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
            pipeline_type="motion-control",
            pipeline_state=mc_pipeline_state,
            final_order=final_order,
            video_analysis=video_analysis,
            character_orientation=req.character_orientation,
            keep_original_sound=req.keep_original_sound,
        )

        elapsed = time.time() - pipeline_start
        log.info("=" * 60)
        log.info("PIPELINE B COMPLETE — %.1fs total, %d prompts, order=%s, session=%s",
                 elapsed, len(prompt_items), final_order, our_session_id[:8])
        for i, p in enumerate(prompt_items):
            log.info("  Final context %d: %.100s", i, p.motion_prompt[:100])
        log.info("=" * 60)

        return MotionGenerateResponse(
            session_id=our_session_id,
            prompts=prompt_items,
            recommended_order=final_order,
            order_reasoning=order_reasoning,
            pipeline_type="motion-control",
            video_analysis=video_analysis,
        )

    except HTTPException:
        raise
    except Exception as e:
        log.error("PIPELINE B FAILED: %s", str(e), exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# ---------------------------------------------------------------------------
# POST /motion/generate (Router)
# ---------------------------------------------------------------------------
@app.post("/motion/generate", response_model=MotionGenerateResponse)
async def motion_generate(req: MotionGenerateRequest):
    """Generate motion prompts — routes to appropriate pipeline based on pipeline_type.

    Pipeline A (pro-i2v): 3-agent pipeline for full motion prompts.
    Pipeline B (motion-control): 4-agent pipeline with reference video, context-only prompts.
    """
    cleanup_motion_sessions()

    # Validate common requirements
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

    # Route to appropriate pipeline
    if req.pipeline_type == "motion-control":
        return await _run_motion_control_pipeline(req)
    else:
        # Default to pro-i2v pipeline
        return await _run_pro_i2v_pipeline(req)


# ---------------------------------------------------------------------------
# POST /motion/refine
# ---------------------------------------------------------------------------
@app.post("/motion/refine", response_model=MotionGenerateResponse)
async def motion_refine(req: MotionRefineRequest):
    """Refine previously generated motion prompts based on user feedback.

    Routes to Pro I2V or Motion Control refine agent based on pipeline_type.
    Supports reordering requests (e.g., 'shuffle the scenes', 'move scene 3 first').
    """
    cleanup_motion_sessions()

    entry = motion_sessions.get(req.session_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Motion session not found or expired")

    entry.last_access = time.time()
    os.environ["GOOGLE_API_KEY"] = req.api_key

    try:
        # Select agent based on pipeline type
        if entry.pipeline_type == "motion-control":
            agent = create_mc_motion_refine_agent(
                current_prompts=entry.prompts,
                pipeline_state=entry.pipeline_state or {},
                scene_index=req.scene_index,
            )
            agent_name = "mc_motion_refine"
        else:
            # Default to Pro I2V refine agent
            agent = create_motion_refine_agent(
                current_prompts=entry.prompts,
                pipeline_state=entry.pipeline_state or {},
                scene_index=req.scene_index,
            )
            agent_name = "motion_refine"

        content = types.Content(
            role="user",
            parts=[types.Part.from_text(text=req.message)],
        )

        refine_text = await _run_agent(agent, content, agent_name)

        if not refine_text:
            raise HTTPException(status_code=500, detail="Refine agent returned no response")

        result = parse_json_from_text(refine_text)
        if isinstance(result, dict) and "prompts" in result:
            final_prompts = result["prompts"]
            # Check for order changes
            final_order = result.get("final_order", entry.final_order)
            if result.get("order_changed") and final_order:
                entry.final_order = final_order
        elif isinstance(result, list):
            final_prompts = result
            final_order = entry.final_order
        else:
            raise HTTPException(status_code=500, detail="Refine agent returned invalid format")

        prompt_items = []
        for i, p in enumerate(final_prompts):
            sp = p.get("structured_prompt")
            structured = None
            if sp and isinstance(sp, dict):
                structured = StructuredPrompt(
                    scene=sp.get("scene", ""),
                    action=sp.get("action", ""),
                    camera=sp.get("camera", ""),
                    audio_dialogue=sp.get("audio_dialogue", "No dialogue"),
                    audio_ambience_sfx=sp.get("audio_ambience_sfx", ""),
                    music=sp.get("music", "None"),
                    avoid=sp.get("avoid", ""),
                )

            prompt_items.append(MotionPromptItem(
                scene_index=p.get("scene_index", i),
                motion_prompt=p.get("motion_prompt", "") or p.get("motion_context_prompt", ""),
                structured_prompt=structured,
                camera_move=p.get("camera_move", ""),
                subject_motion=p.get("subject_motion", ""),
                duration_suggestion=p.get("duration_suggestion", "5s"),
                negative_prompt=p.get("negative_prompt"),
            ))

        # Update session
        entry.prompts = final_prompts

        # Return appropriate response based on pipeline type
        if entry.pipeline_type == "motion-control":
            return MotionGenerateResponse(
                session_id=req.session_id,
                prompts=prompt_items,
                recommended_order=final_order,
                pipeline_type="motion-control",
                video_analysis=entry.video_analysis,
            )
        else:
            return MotionGenerateResponse(
                session_id=req.session_id,
                prompts=prompt_items,
                recommended_order=final_order,
                pipeline_type="pro-i2v",
            )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
