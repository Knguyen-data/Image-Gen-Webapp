# Gemini Image Generation API Documentation

> Generate and edit images using Google's Gemini models (Nano Banana) via the Gemini API

## Overview

**Nano Banana** is Google's name for Gemini's native image generation capabilities. Gemini can generate and process images conversationally with text, images, or a combination of both — enabling creation, editing, and iterative refinement of visuals.

### Available Models

| Model | Identifier | Best For |
|-------|-----------|----------|
| **Nano Banana** | `gemini-2.5-flash-image` | Speed & efficiency, high-volume/low-latency tasks |
| **Nano Banana Pro** | `gemini-3-pro-image-preview` | Professional asset production, complex instructions, high-fidelity text rendering |

All generated images include a [SynthID watermark](https://ai.google.dev/responsible/docs/safeguards/synthid).

## Authentication

```
x-goog-api-key: YOUR_GEMINI_API_KEY
```

Get your API key at: [https://aistudio.google.com/apikey](https://aistudio.google.com/apikey)

---

## 1. Text-to-Image Generation

Generate images from text prompts.

### Endpoint

```
POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent
```

### curl Example

```bash
curl -s -X POST \
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent" \
  -H "x-goog-api-key: $GEMINI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "contents": [{
      "parts": [
        {"text": "Create a modern, minimalist logo for a coffee shop called The Daily Grind. Use a coffee bean in a clever way."}
      ]
    }]
  }'
```

### JavaScript Example

```javascript
import { GoogleGenAI } from "@google/genai";
import * as fs from "node:fs";

const ai = new GoogleGenAI({});

const response = await ai.models.generateContent({
  model: "gemini-2.5-flash-image",
  contents: "Create a picture of a nano banana dish in a fancy restaurant",
});

for (const part of response.candidates[0].content.parts) {
  if (part.text) {
    console.log(part.text);
  } else if (part.inlineData) {
    const buffer = Buffer.from(part.inlineData.data, "base64");
    fs.writeFileSync("generated_image.png", buffer);
  }
}
```

### Python Example

```python
from google import genai
from google.genai import types

client = genai.Client()

response = client.models.generate_content(
    model="gemini-2.5-flash-image",
    contents=["Create a picture of a nano banana dish in a fancy restaurant"],
)

for part in response.parts:
    if part.text is not None:
        print(part.text)
    elif part.inline_data is not None:
        image = part.as_image()
        image.save("generated_image.png")
```

### Response Format

The response contains `candidates[0].content.parts` — an array where each part is either:
- **Text**: `{ "text": "description..." }`
- **Image**: `{ "inlineData": { "mimeType": "image/png", "data": "<base64>" } }`

---

## 2. Image Editing (Text + Image → Image)

Provide an image and text prompts to add, remove, or modify elements.

### curl Example

```bash
curl -s -X POST \
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent" \
  -H "x-goog-api-key: $GEMINI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "contents": [{
      "parts": [
        {"text": "Add a sunset background to this portrait"},
        {
          "inline_data": {
            "mime_type": "image/jpeg",
            "data": "<BASE64_IMAGE_DATA>"
          }
        }
      ]
    }]
  }'
```

### JavaScript Example

```javascript
const imagePath = "path/to/image.png";
const imageData = fs.readFileSync(imagePath);
const base64Image = imageData.toString("base64");

const response = await ai.models.generateContent({
  model: "gemini-2.5-flash-image",
  contents: [
    { text: "Add a sunset background to this portrait" },
    {
      inlineData: {
        mimeType: "image/png",
        data: base64Image,
      },
    },
  ],
});
```

---

## 3. Multi-Turn Image Editing (Chat)

Use conversational chat to iteratively refine images. This is the **recommended** approach for image iteration.

### curl Example

```bash
curl -s -X POST \
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent" \
  -H "x-goog-api-key: $GEMINI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "contents": [
      {
        "role": "user",
        "parts": [{"text": "Create a vibrant infographic about photosynthesis"}]
      },
      {
        "role": "model",
        "parts": [{"inline_data": {"mime_type": "image/png", "data": "<PREVIOUS_IMAGE>"}}]
      },
      {
        "role": "user",
        "parts": [{"text": "Update this infographic to be in Spanish"}]
      }
    ],
    "generationConfig": {
      "responseModalities": ["TEXT", "IMAGE"],
      "imageConfig": {
        "aspectRatio": "16:9",
        "imageSize": "2K"
      }
    }
  }'
```

---

## 4. Gemini 3 Pro Image Features

### High-Resolution Output (up to 4K)

Specify `imageSize` in the generation config. Values: `1K` (default), `2K`, `4K`.

> **Note**: Must use uppercase 'K' (e.g., `4K` not `4k`).

```bash
curl -s -X POST \
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent" \
  -H "x-goog-api-key: $GEMINI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "contents": [{"parts": [{"text": "Da Vinci style anatomical sketch of a butterfly"}]}],
    "generationConfig": {
      "responseModalities": ["TEXT", "IMAGE"],
      "imageConfig": {
        "aspectRatio": "1:1",
        "imageSize": "4K"
      }
    }
  }'
```

### Multiple Reference Images (up to 14)

Gemini 3 Pro supports mixing up to 14 reference images:
- Up to **6 images of objects** for high-fidelity inclusion
- Up to **5 images of humans** for character consistency

```bash
curl -s -X POST \
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent" \
  -H "x-goog-api-key: $GEMINI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "contents": [{
      "parts": [
        {"text": "An office group photo of these people, making funny faces."},
        {"inline_data": {"mime_type": "image/png", "data": "<BASE64_IMG_1>"}},
        {"inline_data": {"mime_type": "image/png", "data": "<BASE64_IMG_2>"}},
        {"inline_data": {"mime_type": "image/png", "data": "<BASE64_IMG_3>"}}
      ]
    }],
    "generationConfig": {
      "responseModalities": ["TEXT", "IMAGE"],
      "imageConfig": {
        "aspectRatio": "5:4",
        "imageSize": "2K"
      }
    }
  }'
```

### Grounding with Google Search

Generate images based on real-time information (weather, stocks, recent events):

```bash
curl -s -X POST \
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent" \
  -H "x-goog-api-key: $GEMINI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "contents": [{"parts": [{"text": "Visualize the current weather forecast for San Francisco"}]}],
    "tools": [{"google_search": {}}],
    "generationConfig": {
      "responseModalities": ["TEXT", "IMAGE"],
      "imageConfig": {"aspectRatio": "16:9"}
    }
  }'
```

The response includes `groundingMetadata` with:
- `searchEntryPoint`: HTML/CSS for search suggestions
- `groundingChunks`: Top 3 web sources used

---

## Generation Config Parameters

### `imageConfig` Object

| Parameter    | Type   | Values | Description |
|-------------|--------|--------|-------------|
| `aspectRatio` | string | `1:1`, `2:3`, `3:2`, `3:4`, `4:3`, `4:5`, `5:4`, `9:16`, `16:9`, `21:9` | Output image aspect ratio |
| `imageSize`   | string | `1K`, `2K`, `4K` | Output resolution (Gemini 3 Pro only). Must be uppercase. |

### `responseModalities` Array

Must include `"IMAGE"` to receive image output. Can also include `"TEXT"` for interleaved text.

```json
{
  "generationConfig": {
    "responseModalities": ["TEXT", "IMAGE"],
    "imageConfig": {
      "aspectRatio": "16:9",
      "imageSize": "2K"
    }
  }
}
```

---

## Supported MIME Types for Input Images

- `image/jpeg`
- `image/png`
- `image/webp`
- `image/gif`

---

## Key Capabilities Summary

| Feature | Nano Banana (2.5 Flash) | Nano Banana Pro (3 Pro) |
|---------|------------------------|------------------------|
| Text-to-Image | ✅ | ✅ |
| Image Editing | ✅ | ✅ |
| Multi-Turn Chat | ✅ | ✅ |
| Max Resolution | 1K | 4K |
| Reference Images | Standard | Up to 14 |
| Google Search Grounding | ❌ | ✅ |
| Thinking Mode | ❌ | ✅ |
| Advanced Text Rendering | Basic | Professional |

## Rate Limits & Pricing

- Rate limits vary by API key tier
- See [Google AI pricing](https://ai.google.dev/pricing) for current rates
- Image generation is billed per request

## References

- [Official Gemini Image Generation Docs](https://ai.google.dev/gemini-api/docs/image-generation)
- [Gemini API Reference](https://ai.google.dev/api)
- [Gemini Models Overview](https://ai.google.dev/gemini-api/docs/models/gemini)
- [Google AI Studio](https://aistudio.google.com/)
