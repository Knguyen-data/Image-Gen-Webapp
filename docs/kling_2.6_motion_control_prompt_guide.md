# Kling 2.6 Motion Control — Prompt Guide (fal.ai Official)

## Core Principle
Motion Control uses THREE inputs:
1. **Character image** → visual identity
2. **Reference video** → choreography/movement blueprint
3. **Prompt** → contextual guidance (scene-setting, NOT motion description)

> "Over-describing motion is the most frequent error. The reference video already defines movement. Focus on WHERE and UNDER WHAT CONDITIONS rather than HOW the character moves."

## Prompt = Scene-Setting Tool (NOT Motion Description)

### ❌ WRONG (motion description — redundant)
- "dancing energetically with spinning and jumping"
- "walking forward with confident stride"
- "performing hip-hop moves"

### ✅ RIGHT (context/environment/style)
- "A hip-hop dancer performing in an urban environment, graffiti walls, golden hour lighting"
- "a graceful ballet dancer on a grand theater stage, soft pink lighting casting gentle shadows, audience seats visible in the darkness beyond"
- "inside a modern dance studio with mirrored walls, cinematic lighting, professional photography"

## Three Prompt Elements

### 1. Character Identity Enhancement
Reinforce or modify character identity, especially when details are ambiguous:
- "A professional ballet dancer in elegant attire"
- "An elderly man with distinguished gray hair and formal suit"
- "A young athlete wearing modern sportswear"

### 2. Environmental Context (THIS IS WHERE BACKGROUND ANIMATION GOES)
Establish where the action occurs:
- "performing on a spotlit theater stage with dramatic shadows"
- "in a sunlit park with soft afternoon light filtering through trees"
- "inside a modern dance studio with mirrored walls"

**VISUAL CATCHING ELEMENTS** (Kien's request — make backgrounds alive):
- Cars flickering in background, neon signs glowing, leaves blowing
- City lights, passing crowds, reflections on wet pavement
- Particle effects, lens flares, atmospheric haze
- Moving clouds, water ripples, flickering candles

### 3. Style Modifiers
- "cinematic lighting, professional photography, 4K quality"
- "soft natural lighting, documentary style, authentic atmosphere"
- "rendered in anime style" / "photorealistic with film grain"

## Character Orientation Modes

| Mode | Max Duration | Best For |
|------|-------------|----------|
| **Image** | 10s | Camera movements (pans, tilts, tracking). Preserves image pose/direction |
| **Video** | 30s | Dance, choreography, athletic. Transfers both motion AND spatial orientation |

## API Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| image_url | string | Yes | Character image. Must have clear body proportions, >5% of image area |
| video_url | string | Yes | Reference video with visible upper/full body |
| character_orientation | enum | Yes | "image" (10s) or "video" (30s) |
| prompt | string | No | Environmental and stylistic context |
| keep_original_sound | boolean | No | Preserve reference video audio (default: true) |

## Common Failure Modes

1. **Over-describing motion** — video handles this, prompt should NOT
2. **Poor reference video** — clear body, good lighting required
3. **Character-image incompatibility** — bridge gaps explicitly: "elegant woman in flowing gown adapted for movement"
4. **Mismatched orientation** — Image mode for camera work, Video mode for dance/choreography

## Advanced Techniques

- **Layered descriptions**: Build up scene details progressively
- **Temporal consistency keywords**: "consistent lighting", "steady camera", "continuous motion"
- **Style transfer via language**: "rendered in anime style" / "photorealistic with film grain"
- **Background animation cues**: Describe living environments with motion elements

## Iterative Workflow

1. Test with minimal prompt first ("a person performing")
2. Add character identity details → generate
3. Add environmental context → generate
4. Layer in style modifiers → generate
5. This reveals which elements actually improve results
