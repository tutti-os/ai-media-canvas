// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render } from "@testing-library/react";
import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  ReactNode,
} from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const dropdownMenuContentSpy = vi.fn();

vi.mock("../src/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({
    children,
    ...props
  }: ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
  DropdownMenuContent: ({
    children,
    ...props
  }: HTMLAttributes<HTMLDivElement> & {
    align?: string;
    side?: string;
    sideOffset?: number;
  }) => {
    dropdownMenuContentSpy(props);
    return <div>{children}</div>;
  },
  DropdownMenuItem: ({ children }: { children: ReactNode }) => (
    <button type="button">{children}</button>
  ),
  DropdownMenuSeparator: () => <hr />,
}));

const { fetchViewerMock } = vi.hoisted(() => ({
  fetchViewerMock: vi.fn(),
}));

vi.mock("../src/lib/server-api", () => ({
  fetchViewer: fetchViewerMock,
}));

import { SidebarSettingsMenu } from "../src/components/sidebar-settings-menu";

describe("SidebarSettingsMenu", () => {
  afterEach(() => {
    cleanup();
    dropdownMenuContentSpy.mockClear();
    fetchViewerMock.mockReset();
  });

  it("anchors the settings popup to the avatar's right edge", () => {
    fetchViewerMock.mockResolvedValue({
      profile: {
        id: "viewer-1",
        email: "local@aimc.app",
        displayName: "Local User",
      },
    });

    render(<SidebarSettingsMenu />);

    expect(dropdownMenuContentSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        align: "end",
        side: "right",
        sideOffset: 12,
      }),
    );
  });
});
