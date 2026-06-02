// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EditableProjectName } from "../src/components/editable-project-name";

const { updateProjectMock, toastErrorMock } = vi.hoisted(() => ({
  updateProjectMock: vi.fn(),
  toastErrorMock: vi.fn(),
}));

vi.mock("../src/lib/server-api", () => ({
  updateProject: updateProjectMock,
}));

vi.mock("../src/components/toast", () => ({
  useToast: () => ({
    error: toastErrorMock,
  }),
}));

describe("EditableProjectName", () => {
  beforeEach(() => {
    updateProjectMock.mockReset();
    toastErrorMock.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("rolls back the optimistic title when rename fails", async () => {
    updateProjectMock.mockRejectedValue(new Error("network"));

    render(
      <EditableProjectName
        projectId="project-1"
        initialName="Original Name"
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Original Name" }));
    const input = screen.getByDisplayValue("Original Name");
    await userEvent.clear(input);
    await userEvent.type(input, "Renamed Project{enter}");

    await waitFor(() =>
      expect(updateProjectMock).toHaveBeenCalledWith("project-1", {
        name: "Renamed Project",
      }),
    );

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Original Name" }),
      ).toBeInTheDocument(),
    );
    expect(toastErrorMock).toHaveBeenCalledWith("项目重命名失败");
  });
});
