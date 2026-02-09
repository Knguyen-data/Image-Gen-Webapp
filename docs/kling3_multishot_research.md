# Kling 3 (v3) — Freepik API Research (VERIFIED)

**Source:** https://docs.freepik.com/api-reference/video/kling-v3/overview
**Released on Freepik:** February 5, 2026
**Status:** Live, early access preview

## Endpoints

| Tier | Endpoint | Description |
|------|----------|-------------|
| Pro | `POST /v1/ai/video/kling-v3-pro` | Higher fidelity, richer detail |
| Standard | `POST /v1/ai/video/kling-v3-std` | Faster processing, cost-effective |

**NOTE:** These are under `/v1/ai/video/` NOT `/v1/ai/image-to-video/` — new path!

## Key Capabilities

1. **Text-to-Video (T2V)**: Generate videos from text prompts (max 2500 chars)
2. **Image-to-Video (I2V)**: Use `first_frame` and/or `end_frame` images
3. **Multi-shot mode**: Up to 6 scenes, each with custom prompts and durations (max 15s total)
4. **Element consistency**: Pre-registered element IDs for consistent characters/styles
5. **CFG scale**: 0 (creative) to 1 (strict), default 0.5
6. **Negative prompts**: Exclude unwanted elements
7. **Flexible durations**: 3-15 seconds with per-shot duration control
8. **Async processing**: Webhook or polling

## Request Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `prompt` | string | Conditional | - | Text prompt (max 2500 chars). Required for T2V |
| `negative_prompt` | string | No | - | What to avoid (max 2500 chars) |
| `image_list` | array | No | - | Reference images with `image_url` and `type` (first_frame/end_frame) |
| `multi_shot` | boolean | No | false | Enable multi-shot mode |
| `shot_type` | string | No | - | Use "customize" for custom shot definitions |
| `multi_prompt` | array | No | - | Shot definitions: `index` (0-5), `prompt`, `duration` (min 3s) |
| `element_list` | array | No | - | Pre-registered element IDs for consistency |
| `aspect_ratio` | string | No | 16:9 | Video ratio: 16:9, 9:16, 1:1 |
| `duration` | integer | No | 5 | Duration: 3-15 seconds |
| `cfg_scale` | number | No | 0.5 | Prompt adherence: 0-1 |
| `webhook_url` | string | No | - | Webhook notification URL |

### image_list Item
| Field | Type | Description |
|-------|------|-------------|
| `image_url` | string | Publicly accessible URL (300x300 min, 10MB max, JPG/JPEG/PNG) |
| `type` | string | `first_frame` or `end_frame` |

### multi_prompt Item
| Field | Type | Description |
|-------|------|-------------|
| `index` | integer | Shot order (0-5) |
| `prompt` | string | Text prompt for this shot (max 2500 chars) |
| `duration` | number | Shot duration (minimum 3 seconds) |

## Multi-Shot Example (from fal.ai prompting guide)

```
Master Prompt: Joker begins his iconic dance descent down the stairs, arms outstretched, pure chaotic joy.

Multi shot Prompt 1: Man in red suit starts dancing at top of stairs, taking first exaggerated steps down, arms spreading wide, head tilting back in ecstasy, cigarette smoke trailing (Duration: 5 seconds)

Multi shot Prompt 2: Continuing wild dance down concrete steps, spinning and kicking, coat flapping dramatically, pure liberation and madness, reaching the bottom with triumphant pose (Duration: 5 seconds)
```

## Response

```json
{
  "task_id": "task_abc123",
  "status": "processing"
}
```

## Pro vs Standard

| Feature | Pro | Standard |
|---------|-----|----------|
| Quality | Higher fidelity, richer detail | Good quality, cost-effective |
| Speed | Standard processing | Faster processing |
| Best for | Premium content, marketing | High-volume, testing |

## Prompting Guide (from fal.ai blog)

### Key Principles
1. **Think in Shots, Not Clips** — Label shots, describe framing, subject, motion per shot
2. **Anchor Subjects Early** — Define core subjects at start, keep descriptions consistent
3. **Describe Motion Explicitly** — Camera behavior over time: tracking, following, freezing, panning
4. **Use Native Audio** — Label speakers with [Character A: Name, tone]: "dialogue"
5. **Take Advantage of Longer Durations** — Up to 15s allows real narrative development
6. **I2V: Lock First, Then Move** — Treat input image as anchor, focus on how scene evolves

### Audio/Dialogue Format
```
[Character A: Lead Detective, controlled serious voice]: "Let's stop pretending."
[Character B: Prime Suspect, sharp defensive voice]: "I already told you everything."
```

### Multi-Character Dialogue Rules
- P1: Unique, consistent character labels (no pronouns)
- P2: Visual anchoring — describe action first, then dialogue
- P3: Assign unique tone/emotion per character
- P4: Use "Immediately," to control sequence switching

## Differences from Kling 2.6

| Feature | Kling 2.6 | Kling 3 |
|---------|-----------|---------|
| Max duration | 10s | 15s |
| Multi-shot | No | Yes (up to 6 scenes) |
| Native audio/dialogue | Basic | Advanced multi-character |
| Element consistency | No | Yes (pre-registered elements) |
| API path | `/v1/ai/image-to-video/` or `/v1/ai/video/` | `/v1/ai/video/` |
| Frame control | First frame only | First + End frame |
| Duration control | 5s or 10s fixed | 3-15s flexible |
