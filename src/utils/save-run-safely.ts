/**
 * Shared utility to safely save a Run to IndexedDB.
 * Handles the QUOTA_EXCEEDED error gracefully instead of
 * duplicating this try-catch pattern everywhere.
 */
import { Run } from '../types';
import { saveRunToDB } from '../services/db';

export interface SaveRunResult {
    saved: boolean;
    quotaExceeded: boolean;
}

/**
 * Attempts to save a run to IndexedDB.
 * Returns { saved: true } on success, or { quotaExceeded: true } if storage is full.
 * Re-throws any other unexpected errors.
 */
export async function saveRunSafely(run: Run): Promise<SaveRunResult> {
    try {
        await saveRunToDB(run);
        return { saved: true, quotaExceeded: false };
    } catch (e: any) {
        if (e.message === 'QUOTA_EXCEEDED') {
            console.warn('Run saved to memory only (storage full)');
            return { saved: false, quotaExceeded: true };
        }
        throw e;
    }
}
