# LTX Video API — Complete Documentation

## Overview
LTX-2 API generates videos from images, text prompts, and audio. **Synchronous API** — returns MP4 directly in response body (no polling).

**Base URL:** `https://api.ltx.video`

**Auth:** `Authorization: Bearer YOUR_API_KEY`
Get key at: https://console.ltx.video/

## Models

| Model | Resolution | FPS | Duration (seconds) |
|-------|-----------|-----|-------------------|
| ltx-2-fast | 1920x1080 | 25 | 6, 8, 10, 12, 14, 16, 18, 20 |
| ltx-2-fast | 1920x1080 | 50 | 6, 8, 10 |
| ltx-2-fast | 2560x1440 | 25, 50 | 6, 8, 10 |
| ltx-2-fast | 3840x2160 | 25, 50 | 6, 8, 10 |
| ltx-2-pro | 1920x1080 | 25, 50 | 6, 8, 10 |
| ltx-2-pro | 2560x1440 | 25, 50 | 6, 8, 10 |
| ltx-2-pro | 3840x2160 | 25, 50 | 6, 8, 10 |

## Pricing (per second of output video)

### Text-to-Video & Image-to-Video
| Model | 1920x1080 | 2560x1440 | 3840x2160 |
|-------|-----------|-----------|-----------|
| ltx-2-fast | $0.04/s | $0.08/s | $0.16/s |
| ltx-2-pro | $0.06/s | $0.12/s | $0.24/s |

### Audio-to-Video
| Model | Resolution | Cost |
|-------|-----------|------|
| ltx-2-pro | 1920x1080 | $0.10/s |

### Retake (Video Editing)
| Model | Resolution | Cost |
|-------|-----------|------|
| ltx-2-pro | 1920x1080 | $0.10/s |

---

## Endpoints

### 1. Text-to-Video
```
POST https://api.ltx.video/v1/text-to-video
Authorization: Bearer YOUR_API_KEY
Content-Type: application/json
```

**Request Body:**
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| prompt | string | ✅ | - | Text prompt (max 5000 chars) |
| model | enum | ✅ | - | `ltx-2-fast` or `ltx-2-pro` |
| duration | integer | ✅ | - | Duration in seconds (see model matrix) |
| resolution | string | ✅ | - | e.g. `1920x1080`, `2560x1440`, `3840x2160` |
| fps | integer | No | 25 | Frame rate |
| camera_motion | enum | No | - | Camera motion effect |
| generate_audio | boolean | No | true | Generate matching audio (Beta) |

**Response:** MP4 video file directly in body
- `Content-Type: video/mp4`
- `x-request-id` header for tracking

---

### 2. Image-to-Video
```
POST https://api.ltx.video/v1/image-to-video
Authorization: Bearer YOUR_API_KEY
Content-Type: application/json
```

**Request Body:**
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| image_uri | string | ✅ | - | Image URL, base64 data URI, or ltx:// storage URI |
| prompt | string | ✅ | - | How to animate (max 5000 chars) |
| model | enum | ✅ | - | `ltx-2-fast` or `ltx-2-pro` |
| duration | integer | ✅ | - | Duration in seconds |
| resolution | string | ✅ | - | Output resolution |
| fps | integer | No | 25 | Frame rate |
| camera_motion | enum | No | - | Camera motion effect |
| generate_audio | boolean | No | true | Generate matching audio (Beta) |

**Response:** MP4 video file directly in body

---

### 3. Audio-to-Video ⭐ (PRIMARY TARGET)
```
POST https://api.ltx.video/v1/audio-to-video
Authorization: Bearer YOUR_API_KEY
Content-Type: application/json
```

**Request Body:**
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| audio_uri | string | ✅ | - | Audio file (2-20 seconds). URL, base64, or ltx:// |
| image_uri | string | No* | - | First frame image. *Required if no prompt |
| prompt | string | No* | - | Text description (max 5000 chars). *Required if no image_uri |
| resolution | string | No | 1920x1080 | Only 1920x1080 supported currently |
| guidance_scale | double | No | 5 (T2V) or 9 (I2V) | CFG scale 1-50 |
| model | enum | No | ltx-2-pro | Only ltx-2-pro supported |

**Response:** MP4 video file directly in body

---

### 4. Retake (Video Section Editing)
```
POST https://api.ltx.video/v1/retake
Authorization: Bearer YOUR_API_KEY
Content-Type: application/json
```

**Request Body:**
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| video_uri | string | ✅ | - | Input video (max 4K, 3-21 seconds) |
| start_time | double | ✅ | - | Section start time (seconds, ≥0) |
| duration | double | ✅ | - | Section duration (seconds, ≥2) |
| prompt | string | No | - | What should happen in the section |
| mode | enum | No | replace_audio_and_video | `replace_audio`, `replace_video`, `replace_audio_and_video` |
| model | enum | No | ltx-2-pro | Only ltx-2-pro |

**Response:** MP4 video file directly in body

---

### 5. Upload File
```
POST https://api.ltx.video/v1/upload
Authorization: Bearer YOUR_API_KEY
```

**Response:**
| Field | Type | Description |
|-------|------|-------------|
| upload_url | string | Pre-signed URL for PUT upload (expires 1hr) |
| storage_uri | string | `ltx://uploads/abc-123` for use in requests |
| expires_at | datetime | When the signed URL expires |
| required_headers | map | Headers required for the PUT upload |

**Usage:** Upload file via PUT to upload_url, then use storage_uri in generation requests. Files available for 24 hours.

---

## Input Formats

### Input Methods
| Method | Max Size |
|--------|----------|
| Cloud Storage (ltx://) | 100 MB |
| HTTPS URL | 15 MB (images), 32 MB (video/audio) |
| Data URI (base64) | 7 MB (images), 15 MB (video/audio) |

### Supported Formats
**Images:** PNG, JPEG/JPG, WEBP
**Videos:** MP4 (H.264/H.265), MOV (H.264/H.265), MKV (H.264/H.265)
**Audio:** WAV, MP3, M4A (AAC-LC), OGG (Opus/Vorbis)

---

## Key Notes
1. **SYNCHRONOUS API** — No polling! Response IS the video (MP4 bytes)
2. Response can take significant time (long HTTP connection)
3. Audio-to-Video: audio must be 2-20 seconds
4. ltx-2-fast supports longer durations (up to 20s) at 1080p/25fps
5. ltx-2-pro has better quality but limited to 10s max
6. generate_audio is Beta — auto-generates matching audio for T2V/I2V
7. Retake mode allows surgical editing of video sections (replace audio only, video only, or both)
