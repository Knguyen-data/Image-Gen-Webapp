"""
RAW Studio Prompt Generator Agent — Google ADK + FastAPI Backend

A multi-turn conversational agent that generates and refines structured
image-generation prompts from a reference photo.

Runs on localhost:8001 by default.
The user's Gemini API key is passed per-request (header or body) — nothing is
hardcoded.
"""

from __future__ import annotations

import base64
import json
import re
import uuid
from dataclasses import dataclass, field
from typing import Optional

import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from google import genai
from google.genai import types

# ---------------------------------------------------------------------------
# Pydantic request / response schemas
# ---------------------------------------------------------------------------

class GeneratedPrompt(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    text: str = ""
    shotType: str = ""
    expression: str = ""
    pose: str = ""
    cameraAngle: str = ""


class GenerateRequest(BaseModel):
    api_key: str
    image_base64: str
    image_mime_type: str = "image/jpeg"
    mode: str = "storyboard"          # "storyboard" | "photoset"
    count: int = 6
    scene_context: Optional[str] = None


class GenerateResponse(BaseModel):
    session_id: str
    prompts: list[GeneratedPrompt]


class RefineRequest(BaseModel):
    api_key: str
    session_id: str
    message: str                       # free-form follow-up from user
    prompt_index: Optional[int] = None # if set, refine only this prompt


class RefineResponse(BaseModel):
    session_id: str
    prompts: list[GeneratedPrompt]


# ---------------------------------------------------------------------------
# System prompts
# ---------------------------------------------------------------------------

STORYBOARD_SYSTEM = """You are a top Hollywood storyboard artist, cinematography director, and photography expert.
You have deep knowledge of camera angles, shot types, lighting techniques, and visual storytelling.

Your job:
1. Analyze the reference image — extract character features (hair, skin, outfit, body type) and environment (decor, lighting, color temperature).
2. Generate a set of scene prompts with spatiotemporal continuity — a micro-screenplay within the same scene.
3. Each scene MUST use a DIFFERENT shot type from the previous one (close-up → medium → wide → overhead → low angle → etc.).
4. Output static frozen-frame descriptions only — NO video or motion language.
5. Use professional photography and cinematography terminology.

ALWAYS output ONLY a valid JSON array. Each element has these fields:
  text        – the full image-generation prompt
  shotType    – e.g. "close-up", "medium shot", "wide shot", "overhead", "low angle"
  expression  – character's facial expression
  pose        – character's body pose
  cameraAngle – camera angle description

No markdown fences, no explanation — just the JSON array."""

PHOTOSET_SYSTEM = """You are a professional model photography prompt expert and fashion photographer.
You have deep knowledge of model posing, lighting setups, camera angles, and editorial photography.

Your job:
1. Analyze the reference image — extract the character's EXACT features, outfit, scene, and lighting.
2. Generate prompts keeping character / outfit / scene / lighting 100% identical.
3. Vary ONLY: expression (all different — smile, smirk, serious, laughing, pensive, seductive smile, calm gaze, looking away pensively, fierce stare, etc.), pose (SIGNIFICANT changes — hands on hips, arms crossed, walking, sitting, leaning, turning, one hand on face, etc.), shot type (close-up, medium, wide, full body), camera angle (straight on, 30° overhead, low angle, side profile, three-quarter).
4. Realistic photography style, 8K quality.

ALWAYS output ONLY a valid JSON array. Each element has these fields:
  text        – the full image-generation prompt
  shotType    – e.g. "close-up", "medium shot", "full body", "wide shot"
  expression  – character's facial expression
  pose        – character's body pose
  cameraAngle – camera angle description

No markdown fences, no explanation — just the JSON array."""

REFINE_PREAMBLE = """The user wants to modify the previously generated prompts.
Apply their instruction, then output the COMPLETE updated JSON array (same schema as before).
If they reference a specific prompt number, only change that one but still output the full array.
Output ONLY the JSON array — no markdown, no explanation."""

# ---------------------------------------------------------------------------
# Session store (in-memory — fine for local single-user tool)
# ---------------------------------------------------------------------------

@dataclass
class Session:
    id: str
    mode: str
    prompts: list[GeneratedPrompt] = field(default_factory=list)
    # Chat history for multi-turn (list of genai content dicts)
    history: list[types.Content] = field(default_factory=list)
    image_base64: str = ""
    image_mime_type: str = "image/jpeg"


_sessions: dict[str, Session] = {}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _parse_prompts(text: str) -> list[GeneratedPrompt]:
    """Parse a JSON array of prompts from model output, stripping fences."""
    cleaned = text.strip()
    # Strip markdown code fences
    m = re.search(r"```(?:json)?\s*([\s\S]*?)```", cleaned)
    if m:
        cleaned = m.group(1).strip()
    # Sometimes the model wraps in extra text — find the array
    start = cleaned.find("[")
    end = cleaned.rfind("]")
    if start == -1 or end == -1:
        raise ValueError(f"No JSON array found in response: {cleaned[:300]}")
    cleaned = cleaned[start : end + 1]
    arr = json.loads(cleaned)
    if not isinstance(arr, list):
        raise ValueError("Parsed JSON is not an array")
    return [
        GeneratedPrompt(
            id=str(uuid.uuid4()),
            text=item.get("text", ""),
            shotType=item.get("shotType", ""),
            expression=item.get("expression", ""),
            pose=item.get("pose", ""),
            cameraAngle=item.get("cameraAngle", ""),
        )
        for item in arr
    ]


def _build_client(api_key: str) -> genai.Client:
    """Create a google-genai Client with the user's API key."""
    return genai.Client(api_key=api_key)


# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------

app = FastAPI(title="RAW Studio Prompt Agent", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"status": "ok", "agent": "raw-studio-prompt-agent", "version": "1.0.0"}


@app.post("/generate", response_model=GenerateResponse)
async def generate(req: GenerateRequest):
    """Initial prompt generation from a reference image."""
    if not req.api_key:
        raise HTTPException(status_code=400, detail="api_key is required")

    client = _build_client(req.api_key)

    system_prompt = STORYBOARD_SYSTEM if req.mode == "storyboard" else PHOTOSET_SYSTEM

    user_text = f"Generate {req.count} prompts."
    if req.scene_context:
        user_text += f" Scene context: {req.scene_context}"

    # Build user message with image
    image_part = types.Part.from_bytes(
        data=base64.b64decode(req.image_base64),
        mime_type=req.image_mime_type,
    )

    user_content = types.Content(
        role="user",
        parts=[
            types.Part.from_text(text=user_text),
            image_part,
        ],
    )

    try:
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=[user_content],
            config=types.GenerateContentConfig(
                system_instruction=system_prompt,
                tools=[types.Tool(google_search=types.GoogleSearch())],
                temperature=1.0,
                safety_settings=[
                    types.SafetySetting(
                        category="HARM_CATEGORY_DANGEROUS_CONTENT",
                        threshold="OFF",
                    ),
                    types.SafetySetting(
                        category="HARM_CATEGORY_HARASSMENT",
                        threshold="OFF",
                    ),
                    types.SafetySetting(
                        category="HARM_CATEGORY_HATE_SPEECH",
                        threshold="OFF",
                    ),
                    types.SafetySetting(
                        category="HARM_CATEGORY_SEXUALLY_EXPLICIT",
                        threshold="OFF",
                    ),
                ],
            ),
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Gemini API error: {e}")

    raw_text = response.text
    if not raw_text:
        raise HTTPException(status_code=502, detail="Empty response from Gemini")

    try:
        prompts = _parse_prompts(raw_text)
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"Failed to parse Gemini response: {e}. Raw: {raw_text[:500]}",
        )

    # Build model response content for history
    model_content = types.Content(
        role="model",
        parts=[types.Part.from_text(text=raw_text)],
    )

    session_id = str(uuid.uuid4())
    session = Session(
        id=session_id,
        mode=req.mode,
        prompts=prompts,
        history=[user_content, model_content],
        image_base64=req.image_base64,
        image_mime_type=req.image_mime_type,
    )
    _sessions[session_id] = session

    return GenerateResponse(session_id=session_id, prompts=prompts)


@app.post("/refine", response_model=RefineResponse)
async def refine(req: RefineRequest):
    """Follow-up refinement of previously generated prompts."""
    if not req.api_key:
        raise HTTPException(status_code=400, detail="api_key is required")

    session = _sessions.get(req.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found. Generate prompts first.")

    client = _build_client(req.api_key)

    system_prompt = STORYBOARD_SYSTEM if session.mode == "storyboard" else PHOTOSET_SYSTEM
    system_prompt += "\n\n" + REFINE_PREAMBLE

    # Build the follow-up message
    refine_text = req.message
    if req.prompt_index is not None:
        refine_text = f"Modify ONLY prompt #{req.prompt_index + 1} (zero-indexed {req.prompt_index}): {req.message}. Output the FULL updated array."

    user_content = types.Content(
        role="user",
        parts=[types.Part.from_text(text=refine_text)],
    )

    # Build full conversation: history + new user message
    contents = list(session.history) + [user_content]

    try:
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=contents,
            config=types.GenerateContentConfig(
                system_instruction=system_prompt,
                tools=[types.Tool(google_search=types.GoogleSearch())],
                temperature=1.0,
                safety_settings=[
                    types.SafetySetting(
                        category="HARM_CATEGORY_DANGEROUS_CONTENT",
                        threshold="OFF",
                    ),
                    types.SafetySetting(
                        category="HARM_CATEGORY_HARASSMENT",
                        threshold="OFF",
                    ),
                    types.SafetySetting(
                        category="HARM_CATEGORY_HATE_SPEECH",
                        threshold="OFF",
                    ),
                    types.SafetySetting(
                        category="HARM_CATEGORY_SEXUALLY_EXPLICIT",
                        threshold="OFF",
                    ),
                ],
            ),
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Gemini API error: {e}")

    raw_text = response.text
    if not raw_text:
        raise HTTPException(status_code=502, detail="Empty response from Gemini")

    try:
        prompts = _parse_prompts(raw_text)
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"Failed to parse refinement response: {e}. Raw: {raw_text[:500]}",
        )

    # Update session history
    model_content = types.Content(
        role="model",
        parts=[types.Part.from_text(text=raw_text)],
    )
    session.history.append(user_content)
    session.history.append(model_content)
    session.prompts = prompts

    return RefineResponse(session_id=session.id, prompts=prompts)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    print("=" * 60)
    print("  RAW Studio Prompt Agent")
    print("  http://localhost:8001")
    print("=" * 60)
    uvicorn.run(app, host="0.0.0.0", port=8001)
