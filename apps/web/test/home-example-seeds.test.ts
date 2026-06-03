import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { homeExampleSeedCategories } from "../src/lib/home-example-seeds";

describe("homeExampleSeedCategories", () => {
  it("uses three distinct static preview images for every example", () => {
    for (const category of homeExampleSeedCategories) {
      for (const example of category.examples) {
        expect(example.previewImages).toHaveLength(3);
        expect(new Set(example.previewImages).size).toBe(3);

        for (const image of example.previewImages) {
          expect(image).toMatch(
            /^\/images\/home-seeds\/generated\/.+\.(png|jpg|jpeg|webp)$/,
          );
          expect(
            existsSync(resolve(__dirname, `../public${image}`)),
          ).toBe(true);
        }
      }
    }
  });
});
