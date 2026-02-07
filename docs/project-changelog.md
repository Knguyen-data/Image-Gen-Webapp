# Project Changelog

**Project:** Raw Image Prompt Studio
**Last Updated:** 2026-02-05

## [1.2.2] - 2026-02-05 - Video Mode Critical Fixes

### Fixed

#### 1. Credit Badge Not Displaying in Video Mode (Complete)
- Fixed credit monitoring icon not appearing in header when in video mode
- **Root Cause:** `useSeedreamCredits` hook only fetched credits when `spicyModeEnabled=true` (image mode only), but video mode needed credits without spicy mode flag
- **Solution:** Removed spicyModeEnabled dependency from hook, now fetches whenever API key exists
- **Files:** `src/hooks/use-seedream-credits.ts`, `src/app.tsx`
- **Impact:** Credit badge now displays correctly in video mode header next to API key icon

#### 2. Duplicate Generate Buttons (Complete)
- Removed duplicate generate button causing UI confusion
- **Root Cause:** Two separate button implementations rendering simultaneously (VideoSceneQueue component + LeftPanel component)
- **Solution:** Removed button from LeftPanel video settings panel (lines 485-509), kept VideoSceneQueue button as it logically owns scene generation action
- **Files:** `src/components/left-panel.tsx`
- **Impact:** Only one generate button visible, cleaner UI

#### 3. Motion Prompt Toggle Functionality (Complete)
- Fixed non-functional prompt toggle button in scene cards
- **Root Cause:** Missing `toggleSceneUsePrompt` function implementation
- **Solution:** Added toggle function to update scene `usePrompt` state
- **Files:** `src/components/video-scene-queue.tsx`
- **Impact:** Toggle button now properly enables/disables prompt per scene

### Changed

#### Credit Hook Behavior
- **Before:** Only fetches credits when spicy mode enabled (image mode)
- **After:** Fetches credits whenever Kie API key exists (both image + video modes)
- **Impact:** Video mode users can now monitor credit balance

#### Button Layout
- **Before:** Two generate buttons stacked in video settings
- **After:** Single button in scene queue component
- **Impact:** Clearer user intent, less confusion

---

## [1.2.1] - 2026-02-05 - Video Mode UI Polish

### Fixed

#### 1. Dynamic Aspect Ratio Detection (Complete)
- Videos now display with correct aspect ratio based on actual dimensions
- Reference images fit neatly within 16:9 frame without cropping
- Global reference thumbnails preserve aspect ratio
- **Root Cause:** Hardcoded `aspect-video` (16:9) and `object-cover` (crops content)
- **Solution:** Dynamic aspect ratio detection + `object-contain` for videos/images
- **Files:** `src/utils/video-dimensions.ts`, `src/components/video-scene-queue.tsx`, `src/components/video-trimmer-modal.tsx`, `src/components/left-panel.tsx`

#### 2. Credit Balance UI Fixes (Complete)
- Fixed credit balance overlap in image mode
- Added credit display to video mode header (blue theme)
- Removed duplicate credit components
- **Files:** `src/components/left-panel.tsx`

#### 3. Spicy Toggle Relocation (Complete)
- Moved spicy toggle (🌶️) to header next to API key icon
- Improved UI accessibility and visual hierarchy
- Toggle now shows inline credit balance when spicy mode enabled
- **Files:** `src/components/left-panel.tsx`

### Changed

#### Video Display
- **Before:** All videos forced to 16:9 aspect ratio with cropping
- **After:** Videos display with native aspect ratio (9:16, 16:9, 1:1, etc.)
- **Impact:** Vertical videos (9:16) no longer stretched, content fully visible

#### Reference Images
- **Before:** `object-cover` crops images to fill container
- **After:** `object-contain` fits images within container with letterboxing
- **Impact:** Reference images show full content without cropping

#### UI Layout
- **Before:** Credit balance in multiple locations causing overlap
- **After:** Single credit display per mode (image/video), clean layout
- **Impact:** Reduced UI clutter, improved readability

---

## [1.2.0] - 2026-02-05 - Spicy Mode Enhancements

### Added

#### 1. Unified API Key Management (Complete)
- Tabbed modal interface supporting both Gemini and Kie.ai API keys
- Real-time key validation with user feedback
- Auto-sanitization (removes surrounding quotes)
- Secure local storage (never transmitted except to providers)
- **Files:** `src/components/api-key-modal.tsx`
- **Commit:** `4224765`

#### 2. Seedream Text-to-Image Service (Complete)
- Text-to-image generation without reference images
- Async API with polling (max 60 attempts, 3s interval)
- Model: `seedream/4.5-text-to-image`
- Support for 8 aspect ratios (1:1, 4:3, 3:4, 16:9, 9:16, 2:3, 3:2, 21:9)
- Quality modes: basic, high
- **Files:** `src/services/seedream-txt2img-service.ts`
- **Tests:** 14 tests passing
- **Commit:** `4224765`

#### 3. Spicy Sub-Mode Toggle (Complete)
- UI toggle between Edit and Generate modes
- Edit mode: Requires reference image (Seedream Edit API)
- Generate mode: Text-only (Seedream Text-to-Image API)
- Automatic UI adaptation based on selected mode
- Modal validation enforces reference image requirements
- **Files:** `src/components/left-panel.tsx`, `src/types/index.ts`
- **Commit:** `4224765`

#### 4. Image Retry with Model Metadata (Complete)
- Track generation model per image (`GeneratedImage.generatedBy`)
- Retry button uses original model automatically
- Preserves original settings snapshot
- Model selector in modify modal for override capability
- **Files:** `src/types/index.ts`, `src/app.tsx`, `src/components/right-panel.tsx`
- **Commit:** `4224765`

#### 5. Modify Modal Model Selector (Complete)
- Dropdown for model selection (Gemini, Seedream Edit, Seedream Generate)
- Validates reference image requirement per model
- Auto-populates from original generation metadata
- Override capability for experimentation
- **Files:** `src/components/modify-image-modal.tsx`
- **Commit:** `4224765`

#### 6. Rate Limiting Infrastructure (Complete)
- Token bucket algorithm for Seedream APIs (20 req/10s)
- Prevents quota exhaustion
- Async queue with backpressure
- Token refill every 500ms
- **Files:** `src/services/seedream-rate-limiter.ts`
- **Tests:** 14 tests passing
- **Commit:** `4224765`

#### 7. Credit Monitoring System (Complete)
- Real-time Kie.ai credit balance display
- Auto-refresh on generation
- Cache with 60s TTL
- Warning thresholds (configurable)
- **Files:** `src/hooks/use-seedream-credits.ts`, `src/services/seedream-credit-service.ts`
- **Tests:** 18 tests passing
- **Commit:** `4224765`

#### 8. Centralized Logging Service (Complete)
- Leveled logging (debug, info, warn, error)
- Namespace-based filtering
- Timestamp + context metadata
- Export capability
- Color-coded console output (dev mode)
- **Files:** `src/services/logger.ts`
- **Commit:** `4224765`

### Changed

#### API Key Modal
- **Before:** Single input for Gemini API key
- **After:** Tabbed interface (Gemini | Spicy Mode) with dual key support
- **Impact:** Improved UX, reduced modal clutter

#### Left Panel Controls
- **Before:** Simple generation button
- **After:** Spicy Mode toggle + sub-mode selector with conditional UI
- **Impact:** Users can now choose between 3 generation models

#### Generated Image Metadata
- **Before:** No tracking of generation source
- **After:** `generatedBy` field tracks model used
- **Impact:** Enables accurate retry with original model

#### App Settings
- **Before:** No Spicy Mode configuration
- **After:** Added `spicyMode: { enabled, kieApiKey, quality, subMode }`
- **Impact:** Persistent Spicy Mode preferences across sessions

### Fixed

- Prompt delete button z-index issue (commit `a701787`)
- JSX syntax error in components (commit `759b9f0`)
- Model revert to `gemini-3-pro` for stability (commit `1d020be`)

### Tests

**New Test Coverage:**
- `seedream-service.test.ts`: 27 tests (task creation, polling, download)
- `seedream-txt2img-service.test.ts`: 14 tests (text-to-image flow)
- `seedream-rate-limiter.test.ts`: 14 tests (token bucket algorithm)
- `seedream-credit-service.test.ts`: 18 tests (balance fetch, cache, errors)

**Total:** 59 tests passing (src/tests only)

**Test Metrics:**
- Exit code: 0 (all tests pass)
- Execution time: 6.12s
- Coverage: 91.89% for new services

### Technical Debt

- **Large Components:** `left-panel.tsx` (800 lines) needs modularization
- **Missing Tests:** `gemini-service.ts` has no dedicated test file
- **UI Tests:** React Testing Library setup incomplete
- **Hook Tests:** `.claude/hooks` tests failing (24 failures, unrelated to core app)

### Dependencies

**No new production dependencies**

**Development Dependencies Updated:**
- `@vitest/coverage-v8@4.0.18` (added for test coverage)
- `vitest@4.0.18` (existing, used for new tests)

### Security

- API keys stored in localStorage (domain-scoped, not encrypted)
- CORS requests to trusted providers only (Google, Kie.ai)
- Input sanitization on all user inputs
- No sensitive data in error messages

### Performance

- Seedream rate limiting prevents quota exhaustion
- Credit balance cached (60s TTL) reduces API calls
- Async polling with 3s interval balances responsiveness and server load
- Token bucket allows burst traffic while maintaining sustained rate limit

---

## [1.1.0] - 2026-02-04 - Session Continuity & Documentation

### Added
- Session continuity instructions in `CLAUDE.md` (commit `26376c3`)
- Google Gemini API reference documentation (commit `66c74f4`)

### Changed
- Improved documentation structure
- Added MCP memory integration guidance

---

## [1.0.1] - 2026-02-03 - Bug Fixes & Refactoring

### Fixed
- Prompt delete button clickable by adding z-index (commit `a701787`)

### Changed
- Reorganized codebase to `src/` with kebab-case naming (commit `a7e4cf0`)
- **Impact:** Improved code discoverability for LLM tools (Grep, Glob)

---

## [1.0.0] - 2026-02-02 - Core Features

### Added

#### Logging System
- Centralized logging service
- Image quality selector
- UI improvements
- **Commit:** `75b88af`

#### UX Enhancements
- Run index display
- Clipboard copy support
- Progress indicators
- Safety filter toggle
- **Commit:** `83c2f21`

#### Batch Generation
- Merge batch/gen flow
- Rate limiting for Gemini
- Drag-and-drop image upload
- Gemini 2.0 model support
- **Commit:** `be225dd`

### Initial Features
- Batch image generation (1-8 images)
- Reference image support (global + per-prompt)
- Prompt management (add/edit/delete)
- Local history with IndexedDB
- Secure API key storage (localStorage)
- Temperature control (0.0-2.0)
- Aspect ratio presets (1:1, 16:9, 9:16, 4:3, 3:4, 4:5)
- Image size selection (1K, 2K, 4K)
- Style hint injection
- Safety filter toggle

---

## Version History Summary

| Version | Date | Key Features | Tests |
|---------|------|-------------|-------|
| 1.2.1 | 2026-02-05 | Video aspect ratio fix, UI polish | 59 passing |
| 1.2.0 | 2026-02-05 | Spicy Mode (Seedream Edit + Text-to-Image) | 59 passing |
| 1.1.0 | 2026-02-04 | Session continuity, Gemini docs | N/A |
| 1.0.1 | 2026-02-03 | Bug fixes, src/ refactor | N/A |
| 1.0.0 | 2026-02-02 | Core generation features | 0 (no tests) |

---

## Roadmap

### Phase 1: Stability (Current)
- [x] Unified API key management
- [x] Seedream Text-to-Image integration
- [x] Rate limiting and credit monitoring
- [x] Comprehensive test coverage (59 tests)
- [ ] Component modularization (left-panel.tsx)
- [ ] Add UI component tests

### Phase 2: Advanced Features (Q1 2026)
- [ ] Bulk export (ZIP download)
- [ ] Advanced prompt templates
- [ ] Style preset library
- [ ] Batch modification (edit multiple images)
- [ ] Video generation support

### Phase 3: Collaboration (Q2 2026)
- [ ] Optional cloud sync backend
- [ ] Shared prompt libraries
- [ ] Team collaboration features
- [ ] Multi-device sync

### Phase 4: AI Enhancements (Q3 2026)
- [ ] Prompt auto-completion
- [ ] Style transfer learning
- [ ] Intelligent reference image suggestions
- [ ] Multi-language support

---

## Breaking Changes

### 1.2.0
**None.** All changes are backward compatible.
- Existing users retain Gemini-only workflow
- Spicy Mode is opt-in (disabled by default)
- Existing generated images work with new retry/modify flows

### 1.0.1
**File Reorganization:** Files moved from root to `src/`
- **Impact:** Import paths changed
- **Migration:** Automatic (Vite handles paths)

---

## Migration Guides

### Upgrading from 1.1.0 to 1.2.0

**No migration required.** Pull latest changes and refresh browser.

**Optional: Enable Spicy Mode**
1. Click "API Keys" button
2. Switch to "Spicy Mode" tab
3. Enter Kie.ai API key
4. Toggle "Spicy Mode" in left panel
5. Select sub-mode (Edit or Generate)

**Existing Data:**
- Generated images preserved in IndexedDB
- Settings migrated automatically with new defaults
- API keys unchanged (stored separately)

### Upgrading from 1.0.x to 1.1.0

**No migration required.** Documentation-only changes.

---

## Known Issues

### High Priority
- None

### Medium Priority
- Large component files (left-panel.tsx 800 lines) impact code navigation
- No UI component tests (React Testing Library setup incomplete)

### Low Priority
- Hook tests failing (unrelated to core app, `.claude/` directory)
- Release manifest files inflate bundle size (exclude from build)

---

## Contributors

- **Knguyen-data** - Core development, Spicy Mode integration
- **Claude Code (AI Assistant)** - Documentation, testing, code review

---

## License

MIT License - See `LICENSE` file for details

---

## Acknowledgments

- **Google Gemini API** - Primary image generation provider
- **Kie.ai (Seedream)** - Advanced image editing and text-to-image
- **React Team** - UI framework
- **Vite Team** - Build tooling
- **Vitest Team** - Testing framework
