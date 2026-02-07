# Wan 2.2 Animate API Documentation

> Character animation and replacement using Alibaba's Wan 2.2 Animate models via Kie.ai

## Overview

The Wan 2.2 Animate API provides two distinct modes for character animation:

1. **Animate Move** (`wan/2-2-animate-move`) — Transfers body motion and facial expressions from a reference video to a static character image, keeping the original background intact.
2. **Animate Replace** (`wan/2-2-animate-replace`) — Swaps the subject in a reference video with a chosen character image, automatically adjusting lighting and tone for seamless blending.

Both modes are accessed through the unified Kie.ai task creation API.

## Authentication

All API requests require a Bearer Token in the request header:

```
Authorization: Bearer YOUR_API_KEY
```

Get your API Key at: [https://kie.ai/api-key](https://kie.ai/api-key)

---

## 1. Create Animation Task

### API Information
- **URL**: `POST https://api.kie.ai/api/v1/jobs/createTask`
- **Content-Type**: `application/json`

### Top-Level Request Parameters

| Parameter   | Type   | Required | Description |
|-------------|--------|----------|-------------|
| model       | string | Yes      | Model identifier (see below) |
| input       | object | Yes      | Input parameters object |
| callBackUrl | string | No       | Webhook URL for task completion notifications. System sends POST with results on success or failure. |

---

## Mode 1: Animate Move

Transfers motion from a reference video onto a static character image. The character stays in its original pose orientation while adopting the video's motion.

### Model Identifier
```
wan/2-2-animate-move
```

### Input Parameters

| Parameter   | Type   | Required | Description |
|-------------|--------|----------|-------------|
| video_url   | string | Yes      | URL of the reference video (motion source). Accepted: `.mp4`, `.mov`, `.mkv`. Max 10MB. |
| image_url   | string | Yes      | URL of the character image. Accepted: `.jpg`, `.jpeg`, `.png`, `.webp`. Max 10MB. If aspect ratio doesn't match, image is resized and center-cropped. |
| resolution  | string | No       | Output resolution: `480p` (default), `580p`, or `720p` |

### Request Example

```bash
curl -X POST "https://api.kie.ai/api/v1/jobs/createTask" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "wan/2-2-animate-move",
    "callBackUrl": "https://your-domain.com/api/callback",
    "input": {
      "video_url": "https://file.aiquickdraw.com/custom-page/akr/section-images/17586254974931y2hottk.mp4",
      "image_url": "https://file.aiquickdraw.com/custom-page/akr/section-images/1758625466310wpehpbnf.png",
      "resolution": "480p"
    }
  }'
```

### Response Example

```json
{
  "code": 200,
  "msg": "success",
  "data": {
    "taskId": "task_wan_1765184995754"
  }
}
```

---

## Mode 2: Animate Replace

Replaces the character/subject in a reference video with a new character image. Automatically adjusts lighting and tone for natural blending.

### Model Identifier
```
wan/2-2-animate-replace
```

### Input Parameters

| Parameter   | Type   | Required | Description |
|-------------|--------|----------|-------------|
| video_url   | string | Yes      | URL of the reference video (the subject will be replaced). Accepted: `.mp4`, `.mov`, `.mkv`. Max 10MB. |
| image_url   | string | Yes      | URL of the replacement character image. Accepted: `.jpg`, `.jpeg`, `.png`, `.webp`. Max 10MB. If aspect ratio doesn't match, image is resized and center-cropped. |
| resolution  | string | No       | Output resolution: `480p` (default), `580p`, or `720p` |

### Request Example

```bash
curl -X POST "https://api.kie.ai/api/v1/jobs/createTask" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "wan/2-2-animate-replace",
    "callBackUrl": "https://your-domain.com/api/callback",
    "input": {
      "video_url": "https://file.aiquickdraw.com/custom-page/akr/section-images/17586199429271xscyd5d.mp4",
      "image_url": "https://file.aiquickdraw.com/custom-page/akr/section-images/17586199255323tks43kq.png",
      "resolution": "480p"
    }
  }'
```

### Response Example

```json
{
  "code": 200,
  "msg": "success",
  "data": {
    "taskId": "task_wan_1765185004558"
  }
}
```

---

## 2. Query Task Status

### API Information
- **URL**: `GET https://api.kie.ai/api/v1/jobs/recordInfo`
- **Parameter**: `taskId` (query parameter)

### Request Example

```bash
curl -X GET "https://api.kie.ai/api/v1/jobs/recordInfo?taskId=task_wan_1765184995754" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

### Response Example

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "taskId": "task_wan_1765184995754",
    "model": "wan/2-2-animate-move",
    "state": "success",
    "param": "{\"model\":\"wan/2-2-animate-move\",\"input\":{...}}",
    "resultJson": "{\"resultUrls\":[\"https://example.com/generated-video.mp4\"]}",
    "failCode": "",
    "failMsg": "",
    "completeTime": 1698765432000,
    "createTime": 1698765400000,
    "updateTime": 1698765432000
  }
}
```

### Task States

| State        | Description                                | Action |
|--------------|--------------------------------------------|--------|
| `waiting`    | Task is queued and waiting to be processed | Continue polling |
| `queuing`    | Task is in the processing queue            | Continue polling |
| `generating` | Task is currently being processed          | Continue polling |
| `success`    | Task completed successfully                | Parse `resultJson` for result URLs |
| `fail`       | Task failed                                | Check `failCode` and `failMsg` |

### Response Parameters

| Parameter         | Type    | Description |
|-------------------|---------|-------------|
| code              | integer | Response status code, 200 = success |
| message           | string  | Response message |
| data.taskId       | string  | Task ID |
| data.model        | string  | Model name used |
| data.state        | string  | Task status (see table above) |
| data.param        | string  | Task parameters (JSON string) |
| data.resultJson   | string  | Task result (JSON string). Contains `{resultUrls: [...]}` on success. |
| data.failCode     | string  | Failure code (when task fails) |
| data.failMsg      | string  | Failure message (when task fails) |
| data.completeTime | integer | Completion timestamp in ms |
| data.createTime   | integer | Creation timestamp in ms |
| data.updateTime   | integer | Last update timestamp in ms |

---

## Key Features

- **Animate Any Character**: Portraits, sketches, illustrations, cartoons, animals — all can be animated
- **Skeleton-Based Motion Tracking**: Smooth, consistent body movements across sequences
- **Expressive Facial Animation**: Captures subtle facial details for realistic expressions
- **Consistent Lighting**: Relighting technology replicates shadows, highlights, and tones
- **Audio Preservation**: Original video audio is retained in the output
- **Environmental Integration**: (Replace mode) New characters blend seamlessly with the scene

## Usage Flow

1. **Upload Media**: Upload your character image and reference video using the [File Upload API](../common_api_kie_ai/file_upload_quick_start.md)
2. **Create Task**: Call `POST /api/v1/jobs/createTask` with the appropriate model
3. **Get Task ID**: Extract `taskId` from the response
4. **Wait for Results**:
   - If `callBackUrl` provided → wait for webhook notification
   - Otherwise → poll `GET /api/v1/jobs/recordInfo?taskId=...`
5. **Download Results**: When `state` is `success`, extract video URL from `resultJson`

## Error Codes

| Code | Description |
|------|-------------|
| 200  | Success |
| 401  | Unauthorized — invalid or missing API key |
| 402  | Insufficient credits |
| 404  | Resource not found |
| 422  | Validation error — check parameters |
| 429  | Rate limit exceeded |
| 455  | Service unavailable (maintenance) |
| 500  | Internal server error |
| 501  | Generation failed |
| 505  | Feature disabled |

## References

- [Wan 2.2 Animate Product Page](https://kie.ai/wan-animate)
- [Kie.ai API Docs — Animate Move](https://docs.kie.ai/market/wan/2-2-animate-move)
- [Kie.ai API Docs — Animate Replace](https://docs.kie.ai/market/wan/2-2-animate-replace)
- [Get Task Details](https://docs.kie.ai/market/common/get-task-detail)
