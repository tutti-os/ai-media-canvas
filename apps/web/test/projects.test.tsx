// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ToastProvider } from "../src/components/toast";

const createProjectMock = vi.fn();
const fetchProjectsMock = vi.fn();

vi.mock("../src/hooks/use-create-project", () => ({
  useCreateProject: () => ({
    create: createProjectMock,
    creating: false,
  }),
}));

vi.mock("../src/lib/server-api", () => ({
  fetchProjects: (...args: unknown[]) => fetchProjectsMock(...args),
}));

import ProjectsPage from "../src/app/(workspace)/projects/page";

const projectResponse = {
  projects: [
    {
      id: "p1",
      name: "Brand System",
      slug: "brand-system",
      description: "Primary brand project",
      primaryCanvas: { id: "c1", name: "Main Canvas", isPrimary: true },
      createdAt: "2026-03-23T00:00:00Z",
      updatedAt: "2026-03-23T10:00:00Z",
    },
  ],
};

function renderPage() {
  return render(
    <ToastProvider>
      <ProjectsPage />
    </ToastProvider>,
  );
}

describe("Projects page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchProjectsMock.mockResolvedValue(projectResponse);
  });

  afterEach(() => {
    cleanup();
  });

  it("loads and renders projects from the local API", async () => {
    renderPage();

    expect(await screen.findByText("项目")).toBeInTheDocument();
    expect(await screen.findByText("Brand System")).toBeInTheDocument();
    expect(fetchProjectsMock).toHaveBeenCalled();
  });

  it("shows only the create card when the project list is empty", async () => {
    fetchProjectsMock.mockResolvedValue({ projects: [] });
    renderPage();

    expect(await screen.findByText("新建项目")).toBeInTheDocument();
    expect(screen.queryByText("Brand System")).not.toBeInTheDocument();
  });

  it("retries after a local load failure", async () => {
    fetchProjectsMock
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce(projectResponse);

    renderPage();

    expect(
      await screen.findByText("Failed to load local projects. Please try again."),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() =>
      expect(screen.getByText("Brand System")).toBeInTheDocument(),
    );
    expect(fetchProjectsMock).toHaveBeenCalledTimes(2);
  });

  it("starts the create-project flow from the create card", async () => {
    renderPage();

    const button = await screen.findByRole("button", { name: "新建项目" });
    await userEvent.click(button);

    expect(createProjectMock).toHaveBeenCalledTimes(1);
  });
});
