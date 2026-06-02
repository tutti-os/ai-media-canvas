// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ToastProvider } from "../src/components/toast";

const fetchInstalledSkillsMock = vi.fn();
const fetchSkillCatalogMock = vi.fn();
const fetchSkillDetailMock = vi.fn();

vi.mock("../src/lib/server-api", () => ({
  fetchInstalledSkills: (...args: unknown[]) => fetchInstalledSkillsMock(...args),
  fetchSkillCatalog: (...args: unknown[]) => fetchSkillCatalogMock(...args),
  fetchSkillDetail: (...args: unknown[]) => fetchSkillDetailMock(...args),
  createSkill: vi.fn(),
  importSkill: vi.fn(),
  installSkill: vi.fn(),
  toggleSkill: vi.fn(),
  uninstallSkill: vi.fn(),
}));

import SkillsPage from "../src/app/(workspace)/skills/page";

describe("Skills page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchInstalledSkillsMock.mockResolvedValue({
      skills: [
        {
          id: "skill-1",
          name: "Canvas Director",
          slug: "canvas-director",
          description: "Design flow",
          author: "AI Media Canvas",
          version: "1.0.0",
          category: "design",
          iconName: null,
          source: "system",
          isFeatured: true,
          metadata: {},
          installed: true,
          enabled: true,
          installedAt: "2026-06-02T00:00:00Z",
          createdAt: "2026-06-02T00:00:00Z",
          updatedAt: "2026-06-02T00:00:00Z",
        },
      ],
    });
    fetchSkillCatalogMock.mockResolvedValue({
      skills: [
        {
          id: "skill-1",
          name: "Canvas Director",
          slug: "canvas-director",
          description: "Design flow",
          author: "AI Media Canvas",
          version: "1.0.0",
          category: "design",
          iconName: null,
          source: "system",
          isFeatured: true,
          metadata: {},
          installed: true,
          enabled: true,
          installedAt: "2026-06-02T00:00:00Z",
          createdAt: "2026-06-02T00:00:00Z",
          updatedAt: "2026-06-02T00:00:00Z",
        },
      ],
    });
    fetchSkillDetailMock.mockResolvedValue({
      skill: {
        id: "skill-1",
        name: "Canvas Director",
        slug: "canvas-director",
        description: "Design flow",
        author: "AI Media Canvas",
        version: "1.0.0",
        category: "design",
        iconName: null,
        source: "system",
        isFeatured: true,
        metadata: {},
        installed: true,
        enabled: true,
        installedAt: "2026-06-02T00:00:00Z",
        createdAt: "2026-06-02T00:00:00Z",
        updatedAt: "2026-06-02T00:00:00Z",
        license: "MIT",
        skillContent: "# Canvas Director",
        createdBy: "AI Media Canvas",
        sourceUrl: null,
        packageName: "@aimc/canvas-director",
        files: [],
      },
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("renders installed, marketplace, and import tabs for local skills", async () => {
    render(
      <ToastProvider>
        <SkillsPage />
      </ToastProvider>,
    );

    expect(await screen.findByText("Skills")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "已安装" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "市场" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "导入" })).toBeInTheDocument();
    expect(await screen.findByText("Canvas Director")).toBeInTheDocument();
  });

  it("offers both file import and directory import for local skill packages", async () => {
    render(
      <ToastProvider>
        <SkillsPage />
      </ToastProvider>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "导入" }));

    expect(
      await screen.findByText("从本地导入技能"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "选择文件" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "选择目录" })).toBeInTheDocument();
  });
});
