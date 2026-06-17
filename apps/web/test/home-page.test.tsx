// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ToastProvider } from "../src/components/toast";
import { i18n } from "../src/i18n";

const createProjectMock = vi.fn();
const fetchProjectsMock = vi.fn();
const pushMock = vi.fn();
const scrollIntoViewMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
  }),
}));

vi.mock("../src/hooks/use-create-project", () => ({
  useCreateProject: () => ({
    create: createProjectMock,
    creating: false,
  }),
}));

vi.mock("../src/hooks/use-delete-project", () => ({
  useDeleteProject: () => ({
    pendingId: null,
    deleting: false,
    requestDelete: vi.fn(),
    confirmDelete: vi.fn(),
    cancelDelete: vi.fn(),
  }),
}));

vi.mock("../src/hooks/use-image-attachments", () => ({
  useImageAttachments: () => ({
    attachments: [],
    addFiles: vi.fn(),
    removeAttachment: vi.fn(),
    clearAll: vi.fn(),
    isUploading: false,
    readyAttachments: [],
  }),
}));

vi.mock("../src/lib/server-api", () => ({
  fetchProjects: (...args: unknown[]) => fetchProjectsMock(...args),
  fetchModels: vi.fn().mockResolvedValue({
    models: [
      { id: "local:assistant", name: "Local Assistant", provider: "local" },
    ],
  }),
  fetchWorkspaceSettings: vi.fn().mockResolvedValue({
    settings: {
      defaultModel: "",
      agnesApiKey: "sk-local-agnes",
      replicateApiToken: "",
      googleApiKey: "",
      googleVertexProject: "",
      googleVertexLocation: "",
      openAIApiKey: "",
      volcesApiKey: "",
    },
  }),
  fetchImageModels: vi.fn().mockResolvedValue({
    models: [
      { id: "local:placeholder-image", displayName: "Local Placeholder Image" },
    ],
  }),
  fetchVideoModels: vi.fn().mockResolvedValue({
    models: [{ id: "agnes-video", displayName: "Agnes Video" }],
  }),
}));

import HomePage from "../src/app/(workspace)/home/page";

describe("Home page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Element.prototype.scrollIntoView = scrollIntoViewMock;
    void i18n.changeLanguage("zh-CN");
    fetchProjectsMock.mockResolvedValue({
      projects: [
        {
          id: "p1",
          name: "Recent Project",
          slug: "recent-project",
          description: null,
          primaryCanvas: { id: "c1", name: "Main Canvas", isPrimary: true },
          createdAt: "2026-06-02T00:00:00Z",
          updatedAt: "2026-06-02T10:00:00Z",
        },
      ],
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("restores the original-style home layout with prompt and recent projects", async () => {
    render(
      <ToastProvider>
        <HomePage />
      </ToastProvider>,
    );

    expect(await screen.findByText("AI Media Canvas")).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("让 AI Media Canvas 帮你设计..."),
    ).toBeInTheDocument();
    expect(await screen.findByText("Recent Project")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "视觉概念" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Visual Concepts" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("灵感发现")).toBeInTheDocument();
    expect(
      screen.getByText(
        "请基于文化艺术中心这个灵感方向，为我做一套品牌探索，输出品牌关键词、主视觉方向、海报延展和社交媒体视觉提案。",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/浏览$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/赞$/)).not.toBeInTheDocument();
  });

  it("fills the prompt from an inspiration case and scrolls back to the input", async () => {
    const user = userEvent.setup();

    render(
      <ToastProvider>
        <HomePage />
      </ToastProvider>,
    );

    await screen.findByText("灵感发现");

    expect(
      screen.queryByRole("button", { name: "做同款" }),
    ).not.toBeInTheDocument();

    const inspirationCard = screen.getByRole("button", {
      name: "做同款：The ART & Cultural Arts Center",
    });

    expect(inspirationCard).toHaveClass("cursor-pointer");

    await user.click(inspirationCard);

    expect(
      screen.getByPlaceholderText("让 AI Media Canvas 帮你设计..."),
    ).toHaveValue(
      "请基于文化艺术中心这个灵感方向，为我做一套品牌探索，输出品牌关键词、主视觉方向、海报延展和社交媒体视觉提案。",
    );
    await waitFor(() => {
      expect(scrollIntoViewMock).toHaveBeenCalledWith({
        behavior: "smooth",
        block: "center",
      });
    });
    expect(createProjectMock).not.toHaveBeenCalled();
  });
});
