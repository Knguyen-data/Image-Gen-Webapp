# Project Overview & Product Development Requirements

**Last Updated:** 2026-02-05
**Version:** 1.2.0
**Project:** Raw Image Prompt Studio

## Executive Summary

Raw Image Prompt Studio is a browser-based image generation application supporting multiple AI models. The platform enables batch image generation with reference image support, prompt management, and local history persistence. Recent enhancements include Spicy Mode with dual-model support (Seedream Edit and Text-to-Image).

**Key Metrics:**
- Test Coverage: 59 tests passing (Spicy Mode features)
- Supported Models: 3 (Gemini, Seedream Edit, Seedream Text-to-Image)
- Storage: Client-side (IndexedDB/LocalStorage)
- Security: API keys stored locally, never transmitted except to model providers

## Core Features

### 1. Batch Image Generation
- Generate multiple images from varied prompts
- Support for 1-8 images per generation
- Queue-based processing with rate limiting
- Progress tracking with real-time updates

### 2. Reference Image Support
- Global reference images (applied to all prompts)
- Per-prompt reference images
- Drag-and-drop upload
- Base64 encoding for API transmission

### 3. Spicy Mode Enhancements (New)

#### 3.1 Unified API Key Management
**Feature:** Tabbed modal supporting both Gemini and Kie.ai API keys
**Implementation:** `src/components/api-key-modal.tsx`
**Status:** Complete

**Capabilities:**
- Tab-based UI (Gemini | Spicy Mode)
- Real-time key validation
- Secure local storage
- Auto-sanitization (removes quotes)

**Technical Details:**
```typescript
type KeyMode = 'gemini' | 'spicy';
- Gemini validation: Ping test with gemini-2.0-flash-lite
- Kie.ai validation: Credit balance API check
```

#### 3.2 Seedream Text-to-Image Service
**Feature:** Text-to-image generation without reference images
**Implementation:** `src/services/seedream-txt2img-service.ts`
**Status:** Complete

**Capabilities:**
- Async API with polling (no image input required)
- Model: `seedream/4.5-text-to-image`
- Aspect ratios: 1:1, 4:3, 3:4, 16:9, 9:16, 2:3, 3:2, 21:9
- Quality modes: basic, high

**Technical Details:**
```typescript
- Create task → Poll (max 60 attempts) → Download
- Rate limiting: 20 requests per 10 seconds (token bucket)
- Error handling: 401 (auth), 402 (credits), 429 (rate limit)
```

#### 3.3 Spicy Sub-Mode Toggle
**Feature:** Switch between Edit and Generate modes
**Implementation:** `src/components/left-panel.tsx`
**Status:** Complete

**Capabilities:**
- Edit mode: Requires reference image (Seedream Edit API)
- Generate mode: No reference image (Seedream Text-to-Image API)
- UI adapts based on selected mode
- Modal validation enforces constraints

**User Flow:**
1. Enable Spicy Mode toggle
2. Select sub-mode (Edit | Generate)
3. If Edit: Upload reference image
4. If Generate: Text prompt only
5. Click Generate → Model auto-selected

#### 3.4 Image Retry with Model Metadata
**Feature:** Retry failed/unsatisfactory generations with model tracking
**Implementation:** `src/types/index.ts`, `src/app.tsx`
**Status:** Complete

**Capabilities:**
- Track generation model per image (`GeneratedImage.generatedBy`)
- Retry button uses original model
- Model selector in modify modal
- Preserves settings snapshot

**Technical Details:**
```typescript
type GenerationModel = 'gemini' | 'seedream-edit' | 'seedream-txt2img';
interface GeneratedImage {
  generatedBy?: GenerationModel;
  settingsSnapshot: AppSettings;
}
```

#### 3.5 Modify Modal Model Selector
**Feature:** Choose model when modifying existing images
**Implementation:** `src/components/modify-image-modal.tsx`
**Status:** Complete

**Capabilities:**
- Dropdown: Gemini, Seedream Edit, Seedream Generate
- Validates reference image requirement
- Auto-populates from original generation
- Override capability for experimentation

### 4. Supporting Infrastructure

#### 4.1 Rate Limiting
**Implementation:** `src/services/seedream-rate-limiter.ts`
**Algorithm:** Token bucket (20 requests/10s)
**Test Coverage:** 14 tests passing

**Features:**
- Async queue with backpressure
- Token refill every 500ms
- Prevents API quota exhaustion

#### 4.2 Credit Monitoring
**Implementation:** `src/hooks/use-seedream-credits.ts`
**Service:** `src/services/seedream-credit-service.ts`
**Test Coverage:** 18 tests passing

**Features:**
- Real-time balance display
- Auto-refresh on generation
- Warning thresholds (configurable)
- Currency formatting

#### 4.3 Logging Service
**Implementation:** `src/services/logger.ts`
**Status:** Complete

**Features:**
- Leveled logging (debug, info, warn, error)
- Namespace-based filtering
- Persistent log storage
- Export capability

### 5. Legacy Features (Maintained)

- Prompt management (add/edit/delete)
- Local history with IndexedDB
- Clipboard support (copy/paste prompts)
- Safety filter toggle
- Temperature control
- Aspect ratio/size presets
- Style hint injection

## Product Requirements

### Functional Requirements

#### FR-1: Multi-Model Support
**Priority:** P0 (Critical)
**Status:** Complete

The application MUST support:
- Google Gemini models (primary)
- Seedream 4.5 Edit (spicy mode, reference required)
- Seedream 4.5 Text-to-Image (spicy mode, text-only)

**Acceptance Criteria:**
- [x] User can select model via UI
- [x] Model selection persists in settings
- [x] Each model respects its constraints
- [x] Error messages are model-specific

#### FR-2: API Key Management
**Priority:** P0 (Critical)
**Status:** Complete

The application MUST:
- Store API keys locally (never server-side)
- Validate keys before storage
- Support multiple key types (Gemini, Kie.ai)
- Provide clear error messages on validation failure

**Acceptance Criteria:**
- [x] Tabbed modal for different key types
- [x] Real-time validation feedback
- [x] Secure storage (localStorage)
- [x] Auto-sanitization (quote removal)

#### FR-3: Reference Image Handling
**Priority:** P1 (High)
**Status:** Complete

The application MUST:
- Support drag-and-drop upload
- Encode images as base64
- Validate image types (JPEG, PNG, WebP)
- Require reference for Edit mode
- Allow optional reference for Generate mode

**Acceptance Criteria:**
- [x] Drag-and-drop UI
- [x] Image preview before generation
- [x] Clear error on invalid format
- [x] Mode-specific validation

#### FR-4: Rate Limiting
**Priority:** P1 (High)
**Status:** Complete

The application MUST:
- Implement token bucket algorithm
- Prevent quota exhaustion
- Queue excess requests
- Provide feedback on rate limits

**Acceptance Criteria:**
- [x] Max 20 requests per 10 seconds
- [x] Visual queue status indicator
- [x] Graceful degradation on rate limit hit
- [x] Unit tests validate algorithm

#### FR-5: Credit Monitoring
**Priority:** P2 (Medium)
**Status:** Complete

The application SHOULD:
- Display current credit balance
- Warn on low credits
- Refresh balance after generation
- Handle credit exhaustion gracefully

**Acceptance Criteria:**
- [x] Real-time balance display
- [x] Auto-refresh on generation
- [x] Warning threshold (configurable)
- [x] Error handling for 402 responses

### Non-Functional Requirements

#### NFR-1: Performance
- Image generation: < 30s (text-to-image), < 60s (edit)
- UI responsiveness: < 100ms interaction feedback
- Local storage: Support 100+ generated images
- Memory footprint: < 500MB for typical session

#### NFR-2: Security
- API keys: localStorage only, never transmitted to third parties
- CORS: Respect model provider policies
- Input validation: Sanitize all user inputs
- Error messages: No sensitive data leakage

#### NFR-3: Reliability
- Error handling: All API calls wrapped in try/catch
- Retry logic: Exponential backoff for transient failures
- State persistence: Auto-save on generation complete
- Graceful degradation: Disable features when keys missing

#### NFR-4: Testability
- Unit test coverage: > 80% for services
- Integration tests: All API interactions mocked
- Edge case coverage: Rate limits, auth errors, timeouts
- Test data: No live API calls in CI/CD

## Technical Constraints

### Dependencies
- React 19.2.3
- Vite 6.2.0
- Google Generative AI SDK 0.24.1
- TypeScript 5.8.2

### Browser Compatibility
- Chrome/Edge: 100+
- Firefox: 100+
- Safari: 15+

### API Rate Limits
- Gemini: Per-key quotas (provider-managed)
- Seedream: 20 requests/10s (application-enforced)

### Storage Limits
- LocalStorage: ~5-10MB (API keys, settings)
- IndexedDB: Varies by browser (typically 50MB+)

## Implementation Guidance

### Adding New Models
1. Define model type in `src/types/index.ts`
2. Create service in `src/services/{model}-service.ts`
3. Add tests in `src/tests/{model}-service.test.ts`
4. Update UI in `src/components/left-panel.tsx`
5. Update validation in `src/components/modify-image-modal.tsx`

### Adding New Settings
1. Extend `AppSettings` in `src/types/index.ts`
2. Update default settings in `src/app.tsx`
3. Add UI controls in `src/components/left-panel.tsx`
4. Persist to localStorage in `saveSettings()`

### Error Handling Pattern
```typescript
try {
  await apiCall();
} catch (error) {
  logger.error('Component', 'Action failed', { error });
  if (error.status === 401) {
    // Prompt for API key
  } else if (error.status === 402) {
    // Show credit warning
  } else if (error.status === 429) {
    // Show rate limit message
  } else {
    // Generic error message
  }
}
```

## Architectural Decisions

### AD-1: Client-Side Storage
**Decision:** Store all data (images, settings, keys) in browser
**Rationale:** Eliminates server costs, improves privacy, simplifies deployment
**Trade-offs:** No cross-device sync, storage limits vary by browser

### AD-2: Async Polling for Seedream
**Decision:** Use create-task → poll → download pattern
**Rationale:** Seedream API is async by design, polling allows progress feedback
**Trade-offs:** Increased latency vs. real-time streaming

### AD-3: Token Bucket Rate Limiting
**Decision:** Application-side rate limiting for Seedream
**Rationale:** Prevents quota exhaustion, improves UX with predictable queuing
**Trade-offs:** Additional complexity vs. relying on server-side 429s

### AD-4: Unified API Key Modal
**Decision:** Single modal with tabs for different key types
**Rationale:** Reduces UI clutter, consistent UX pattern
**Trade-offs:** Initial complexity vs. multiple modals

## Success Metrics

### Current Status (2026-02-05)
- ✅ Unified API Key Modal: Complete
- ✅ Seedream Text-to-Image: Complete (59 tests passing)
- ✅ Spicy Sub-Mode Toggle: Complete
- ✅ Image Retry with Metadata: Complete
- ✅ Modify Modal Selector: Complete
- ✅ Rate Limiting: Complete (14 tests passing)
- ✅ Credit Monitoring: Complete (18 tests passing)

### Future Enhancements
- [ ] Video generation support
- [ ] Advanced style presets
- [ ] Batch export (ZIP download)
- [ ] Cloud sync (optional backend)
- [ ] Multi-language support

## Glossary

**Spicy Mode:** Enhanced generation mode using Seedream APIs (Edit or Text-to-Image)
**Sub-Mode:** Edit (reference required) vs. Generate (text-only)
**Reference Image:** User-provided image to guide generation style/content
**Token Bucket:** Rate limiting algorithm allowing burst traffic with sustained rate limit
**Credit:** Currency unit for Kie.ai API usage (consumed per generation)
**Safety Filter:** Content moderation settings (BLOCK_NONE, BLOCK_LOW_AND_ABOVE, etc.)
