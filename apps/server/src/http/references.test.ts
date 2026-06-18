import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const { createAgentRunServiceMock } = vi.hoisted(() => ({
  createAgentRunServiceMock: vi.fn(() => ({
    cancelRun: vi.fn(),
    createRun: vi.fn(),
    streamRun: vi.fn(async function* streamRun() {}),
  })),
}));

vi.mock("../agent/runtime.js", () => ({
  createAgentRunService: createAgentRunServiceMock,
}));

import { buildApp } from "../app.js";
import { createLocalStore } from "../local/store.js";

type ListResponse = {
  items: Array<Record<string, unknown>>;
  nextCursor: string | null;
};

async function listReferences(
  app: ReturnType<typeof buildApp>,
  payload: Record<string, unknown>,
): Promise<ListResponse> {
  const response = await app.inject({
    method: "POST",
    url: "/tutti/references/list",
    payload,
  });
  expect(response.statusCode).toBe(200);
  return response.json() as ListResponse;
}

describe("POST /tutti/references/list", () => {
  const dataRoots: string[] = [];

  afterEach(async () => {
    createAgentRunServiceMock.mockClear();
    await Promise.all(
      dataRoots
        .splice(0)
        .map((dataRoot) =>
          rm(dataRoot, { force: true, recursive: true, maxRetries: 3 }),
        ),
    );
  });

  async function seedStore() {
    const dataRoot = await mkdtemp(join(tmpdir(), "aimc-refs-test-"));
    dataRoots.push(dataRoot);
    const store = createLocalStore({
      assetBaseUrl: "http://127.0.0.1:3001",
      dataRoot,
    });
    const project = store.createProject({ name: "Campaign A" });
    const image = store.uploadFile({
      bucket: "project-assets",
      fileName: "hero.png",
      fileBuffer: Buffer.from("img"),
      mimeType: "image/png",
      projectId: project.id,
    });
    const video = store.uploadFile({
      bucket: "project-assets",
      fileName: "promo.mp4",
      fileBuffer: Buffer.from("vid"),
      mimeType: "video/mp4",
      projectId: project.id,
    });
    // Non-media asset under the project: must be excluded.
    store.uploadFile({
      bucket: "project-assets",
      fileName: "plan.json",
      fileBuffer: Buffer.from("{}"),
      mimeType: "application/json",
      projectId: project.id,
    });
    // Unassigned media asset: must not surface anywhere.
    store.uploadFile({
      bucket: "project-assets",
      fileName: "stray.png",
      fileBuffer: Buffer.from("stray"),
      mimeType: "image/png",
    });
    return { dataRoot, project, assetIds: [image.asset.id, video.asset.id] };
  }

  it("lists projects as root groups with exact media reference counts", async () => {
    const { dataRoot, project } = await seedStore();
    const app = buildApp({ env: { dataRoot } });

    const root = await listReferences(app, {});
    await app.close();

    expect(root.items).toHaveLength(1);
    expect(root.items[0]).toMatchObject({
      type: "group",
      id: `project:${project.id}`,
      displayName: "Campaign A",
      referenceCount: 2, // image + video; json and unassigned excluded
    });
  });

  it("lists a project's media assets as app-data-relative file references", async () => {
    const { dataRoot, project, assetIds } = await seedStore();
    const app = buildApp({ env: { dataRoot } });

    const files = await listReferences(app, {
      parentGroupId: `project:${project.id}`,
    });
    await app.close();

    expect(files.items).toHaveLength(2);
    for (const item of files.items) {
      expect(item.type).toBe("reference");
      const reference = item.reference as {
        kind: string;
        displayName: string;
        location: { type: string; path: string };
      };
      expect(reference.kind).toBe("file");
      expect(reference.location.type).toBe("app-data-relative");
      expect(reference.location.path).toMatch(/^assets\//);
      expect(reference.location.path).not.toContain("..");
      // displayName is the file name, which embeds the asset id.
      const assetId = assetIds.find((id) =>
        reference.displayName.startsWith(id),
      );
      expect(assetId).toBeTruthy();
    }
  });

  it("returns an empty result for an unknown group id", async () => {
    const { dataRoot } = await seedStore();
    const app = buildApp({ env: { dataRoot } });

    const result = await listReferences(app, { parentGroupId: "bogus:123" });
    await app.close();

    expect(result.items).toEqual([]);
    expect(result.nextCursor).toBeNull();
  });

  it("paginates project file references via opaque cursor", async () => {
    const { dataRoot, project } = await seedStore();
    const app = buildApp({ env: { dataRoot } });

    const firstPage = await listReferences(app, {
      parentGroupId: `project:${project.id}`,
      limit: 1,
    });
    expect(firstPage.items).toHaveLength(1);
    expect(firstPage.nextCursor).toBeTruthy();

    const secondPage = await listReferences(app, {
      parentGroupId: `project:${project.id}`,
      limit: 1,
      cursor: firstPage.nextCursor,
    });
    await app.close();

    expect(secondPage.items).toHaveLength(1);
    const firstId = (firstPage.items[0]?.reference as { displayName: string })
      .displayName;
    const secondId = (secondPage.items[0]?.reference as { displayName: string })
      .displayName;
    expect(firstId).not.toBe(secondId);
  });
});

async function searchReferences(
  app: ReturnType<typeof buildApp>,
  payload: Record<string, unknown>,
): Promise<ListResponse> {
  const response = await app.inject({
    method: "POST",
    url: "/tutti/references/search",
    payload,
  });
  expect(response.statusCode).toBe(200);
  return response.json() as ListResponse;
}

describe("POST /tutti/references/search", () => {
  const dataRoots: string[] = [];

  afterEach(async () => {
    createAgentRunServiceMock.mockClear();
    await Promise.all(
      dataRoots
        .splice(0)
        .map((dataRoot) =>
          rm(dataRoot, { force: true, recursive: true, maxRetries: 3 }),
        ),
    );
  });

  // Two projects with media assets, plus a non-media and an unassigned asset
  // that must never surface in search.
  async function seedStore() {
    const dataRoot = await mkdtemp(join(tmpdir(), "aimc-search-test-"));
    dataRoots.push(dataRoot);
    const store = createLocalStore({
      assetBaseUrl: "http://127.0.0.1:3001",
      dataRoot,
    });
    const campaign = store.createProject({ name: "Campaign A" });
    const promoProject = store.createProject({ name: "Promo Reel" });
    const heroImage = store.uploadFile({
      bucket: "project-assets",
      fileName: "hero.png",
      fileBuffer: Buffer.from("img"),
      mimeType: "image/png",
      projectId: campaign.id,
    });
    const promoVideo = store.uploadFile({
      bucket: "project-assets",
      fileName: "promo.mp4",
      fileBuffer: Buffer.from("vid"),
      mimeType: "video/mp4",
      projectId: promoProject.id,
    });
    // Non-media asset under a project: excluded from search.
    store.uploadFile({
      bucket: "project-assets",
      fileName: "plan.json",
      fileBuffer: Buffer.from("{}"),
      mimeType: "application/json",
      projectId: campaign.id,
    });
    // Unassigned media asset: never surfaces.
    store.uploadFile({
      bucket: "project-assets",
      fileName: "stray.png",
      fileBuffer: Buffer.from("stray"),
      mimeType: "image/png",
    });
    return {
      dataRoot,
      campaign,
      promoProject,
      heroAssetId: heroImage.asset.id,
      promoAssetId: promoVideo.asset.id,
    };
  }

  it("rejects an empty query with 400", async () => {
    const { dataRoot } = await seedStore();
    const app = buildApp({ env: { dataRoot } });

    const response = await app.inject({
      method: "POST",
      url: "/tutti/references/search",
      payload: { query: "" },
    });
    await app.close();

    expect(response.statusCode).toBe(400);
  });

  it("searches a single project by its name and tags the parent group", async () => {
    const { dataRoot, campaign } = await seedStore();
    const app = buildApp({ env: { dataRoot } });

    const result = await searchReferences(app, { query: "Campaign" });
    await app.close();

    // Only Campaign A's media asset matches; json and unassigned excluded.
    expect(result.items).toHaveLength(1);
    const reference = result.items[0]?.reference as {
      kind: string;
      location: { type: string; path: string };
      score: number;
      parentGroupLabel: string;
    };
    expect(reference.kind).toBe("file");
    expect(reference.location.type).toBe("app-data-relative");
    expect(reference.location.path).toMatch(/^assets\//);
    expect(reference.location.path).not.toContain("..");
    expect(reference.parentGroupLabel).toBe(campaign.name);
    expect(reference.score).toBeGreaterThan(0);
    expect(reference.score).toBeLessThanOrEqual(1);
    // Search returns a flat list of references, never group items.
    for (const item of result.items) {
      expect(item.type).toBe("reference");
    }
  });

  it("ranks a file-name match above a project-name-only match", async () => {
    const { dataRoot, promoProject, promoAssetId } = await seedStore();
    const app = buildApp({ env: { dataRoot } });

    // The promo video's file name embeds its asset id, which is also unique;
    // searching a fragment of that id matches only the file, not a project.
    const idFragment = promoAssetId.slice(0, 8);
    const byName = await searchReferences(app, { query: idFragment });
    // "Promo" matches the project name of the same asset (project-only match).
    const byProject = await searchReferences(app, { query: "Promo" });
    await app.close();

    expect(byName.items).toHaveLength(1);
    expect(byProject.items).toHaveLength(1);
    const nameScore = (byName.items[0]?.reference as { score: number }).score;
    const projectScore = (byProject.items[0]?.reference as { score: number })
      .score;
    expect(nameScore).toBeGreaterThan(projectScore);
  });

  it("searches recursively across every project", async () => {
    const { dataRoot } = await seedStore();
    const app = buildApp({ env: { dataRoot } });

    // ".png"/".mp4" share no token; every stored object_path starts with the
    // shared "upload/" scope prefix, so searching it spans both projects.
    const result = await searchReferences(app, { query: "upload" });
    await app.close();

    // Both media assets (one per project) match; unassigned/non-media excluded.
    expect(result.items).toHaveLength(2);
    const labels = result.items.map(
      (item) =>
        (item.reference as { parentGroupLabel: string }).parentGroupLabel,
    );
    expect(new Set(labels)).toEqual(new Set(["Campaign A", "Promo Reel"]));
  });

  it("returns an empty list when nothing matches", async () => {
    const { dataRoot } = await seedStore();
    const app = buildApp({ env: { dataRoot } });

    const result = await searchReferences(app, { query: "no-such-thing" });
    await app.close();

    expect(result.items).toEqual([]);
    expect(result.nextCursor).toBeNull();
  });

  it("paginates flat search results via opaque cursor", async () => {
    const { dataRoot } = await seedStore();
    const app = buildApp({ env: { dataRoot } });

    const firstPage = await searchReferences(app, {
      query: "upload",
      limit: 1,
    });
    expect(firstPage.items).toHaveLength(1);
    expect(firstPage.nextCursor).toBeTruthy();

    const secondPage = await searchReferences(app, {
      query: "upload",
      limit: 1,
      cursor: firstPage.nextCursor,
    });
    await app.close();

    expect(secondPage.items).toHaveLength(1);
    const firstPath = (
      firstPage.items[0]?.reference as { location: { path: string } }
    ).location.path;
    const secondPath = (
      secondPage.items[0]?.reference as { location: { path: string } }
    ).location.path;
    expect(firstPath).not.toBe(secondPath);
  });
});
