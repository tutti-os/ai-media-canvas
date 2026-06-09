// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createProjectMock, deleteProjectMock, pushMock, toastErrorMock } =
  vi.hoisted(() => ({
    createProjectMock: vi.fn(),
    deleteProjectMock: vi.fn(),
    pushMock: vi.fn(),
    toastErrorMock: vi.fn(),
  }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
  }),
}));

vi.mock("../src/components/toast", () => ({
  useToast: () => ({
    error: toastErrorMock,
  }),
}));

vi.mock("../src/hooks/use-create-project", () => ({
  useCreateProject: () => ({
    create: createProjectMock,
  }),
}));

vi.mock("../src/lib/server-api", () => ({
  deleteProject: deleteProjectMock,
}));

vi.mock("../src/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
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
    className,
  }: HTMLAttributes<HTMLDivElement> & {
    align?: string;
    sideOffset?: number;
  }) => <div className={className}>{children}</div>,
  DropdownMenuGroup: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuItem: ({
    children,
    closeOnClick: _closeOnClick,
    variant: _variant,
    ...props
  }: ButtonHTMLAttributes<HTMLButtonElement> & {
    closeOnClick?: boolean;
    variant?: string;
  }) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuShortcut: ({ children }: { children: ReactNode }) => (
    <span>{children}</span>
  ),
}));

import { CanvasLogoMenu } from "../src/components/canvas-logo-menu";
import { i18n } from "../src/i18n";

describe("CanvasLogoMenu", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("zh-CN");
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("navigates back to home from the logo menu", async () => {
    render(
      <CanvasLogoMenu
        projectId="project-1"
        canvasId="canvas-1"
        excalidrawApi={null}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "首页" }));

    expect(pushMock).toHaveBeenCalledWith("/home");
  });

  it("renders menu actions in English when the locale changes", async () => {
    await i18n.changeLanguage("en");

    render(
      <CanvasLogoMenu
        projectId="project-1"
        canvasId="canvas-1"
        excalidrawApi={null}
      />,
    );

    expect(screen.getByRole("button", { name: "Home" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Archive current project" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Show all canvas elements" }),
    ).toBeInTheDocument();
  });

  it("keeps the menu action in confirm mode before archiving the project", async () => {
    render(
      <CanvasLogoMenu
        projectId="project-1"
        canvasId="canvas-1"
        excalidrawApi={null}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "归档当前项目" }));

    expect(screen.getByRole("button", { name: "确认归档?" })).toBeVisible();
    expect(deleteProjectMock).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "确认归档?" }));

    expect(deleteProjectMock).toHaveBeenCalledWith("project-1");
    expect(pushMock).toHaveBeenCalledWith("/projects");
  });
});
