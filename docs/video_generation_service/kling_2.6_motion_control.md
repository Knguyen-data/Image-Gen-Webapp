# Kling 2.6 Motion Control — Dual Provider Service

> Motion transfer: apply dance/motion from a reference video to a character image.
> **Primary provider: Freepik** → **Fallback: Kie.ai** → **On retry: user chooses provider**

## Provider Comparison

| Feature | Freepik | Kie.ai |
|---------|---------|--------|
| Auth Header | `x-freepik-api-key: KEY` | `Authorization: Bearer KEY` |
| Create Endpoint | `POST https://api.freepik.com/v1/ai/video/kling-v2-6-motion-control-pro` | `POST https://api.kie.ai/api/v1/jobs/createTask` |
| Poll Endpoint | `GET https://api.freepik.com/v1/ai/image-to-video/kling-v2-6/{task-id}` | `GET https://api.kie.ai/api/v1/jobs/recordInfo?taskId={taskId}` |
| Request Format | Flat body (`image_url`, `video_url`, `prompt`, etc.) | Nested (`model` + `input` object) |
| Model Param | Implicit (endpoint determines model) | `"model": "kling-2.6/motion-control"` |
| Standard Tier | `kling-v2-6-motion-control-std` endpoint | `"mode": "720p"` in input |
| Pro Tier | `kling-v2-6-motion-control-pro` endpoint | `"mode": "1080p"` in input |
| Status States | `CREATED`, `IN_PROGRESS`, `COMPLETED`, `FAILED` | `waiting`, `queuing`, `generating`, `success`, `fail` |
| Result Field | `data.generated[]` (array of URLs) | `data.resultJson` → parse JSON → `resultUrls[]` |
| Webhook | `webhook_url` in body | `callBackUrl` in body |
| Free Credits | $5 signup credit | Pay-as-you-go |

---

## Shared Parameters (both providers)

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| image_url / input_urls | string/array | Yes | — | Character/reference image URL. Min 300x300, max 10MB. JPG/JPEG/PNG/WEBP |
| video_url / video_urls | string/array | Yes | — | Motion reference video URL. 3-30s. MP4/MOV/WEBM |
| prompt | string | No | — | Text guidance for motion transfer. Max 2500 chars |
| character_orientation | enum | No | `video` | `video` (match video orientation, max 30s) or `image` (match image orientation, max 10s) |
| cfg_scale | float | No | 0.5 | Prompt adherence. 0 (creative) to 1 (strict) |

---

## 1. Freepik API (Primary)

### Auth
```
x-freepik-api-key: YOUR_FREEPIK_API_KEY
```
Get key at: https://www.freepik.com/developers/dashboard/api-key

### Create Task

**Pro (1080p):**
```bash
curl -X POST https://api.freepik.com/v1/ai/video/kling-v2-6-motion-control-pro \
  -H "Content-Type: application/json" \
  -H "x-freepik-api-key: YOUR_KEY" \
  -d '{
    "image_url": "https://example.com/character.png",
    "video_url": "https://example.com/dance.mp4",
    "prompt": "The character is dancing elegantly",
    "character_orientation": "video",
    "cfg_scale": 0.5
  }'
```

**Standard (720p):**
```bash
curl -X POST https://api.freepik.com/v1/ai/video/kling-v2-6-motion-control-std \
  -H "Content-Type: application/json" \
  -H "x-freepik-api-key: YOUR_KEY" \
  -d '{ ... same body ... }'
```

### Response
```json
{
  "data": {
    "task_id": "046b6c7f-0b8a-43b9-b35d-6489e6daee91",
    "status": "CREATED"
  }
}
```

### Poll Task Status
```bash
GET https://api.freepik.com/v1/ai/image-to-video/kling-v2-6/{task-id}
```

### Poll Response
```json
{
  "data": {
    "task_id": "046b6c7f-...",
    "status": "COMPLETED",
    "generated": [
      "https://ai-statics.freepik.com/output_video.mp4"
    ]
  }
}
```

### Freepik Status Values
| Status | Action |
|--------|--------|
| `CREATED` | Keep polling |
| `IN_PROGRESS` | Keep polling |
| `COMPLETED` | Download from `generated[]` |
| `FAILED` | Trigger fallback to Kie.ai |

---

## 2. Kie.ai API (Fallback)

### Auth
```
Authorization: Bearer YOUR_KIEAI_API_KEY
```
Key stored at: `~/.config/kieai/credentials.json`

### Create Task
```bash
curl -X POST https://api.kie.ai/api/v1/jobs/createTask \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_KEY" \
  -d '{
    "model": "kling-2.6/motion-control",
    "input": {
      "prompt": "The character is dancing elegantly",
      "input_urls": ["https://example.com/character.png"],
      "video_urls": ["https://example.com/dance.mp4"],
      "character_orientation": "video",
      "mode": "1080p"
    }
  }'
```

### Response
```json
{
  "code": 200,
  "msg": "success",
  "data": { "taskId": "281e5b0...f39b9" }
}
```

### Poll Task Status
```bash
GET https://api.kie.ai/api/v1/jobs/recordInfo?taskId={taskId}
```

### Poll Response
```json
{
  "code": 200,
  "data": {
    "taskId": "281e5b0...f39b9",
    "model": "kling-2.6/motion-control",
    "state": "success",
    "resultJson": "{\"resultUrls\":[\"https://...output.mp4\"]}"
  }
}
```

### Kie.ai Status Values
| State | Action |
|-------|--------|
| `waiting` | Keep polling |
| `queuing` | Keep polling |
| `generating` | Keep polling |
| `success` | Parse `resultJson` → `resultUrls[]` |
| `fail` | Check `failMsg`, report error |

---

## 3. Failover Strategy

```
User Request
    │
    ▼
┌─────────────────┐
│  Try Freepik     │ ← Primary
│  (Pro endpoint)  │
└────────┬────────┘
         │
    ┌────▼────┐
    │ Success? │
    └────┬────┘
     Yes │    No
         │     │
    ┌────▼┐   ┌▼──────────────┐
    │ Done │   │  Try Kie.ai   │ ← Auto-fallback
    └──────┘   │  (same params)│
               └───────┬──────┘
                       │
                  ┌────▼────┐
                  │ Success? │
                  └────┬────┘
               Yes │    No
                   │     │
              ┌────▼┐   ┌▼──────────────────┐
              │ Done │   │ Show error +       │
              └──────┘   │ "Retry with..."    │
                         │ [Freepik] [Kie.ai] │ ← User chooses
                         └────────────────────┘
```

### Parameter Translation (Freepik → Kie.ai)

```typescript
function freepikToKieai(freepikBody: FreepikRequest): KieaiRequest {
  return {
    model: "kling-2.6/motion-control",
    input: {
      prompt: freepikBody.prompt || "",
      input_urls: [freepikBody.image_url],
      video_urls: [freepikBody.video_url],
      character_orientation: freepikBody.character_orientation || "video",
      // Freepik Pro → 1080p, Freepik Std → 720p
      mode: freepikBody._tier === "pro" ? "1080p" : "720p",
    },
    callBackUrl: freepikBody.webhook_url,
  };
}
```

### Result Normalization

```typescript
interface NormalizedResult {
  provider: "freepik" | "kieai";
  taskId: string;
  status: "pending" | "processing" | "completed" | "failed";
  videoUrls: string[];
  error?: string;
}

// Freepik → Normalized
function normalizeFreepik(resp): NormalizedResult {
  const statusMap = { CREATED: "pending", IN_PROGRESS: "processing", COMPLETED: "completed", FAILED: "failed" };
  return {
    provider: "freepik",
    taskId: resp.data.task_id,
    status: statusMap[resp.data.status],
    videoUrls: resp.data.generated || [],
  };
}

// Kie.ai → Normalized
function normalizeKieai(resp): NormalizedResult {
  const statusMap = { waiting: "pending", queuing: "pending", generating: "processing", success: "completed", fail: "failed" };
  const result = resp.data.state === "success" ? JSON.parse(resp.data.resultJson) : {};
  return {
    provider: "kieai",
    taskId: resp.data.taskId,
    status: statusMap[resp.data.state],
    videoUrls: result.resultUrls || [],
    error: resp.data.failMsg || undefined,
  };
}
```

---

## 4. Error Codes

### Freepik
| Code | Description |
|------|-------------|
| 200 | OK |
| 401 | Invalid API key |
| 422 | Validation error |
| 429 | Rate limited |
| 503 | Service unavailable (retry with backoff) |

### Kie.ai
| Code | Description |
|------|-------------|
| 200 | OK |
| 401 | Invalid API key |
| 402 | Insufficient credits |
| 404 | Task not found |
| 422 | Validation error |
| 429 | Rate limited |
| 500 | Server error |

---

## 5. Input Requirements Summary

| Constraint | Value |
|------------|-------|
| Image min resolution | 300×300 px |
| Image max size | 10 MB |
| Image formats | JPG, JPEG, PNG, WEBP |
| Video duration | 3–30 seconds |
| Video max size | 100 MB (Kie.ai) |
| Video formats | MP4, MOV, WEBM, M4V |
| Prompt max length | 2500 characters |
| CFG scale range | 0.0–1.0 |
| character_orientation=video | Max output 30s |
| character_orientation=image | Max output 10s |
