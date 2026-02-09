# Kling 3 Omni — Freepik API Research (VERIFIED)

**Source:** https://docs.freepik.com/api-reference/video/kling-v3-omni/overview
**Status:** Live on Freepik

## Endpoints

| Tier | Endpoint | Description |
|------|----------|-------------|
| Pro | `POST /v1/ai/video/kling-v3-omni-pro` | Higher fidelity output |
| Standard | `POST /v1/ai/video/kling-v3-omni-std` | Faster, cost-effective |
| Reference-to-Video Pro | `POST /v1/ai/video/kling-v3-omni-pro-reference` | Video reference support |
| Reference-to-Video Std | `POST /v1/ai/video/kling-v3-omni-std-reference` | Video reference support |

**NOTE:** Under `/v1/ai/video/` path. Reference endpoints are SEPARATE for video-to-video.

## What Makes Omni Different from Standard Kling 3

Kling 3 Omni = Kling 3 + Multi-modal reference support:
- **Elements**: Pre-register characters/objects, reference as @Element1, @Element2 in prompts
- **Reference images**: Style guidance via `image_urls`, reference as @Image1, @Image2
- **Reference video**: Video-to-video via dedicated reference endpoints (`video_url`, ref as @Video1)
- **Voice IDs**: Narration with specific voices via `voice_ids`, ref as <<<voice_1>>>
- **Audio generation**: Native audio output

## Generation Modes

| Mode | Parameters | Use Case |
|------|-----------|----------|
| Text-to-Video | `prompt` (required) | Generate from text |
| Image-to-Video | `image_url` + `prompt` | Animate a starting image |
| Reference-to-Video | `elements` and/or `image_urls` + `prompt` | Character/style consistency |
| Video-to-Video | Use reference endpoints with `video_url` | Motion/style guidance from video |

## Request Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `prompt` | string | Conditional | - | Text prompt (max 2500 chars). Required for T2V |
| `image_url` | string | No | - | Start frame image URL for I2V |
| `start_image_url` | string | No | - | Alternative start frame image |
| `end_image_url` | string | No | - | End frame image URL |
| `image_urls` | array | No | - | Reference images for style. Use @Image1, @Image2 in prompt |
| `elements` | array | No | - | Character/object elements. Use @Element1, @Element2 in prompt |
| `multi_prompt` | array | No | - | Shot-by-shot prompts (max 6 shots) |
| `shot_type` | string | No | customize | Multi-shot type |
| `aspect_ratio` | string | No | 16:9 | 16:9, 9:16, 1:1 |
| `duration` | integer | No | 5 | 3-15 seconds |
| `generate_audio` | boolean | No | - | Generate native audio |
| `voice_ids` | array | No | - | Voice IDs for narration. Use <<<voice_1>>> in prompt |
| `webhook_url` | string | No | - | Webhook URL |

### Element Definition
| Field | Type | Description |
|-------|------|-------------|
| `reference_image_urls` | array | Reference image URLs. Multiple angles improve consistency |
| `frontal_image_url` | string | Primary/frontal reference image. Clear face/front view best |

### Reference-to-Video Endpoints (for video_url)
| Parameter | Type | Description |
|-----------|------|-------------|
| `video_url` | string | Reference video URL. Reference as @Video1 in prompt |

## Key Differences: Kling 3 vs Kling 3 Omni

| Feature | Kling 3 | Kling 3 Omni |
|---------|---------|--------------|
| Text-to-Video | ✅ | ✅ |
| Image-to-Video | ✅ (image_list) | ✅ (image_url) |
| Multi-shot | ✅ | ✅ |
| Element consistency | ✅ (element_list) | ✅ (elements with @Element refs) |
| Reference images | ❌ | ✅ (image_urls with @Image refs) |
| Reference video | ❌ | ✅ (dedicated reference endpoints) |
| Voice IDs | ❌ | ✅ (voice_ids with <<<voice>>> refs) |
| Audio generation | ❌ explicit | ✅ (generate_audio flag) |
| Video-to-Video | ❌ | ✅ |

## Use Cases
- **Character animation**: Consistent character across video with elements
- **Product visualization**: Animate product images
- **Storyboarding**: Multi-scene videos with shot-by-shot prompts
- **Style transfer**: Apply visual style from reference images
- **Video-to-video**: Motion/style guidance from reference video (replaces Kling 2.6 Motion Control?)

## Best Practices
- Use clear, well-lit reference images for elements
- Reference elements as @Element1 and images as @Image1 in prompts
- Start with 5s videos to test, then increase
- Plan multi-shot transitions carefully
- Use `generate_audio: true` for ambient sound, or `voice_ids` for narration
- Use webhooks for production

## Integration Strategy

### For Our App:
1. **Kling 3 Standard** = Multi-shot with first/end frame control → best for storyboard pipeline
2. **Kling 3 Omni** = Everything above + video reference + elements + voice → best for advanced production
3. **Kling 3 Omni Reference** = Replaces Kling 2.6 Motion Control for video-to-video

### Migration from Kling 2.6:
- Kling 2.6 Pro I2V → Kling 3 (better quality, multi-shot, longer duration)
- Kling 2.6 Motion Control → Kling 3 Omni Reference-to-Video (native video reference)
- Both use the same `/v1/ai/video/` path structure
