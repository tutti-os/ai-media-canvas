import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import homeEn from "../src/i18n/locales/en/home.json";
import homeZhCN from "../src/i18n/locales/zh-CN/home.json";
import { homeExampleSeedCategories } from "../src/lib/home-example-seeds";

const noImageMissingContextPatterns = [
  /这个创意|这个产品概念|这张自拍|这个咖啡品牌|一个动作创意/u,
  /\bthis (idea|concept|selfie|product concept|coffee brand)\b/i,
  /\ban action concept\b/i,
];

function getLocalizedPrompts(exampleId: string) {
  const zhCases = homeZhCN.examples.cases as Record<
    string,
    { prompt?: string }
  >;
  const enCases = homeEn.examples.cases as Record<string, { prompt?: string }>;

  return [zhCases[exampleId]?.prompt, enCases[exampleId]?.prompt].filter(
    (prompt): prompt is string => typeof prompt === "string",
  );
}

describe("homeExampleSeedCategories", () => {
  it("starts with theme-based creative categories instead of model names", () => {
    expect(
      homeExampleSeedCategories.slice(0, 3).map((category) => category.label),
    ).toEqual(["Visual Concepts", "Illustration", "Design"]);

    expect(
      homeExampleSeedCategories.map((category) => category.label),
    ).not.toContain("Nano Banana Pro");
  });

  it("uses three distinct static preview images for every example", () => {
    for (const category of homeExampleSeedCategories) {
      for (const example of category.examples) {
        expect(example.previewImages).toHaveLength(3);
        expect(new Set(example.previewImages).size).toBe(3);

        for (const image of example.previewImages) {
          expect(image).toMatch(
            /^\/images\/home-seeds\/generated\/.+\.(png|jpg|jpeg|webp)$/,
          );
          expect(existsSync(resolve(__dirname, `../public${image}`))).toBe(
            true,
          );
        }
      }
    }
  });

  it("keeps no-image example prompts self-contained", () => {
    for (const category of homeExampleSeedCategories) {
      for (const example of category.examples) {
        const hasImageInput = example.inputItems.some(
          (item) => item.type === "image",
        );
        if (hasImageInput) continue;

        const prompts = [example.prompt, ...getLocalizedPrompts(example.id)];
        for (const prompt of prompts) {
          for (const pattern of noImageMissingContextPatterns) {
            expect(prompt).not.toMatch(pattern);
          }
        }
      }
    }
  });
});
