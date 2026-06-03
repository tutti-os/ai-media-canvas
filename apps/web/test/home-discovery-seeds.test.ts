import { describe, expect, it } from "vitest";

import { homeDiscoverySeedCategories } from "../src/lib/home-discovery-seeds";

describe("homeDiscoverySeedCategories", () => {
  it("uses static cover images instead of inline placeholder data URLs", () => {
    for (const category of homeDiscoverySeedCategories) {
      for (const item of category.cases) {
        expect(item.coverImageUrl).toMatch(/^\/images\/home-seeds\/.+\.(png|jpg|jpeg|webp)$/);
      }
    }
  });

  it("uses static author avatars instead of generated letter placeholders", () => {
    for (const category of homeDiscoverySeedCategories) {
      for (const item of category.cases) {
        expect(item.authorAvatarUrl).toMatch(
          /^\/images\/home-seeds\/authors\/.+\.(png|jpg|jpeg|webp)$/,
        );
      }
    }
  });
});
