/**
 * Browser Capability Detector for RIFE Interpolation
 * 
 * Detects WebGPU, WASM, MediaRecorder support, memory constraints,
 * and mobile devices to determine if RIFE can run and how fast.
 */

export interface RIFECapability {
  supported: boolean;
  provider: 'webgpu' | 'wasm' | 'none';
  estimatedSpeed: 'fast' | 'slow' | 'unsupported';
  warnings: string[];
  maxVideoSeconds: number;
  canEncode: boolean;
  reason?: string;
}

// ─── Detection Helpers ───────────────────────────────────────────────────────

function hasWASMSupport(): boolean {
  try {
    return typeof WebAssembly === 'object'
      && typeof WebAssembly.instantiate === 'function';
  } catch {
    return false;
  }
}

function hasWebGPUSupport(): boolean {
  return typeof navigator !== 'undefined' && 'gpu' in navigator;
}

function hasMediaRecorderSupport(): boolean {
  return typeof MediaRecorder !== 'undefined';
}

function getCodecSupport(): { vp9: boolean; vp8: boolean } {
  if (!hasMediaRecorderSupport()) return { vp9: false, vp8: false };
  return {
    vp9: MediaRecorder.isTypeSupported('video/webm;codecs=vp9'),
    vp8: MediaRecorder.isTypeSupported('video/webm;codecs=vp8'),
  };
}

function getDeviceMemoryGB(): number | null {
  if (typeof navigator !== 'undefined' && 'deviceMemory' in navigator) {
    return (navigator as unknown as { deviceMemory: number }).deviceMemory;
  }
  return null;
}

function isMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const mobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
  const smallScreen = typeof screen !== 'undefined'
    && (screen.width < 768 || screen.height < 768);
  return mobileUA || smallScreen;
}

function isFirefox(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Firefox\//i.test(navigator.userAgent);
}

function getSafariVersion(): number | null {
  if (typeof navigator === 'undefined') return null;
  const ua = navigator.userAgent;
  // Safari UA: ...Version/17.4 Safari/...
  const match = ua.match(/Version\/(\d+)(?:\.\d+)* Safari\//);
  if (match) return parseInt(match[1], 10);
  return null;
}

// ─── Main Detection ──────────────────────────────────────────────────────────

let cachedCapability: RIFECapability | null = null;

/**
 * Detect browser capabilities for RIFE interpolation.
 * Result is cached after first call.
 */
export function getRIFECapability(): RIFECapability {
  if (cachedCapability) return cachedCapability;

  const warnings: string[] = [];
  let supported = true;
  let reason: string | undefined;
  let provider: RIFECapability['provider'] = 'none';
  let estimatedSpeed: RIFECapability['estimatedSpeed'] = 'unsupported';
  let maxVideoSeconds = 12; // Desktop default
  const mobile = isMobileDevice();

  // ── Hard blockers ──

  // WASM required for ONNX Runtime
  if (!hasWASMSupport()) {
    cachedCapability = {
      supported: false,
      provider: 'none',
      estimatedSpeed: 'unsupported',
      warnings: [],
      maxVideoSeconds: 0,
      canEncode: false,
      reason: 'WebAssembly is not supported in this browser',
    };
    return cachedCapability;
  }

  // MediaRecorder required for encoding output
  const canEncode = hasMediaRecorderSupport();
  if (!canEncode) {
    cachedCapability = {
      supported: false,
      provider: 'none',
      estimatedSpeed: 'unsupported',
      warnings: [],
      maxVideoSeconds: 0,
      canEncode: false,
      reason: 'MediaRecorder API is not available — cannot encode output video',
    };
    return cachedCapability;
  }

  // Low memory devices
  const memoryGB = getDeviceMemoryGB();
  if (memoryGB !== null && memoryGB < 2) {
    cachedCapability = {
      supported: false,
      provider: 'none',
      estimatedSpeed: 'unsupported',
      warnings: [],
      maxVideoSeconds: 0,
      canEncode: true,
      reason: `Insufficient memory (${memoryGB}GB detected, 2GB minimum required)`,
    };
    return cachedCapability;
  }

  // Safari < 18 — no WASM SIMD / poor ONNX support
  const safariVer = getSafariVersion();
  if (safariVer !== null && safariVer < 18) {
    cachedCapability = {
      supported: false,
      provider: 'none',
      estimatedSpeed: 'unsupported',
      warnings: [],
      maxVideoSeconds: 0,
      canEncode: true,
      reason: `Safari ${safariVer} is not supported — please update to Safari 18+`,
    };
    return cachedCapability;
  }

  // ── Provider detection ──

  if (hasWebGPUSupport()) {
    provider = 'webgpu';
    estimatedSpeed = 'fast';
  } else {
    provider = 'wasm';
    estimatedSpeed = 'slow';
    warnings.push('No WebGPU — using CPU (WASM). Interpolation will be slower.');
  }

  // ── Warnings ──

  if (isFirefox()) {
    warnings.push('Firefox does not support WebGPU — CPU fallback will be used.');
    if (provider !== 'wasm') {
      provider = 'wasm';
      estimatedSpeed = 'slow';
    }
  }

  if (mobile) {
    warnings.push('Mobile device — interpolation may be slow and is limited to 5s videos.');
    maxVideoSeconds = 5;
    if (estimatedSpeed === 'fast') estimatedSpeed = 'slow';
  }

  if (memoryGB !== null && memoryGB < 4) {
    warnings.push(`Low memory detected (${memoryGB}GB) — large videos may fail.`);
    maxVideoSeconds = Math.min(maxVideoSeconds, 8);
  }

  // Codec warnings (non-blocking — encodeToVideo has its own fallback chain)
  const codecs = getCodecSupport();
  if (!codecs.vp9 && !codecs.vp8) {
    warnings.push('No VP9/VP8 codec support — video encoding may use a lower quality codec.');
  }

  cachedCapability = {
    supported,
    provider,
    estimatedSpeed,
    warnings,
    maxVideoSeconds,
    canEncode,
    reason,
  };

  return cachedCapability;
}

/**
 * Reset the cached capability (useful for testing or after permission changes)
 */
export function resetCapabilityCache(): void {
  cachedCapability = null;
}
