# Task: @ Mention Autocomplete + Aspect Ratio Preview Frames

## Project: C:\Users\ikiuc\Documents\Image Gen Webapp

Read these files first:
1. `src/components/kling3-omni-panel.tsx` — Kling 3 Omni panel (main target)
2. `src/components/left-panel.tsx` — Kling 3 panel (lines ~950-1000, prompt textareas)

## Feature 1: @ Mention Autocomplete in Prompt Textareas

When the user types `@` in any video prompt textarea (both Kling 3 and Kling 3 Omni), show a floating autocomplete dropdown/tooltip with available element references. The dropdown should appear anchored below the cursor position in the textarea.

### Behavior:
1. User types `@` → dropdown appears with available references
2. Arrow Up/Down to navigate options (highlighted item)
3. Tab or Enter to confirm selection (inserts the reference text)
4. Escape or typing a space closes the dropdown
5. Only show references that actually exist (based on uploaded content)

### Available references by mode:

**Kling 3 Omni — V2V mode:**
- `@Video1` — always shown when reference video is uploaded

**Kling 3 Omni — I2V mode:**
- `@Image1`, `@Image2`, etc. — one per uploaded reference image (from `kling3OmniImageUrls` array)

**Kling 3 Omni — T2V mode:**
- `@Image1`, `@Image2`, etc. — one per uploaded reference image

**Kling 3 (non-Omni):**
- `@Element1`, `@Element2` — if elements are uploaded (currently not implemented, but future-proof)
- No autocomplete needed yet since no elements UI exists — but build the reusable hook anyway

### Implementation:

Create a reusable custom hook + component:

**`src/hooks/use-mention-autocomplete.ts`:**
```typescript
interface MentionOption {
  label: string;      // e.g. "@Video1"
  description: string; // e.g. "Reference video"
  icon?: string;       // e.g. "🎥"
}

interface UseMentionAutocompleteReturn {
  // Attach these to the textarea
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  
  // Dropdown state
  isOpen: boolean;
  options: MentionOption[];
  selectedIndex: number;
  
  // Position (relative to textarea)
  position: { top: number; left: number };
  
  // Call this to close
  close: () => void;
}

export function useMentionAutocomplete(
  availableOptions: MentionOption[],
  textareaRef: React.RefObject<HTMLTextAreaElement>,
  value: string,
  setValue: (val: string) => void
): UseMentionAutocompleteReturn
```

The hook should:
- Track when `@` is typed (detect by checking the character before cursor)
- Filter options as user types after `@` (e.g. `@Vi` filters to `@Video1`)
- Handle Arrow Up/Down for selection
- Handle Tab/Enter to insert the selected option (replace `@partial` with full `@Video1`)
- Handle Escape to close
- Calculate dropdown position from textarea cursor position using a hidden span mirror technique or `textarea.getBoundingClientRect()` with line/column estimation

**`src/components/mention-dropdown.tsx`:**
```typescript
interface MentionDropdownProps {
  isOpen: boolean;
  options: MentionOption[];
  selectedIndex: number;
  position: { top: number; left: number };
  onSelect: (option: MentionOption) => void;
}
```

Small floating div, absolutely positioned:
- Dark background: `bg-gray-800 border border-gray-600 rounded-lg shadow-xl`
- Each option row: icon + label + description
- Selected row: `bg-violet-700/30 text-violet-200`
- Max 5 visible options, scrollable if more
- `z-50` to float above everything

### Where to integrate:

**In `kling3-omni-panel.tsx`:**
1. Add `useRef` for each prompt textarea
2. Call `useMentionAutocomplete` with the right options based on mode:
   - V2V: `[{ label: '@Video1', description: 'Reference video', icon: '🎥' }]` (only if refVideo exists)
   - I2V/T2V: map `refImages` to `[{ label: '@Image1', ... }, { label: '@Image2', ... }]`
3. Spread `onKeyDown` and `onChange` onto the textarea (merge with existing onChange)
4. Render `<MentionDropdown>` next to each textarea

**In `left-panel.tsx` (Kling 3 section):**
1. Same pattern for the main prompt textarea and per-shot textareas
2. For now, pass empty options array (no elements UI yet) — the dropdown just won't show

## Feature 2: Wrap Image/Video Previews in Aspect Ratio Frames

Currently the video and image previews in the Omni panel use `aspect-video` (16:9) regardless of the selected output aspect ratio. They should reflect the selected aspect ratio setting.

### Changes in `kling3-omni-panel.tsx`:

1. Compute the CSS aspect ratio from the selected setting:
```typescript
const selectedAspect = (videoSettings as any).kling3OmniAspectRatio || '16:9';
const aspectClass = selectedAspect === '9:16' ? 'aspect-[9/16]'
  : selectedAspect === '1:1' ? 'aspect-square'
  : 'aspect-video'; // 16:9 and auto default to 16:9
```

2. Replace ALL hardcoded `aspect-video` classes on preview containers with `aspectClass`:
   - V2V reference video container (line ~201): `<video ... className="w-full aspect-video object-cover"` → use aspectClass
   - V2V start frame container
   - I2V start frame container  
   - I2V end frame container
   - The empty drop zone placeholders too

3. For the reference video `<video>` element, change from `object-cover` to `object-contain` with a dark background so the video doesn't get cropped — just letterboxed inside the aspect frame:
```
className={`w-full ${aspectClass} object-contain bg-black`}
```

4. Same for start/end frame `<img>` elements:
```
className={`w-full h-full object-contain bg-black`}
```
(parent div has the aspect ratio class)

### Changes in `left-panel.tsx` (Kling 3 section):

Same pattern — look for any preview containers with hardcoded `aspect-video` in the Kling 3 block (lines ~820-1180) and make them respect:
```typescript
const kling3Aspect = (videoSettings as any).kling3AspectRatio || '16:9';
const kling3AspectClass = kling3Aspect === '9:16' ? 'aspect-[9/16]'
  : kling3Aspect === '1:1' ? 'aspect-square'
  : 'aspect-video';
```

## Style Rules:
- Dropdown: dark theme, violet accent for selected item (consistent with Omni panel)
- Smooth transitions, no jank
- Don't break any existing textarea behavior (existing onChange handlers must still work)
- The mention autocomplete should work in both single-prompt and multi-shot textareas

## Testing:
After changes:
1. `npx vite build` — must succeed
2. Manual: type `@` in V2V prompt with a video uploaded → should show `@Video1` option
3. Manual: type `@` in I2V prompt with 2 reference images → should show `@Image1`, `@Image2`
4. Manual: change aspect ratio to 9:16 → previews should update to portrait frame
