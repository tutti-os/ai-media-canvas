# AIMC Video Model Formats

Use this reference for model-specific prompt shape and current AIMC model ids.

## Current Model Families

| Family | AIMC model ids | Input modes | Notes |
|---|---|---|---|
| Google Veo | `google-official/veo-3.1-generate-preview`, `google-official/veo-3.1-fast-generate-preview`, `google-official/veo-3.1-lite-generate-preview`, `google-official/veo-3.0-generate-001`, `google-official/veo-3.0-fast-generate-001`, `google-official/veo-2.0-generate-001`, Vertex equivalents under `google-vertex/`, Replicate `google/veo-3`, `google/veo-3.1`, `google/veo-3.1-fast`, Kie `kie/veo-3.1` | text, image, keyframes/reference depending provider | 4-8s for Veo 3.x in AIMC; Veo 2 is silent and 720p. Good audio direction on Veo 3.x. |
| Seedance | `kie/seedance-2`, `bytedance/seedance-1.5-pro` | text, image, keyframes, reference | Strong reference mapping. Kie Seedance 2 supports 5/10/15s, audio, first/last frames, and up to 8 reference images in reference mode. |
| Kling | `kie/kling-2.6`, `kwaivgi/kling-v3-video`, `kwaivgi/kling-v3-omni-video`, `kwaivgi/kling-v2.6`, `kwaivgi/kling-o1` | text, image, video on O1/Omni | Strong motion/action. O1 is video-to-video editing only. |
| Sora | `openai/sora-2`, `openai/sora-2-pro` | text, image | Keep prompts concise, with cinematography/actions/dialogue separated when helpful. |
| Wan | `wan-video/wan-2.6` | text, image | Use subject + scene + motion + aesthetic control. |
| Hailuo | `kie/hailuo`, `minimax/hailuo-2.3` | text, keyframes/image | Good compact cinematic prompts; Hailuo in AIMC has no native audio flag. |
| Runway | `kie/runway` | text, image | 5/10s; 10s at 1080p is not supported in AIMC. |
| Agnes | `agnes-video/agnes-video-v2.0` | text, image, multivideo, keyframes | Supports 4/5/6/8/10/15/16s, negative prompt, seed, frame controls, 480p/720p/1080p. |
| Other Kie | `kie/grok-imagine`, `kie/happyhorse-1` | text, image/reference | Keep short. Grok is 6s/480p; HappyHorse is 5s. |

## Format Patterns

### Seedance / Agnes Reference Prompt

Use this shape when references matter:

```text
Reference mapping: Image 1 is the first frame; Image 2 is the final frame; Images 3-4 define character/product details; Video 1 defines camera rhythm.
Scene: ...
Action beats: ...
Camera: ...
Style and lighting: ...
Audio: ...
Final frame: ...
```

For Seedance-style external prompts, `@Image1`, `@Video1`, and `@Audio1` labels are acceptable. For AIMC `generate_video`, use natural labels such as `Image 1` because images are passed separately through `inputImages`.

### Veo Prompt

```text
<Cinematography>. <Subject> <action> in <context>. <Style/lighting>. Audio: <dialogue/SFX/ambient>.
```

Keep exact spoken lines in quotes. If using keyframes, say how the shot moves from the first image to the last image.

### Sora Prompt

```text
<Scene prose with camera/framing and visual details.>

Cinematography: <shot, lens, mood>
Actions:
- <beat 1>
- <beat 2>
Dialogue:
- <character>: "<short line>"
```

Use this multiline form only when it improves clarity; otherwise return one clean paragraph.

### Kling Prompt

```text
<Cinematic shot type>, <subject> performs <clear action sequence>. Camera <tracks/orbits/pushes>. Lighting <specific look>. Audio/SFX <if enabled>. Preserve <identity/product/environment> from the input image/video.
```

For video-to-video editing, state what stays unchanged and what changes.

### Wan / Hailuo / Runway / Grok / HappyHorse Prompt

```text
<Subject with key details> in <scene>. <Motion/action>. Camera <simple move>. <Lighting/style>. <Optional ambience/SFX if supported>.
```

Avoid multi-shot overload on short or low-control models.

## External Parameter Defaults

- Aspect ratio: default to `16:9`; use `9:16` for social/mobile unless user says otherwise.
- Resolution: default to `720p`; use `1080p` when model supports it and cost/speed are acceptable.
- Audio: pass `enableAudio: true` only for models with audio support and when the prompt includes audio value.
- Negative prompt: use only when the selected model supports it, mainly Agnes.
- Seed: use only when repeatability matters and the model supports it.
