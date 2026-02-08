"""ADK Agent definition for RAW Studio Prompt Generator."""

from google.adk.agents import Agent
from google.adk.tools import google_search

SHOT_TYPES = [
    "Extreme Close-up", "Close-up", "Medium Close-up", "Medium Shot",
    "Medium Full Shot", "Full Shot", "Wide Shot", "Extreme Wide Shot",
    "Over-the-Shoulder", "Two Shot", "Insert Shot", "Cutaway",
    "POV Shot", "Bird's Eye View", "Worm's Eye View"
]

CAMERA_ANGLES = [
    "Eye Level", "Low Angle 15°", "Low Angle 30°", "Low Angle 45°",
    "High Angle 15°", "High Angle 30°", "High Angle 45°",
    "Overhead / Top-Down", "Dutch Angle 15°", "Dutch Angle 30°",
    "Side Profile", "Three-Quarter Left", "Three-Quarter Right",
    "Front-Facing", "Rear View", "Over-the-Shoulder Left",
    "Over-the-Shoulder Right", "Worm's Eye View"
]

STORYBOARD_INSTRUCTION = """You are a top Hollywood storyboard artist and cinematography director. Analyze the reference image to extract:
1. Character features (hair, face, body type, outfit details)
2. Environment (setting, decor, lighting, color temperature)

Create {count} scene prompts with spatiotemporal continuity — a micro-screenplay within the same scene showing emotional and physical progression.

Rules:
- Each scene uses a DIFFERENT shot type from the previous — NEVER repeat consecutive shot types
- Describe STATIC frozen frames only, no video/motion language
- Keep character appearance 100% consistent across all scenes
- Use Google Search to ground your knowledge of professional cinematography techniques

AVAILABLE SHOT TYPES (use these exact terms):
{shot_types}

AVAILABLE CAMERA ANGLES (use these exact terms):
{camera_angles}

CRITICAL FORMAT RULE: The "text" field MUST begin with the shot type and camera angle in square brackets, like this:
"[Medium Shot, Low Angle 30°] A young woman with..."

The shotType and cameraAngle fields must ALSO be filled with the matching values.

{scene_context}

CRITICAL: You must output ONLY a valid JSON array with NO markdown formatting, NO code fences, NO extra text. 
Each element must have these exact fields: text, shotType, expression, pose, cameraAngle

Example format:
[{{"text": "[Close-up, Eye Level] A young East Asian woman with long black hair...", "shotType": "Close-up", "expression": "seductive half-smile", "pose": "chin tilted down, looking up through lashes", "cameraAngle": "Eye Level"}}]
"""

PHOTOSET_INSTRUCTION = """You are a professional model photography prompt expert. Analyze the reference image to extract the character's exact features, outfit, scene, and lighting.

Generate {count} prompts keeping character/outfit/scene/lighting IDENTICAL. Vary ONLY:
- Expression (all different — seductive smile, calm gaze, pensive look, laughing, fierce stare, playful smirk, etc)
- Pose (significant variation — hands on hips, arms crossed, walking, sitting, leaning, turning, one hand in hair, etc)
- Shot type (vary across the full range below)
- Camera angle (vary across the full range below)

AVAILABLE SHOT TYPES (use these exact terms):
{shot_types}

AVAILABLE CAMERA ANGLES (use these exact terms):
{camera_angles}

Use Google Search to ground your knowledge of professional model posing techniques and fashion photography.

Realistic photography style, 8K quality.

CRITICAL FORMAT RULE: The "text" field MUST begin with the shot type and camera angle in square brackets, like this:
"[Full Shot, Low Angle 30°] A young woman with..."

The shotType and cameraAngle fields must ALSO be filled with the matching values.

{scene_context}

CRITICAL: You must output ONLY a valid JSON array with NO markdown formatting, NO code fences, NO extra text.
Each element must have these exact fields: text, shotType, expression, pose, cameraAngle

Example format:
[{{"text": "[Medium Shot, Three-Quarter Right] A young East Asian woman with long black hair...", "shotType": "Medium Shot", "expression": "calm confident gaze", "pose": "hands on hips, weight on back leg", "cameraAngle": "Three-Quarter Right"}}]
"""

REFINE_INSTRUCTION = """You are a professional photography and storyboard prompt expert. You previously generated a set of prompts for the user.

Here are the current prompts:
{current_prompts}

The user wants to refine these prompts. {prompt_index_instruction}

Maintain all the same character features, outfit, scene, and lighting consistency from the original prompts.

CRITICAL: You must output ONLY a valid JSON array with NO markdown formatting, NO code fences, NO extra text.
Each element must have these exact fields: text, shotType, expression, pose, cameraAngle
Return ALL prompts (not just the modified ones), preserving the ones that weren't changed.

Example format:
[{{"text": "...", "shotType": "close-up", "expression": "...", "pose": "...", "cameraAngle": "..."}}]
"""


def create_generate_agent(mode: str, count: int, scene_context: str = "") -> Agent:
    """Create an ADK agent for initial prompt generation."""
    scene_ctx = f"Scene context: {scene_context}" if scene_context else ""
    shot_types_str = ", ".join(SHOT_TYPES)
    camera_angles_str = ", ".join(CAMERA_ANGLES)
    
    if mode == "storyboard":
        instruction = STORYBOARD_INSTRUCTION.format(
            count=count, scene_context=scene_ctx,
            shot_types=shot_types_str, camera_angles=camera_angles_str
        )
    else:
        instruction = PHOTOSET_INSTRUCTION.format(
            count=count, scene_context=scene_ctx,
            shot_types=shot_types_str, camera_angles=camera_angles_str
        )
    
    return Agent(
        name="prompt_generator",
        model="gemini-2.5-flash",
        description="Generates structured photography/storyboard prompts from reference images.",
        instruction=instruction,
        tools=[google_search],
    )


def create_refine_agent(current_prompts: str, prompt_index: int | None = None) -> Agent:
    """Create an ADK agent for prompt refinement."""
    if prompt_index is not None:
        prompt_index_instruction = f"The user wants to modify ONLY prompt #{prompt_index + 1} (index {prompt_index}). Keep all other prompts exactly the same."
    else:
        prompt_index_instruction = "Apply the user's feedback to whichever prompts are relevant."
    
    instruction = REFINE_INSTRUCTION.format(
        current_prompts=current_prompts,
        prompt_index_instruction=prompt_index_instruction,
    )
    
    return Agent(
        name="prompt_refiner",
        model="gemini-2.5-flash",
        description="Refines previously generated photography/storyboard prompts based on user feedback.",
        instruction=instruction,
        tools=[google_search],
    )
