import { describe, expect, it } from "vitest";

import fs from "node:fs";
import path from "node:path";

const dropdownMenuSource = fs.readFileSync(
  path.resolve(__dirname, "../src/components/ui/dropdown-menu.tsx"),
  "utf8",
);

describe("dropdown menu item style", () => {
  it("uses the shared muted menu hover state instead of the full theme accent", () => {
    expect(dropdownMenuSource).toContain("dropdownMenuItemClasses");
    expect(dropdownMenuSource).toContain("hover:bg-muted");
    expect(dropdownMenuSource).toContain("focus:bg-muted");
    expect(dropdownMenuSource).toContain("data-highlighted:bg-muted");
    expect(dropdownMenuSource).not.toContain("focus:bg-accent");
  });
});
