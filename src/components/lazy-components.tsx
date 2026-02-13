/**
 * Lazy-loaded Components
 * Heavy components that should only load when needed
 */

import { lazy } from 'react';

// Video Editor - Heavy component with DiffusionStudio
export const VideoEditorLazy = lazy(() => import('./video-editor/video-editor-modal-capcut-style'));

// Settings Page - Not needed on initial load
export const SettingsPageLazy = lazy(() => import('./settings-page'));

// Modals - Only load when opened
export const ModifyImageModalLazy = lazy(() => import('./modify-image-modal'));
export const CompareModalLazy = lazy(() => import('./compare-modal').then(m => ({ default: m.CompareModal })));
export const SaveCollectionModalLazy = lazy(() => import('./save-collection-modal').then(m => ({ default: m.SaveCollectionModal })));
export const SavePayloadDialogLazy = lazy(() => import('./save-payload-dialog').then(m => ({ default: m.SavePayloadDialog })));

// Heavy panels - Load after initial render
export const ActivityPanelLazy = lazy(() => import('./activity-panel'));
export const PromptLibraryPanelLazy = lazy(() => import('./prompt-library-panel'));

// Saved payloads page - Route-level split
export const SavedPayloadsPageLazy = lazy(() => import('./saved-payloads-page').then(m => ({ default: m.SavedPayloadsPage })));

// Auth page - Only for unauthenticated users
export const AuthPageLazy = lazy(() => import('./auth-page'));
