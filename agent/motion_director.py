"""Motion Director — 3-agent sequential pipeline for Kling 2.6 I2V motion prompts.

Architecture (v2 — shared session + context chain):
  1. CONFIG AGENT  — Analyzes ALL images, plans scene sequence, recommends optimal order
  2. MOTION WRITER — Writes full Kling 2.6 structured prompts (visual + audio layers)
  3. EDITOR AGENT  — Reviews all prompts, can reorder scenes, enforces format consistency

All agents use gemini-2.5-flash. API key is passed per-request.
Agents share context via a pipeline_state dict that accumulates through the chain.
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
        "audio_style": "Ambient beat, subtle footstep sounds, no dialogue unless specified.",
    },
    "fashion_show": {
        "name": "Fashion Show",
        "camera": "Dynamic angles, quick-cut feel via varied shot types. Low angles, runway perspective, audience POV intercuts.",
        "subject": "Runway walk pattern: walk → pause → pose → walk. Rhythmic, beat-driven movement. Sharp turns.",
        "pacing": "Rhythmic pulses. Build-pause-build. High energy with deliberate pauses.",
        "mood": "Theatrical, high-energy, spectacle.",
        "audio_style": "Strong beat/bass, crowd ambience, fabric movement sounds.",
    },
    "music_video": {
        "name": "Music Video",
        "camera": "Creative angles, some handheld feel. Whip pans (gentle), crane-like moves, dutch angles. Varied and expressive.",
        "subject": "Expressive, stylized movement. Lip-sync feel, gestural. Varies with 'beats' — can be restrained then explosive.",
        "pacing": "Varies dramatically. Gentle verses, energetic choruses. Builds and drops.",
        "mood": "Emotional, artistic, stylized.",
        "audio_style": "Music-driven, beat-synchronized motion, optional vocals or narration.",
    },
    "cinematic_narrative": {
        "name": "Cinematic Narrative",
        "camera": "Classical cinematography: wide establishing → medium → close-up progression. Steady, deliberate moves. Smooth dolly.",
        "subject": "Subtle, naturalistic. Small gestures, breathing, micro-expressions. Realistic and understated.",
        "pacing": "Steady build to climax. Long holds, patient reveals. Crescendo structure.",
        "mood": "Dramatic, immersive, filmic.",
        "audio_style": "Cinematic score undertone, detailed ambient SFX, optional narration or dialogue.",
    },
    "product_showcase": {
        "name": "Product Showcase",
        "camera": "Smooth orbits, gentle reveals, macro-to-wide transitions. Measured, luxurious camera movement.",
        "subject": "Minimal subject motion. Product as hero — subtle light catches, gentle rotation cues. Environment stays still.",
        "pacing": "Measured, luxurious. Even tempo throughout. No sudden changes.",
        "mood": "Premium, refined, aspirational.",
        "audio_style": "Clean narration, subtle SFX (glass clink, fabric rustle), gentle ambient music.",
    },
    "dance_performance": {
        "name": "Dance Performance",
        "camera": "Dynamic tracking, circling, low-to-high sweeps. Camera energy matches dancer energy.",
        "subject": "Full body movement, expressive limbs, weight shifts, jumps, spins. Physicality is the focus.",
        "pacing": "Energetic with musical structure. Builds, peaks, cool-downs. Follows choreographic arc.",
        "mood": "Kinetic, powerful, visceral.",
        "audio_style": "Strong rhythm, beat drops, body movement SFX (shoe taps, fabric whoosh).",
    },
    "editorial": {
        "name": "Editorial",
        "camera": "Static or very gentle camera. Minimal movement — almost photographic. If movement, extremely gentle dolly or drift.",
        "subject": "Micro-expressions, small gestures, subtle shifts. A breath, a glance, fingers moving. Stillness is the statement.",
        "pacing": "Contemplative. Long, meditative holds. Minimal energy variation.",
        "mood": "Thoughtful, artistic, intimate.",
        "audio_style": "Minimal ambient, soft room tone, no music or very faint atmospheric.",
    },
}


# ---------------------------------------------------------------------------
# Agent System Prompts (v2 — Kling 2.6 structured format)
# ---------------------------------------------------------------------------

CONFIG_AGENT_INSTRUCTION = """You are a senior cinematography director, scene planner, and sequence optimizer. You receive a set of images (up to 10) that will each become a short video clip (5-10 seconds each via Kling 2.6 Image-to-Video).

Your job: Analyze ALL images together, plan the visual/audio sequence, and **recommend the optimal scene order** for maximum impact with minimum post-production editing.

## ABSOLUTE RULE — NO SLOW MOTION:
ALL clips MUST be normal speed. Do NOT recommend slow motion, slow-mo, speed ramps, time dilation, or any temporal speed manipulation. Every movement, camera move, and action must play at real-time 1x speed. This is non-negotiable.

STYLE PRESET: {style_name}
Style characteristics:
- Camera: {style_camera}
- Subject motion: {style_subject}
- Pacing: {style_pacing}
- Mood: {style_mood}
- Audio style: {style_audio}

{user_note_section}

## ANALYSIS TASKS:

For each image/scene, analyze:
1. Shot type (wide, medium, close-up, etc.)
2. Subject pose and position
3. Environment and setting
4. Lighting conditions and color temperature
5. Visual energy level (1-10)
6. What type of motion would naturally extend this frozen moment
7. What audio would complement this scene (ambient, dialogue, SFX, music)

## SEQUENCE OPTIMIZATION (CRITICAL):

After analyzing all images, determine the **optimal scene order**. Consider:
- **Energy arc**: Build tension naturally (e.g., calm opener → rising action → peak → resolution)
- **Visual flow**: Adjacent scenes should have complementary compositions (don't cut from two identical wide shots)
- **Color/mood continuity**: Group or sequence by color temperature and mood
- **Camera variety**: Ensure no two adjacent scenes use the same camera move
- **Audio transitions**: Plan how audio flows between scenes (cross-fade opportunities, beat alignment)
- **Story logic**: If images suggest a narrative, order them for coherent storytelling

The goal: **order the scenes so they cut together seamlessly with ZERO manual reordering by the editor.**

## OUTPUT FORMAT:

CRITICAL: Output ONLY a valid JSON object with NO markdown, NO code fences, NO extra text.

{{
  "overall_mood_arc": "description of emotional progression across all scenes",
  "pacing_curve": "description of energy flow (e.g., 'builds from 3 to 7, peaks at scene 5, resolves to 4')",
  "audio_arc": "how audio should flow across the sequence (e.g., 'ambient opener, music builds, dialogue peak, ambient close')",
  "recommended_order": [2, 0, 3, 1],
  "order_reasoning": "Why this order works better than the original: Scene 2 has low energy and warm tones (perfect opener), scene 0 introduces the subject with medium energy...",
  "scenes": [
    {{
      "scene_index": 0,
      "original_position": 0,
      "shot_type_detected": "what shot type the image appears to be",
      "subject_description": "brief description of subject pose/appearance",
      "environment": "setting, lighting, mood of the environment",
      "color_temperature": "warm/cool/neutral + dominant colors",
      "energy_level": 5,
      "recommended_camera_move": "specific camera movement for this scene",
      "recommended_subject_motion": "what the subject should do",
      "recommended_environment_motion": "environmental movement (wind, light shifts, etc.)",
      "recommended_audio": {{
        "dialogue": "none / narration line / character dialogue",
        "ambience": "specific ambient sounds",
        "sfx": "specific sound effects",
        "music": "genre + energy + volume level"
      }},
      "direction_notes": "specific directorial notes for the motion writer",
      "duration_suggestion": "5s or 10s with reasoning",
      "transition_to_next": "how this scene should flow into the next (cut, fade, energy shift)"
    }}
  ]
}}
"""

MOTION_WRITER_INSTRUCTION = """You are an expert Kling 2.6 prompt engineer. You write FULL structured prompts that produce compelling video clips with synchronized audio-visual output.

## ABSOLUTE RULE — NO SLOW MOTION:
ALL clips MUST be normal speed (1x). NEVER use slow motion, slow-mo, "slowly", "in slow motion", speed ramps, time dilation, or any temporal speed manipulation. Every movement, camera move, and action must play at real-time speed. Use "steady", "smooth", "gentle" instead of "slow" when describing pace. This is non-negotiable and overrides all other style instructions.

## KLING 2.6 PROMPT STRUCTURE (MANDATORY):

Every prompt MUST include ALL of these layers:
1. **Scene**: Location, time of day, lighting, visual style
2. **Characters/Objects**: Who or what is visible (but DO NOT over-describe what's already in the reference image)
3. **Action**: What happens during the 5-10 seconds
4. **Camera**: Shot type + movement (use technical terms)
5. **Audio – Dialogue/Narration**: Who speaks, exact lines in quotes, tone, speed (or "No dialogue")
6. **Audio – Ambience & SFX**: Background sounds + key sound effects (be SPECIFIC)
7. **Music** (optional): Genre + energy + volume level (or "None")
8. **Avoid**: What NOT to generate (artifacts, distortions, etc.)

## CRITICAL KLING 2.6 I2V RULES:
1. The IMAGE provides visual content — focus on MOTION + AUDIO, not appearance description
2. Audio and video are generated together — your prompt must describe both clearly
3. Keep dialogue to 1-2 short sentences max (5-10 seconds only!)
4. Use clear audio anchors: "soft café ambience with low crowd chatter" NOT "ambient noise"
5. Label speakers: "Narrator (calm female voice):" or "Character (excited):"
6. Weight key visual elements: "++steady dolly forward++"
7. One main idea per prompt — one location, one action, one emotional beat
8. Simple movements > complex ones (subtle weight shift > backflip)
9. Under 200 words total
10. Physics compliance mandatory

## GOOD PROMPT EXAMPLES:

Example 1 (Product):
```
Scene: Bright white studio, soft daylight, minimal background.
Action: She lifts the bottle to camera, smiles, turns slightly as light catches the product.
Camera: ++Steady push-in++ from medium shot to close-up.
Audio – narration: Warm female narrator says, "Meet LumiGlow – skincare that makes every day a good-skin day." Calm, confident tone.
Audio – ambience & SFX: Subtle studio room tone, soft cloth movement, tiny glass clink.
Music: Gentle electronic ambient, low volume, uplifting.
Avoid: No text on screen, no flickering, no glitches.
```

Example 2 (Talking Head):
```
Scene: Nighttime, warm bedroom lighting, shallow depth of field.
Action: He smiles slightly, speaks calmly to the viewer.
Camera: Static medium shot, subtle breathing motion.
Audio – dialogue: Male voice, soft and friendly: "This entire video was created with AI. Crazy, right?" Natural pacing, tiny pause before "Crazy, right?"
Audio – ambience & SFX: Quiet room ambience, distant city hum.
Music: Very soft lo-fi beat, almost inaudible.
Avoid: No camera shake, no facial distortions, no subtitles.
```

## CONTEXT FROM CONFIG AGENT:

Pipeline state:
{pipeline_state}

You are writing the prompt for Scene {scene_index} (0-indexed).
Position in final sequence: {sequence_position}

Config Agent's direction for this scene:
- Recommended camera: {camera_move}
- Recommended subject motion: {subject_motion}
- Recommended environment motion: {env_motion}
- Recommended audio: {audio_direction}
- Direction notes: {direction_notes}
- Duration: {duration}
- Energy level: {energy_level}/10
- Transition to next: {transition_to_next}

CRITICAL: Output ONLY a valid JSON object with NO markdown, NO code fences:
{{
  "scene_index": {scene_index},
  "structured_prompt": {{
    "scene": "location, time, style description",
    "action": "what happens during the clip",
    "camera": "shot type and movement",
    "audio_dialogue": "dialogue/narration with speaker labels, or 'No dialogue'",
    "audio_ambience_sfx": "specific ambient sounds and sound effects",
    "music": "genre + energy + volume, or 'None'",
    "avoid": "what to avoid in generation"
  }},
  "motion_prompt": "the full flattened Kling 2.6 prompt combining all layers into one paragraph for API submission",
  "camera_move": "brief camera move label",
  "subject_motion": "brief subject motion label",
  "duration_suggestion": "5s or 10s",
  "negative_prompt": "what to avoid"
}}
"""

EDITOR_INSTRUCTION = """You are a senior video editor and sequence supervisor reviewing a set of Kling 2.6 I2V prompts for a cohesive final product.

## ABSOLUTE RULE — NO SLOW MOTION (ENFORCED AT FINAL STAGE):
This is the HIGHEST PRIORITY rule. You MUST reject and rewrite ANY prompt that contains slow motion, slow-mo, "slowly", "in slow motion", speed ramps, time dilation, or any temporal speed manipulation. ALL clips MUST play at normal 1x speed. Replace "slow" camera/motion terms with "steady", "smooth", or "gentle". If a previous agent used slow motion, FIX IT. No exceptions.

## YOUR RESPONSIBILITIES:

### 1. SEQUENCE REVIEW
- The Config Agent recommended scene order: {recommended_order}
- Verify this order makes sense. If you disagree, provide a **revised_order**.
- Check that adjacent scenes flow naturally (energy, mood, color temperature).

### 2. PROMPT QUALITY CHECK
For each prompt verify:
- Follows Kling 2.6 structured format (Scene/Action/Camera/Audio/Ambience/Music/Avoid)
- Under 200 words
- No image content re-description (motion + audio only)
- Audio anchors are specific, not vague
- Dialogue is 1-2 sentences max
- No contradictory lighting or physics violations
- Camera variety (no two adjacent scenes with same move)

### 3. AUDIO CONTINUITY
- Audio should flow between scenes (not jarring cuts)
- Music energy should match the overall arc
- Ambient sounds should be consistent within similar environments
- Dialogue pacing should feel natural across scenes

### 4. TRANSITION COHERENCE
- If scene N ends with forward motion, scene N+1 shouldn't start with backward motion
- Energy transitions should be smooth (no 2→9 jumps without reason)

## STYLE PRESET: {style_name}
- Camera: {style_camera}
- Subject motion: {style_subject}
- Pacing: {style_pacing}
- Mood: {style_mood}
- Audio style: {style_audio}

## PIPELINE STATE (Config Agent's analysis):
{pipeline_state}

## MOTION PROMPTS TO REVIEW:
{motion_prompts}

Review all prompts. Fix issues. Polish language. Reorder if needed. Ensure the set works as a cohesive sequence that requires ZERO manual editing.

CRITICAL: Output ONLY a valid JSON object with NO markdown, NO code fences:
{{
  "review_notes": "brief summary of changes made",
  "final_order": [0, 1, 2, 3],
  "order_changed": false,
  "order_change_reason": "why the order was changed (if applicable)",
  "prompts": [
    {{
      "scene_index": 0,
      "structured_prompt": {{
        "scene": "...",
        "action": "...",
        "camera": "...",
        "audio_dialogue": "...",
        "audio_ambience_sfx": "...",
        "music": "...",
        "avoid": "..."
      }},
      "motion_prompt": "the full flattened prompt for API submission",
      "camera_move": "brief camera move label",
      "subject_motion": "brief subject motion label",
      "duration_suggestion": "5s or 10s",
      "negative_prompt": "what to avoid"
    }}
  ]
}}
"""

REFINE_INSTRUCTION = """You are an expert Kling 2.6 prompt editor. You previously generated structured prompts and the user wants refinements.

## ABSOLUTE RULE — NO SLOW MOTION:
ALL clips MUST be normal speed (1x). NEVER use slow motion, slow-mo, "slowly", "in slow motion", speed ramps, or time dilation. Replace with "steady", "smooth", or "gentle" where needed. This overrides all other instructions.

## CURRENT PROMPTS:
{current_prompts}

## PIPELINE STATE:
{pipeline_state}

{refine_scope}

Apply the user's feedback while maintaining:
- Kling 2.6 structured format (Scene/Action/Camera/Audio-Dialogue/Audio-Ambience/Music/Avoid)
- Flow consistency across all scenes
- Audio continuity between adjacent scenes
- Physics compliance
- Style coherence
- Optimal scene ordering

If the user asks to reorder/shuffle, provide a new order in `final_order`.

CRITICAL: Output ONLY a valid JSON object with NO markdown, NO code fences:
{{
  "final_order": [0, 1, 2, 3],
  "order_changed": false,
  "prompts": [
    {{
      "scene_index": 0,
      "structured_prompt": {{
        "scene": "...",
        "action": "...",
        "camera": "...",
        "audio_dialogue": "...",
        "audio_ambience_sfx": "...",
        "music": "...",
        "avoid": "..."
      }},
      "motion_prompt": "the full flattened prompt for API submission",
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

def create_config_agent(
    style_preset: str,
    user_note: Optional[str] = None,
) -> LlmAgent:
    """Create the Config Agent that plans the scene sequence and optimal order."""
    style = STYLE_PRESETS.get(style_preset, STYLE_PRESETS["cinematic_narrative"])
    user_note_section = f"USER NOTE: {user_note}" if user_note else ""

    instruction = CONFIG_AGENT_INSTRUCTION.format(
        style_name=style["name"],
        style_camera=style["camera"],
        style_subject=style["subject"],
        style_pacing=style["pacing"],
        style_mood=style["mood"],
        style_audio=style.get("audio_style", "Ambient, style-appropriate."),
        user_note_section=user_note_section,
    )

    return LlmAgent(
        name="config_agent",
        model="gemini-2.5-flash",
        description="Analyzes images, plans scene sequence, recommends optimal scene order for minimal editing.",
        instruction=instruction,
    )


def create_motion_writer_agent(
    pipeline_state: dict,
    scene_index: int,
    sequence_position: int,
) -> LlmAgent:
    """Create a Motion Writer agent for a specific scene with full pipeline context."""
    scene_plan = pipeline_state.get("scene_plan", {})
    scenes = scene_plan.get("scenes", [])

    # Find scene data for this index
    scene_data = None
    for s in scenes:
        if s.get("scene_index") == scene_index:
            scene_data = s
            break
    if scene_data is None and scene_index < len(scenes):
        scene_data = scenes[scene_index]
    if scene_data is None:
        scene_data = {}

    # Extract audio direction
    audio_rec = scene_data.get("recommended_audio", {})
    if isinstance(audio_rec, dict):
        audio_direction = json.dumps(audio_rec)
    else:
        audio_direction = str(audio_rec) if audio_rec else "style-appropriate ambient"

    instruction = MOTION_WRITER_INSTRUCTION.format(
        pipeline_state=json.dumps(pipeline_state, indent=2),
        scene_index=scene_index,
        sequence_position=sequence_position,
        camera_move=scene_data.get("recommended_camera_move", "dolly forward"),
        subject_motion=scene_data.get("recommended_subject_motion", "subtle movement"),
        env_motion=scene_data.get("recommended_environment_motion", "ambient movement"),
        audio_direction=audio_direction,
        direction_notes=scene_data.get("direction_notes", ""),
        duration=scene_data.get("duration_suggestion", "5s"),
        energy_level=scene_data.get("energy_level", 5),
        transition_to_next=scene_data.get("transition_to_next", "natural cut"),
    )

    return LlmAgent(
        name=f"motion_writer_{scene_index}",
        model="gemini-2.5-flash",
        description=f"Writes full Kling 2.6 structured prompt (visual + audio) for scene {scene_index}.",
        instruction=instruction,
    )


def create_editor_agent(
    style_preset: str,
    pipeline_state: dict,
    motion_prompts: list[dict],
) -> LlmAgent:
    """Create the Editor Agent that reviews, polishes, and can reorder scenes."""
    style = STYLE_PRESETS.get(style_preset, STYLE_PRESETS["cinematic_narrative"])
    recommended_order = pipeline_state.get("recommended_order", list(range(len(motion_prompts))))

    instruction = EDITOR_INSTRUCTION.format(
        style_name=style["name"],
        style_camera=style["camera"],
        style_subject=style["subject"],
        style_pacing=style["pacing"],
        style_mood=style["mood"],
        style_audio=style.get("audio_style", "Ambient, style-appropriate."),
        pipeline_state=json.dumps(pipeline_state, indent=2),
        motion_prompts=json.dumps(motion_prompts, indent=2),
        recommended_order=json.dumps(recommended_order),
    )

    return LlmAgent(
        name="editor_agent",
        model="gemini-2.5-flash",
        description="Reviews all prompts for consistency, flow, audio continuity, and optimal scene order.",
        instruction=instruction,
    )


def create_refine_agent(
    current_prompts: list[dict],
    pipeline_state: dict,
    scene_index: Optional[int] = None,
) -> LlmAgent:
    """Create a refinement agent for updating existing prompts."""
    if scene_index is not None:
        refine_scope = f"The user wants to modify ONLY scene {scene_index}. Keep all other prompts exactly the same."
    else:
        refine_scope = "Apply the user's feedback to whichever prompts are relevant."

    instruction = REFINE_INSTRUCTION.format(
        current_prompts=json.dumps(current_prompts, indent=2),
        pipeline_state=json.dumps(pipeline_state, indent=2),
        refine_scope=refine_scope,
    )

    return LlmAgent(
        name="motion_refiner",
        model="gemini-2.5-flash",
        description="Refines motion prompts based on user feedback, can reorder scenes.",
        instruction=instruction,
    )


# ---------------------------------------------------------------------------
# Pipeline State Builder
# ---------------------------------------------------------------------------

def build_pipeline_state(
    scene_plan: dict,
    style_preset: str,
    motion_prompts: Optional[list[dict]] = None,
    editor_notes: Optional[str] = None,
) -> dict:
    """Build the shared pipeline state dict that flows through all agents."""
    state = {
        "style_preset": style_preset,
        "style_details": STYLE_PRESETS.get(style_preset, STYLE_PRESETS["cinematic_narrative"]),
        "scene_plan": scene_plan,
        "recommended_order": scene_plan.get("recommended_order", []),
        "order_reasoning": scene_plan.get("order_reasoning", ""),
        "overall_mood_arc": scene_plan.get("overall_mood_arc", ""),
        "pacing_curve": scene_plan.get("pacing_curve", ""),
        "audio_arc": scene_plan.get("audio_arc", ""),
    }
    if motion_prompts:
        state["motion_prompts"] = motion_prompts
    if editor_notes:
        state["editor_notes"] = editor_notes
    return state


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


# ---------------------------------------------------------------------------
# Legacy aliases (backward compat)
# ---------------------------------------------------------------------------
create_analyst_agent = create_config_agent


# ============================================================================
# PIPELINE B: MOTION CONTROL (kling-2.6) — 4-agent pipeline
# ============================================================================
# Pipeline: Video Analyzer → MC Config → MC Context Writers (parallel) → MC Editor
# Key difference from Pipeline A: Context-only prompts (no motion description)
# Reference video defines motion, prompt defines scene/environment/style
# ============================================================================

VIDEO_ANALYZER_INSTRUCTION = """You are a video analyst specializing in motion extraction for AI video generation.

Analyze the reference video and extract the following elements as JSON:

## ANALYSIS TASKS:

1. **camera_movements**: List all camera movements in order:
   - Type (pan_left, pan_right, tilt_up, tilt_down, dolly_forward, dolly_back, dolly_left, dolly_right, zoom_in, zoom_out, static, tracking, handheld, crane_up, crane_down, whip_pan, steady)
   - Speed (slow, medium, fast, varies)
   - Duration (how long each move lasts, as percentage or seconds)

2. **subject_motion_patterns**: What the subject/person does:
   - Overall activity (walking, dancing, gesturing, standing, exercising, performing)
   - Energy level (1-10 scale)
   - Movement tempo (slow, moderate, fast)
   - Key motion phrases (e.g., "rhythmic arm gestures", "forward walking pace", "pivoting turns")

3. **energy_curve**: How energy ebbs and flows across the video:
   - Time markers (0%, 25%, 50%, 75%, 100%)
   - Energy level at each marker (1-10)
   - Description of transitions between energy levels

4. **beat_detection**: Musical or rhythmic cues (if applicable):
   - BPM estimate if music present
   - Beat emphasis points (where motion aligns with beat)
   - Tempo changes or rhythm shifts

5. **color_grading**: Visual characteristics:
   - Overall color temperature (warm, cool, neutral)
   - Dominant colors
   - Contrast level (high, medium, low)
   - Special effects (vignette, desaturation, tint, etc.)

6. **key_visual_elements_in_motion**: What moves in the scene:
   - Primary subject motion
   - Background/environmental motion
   - Any props or objects in motion
   - Camera motion (already covered above)

## OUTPUT FORMAT:

CRITICAL: Output ONLY a valid JSON object with NO markdown, NO code fences, NO extra text:

{
  "camera_movements": [
    {"type": "tracking", "speed": "moderate", "duration": "0-5s", "description": "camera follows subject walking forward"}
  ],
  "subject_motion_patterns": {
    "activity": "walking forward with occasional glances",
    "energy_level": 5,
    "tempo": "moderate",
    "key_phrases": ["steady forward pace", "natural head turns", "casual arm swing"]
  },
  "energy_curve": {
    "0%": {"level": 4, "description": "subject preparing to walk"},
    "25%": {"level": 5, "description": "walking at steady pace"},
    "50%": {"level": 6, "description": "increased confidence in stride"},
    "75%": {"level": 5, "description": "settling into rhythm"},
    "100%": {"level": 4, "description": "slowing to natural stop"}
  },
  "beat_detection": {
    "has_music": true,
    "bpm_estimate": 110,
    "beat_points": ["0:02", "0:04", "0:06"],
    "tempo_consistency": "consistent throughout"
  },
  "color_grading": {
    "temperature": "warm",
    "dominant_colors": ["orange", "brown", "golden"],
    "contrast": "medium",
    "special_notes": "golden hour lighting, slight vignette"
  },
  "key_visual_elements_in_motion": {
    "primary_subject": "person walking forward, arms swinging naturally",
    "background": "city sidewalk with passing cars, pedestrians in distance",
    "props": "none significant",
    "environmental": "leaves rustling, sunlight filtering through trees"
  },
  "overall_duration_seconds": 10,
  "shot_type": "medium shot, subject framed from thighs up"
}
"""

MC_CONFIG_AGENT_INSTRUCTION = """You are a senior cinematography director and scene planner for Motion Control video generation.

You receive:
1. Reference video analysis from the Video Analyzer (defines motion/choreography)
2. A set of character images (up to 10) that will become video clips

Your job: Plan the scene sequence that WORKS WITH the reference video's motion, not against it.

## CRITICAL RULES — NO SLOW MOTION:
ALL clips MUST be normal speed (1x). Do NOT recommend slow motion, slow-mo, speed ramps, or any temporal manipulation. The reference video's motion transfers directly at real-time speed.

## YOUR TASK:

1. Review the VIDEO ANALYSIS to understand:
   - What camera moves the reference video uses
   - What the subject does (motion pattern, energy)
   - The overall tempo and rhythm

2. Analyze each character image:
   - Pose compatibility with reference motion
   - Best scenes to pair with specific motion segments
   - Energy alignment with reference video energy curve

3. Plan scene sequence:
   - Which image goes with which segment of reference motion
   - How to transition between scenes smoothly
   - Where to use the reference motion as-is vs. where to complement it

## STYLE PRESET: {style_name}
- Camera: {style_camera}
- Subject motion: {style_subject}
- Pacing: {style_pacing}
- Mood: {style_mood}
- Audio style: {style_audio}

{user_note_section}

## VIDEO ANALYSIS CONTEXT:
{video_analysis}

## OUTPUT FORMAT:

CRITICAL: Output ONLY a valid JSON object with NO markdown, NO code fences, NO extra text:

{{
  "overall_approach": "How the reference video's motion will be applied to the character images",
  "motion_compatibility_notes": "Key observations about matching images to reference motion",
  "recommended_order": [2, 0, 3, 1],
  "order_reasoning": "Why this order works with the reference video's motion pattern",
  "scenes": [
    {{
      "scene_index": 0,
      "original_position": 0,
      "reference_motion_segment": "Which segment of reference video motion to use",
      "shot_type_detected": "what shot type the image appears to be",
      "subject_pose_notes": "pose compatibility with reference motion",
      "environment_style": "What environment/style this scene should have",
      "lighting_direction": "lighting style (from analysis or suggested)",
      "duration_suggestion": "5s or 10s",
      "transition_to_next": "how this scene flows into the next",
      "background_animation_cues": "What background elements should be animated"
    }}
  ]
}}
"""

MC_CONTEXT_WRITER_INSTRUCTION = """You are an expert Kling 2.6 Motion Control prompt engineer. You write CONTEXT-ONLY prompts — you NEVER describe motion because the reference video defines that.

## ABSOLUTE RULE — NO SLOW MOTION:
ALL clips are normal speed. The reference video's motion transfers directly. DO NOT describe speed, pace, timing, or motion execution.

## YOUR ROLE: CONTEXT WRITER

The reference video provides:
- Camera movement (already set)
- Subject motion/choreography (already set)
- Energy and rhythm (already set)

You provide:
- Scene setting (WHERE, WHEN)
- Environment details (background animation elements)
- Lighting and atmosphere
- Style modifiers
- Audio context (ambient, SFX — but NOT motion-linked audio)

## WHAT TO WRITE:

### 1. SCENE (Location + Time + Lighting)
- Indoor/outdoor location
- Time of day or lighting condition
- Weather/atmosphere if relevant
- Example: "Sunset on a rooftop terrace, warm golden hour lighting, distant city skyline silhouette"

### 2. ENVIRONMENT & BACKGROUND ANIMATION (CRITICAL — MAKE BACKGROUNDS ALIVE!)
This is where you describe what moves in the background:
- "city lights flickering, passing traffic on distant avenue"
- "golden leaves gently falling from overhanging trees"
- "warm ambient glow from cafe interiors, soft haze in air"
- "water droplets glistening on glass, steam rising"
- "neon signs pulsing, crowd silhouettes moving in background"
- "dust motes floating in sunbeams, subtle lens flare"

Be SPECIFIC about background animation. The reference video defines foreground motion — your job is to make the background alive too.

### 3. STYLE MODIFIERS
- Cinematic quality ("cinematic lighting, professional photography, 4K")
- Mood ("moody", "energetic", "serene")
- Visual references ("film grain", "warm color grade", "high contrast")

### 4. AUDIO (Ambient + SFX only)
- Room tone / ambient environment sounds
- Specific SFX that fit the scene (not motion-linked)
- Music genre/style (not beat-synced since reference audio may be preserved)

## WHAT NOT TO WRITE (Motion Description):

DO NOT describe:
- How the character moves
- Camera movements
- Speed or pace
- Timing or rhythm
- Motion execution

The reference video handles ALL motion. Your prompt only sets the SCENE around that motion.

## GOOD EXAMPLE:

SCENE: "Vintage recording studio, warm amber lighting, exposed brick walls, classic equipment visible"
ENVIRONMENT: "Analog VU meters gently fluctuating, soft dust particles floating in light beams, subtle room ambience"
AUDIO: "Warm room tone, subtle hum of equipment, distant street sounds through window"
STYLE: "Cinematic, film grain, warm color grade"

## POOR EXAMPLE (DO NOT DO THIS):
"Character walking confidently forward, camera tracking alongside at steady pace" — MOTION IS ALREADY IN REFERENCE

## CONTEXT FROM CONFIG AGENT:

Pipeline state:
{pipeline_state}

You are writing the context prompt for Scene {scene_index} (0-indexed).
Position in final sequence: {sequence_position}

Config Agent's guidance:
- Reference motion segment: {ref_motion_segment}
- Environment style: {env_style}
- Background animation cues: {bg_animation}
- Duration: {duration}
- Transition to next: {transition}

CRITICAL: Output ONLY a valid JSON object with NO markdown, NO code fences:

{{
  "scene_index": {scene_index},
  "context_prompt": {{
    "scene": "Location, time, lighting description",
    "environment_background": "Specific background elements that should be animated",
    "style_modifiers": "Visual style and mood modifiers",
    "audio_ambience": "Ambient sounds and room tone",
    "audio_sfx": "Specific sound effects (non-motion)",
    "music_suggestion": "Genre and mood, or 'None'"
  }},
  "motion_context_prompt": "Full flattened prompt for Motion Control API",
  "duration_suggestion": "5s or 10s",
  "negative_prompt": "What to avoid"
}}
"""

MC_EDITOR_INSTRUCTION = """You are a senior video editor reviewing Kling 2.6 Motion Control prompts.

## YOUR RESPONSIBILITIES:

### 1. VALIDATE NO MOTION RE-DESCRIPTION (CRITICAL)
Check that NO prompt describes:
- Camera movements (reference video provides this)
- Subject motion/actions (reference video provides this)
- Speed, pace, timing
- Motion execution

If you find motion description, REMOVE IT. The prompt should ONLY contain:
- Scene/environment context
- Background animation elements
- Lighting/atmosphere
- Style modifiers
- Audio (ambient/SFX only)

### 2. VALIDATE BACKGROUNDS ARE ALIVE
Each prompt should mention specific background animation:
- "city lights flickering", "leaves rustling", "water rippling", "dust motes floating"
- NOT just "background" — be SPECIFIC

If backgrounds are too static, ADD animation cues:
- Environmental motion that complements the scene
- Atmospheric elements (haze, glow, particles)
- Setting-specific details (neon, traffic, crowds, nature)

### 3. SCENE CONSISTENCY
- Lighting should be consistent across scenes (unless intentional contrast)
- Environment styles should complement each other
- Audio should flow between scenes

### 4. QUALITY CHECK
- Under 200 words
- Specific, concrete descriptions (not vague)
- No contradictory elements
- Audio anchors are specific

## STYLE PRESET: {style_name}
- Camera: {style_camera}
- Subject motion: {style_subject}
- Pacing: {style_pacing}
- Mood: {style_mood}
- Audio style: {style_audio}

## VIDEO ANALYSIS (from Video Analyzer):
{video_analysis}

## PIPELINE STATE:
{pipeline_state}

## MOTION CONTROL PROMPTS TO REVIEW:
{motion_prompts}

Review all prompts. Fix motion re-description. Enhance background animation. Ensure cohesive final product.

CRITICAL: Output ONLY a valid JSON object with NO markdown, NO code fences:

{{
  "review_notes": "Summary of changes made",
  "final_order": [0, 1, 2, 3],
  "order_changed": false,
  "prompts": [
    {{
      "scene_index": 0,
      "context_prompt": {{
        "scene": "Location, time, lighting",
        "environment_background": "Specific animated background elements",
        "style_modifiers": "Visual style",
        "audio_ambience": "Ambient sounds",
        "audio_sfx": "Specific SFX",
        "music_suggestion": "Music note or 'None'"
      }},
      "motion_context_prompt": "Full flattened prompt for API",
      "duration_suggestion": "5s or 10s",
      "negative_prompt": "What to avoid"
    }}
  ]
}}
"""

MC_REFINE_INSTRUCTION = """You are an expert Kling 2.6 Motion Control prompt editor. You previously generated context-only prompts.

## CRITICAL RULES — NO SLOW MOTION, NO MOTION DESCRIPTION:
- ALL clips are normal speed
- DO NOT describe camera movement, subject motion, speed, pace, or timing
- The reference video provides ALL motion
- You provide ONLY scene/environment/background animation context

## CURRENT PROMPTS:
{current_prompts}

## PIPELINE STATE:
{pipeline_state}

{refine_scope}

Apply the user's feedback while maintaining:
- Context-only format (NO motion description)
- Background animation in every prompt
- Kling 2.6 structured format (scene/environment/style/audio)
- Consistency across all scenes
- Style coherence

If the user asks to reorder/shuffle, provide a new order in `final_order`.

CRITICAL: Output ONLY a valid JSON object with NO markdown, NO code fences:

{{
  "final_order": [0, 1, 2, 3],
  "order_changed": false,
  "prompts": [
    {{
      "scene_index": 0,
      "context_prompt": {{
        "scene": "Location, time, lighting",
        "environment_background": "Specific animated background elements",
        "style_modifiers": "Visual style",
        "audio_ambience": "Ambient sounds",
        "audio_sfx": "Specific SFX",
        "music_suggestion": "Music note or 'None'"
      }},
      "motion_context_prompt": "Full flattened prompt for API",
      "duration_suggestion": "5s or 10s",
      "negative_prompt": "What to avoid"
    }}
  ]
}}

Return ALL prompts, not just modified ones. Keep unchanged prompts exactly as they were.
"""


# ---------------------------------------------------------------------------
# Motion Control Agent Factories
# ---------------------------------------------------------------------------

def create_video_analyzer_agent() -> LlmAgent:
    """Create the Video Analyzer Agent that extracts motion data from reference video."""
    instruction = VIDEO_ANALYZER_INSTRUCTION

    return LlmAgent(
        name="video_analyzer",
        model="gemini-2.5-flash",
        description="Analyzes reference video and extracts camera movements, subject motion, energy curve, and visual characteristics.",
        instruction=instruction,
    )


def create_mc_config_agent(
    style_preset: str,
    video_analysis: dict,
    user_note: Optional[str] = None,
) -> LlmAgent:
    """Create the Motion Control Config Agent that plans scene sequence around reference motion."""
    style = STYLE_PRESETS.get(style_preset, STYLE_PRESETS["cinematic_narrative"])
    user_note_section = f"USER NOTE: {user_note}" if user_note else ""

    instruction = MC_CONFIG_AGENT_INSTRUCTION.format(
        style_name=style["name"],
        style_camera=style["camera"],
        style_subject=style["subject"],
        style_pacing=style["pacing"],
        style_mood=style["mood"],
        style_audio=style.get("audio_style", "Ambient, style-appropriate."),
        user_note_section=user_note_section,
        video_analysis=json.dumps(video_analysis, indent=2),
    )

    return LlmAgent(
        name="mc_config_agent",
        model="gemini-2.5-flash",
        description="Plans scene sequence for Motion Control, matching images to reference video motion.",
        instruction=instruction,
    )


def create_mc_context_writer_agent(
    pipeline_state: dict,
    scene_index: int,
    sequence_position: int,
) -> LlmAgent:
    """Create a Motion Control Context Writer agent for a specific scene."""
    scene_plan = pipeline_state.get("scene_plan", {})
    scenes = scene_plan.get("scenes", [])

    # Find scene data for this index
    scene_data = None
    for s in scenes:
        if s.get("scene_index") == scene_index:
            scene_data = s
            break
    if scene_data is None and scene_index < len(scenes):
        scene_data = scenes[scene_index]
    if scene_data is None:
        scene_data = {}

    instruction = MC_CONTEXT_WRITER_INSTRUCTION.format(
        pipeline_state=json.dumps(pipeline_state, indent=2),
        scene_index=scene_index,
        sequence_position=sequence_position,
        ref_motion_segment=scene_data.get("reference_motion_segment", "match reference video motion"),
        env_style=scene_data.get("environment_style", "complementary environment"),
        bg_animation=scene_data.get("background_animation_cues", "appropriate animated background elements"),
        duration=scene_data.get("duration_suggestion", "5s"),
        transition=scene_data.get("transition_to_next", "natural cut"),
    )

    return LlmAgent(
        name=f"mc_context_writer_{scene_index}",
        model="gemini-2.5-flash",
        description=f"Writes context-only prompt (no motion description) for Motion Control scene {scene_index}.",
        instruction=instruction,
    )


def create_mc_editor_agent(
    style_preset: str,
    video_analysis: dict,
    pipeline_state: dict,
    motion_prompts: list[dict],
) -> LlmAgent:
    """Create the Motion Control Editor Agent that validates no motion re-description."""
    style = STYLE_PRESETS.get(style_preset, STYLE_PRESETS["cinematic_narrative"])
    recommended_order = pipeline_state.get("recommended_order", list(range(len(motion_prompts))))

    instruction = MC_EDITOR_INSTRUCTION.format(
        style_name=style["name"],
        style_camera=style["camera"],
        style_subject=style["subject"],
        style_pacing=style["pacing"],
        style_mood=style["mood"],
        style_audio=style.get("audio_style", "Ambient, style-appropriate."),
        video_analysis=json.dumps(video_analysis, indent=2),
        pipeline_state=json.dumps(pipeline_state, indent=2),
        motion_prompts=json.dumps(motion_prompts, indent=2),
        recommended_order=json.dumps(recommended_order),
    )

    return LlmAgent(
        name="mc_editor_agent",
        model="gemini-2.5-flash",
        description="Validates no motion re-description, ensures backgrounds are animated, reviews consistency.",
        instruction=instruction,
    )


def create_mc_refine_agent(
    current_prompts: list[dict],
    pipeline_state: dict,
    scene_index: Optional[int] = None,
) -> LlmAgent:
    """Create a refinement agent for Motion Control context prompts."""
    if scene_index is not None:
        refine_scope = f"The user wants to modify ONLY scene {scene_index}. Keep all other prompts exactly the same."
    else:
        refine_scope = "Apply the user's feedback to whichever prompts are relevant."

    instruction = MC_REFINE_INSTRUCTION.format(
        current_prompts=json.dumps(current_prompts, indent=2),
        pipeline_state=json.dumps(pipeline_state, indent=2),
        refine_scope=refine_scope,
    )

    return LlmAgent(
        name="mc_motion_refiner",
        model="gemini-2.5-flash",
        description="Refines Motion Control context prompts based on user feedback.",
        instruction=instruction,
    )


# ---------------------------------------------------------------------------
# Motion Control Pipeline State Builder
# ---------------------------------------------------------------------------

def build_mc_pipeline_state(
    video_analysis: dict,
    scene_plan: dict,
    style_preset: str,
    context_prompts: Optional[list[dict]] = None,
    editor_notes: Optional[str] = None,
) -> dict:
    """Build the shared pipeline state dict for Motion Control pipeline."""
    state = {
        "video_analysis": video_analysis,
        "style_preset": style_preset,
        "style_details": STYLE_PRESETS.get(style_preset, STYLE_PRESETS["cinematic_narrative"]),
        "scene_plan": scene_plan,
        "recommended_order": scene_plan.get("recommended_order", []),
        "order_reasoning": scene_plan.get("order_reasoning", ""),
    }
    if context_prompts:
        state["context_prompts"] = context_prompts
    if editor_notes:
        state["editor_notes"] = editor_notes
    return state
