// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ImagePill } from "../src/components/chat/image-lightbox";

describe("ImagePill", () => {
  afterEach(() => {
    cleanup();
  });

  it("positions the hover preview outside the containing chat bubble", () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 980,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 640,
    });

    const { container } = render(
      <div
        data-chat-bubble
        style={{ width: 360 }}
      >
        <ImagePill
          src="http://localhost/selfie.png"
          name="Selfie"
        />
      </div>,
    );

    const bubble = container.querySelector("[data-chat-bubble]")!;
    const pill = screen.getByRole("button", { name: /Selfie/i });

    bubble.getBoundingClientRect = () =>
      ({
        bottom: 320,
        height: 170,
        left: 300,
        right: 660,
        top: 150,
        width: 360,
        x: 300,
        y: 150,
        toJSON: () => {},
      }) as DOMRect;
    pill.getBoundingClientRect = () =>
      ({
        bottom: 304,
        height: 22,
        left: 610,
        right: 662,
        top: 282,
        width: 52,
        x: 610,
        y: 282,
        toJSON: () => {},
      }) as DOMRect;

    fireEvent.mouseEnter(pill);

    const preview = Array.from(document.body.querySelectorAll("div"))
      .find((el) => el.className.includes("fixed z-[1500]"));
    expect(preview?.style.top).toBe("328px");
    expect(preview?.style.bottom).toBe("");
  });
});
