/**
 * Video Editor Service
 * Wraps @diffusionstudio/core for browser-based video compositing.
 * Provides a clean API for timeline operations: add/remove/trim clips,
 * transitions, playback, and export.
 */

import { Composition, Layer, VideoClip, Source, Encoder } from '@diffusionstudio/core';
import type { TransitionType, TransitionConfig } from '@diffusionstudio/core';

// These types are from the encoder but may not be re-exported from root
export type EncoderProgress = {
  total: number;
  progress: number;
  remaining: Date;
};

export type ExportResult = {
  type: 'success';
  data: Blob | undefined;
} | {
  type: 'canceled';
} | {
  type: 'error';
  error: Error;
};

export type { TransitionType };

/**
 * Convert a blob URL to a data URL to avoid HEAD request issues
 * Blob URLs trigger ERR_METHOD_NOT_SUPPORTED when Diffusion Studio Core tries to HEAD them
 */
async function blobUrlToDataUrl(blobUrl: string): Promise<string> {
  if (!blobUrl.startsWith('blob:')) return blobUrl;
  
  const response = await fetch(blobUrl);
  const blob = await response.blob();
  
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export interface EditorClipInfo {
  id: string;
  layerIndex: number;
  clipIndex: number;
  name: string;
  startSec: number;
  endSec: number;
  durationSec: number;
  sourceUrl: string;
  transition?: TransitionConfig;
  type: 'generated' | 'broll';
}

export interface EditorLayerInfo {
  index: number;
  mode: 'DEFAULT' | 'SEQUENTIAL';
  clips: EditorClipInfo[];
}

// ── Extended Transition System ──────────────────────────────────────
// The library only supports 5 native types. We define an extended preset
// system that maps each custom preset to its closest native type while
// storing the full preset name for UI display.

export type ExtendedTransitionPreset =
  // Native types (supported directly by @diffusionstudio/core)
  | 'dissolve'
  | 'fade-to-black'
  | 'fade-to-white'
  | 'slide-from-left'
  | 'slide-from-right'
  // Extended presets (mapped to closest native type)
  | 'wipe-left'
  | 'wipe-right'
  | 'wipe-up'
  | 'wipe-down'
  | 'slide-up'
  | 'slide-down'
  | 'zoom-in'
  | 'zoom-out'
  | 'blur'
  | 'spin'
  | 'cross-zoom';

export interface TransitionPresetInfo {
  id: ExtendedTransitionPreset;
  label: string;
  icon: string;
  category: 'fade' | 'slide' | 'wipe' | 'zoom' | 'effect';
  /** The native @diffusionstudio/core type this maps to */
  nativeType: TransitionType;
}

export const TRANSITION_PRESETS: TransitionPresetInfo[] = [
  // ── Fades ──
  { id: 'dissolve',       label: 'Dissolve',       icon: '🌊', category: 'fade',   nativeType: 'dissolve' },
  { id: 'fade-to-black',  label: 'Fade to Black',  icon: '🌑', category: 'fade',   nativeType: 'fade-to-black' },
  { id: 'fade-to-white',  label: 'Fade to White',  icon: '⬜', category: 'fade',   nativeType: 'fade-to-white' },
  // ── Slides ──
  { id: 'slide-from-left',  label: 'Slide Left',   icon: '⬅️', category: 'slide',  nativeType: 'slide-from-left' },
  { id: 'slide-from-right', label: 'Slide Right',  icon: '➡️', category: 'slide',  nativeType: 'slide-from-right' },
  { id: 'slide-up',         label: 'Slide Up',     icon: '⬆️', category: 'slide',  nativeType: 'slide-from-left' },
  { id: 'slide-down',       label: 'Slide Down',   icon: '⬇️', category: 'slide',  nativeType: 'slide-from-right' },
  // ── Wipes ──
  { id: 'wipe-left',  label: 'Wipe Left',   icon: '👈', category: 'wipe',  nativeType: 'slide-from-left' },
  { id: 'wipe-right', label: 'Wipe Right',  icon: '👉', category: 'wipe',  nativeType: 'slide-from-right' },
  { id: 'wipe-up',    label: 'Wipe Up',     icon: '👆', category: 'wipe',  nativeType: 'slide-from-left' },
  { id: 'wipe-down',  label: 'Wipe Down',   icon: '👇', category: 'wipe',  nativeType: 'slide-from-right' },
  // ── Zooms ──
  { id: 'zoom-in',    label: 'Zoom In',     icon: '🔍', category: 'zoom',   nativeType: 'dissolve' },
  { id: 'zoom-out',   label: 'Zoom Out',    icon: '🔎', category: 'zoom',   nativeType: 'dissolve' },
  { id: 'cross-zoom', label: 'Cross Zoom',  icon: '✨', category: 'zoom',   nativeType: 'dissolve' },
  // ── Effects ──
  { id: 'blur',  label: 'Blur',  icon: '💨', category: 'effect', nativeType: 'dissolve' },
  { id: 'spin',  label: 'Spin',  icon: '🌀', category: 'effect', nativeType: 'dissolve' },
];

export const PRESET_CATEGORIES = [
  { key: 'fade'   as const, label: 'Fades',   icon: '🌗' },
  { key: 'slide'  as const, label: 'Slides',  icon: '↔️' },
  { key: 'wipe'   as const, label: 'Wipes',   icon: '🫳' },
  { key: 'zoom'   as const, label: 'Zooms',   icon: '🔍' },
  { key: 'effect' as const, label: 'Effects', icon: '✨' },
];

/** Resolve an extended preset to its native TransitionType */
export function resolveNativeTransition(preset: ExtendedTransitionPreset): TransitionType {
  const info = TRANSITION_PRESETS.find(p => p.id === preset);
  return info?.nativeType ?? 'dissolve';
}

/** Get preset info by id */
export function getPresetInfo(preset: ExtendedTransitionPreset): TransitionPresetInfo | undefined {
  return TRANSITION_PRESETS.find(p => p.id === preset);
}

// Legacy compatibility aliases
export const TRANSITION_TYPES: TransitionType[] = [
  'dissolve',
  'fade-to-black',
  'fade-to-white',
  'slide-from-left',
  'slide-from-right',
];

export const TRANSITION_LABELS: Record<string, string> = Object.fromEntries(
  TRANSITION_PRESETS.map(p => [p.id, p.label])
);

class VideoEditorService {
  private composition: Composition | null = null;
  private encoder: Encoder | null = null;
  private clipSourceMap: Map<string, string> = new Map(); // clipId -> sourceUrl
  private clipTypeMap: Map<string, 'generated' | 'broll'> = new Map();

  /**
   * Create a new composition/project
   */
  async createProject(width = 1920, height = 1080): Promise<Composition> {
    this.composition = new Composition({
      width,
      height,
      background: '#000000',
    });
    this.clipSourceMap.clear();
    this.clipTypeMap.clear();
    return this.composition;
  }

  /**
   * Get the current composition
   */
  getComposition(): Composition | null {
    return this.composition;
  }

  /**
   * Mount composition to a DOM element (canvas)
   */
  mount(element: HTMLElement): void {
    if (!this.composition) throw new Error('No project created');
    this.composition.mount(element);
  }

  /**
   * Unmount composition from DOM
   */
  unmount(): void {
    if (this.composition) {
      this.composition.unmount();
    }
  }

  /**
   * Add a new layer/track to the composition
   */
  async addLayer(mode: 'DEFAULT' | 'SEQUENTIAL' = 'SEQUENTIAL'): Promise<number> {
    if (!this.composition) throw new Error('No project created');
    const layer = new Layer({ mode });
    await this.composition.add(layer);
    return this.composition.layers.length - 1;
  }

  /**
   * Add a video clip to a layer from a URL
   */
  async addClip(
    layerIndex: number,
    videoUrl: string,
    range?: [number, number],
    clipType: 'generated' | 'broll' = 'generated'
  ): Promise<string> {
    if (!this.composition) throw new Error('No project created');

    // Ensure layer exists
    while (this.composition.layers.length <= layerIndex) {
      await this.addLayer('SEQUENTIAL');
    }

    const layer = this.composition.layers[layerIndex];
    
    // Convert blob URLs to data URLs to avoid HEAD request errors
    // Diffusion Studio Core tries to HEAD blob URLs which browsers don't support
    const safeUrl = await blobUrlToDataUrl(videoUrl);
    const source = await Source.from(safeUrl);
    
    const clip = new VideoClip(source as any, range ? {
      range: [range[0], range[1]],
    } : undefined);

    await layer.add(clip);

    this.clipSourceMap.set(clip.id, videoUrl);
    this.clipTypeMap.set(clip.id, clipType);

    return clip.id;
  }

  /**
   * Add a video clip from a File object
   */
  async addClipFromFile(
    layerIndex: number,
    file: File,
    clipType: 'generated' | 'broll' = 'broll'
  ): Promise<string> {
    if (!this.composition) throw new Error('No project created');

    while (this.composition.layers.length <= layerIndex) {
      await this.addLayer('SEQUENTIAL');
    }

    const layer = this.composition.layers[layerIndex];
    const source = await Source.from(file);
    const clip = new VideoClip(source as any);

    await layer.add(clip);

    const blobUrl = URL.createObjectURL(file);
    this.clipSourceMap.set(clip.id, blobUrl);
    this.clipTypeMap.set(clip.id, clipType);

    return clip.id;
  }

  /**
   * Remove a clip from a layer
   */
  removeClip(layerIndex: number, clipIndex: number): void {
    if (!this.composition) throw new Error('No project created');
    const layer = this.composition.layers[layerIndex];
    if (!layer) return;

    const clip = layer.clips[clipIndex];
    if (clip) {
      this.clipSourceMap.delete(clip.id);
      this.clipTypeMap.delete(clip.id);
      layer.remove(clip);
    }
  }

  /**
   * Remove a clip by its ID
   */
  removeClipById(clipId: string): void {
    if (!this.composition) return;
    for (const layer of this.composition.layers) {
      const clip = layer.clips.find(c => c.id === clipId);
      if (clip) {
        this.clipSourceMap.delete(clip.id);
        this.clipTypeMap.delete(clip.id);
        layer.remove(clip);
        return;
      }
    }
  }

  /**
   * Set trim range on a clip
   */
  setTrim(layerIndex: number, clipIndex: number, startSec: number, endSec: number): void {
    if (!this.composition) throw new Error('No project created');
    const layer = this.composition.layers[layerIndex];
    if (!layer) return;

    const clip = layer.clips[clipIndex];
    if (clip) {
      clip.trim(startSec, endSec);
    }
  }

  /**
   * Set transition between clips
   */
  setTransition(
    layerIndex: number,
    clipIndex: number,
    type: TransitionType,
    duration: number = 1
  ): void {
    if (!this.composition) throw new Error('No project created');
    const layer = this.composition.layers[layerIndex];
    if (!layer) return;

    const clip = layer.clips[clipIndex];
    if (clip) {
      clip.transition = { type, duration };
    }
  }

  /**
   * Remove transition from a clip
   */
  removeTransition(layerIndex: number, clipIndex: number): void {
    if (!this.composition) throw new Error('No project created');
    const layer = this.composition.layers[layerIndex];
    if (!layer) return;

    const clip = layer.clips[clipIndex];
    if (clip) {
      clip.transition = undefined;
    }
  }

  /**
   * Reorder clips within a layer
   */
  reorderClip(layerIndex: number, fromIndex: number, toIndex: number): void {
    if (!this.composition) throw new Error('No project created');
    const layer = this.composition.layers[layerIndex];
    if (!layer) return;

    const clip = layer.clips[fromIndex];
    if (clip) {
      clip.index = toIndex;
    }
  }

  /**
   * Play the composition
   */
  async play(time?: number): Promise<void> {
    if (!this.composition) throw new Error('No project created');
    await this.composition.play(time);
  }

  /**
   * Pause the composition
   */
  async pause(): Promise<void> {
    if (!this.composition) throw new Error('No project created');
    await this.composition.pause();
  }

  /**
   * Seek to a specific time
   */
  async seek(time: number): Promise<void> {
    if (!this.composition) throw new Error('No project created');
    await this.composition.seek(time);
  }

  /**
   * Get current playback time in seconds
   */
  get currentTime(): number {
    return this.composition?.currentTime ?? 0;
  }

  /**
   * Get total duration in seconds
   */
  get duration(): number {
    return this.composition?.duration
      ? this.composition.duration / 30 // frames to seconds (assume 30fps)
      : 0;
  }

  /**
   * Check if playing
   */
  get playing(): boolean {
    return this.composition?.playing ?? false;
  }

  /**
   * Get formatted time string
   */
  get timeDisplay(): string {
    return this.composition?.time() ?? '00:00 / 00:00';
  }

  /**
   * Export the composition to MP4
   */
  async exportVideo(
    onProgress?: (progress: EncoderProgress) => void
  ): Promise<Blob | null> {
    if (!this.composition) throw new Error('No project created');

    this.encoder = new Encoder(this.composition, {
      video: { codec: 'avc', bitrate: 8_000_000 },
      audio: { codec: 'aac', bitrate: 128_000 },
    });

    if (onProgress) {
      this.encoder.onProgress = onProgress;
    }

    const result = await this.encoder.render();

    if (result.type === 'success' && result.data) {
      return result.data;
    } else if (result.type === 'canceled') {
      return null;
    } else if (result.type === 'error') {
      throw result.error;
    }

    return null;
  }

  /**
   * Cancel ongoing export
   */
  cancelExport(): void {
    if (this.encoder) {
      this.encoder.cancel();
      this.encoder = null;
    }
  }

  /**
   * Get layer info for the UI
   */
  getLayerInfo(): EditorLayerInfo[] {
    if (!this.composition) return [];

    return this.composition.layers.map((layer, layerIndex) => ({
      index: layerIndex,
      mode: layer.mode as 'DEFAULT' | 'SEQUENTIAL',
      clips: layer.clips.map((clip, clipIndex) => ({
        id: clip.id,
        layerIndex,
        clipIndex,
        name: clip.name || `Clip ${clipIndex + 1}`,
        startSec: clip.start / 30,
        endSec: clip.end / 30,
        durationSec: clip.duration / 30,
        sourceUrl: this.clipSourceMap.get(clip.id) || '',
        transition: clip.transition,
        type: this.clipTypeMap.get(clip.id) || 'generated',
      })),
    }));
  }

  /**
   * Destroy and clean up
   */
  destroy(): void {
    this.cancelExport();
    if (this.composition) {
      this.composition.unmount();
      this.composition.clear();
      this.composition = null;
    }
    // Clean up blob URLs
    for (const url of this.clipSourceMap.values()) {
      if (url.startsWith('blob:')) {
        URL.revokeObjectURL(url);
      }
    }
    this.clipSourceMap.clear();
    this.clipTypeMap.clear();
  }
}

// Singleton instance
export const videoEditorService = new VideoEditorService();
export default videoEditorService;
