"""Motion Director — 3-agent sequential pipeline for Kling 2.6 I2V motion prompts.

Architecture:
  1. ANALYST  — Analyzes ALL images holistically, outputs structured scene plan
  2. MOTION WRITER — Writes Kling 2.6-optimized motion prompts per scene (parallel)
  3. EDITOR  — Reviews all prompts for flow consistency and energy arc

All agents use gemini-2.5-flash. API key is passed per-request.
"""

import json
import re
from typing import Optional

from google.adk.agents import LlmAgent


# ---------------------------------------------------------------------------
# Style Preset Definitions
# ---------------------------------------------------------------------------
STYLE_PRESETS = {
    "fashion_walk": {
        "name": "Fashion Walk",
        "camera": "Steady tracking shots, low angles (15-30°), smooth follow. Dolly alongside or slightly behind.",
        "subject": "Confident stride, weight shifts, turns at endpoints, subtle hair movement. Poses are strong, grounded.",
        "pacing": "Even, metronomic. Consistent energy throughout. Medium tempo.",
        "mood": "Powerful, assured, aspirational.",
    },
    "fashion_show": {
        "name": "Fashion Show",
        "camera": "Dynamic angles, quick-cut feel via varied shot types. Low angles, runway perspective, audience POV intercuts.",
        "subject": "Runway walk pattern: walk → pause → pose → walk. Rhythmic, beat-driven movement. Sharp turns.",
        "pacing": "Rhythmic pulses. Build-pause-build. High energy with deliberate pauses.",
        "mood": "Theatrical, high-energy, spectacle.",
    },
    "music_video": {
        "name": "Music Video",
        "camera": "Creative angles, some handheld feel. Whip pans (gentle), crane-like moves, dutch angles. Varied and expressive.",
        "subject": "Expressive, stylized movement. Lip-sync feel, gestural. Varies with 'beats' — can be slow then explosive.",
        "pacing": "Varies dramatically. Slow verses, energetic choruses. Builds and drops.",
        "mood": "Emotional, artistic, stylized.",
    },
    "cinematic_narrative": {
        "name": "Cinematic Narrative",
        "camera": "Classical cinematography: wide establishing → medium → close-up progression. Slow, deliberate moves. Steady dolly.",
        "subject": "Subtle, naturalistic. Small gestures, breathing, micro-expressions. Realistic and understated.",
        "pacing": "Slow build to climax. Long holds, patient reveals. Crescendo structure.",
        "mood": "Dramatic, immersive, filmic.",
    },
    "product_showcase": {
        "name": "Product Showcase",
        "camera": "Smooth orbits, slow reveals, macro-to-wide transitions. Measured, luxurious camera movement.",
        "subject": "Minimal subject motion. Product as hero — subtle light catches, gentle rotation cues. Environment stays still.",
        "pacing": "Measured, luxurious. Even tempo throughout. No sudden changes.",
        "mood": "Premium, refined, aspirational.",
    },
    "dance_performance": {
        "name": "Dance Performance",
        "camera": "Dynamic tracking, circling, low-to-high sweeps. Camera energy matches dancer energy.",
        "subject": "Full body movement, expressive limbs, weight shifts, jumps, spins. Physicality is the focus.",
        "pacing": "Energetic with musical structure. Builds, peaks, cool-downs. Follows choreographic arc.",
        "mood": "Kinetic, powerful, visceral.",
    },
    "editorial": {
        "name": "Editorial",
        "camera": "Static or very slow camera. Minimal movement — almost photographic. If movement, extremely slow dolly or drift.",
        "subject": "Micro-expressions, small gestures, subtle shifts. A breath, a glance, fingers moving. Stillness is the statement.",
        "pacing": "Contemplative. Long, meditative holds. Minimal energy variation.",
        "mood": "Thoughtful, artistic, intimate.",
    },
}


# ---------------------------------------------------------------------------
# Agent System Prompts
# ---------------------------------------------------------------------------

ANALYST_INSTRUCTION = """You are a senior cinematography director and scene planner. You receive a set of images (up to 10) that will each become a short video clip (5-10 seconds each via Kling 2.6 Image-to-Video).

Your job: Analyze ALL images together as a cohesive visual sequence and create a structured scene plan.

STYLE PRESET: {style_name}
Style characteristics:
- Camera: {style_camera}
- Subject motion: {style_subject}
- Pacing: {style_pacing}
- Mood: {style_mood}

{user_note_section}

For each image/scene, analyze:
1. Shot type (wide, medium, close-up, etc.)
2. Subject pose and position
3. Environment and setting
4. Lighting conditions
5. Visual energy level (1-10)
6. What type of motion would naturally extend this frozen moment

Then create a HOLISTIC PLAN considering:
- Pacing curve across all scenes (how energy rises/falls)
- Mood arc (emotional progression)
- Camera variety (no two adjacent scenes should have the same camera move)
- Visual flow and transitions between scenes

CRITICAL: Output ONLY a valid JSON object with NO markdown, NO code fences, NO extra text.

Format:
{{
  "overall_mood_arc": "description of emotional progression across all scenes",
  "pacing_curve": "description of energy flow (e.g., 'builds from 3 to 7, peaks at scene 5, resolves to 4')",
  "scenes": [
    {{
      "scene_index": 0,
      "shot_type_detected": "what shot type the image appears to be",
      "subject_description": "brief description of subject pose/appearance",
      "environment": "setting, lighting, mood of the environment",
      "energy_level": 5,
      "recommended_camera_move": "specific camera movement for this scene",
      "recommended_subject_motion": "what the subject should do",
      "recommended_environment_motion": "environmental movement (wind, light shifts, etc.)",
      "direction_notes": "specific directorial notes for the motion writer",
      "duration_suggestion": "5s or 10s with reasoning"
    }}
  ]
}}
"""

MOTION_WRITER_INSTRUCTION = """You are an expert Kling 2.6 Image-to-Video prompt engineer. You write motion prompts that transform still images into compelling video clips.

## CRITICAL KLING 2.6 I2V RULES:
1. The IMAGE already provides visual content — do NOT describe what's in the image
2. Focus on CONTEXT + ENVIRONMENT + STYLE + MOTION
3. Four components: Scene Setting, Subject Motion, Camera Motion, Stylistic Guidance
4. Weight key elements with ++ syntax: "++slow dolly forward++"
5. Use technical camera terms: "shot on virtual anamorphic lens, 24mm, f/2.8"
6. Include temporal consistency keywords: "consistent lighting", "steady camera", "continuous motion"
7. Keep prompts UNDER 200 words
8. Simple movements work best (subtle weight shift > complex dance)
9. Slow dollies and tracking shots work great; fast whip pans struggle
10. For 5s clips: less motion. For 10s clips: can have more progression
11. NEVER over-describe — less is more
12. NEVER use contradictory lighting terms
13. NEVER combine more than 2 simultaneous camera transforms
14. Physics compliance is mandatory — movements must be physically feasible
15. Simple, clear language required

## PROMPT FORMULA:
Scene setting (atmosphere/lighting) + Subject motion directive + Camera movement + Style/lens keywords

## GOOD EXAMPLES:
- "Golden hour warmth, ++gentle tracking shot right++, subject turns head slowly with a slight smile, hair catches wind, consistent warm lighting, shot on 50mm f/1.8, continuous motion"
- "++Slow dolly forward++ into medium close-up, subject takes one confident step, fabric sways naturally, studio lighting consistent, cinematic 35mm anamorphic"
- "Static camera with subtle drift right, subject breathes naturally with micro-expressions, atmospheric haze, consistent soft lighting, 85mm portrait lens"

## BAD EXAMPLES (avoid these):
- "A beautiful woman with long hair wearing a red dress stands in a room" (describes image content)
- "Camera zooms in while panning left while tilting up while rotating" (too many transforms)
- "Subject does a backflip and lands in splits" (physically complex, will look bad)
- "Warm golden sunlight mixed with cool blue moonlight" (contradictory lighting)

## SCENE PLAN FROM ANALYST:
{scene_plan}

You are writing the motion prompt for Scene {scene_index} (0-indexed).

Analyst's direction for this scene:
- Recommended camera: {camera_move}
- Recommended subject motion: {subject_motion}
- Recommended environment motion: {env_motion}
- Direction notes: {direction_notes}
- Duration: {duration}
- Energy level: {energy_level}/10

CRITICAL: Output ONLY a valid JSON object with NO markdown, NO code fences:
{{
  "scene_index": {scene_index},
  "motion_prompt": "the full Kling 2.6 motion prompt text",
  "camera_move": "brief camera move label (e.g., 'slow dolly forward')",
  "subject_motion": "brief subject motion label (e.g., 'subtle head turn')",
  "duration_suggestion": "5s or 10s",
  "negative_prompt": "what to avoid (e.g., 'sudden movements, jump cuts, flickering')"
}}
"""

EDITOR_INSTRUCTION = """You are a senior video editor reviewing a set of Kling 2.6 I2V motion prompts for consistency, flow, and quality.

## YOUR REVIEW CHECKLIST:
1. **Camera variety**: No two ADJACENT scenes should have the same camera move. If they do, change one.
2. **Energy arc**: The energy should match the style preset's pacing pattern. Verify the overall arc makes sense.
3. **Transition coherence**: Adjacent scenes should flow naturally — if scene 2 ends with forward motion, scene 3 shouldn't abruptly start with backward motion.
4. **Prompt quality**: Each prompt should follow Kling 2.6 best practices (under 200 words, no image description, weighted keywords).
5. **Physics check**: All described movements must be physically plausible.
6. **Duration consistency**: Duration suggestions should make sense for the described motion amount.

## STYLE PRESET: {style_name}
Style characteristics:
- Camera: {style_camera}
- Subject motion: {style_subject}
- Pacing: {style_pacing}
- Mood: {style_mood}

## ANALYST'S SCENE PLAN:
{scene_plan}

## MOTION PROMPTS TO REVIEW:
{motion_prompts}

Review all prompts. Fix any issues. Polish language. Ensure the set works as a cohesive sequence.

CRITICAL: Output ONLY a valid JSON object with NO markdown, NO code fences:
{{
  "review_notes": "brief summary of changes made",
  "prompts": [
    {{
      "scene_index": 0,
      "motion_prompt": "the final polished Kling 2.6 motion prompt",
      "camera_move": "brief camera move label",
      "subject_motion": "brief subject motion label",
      "duration_suggestion": "5s or 10s",
      "negative_prompt": "what to avoid"
    }}
  ]
}}
"""

REFINE_INSTRUCTION = """You are an expert Kling 2.6 I2V motion prompt editor. You previously generated a set of motion prompts and the user wants refinements.

## CURRENT PROMPTS:
{current_prompts}

## ORIGINAL SCENE PLAN:
{scene_plan}

{refine_scope}

The user's refinement request: Apply their feedback while maintaining:
- Kling 2.6 prompt best practices (under 200 words, no image description, weighted ++ keywords)
- Flow consistency across all scenes
- Physics compliance
- Style coherence

CRITICAL: Output ONLY a valid JSON object with NO markdown, NO code fences:
{{
  "prompts": [
    {{
      "scene_index": 0,
      "motion_prompt": "the refined Kling 2.6 motion prompt",
      "camera_move": "brief camera move label",
      "subject_motion": "brief subject motion label",
      "duration_suggestion": "5s or 10s",
      "negative_prompt": "what to avoid"
    }}
  ]
}}

Return ALL prompts, not just modified ones. Keep unchanged prompts exactly as they were.
"""


# ---------------------------------------------------------------------------
# Agent Factories
# ---------------------------------------------------------------------------

def create_analyst_agent(
    style_preset: str,
    user_note: Optional[str] = None,
) -> LlmAgent:
    """Create the Analyst agent that plans the scene sequence."""
    style = STYLE_PRESETS.get(style_preset, STYLE_PRESETS["cinematic_narrative"])
    user_note_section = f"USER NOTE: {user_note}" if user_note else ""

    instruction = ANALYST_INSTRUCTION.format(
        style_name=style["name"],
        style_camera=style["camera"],
        style_subject=style["subject"],
        style_pacing=style["pacing"],
        style_mood=style["mood"],
        user_note_section=user_note_section,
    )

    return LlmAgent(
        name="motion_analyst",
        model="gemini-2.5-flash",
        description="Analyzes images and creates a holistic scene plan with pacing and mood arc.",
        instruction=instruction,
    )


def create_motion_writer_agent(
    scene_plan: dict,
    scene_index: int,
) -> LlmAgent:
    """Create a Motion Writer agent for a specific scene."""
    scene_data = scene_plan["scenes"][scene_index]

    instruction = MOTION_WRITER_INSTRUCTION.format(
        scene_plan=json.dumps(scene_plan, indent=2),
        scene_index=scene_index,
        camera_move=scene_data.get("recommended_camera_move", "dolly forward"),
        subject_motion=scene_data.get("recommended_subject_motion", "subtle movement"),
        env_motion=scene_data.get("recommended_environment_motion", "ambient movement"),
        direction_notes=scene_data.get("direction_notes", ""),
        duration=scene_data.get("duration_suggestion", "5s"),
        energy_level=scene_data.get("energy_level", 5),
    )

    return LlmAgent(
        name=f"motion_writer_{scene_index}",
        model="gemini-2.5-flash",
        description=f"Writes Kling 2.6 motion prompt for scene {scene_index}.",
        instruction=instruction,
    )


def create_editor_agent(
    style_preset: str,
    scene_plan: dict,
    motion_prompts: list[dict],
) -> LlmAgent:
    """Create the Editor agent that reviews and polishes all prompts."""
    style = STYLE_PRESETS.get(style_preset, STYLE_PRESETS["cinematic_narrative"])

    instruction = EDITOR_INSTRUCTION.format(
        style_name=style["name"],
        style_camera=style["camera"],
        style_subject=style["subject"],
        style_pacing=style["pacing"],
        style_mood=style["mood"],
        scene_plan=json.dumps(scene_plan, indent=2),
        motion_prompts=json.dumps(motion_prompts, indent=2),
    )

    return LlmAgent(
        name="motion_editor",
        model="gemini-2.5-flash",
        description="Reviews all motion prompts for consistency, flow, and quality.",
        instruction=instruction,
    )


def create_refine_agent(
    current_prompts: list[dict],
    scene_plan: dict,
    scene_index: Optional[int] = None,
) -> LlmAgent:
    """Create a refinement agent for updating existing prompts."""
    if scene_index is not None:
        refine_scope = f"The user wants to modify ONLY scene {scene_index}. Keep all other prompts exactly the same."
    else:
        refine_scope = "Apply the user's feedback to whichever prompts are relevant."

    instruction = REFINE_INSTRUCTION.format(
        current_prompts=json.dumps(current_prompts, indent=2),
        scene_plan=json.dumps(scene_plan, indent=2),
        refine_scope=refine_scope,
    )

    return LlmAgent(
        name="motion_refiner",
        model="gemini-2.5-flash",
        description="Refines motion prompts based on user feedback.",
        instruction=instruction,
    )


# ---------------------------------------------------------------------------
# JSON parsing helper
# ---------------------------------------------------------------------------

def parse_json_from_text(text: str) -> dict | list:
    """Extract JSON object or array from agent response text."""
    cleaned = text.strip()

    # Remove markdown code fences if present
    cleaned = re.sub(r'^```(?:json)?\s*\n?', '', cleaned)
    cleaned = re.sub(r'\n?```\s*$', '', cleaned)
    cleaned = cleaned.strip()

    # Try direct parse
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass

    # Try to find JSON object
    match = re.search(r'\{[\s\S]*\}', cleaned)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass

    # Try to find JSON array
    match = re.search(r'\[[\s\S]*\]', cleaned)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass

    raise ValueError(f"Could not parse JSON from agent response: {text[:500]}")
