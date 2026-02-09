/**
 * Extracted utility functions and constants from the PromptGenerator component.
 * These are kept in a separate module for testability.
 */

import type { GeneratedPrompt } from '../services/prompt-generator-service';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const SHOT_TYPES = [
  'Extreme Close-up', 'Close-up', 'Medium Close-up', 'Medium Shot',
  'Medium Full Shot', 'Full Shot', 'Wide Shot', 'Extreme Wide Shot',
  'Over-the-Shoulder', 'Two Shot', 'Insert Shot', 'Cutaway',
  'POV Shot', "Bird's Eye View", "Worm's Eye View"
];

export const CAMERA_ANGLES = [
  'Eye Level', 'Low Angle 15°', 'Low Angle 30°', 'Low Angle 45°',
  'High Angle 15°', 'High Angle 30°', 'High Angle 45°',
  'Overhead / Top-Down', 'Dutch Angle 15°', 'Dutch Angle 30°',
  'Side Profile', 'Three-Quarter Left', 'Three-Quarter Right',
  'Front-Facing', 'Rear View', 'Over-the-Shoulder Left',
  'Over-the-Shoulder Right', "Worm's Eye View"
];

// Default counts per mode
export const MODE_DEFAULTS = {
  storyboard: 6,
  photoset: 10,
} as const;

// ---------------------------------------------------------------------------
// Functions
// ---------------------------------------------------------------------------

/**
 * Build full prompt text ensuring shot type and camera angle are included.
 * If the text already starts with `[`, it is returned as-is.
 * Otherwise the shot type and camera angle are prepended as `[ShotType, CameraAngle]`.
 */
export function buildFullPromptText(gp: GeneratedPrompt): string {
  // If text already has bracket prefix, use as-is; otherwise prepend shot type + angle
  let result: string;
  if (gp.text.startsWith('[')) {
    result = gp.text;
  } else {
    const parts: string[] = [];
    if (gp.shotType || gp.cameraAngle) {
      parts.push(`[${gp.shotType || 'Medium Shot'}, ${gp.cameraAngle || 'Eye Level'}]`);
    }
    parts.push(gp.text);
    result = parts.join(' ');
  }

  return result;
}

/**
 * Update the bracket prefix in a GeneratedPrompt when the user changes
 * shotType or cameraAngle via a dropdown.
 * Returns a *new* prompt object (immutable update).
 */
export function updatePromptMeta(
  gp: GeneratedPrompt,
  field: 'shotType' | 'cameraAngle',
  value: string,
): GeneratedPrompt {
  const updated = { ...gp, [field]: value };
  // Update the bracket prefix in text: [ShotType, CameraAngle]
  const bracketRegex = /^\[.*?\]\s*/;
  const textWithoutBracket = gp.text.replace(bracketRegex, '');
  updated.text = `[${updated.shotType}, ${updated.cameraAngle}] ${textWithoutBracket}`;
  return updated;
}
