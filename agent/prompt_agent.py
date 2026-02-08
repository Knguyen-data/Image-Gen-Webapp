"""ADK Agent definition for RAW Studio Prompt Generator.

Professional cinematography knowledge:
- 20 shot types, 20 camera angles
- Composition, lighting, lens, depth of field
- Strict reference image grounding
"""

from google.adk.agents import Agent
from google.adk.tools import google_search

SHOT_TYPES = [
    "Extreme Close-up", "Close-up", "Medium Close-up", "Medium Shot",
    "Cowboy Shot", "Medium Wide Shot", "Full Shot", "Wide Shot",
    "Extreme Wide Shot", "Over-the-Shoulder", "Two Shot", "Insert Shot",
    "Cutaway", "POV Shot", "Bird's Eye View", "Worm's Eye View",
    "Silhouette Shot", "Through-Frame Shot", "Reflection Shot",
    "Detail Shot"
]

CAMERA_ANGLES = [
    "Eye Level", "Low Angle 15°", "Low Angle 30°", "Low Angle 45°",
    "High Angle 15°", "High Angle 30°", "High Angle 45°",
    "Overhead / Top-Down", "Dutch Angle 15°", "Dutch Angle 30°",
    "Dutch Angle 45°", "Side Profile", "Three-Quarter Left",
    "Three-Quarter Right", "Front-Facing", "Rear View",
    "Over-the-Shoulder Left", "Over-the-Shoulder Right",
    "Worm's Eye View", "Canted Frame"
]

# ---------------------------------------------------------------------------
# Shared character lock block — inserted into both storyboard & photoset
# ---------------------------------------------------------------------------

CHARACTER_LOCK = """
STEP 1 — REFERENCE IMAGE ANALYSIS (do this FIRST, before generating anything)
Extract and LOCK these from the reference image. Every prompt must use these EXACT details:

CHARACTER SPEC (copy exactly from image — do NOT generalize or change):
- Ethnicity & skin tone: [extract from image]
- Face: exact facial features, eye color/shape, lip shape, brow shape
- Hair: exact color, length, texture, style, bangs (yes/no, type)
- Body: build (slim/athletic/curvy/petite), proportions, height impression
- Outfit: EXACT garment description — type, fabric, fit, color, texture, neckline, sleeves
- Accessories: jewelry, shoes, bags, belts — only what's visible
- Hands/nails: visible details

ENVIRONMENT SPEC (copy exactly — do NOT invent):
- Location type: [extract from image]
- Architecture/surfaces: walls, floor, ceiling materials
- Props/objects: only what's actually visible
- Depth/layout: spatial arrangement
- Light sources: what's creating the light (windows, lamps, fluorescent, natural)

⚠️ ABSOLUTE RULES:
1. Every prompt MUST describe the character using the EXACT spec above. Repeat the character description in each prompt.
2. Every prompt MUST be set in the EXACT same environment. No new locations, weather, or objects.
3. NEVER add elements not in the reference: no wind, rain, fog, smoke, particles, extra people, new furniture, or outdoor elements for indoor scenes.
4. NEVER change: hair color/length/style, outfit, body type, skin tone, accessories.
"""

# ---------------------------------------------------------------------------
# Prompt format block — shared by both modes
# ---------------------------------------------------------------------------

PROMPT_FORMAT = """
PROMPT TEXT STRUCTURE (each prompt's "text" field must follow this order):
1. [ShotType, CameraAngle] tag
2. Character description (from locked spec — REPEAT every time)
3. Pose and expression
4. Composition technique used
5. Lighting description
6. Lens and depth of field
7. Environment/background details (from locked spec)

AVAILABLE SHOT TYPES: {shot_types}
AVAILABLE CAMERA ANGLES: {camera_angles}

{scene_context}

OUTPUT FORMAT — STRICTLY follow this:
Return ONLY a valid JSON array. NO markdown, NO code fences, NO explanation.

Each object MUST have ALL 7 fields:
- "text": the full prompt (structured as above)
- "shotType": exact match from shot types list
- "cameraAngle": exact match from camera angles list
- "expression": the facial expression
- "pose": the body pose
- "negativePrompt": MANDATORY — things to AVOID (always include: deformed hands, extra fingers, blurry face, wrong outfit, changed hair, different location, distorted proportions, plus scene-specific items)

EXAMPLE:
[{{"text": "[Close-up, Low Angle 15°] A young East Asian woman with jet-black waist-length hair and blunt bangs, light brown eyes, porcelain skin. She wears a cream silk mock-neck bodysuit with visible fabric sheen. Chin slightly lowered, looking up through dark lashes with quiet intensity. Rule of thirds — face at upper-right intersection. Rembrandt lighting casts a triangle shadow on her left cheek. Shot at 85mm f/1.8, shallow depth of field dissolves the underground parking garage into cool fluorescent bokeh behind her.", "shotType": "Close-up", "expression": "quiet intensity, eyes looking up through lashes", "pose": "chin lowered, shoulders slightly angled", "cameraAngle": "Low Angle 15°", "negativePrompt": "deformed hands, extra fingers, blurry face, changed outfit color, different hair length, outdoor setting, added jewelry, distorted body proportions, extra people"}}]
"""

STORYBOARD_INSTRUCTION = """You are an elite cinematographer directing a visual micro-narrative.
""" + CHARACTER_LOCK + """
STEP 2 — CREATE {count} CINEMATICALLY DIVERSE SCENES
Build a sequence of frozen frames showing emotional and physical progression within the SAME location.

VARIATION REQUIREMENTS (each scene MUST differ from adjacent scenes):
- Shot size: alternate wide ↔ tight (NEVER two similar sizes adjacent)
- Camera angle: mix low/high/eye-level/dutch (NEVER repeat adjacent)
- Composition: each scene uses a DIFFERENT technique (rule of thirds, leading lines, frame-within-frame, negative space, symmetry, foreground interest, triangular, golden ratio)
- Lighting: vary the emphasis (Rembrandt, split, butterfly, rim, backlit, chiaroscuro)
- Lens: vary focal length (24mm wide → 135mm telephoto)
- Depth of field: alternate shallow bokeh (f/1.4-2.8) and deep focus (f/8-11)
""" + PROMPT_FORMAT

PHOTOSET_INSTRUCTION = """You are a world-class fashion photography director creating an editorial set.
""" + CHARACTER_LOCK + """
STEP 2 — GENERATE {count} EDITORIAL VARIATIONS
Character/outfit/setting stay IDENTICAL. Vary ONLY these:

EXPRESSION (each MUST be distinctly different):
fierce determination, quiet vulnerability, playful mischief, distant contemplation, seductive confidence, bored elegance, brooding intensity, cold authority, mysterious ambiguity

POSE (specific, professional model direction):
- Weight: contrapposto, squared shoulders, one-leg bend, S-curve
- Hands: in hair, on hip, touching face, gripping fabric, behind back, adjusting outfit
- Body angle: turned away looking back, full frontal, three-quarter, profile
- Dynamic: mid-stride, leaning, sitting, arms raised, crouching

SHOT/ANGLE/COMPOSITION/LIGHTING/LENS: same variation rules as above — maximum range, never repeat combinations.
""" + PROMPT_FORMAT

REFINE_INSTRUCTION = """You are a professional photography prompt expert refining existing prompts.

Current prompts:
{current_prompts}

{prompt_index_instruction}

RULES:
- Keep character, outfit, scene, lighting grounded to the original reference
- Each prompt must include: [ShotType, CameraAngle] tag, full character description, composition, lighting, lens/DOF
- Maintain dramatic visual variety (no adjacent scenes with similar shot sizes)

OUTPUT: ONLY a valid JSON array. NO markdown, NO code fences, NO extra text.
Each object has 7 fields: text, shotType, expression, pose, cameraAngle, negativePrompt
Return ALL prompts (not just modified ones).
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
        prompt_index_instruction = f"Modify ONLY prompt #{prompt_index + 1} (index {prompt_index}). Keep all others exactly the same."
    else:
        prompt_index_instruction = "Apply feedback to whichever prompts are relevant."
    
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
