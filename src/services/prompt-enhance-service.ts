/**
 * Prompt Enhancement Service — Uses Gemini 2.0 Flash to enhance prompts
 * with visual understanding (analyzes reference images) and model-specific
 * prompt engineering guides with multiple examples per model family.
 */

import { GoogleGenerativeAI, Part } from "@google/generative-ai";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PromptTarget =
  | 'gemini-image'      // Gemini 3 Pro image gen
  | 'seedream'          // Seedream 4.5
  | 'flux-dev'          // FLUX.1 Dev (ComfyUI)
  | 'kling-2.6'         // Kling 2.6 I2V
  | 'kling-3'           // Kling 3 MultiShot
  | 'kling-3-omni'      // Kling 3 Omni
  | 'veo-3.1'           // Veo 3.1
  | 'wan-2.2';          // Wan 2.2 NSFW I2V

export type EnhanceMode = 'enhance' | 'rewrite' | 'expand' | 'translate';

export interface EnhanceRequest {
  prompt: string;
  target: PromptTarget;
  mode: EnhanceMode;
  /** Base64 image for visual context */
  referenceImage?: { base64: string; mimeType: string };
  /** Additional context / style notes */
  styleNotes?: string;
  /** Number of variations to return */
  variations?: number;
}

export interface EnhanceResult {
  enhanced: string;
  variations?: string[];
  reasoning?: string;
}

// ---------------------------------------------------------------------------
// Model-specific prompt guides (few-shot examples)
// ---------------------------------------------------------------------------

const PROMPT_GUIDES: Record<PromptTarget, string> = {
  'gemini-image': `
## Gemini 3 Pro Image Generation — Prompt Guide

Gemini excels at photorealistic and artistic imagery. It handles complex compositions, 
lighting descriptions, and artistic styles well. It understands natural language deeply.

### Key Principles:
- Be descriptive about lighting, mood, and atmosphere
- Specify camera angle, lens type, and depth of field
- Include material/texture descriptions for realism
- Mention art style or photographer reference if relevant

### Example Prompts (Good):
1. "A weathered fisherman mending nets at dawn, golden hour light streaming through morning mist over a Mediterranean harbor, shot on Hasselblad medium format, shallow depth of field, warm color palette, documentary photography style"

2. "Hyperrealistic close-up of dewdrops on a crimson rose petal, macro photography, ring light reflections visible in each droplet, dark moody background with bokeh, 100mm macro lens, f/2.8"

3. "Cyberpunk street food vendor in neon-lit Tokyo alley, steam rising from ramen bowls, holographic menu signs, rain-slicked pavement reflecting pink and blue neon, cinematic wide angle, Blade Runner aesthetic"

4. "Oil painting in the style of Vermeer — young woman reading a letter by window light, soft chiaroscuro, pearl earring catching light, Dutch Golden Age interior with ceramic tiles and brass chandelier"

### What to Avoid:
- Don't use negative prompts (Gemini doesn't support them)
- Don't use weight syntax like (word:1.5) — use natural language emphasis instead
- Don't list tags — write flowing descriptions
`,

  'seedream': `
## Seedream 4.5 — Prompt Guide

Seedream excels at high-quality, detailed images with strong composition.
It responds well to structured prompts with clear subject/style/mood separation.

### Key Principles:
- Start with the main subject and action
- Follow with environment and setting details
- End with style, mood, and technical specifications
- Supports both photorealistic and artistic styles

### Example Prompts (Good):
1. "Professional fashion photograph of an elegant woman in a flowing silk gown, standing in an Art Deco lobby, dramatic side lighting creating long shadows, shot by Mario Testino, Vogue editorial style, 8K resolution"

2. "Isometric 3D render of a cozy Japanese café interior, warm ambient lighting, detailed miniature furniture, steam from coffee cups, pixel-perfect materials, soft pastel color scheme, trending on ArtStation"

3. "Portrait of a Viking warrior, intricate braided hair with silver beads, scarred weathered face, northern lights in background, oil painting style, dramatic rim lighting, museum quality detail"

### What to Avoid:
- Overly long prompts (diminishing returns past ~200 words)
- Contradictory descriptions
`,

  'flux-dev': `
## FLUX.1 Dev (ComfyUI) — Prompt Guide

FLUX Dev uses a T5 text encoder and responds extremely well to natural language.
It has excellent text rendering and compositional understanding.

### Key Principles:
- Natural language works best (not tag-based)
- Excellent at rendering text in images
- Strong at following spatial/compositional instructions
- Responds well to style references and artist names

### Example Prompts (Good):
1. "A beautiful woman with long flowing red hair, wearing a white summer dress, standing in a field of sunflowers at golden hour, soft warm lighting, photorealistic, professional photography, Canon EOS R5, 85mm f/1.4"

2. "Dark fantasy illustration of an ancient library with floating books, magical glowing runes on the walls, a cloaked wizard reading by candlelight, dramatic chiaroscuro lighting, concept art style"

3. "Minimalist product photography of a luxury perfume bottle on a marble surface, single dramatic side light, deep shadows, reflection visible on surface, commercial advertising style, 4K"

4. "Street photography of a rainy night in Seoul, neon signs reflected in puddles, lone figure with transparent umbrella, cinematic color grading with teal and orange, 35mm film grain"

### What to Avoid:
- Avoid parenthetical weights like (word:1.5) — FLUX doesn't use them
- Keep prompts focused; FLUX handles complex scenes but clarity helps
`,

  'kling-2.6': `
## Kling 2.6 I2V Motion Control — Prompt Guide

Kling 2.6 generates video from images. Prompts should describe MOTION, not the scene 
(the image already provides the visual context).

### Key Principles:
- Focus on movement, action, and camera motion
- Describe temporal progression (what happens over time)
- Include camera movements: pan, tilt, dolly, orbit, tracking
- Mention speed: slow motion, real-time, time-lapse
- Keep it concise — 1-3 sentences max

### Example Prompts (Good):
1. "The woman slowly turns her head toward camera, hair gently swaying in a breeze. Slow dolly-in shot, shallow depth of field."

2. "Camera orbits 180° around the subject as they walk forward confidently. Steady tracking shot, slight slow motion."

3. "Gentle parallax effect — foreground elements drift left while background remains static. Subtle breathing motion on the subject."

4. "Subject performs a graceful twirl, dress fabric flowing outward. Camera tilts up from feet to face. Dreamy slow motion at 0.5x speed."

### What to Avoid:
- Don't describe what the image looks like (it already knows)
- Don't write scene descriptions — focus on MOTION
- Avoid abrupt cuts or impossible physics
`,

  'kling-3': `
## Kling 3 MultiShot — Prompt Guide

Kling 3 supports multi-shot video generation. Each shot gets its own prompt.
Think like a director — each shot is a beat in the story.

### Key Principles:
- Each prompt = one continuous shot (3-10 seconds)
- Describe the action, camera angle, and emotional beat
- Think in terms of shot types: wide, medium, close-up, extreme close-up
- Include transition hints for continuity between shots

### Example Prompts (Good):
1. Shot 1: "Wide establishing shot — woman walks toward camera down a sun-dappled forest path, dappled light through canopy, steady tracking shot"
   Shot 2: "Medium shot — she pauses and looks up at something off-screen, expression shifts from calm to wonder, camera slowly pushes in"
   Shot 3: "Close-up on her face — eyes widen, a smile forms, golden light catches in her eyes, shallow DOF"

2. Shot 1: "Overhead drone shot descending toward a rooftop party at sunset, city skyline in background"
   Shot 2: "Eye-level tracking shot following the DJ's hands on the turntable, crowd dancing in bokeh background"

### What to Avoid:
- Shots longer than 10 seconds of action
- Contradicting the visual setup between shots
`,

  'kling-3-omni': `
## Kling 3 Omni Multimodal — Prompt Guide

Kling 3 Omni handles text, image, and audio inputs. It generates videos with 
built-in audio/dialogue understanding.

### Key Principles:
- Can describe dialogue and sound effects in the prompt
- Supports mood/emotion descriptions that influence audio generation
- Works with both T2V and I2V modes
- Natural language descriptions work best

### Example Prompts (Good):
1. "A woman sits at a café table, takes a sip of coffee, looks up and says 'I've been waiting for you.' Ambient café sounds, soft jazz in background. Medium shot, warm lighting."

2. "Thunderstorm over a mountain lake — lightning strikes illuminate the peaks, thunder rumbles, rain pelts the water surface. Wide cinematic shot, dramatic mood."

3. "Street musician plays violin on a cobblestone bridge at twilight. Melancholic melody echoes off stone walls. Slow push-in from medium to close-up."

### What to Avoid:
- Don't separate audio and visual descriptions — weave them together
- Avoid overly complex multi-character dialogue in a single shot
`,

  'veo-3.1': `
## Veo 3.1 (Google AI Video) — Prompt Guide

Veo 3.1 is Google's state-of-the-art video generation model. It excels at 
cinematic quality, realistic motion, and coherent multi-second clips.

### Key Principles:
- Describe the scene AND the motion together
- Include cinematic terminology: shot types, camera moves, lighting
- Veo handles complex scenes with multiple elements well
- Specify mood, time of day, weather for atmospheric coherence
- Supports aspect ratios 16:9 and 9:16

### Example Prompts (Good):
1. "Cinematic slow-motion shot of a hummingbird hovering near a tropical flower, iridescent feathers catching sunlight, shallow depth of field with creamy bokeh background, morning dew visible on petals, National Geographic style, 4K quality"

2. "POV shot walking through a bustling Tokyo fish market at 5am, vendors calling out, ice glistening on fresh tuna, warm overhead industrial lighting, handheld camera feel, documentary style"

3. "Aerial drone shot sweeping over autumn forest canopy transitioning from green to gold to red, morning fog in valleys between hills, golden hour sunlight, Ken Burns documentary style, smooth forward movement"

4. "Time-lapse of a city intersection from sunset to full night, car headlights creating light trails, building windows illuminating one by one, clouds moving overhead, urban photography style"

5. "Close-up of an artist's hands sculpting clay on a pottery wheel, wet clay spinning smoothly, fingers shaping the form with precision, warm workshop lighting, shallow DOF, ASMR-satisfying motion"

### What to Avoid:
- Don't use technical tags or weight syntax
- Don't describe impossible physics without framing it as fantasy/sci-fi
- Keep under 2000 characters
`,

  'wan-2.2': `
## Wan 2.2 NSFW I2V — Prompt Guide

Wan 2.2 is an image-to-video model focused on character animation and motion.
Prompts should describe the desired movement and animation.

### Key Principles:
- Focus on body movement and facial expressions
- Describe camera motion separately from subject motion
- Keep descriptions natural and flowing
- Include environmental interactions (wind, water, fabric)

### Example Prompts (Good):
1. "The subject slowly raises their hand to brush hair from their face, turning slightly to the left with a gentle smile. Soft breeze causing hair to flow. Slow push-in camera."

2. "Subject walks toward camera with confident posture, each step deliberate and graceful. Background slightly blurs with rack focus. Steady tracking shot."

3. "Subtle breathing motion, eyes slowly open and look directly at camera. Micro-expressions transition from serene to playful. Static camera, intimate close-up."

### What to Avoid:
- Don't describe the scene appearance (image provides this)
- Avoid extreme or physically impossible movements
- Keep motion descriptions under 3 sentences
`,
};

// ---------------------------------------------------------------------------
// System prompt builder
// ---------------------------------------------------------------------------

function buildSystemPrompt(target: PromptTarget, mode: EnhanceMode, hasImage: boolean): string {
  const guide = PROMPT_GUIDES[target];

  const modeInstructions: Record<EnhanceMode, string> = {
    enhance: `You are a prompt enhancement specialist. Take the user's prompt and ENHANCE it — 
add more descriptive detail, better structure, and model-specific optimizations. 
Keep the original intent and subject matter intact. Make it richer and more likely to produce great results.`,

    rewrite: `You are a prompt rewriting specialist. REWRITE the user's prompt from scratch — 
same subject/concept but with completely different wording, structure, and descriptive approach. 
Make it feel fresh while targeting the same output.`,

    expand: `You are a prompt expansion specialist. EXPAND the user's short/vague prompt into a 
detailed, comprehensive prompt. Add specific details about lighting, camera, mood, style, 
and technical aspects that the user likely intended but didn't specify.`,

    translate: `You are a prompt translation specialist. The user may have written their prompt 
in any language or in casual/shorthand form. TRANSLATE and REFORMULATE it into a polished, 
detailed English prompt optimized for AI generation.`,
  };

  let systemPrompt = `${modeInstructions[mode]}

${guide}

## Output Format
Return ONLY the enhanced prompt text. No explanations, no markdown, no quotes.
Just the raw prompt text ready to paste into the generation field.

If asked for variations, separate each with ---VARIATION--- on its own line.`;

  if (hasImage) {
    systemPrompt += `

## Visual Context
An image has been provided as reference. ANALYZE IT carefully:
- Identify the subject, composition, colors, lighting, and mood
- Use these visual details to inform and enrich the enhanced prompt
- For I2V models (Kling, Wan, Veo with image): focus on describing MOTION for this specific image
- For image gen models: describe what you see and enhance based on it
- DO NOT describe the image back — use it to make the prompt better`;
  }

  return systemPrompt;
}

// ---------------------------------------------------------------------------
// Main enhance function
// ---------------------------------------------------------------------------

export async function enhancePrompt(
  apiKey: string,
  request: EnhanceRequest
): Promise<EnhanceResult> {
  const { prompt, target, mode, referenceImage, styleNotes, variations = 1 } = request;

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

  const systemPrompt = buildSystemPrompt(target, mode, !!referenceImage);

  // Build parts array
  const parts: Part[] = [];

  // Add image if present
  if (referenceImage) {
    parts.push({
      inlineData: {
        mimeType: referenceImage.mimeType,
        data: referenceImage.base64,
      },
    });
  }

  // Build user message
  let userMessage = `Original prompt: "${prompt}"`;
  if (styleNotes) {
    userMessage += `\n\nStyle notes: ${styleNotes}`;
  }
  if (variations > 1) {
    userMessage += `\n\nProvide ${variations} variations separated by ---VARIATION---`;
  }

  parts.push({ text: userMessage });

  const result = await model.generateContent({
    contents: [{ role: 'user', parts }],
    systemInstruction: systemPrompt,
    generationConfig: {
      temperature: 0.8,
      maxOutputTokens: 2048,
    },
  });

  const response = result.response;
  const text = response.text();

  if (variations > 1) {
    const allVariations = text.split('---VARIATION---').map(v => v.trim()).filter(v => v.length > 0);
    return {
      enhanced: allVariations[0] || text.trim(),
      variations: allVariations.slice(1),
    };
  }

  return { enhanced: text.trim() };
}

// ---------------------------------------------------------------------------
// Helper: detect target from video model
// ---------------------------------------------------------------------------

export function videoModelToTarget(model: string): PromptTarget {
  switch (model) {
    case 'kling-2.6':
    case 'kling-2.6-pro':
      return 'kling-2.6';
    case 'kling-3':
      return 'kling-3';
    case 'kling-3-omni':
      return 'kling-3-omni';
    case 'veo-3.1':
      return 'veo-3.1';
    case 'director':
      return 'wan-2.2';
    default:
      return 'veo-3.1';
  }
}

export function imageModelToTarget(mode: string): PromptTarget {
  switch (mode) {
    case 'spicy':
    case 'extreme':
      return 'flux-dev';
    case 'seedream':
    case 'seedream-txt2img':
      return 'seedream';
    default:
      return 'gemini-image';
  }
}
