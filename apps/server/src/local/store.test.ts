import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";

import { createLocalStore } from "./store.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("createLocalStore", () => {
  it("creates unique slugs for duplicate project names", () => {
    const dataRoot = mkdtempSync(join(tmpdir(), "aimc-store-"));
    tempDirs.push(dataRoot);

    const store = createLocalStore({
      assetBaseUrl: "http://127.0.0.1:3001",
      dataRoot,
    });

    const first = store.createProject({ name: "Untitled" });
    const second = store.createProject({ name: "Untitled" });

    expect(first.slug).toBe("untitled");
    expect(second.slug).toBe("untitled-2");
  });

  it("returns null or false for chat operations on missing resources", () => {
    const dataRoot = mkdtempSync(join(tmpdir(), "aimc-store-"));
    tempDirs.push(dataRoot);

    const store = createLocalStore({
      assetBaseUrl: "http://127.0.0.1:3001",
      dataRoot,
    });

    expect(store.createSession("missing-canvas")).toBeNull();
    expect(store.updateSessionTitle("missing-session", "Renamed")).toBe(false);
    expect(store.deleteSession("missing-session")).toBe(false);
    expect(store.listMessages("missing-session")).toBeNull();
    expect(
      store.createMessage("missing-session", {
        role: "user",
        content: "Hello",
      }),
    ).toBeNull();
  });

  it("hides archived project canvases and sessions from active access", () => {
    const dataRoot = mkdtempSync(join(tmpdir(), "aimc-store-"));
    tempDirs.push(dataRoot);

    const store = createLocalStore({
      assetBaseUrl: "http://127.0.0.1:3001",
      dataRoot,
    });

    const project = store.createProject({ name: "Archive Me" });
    const session = store.createSession(project.primaryCanvas.id, "Archive session");

    expect(session).not.toBeNull();
    expect(store.archiveProject(project.id)).toBe(true);
    expect(store.getCanvas(project.primaryCanvas.id)).toBeNull();
    expect(store.listSessions(project.primaryCanvas.id)).toBeNull();
    expect(store.createSession(project.primaryCanvas.id)).toBeNull();
    expect(store.listMessages(session!.id)).toBeNull();
  });

  it("applies the default brand kit to newly created projects", () => {
    const dataRoot = mkdtempSync(join(tmpdir(), "aimc-store-"));
    tempDirs.push(dataRoot);

    const store = createLocalStore({
      assetBaseUrl: "http://127.0.0.1:3001",
      dataRoot,
    });

    const defaultKit = store.createBrandKit({ name: "Default Kit" });
    store.updateBrandKit(defaultKit.id, { is_default: true });

    const project = store.createProject({ name: "Uses Default Kit" });
    const storedProject = store.getProject(project.id);

    expect(storedProject).not.toBeNull();
    expect(storedProject?.brand_kit_id).toBe(defaultKit.id);
  });

  it("rejects binding a project to a missing brand kit", () => {
    const dataRoot = mkdtempSync(join(tmpdir(), "aimc-store-"));
    tempDirs.push(dataRoot);

    const store = createLocalStore({
      assetBaseUrl: "http://127.0.0.1:3001",
      dataRoot,
    });

    const project = store.createProject({ name: "Broken Reference" });
    const result = store.updateProject(project.id, {
      brandKitId: "11111111-1111-1111-1111-111111111111",
    });

    expect(result).toEqual({ ok: false, reason: "brand_kit_not_found" });
    expect(store.getProject(project.id)?.brand_kit_id).toBeNull();
  });

  it("refuses to delete assets that are still referenced by local app data", () => {
    const dataRoot = mkdtempSync(join(tmpdir(), "aimc-store-"));
    tempDirs.push(dataRoot);

    const store = createLocalStore({
      assetBaseUrl: "http://127.0.0.1:3001",
      dataRoot,
    });

    const project = store.createProject({ name: "Asset Guard" });
    const uploaded = store.uploadFile({
      bucket: "project-assets",
      fileName: "ref.png",
      fileBuffer: Buffer.from("png"),
      mimeType: "image/png",
      projectId: project.id,
    });
    const session = store.createSession(project.primaryCanvas.id, "Attachment Session");

    expect(session).not.toBeNull();
    store.createMessage(session!.id, {
      role: "user",
      content: "See attachment",
      contentBlocks: [
        {
          type: "image",
          assetId: uploaded.asset.id,
          url: uploaded.url,
          mimeType: "image/png",
          source: "upload",
          name: "ref.png",
        },
      ],
    });

    expect(store.deleteAsset(uploaded.asset.id)).toEqual({
      ok: false,
      reason: "asset_in_use",
    });

    const thumbnail = store.saveProjectThumbnail(
      project.id,
      Buffer.from("thumb"),
      "image/png",
    );
    const thumbnailAssetId = thumbnail?.thumbnailUrl.split("/").at(-1);

    expect(thumbnailAssetId).toBeTruthy();
    expect(store.deleteAsset(thumbnailAssetId!)).toEqual({
      ok: false,
      reason: "asset_in_use",
    });
  });

  it("manages bundled and imported local skills", () => {
    const dataRoot = mkdtempSync(join(tmpdir(), "aimc-store-"));
    tempDirs.push(dataRoot);

    const store = createLocalStore({
      assetBaseUrl: "http://127.0.0.1:3001",
      dataRoot,
    });

    const catalog = store.listCatalogSkills();
    expect(catalog.length).toBeGreaterThan(0);

    expect(catalog.some((skill) => skill.installed)).toBe(true);
    expect(catalog.some((skill) => skill.name === "Canvas Design")).toBe(true);

    const bundled = catalog.find((skill) => skill.installed) ?? catalog[0];
    expect(bundled).toBeDefined();
    const localDirectorySkill = catalog.find((skill) => skill.name === "Canvas Design");
    expect(localDirectorySkill).toBeDefined();
    const localDirectoryDetail = store.getSkillDetail(localDirectorySkill!.id);
    expect(localDirectoryDetail?.metadata).toMatchObject({
      scope: "local-directory",
      path: "skills/canvas-design/SKILL.md",
    });
    expect(localDirectoryDetail?.metadata.files).toContain("canvas-fonts/ArsenalSC-Regular.ttf");

    const imported = store.importSkill({
      files: [
        {
          filePath: "custom/SKILL.md",
          content: `# Local Storyboard Skill

## Description
Help the assistant break an idea into storyboard beats.

## Instructions
1. Ask for the key beats.
2. Suggest a shot list.
`,
        },
      ],
    });

    expect(imported).not.toBeNull();
    expect(imported?.name).toBe("Local Storyboard Skill");

    const enabled = store.listEnabledSkills().map((skill) => skill.id);
    expect(enabled).toContain(bundled!.id);
    expect(enabled).toContain(imported!.id);

    store.toggleSkill(imported!.id, { enabled: false });
    expect(store.listEnabledSkills().map((skill) => skill.id)).not.toContain(
      imported!.id,
    );

    expect(store.uninstallSkill(imported!.id)).toBe(true);
    expect(store.getSkillDetail(imported!.id)).toBeNull();
  });

  it("persists local workspace model and provider settings across store reloads", () => {
    const dataRoot = mkdtempSync(join(tmpdir(), "aimc-store-"));
    tempDirs.push(dataRoot);

    const firstStore = createLocalStore({
      assetBaseUrl: "http://127.0.0.1:3001",
      dataRoot,
    });

    firstStore.updateWorkspaceSettings({
      defaultModel: "google:gemini-2.5-flash",
      openAIApiKey: "sk-local-openai",
      openAIApiBase: "http://127.0.0.1:4000/v1",
      agnesApiKey: "sk-local-agnes",
      agnesBaseUrl: "https://local.agnes.example/v1",
      agnesDefaultModel: "agnes:agnes-2.0-flash",
      googleApiKey: "google-local-key",
      googleVertexProject: "vertex-project",
      googleVertexLocation: "global",
      googleVertexVideoLocation: "us-central1",
      replicateApiToken: "replicate-local-token",
      volcesApiKey: "volces-local-key",
      volcesBaseUrl: "https://volces.example.com/api/v3",
    });

    const reopenedStore = createLocalStore({
      assetBaseUrl: "http://127.0.0.1:3001",
      dataRoot,
    });

    expect(reopenedStore.getWorkspaceSettings()).toEqual({
      defaultModel: "google:gemini-2.5-flash",
      openAIApiKey: "sk-local-openai",
      openAIApiBase: "http://127.0.0.1:4000/v1",
      agnesApiKey: "sk-local-agnes",
      agnesBaseUrl: "https://local.agnes.example/v1",
      agnesDefaultModel: "agnes:agnes-2.0-flash",
      googleApiKey: "google-local-key",
      googleVertexProject: "vertex-project",
      googleVertexLocation: "global",
      googleVertexVideoLocation: "us-central1",
      replicateApiToken: "replicate-local-token",
      volcesApiKey: "volces-local-key",
      volcesBaseUrl: "https://volces.example.com/api/v3",
    });
  });

  it("migrates legacy workspace settings rows in existing sqlite data", () => {
    const dataRoot = mkdtempSync(join(tmpdir(), "aimc-store-"));
    tempDirs.push(dataRoot);

    const db = new DatabaseSync(join(dataRoot, "ai-media-canvas.db"));
    db.exec(`
      CREATE TABLE workspace_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        default_model TEXT NOT NULL
      );
      INSERT INTO workspace_settings (id, default_model)
      VALUES (1, 'openai:gpt-4o');
    `);
    db.close();

    const store = createLocalStore({
      assetBaseUrl: "http://127.0.0.1:3001",
      dataRoot,
    });

    expect(store.getWorkspaceSettings()).toEqual({
      defaultModel: "openai:gpt-4o",
      openAIApiKey: "",
      openAIApiBase: "",
      agnesApiKey: "",
      agnesBaseUrl: "",
      agnesDefaultModel: "",
      googleApiKey: "",
      googleVertexProject: "",
      googleVertexLocation: "",
      googleVertexVideoLocation: "",
      replicateApiToken: "",
      volcesApiKey: "",
      volcesBaseUrl: "",
    });
  });
});
