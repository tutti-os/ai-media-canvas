// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ProjectThumbnailPreview } from "../src/components/project-thumbnail-preview";

describe("ProjectThumbnailPreview", () => {
  it("shows a hover popup from the preview button without navigating", async () => {
    const onCardClick = vi.fn();

    render(
      <div
        onClick={onCardClick}
        onKeyDown={(event) => {
          if (event.key === "Enter") onCardClick();
        }}
      >
        <ProjectThumbnailPreview
          src="https://example.com/thumb.webp"
          alt="Brand system"
          previewLabel="Preview cover"
        />
      </div>,
    );

    expect(screen.getByAltText("Brand system")).toHaveClass("object-contain");
    expect(
      screen.queryByAltText("Brand system preview"),
    ).not.toBeInTheDocument();

    const previewButton = screen.getByRole("button", { name: "Preview cover" });
    await userEvent.hover(previewButton);

    expect(await screen.findByAltText("Brand system preview")).toHaveClass(
      "object-contain",
    );

    await userEvent.click(previewButton);
    expect(onCardClick).not.toHaveBeenCalled();
  });
});
