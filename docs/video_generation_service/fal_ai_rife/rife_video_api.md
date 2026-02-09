# fal.ai RIFE Video Frame Interpolation — Complete API Reference

## Overview
Interpolate between frames of a video using the RIFE (Real-Time Intermediate Flow Estimation) model.
- Model ID: `fal-ai/rife/video`
- Pricing: ~$0.001/compute-second (~$0.01-0.02 per typical video)

## Authentication
```
Authorization: Key YOUR_FAL_KEY
```

## REST API Endpoints (Raw HTTP — no SDK needed)

### 1. Submit Request (Queue)
```
POST https://queue.fal.run/fal-ai/rife/video
Authorization: Key $FAL_KEY
Content-Type: application/json

{
  "video_url": "https://example.com/video.mp4",
  "num_frames": 1,
  "use_calculated_fps": true,
  "fps": 8
}
```

**Response:**
```json
{
  "request_id": "80e732af-660e-45cd-bd63-580e4f2a94cc",
  "response_url": "https://queue.fal.run/fal-ai/rife/video/requests/80e732af.../",
  "status_url": "https://queue.fal.run/fal-ai/rife/video/requests/80e732af.../status",
  "cancel_url": "https://queue.fal.run/fal-ai/rife/video/requests/80e732af.../cancel"
}
```

### 2. Check Status
```
GET https://queue.fal.run/fal-ai/rife/video/requests/{request_id}/status
Authorization: Key $FAL_KEY
```

**Status Types:**
- `IN_QUEUE` (202): `queue_position`, `response_url`
- `IN_PROGRESS` (202): `logs`, `response_url`
- `COMPLETED` (200): `logs`, `response_url`

### 3. Get Result
```
GET https://queue.fal.run/fal-ai/rife/video/requests/{request_id}
Authorization: Key $FAL_KEY
```

**Response:**
```json
{
  "video": {
    "url": "https://storage.googleapis.com/falserverless/example_outputs/rife-video-output.mp4",
    "content_type": "video/mp4",
    "file_name": "output.mp4",
    "file_size": 123456
  }
}
```

### 4. Cancel Request
```
PUT https://queue.fal.run/fal-ai/rife/video/requests/{request_id}/cancel
Authorization: Key $FAL_KEY
```

## Input Schema

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `video_url` | string | ✅ YES | - | URL of the video to interpolate |
| `num_frames` | integer | No | 1 | Number of frames to generate between each input frame. 1 = 2x FPS, 3 = 4x FPS |
| `use_scene_detection` | boolean | No | false | Split video into scenes before interpolation (removes smear between scene cuts) |
| `use_calculated_fps` | boolean | No | true | Use input FPS × num_frames as output FPS |
| `fps` | integer | No | 8 | Output FPS (only used if use_calculated_fps is false) |
| `loop` | boolean | No | false | Loop final frame back to first frame for seamless loop |

## Output Schema

| Field | Type | Description |
|-------|------|-------------|
| `video` | File | The interpolated video |
| `video.url` | string | Download URL for the result video |
| `video.content_type` | string | MIME type |
| `video.file_name` | string | Filename |
| `video.file_size` | integer | Size in bytes |

## Notes
- Input accepts publicly accessible URLs or base64 data URIs
- Queue pattern: submit → poll status → get result (similar to Freepik)
- For subpath models like `fal-ai/rife/video`, use full path for submit but `fal-ai/rife` for status/result (subpath only in submit)
  - Actually: status/result use the SAME path as submit based on the response_url returned
- Object lifecycle: set `X-Fal-Object-Lifecycle-Preference: {"expiration_duration_seconds": 3600}` header to control how long output URLs remain valid
