// Type definitions for Veo 3.1 results
import { VeoRecordInfoResponse } from '../../services/veo3-types';
import { VeoModel, VeoAspectRatio } from '../../types';

export interface VeoTaskResult {
  taskId: string;
  status: 'generating' | 'success' | 'failed';
  result?: VeoRecordInfoResponse;
  error?: string;
  progress?: string;
  videoUrls?: string[];
  resolution?: string; // 720p, 1080p, 4K
}

export interface VeoSettings {
  model: VeoModel;
  aspectRatio: VeoAspectRatio;
  enableTranslation: boolean;
  seeds?: number;
  watermark?: string;
  callBackUrl?: string;
}
