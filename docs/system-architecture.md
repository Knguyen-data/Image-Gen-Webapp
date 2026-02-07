# System Architecture

**Last Updated:** 2026-02-05
**Version:** 1.2.0

## Overview

Raw Image Prompt Studio is a client-side React application with no backend server. All processing, storage, and API orchestration occurs in the browser. The architecture prioritizes privacy, offline capability, and multi-model flexibility.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Browser (Client)                        │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────────┐  │
│  │              React UI Layer                          │  │
│  │  - app.tsx (main orchestrator)                       │  │
│  │  - left-panel.tsx (controls)                         │  │
│  │  - right-panel.tsx (results)                         │  │
│  │  - api-key-modal.tsx (key management)                │  │
│  │  - modify-image-modal.tsx (edit UI)                  │  │
│  └──────────────────────────────────────────────────────┘  │
│                          ↕                                  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │           Service Layer                              │  │
│  │  - gemini-service.ts                                 │  │
│  │  - seedream-service.ts (Edit API)                    │  │
│  │  - seedream-txt2img-service.ts (Text-to-Image)       │  │
│  │  - batch-queue.ts (generation orchestration)         │  │
│  │  - rate-limiter.ts (Gemini throttle)                 │  │
│  │  - seedream-rate-limiter.ts (Seedream throttle)      │  │
│  │  - seedream-credit-service.ts (balance tracking)     │  │
│  │  - logger.ts (centralized logging)                   │  │
│  └──────────────────────────────────────────────────────┘  │
│                          ↕                                  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │          Storage Layer                               │  │
│  │  - db.ts (IndexedDB wrapper)                         │  │
│  │  - localStorage (API keys, settings)                 │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                          ↕ HTTPS
┌─────────────────────────────────────────────────────────────┐
│                  External APIs                              │
│  - Google Gemini API (generativelanguage.googleapis.com)   │
│  - Kie.ai API (api.kie.ai)                                 │
│    - Seedream 4.5 Edit (model: seedream/4.5)               │
│    - Seedream 4.5 Text-to-Image (model: seedream/4.5-t2i)  │
└─────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

### UI Layer

#### app.tsx
**Role:** Main application orchestrator
**State Management:**
- API keys (Gemini, Kie.ai)
- App settings (temperature, aspect ratio, safety filter, spicy mode)
- Prompts list
- Generated images history
- Current run metadata

**Key Functions:**
```typescript
- handleGenerate(): Orchestrates batch generation
- handleRetry(): Retry failed/unsatisfactory images
- handleModify(): Modify existing images with new prompts
- saveSettings(): Persist to localStorage
- loadSettings(): Restore from localStorage
```

#### left-panel.tsx
**Role:** Generation controls and settings
**Features:**
- Prompt input (text area + bulk import)
- Reference image upload (global + per-prompt)
- Spicy Mode toggle (enable/disable)
- Sub-mode selector (Edit | Generate)
- Model settings (aspect ratio, quality, temperature)
- Credit balance display (Seedream)

**Validation Logic:**
- Edit mode → requires reference image
- Generate mode → text-only, no reference required
- Spicy Mode disabled → Gemini model auto-selected

#### right-panel.tsx
**Role:** Results display and history
**Features:**
- Image grid with lazy loading
- Retry/Modify/Delete actions per image
- Clipboard copy (prompt text)
- Download individual images
- Run grouping with collapsible sections

#### api-key-modal.tsx
**Role:** Unified API key management
**Features:**
- Tabbed interface (Gemini | Spicy)
- Real-time key validation
- Error messaging with retry
- Auto-sanitization (quote removal)

**Validation Flow:**
```
User enters key → sanitizeKey() → validate{Gemini|Kie}ApiKey()
→ Save to localStorage → Update state → Close modal
```

#### modify-image-modal.tsx
**Role:** Edit existing images
**Features:**
- Model selector dropdown (Gemini, Seedream Edit, Seedream Generate)
- Prompt override
- Reference image re-upload
- Preserves original settings snapshot

### Service Layer

#### gemini-service.ts
**Responsibilities:**
- Generate images via Gemini API
- Handle reference image encoding
- Apply safety filters
- Error translation (quota, auth, safety)

**API Contract:**
```typescript
generateImage(request: GenerationRequest): Promise<GeneratedImage[]>
- Input: prompt, referenceImages, settings, apiKey
- Output: Array of base64-encoded images with metadata
```

#### seedream-service.ts
**Responsibilities:**
- Seedream 4.5 Edit API (image-to-image)
- Task creation, polling, result download
- Error handling (401, 402, 429)

**Flow:**
```
createTask() → pollForResult() → downloadImageAsBase64()
```

**Polling Strategy:**
- Interval: 3 seconds
- Max attempts: 60 (3 minutes timeout)
- States: waiting → success | fail

#### seedream-txt2img-service.ts
**Responsibilities:**
- Seedream 4.5 Text-to-Image API (text-only)
- No reference image required
- Shares polling logic with seedream-service.ts

**API Contract:**
```typescript
generateWithSeedreamTxt2Img(
  apiKey: string,
  prompt: string,
  settings: SeedreamSettings,
  onProgress?: (stage, detail) => void
): Promise<{ base64, mimeType }>
```

#### batch-queue.ts
**Responsibilities:**
- Queue multiple prompts for sequential processing
- Model routing (Gemini vs. Seedream)
- Progress tracking with callbacks
- Error aggregation

**Queue Flow:**
```
for each prompt:
  if spicyMode && subMode === 'edit':
    → seedream-service.ts
  else if spicyMode && subMode === 'generate':
    → seedream-txt2img-service.ts
  else:
    → gemini-service.ts

  onProgress({ completed, total, currentPrompt })
```

#### seedream-rate-limiter.ts
**Algorithm:** Token bucket
**Configuration:**
- Capacity: 20 tokens
- Refill rate: 20 tokens per 10 seconds
- Refill interval: 500ms (1 token per 500ms)

**Implementation:**
```typescript
waitForSlot(): Promise<void>
- If token available: consume and proceed
- Else: queue request, await token refill
- Prevents 429 errors from Kie.ai API
```

#### seedream-credit-service.ts
**Responsibilities:**
- Fetch current credit balance from Kie.ai
- Cache balance with TTL (configurable)
- Format currency display
- Error handling (auth, network)

**API Endpoint:**
```
GET https://api.kie.ai/api/v1/chat/credit
Authorization: Bearer {kieApiKey}
Response: { code: 200, data: { balance: number } }
```

#### logger.ts
**Features:**
- Leveled logging (debug, info, warn, error)
- Namespace-based filtering
- Timestamp + context metadata
- Export to file (JSON)

**Usage:**
```typescript
logger.info('Component', 'Action completed', { metadata });
logger.error('Service', 'API call failed', { error, status });
```

### Storage Layer

#### db.ts
**Role:** IndexedDB wrapper for generated images
**Schema:**
```typescript
Store: 'images'
Key: image.id (auto-generated UUID)
Value: GeneratedImage {
  id, base64, mimeType, seed, createdAt,
  promptUsed, settingsSnapshot, generatedBy
}
```

**Operations:**
- saveImages(images: GeneratedImage[]): Batch insert
- loadImages(): Retrieve all (sorted by createdAt DESC)
- deleteImage(id: string): Remove single image
- clearAll(): Purge history

#### localStorage
**Keys:**
- `raw_studio_api_key`: Gemini API key
- `raw_studio_kie_api_key`: Kie.ai API key
- `raw_studio_settings`: Serialized AppSettings JSON

**Persistence Strategy:**
- Save on every settings change
- Load on app initialization
- Merge with defaults for new settings

## Model Selection Logic

```typescript
function determineModel(settings: AppSettings): GenerationModel {
  if (!settings.spicyMode.enabled) {
    return 'gemini';
  }

  if (settings.spicyMode.subMode === 'edit') {
    return 'seedream-edit';
  }

  if (settings.spicyMode.subMode === 'generate') {
    return 'seedream-txt2img';
  }

  return 'gemini'; // fallback
}
```

**Validation:**
- Edit mode requires `referenceImages.length > 0`
- Generate mode allows `referenceImages.length === 0`
- UI enforces constraints before API calls

## Retry Logic Architecture

### Retry with Metadata
```typescript
interface GeneratedImage {
  generatedBy?: GenerationModel; // 'gemini' | 'seedream-edit' | 'seedream-txt2img'
  settingsSnapshot: AppSettings;
  promptUsed: string;
}

function handleRetry(image: GeneratedImage) {
  const model = image.generatedBy || 'gemini';
  const request = {
    prompt: image.promptUsed,
    settings: image.settingsSnapshot,
    apiKey: getApiKeyForModel(model)
  };

  if (model === 'seedream-edit') {
    // Re-fetch reference image from settingsSnapshot
    await seedreamService.generateWithSeedream(request);
  } else if (model === 'seedream-txt2img') {
    await seedreamTxt2ImgService.generateWithSeedreamTxt2Img(request);
  } else {
    await geminiService.generateImage(request);
  }
}
```

### Modify with Model Override
```typescript
function handleModify(image: GeneratedImage, newModel: GenerationModel) {
  const request = {
    prompt: userInput.prompt || image.promptUsed,
    settings: { ...image.settingsSnapshot, ...userOverrides },
    apiKey: getApiKeyForModel(newModel)
  };

  // Validate reference image requirement
  if (newModel === 'seedream-edit' && !request.referenceImages?.length) {
    throw new Error('Seedream Edit requires reference image');
  }

  await routeToModel(newModel, request);
}
```

## Error Handling Strategy

### HTTP Status Codes
| Code | Meaning | User Message | Action |
|------|---------|--------------|--------|
| 401 | Auth failure | "Invalid API key. Please check your {model} API key." | Open key modal |
| 402 | Insufficient credits | "Insufficient credits. Please top up your Kie.ai account." | Show balance |
| 429 | Rate limit | "Rate limit exceeded. Please wait and try again." | Queue request |
| 500 | Server error | "Service temporarily unavailable. Try again later." | Log + notify |

### Retry Strategy (Transient Errors)
```typescript
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  backoff = 1000
): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1 || !isTransient(error)) {
        throw error;
      }
      await sleep(backoff * Math.pow(2, i)); // exponential backoff
    }
  }
}
```

## Data Flow Examples

### Text-to-Image Generation (Seedream)
```
1. User: Enable Spicy Mode, select "Generate", enter prompt
2. UI: Validate no reference image required
3. Click "Generate"
   ↓
4. app.tsx: handleGenerate()
   ↓
5. batch-queue.ts: Queue prompts
   ↓
6. seedream-rate-limiter.ts: waitForSlot()
   ↓
7. seedream-txt2img-service.ts: createTxt2ImgTask()
   → POST /api/v1/jobs/createTask
   ← { taskId: "..." }
   ↓
8. pollForResult(taskId)
   → GET /api/v1/jobs/queryTask?taskId=...
   ← { state: "waiting" } (repeat every 3s)
   ← { state: "success", resultUrls: [...] }
   ↓
9. downloadImageAsBase64(resultUrls[0])
   → Fetch image from CDN
   ↓
10. db.ts: saveImages([{ base64, generatedBy: 'seedream-txt2img', ... }])
    ↓
11. UI: Display in right-panel.tsx
```

### Image Edit (Seedream Edit)
```
1. User: Enable Spicy Mode, select "Edit", upload reference, enter prompt
2. UI: Validate reference image present
3. Click "Generate"
   ↓
4. app.tsx: handleGenerate()
   ↓
5. batch-queue.ts: Detect subMode === 'edit'
   ↓
6. seedream-service.ts: generateWithSeedream()
   → POST /api/v1/jobs/createTask (with image_url in body)
   ← { taskId: "..." }
   ↓
7. pollForResult() → downloadImageAsBase64()
   ↓
8. Save with generatedBy: 'seedream-edit'
```

### Retry Failed Generation
```
1. User: Click "Retry" on failed image card
2. app.tsx: handleRetry(image)
   ↓
3. Extract image.generatedBy, image.settingsSnapshot, image.promptUsed
   ↓
4. Route to appropriate service:
   - 'gemini' → gemini-service.ts
   - 'seedream-edit' → seedream-service.ts
   - 'seedream-txt2img' → seedream-txt2img-service.ts
   ↓
5. Use original settings + prompt
   ↓
6. Save new result with same generatedBy
```

## Security Architecture

### API Key Storage
- **Location:** localStorage (browser-specific, domain-scoped)
- **Encryption:** None (localStorage is unencrypted)
- **Transmission:** HTTPS only to model providers
- **Exposure:** Never sent to third-party servers

### CORS Policy
- **Gemini API:** CORS-enabled by Google
- **Kie.ai API:** CORS-enabled by Kie.ai
- **Fallback:** Proxy not required (direct browser requests)

### Input Validation
```typescript
// Sanitize API keys
function sanitizeKey(raw: string): string {
  let key = raw.trim();
  if (key.startsWith('"') && key.endsWith('"')) key = key.slice(1, -1);
  if (key.startsWith("'") && key.endsWith("'")) key = key.slice(1, -1);
  return key;
}

// Validate image types
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
function validateImage(file: File): boolean {
  return ALLOWED_MIME_TYPES.includes(file.type);
}
```

## Performance Considerations

### Image Compression
- Upload: Original resolution (no client-side compression)
- Display: CSS max-width/height for previews
- Storage: Base64-encoded (1.33x size overhead)

### Rate Limiting Impact
- Gemini: Provider-managed (no client-side throttle)
- Seedream: 20 req/10s → max 120 req/min
- Queue backpressure: Visual feedback via progress bar

### Lazy Loading
- Right panel: Render images on scroll (IntersectionObserver)
- IndexedDB: Load all on init (acceptable for < 1000 images)

## Deployment Architecture

### Build Process
```bash
npm run build
→ Vite production build
→ Output: dist/ (static files)
```

### Hosting Options
- GitHub Pages (static hosting)
- Netlify/Vercel (edge CDN)
- S3 + CloudFront (AWS)
- Any static file host (no server required)

### Environment Variables
- **None required** (all config in localStorage)
- Optional: `VITE_DEFAULT_MODEL` for build-time defaults

## Future Architecture Considerations

### Cloud Sync (Optional Backend)
```
Browser ←→ REST API ←→ Database (PostgreSQL)
- Sync images across devices
- Shared prompt libraries
- Team collaboration features
```

### Video Generation
```
Add: video-service.ts
- Support MP4/WebM output
- Streaming playback in UI
- Larger storage requirements (IndexedDB → S3)
```

### Real-Time Collaboration
```
WebSocket ←→ Server ←→ Redis Pub/Sub
- Multi-user prompt editing
- Live generation status
- Shared reference libraries
```

## Diagrams

### Component Dependency Graph
```
app.tsx
├── left-panel.tsx
│   ├── api-key-modal.tsx
│   ├── bulk-input-modal.tsx
│   └── use-seedream-credits.ts
│       └── seedream-credit-service.ts
├── right-panel.tsx
│   ├── image-card.tsx
│   └── modify-image-modal.tsx
└── batch-queue.ts
    ├── gemini-service.ts
    │   └── rate-limiter.ts
    ├── seedream-service.ts
    │   └── seedream-rate-limiter.ts
    └── seedream-txt2img-service.ts
        └── seedream-rate-limiter.ts
```

### State Flow (Settings)
```
localStorage → loadSettings() → useState(settings)
                                      ↓
                              User interaction (UI)
                                      ↓
                              setSettings() + saveSettings()
                                      ↓
                              localStorage (persisted)
```

## Technology Stack Summary

| Layer | Technology | Purpose |
|-------|-----------|---------|
| UI | React 19.2.3 | Component framework |
| Build | Vite 6.2.0 | Dev server + bundler |
| Language | TypeScript 5.8.2 | Type safety |
| Storage | IndexedDB | Image persistence |
| Storage | LocalStorage | Settings + keys |
| API | Google Generative AI SDK | Gemini integration |
| API | Fetch API | Seedream integration |
| Testing | Vitest 4.0.18 | Unit tests |
| Logging | Custom logger.ts | Centralized logging |
