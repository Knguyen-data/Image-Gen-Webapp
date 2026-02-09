# CRITICAL: Fix Kling 3 Omni Freepik Integration — No Successful Calls Yet

## Situation
We have NEVER received a successful video from Freepik Kling 3 Omni. Every call results in `FAILED` status within seconds. The payload we send may not match what Freepik expects. You must audit every field against the official docs and fix all discrepancies.

## Your Approach
1. Use sub-agents (`Task`) to parallelize work
2. Read ALL docs in `docs/video_generation_service/Freepik Kling 3 and Kling 3 Omni/` — there are 13 files covering T2V, I2V, V2V, polling, listing for both Pro and Standard tiers
3. Compare docs STRICTLY against our service code in `src/services/freepik-kling-service.ts` and caller in `src/app.tsx`
4. Fix every discrepancy

## Files to Read (MANDATORY)
- `docs/video_generation_service/Freepik Kling 3 and Kling 3 Omni/Kling 3 Omni Pro - Generate video from text or image.md.txt` — T2V/I2V Pro endpoint
- `docs/video_generation_service/Freepik Kling 3 and Kling 3 Omni/Kling 3 Omni Standard - Generate video from text or image.txt` — T2V/I2V Standard endpoint
- `docs/video_generation_service/Freepik Kling 3 and Kling 3 Omni/Kling 3 Omni Pro - Video-to-video generation.md.txt` — V2V Pro endpoint
- `docs/video_generation_service/Freepik Kling 3 and Kling 3 Omni/Kling 3 Omni Standard - Video-to-video generation.txt` — V2V Standard endpoint
- `docs/video_generation_service/Freepik Kling 3 and Kling 3 Omni/kling 3 omni - get task status.txt` — Poll T2V/I2V
- `docs/video_generation_service/Freepik Kling 3 and Kling 3 Omni/Kling 3 Omni Reference-to-Video - Get task status.txt` — Poll V2V
- `docs/video_generation_service/Freepik Kling 3 and Kling 3 Omni/kling_3_pro.md.txt` — Kling 3 (non-Omni) Pro
- `docs/video_generation_service/Freepik Kling 3 and Kling 3 Omni/kling_3_std.md.txt` — Kling 3 (non-Omni) Standard
- `docs/video_generation_service/Freepik Kling 3 and Kling 3 Omni/kling_3_get_task.md.txt` — Kling 3 poll

## Files to Fix
- `src/services/freepik-kling-service.ts` — All create/poll functions
- `src/app.tsx` — All callers: `generateKling3Omni`, `generateKling3` (search for these functions)

## Current State — What We Send Today

### T2V/I2V (`createKling3OmniTask` → `POST /v1/ai/video/kling-v3-omni-{tier}`)
```
Fields we send:
- prompt ✅
- multi_prompt ✅ (string array)
- shot_type ✅ ('customize' when multi_prompt)
- image_url ✅ (start frame when only start frame)
- start_image_url ✅ (start frame when both frames exist)
- end_image_url ✅
- image_urls ✅ (reference images @Image1..N)
- elements ❌ NEVER SENT — type exists but no UI, never passed from app.tsx
- generate_audio ✅
- voice_ids ❌ NEVER SENT — no UI (optional, skip for now)
- aspect_ratio ✅
- duration ✅ (as string)
- webhook_url ❌ NEVER SENT (optional, skip for now)
```

### V2V (`createKling3OmniReferenceTask` → `POST /v1/ai/reference-to-video/kling-v3-omni-{tier}`)
```
Fields we send:
- video_url ✅
- prompt ✅
- image_url ✅ (optional start frame)
- duration ✅ (as string)
- aspect_ratio ✅
- cfg_scale ✅
- negative_prompt ✅
- webhook_url ❌ NEVER SENT (optional, skip)
```

### Poll endpoints
- T2V/I2V: `GET /v1/ai/video/kling-v3-omni-{tier}/{taskId}`
- V2V: `GET /v1/ai/reference-to-video/kling-v3-omni-{tier}/{taskId}`

## Things to Validate and Fix

### 1. BASE_URL and Endpoint Paths
Check that `BASE_URL` + endpoint paths match EXACTLY what the docs say. The proxy prefix `/api/freepik` may or may not be correct. Check `vite.config.ts` for proxy setup.

### 2. Poll Endpoint URLs
Verify the poll URLs match the docs. Currently:
- `pollKling3OmniTask` uses some URL — verify it matches `GET /v1/ai/video/kling-v3-omni-{tier}/{taskId}`
- `pollKling3OmniReferenceTask` uses some URL — verify it matches `GET /v1/ai/reference-to-video/kling-v3-omni-{tier}/{taskId}`
- Note: the T2V/I2V poll URL may differ from V2V poll URL — they use DIFFERENT endpoints per the docs

### 3. Poll Response Parsing
Check the poll response structure matches docs. Currently we read:
```
result.data.status → 'CREATED' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED'
result.data.generated → string[] (video URLs)
```
Verify this matches the actual response schema in the docs for BOTH T2V/I2V and V2V endpoints.

### 4. Request Headers
Verify we send:
- `Content-Type: application/json`
- `x-freepik-api-key: <key>`

### 5. Duration Format
Docs say duration is a STRING enum ('3', '4', '5', ..., '15'). We do `String(options.duration)`. Verify the input is a number that converts to valid enum value.

### 6. Aspect Ratio Values
Docs say: 'auto', '16:9', '9:16', '1:1'. Verify we send exactly these strings.

### 7. cfg_scale Range
For V2V endpoint, check what range cfg_scale accepts. We send raw from UI (default 0.5).

### 8. Element Support
Add Elements UI to `src/components/kling3-omni-panel.tsx`:
- Add a collapsible "Elements" section in T2V and I2V modes
- Each element has: multiple reference image uploads + one frontal image upload
- Up to 2 elements (since max 4 total = elements + reference images)
- Elements referenced as @Element1, @Element2 in prompts
- Wire through app.tsx → createKling3OmniTask options.elements

### 9. Kling 3 (non-Omni) — Also Check
The `generateKling3` function and `createKling3Task` also need validation against `kling_3_pro.md.txt` and `kling_3_std.md.txt`.

## Build Verification
After ALL changes: `npx vite build` must succeed with zero errors.

## Debug Logging
Keep the existing debug logging that shows the request body in console. Add similar logging for poll responses showing the full response JSON.
