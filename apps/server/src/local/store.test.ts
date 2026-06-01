import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
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
});
