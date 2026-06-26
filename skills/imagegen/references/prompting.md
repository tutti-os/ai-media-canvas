# Prompting Best Practices

These prompting principles are shared across `generate_image` use in AI Media Canvas. This file is about prompt structure, specificity, iteration, image roles, and asset-type choices.

## Contents

- [Structure](#structure)
- [Specificity Policy](#specificity-policy)
- [Allowed And Disallowed Augmentation](#allowed-and-disallowed-augmentation)
- [Composition And Layout](#composition-and-layout)
- [Constraints And Invariants](#constraints-and-invariants)
- [Text In Images](#text-in-images)
- [Input Images And References](#input-images-and-references)
- [Iterate Deliberately](#iterate-deliberately)
- [Transparent Images](#transparent-images)
- [Use-Case Tips](#use-case-tips)
- [Where To Find Copy/Paste Recipes](#where-to-find-copypaste-recipes)

## Structure

- Use a consistent order: scene/backdrop -> subject -> key details -> constraints -> output intent.
- Include intended use such as ad, UI mock, hero image, storyboard frame, product card, or infographic to set the level of polish.
- For complex requests, use short labeled lines instead of one long paragraph.

## Specificity Policy

- If the user prompt is already specific and detailed, normalize it into a clean spec without adding creative requirements.
- If the prompt is generic, add tasteful detail only when it materially improves the output.
- Treat examples in `sample-prompts.md` as fully authored recipes, not as permission to invent that much detail for every request.
- For photorealism, include `photorealistic` directly when that is the goal, plus concrete real-world texture such as pores, wrinkles, fabric wear, material grain, or imperfect everyday detail.

## Allowed And Disallowed Augmentation

Allowed augmentation for generic prompts:

- composition and framing cues
- intended-use or polish-level hints
- practical layout guidance
- reasonable scene concreteness that supports the request

Do not add:

- extra characters, props, or objects that are not implied
- brand palettes, slogans, or story beats that are not implied
- arbitrary side-specific placement unless the surrounding layout supports it

## Composition And Layout

- Specify framing and viewpoint such as close-up, wide, top-down, eye-level, or low-angle when it materially helps.
- Call out negative space if the asset clearly needs room for UI or copy.
- Avoid making left/right layout decisions unless the user or surrounding layout supports them.
- For people, describe body framing, scale, gaze, and object interactions when they matter: `full body visible`, `looking down at the book`, `hands naturally gripping the handlebars`.

## Constraints And Invariants

- State what must not change: `keep background unchanged`, `preserve camera angle`, `preserve product edges`.
- For edits, say `change only X; keep Y unchanged` and repeat invariants on every iteration to reduce drift.
- For compositing, specify lighting, scale, perspective, and shadows.

## Text In Images

- Put literal text in quotes or all caps and specify typography, size, color, and placement.
- Spell uncommon words letter by letter if accuracy matters.
- For in-image copy, require verbatim rendering and no extra characters.
- Keep in-image text short. Dense labels, legends, axes, and footnotes are more failure-prone than short titles or badges.

## Input Images And References

- Do not assume that every provided image is an edit target.
- Label each image by role: `Image 1: edit target`, `Image 2: style reference`, `Image 3: object to insert`.
- If the user provides images for style, composition, or mood guidance and does not ask to modify them, treat the request as generation with references.
- If the user asks to preserve an existing image while changing specific parts, treat the request as an edit.
- For compositing, describe how the images interact: `place the subject from Image 2 into Image 1`.

## Iterate Deliberately

- Start with a clean base prompt, then make small single-change edits.
- Re-specify critical constraints when you iterate.
- Prefer one targeted follow-up at a time over rewriting the whole prompt.

## Transparent Images

- Use `generate_image` first for transparent-image or cutout-style requests.
- If the chosen model/provider supports true transparency, request a transparent PNG.
- If true transparency is not available or uncertain, prompt for a perfectly flat solid chroma-key background, usually `#00ff00`; use `#ff00ff` when the subject is green, and avoid key colors that appear in the subject.
- Explicitly prohibit shadows, gradients, floor planes, reflections, texture, and lighting variation in the background.
- Ask for crisp edges, generous padding, and no use of the key color inside the subject.
- Tell the user when the output is only cutout-friendly rather than truly transparent.
- Ask before attempting complex transparent subjects such as hair, fur, glass, smoke, liquids, translucent materials, reflective objects, or soft shadows.

## Use-Case Tips

Generate:

- `photorealistic-natural`: prompt as if a real photo is captured in the moment; use photography language, real texture, and natural lighting.
- `product-mockup`: describe product/packaging and materials; ensure clean silhouette and label clarity; require verbatim text when labels matter.
- `ui-mockup`: describe fidelity first, then focus on layout, hierarchy, and practical UI elements; avoid concept-art language.
- `infographic-diagram`: define audience and layout flow; label parts explicitly; require verbatim text.
- `logo-brand`: keep it simple and scalable; ask for a strong silhouette and balanced negative space.
- `ads-marketing`: write like a creative brief; include positioning, audience, desired vibe, scene, and exact tagline if text must appear.
- `productivity-visual`: name the exact artifact, define canvas and hierarchy, provide real labels/data, and ask for readable typography and polished spacing.
- `scientific-educational`: define audience, lesson objective, required labels, scientific constraints, arrows, and scan-friendly whitespace.
- `illustration-story`: define panels or scene beats; keep each action concrete.
- `stylized-concept`: specify style cues, material finish, and rendering approach without inventing new story elements.
- `historical-scene`: state location/date and required period accuracy; constrain clothing, props, and environment to match the era.

Edit:

- `text-localization`: change only the text; preserve layout, typography, spacing, and hierarchy; no extra words or reflow unless needed.
- `identity-preserve`: lock identity, face, body, pose, hair, expression, and character/product design; change only the specified elements.
- `precise-object-edit`: specify exactly what to remove or replace; preserve surrounding texture and lighting.
- `lighting-weather`: change only environmental conditions; keep geometry, framing, and identity.
- `background-extraction`: request a clean subject on a perfectly flat chroma-key background; crisp silhouette; generous padding; no shadows or halos.
- `style-transfer`: specify style cues to preserve and what must change; add `no extra elements` to prevent drift.
- `compositing`: reference inputs by role; specify what moves where; match lighting, perspective, and scale.
- `sketch-to-render`: preserve layout, proportions, and perspective; choose materials and lighting that support the supplied sketch without adding new elements.

## Where To Find Copy/Paste Recipes

For copy/paste prompt specs, see `references/sample-prompts.md`. This file focuses on principles, specificity, and iteration patterns.
