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
