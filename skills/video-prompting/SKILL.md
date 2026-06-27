---
name: video-prompting
description: Draft, refine, or use model-ready prompts for AI Media Canvas video generation. Use when the user asks for video prompts, prompt optimization, storyboard-to-video prompts, image-to-video motion prompts, keyframe/reference-image prompts, or finished video generation with supported models such as Seedance, Veo, Kling, Sora, Wan, Hailuo, Runway, Agnes, Grok Imagine, or HappyHorse.
---

# Video Prompting

Create production-ready prompts for AIMC's `generate_video` tool or for users to paste into external video models. This is a prompt-director skill, not a separate provider or API path.

## Workflow

1. Identify the target model family from the user's words or selected model id. If absent, default finished AIMC generation to `google-official/veo-3.1-generate-preview`; default prompt-only drafting to a generic cinematic prompt and mention the best-fit model family only if useful.
2. Identify input mode: `text`, `image`, `keyframes`, `reference`, `multivideo`, or `video`. For image/video inputs, label each asset role before drafting.
3. Read `references/model-formats.md` when model-specific constraints, aliases, or format details matter.
4. Draft the prompt around visible action: subject, setting, motion beats, camera, lighting/style, and audio.
5. Keep generation controls outside the prompt unless the model style benefits from time beats. Return or call with separate parameters: `model`, `duration`, `resolution`, `aspectRatio`, `videoMode`, `inputImages`, `inputVideo`, `enableAudio`, `negativePrompt`, `seed`.

## Default Output

For prompt-only requests, output:

```text
Prompt:
<final prompt>

Recommended parameters:
model: <model id or family>
duration: <seconds, if known>
aspectRatio: <16:9 or 9:16, if known>
resolution: <720p/1080p/4k, if known>
videoMode: <image/keyframes/reference/multivideo/video, if relevant>
enableAudio: <true/false, if relevant>
```

For finished video requests inside AIMC, draft first, then call `generate_video` with the final prompt and matching parameters.

## Prompt Rules

- Prefer one clear camera move and one clear action arc for clips under 8 seconds.
- For 10-15 second clips, use 2-4 beats or short shot labels.
- Treat image-to-video images as anchors; focus the prompt on motion, camera, performance, and audio instead of redescribing the image.
- Map every reference image/video/audio to a job: first frame, last frame, character, product, scene, camera, motion, rhythm, style, or sound.
- Use concrete physical details: fabric movement, reflections, footsteps, splashes, hand motion, object weight, facial performance, lighting changes.
- Put dialogue in exact quotes and keep it short.
- Do not put model ids, API parameter names, resolution, or aspect ratio inside the prompt text. Put those in Recommended parameters or tool args.
- If using a real-person reference with Sora/Veo/Kling-style identity workflows, warn that authorization or likeness approval may be required.

## Model Routing

- **Seedance / Agnes:** best for reference-heavy prompts, first/last frames, multi-image character/product consistency, music rhythm, short drama, e-commerce, and audio-aware scenes. Use explicit reference mapping and optional time beats.
- **Veo:** best for cinematic realism, native audio, ambience, dialogue, and controlled camera language. Use `[cinematography] + [subject] + [action] + [context] + [style/audio]`.
- **Kling:** best for dynamic cinematic motion, action, lip-sync/audio variants, and video-to-video editing on supported models. Keep motion readable and action-driven.
- **Sora:** best for concise cinematography, strong shot direction, dialogue/SFX separation, and image-anchored motion.
- **Wan / Hailuo / Runway / Grok / HappyHorse:** use compact subject-scene-motion prompts, one coherent shot, and conservative action complexity.

## AIMC Tool Notes

- Use `inputImages` for image anchors and reference images. The first image is usually the first frame unless `videoMode` says otherwise.
- Use `videoMode: "keyframes"` for first/last-frame control.
- Use `videoMode: "reference"` when images guide subject/style without serving as strict keyframes.
- Use `videoMode: "multivideo"` for Agnes multi-image blending/storyboard-like input.
- Use `inputVideo` only for models that support video-to-video editing, currently Kling O1 / Kling Omni families through available providers.
- For Agnes, keep `numFrames` as `8n + 1` if explicitly set.

## Quality Check

Before returning or generating, verify:

- The prompt describes motion, not just a still image.
- Asset roles are explicit.
- Prompt complexity fits duration.
- Audio instructions match whether the model supports audio.
- External parameters match the selected model's allowed durations, input modes, image limits, and resolutions.
