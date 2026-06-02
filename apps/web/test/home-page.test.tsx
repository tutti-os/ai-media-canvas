// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ToastProvider } from "../src/components/toast";

const createProjectMock = vi.fn();
const fetchProjectsMock = vi.fn();
const pushMock = vi.fn();

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
    models: [{ id: "local:assistant", name: "Local Assistant", provider: "local" }],
  }),
  fetchImageModels: vi.fn().mockResolvedValue({
    models: [{ id: "local:placeholder-image", displayName: "Local Placeholder Image" }],
  }),
}));

import HomePage from "../src/app/(workspace)/home/page";

describe("Home page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    expect(screen.getByText("灵感发现")).toBeInTheDocument();
  });
});
