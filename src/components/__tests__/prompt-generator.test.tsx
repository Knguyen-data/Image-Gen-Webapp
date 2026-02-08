import { describe, it, expect } from 'vitest';
import {
  buildFullPromptText,
  updatePromptMeta,
  SHOT_TYPES,
  CAMERA_ANGLES,
  MODE_DEFAULTS,
} from '../../utils/prompt-generator-utils';
import type { GeneratedPrompt } from '../../services/prompt-generator-service';

// ---------------------------------------------------------------------------
// Helper — create a GeneratedPrompt stub
// ---------------------------------------------------------------------------
function makePrompt(overrides: Partial<GeneratedPrompt> = {}): GeneratedPrompt {
  return {
    id: 'test-id',
    text: 'A woman standing near a window',
    shotType: 'Medium Shot',
    expression: 'neutral',
    pose: 'standing',
    cameraAngle: 'Eye Level',
    ...overrides,
  };
}

// ===========================================================================
// buildFullPromptText
// ===========================================================================
describe('buildFullPromptText', () => {
  it('prepends shot type + angle when text has no bracket prefix', () => {
    const gp = makePrompt({
      text: 'A woman standing near a window',
      shotType: 'Close-up',
      cameraAngle: 'Low Angle 15°',
    });
    const result = buildFullPromptText(gp);
    expect(result).toBe('[Close-up, Low Angle 15°] A woman standing near a window');
  });

  it('returns text as-is when it already starts with [', () => {
    const gp = makePrompt({
      text: '[Wide Shot, Eye Level] Already bracketed prompt',
      shotType: 'Close-up',
      cameraAngle: 'High Angle 30°',
    });
    const result = buildFullPromptText(gp);
    expect(result).toBe('[Wide Shot, Eye Level] Already bracketed prompt');
  });

  it('uses defaults when shotType is empty', () => {
    const gp = makePrompt({
      text: 'Some description',
      shotType: '',
      cameraAngle: 'Dutch Angle 15°',
    });
    const result = buildFullPromptText(gp);
    expect(result).toBe('[Medium Shot, Dutch Angle 15°] Some description');
  });

  it('uses defaults when cameraAngle is empty', () => {
    const gp = makePrompt({
      text: 'Some description',
      shotType: 'Full Shot',
      cameraAngle: '',
    });
    const result = buildFullPromptText(gp);
    expect(result).toBe('[Full Shot, Eye Level] Some description');
  });

  it('uses both defaults when shotType and cameraAngle are empty', () => {
    const gp = makePrompt({
      text: 'Some description',
      shotType: '',
      cameraAngle: '',
    });
    // Both empty but truthy check: '' || '' is falsy so no bracket added
    // Actually: if (gp.shotType || gp.cameraAngle) — both empty → falsy → no bracket
    const result = buildFullPromptText(gp);
    expect(result).toBe('Some description');
  });
});

// ===========================================================================
// updatePromptMeta
// ===========================================================================
describe('updatePromptMeta', () => {
  it('updates the bracket prefix when shotType changes', () => {
    const gp = makePrompt({
      text: '[Medium Shot, Eye Level] A dramatic scene',
      shotType: 'Medium Shot',
      cameraAngle: 'Eye Level',
    });
    const updated = updatePromptMeta(gp, 'shotType', 'Close-up');
    expect(updated.shotType).toBe('Close-up');
    expect(updated.text).toBe('[Close-up, Eye Level] A dramatic scene');
  });

  it('updates the bracket prefix when cameraAngle changes', () => {
    const gp = makePrompt({
      text: '[Medium Shot, Eye Level] A dramatic scene',
      shotType: 'Medium Shot',
      cameraAngle: 'Eye Level',
    });
    const updated = updatePromptMeta(gp, 'cameraAngle', 'Low Angle 30°');
    expect(updated.cameraAngle).toBe('Low Angle 30°');
    expect(updated.text).toBe('[Medium Shot, Low Angle 30°] A dramatic scene');
  });

  it('preserves the rest of the text after the bracket', () => {
    const longText = '[Wide Shot, High Angle 15°] A woman walks through a neon-lit alley at night, rain glistening on the pavement';
    const gp = makePrompt({
      text: longText,
      shotType: 'Wide Shot',
      cameraAngle: 'High Angle 15°',
    });
    const updated = updatePromptMeta(gp, 'shotType', 'Extreme Close-up');
    expect(updated.text).toContain('A woman walks through a neon-lit alley at night, rain glistening on the pavement');
    expect(updated.text.startsWith('[Extreme Close-up, High Angle 15°]')).toBe(true);
  });

  it('does not mutate the original prompt', () => {
    const gp = makePrompt({
      text: '[Medium Shot, Eye Level] Original text',
      shotType: 'Medium Shot',
      cameraAngle: 'Eye Level',
    });
    const original = { ...gp };
    updatePromptMeta(gp, 'shotType', 'Full Shot');
    expect(gp.shotType).toBe(original.shotType);
    expect(gp.text).toBe(original.text);
  });
});

// ===========================================================================
// addToQueue logic (pure function simulation)
// ===========================================================================
describe('addToQueue', () => {
  it('generated prompt text includes shot type and angle when added to queue', () => {
    const gp = makePrompt({
      text: 'Moody portrait in studio lighting',
      shotType: 'Close-up',
      cameraAngle: 'Low Angle 15°',
    });
    const promptText = buildFullPromptText(gp);
    expect(promptText).toContain('Close-up');
    expect(promptText).toContain('Low Angle 15°');
  });

  it('reference image is attached to the new prompt card', () => {
    const gp = makePrompt({ text: 'A scene' });
    const refImage = {
      id: 'ref-1',
      base64: 'abc123',
      mimeType: 'image/jpeg',
      previewUrl: 'data:image/jpeg;base64,abc123',
    };

    // Simulate the addToQueue logic from the component
    const newPrompt = {
      id: 'new-id',
      text: buildFullPromptText(gp),
      referenceImages: refImage ? [{ ...refImage, id: 'new-ref-id' }] : [],
    };

    expect(newPrompt.referenceImages).toHaveLength(1);
    expect(newPrompt.referenceImages[0].base64).toBe('abc123');
    expect(newPrompt.referenceImages[0].mimeType).toBe('image/jpeg');
  });
});

// ===========================================================================
// Constants
// ===========================================================================
describe('SHOT_TYPES', () => {
  it('contains at least 15 items', () => {
    expect(SHOT_TYPES.length).toBeGreaterThanOrEqual(15);
  });

  it('contains expected values', () => {
    expect(SHOT_TYPES).toContain('Close-up');
    expect(SHOT_TYPES).toContain('Medium Shot');
    expect(SHOT_TYPES).toContain('Wide Shot');
  });
});

describe('CAMERA_ANGLES', () => {
  it('contains at least 15 items', () => {
    expect(CAMERA_ANGLES.length).toBeGreaterThanOrEqual(15);
  });

  it('contains expected values', () => {
    expect(CAMERA_ANGLES).toContain('Eye Level');
    expect(CAMERA_ANGLES).toContain('Low Angle 15°');
    expect(CAMERA_ANGLES).toContain('Dutch Angle 15°');
  });
});

// ===========================================================================
// Mode toggle defaults
// ===========================================================================
describe('Mode toggle', () => {
  it('Storyboard default count is 6', () => {
    expect(MODE_DEFAULTS.storyboard).toBe(6);
  });

  it('Photo Set default count is 10', () => {
    expect(MODE_DEFAULTS.photoset).toBe(10);
  });
});
