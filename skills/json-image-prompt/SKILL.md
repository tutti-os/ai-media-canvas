---
name: json-image-prompt
description: Use structured JSON prompts for AI image generation instead of free-form text. Produces more consistent, controllable, and high-quality results. Activate when the user asks to generate, create, or design images, illustrations, photos, posters, or any visual content via the generate_image tool.
license: Apache-2.0
metadata:
  author: ai-media-canvas
  version: "1.0"
---

# JSON Image Prompt Skill

When generating images, always decompose the user's request into a structured JSON prompt before calling `generate_image`. JSON prompts eliminate ambiguity, improve consistency, and give the AI model clearer instructions.

## Why JSON Over Free-Form Text

| Free-form | JSON |
|-----------|------|
| "A beautiful sunset over mountains with dramatic lighting" | Each attribute is a separate, unambiguous key-value pair |
| Model guesses what "beautiful" and "dramatic" mean | You define exactly: golden hour, rim lighting, warm tones |
| Hard to iterate — rewrite everything | Change one field, keep the rest |
| Inconsistent results across runs | Same structure = reproducible quality |

## JSON Prompt Schema

Always structure the prompt as a JSON object with these fields:

```json
{
  "subject": {
    "type": "what the subject is (person/object/scene)",
    "details": "key traits, pose, expression, material",
    "framing": "composition/framing (full body, bust, close-up, overhead)"
  },
  "environment": {
    "setting": "scene description",
    "time": "time of day or period",
    "weather": "weather or atmosphere"
  },
  "style": {
    "genre": "visual style (photorealistic/illustration/anime/oil-painting/3d-render/watercolor/flat-design)",
    "reference": "aesthetic reference (e.g. Studio Ghibli / Swiss design / Brutalist / Art Deco)",
    "color_palette": "color direction (warm/cool/monochrome/muted/vibrant + specific hex colors if available)"
  },
  "lighting": {
    "type": "light source type (natural/studio/neon/ambient/volumetric)",
    "direction": "light direction (front/back/side/top/rim)",
    "quality": "light quality (soft/harsh/diffused/dramatic/golden-hour)"
  },
  "camera": {
    "angle": "camera angle (eye-level/low-angle/high-angle/dutch-angle/overhead)",
    "lens": "lens (wide-angle/telephoto/macro/fisheye/tilt-shift)",
    "depth_of_field": "depth of field (shallow/deep/selective)"
  },
  "mood": "mood direction (1-3 keywords)",
  "negative": "elements to avoid (optional)"
}
```

## Workflow

### Step 1: Analyze User Intent

When the user says "Generate a futuristic product image", do not jump straight to a one-sentence prompt. Decompose it first:
- Subject: product (what product? what angle?)
- Style: futuristic -> minimalist, clean, futuristic
- Lighting: futuristic usually means studio and rim lighting
- Mood: professional, modern, premium

### Step 2: Build The JSON Prompt

```json
{
  "subject": {
    "type": "wireless earbuds",
    "details": "matte black finish, floating in air, slight rotation showing both sides",
    "framing": "centered product shot"
  },
  "environment": {
    "setting": "pure dark gradient background",
    "time": "N/A (studio)",
    "weather": "N/A"
  },
  "style": {
    "genre": "photorealistic product photography",
    "reference": "Apple product page aesthetic",
    "color_palette": "dark with selective blue and white accents"
  },
  "lighting": {
    "type": "studio",
    "direction": "rim lighting from behind, subtle fill from front",
    "quality": "dramatic, high contrast"
  },
  "camera": {
    "angle": "eye-level, slightly elevated",
    "lens": "macro, 100mm equivalent",
    "depth_of_field": "shallow, product in sharp focus"
  },
  "mood": "premium, futuristic, minimal",
  "negative": "text, watermark, human hands, cluttered background"
}
```

### Step 3: Convert To A Prompt String

Flatten the JSON into a structured prompt string and pass it to `generate_image`:

```
Product photography of wireless earbuds, matte black finish, floating in air with slight rotation showing both sides. Centered product shot. Pure dark gradient background. Photorealistic product photography, Apple product page aesthetic. Dark palette with selective blue and white accents. Studio rim lighting from behind with subtle fill from front, dramatic high contrast. Eye-level macro shot at 100mm, shallow depth of field with product in sharp focus. Premium, futuristic, minimal mood. --no text, watermark, human hands, cluttered background
```

**Rule: when converting JSON to prompt text, order by importance: subject > style > lighting > camera > environment > mood > negative.**

## Scene Templates

### Portrait Photography

```json
{
  "subject": {
    "type": "portrait of [person description]",
    "details": "[expression], [clothing], [pose]",
    "framing": "bust shot / headshot / full body"
  },
  "style": {
    "genre": "editorial photography",
    "color_palette": "warm skin tones, muted background"
  },
  "lighting": {
    "type": "natural",
    "direction": "side, Rembrandt lighting pattern",
    "quality": "soft, golden hour"
  },
  "camera": {
    "lens": "85mm portrait lens",
    "depth_of_field": "shallow, f/1.8"
  },
  "mood": "intimate, contemplative"
}
```

### Concept Illustration

```json
{
  "subject": {
    "type": "[concept or scene]",
    "details": "[key visual elements]",
    "framing": "wide establishing shot"
  },
  "style": {
    "genre": "digital illustration",
    "reference": "[art style reference]",
    "color_palette": "[specific palette or mood-based]"
  },
  "lighting": {
    "type": "volumetric / atmospheric",
    "quality": "cinematic"
  },
  "mood": "[2-3 emotion keywords]"
}
```

### Brand / Marketing Visual

```json
{
  "subject": {
    "type": "[product or brand element]",
    "details": "[brand-specific details]",
    "framing": "hero shot"
  },
  "style": {
    "genre": "commercial photography / 3d-render",
    "reference": "[brand aesthetic]",
    "color_palette": "[brand colors]"
  },
  "lighting": {
    "type": "studio, three-point",
    "quality": "clean, professional"
  },
  "mood": "aspirational, on-brand"
}
```

## Important Principles

1. **Before every image generation, build the JSON structure internally**, even if you do not show it to the user.
2. **Subject is always most important**. If the subject is unclear, other parameters cannot rescue the result.
3. **Less is more**. Use precise 2-5 word values for each field; do not write prose.
4. **The negative field matters**. Explicitly exclude unwanted elements such as text, watermarks, or distortions.
5. **Iterate surgically**. If the first result is not good, adjust only 1-2 fields instead of rewriting everything.
6. **Be specific with color**. "golden amber (#D4A574) with deep burgundy (#722F37) accents" is better than "warm tones".
7. **When a Brand Kit exists**, use `get_brand_kit` to fetch brand colors and fonts, then inject them into style.color_palette and subject.details.
