/**
 * App.tsx Refactoring Plan
 * 
 * Current state: Single 2558-line file with all functionality
 * Target state: Modular page-based architecture with routing
 * 
 * Pages to create:
 * 1. HomePage - Image generation (prompts, settings, results)
 * 2. VideoPage - Video generation (scenes, video settings, video results)
 * 3. HistoryPage - Activity logs, past generations
 * 4. SavedPayloadsPage - Saved prompt configurations
 * 
 * Shared components to extract:
 * - Navigation/Layout
 * - API Key Modal
 * - Recovery Modal
 * - Suspense fallbacks
 * 
 * Refactoring steps:
 * 1. Create page directory structure
 * 2. Extract common types to types/index.ts (already exists)
 * 3. Create HomePage component
 * 4. Create VideoPage component
 * 5. Create HistoryPage component
 * 6. Create SavedPayloadsPage component
 * 7. Create AppLayout with navigation
 * 8. Set up routing in app.tsx
 * 9. Move shared state to context or props
 */
