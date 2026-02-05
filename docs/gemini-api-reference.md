# Google Gemini API Reference

## Overview

The Gemini API provides access to Google's advanced AI models for text, image, speech, and video generation.

**Base URL:** `https://generativelanguage.googleapis.com/v1beta/`

## Authentication

### API Key Setup

```bash
# Set environment variable (recommended)
export GEMINI_API_KEY="YOUR_API_KEY"
```

### JavaScript/TypeScript SDK

```javascript
import { GoogleGenAI } from "@google/genai";

// Auto-loads from GEMINI_API_KEY env var
const ai = new GoogleGenAI({});

// Or explicit key
const ai = new GoogleGenAI({ apiKey: "YOUR_API_KEY" });
```

### OpenAI Compatibility Mode

```javascript
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: "GEMINI_API_KEY",
  baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
});
```

---

## Available Models

| Model | Type | Input | Output | Use Case |
|-------|------|-------|--------|----------|
| `gemini-2.5-pro` | Thinking | Audio, Images, Video, Text, PDF | Text | Complex reasoning, code, math, STEM |
| `gemini-2.5-flash` | Fast | Text, Images | Text | General text generation, chat |
| `gemini-pro` | Text | Text | Text | General-purpose text tasks |
| `gemini-pro-vision` | Multimodal | Text, Images | Text | Image analysis, visual QA |
| `imagen-3.0-generate-002` | Image Gen | Text | Image | Image generation from prompts |

### Token Limits (Gemini 2.5 Pro)
- **Input:** 1,048,576 tokens
- **Output:** 65,536 tokens

---

## Text Generation

### POST /v1beta/models/{model}:generateContent

Generate text content from prompts.

**Endpoint:**
```
POST https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent
```

**Headers:**
- `x-goog-api-key`: Your API key
- `Content-Type`: application/json

**Request Body:**
```json
{
  "contents": [
    {
      "parts": [
        { "text": "Explain how AI works" }
      ]
    }
  ],
  "generationConfig": {
    "temperature": 1.0,
    "topP": 0.8,
    "topK": 10,
    "responseMimeType": "text/plain"
  }
}
```

**JavaScript Example:**
```javascript
const response = await ai.models.generateContent({
  model: "gemini-2.5-flash",
  contents: "Explain how AI works in a few words"
});
console.log(response.text);
```

**Response:**
```json
{
  "candidates": [
    {
      "content": {
        "parts": [
          { "text": "AI works through machine learning algorithms..." }
        ],
        "role": "model"
      },
      "finishReason": "STOP"
    }
  ]
}
```

### Generation Config Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `temperature` | number | 1.0 | Randomness (0.0-2.0). Keep at 1.0 for Gemini 3 models |
| `topP` | number | 0.95 | Nucleus sampling threshold |
| `topK` | number | 40 | Max tokens to consider |
| `stopSequences` | string[] | - | Sequences that stop generation |
| `responseMimeType` | string | text/plain | Output format (text/plain, application/json) |

---

## Image Generation (Imagen)

### POST /v1beta/openai/images/generations

Generate images from text prompts using Imagen 3.0.

**Endpoint:**
```
POST https://generativelanguage.googleapis.com/v1beta/openai/images/generations
```

**Headers:**
- `Authorization`: Bearer GEMINI_API_KEY
- `Content-Type`: application/json

**Request Body:**
```json
{
  "model": "imagen-3.0-generate-002",
  "prompt": "a portrait of a sheepadoodle wearing a cape",
  "response_format": "b64_json",
  "n": 1
}
```

**JavaScript Example:**
```javascript
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: "GEMINI_API_KEY",
  baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
});

const image = await openai.images.generate({
  model: "imagen-3.0-generate-002",
  prompt: "a portrait of a sheepadoodle wearing a cape",
  response_format: "b64_json",
  n: 1,
});

console.log(image.data);
```

**cURL Example:**
```bash
curl "https://generativelanguage.googleapis.com/v1beta/openai/images/generations" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer GEMINI_API_KEY" \
  -d '{
    "model": "imagen-3.0-generate-002",
    "prompt": "a portrait of a sheepadoodle wearing a cape",
    "response_format": "b64_json",
    "n": 1
  }'
```

**Response:**
```json
{
  "created": 1678886400,
  "data": [
    {
      "b64_json": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk..."
    }
  ]
}
```

### Image Generation Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `model` | string | Yes | `imagen-3.0-generate-002` |
| `prompt` | string | Yes | Text description of image |
| `n` | integer | No | Number of images (default: 1) |
| `response_format` | string | No | `b64_json` or `url` (default: url) |

---

## Multimodal Input (Vision)

### Image + Text Input

Send images with text prompts for analysis.

**Request Body:**
```json
{
  "contents": [
    {
      "parts": [
        { "text": "Tell me about this image" },
        {
          "inlineData": {
            "mimeType": "image/jpeg",
            "data": "BASE64_ENCODED_IMAGE_DATA"
          }
        }
      ]
    }
  ]
}
```

**JavaScript with File:**
```javascript
const response = await ai.models.generateContent({
  model: "gemini-2.5-flash",
  contents: [
    { type: "text", text: "Describe this image" },
    { type: "image", uri: "https://example.com/image.jpg" }
  ]
});
```

---

## Error Handling

| Status | Error | Description |
|--------|-------|-------------|
| 400 | Bad Request | Invalid parameters or malformed JSON |
| 401 | Unauthorized | Invalid or missing API key |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Server-side error |

---

## Safety Ratings

Responses include safety feedback:

```json
{
  "promptFeedback": {
    "safetyRatings": [
      {
        "category": "HARM_CATEGORY_SEXUALLY_EXPLICIT",
        "probability": "NEGLIGIBLE"
      }
    ]
  }
}
```

**Categories:**
- `HARM_CATEGORY_SEXUALLY_EXPLICIT`
- `HARM_CATEGORY_HATE_SPEECH`
- `HARM_CATEGORY_HARASSMENT`
- `HARM_CATEGORY_DANGEROUS_CONTENT`

---

## Resources

- [Get API Key](https://aistudio.google.com/app/apikey)
- [Gemini API Docs](https://ai.google.dev/gemini-api/docs)
- [Gemini Cookbook](https://github.com/google-gemini/cookbook)
