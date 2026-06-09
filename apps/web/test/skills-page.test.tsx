// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ToastProvider } from "../src/components/toast";
import { i18n } from "../src/i18n";

const fetchInstalledSkillsMock = vi.fn();
const fetchSkillCatalogMock = vi.fn();
const fetchSkillDetailMock = vi.fn();
const createSkillMock = vi.fn();
const uninstallSkillMock = vi.fn();

vi.mock("../src/lib/server-api", () => ({
  fetchInstalledSkills: (...args: unknown[]) =>
    fetchInstalledSkillsMock(...args),
  fetchSkillCatalog: (...args: unknown[]) => fetchSkillCatalogMock(...args),
  fetchSkillDetail: (...args: unknown[]) => fetchSkillDetailMock(...args),
  createSkill: (...args: unknown[]) => createSkillMock(...args),
  importSkill: vi.fn(),
  installSkill: vi.fn(),
  toggleSkill: vi.fn(),
  uninstallSkill: (...args: unknown[]) => uninstallSkillMock(...args),
}));

import SkillsPage from "../src/app/(workspace)/skills/page";

describe("Skills page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    void i18n.changeLanguage("zh-CN");
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
    createSkillMock.mockResolvedValue({
      skill: {
        id: "skill-2",
        name: "Story Beats",
        slug: "story-beats",
        description: "Break ideas into beats",
        author: "Local User",
        version: "1.0.0",
        category: "custom",
        iconName: null,
        source: "user",
        isFeatured: false,
        metadata: {},
        installed: true,
        enabled: true,
        installedAt: "2026-06-03T00:00:00Z",
        createdAt: "2026-06-03T00:00:00Z",
        updatedAt: "2026-06-03T00:00:00Z",
        license: "Local",
        skillContent: "# Story Beats",
        createdBy: "Local User",
        sourceUrl: null,
        packageName: null,
        files: [],
      },
    });
    uninstallSkillMock.mockResolvedValue(undefined);
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

    expect(await screen.findByText("技能")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "已安装" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "市场" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "导入" })).toBeInTheDocument();
    expect(await screen.findByText("Canvas Director")).toBeInTheDocument();
  });

  it("renders representative English copy when language is English", async () => {
    void i18n.changeLanguage("en");

    render(
      <ToastProvider>
        <SkillsPage />
      </ToastProvider>,
    );

    expect(await screen.findByText("Skills")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Installed" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Marketplace" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Import" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Official" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Canvas Director")).toBeInTheDocument();
  });

  it("offers both file import and directory import for local skill packages", async () => {
    render(
      <ToastProvider>
        <SkillsPage />
      </ToastProvider>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "导入" }));

    expect(await screen.findByText("从本地导入技能")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "选择文件" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "选择目录" }),
    ).toBeInTheDocument();
  });

  it("creates a skill with local state updates instead of refetching the installed list", async () => {
    render(
      <ToastProvider>
        <SkillsPage />
      </ToastProvider>,
    );

    await screen.findByText("Canvas Director");
    expect(fetchInstalledSkillsMock).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "添加技能" }));
    fireEvent.change(screen.getByLabelText("名称"), {
      target: { value: "Story Beats" },
    });
    fireEvent.change(screen.getByLabelText("描述"), {
      target: { value: "Break ideas into beats" },
    });
    fireEvent.change(screen.getByLabelText("SKILL.md"), {
      target: {
        value: "# Story Beats\n\n## Description\nBreak ideas into beats.",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "添加技能" }));

    const createdSkill = await screen.findByText("Story Beats");
    const existingSkill = screen.getByText("Canvas Director");

    expect(createdSkill).toBeInTheDocument();
    expect(
      createdSkill.compareDocumentPosition(existingSkill) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(fetchInstalledSkillsMock).toHaveBeenCalledTimes(1);
  });

  it("uninstalls a skill with local state updates instead of refetching the installed list", async () => {
    render(
      <ToastProvider>
        <SkillsPage />
      </ToastProvider>,
    );

    expect(await screen.findByText("Canvas Director")).toBeInTheDocument();
    expect(fetchInstalledSkillsMock).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "卸载" }));

    expect(await screen.findByText("暂无已安装技能")).toBeInTheDocument();
    expect(fetchInstalledSkillsMock).toHaveBeenCalledTimes(1);
  });
});
