# Kling AI 2.6 — Complete Prompt Guide

> Kling AI 2.6 is extremely prompt-sensitive. Writing the right kind of prompt yields consistent good visuals, clean lip-sync, and believable sound.

## 1. What is a Kling AI 2.6 Prompt?

The full set of instructions for a clip:
- **Scene** (place, time, style)
- **Characters / Objects**
- **Camera Movement**
- **Audio** (dialogue, ambience, SFX, music)

Kling 2.6 creates up to **10 seconds** of **1080p video** with native audio in one pass from text or image+text.

## 2. How Kling 2.6 Uses Your Prompt

| Component | Description |
|-----------|-------------|
| **Input mode** | Text-to-video or Image-to-video (+ multi-image guidance) |
| **Visual description** | What's on screen, camera movement, style |
| **Audio description** | Who speaks, exact dialogue, ambience, SFX |
| **Settings** | Duration (5s/10s), Resolution (768p/1080p) |

**Good prompt = visual layer + audio layer + clear settings.**

## 3. Best Prompt Structure (Reusable Template)

```
Scene: [location, time, style].
Characters / objects: [who or what is visible].
Action: [what happens during the 5–10 seconds].
Camera: [shot type + movement].
Audio – dialogue / narration: [who speaks + exact line(s) + tone + speed].
Audio – ambience & SFX: [background sounds + key sound effects].
Music (optional): [genre + energy + volume].
Avoid: [anything you don't want – text, logos, heavy distortions, etc.]
```

## 4. Prompt Examples

### 4.1 Text-to-Video: Product Ad

```
Scene: Bright white studio, soft daylight, minimal background.
Characters / objects: A young woman holding a sleek skincare bottle.
Action: She lifts the bottle to camera, smiles, and turns slightly as the light catches the product.
Camera: Slow push-in from medium shot to close-up of the bottle and her face.
Audio – narration: Warm female narrator says, "Meet LumiGlow – skincare that makes every day a good-skin day." Calm, confident tone, medium pace.
Audio – ambience & SFX: Subtle studio room tone, soft cloth movement, tiny glass clink when she sets the bottle down.
Music: Gentle electronic ambient track, low volume, uplifting mood.
Avoid: No text on screen, no visible logos other than the plain bottle design, no flickering or glitches.
```

### 4.2 Image-to-Video: Animate a Portrait with Dialogue

Upload: a portrait of a young man in a cozy bedroom.

```
Scene: Nighttime, warm bedroom lighting, shallow depth of field.
Characters / objects: The young man sits on the edge of his bed, looking at the camera.
Action: He smiles slightly, then speaks calmly to the viewer.
Camera: Static medium shot, subtle breathing motion and head movement.
Audio – dialogue: Male voice, soft and friendly, American English accent: "This entire video was created with AI – even my voice. Crazy, right?" Natural pacing, tiny pause before "Crazy, right?".
Audio – ambience & SFX: Quiet room ambience, distant city hum outside the window.
Music: Very soft lo-fi beat in the background, almost inaudible.
Avoid: No camera shake, no extreme facial distortions, no subtitles.
```

### 4.3 Audio-First: ASMR / Sound-Effects Scene

```
Scene: Close-up of hands opening a cardboard box on a wooden desk, soft side lighting.
Characters / objects: Only hands and the box; background out of focus.
Action: Slowly slice the tape, open flaps, remove tissue paper.
Camera: Locked overhead shot, tiny camera drift for realism.
Audio – narration: No voice.
Audio – ambience & SFX: Focus on extremely detailed ASMR sounds – tape peeling, cardboard rubbing, tissue crinkling, fingernail taps. Very quiet room tone.
Music: None.
Avoid: No talking, no extra sound effects, no background music.
```

### 4.4 Story Prompt: Short Emotional Scene

```
Scene: Rainy city street at night, neon reflections on wet pavement, cinematic style.
Characters / objects: Two friends standing under a single umbrella, facing each other.
Action: One friend laughs, then says a short line; the other smiles and nods.
Camera: Slow circular move around them from waist-up, ending on a close-up of both faces.
Audio – dialogue:
– Friend A, playful, female voice: "We were supposed to go home hours ago."
– Friend B, relaxed male voice: "Yeah… but this is better."
Audio – ambience & SFX: Soft rain, distant cars driving through puddles, occasional city hum.
Music: Emotional but gentle piano theme, low volume.
Avoid: No extreme facial warping, no text overlays, no jump cuts.
```

## 5. Prompting Tips Specific to Kling 2.6

### 5.1 Keep the script short
- Only 5–10 seconds available. Long monologues get truncated/rushed.
- **1–2 short sentences max.** Add pauses with punctuation for dramatic timing.

### 5.2 Always tell it who is talking
Kling 2.6 supports multi-speaker dialogue. Label speakers:
- `"Narrator (calm female voice): …"`
- `"Character A (excited): …"`
- `"Customer (nervous): …"`
Improves semantic alignment AND lip-sync.

### 5.3 Use clear audio anchors
Instead of vague "ambient noise" or "music":
- `"soft café ambience with low crowd chatter"`
- `"gentle ocean waves and distant seagulls"`
- `"modern pop beat, low volume, no vocals"`
Audio engine matches sound type + emotion with visuals via these anchors.

### 5.4 Use images when you need strict visual control
- **Text-only** → care more about story/camera than exact faces
- **Image + text** → protect specific product, logo-free bottle, or character identity

### 5.5 One main idea per prompt
- Avoid "Scene 1 → Scene 2 → Scene 3" in one prompt
- **One location, one main action, one emotional beat**
- Generate multiple clips and edit together for longer stories

## 6. Troubleshooting

| Problem | Why | Fix |
|---------|-----|-----|
| Lip-sync slightly off | Dialogue too long/vague | Shorten to 1–2 sentences; specify tone & speed |
| Audio doesn't match scene | Prompt only described visuals | Add clear audio section with ambience, SFX, music |
| Character keeps changing | Model improvises appearance | Use image-to-video + strong visual description; avoid mixing styles |
| Clip feels "too busy" | Too many ideas in 10 seconds | One setting, one action, one emotional beat |

## 7. Quick Reusable Templates

### Ad Hook
```
Bright studio, [product] in close-up, slow camera push-in.
Narrator, friendly female voice: "[One clear benefit in one sentence]."
Soft ambient music, subtle whoosh SFX on product reveal, no on-screen text.
```

### Talking Avatar
```
Medium shot of [character] in [location]. They look into the camera and speak calmly.
Voice: [male/female, accent, tone] says, "[short script]."
Clean room tone, no music, natural lip-sync.
```

### Scenery + Music
```
Cinematic wide shot of [location] at [time of day], slow drone-style camera move.
No dialogue.
Detailed ambient sound (wind, distant city/sea/birds) plus gentle [music style] at low volume.
```

### ASMR / SFX
```
Close-up of hands interacting with [object] on a wooden table, soft lighting.
No dialogue, no music.
Hyper-detailed sounds of [list of specific SFX], quiet background.
```

## 8. Advanced Techniques

### Image + Text for Stricter Control
- Start from a reference image
- Describe only **motion + audio** (don't re-describe appearance)
- Preserves identity and layout

### Break Stories into Multiple Prompts
- One ~10s clip per prompt → generate → edit together
- Professional results from systematic iteration, not cramming a film into one prompt

### Exploit Audio Types
- `"singing"` or `"rap verse"` for performance delivery
- `"news anchor tone"` for broadcasts
- `"ASMR style, very close-mic'd"` for detailed SFX scenes

## Core Principle

**Balance**: Enough detail so the model knows what to draw and how to sound, but short and focused enough to fit into 5–10 seconds of clean, synchronized audio-visual output.
