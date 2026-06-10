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
    const { container } = render(
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

    const fileInput = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    const skillContent = `name: pua
description: "Use when the user explicitly requests PUA mode or signals frustration."
license: MIT

# PUA 我们不养闲 Agent
`;
    const skillFile = new File([skillContent], "SKILL.md", {
      type: "text/markdown",
    });
    Object.defineProperty(skillFile, "text", {
      value: async () => skillContent,
    });
    Object.defineProperty(skillFile, "webkitRelativePath", {
      value: "pua/SKILL.md",
    });

    fireEvent.change(fileInput, { target: { files: [skillFile] } });

    expect(await screen.findByDisplayValue("pua")).toBeInTheDocument();
    expect(
      await screen.findByDisplayValue(
        "Use when the user explicitly requests PUA mode or signals frustration.",
      ),
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

  it("keeps the custom skill dialog within the viewport with a scrollable body", async () => {
    render(
      <ToastProvider>
        <SkillsPage />
      </ToastProvider>,
    );

    await screen.findByText("Canvas Director");
    fireEvent.click(screen.getByRole("button", { name: "添加技能" }));

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveClass("max-h-[calc(100vh-6rem)]", "overflow-hidden");
    const scrollBody = screen.getByTestId("create-skill-dialog-scroll");
    expect(scrollBody).toHaveClass("min-h-0", "overflow-y-auto");
    expect(screen.getByRole("button", { name: "取消" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "添加技能" }),
    ).toBeInTheDocument();
  });

  it("keeps imported skill detail badges away from the close button", async () => {
    const longSkillName = "PUA 我们不养闲 Agent，一个提高agent积极性的 skill。";
    const importedSkill = {
      id: "skill-imported",
      name: longSkillName,
      slug: "pua",
      description: "Imported local skill.",
      author: "Local User",
      version: "1.0.0",
      category: "custom",
      iconName: null,
      source: "user",
      isFeatured: false,
      metadata: {},
      installed: true,
      enabled: true,
      installedAt: "2026-06-10T00:00:00Z",
      createdAt: "2026-06-10T00:00:00Z",
      updatedAt: "2026-06-10T00:00:00Z",
      license: "Local",
      skillContent: "# PUA",
      createdBy: "Local User",
      sourceUrl: null,
      packageName: null,
      files: [],
    };
    fetchInstalledSkillsMock.mockResolvedValue({ skills: [importedSkill] });
    fetchSkillCatalogMock.mockResolvedValue({ skills: [] });
    fetchSkillDetailMock.mockResolvedValue({ skill: importedSkill });

    render(
      <ToastProvider>
        <SkillsPage />
      </ToastProvider>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "详情" }));

    const dialog = await screen.findByRole("dialog");
    const titleText = Array.from(dialog.querySelectorAll("span")).find(
      (element) => element.textContent === longSkillName,
    ) as HTMLElement;

    expect(titleText).toHaveClass("min-w-0", "flex-1", "break-words");
    expect(titleText.parentElement).toHaveClass(
      "items-start",
      "gap-3",
      "pr-12",
    );
    expect(screen.getByTestId("skill-detail-source-badge")).toHaveClass(
      "shrink-0",
    );
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
