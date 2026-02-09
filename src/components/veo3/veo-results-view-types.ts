// Type definitions for Veo 3.1 results
import { VeoRecordInfoResponse } from '../../services/veo3-types';

export interface VeoTaskResult {
  taskId: string;
  status: 'generating' | 'success' | 'failed';
  result?: VeoRecordInfoResponse;
  error?: string;
  progress?: string;
}

export interface VeoSettings {
  // Placeholder for Veo settings if needed
  // Currently managed in VeoGenerationPanel component state
}
