# Claude Code Session Tasks — Image Gen Webapp

## Project Location
`C:\Users\ikiuc\Documents\Image Gen Webapp`

## What's Already Done (by sub-agents)
✅ Kling 3 service functions: `createKling3Task`, `createKling3OmniTask`, `createKling3OmniReferenceTask`, `pollKling3Task`, `pollKling3OmniTask` (in freepik-kling-service.ts)
✅ Kling 3 types: `Kling3AspectRatio`, `Kling3OmniInputMode`, `Kling3ImageListItem`, `Kling3MultiPromptItem`, `Kling3Element` (in types/index.ts)
✅ VideoModel extended: `'kling-3' | 'kling-3-omni'` added
✅ UnifiedVideoSettings extended with Kling 3 fields
✅ Kling 3 UI in left-panel.tsx (model selector, settings panels)
✅ Kling 3 UI in video-scene-queue.tsx (per-scene duration, total counter, 6-scene limit)
✅ Motion Director service: `generateMotionControlPrompts` added
✅ Pipeline A (Pro I2V) backend improvements (structured prompts, scene reordering)
✅ App.tsx initial state defaults for Kling 3

## What's NOT Done Yet (4 Tasks Below)

---

## SESSION 1 (Opus 4.6): Motion Control Pipeline Backend
**Files:** `agent/motion_director.py`, `agent/main.py`

### Task
Add Pipeline B (Motion Control) to the backend. Currently only Pipeline A (Pro I2V) exists.

### What to Add to motion_director.py
Add these NEW constants and functions ALONGSIDE existing code:

1. `VIDEO_ANALYZER_INSTRUCTION` — System prompt for Gemini Flash video analysis agent
   - Extracts from reference video: camera_movements, subject_motion_patterns, energy_curve, beat_detection, color_grading, key_visual_elements_in_motion
   - Outputs JSON only. NO SLOW MOTION rule.

2. `MC_CONFIG_AGENT_INSTRUCTION` — Motion Control Config Agent
   - Like CONFIG_AGENT_INSTRUCTION but: receives video_analysis, doesn't describe camera/subject motion, focuses on environment/lighting/style/BACKGROUND ANIMATION elements

3. `MC_CONTEXT_WRITER_INSTRUCTION` — Context-Only Writer
   - CRITICAL: DO NOT describe motion/camera/subject actions
   - Focus ONLY on: scene setting, environment, lighting, style
   - KEY: Make backgrounds ALIVE (cars flickering, neon, particles, crowds, leaves, water, haze)
   - action field = generic ("character performing"), camera = generic framing ("medium shot")

4. `MC_EDITOR_INSTRUCTION` — Validates no motion re-description, validates backgrounds alive

5. `MC_REFINE_INSTRUCTION` — Context-only refinement

6. Factory functions: `create_video_analyzer_agent()`, `create_mc_config_agent()`, `create_mc_context_writer_agent()`, `create_mc_editor_agent()`, `create_mc_refine_agent()`

### What to Add to main.py
- Add `pipeline_type`, `global_reference_video_base64`, `global_reference_video_mime_type`, `character_orientation`, `keep_original_sound` to `MotionGenerateRequest`
- Add `video_analysis`, `pipeline_type` to `MotionGenerateResponse`
- Make `/motion/generate` a ROUTER: if "pro-i2v" → existing pipeline, if "motion-control" → new 4-stage pipeline (Video Analyzer → MC Config → MC Context Writers parallel → MC Editor)
- Update `/motion/refine` to check pipeline_type

### Reference Docs
- `docs/kling_2.6_motion_control_prompt_guide.md` — fal.ai official prompting guide
- `plans/260208-motion-control-pipeline/PLAN.md` — detailed plan

### Rules
- Video passed inline via `types.Part.from_bytes(data=video_bytes, mime_type=mime_type)`
- All agents use gemini-2.5-flash
- NO SLOW MOTION in all instructions
- Don't break Pipeline A

---

## SESSION 2 (Opus 4.6): Kling 3 Video Generation Integration in App.tsx
**Files:** `src/App.tsx`, `src/components/video-scene-queue.tsx`

### Task
Wire up the Kling 3 service functions to the actual video generation flow. The service functions exist, the UI exists, but the generation handler in App.tsx doesn't route to Kling 3 yet.

### What to Do in App.tsx
1. Import `createKling3Task`, `createKling3OmniTask`, `createKling3OmniReferenceTask`, `pollKling3Task`, `pollKling3OmniTask` from freepik-kling-service.ts
2. In `handleVideoGenerate` (or equivalent), add routing for kling-3 and kling-3-omni:
   - `kling-3`: Build multi_prompt array from scenes, call createKling3Task, poll with pollKling3Task
   - `kling-3-omni`: Based on inputMode (T2V/I2V/V2V), call appropriate function
   - For I2V: upload scene image to get public URL, pass as first_frame in image_list
   - For V2V: use createKling3OmniReferenceTask with video_url
3. Handle the multi-shot response (Kling 3 returns ONE video with multiple shots, not multiple videos)
4. Add proper loading states and error handling

### What to Do in video-scene-queue.tsx
1. When model is kling-3, the "Generate Videos" flow should call the multi-shot API (one call with all scenes)
2. When model is kling-3-omni with T2V, scenes provide prompts only
3. Ensure the `handleAutoMotion` function works for Kling 3 models (calls motion director for prompt generation, then user triggers actual Kling 3 generation)

### Reference
- `docs/kling3_multishot_research.md` — API parameters and examples
- `docs/kling3_omni_research.md` — Omni-specific API details
- `src/services/freepik-kling-service.ts` — Already-implemented service functions

---

## SESSION 3 (Minimax): Motion Control Frontend Integration
**Files:** `src/services/motion-director-service.ts`, `src/components/video-scene-queue.tsx`

### Task
Wire up the Motion Control pipeline (Pipeline B) frontend to call the backend correctly.

### What's Already Done
- `generateMotionControlPrompts()` exists in motion-director-service.ts
- `videoSettings.model` drives conditional rendering

### What to Do
1. In video-scene-queue.tsx, update `handleAutoMotion`:
   - When `videoSettings.model === 'kling-2.6'` (Motion Control):
     - Validate globalReferenceVideo exists, show toast error if not
     - Convert video File to base64 using FileReader
     - Call `generateMotionControlPrompts` with video data
   - When `videoSettings.model === 'kling-2.6-pro'` (Pro I2V):
     - Use existing `generateMotionPrompts` (unchanged)

2. Add `fileToBase64` helper function

3. Update Auto Motion button text:
   - kling-2.6: "🎬 Auto Motion Control"
   - kling-2.6-pro: "✨ Auto Motion Prompts"
   - kling-3: "🎬 Auto MultiShot"
   - kling-3-omni: "🎬 Auto Omni"

4. Test that the service call sends correct payload to `/motion/generate` with `pipeline_type: "motion-control"`

### Reference
- `src/services/motion-director-service.ts` — Already has generateMotionControlPrompts
- `src/components/right-panel.tsx` — Where video settings (globalReferenceVideo) are managed

---

## SESSION 4 (Minimax): Testing, Type Conflicts Resolution, Build Verification
**Files:** All modified files

### Task
1. Run `npm run build` (or equivalent) and fix ALL TypeScript compilation errors
2. Resolve any type conflicts between what different agents wrote (they may have duplicate type definitions or incompatible changes)
3. Verify freepik-kling-service.ts compiles cleanly (check imports, types)
4. Verify left-panel.tsx and video-scene-queue.tsx compile cleanly
5. Verify App.tsx compiles with all new imports and state
6. Run the Python backend: `cd agent && python -c "from motion_director import *; from main import app; print('OK')"` to verify imports
7. Fix any issues found
8. Create a summary of what's working and what needs manual testing

### Also
- Check for duplicate type definitions (Kling3OmniInputMode might be defined in both types/index.ts and left-panel.tsx)
- Ensure all imports are correct
- Remove any TODO/placeholder code that should be filled in
- Add the voice_id field to Kling 3 Omni service (optional string array parameter) for future use

---

## Research Docs Available
- `docs/kling3_multishot_research.md` — Kling 3 API (verified from Freepik docs)
- `docs/kling3_omni_research.md` — Kling 3 Omni API (verified)
- `docs/kling_2.6_motion_control_prompt_guide.md` — fal.ai prompt guide
- `plans/260208-motion-control-pipeline/PLAN.md` — Motion Control pipeline plan
- `plans/260208-kling3-integration/PLAN.md` — Kling 3 integration plan
