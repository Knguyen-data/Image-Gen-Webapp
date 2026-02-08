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
Study the reference image carefully. Extract and LOCK these details — every prompt must copy the EXACT same character.

CHARACTER SPEC (describe naturally — no robotic or non-human terms):
- Ethnicity & skin tone: describe naturally (e.g. "warm tan skin", "fair skin with warm undertone" — NEVER say "porcelain", "alabaster", "flawless", "doll-like", or any non-human metaphor)
- Face: exact facial features, eye color/shape, lip shape, brow shape
- Hair: exact color, length, texture, style, bangs (yes/no, type)
- Body: build (slim/athletic/curvy/petite), proportions
- Outfit: EXACT garment description — type, fabric, fit, color, texture, neckline, sleeves
- Accessories: jewelry, shoes, bags, belts — only what's visible

ENVIRONMENT SPEC (copy exactly — do NOT invent):
- Location type, architecture, surfaces, materials
- Props/objects: only what's actually visible
- Light sources: what's creating the light (windows, lamps, fluorescent, natural)
- Color grading/temperature: warm, cool, neutral — match the reference

LIGHTING & COLOR CONSISTENCY:
- Use the SAME lighting color temperature and direction as the reference image
- Match the overall color grading (warm tones stay warm, cool stays cool)
- Light source types must be consistent (don't add studio lights if the reference has natural light)

⚠️ ABSOLUTE RULES:
1. COPY EXACT CHARACTER from the reference image. Describe the same person with the same features in every prompt.
2. Use the SAME environment, lighting color, and color grading as the reference.
3. NEVER add elements not in the reference: no wind, rain, fog, smoke, particles, extra people, new furniture.
4. NEVER change: hair color/length/style, outfit, body type, skin tone, accessories.
5. NEVER use non-human descriptors: no "porcelain", "alabaster", "doll-like", "ethereal", "otherworldly", "pixel-identical", "flawless". Describe skin and features like a human photographer would.
"""

# ---------------------------------------------------------------------------
# Prompt format block — shared by both modes
# ---------------------------------------------------------------------------

PROMPT_FORMAT = """
PROMPT TEXT STRUCTURE (each prompt's "text" field must follow this order):
1. [ShotType, CameraAngle] tag
2. "Same character as reference —" then character description (reinforces consistency)
3. Pose and expression (natural, human language)
4. Composition technique used
5. Lighting description (matching reference color temperature)
6. Lens and depth of field
7. Environment/background details (from reference)

LANGUAGE RULES:
- Write like a professional photographer directing a shoot, NOT like an AI
- NEVER use: "porcelain", "alabaster", "ethereal", "otherworldly", "doll-like", "flawless", "pixel-identical", "anime", "cartoonish"
- Use natural descriptions: "fair skin", "smooth complexion", "warm skin tone", "clear skin"
- Keep descriptions grounded and realistic

AVAILABLE SHOT TYPES: {shot_types}
AVAILABLE CAMERA ANGLES: {camera_angles}

{scene_context}

OUTPUT FORMAT — STRICTLY follow this:
Return ONLY a valid JSON array. NO markdown, NO code fences, NO explanation.

Each object MUST have ALL 7 fields:
- "text": the full prompt (structured as above, starts with "Same character as reference —")
- "shotType": exact match from shot types list
- "cameraAngle": exact match from camera angles list
- "expression": the facial expression
- "pose": the body pose
- "negativePrompt": MANDATORY — always include: deformed hands, extra fingers, blurry face, wrong outfit, changed hair, different location, distorted proportions, cartoonish, anime, plus scene-specific items

EXAMPLE:
[{{"text": "[Close-up, Low Angle 15°] Same character as reference — a young East Asian woman with jet-black waist-length wavy hair and blunt bangs, light brown eyes, fair skin with warm undertone. She wears a cream silk mock-neck bodysuit with visible fabric sheen. Chin slightly lowered, looking up through dark lashes with quiet intensity. Rule of thirds — face at upper-right intersection. Rembrandt lighting from upper left casts a triangle shadow on her left cheek, matching the warm fluorescent tones of the reference. Shot at 85mm f/1.8, shallow depth of field dissolves the corridor behind her into soft warm bokeh.", "shotType": "Close-up", "expression": "quiet intensity, eyes looking up through lashes", "pose": "chin lowered, shoulders slightly angled", "cameraAngle": "Low Angle 15°", "negativePrompt": "deformed hands, extra fingers, blurry face, changed outfit, different hair style or color, altered eye color, different location, distorted proportions, cartoonish, anime, harsh lighting"}}]
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
