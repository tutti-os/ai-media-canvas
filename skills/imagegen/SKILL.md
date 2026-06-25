---
name: imagegen
description: Generate or edit raster images in AI Media Canvas when the task benefits from AI-created bitmap visuals such as photos, illustrations, textures, sprites, mockups, ads, storyboards, UI mockups, product images, or cutout-style assets. Use when the assistant should create a brand-new image, transform an existing image, derive visual variants from references, or prepare a production-ready prompt for the generate_image tool. Do not use when the task is better handled by editing existing SVG/vector/code-native assets, extending an established icon or logo system, or building the visual directly in HTML/CSS/canvas.
license: Apache-2.0
metadata:
  author: ai-media-canvas
  version: "1.0"
  adapted-from: imagegen
---

# Image Generation Skill

Generate or edit images for the current AI Media Canvas project, including website assets, game assets, UI mockups, product mockups, wireframes, logo explorations, photorealistic images, infographics, and storyboard frames.

This is an AIMC workspace skill. Use the app's canonical `generate_image` tool and the normal canvas/media workflow. Do not introduce a second image-generation path from this skill.

## Top-Level Mode And Rules

This skill has one execution mode:

- **AIMC image generation mode:** use `generate_image` for normal image generation, image editing, visual variants, and simple cutout-style requests.

Rules:

- Use `generate_image` by default for all raster image generation and editing requests.
- Do not introduce provider-specific tools, external generation workflows, API keys, model-private paths, or machine-local generation directories from this skill.
- The word `batch` by itself means multiple `generate_image` calls or multiple structured prompts, not a separate generation pipeline.
- For many distinct assets, produce one prompt per asset. Do not treat a variant count as a substitute for distinct asset prompts.
- For variants of one idea, keep the core prompt stable and vary one or two fields intentionally.
- For project-bound or canvas-bound work, rely on the app's returned artifact and canvas insertion flow. Do not claim that an asset is saved somewhere unless the tool result provides that location.
- Do not overwrite or replace existing visual assets unless the user explicitly asks for replacement.

Shared prompt guidance lives in:

- `references/prompting.md`
- `references/sample-prompts.md`

## When To Use

- Generate a new image: concept art, product shot, cover, website hero, poster, illustration, storyboard frame, UI mockup, or infographic.
- Generate a new image using one or more reference images for style, composition, mood, product identity, or character consistency.
- Edit an existing image: inpainting, background replacement, object removal, lighting/weather transformation, compositing, text replacement, or cutout-style isolation.
- Produce many assets or variants for one task.
- Turn a vague visual idea into a structured, production-ready prompt before generation.

## When Not To Use

- Extending or matching an existing SVG/vector icon set, logo system, or illustration library inside the repo.
- Creating simple shapes, diagrams, wireframes, or icons that are better produced directly in SVG, HTML/CSS, Python canvas, or the app canvas.
- Making a small project-local asset edit when the source file already exists in an editable native format.
- Any task where the user clearly wants deterministic code-native output instead of a generated bitmap.

## Decision Tree

Think about two separate questions:

1. **Intent:** is this a new image or an edit of an existing image?
2. **Execution strategy:** is this one asset, many distinct assets, or variants of one asset?

Intent:

- If the user wants to modify an existing image while preserving parts of it, treat the request as **edit**.
- If the user provides images only as references for style, composition, mood, identity, or subject guidance, treat the request as **generate with references**.
- If the user provides no images, treat the request as **generate**.
- If the user asks for a layered canvas arrangement rather than a finished bitmap, use canvas/layout tools instead of this skill.

Edit semantics:

- For edits, identify the edit target explicitly.
- If multiple images are present, label each image role before generating:
  - edit target
  - reference image
  - supporting insert/style/compositing input
- Preserve invariants aggressively: state what must remain unchanged every time you generate or iterate.
- If the edit target is only a local file path and not visible/available to the image tool, ask the user to attach it or use the app flow that makes it available.
- Save or update non-destructively by default unless the user asks to replace the original.

Execution strategy:

- For one asset, create one strong prompt.
- For many distinct assets, create one prompt per asset with a consistent naming/title pattern.
- For variants, reuse the same structured prompt and change a clearly named field such as palette, camera angle, composition, or mood.
- For storyboards, keep character, setting, aspect ratio, and visual language consistent across frames while changing only the frame-specific action.

Assume the user wants a new image unless they clearly ask to change an existing one.

## Workflow

1. Decide the intent: `generate`, `edit`, `generate with references`, `compositing`, `batch`, or `variants`.
2. Decide whether the output is preview-only, canvas-bound, or project-bound.
3. Collect inputs up front: prompt(s), exact text, constraints, avoid list, aspect ratio, image roles, and any consistency requirements.
4. For every input image, label its role explicitly.
5. If the user asked for a photo, illustration, sprite, product image, banner, or other explicitly raster-style asset, use `generate_image` rather than substituting SVG/HTML/CSS placeholders.
6. If the request is for an icon, logo, or UI graphic that should match existing repo-native SVG/vector/code assets, prefer editing those directly instead.
7. Augment the prompt based on specificity:
   - If the user's prompt is already specific and detailed, normalize it into a clear spec without adding creative requirements.
   - If the user's prompt is generic, add tasteful augmentation only when it materially improves output quality.
8. Build the prompt using the shared prompt schema below.
9. Call `generate_image` with a descriptive title and the final prompt.
10. Inspect outputs when possible and validate subject, style, composition, text accuracy, and invariants/avoid items.
11. Iterate with a single targeted change, then re-check.
12. For preview-only work, show the image/artifact result and summarize the prompt.
13. For canvas-bound work, ensure the final result is present in the canvas flow if the tool supports insertion.
14. For batches or multi-asset requests, persist every requested deliverable through the app's normal result flow unless the user explicitly asked to keep outputs preview-only.
15. Always report the final prompt or prompt set used, and mention any limitations such as generated text reliability or cutout-vs-true-transparency uncertainty.

## Transparent And Cutout-Style Requests

Transparent-image requests still start with `generate_image`.

Default sequence:

1. If the selected image model/provider supports true transparent output, request a transparent PNG.
2. If true transparency is not available or uncertain, generate the requested subject on a perfectly flat solid chroma-key background.
3. Choose a key color that is unlikely to appear in the subject: default `#00ff00`, use `#ff00ff` for green subjects, and avoid colors already present in the subject.
4. Require crisp edges, generous padding, and no shadows, gradients, floor plane, reflections, background texture, or lighting variation.
5. Validate whether the result is truly transparent or merely cutout-friendly. Tell the user which one it is.
6. Ask before attempting a complex transparent result when the subject has hair, fur, feathers, smoke, glass, liquids, translucent materials, reflective objects, soft shadows, or colors that conflict with practical key colors.

Prompt transparent or cutout-friendly requests like this:

```text
Create the requested subject on a perfectly flat solid #00ff00 chroma-key background for background removal.
The background must be one uniform color with no shadows, gradients, texture, reflections, floor plane, or lighting variation.
Keep the subject fully separated from the background with crisp edges and generous padding.
Do not use #00ff00 anywhere in the subject.
No cast shadow, no contact shadow, no reflection, no watermark, and no text unless explicitly requested.
```

Use this more structured form when helpful:

```text
Use case: background-extraction
Asset type: isolated cutout asset
Primary request: <subject>
Scene/backdrop: perfectly flat solid <key color> background for background removal
Composition/framing: full subject visible, centered, generous padding, crisp edges
Constraints: no cast shadow, no contact shadow, no reflection, no watermark, no text unless explicitly requested, do not use <key color> in the subject
```

## Prompt Augmentation

Reformat user prompts into a structured, production-oriented spec. Make the user's goal clearer and more actionable, but do not blindly add detail.

Treat this as prompt-shaping guidance, not a closed schema. Use only the lines that help, and add a short extra labeled line when it materially improves clarity.

### Specificity Policy

Use the user's prompt specificity to decide how much augmentation is appropriate:

- If the prompt is already specific and detailed, preserve that specificity and only normalize/structure it.
- If the prompt is generic, add tasteful detail only when it materially improves the result.

Allowed augmentations:

- composition or framing hints
- polish level or intended-use hints
- practical layout guidance
- reasonable scene concreteness that supports the stated request

Not allowed augmentations:

- extra characters or objects that are not implied by the request
- brand names, slogans, palettes, or narrative beats that are not implied
- arbitrary side-specific placement unless the surrounding layout supports it

## Use-Case Taxonomy

Classify each request into one of these buckets and keep the slug consistent across prompts and references.

Generate:

- `photorealistic-natural`: candid/editorial lifestyle scenes with real texture and natural lighting.
- `product-mockup`: product/packaging shots, catalog imagery, merch concepts.
- `ui-mockup`: app/web interface mockups and wireframes; specify the desired fidelity.
- `infographic-diagram`: diagrams/infographics with structured layout and text.
- `scientific-educational`: classroom explainers, scientific diagrams, and learning visuals with required labels and accuracy constraints.
- `ads-marketing`: campaign concepts and ad creatives with audience, brand position, scene, and exact tagline/copy.
- `productivity-visual`: slide, chart, workflow, and data-heavy business visuals.
- `logo-brand`: logo/mark exploration, vector-friendly.
- `illustration-story`: comics, children's book art, narrative scenes.
- `stylized-concept`: style-driven concept art, 3D/stylized renders.
- `historical-scene`: period-accurate/world-knowledge scenes.

Edit:

- `text-localization`: translate/replace in-image text, preserve layout.
- `identity-preserve`: try-on, person-in-scene, character consistency; lock face/body/pose/identity.
- `precise-object-edit`: remove/replace a specific element, including interior swaps.
- `lighting-weather`: time-of-day, season, weather, or atmosphere changes only.
- `background-extraction`: transparent background or clean cutout.
- `style-transfer`: apply reference style while changing subject/scene.
- `compositing`: multi-image insert/merge with matched lighting/perspective.
- `sketch-to-render`: drawing/line art to polished render.

## Shared Prompt Schema

Use the following labeled spec as prompt scaffolding:

```text
Use case: <taxonomy slug>
Asset type: <where the asset will be used>
Primary request: <user's main prompt>
Input images: <Image 1: role; Image 2: role> (optional)
Scene/backdrop: <environment>
Subject: <main subject>
Style/medium: <photo/illustration/3D/etc>
Composition/framing: <wide/close/top-down; placement>
Lighting/mood: <lighting + mood>
Color palette: <palette notes>
Materials/textures: <surface details>
Text (verbatim): "<exact text>"
Constraints: <must keep/must avoid>
Avoid: <negative constraints>
```

Notes:

- `Asset type` and `Input images` are prompt scaffolding, not tool arguments.
- `Scene/backdrop` refers to the visual setting or generated background.
- Provider-specific execution controls belong to the app/model configuration, not to this skill.
- Keep it short.
- Add only the details needed to improve the prompt materially.
- For edits, explicitly list invariants: `change only X; keep Y unchanged`.
- If any critical detail is missing and blocks success, ask a question; otherwise proceed.

## Examples

Generation example:

```text
Use case: product-mockup
Asset type: landing page hero
Primary request: a minimal hero image of a ceramic coffee mug
Style/medium: clean product photography
Composition/framing: wide composition with usable negative space for page copy if needed
Lighting/mood: soft studio lighting
Constraints: no logos, no text, no watermark
```

Edit example:

```text
Use case: precise-object-edit
Asset type: product photo background replacement
Input images: Image 1: edit target
Primary request: replace only the background with a warm sunset gradient
Constraints: change only the background; keep the product and its edges unchanged; no text; no watermark
```

Storyboard example:

```text
Use case: illustration-story
Asset type: storyboard frame
Primary request: Frame 1 of 6, an original character entering a rain-soaked rooftop chase
Style/medium: cinematic comic illustration
Composition/framing: wide establishing shot, readable silhouette, room for caption at top
Constraints: keep the character design consistent across frames; no watermark
```

## Prompting Best Practices

- Structure prompt as scene/backdrop -> subject -> details -> constraints.
- Include intended use: ad, UI mockup, infographic, hero image, product card, storyboard frame, sprite, or poster.
- Use camera/composition language for photorealism.
- Only use SVG/vector stand-ins when the user explicitly asked for vector output or a non-image placeholder.
- Quote exact text and specify typography plus placement.
- For tricky words, spell them letter by letter and require verbatim rendering.
- For multi-image inputs, reference images by role and describe how each should be used.
- For edits, repeat invariants every iteration to reduce drift.
- Iterate with single-change follow-ups.
- If the prompt is generic, add only the extra detail that will materially help.
- If the prompt is already detailed, normalize it instead of expanding it.
- For transparent images, use true transparency when available; otherwise use the chroma-key cutout prompt and tell the user the result is cutout-friendly.

## Reference Map

- `references/prompting.md`: detailed prompting principles, specificity policy, text/image-reference handling, iteration, and use-case tips.
- `references/sample-prompts.md`: copy/paste prompt recipes for common generation and edit cases.
