export type VfxFilterType = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
export type VfxTaskStatus = 'CREATED' | 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'ERROR';

export interface VfxFilter {
  id: VfxFilterType;
  name: string;
  description: string;
  icon: string; // emoji
}

export interface VfxCreateParams {
  video: string;
  filter_type?: VfxFilterType;
  fps?: number;
  bloom_filter_contrast?: number;
  motion_filter_kernel_size?: number;
  motion_filter_decay_factor?: number;
}

export interface VfxCreateResponse {
  data: {
    task_id: string;
  };
}

export interface VfxTaskResult {
  task_id: string;
  status: VfxTaskStatus;
  generated: string[];
}

export interface VfxPollResponse {
  data: VfxTaskResult;
}

export interface VfxApplyOptions {
  filter_type: VfxFilterType;
  fps?: number;
  bloom_filter_contrast?: number;
  motion_filter_kernel_size?: number;
  motion_filter_decay_factor?: number;
}

export const VFX_FILTERS: VfxFilter[] = [
  { id: 1, name: 'Film Grain', description: 'Cinematic grain texture', icon: '🎬' },
  { id: 2, name: 'Motion Blur', description: 'Directional motion blur', icon: '💨' },
  { id: 3, name: 'Fish Eye', description: 'Spherical lens distortion', icon: '🐟' },
  { id: 4, name: 'VHS', description: 'Retro tape aesthetic', icon: '📼' },
  { id: 5, name: 'Camera Shake', description: 'Handheld camera effect', icon: '📷' },
  { id: 6, name: 'VGA', description: 'CRT display retro look', icon: '🖥️' },
  { id: 7, name: 'Bloom', description: 'Glowing light effect', icon: '✨' },
  { id: 8, name: 'Anamorphic', description: 'Cinematic lens flares', icon: '🎥' },
];

export const VFX_FPS_OPTIONS = [24, 30, 48, 60] as const;
export type VfxFps = typeof VFX_FPS_OPTIONS[number];
