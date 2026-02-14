# Code Standards

**Last Updated:** 2026-02-05
**Version:** 1.2.0
**Enforcement:** Manual code review + automated linting

## Overview

This document defines coding standards, architectural patterns, and best practices for the Raw Image Prompt Studio codebase. All contributors must follow these guidelines to maintain code quality and consistency.

## File Organization

### Directory Structure

```
src/
├── components/          # React UI components (PascalCase.tsx)
├── services/           # Business logic & API integrations (kebab-case.ts)
├── hooks/              # Custom React hooks (kebab-case.ts)
├── types/              # TypeScript type definitions (index.ts)
├── tests/              # Unit tests (kebab-case.test.ts)
├── app.tsx             # Main application orchestrator
├── index.tsx           # React entry point
└── constants.ts        # App-wide constants
```

### Naming Conventions

#### Files
```typescript
// React Components: PascalCase
ApiKeyModal.tsx
LeftPanel.tsx
ImageCard.tsx

// Services & Utilities: kebab-case
gemini-service.ts
seedream-rate-limiter.ts
batch-queue.ts

// Tests: kebab-case with .test suffix
seedream-service.test.ts
api-key-modal.test.tsx

// Types: index.ts (single file per directory)
src/types/index.ts

// Constants: kebab-case or constants.ts
src/constants.ts
```

#### Code Identifiers
```typescript
// Components: PascalCase
const ApiKeyModal: React.FC<Props> = () => {}

// Functions: camelCase
function handleGenerate() {}
async function fetchCreditBalance() {}

// Variables: camelCase
const apiKey = "...";
const generatedImages = [];

// Constants: SCREAMING_SNAKE_CASE
const MAX_TOKENS = 20;
const DEFAULT_TEMPERATURE = 0.7;
const SEEDREAM_RATE_LIMIT = 20;

// Types/Interfaces: PascalCase
interface AppSettings {}
type GenerationModel = 'gemini' | 'seedream-edit';

// Enums: PascalCase (avoid enums, use union types)
// Prefer: type Status = 'pending' | 'complete';
// Avoid: enum Status { Pending, Complete }
```

## TypeScript Guidelines

### Type Safety

**Strict Mode Enabled:**
```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "moduleResolution": "bundler",
    "isolatedModules": true,
    "noEmit": true
  }
}
```

**Required Practices:**
```typescript
// ✅ GOOD: Explicit return types
function generateImage(request: GenerationRequest): Promise<GeneratedImage[]> {
  // ...
}

// ❌ BAD: Inferred return type
function generateImage(request) {
  // ...
}

// ✅ GOOD: Strong typing
interface ApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  apiKey: string;
  setApiKey: (key: string) => void;
}

// ❌ BAD: any types
function handleData(data: any) {
  // ...
}

// ✅ GOOD: Union types for discriminated unions
type GenerationModel = 'gemini' | 'seedream-edit' | 'seedream-txt2img';

// ❌ BAD: String types
let model: string = 'gemini';
```

### Type Definitions

**Centralized in `src/types/index.ts`:**
```typescript
// Export all types from single file
export type AspectRatio = '1:1' | '16:9' | '9:16';
export type GenerationModel = 'gemini' | 'seedream-edit' | 'seedream-txt2img';

export interface AppSettings {
  temperature: number;
  outputCount: number;
  aspectRatio: AspectRatio;
  spicyMode: SpicyModeSettings;
}

export interface GeneratedImage {
  id: string;
  base64: string;
  mimeType: string;
  generatedBy?: GenerationModel;
}
```

**Avoid:**
- Inline type definitions in components
- Duplicate type definitions across files
- `any` types without explicit justification

## React Component Standards

### Functional Components

**Template:**
```typescript
import React, { useState, useEffect } from 'react';
import { logger } from '../services/logger';

interface ComponentProps {
  requiredProp: string;
  optionalProp?: number;
  onAction: (data: string) => void;
}

const Component: React.FC<ComponentProps> = ({
  requiredProp,
  optionalProp = 0,
  onAction
}) => {
  const [state, setState] = useState<string>('');

  useEffect(() => {
    // Effect logic
    logger.debug('Component', 'Mounted', { requiredProp });
  }, [requiredProp]);

  const handleClick = () => {
    logger.info('Component', 'Click handled');
    onAction(state);
  };

  return (
    <div className="container">
      <button onClick={handleClick}>Action</button>
    </div>
  );
};

export default Component;
```

### Component Organization

**File Structure:**
```typescript
// 1. Imports (grouped)
import React, { useState, useEffect } from 'react';         // React
import { externalDep } from 'library';                      // External deps
import { logger } from '../services/logger';                // Local services
import { GenerationModel } from '../types';                 // Types

// 2. Types/Interfaces
interface Props {
  // ...
}

// 3. Constants (component-scoped)
const DEFAULT_VALUE = 'default';

// 4. Component
const Component: React.FC<Props> = (props) => {
  // 4a. Hooks (always at top)
  const [state, setState] = useState();
  useEffect(() => {}, []);

  // 4b. Event handlers
  const handleEvent = () => {};

  // 4c. Render helpers
  const renderSection = () => {};

  // 4d. Return JSX
  return <div>{renderSection()}</div>;
};

// 5. Export
export default Component;
```

### State Management

**Local State (useState):**
```typescript
// ✅ GOOD: Explicit type
const [apiKey, setApiKey] = useState<string>('');

// ✅ GOOD: Type inference from initial value
const [count, setCount] = useState(0); // inferred as number

// ❌ BAD: Unclear initial state
const [data, setData] = useState(); // type: undefined
```

**Derived State:**
```typescript
// ✅ GOOD: Compute during render
const isSpicyMode = settings.spicyMode.enabled;
const requiresReference = isSpicyMode && settings.spicyMode.subMode === 'edit';

// ❌ BAD: Store derived state
const [isSpicyMode, setIsSpicyMode] = useState(settings.spicyMode.enabled);
```

### Props Pattern

**Destructure props:**
```typescript
// ✅ GOOD: Destructured with defaults
const Component: React.FC<Props> = ({
  requiredProp,
  optionalProp = defaultValue,
  onAction
}) => {
  // Use directly: requiredProp, optionalProp, onAction
};

// ❌ BAD: Using props object
const Component: React.FC<Props> = (props) => {
  // props.requiredProp, props.optionalProp
};
```

## Service Layer Standards

### API Services

**Template:**
```typescript
/**
 * Service Description
 * Purpose: What this service does
 */

import { logger } from './logger';
import { GenerationRequest, GeneratedImage } from '../types';

const API_BASE_URL = 'https://api.example.com';

/**
 * Function description
 * @param apiKey - User's API key
 * @param prompt - Generation prompt
 * @returns Generated images array
 */
export const generateImage = async (
  apiKey: string,
  prompt: string
): Promise<GeneratedImage[]> => {
  logger.debug('ServiceName', 'Starting generation', { promptLen: prompt.length });

  try {
    const response = await fetch(`${API_BASE_URL}/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({ prompt })
    });

    if (!response.ok) {
      logger.error('ServiceName', 'API error', { status: response.status });
      throw new Error(`Generation failed: ${response.status}`);
    }

    const result = await response.json();
    logger.info('ServiceName', 'Generation complete', { count: result.images.length });
    return result.images;

  } catch (error) {
    logger.error('ServiceName', 'Generation failed', { error });
    throw error;
  }
};
```

### Error Handling

**Standard Pattern:**
```typescript
try {
  const result = await apiCall();
  return result;

} catch (error) {
  logger.error('Service', 'Action failed', { error });

  // Translate HTTP errors to user-friendly messages
  if (error.status === 401) {
    throw new Error('Invalid API key. Please check your credentials.');
  } else if (error.status === 402) {
    throw new Error('Insufficient credits. Please top up your account.');
  } else if (error.status === 429) {
    throw new Error('Rate limit exceeded. Please wait and try again.');
  } else {
    throw new Error('Service temporarily unavailable. Try again later.');
  }
}
```

**Async/Await Required:**
```typescript
// ✅ GOOD: async/await
async function fetchData() {
  try {
    const response = await fetch(url);
    const data = await response.json();
    return data;
  } catch (error) {
    handleError(error);
  }
}

// ❌ BAD: Promise chains
function fetchData() {
  return fetch(url)
    .then(res => res.json())
    .then(data => data)
    .catch(handleError);
}
```

## Testing Standards

### Unit Tests

**Template:**
```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateImage } from './service';

describe('ServiceName', () => {
  beforeEach(() => {
    // Setup
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Cleanup
  });

  describe('generateImage', () => {
    it('should generate images successfully', async () => {
      // Arrange
      const apiKey = 'test-key';
      const prompt = 'test prompt';
      global.fetch = vi.fn(() => Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ images: [{ id: '1' }] })
      }));

      // Act
      const result = await generateImage(apiKey, prompt);

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('1');
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/generate'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-key'
          })
        })
      );
    });

    it('should handle auth errors', async () => {
      // Arrange
      global.fetch = vi.fn(() => Promise.resolve({
        ok: false,
        status: 401
      }));

      // Act & Assert
      await expect(generateImage('invalid-key', 'prompt'))
        .rejects.toThrow('Invalid API key');
    });
  });
});
```

### Test Organization

**Structure:**
```
src/tests/
├── seedream-service.test.ts        # API integration tests
├── seedream-rate-limiter.test.ts   # Algorithm tests
├── seedream-credit-service.test.ts # Service logic tests
└── api-key-modal.test.tsx          # Component tests (future)
```

**Coverage Goals:**
- Services: 80%+ coverage
- Critical paths: 100% coverage (auth, payment, data persistence)
- UI components: 60%+ coverage (integration tests preferred)

### Mocking

**Fetch API:**
```typescript
// ✅ GOOD: Mock fetch globally
global.fetch = vi.fn(() => Promise.resolve({
  ok: true,
  json: () => Promise.resolve({ data: 'mock' })
}));

// ✅ GOOD: Mock with different responses
global.fetch = vi.fn()
  .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ balance: 100 }) })
  .mockResolvedValueOnce({ ok: false, status: 401 });
```

**Timers:**
```typescript
// ✅ GOOD: Use fake timers
vi.useFakeTimers();
const promise = pollForResult();
vi.advanceTimersByTime(3000);
await promise;
vi.useRealTimers();
```

## Logging Standards

### Logger Usage

**Import and Use:**
```typescript
import { logger } from '../services/logger';

// Debug: Detailed flow information
logger.debug('ComponentName', 'Detailed action', { metadata });

// Info: Significant events
logger.info('ServiceName', 'Task created', { taskId: '123' });

// Warn: Recoverable issues
logger.warn('RateLimiter', 'Queue backpressure', { queueSize: 10 });

// Error: Failures requiring attention
logger.error('APIService', 'Request failed', { error, status: 500 });
```

**Namespace Convention:**
- Components: Component name (e.g., 'ApiKeyModal')
- Services: Service name (e.g., 'SeedreamService')
- Hooks: Hook name (e.g., 'useSeedreamCredits')

**Context Metadata:**
```typescript
// ✅ GOOD: Structured context
logger.info('BatchQueue', 'Generation complete', {
  promptCount: 10,
  successCount: 9,
  failCount: 1,
  duration: 45000
});

// ❌ BAD: Unstructured string
logger.info('BatchQueue', 'Generation complete: 9/10 in 45s');
```

## State Persistence

### LocalStorage

**Keys Convention:**
```typescript
const STORAGE_KEYS = {
  GEMINI_API_KEY: 'raw_studio_api_key',
  KIE_API_KEY: 'raw_studio_kie_api_key',
  SETTINGS: 'raw_studio_settings'
};

// ✅ GOOD: Typed storage
function saveSettings(settings: AppSettings): void {
  localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
}

function loadSettings(): AppSettings | null {
  const raw = localStorage.getItem(STORAGE_KEYS.SETTINGS);
  if (!raw) return null;
  return JSON.parse(raw) as AppSettings;
}
```

### IndexedDB

**Database Schema:**
```typescript
const DB_NAME = 'RawImageStudio';
const DB_VERSION = 1;

const STORES = {
  IMAGES: 'images'
};

// Schema
interface ImageStore {
  id: string;          // Primary key
  base64: string;
  mimeType: string;
  createdAt: number;   // Indexed for sorting
  promptUsed: string;
  generatedBy?: GenerationModel;
}
```

**Migration Pattern:**
```typescript
const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (event.oldVersion < 1) {
        const store = db.createObjectStore(STORES.IMAGES, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};
```

## Code Modularization

### File Size Limits

**Thresholds:**
- Components: 200 lines → consider splitting
- Services: 300 lines → extract utilities
- Tests: 500 lines → split into describe blocks

**Modularization Strategy:**
```typescript
// Before: left-panel.tsx (800 lines)
const LeftPanel = () => {
  // 800 lines of code
};

// After: Split into sub-components
// left-panel.tsx (200 lines)
const LeftPanel = () => (
  <div>
    <SpicyModeControls settings={settings} onChange={handleChange} />
    <PromptInput prompts={prompts} onChange={handlePrompts} />
    <ModelSettings settings={settings} onChange={handleChange} />
  </div>
);

// spicy-mode-controls.tsx (100 lines)
const SpicyModeControls = ({ settings, onChange }) => { /* ... */ };

// prompt-input.tsx (150 lines)
const PromptInput = ({ prompts, onChange }) => { /* ... */ };

// model-settings.tsx (100 lines)
const ModelSettings = ({ settings, onChange }) => { /* ... */ };
```

## Git Standards

### Commit Messages

**Format: Conventional Commits**
```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `refactor`: Code restructuring (no behavior change)
- `test`: Test additions/modifications
- `chore`: Build/tooling changes

**Examples:**
```
feat(spicy-mode): integrate Seedream 4.5 Edit API with unified key modal

- Add Seedream 4.5 Edit service with async polling
- Add token bucket rate limiter (20 req/10s)
- Unify API key modal for Gemini and Kie.ai
- Add 46 unit tests
```

```
fix: make prompt delete button clickable by adding z-index
```

```
refactor: reorganize codebase to src/ with kebab-case naming
```

### Branch Strategy

**Main Branches:**
- `master`: Production-ready code
- `develop`: Integration branch (if needed)

**Feature Branches:**
- Format: `feature/short-description` or `spicy_mode`
- Create from `master`
- Merge via pull request with code review

### Pull Request Template

```markdown
## Summary
Brief description of changes

## Changes Made
- Feature 1
- Feature 2
- Fix for issue #123

## Test Coverage
- [ ] Unit tests added/updated
- [ ] All tests passing (59/59)
- [ ] Manual testing completed

## Breaking Changes
None / List breaking changes

## Screenshots (if UI changes)
[Attach screenshots]
```

## Performance Guidelines

### Optimization Priorities

**1. Network Requests**
```typescript
// ✅ GOOD: Batch API calls
const results = await Promise.all(prompts.map(p => generateImage(p)));

// ❌ BAD: Sequential calls
for (const prompt of prompts) {
  await generateImage(prompt);
}
```

**2. Rendering**
```typescript
// ✅ GOOD: Memoize expensive computations
const expensiveValue = useMemo(() => compute(data), [data]);

// ✅ GOOD: Lazy load images
const ImageCard = React.lazy(() => import('./image-card'));
```

**3. Storage**
```typescript
// ✅ GOOD: Cache with TTL
const CACHE_TTL = 60000; // 60s
const cached = cache.get(key);
if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
  return cached.value;
}
```

### Bundle Size

**Monitoring:**
```bash
npm run build
# Check dist/ size (target: < 1MB)
```

**Code Splitting:**
```typescript
// ✅ GOOD: Dynamic imports
const Component = React.lazy(() => import('./heavy-component'));
```

## Security Standards

### Input Validation

**API Keys:**
```typescript
// ✅ GOOD: Sanitize before storage
function sanitizeKey(raw: string): string {
  let key = raw.trim();
  if (key.startsWith('"') && key.endsWith('"')) key = key.slice(1, -1);
  if (key.startsWith("'") && key.endsWith("'")) key = key.slice(1, -1);
  return key;
}
```

**User Input:**
```typescript
// ✅ GOOD: Validate prompts
function validatePrompt(text: string): boolean {
  if (text.length === 0) return false;
  if (text.length > 2000) return false;
  return true;
}
```

### Secrets Management

**DO NOT:**
- Commit API keys to git
- Log sensitive data
- Transmit keys to third-party servers

**DO:**
- Store keys in localStorage (domain-scoped)
- Use HTTPS for all API requests
- Clear error messages without exposing internals

## Documentation Standards

### Code Comments

**Function Documentation:**
```typescript
/**
 * Generate images using Seedream API
 *
 * @param apiKey - User's Kie.ai API key
 * @param prompt - Text prompt for generation
 * @param settings - Seedream generation settings
 * @param onProgress - Optional progress callback
 * @returns Promise resolving to generated image data
 * @throws Error if auth fails, credits insufficient, or timeout
 */
export const generateWithSeedream = async (
  apiKey: string,
  prompt: string,
  settings: SeedreamSettings,
  onProgress?: (stage: string, detail?: string) => void
): Promise<{ base64: string; mimeType: string }> => {
  // Implementation
};
```

**Inline Comments:**
```typescript
// ✅ GOOD: Explain why, not what
// Use token bucket to prevent quota exhaustion (20 req/10s limit)
await waitForSlot();

// ❌ BAD: Obvious comment
// Call waitForSlot function
await waitForSlot();
```

### README Structure

**Required Sections:**
1. Project description
2. Features list
3. Installation instructions
4. Usage guide
5. Technology stack
6. License

## Anti-Patterns to Avoid

### TypeScript
```typescript
// ❌ BAD: any types
function process(data: any) {}

// ❌ BAD: Non-null assertion without validation
const value = data!.field;

// ❌ BAD: Type casting without reason
const value = data as SomeType;
```

### React
```typescript
// ❌ BAD: Inline object/array in props (breaks memoization)
<Component config={{ setting: true }} />

// ❌ BAD: useEffect without dependencies
useEffect(() => {
  fetchData();
}); // Runs on every render

// ❌ BAD: Conditional hooks
if (condition) {
  useEffect(() => {}, []);
}
```

### Services
```typescript
// ❌ BAD: Silent error swallowing
try {
  await apiCall();
} catch (error) {
  // Silent failure
}

// ❌ BAD: Unhandled promise rejections
apiCall(); // No await, no .catch()
```

## Checklist for New Code

**Before Committing:**
- [ ] No TypeScript errors (`tsc --noEmit`)
- [ ] All tests passing (`npm test`)
- [ ] No console.log (use logger instead)
- [ ] No secrets in code
- [ ] Files use kebab-case (services) or PascalCase (components)
- [ ] Types defined in `src/types/index.ts`
- [ ] Error handling with try/catch
- [ ] Logging on critical paths
- [ ] Function documentation for public APIs

**Before Pull Request:**
- [ ] Code modularized (< 200 lines per component)
- [ ] Unit tests added for new services
- [ ] Manual testing completed
- [ ] README updated (if needed)
- [ ] Changelog updated
- [ ] No breaking changes (or documented)

## Tools & Linting

**TypeScript Compiler:**
```bash
npm run build  # Type check during build
```

**Vitest:**
```bash
npm test              # Run all tests
npm run test:watch    # Watch mode
npm run test:coverage # Coverage report
```

**Future: ESLint (Recommended)**
```json
{
  "extends": ["eslint:recommended", "plugin:react/recommended"],
  "rules": {
    "no-console": "warn",
    "no-unused-vars": "error",
    "prefer-const": "error"
  }
}
```

## References

- **TypeScript Handbook:** https://www.typescriptlang.org/docs/
- **React Docs:** https://react.dev/
- **Vitest Docs:** https://vitest.dev/
- **Conventional Commits:** https://www.conventionalcommits.org/

---

## Refactoring Progress

This section tracks ongoing refactoring efforts to improve maintainability.

### Completed Refactors

| Date | File | Original Size | New Size | Components Extracted |
|------|------|--------------|----------|---------------------|
| 2026-02-13 | left-panel.tsx | 2254 lines | ~1200 lines | `generation-mode-selector.tsx`, `video-model-selector.tsx`, `kling-settings-panel.tsx`, `veo-settings-panel.tsx`, `prompt-input-section.tsx` |
| 2026-02-13 | app.tsx | ~2800 lines | - | `generation-manager.ts`, `video-generation-manager.ts`, `app-header.tsx`, `loading-overlay.tsx` |
| 2026-02-13 | types/index.ts | mixed case | standardized | `LoraModel`, `Kling3ImageListItem`, `Kling3Element` |

### Modular Components Library

New modular components following the pattern `src/components/[feature]-[type].tsx`:

```typescript
// Generated 2026-02-13
src/components/
├── generation-mode-selector.tsx  // Spicy mode toggle + sub-modes
├── video-model-selector.tsx      // Hierarchical video model selector
├── kling-settings-panel.tsx       // Kling 2.6/Pro settings
├── veo-settings-panel.tsx        // Veo 3.1 settings
├── prompt-input-section.tsx      // Prompt tabs + text area
├── app-header.tsx                // App header with settings button
├── loading-overlay.tsx           // Loading states
└── index.ts                      // Component exports
```

### Services Library

New services:

```typescript
src/services/
├── generation-manager.ts          // Generation logic & API key routing
├── video-generation-manager.ts    // Video generation orchestration
└── batch-operations.ts           // Batch operations barrel export
```

### Pending Refactors

| Component | Est. Lines | Priority | Sections to Extract |
|-----------|------------|----------|---------------------|
| left-panel.tsx | ~1200 | Medium | Fixed block section, Gemini settings, Action buttons |
| app.tsx | ~2800 | Medium | Reduce further, integrate managers |
| right-panel.tsx | ~1300 | Medium | Image card, Modify modal |
| video-scene-queue.tsx | ~1000 | Medium | Extract scene card, timeline |

### Naming Convention Standardization

**Completed:** Migrated from mixed snake_case/camelCase to consistent camelCase:

```typescript
// Before (mixed)
interface LoraModel {
  created_at?: string;      // DB column
  createdAt?: number;        // TypeScript
  trigger_word?: string;
  triggerWord?: string;
}

// After (standardized camelCase)
interface LoraModel {
  triggerWord?: string;
  createdAt?: number;
  fileSize?: number;
  errorMessage?: string;
  trainingProgress?: number;
  trainingImagesCount?: number;
  trainingJobId?: string;
  storageUrl?: string;
  userId?: string;
}
```

**DB Mapping:** Service layer (`lora-model-service.ts`) maps from Supabase snake_case to TypeScript camelCase:

```typescript
// lora-model-service.ts
const rowToModel = (row: LoraRow): LoraModel => ({
  id: row.id,
  name: row.name,
  triggerWord: row.trigger_word,           // DB → TS
  createdAt: new Date(row.created_at).getTime(),  // DB → TS
  // ... all camelCase
});
```

### Component Extraction Pattern

When extracting from monolithic files:

1. **Create new file:** `src/components/[feature]-[type].tsx`
2. **Define Props interface** matching original component props
3. **Move related state/handlers** to new component
4. **Update imports** in parent component
5. **Add to index.ts** for barrel export
6. **Test functionality** remains identical

Example:
```typescript
// src/components/generation-mode-selector.tsx
interface GenerationModeSelectorProps {
  spicyMode: SpicyModeSettings | undefined;
  setSpicyMode: (settings: SpicyModeSettings) => void;
  credits: number | null;
  creditsLoading: boolean;
  isLowCredits: boolean;
  isCriticalCredits: boolean;
}

export const GenerationModeSelector: React.FC<GenerationModeSelectorProps> = (props) => {
  // Implementation
};
```
