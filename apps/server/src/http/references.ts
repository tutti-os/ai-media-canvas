import type { FastifyInstance } from "fastify";
import { z } from "zod";

import type { LocalStore } from "../local/store.js";

// Tutti workspace app reference protocol.
// Contract: app_factory_reference/references/manifest-contract.md
//   POST /tutti/references/list   - two-level navigable tree
//   POST /tutti/references/search - recursive, flat, relevance-ranked search
// v1 exposes project-attributed media assets as a two-level tree:
//   root            -> one group per project (displayName = project name)
//   group "project:<id>" -> file references (displayName = file name)
// Search spans every project and returns a flat ranked list, tagging each hit
// with its owning project name as parentGroupLabel.
// Assets without a project (project_id IS NULL) are intentionally not exposed.

const PROJECT_GROUP_PREFIX = "project:";

const timeRangeSchema = z
  .object({
    fromMs: z.number().finite().optional(),
    toMs: z.number().finite().optional(),
  })
  .optional();

const listRequestSchema = z
  .object({
    parentGroupId: z.string().min(1).nullish(),
    filterText: z.string().optional(),
    limit: z.number().int().optional(),
    cursor: z.string().nullish(),
    kinds: z.array(z.string()).optional(),
    timeRange: timeRangeSchema,
  })
  .passthrough();

const searchRequestSchema = z
  .object({
    query: z.string().min(1),
    limit: z.number().int().optional(),
    cursor: z.string().nullish(),
    kinds: z.array(z.string()).optional(),
    timeRange: timeRangeSchema,
  })
  .passthrough();

type FileReferenceItem = {
  type: "reference";
  reference: {
    kind: "file";
    displayName: string;
    location: { type: "app-data-relative"; path: string };
    sizeBytes?: number;
    mtimeMs?: number;
    mimeType?: string;
    score?: number;
    parentGroupLabel?: string;
  };
};

type GroupItem = {
  type: "group";
  id: string;
  displayName: string;
  referenceCount: number;
};

export async function registerReferenceRoutes(
  app: FastifyInstance,
  options: { store: LocalStore },
) {
  const { store } = options;

  app.post("/tutti/references/list", async (request, reply) => {
    const parsed = listRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "invalid_request", detail: parsed.error.message });
    }

    const body = parsed.data;
    // Tutti clamps limit to 1..50; default to the max when omitted.
    const limit =
      typeof body.limit === "number"
        ? Math.max(1, Math.min(50, body.limit))
        : 50;
    const filterText = body.filterText?.trim() || undefined;
    const timeRange = body.timeRange;

    // Root level: list projects as navigational groups.
    if (!body.parentGroupId) {
      const { groups, nextCursor } = store.listReferenceProjectGroups({
        filterText,
        fromMs: timeRange?.fromMs,
        toMs: timeRange?.toMs,
        limit,
        cursor: body.cursor,
      });
      const items: GroupItem[] = groups.map((group) => ({
        type: "group",
        id: `${PROJECT_GROUP_PREFIX}${group.projectId}`,
        displayName: group.name,
        referenceCount: group.referenceCount,
      }));
      return reply.code(200).send({ items, nextCursor });
    }

    // Project level: list that project's media assets as file references.
    if (body.parentGroupId.startsWith(PROJECT_GROUP_PREFIX)) {
      const projectId = body.parentGroupId.slice(PROJECT_GROUP_PREFIX.length);
      if (!projectId) {
        return reply.code(200).send({ items: [], nextCursor: null });
      }
      const { files, nextCursor } = store.listReferenceProjectAssets({
        projectId,
        filterText,
        fromMs: timeRange?.fromMs,
        toMs: timeRange?.toMs,
        limit,
        cursor: body.cursor,
      });
      const items: FileReferenceItem[] = files.map((file) => ({
        type: "reference",
        reference: {
          kind: "file",
          displayName: file.displayName,
          location: { type: "app-data-relative", path: file.relativePath },
          ...(file.sizeBytes != null ? { sizeBytes: file.sizeBytes } : {}),
          ...(file.mtimeMs != null ? { mtimeMs: file.mtimeMs } : {}),
          ...(file.mimeType ? { mimeType: file.mimeType } : {}),
        },
      }));
      return reply.code(200).send({ items, nextCursor });
    }

    // Unknown group id -> empty, navigable result.
    return reply.code(200).send({ items: [], nextCursor: null });
  });

  app.post("/tutti/references/search", async (request, reply) => {
    const parsed = searchRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "invalid_request", detail: parsed.error.message });
    }

    const body = parsed.data;
    const query = body.query.trim();
    if (!query) {
      // Tutti trims before sending, but stay defensive: empty query -> no hits.
      return reply.code(200).send({ items: [], nextCursor: null });
    }
    // Tutti clamps limit to 1..50; default to the max when omitted.
    const limit =
      typeof body.limit === "number"
        ? Math.max(1, Math.min(50, body.limit))
        : 50;
    const timeRange = body.timeRange;

    const { files, nextCursor } = store.searchReferenceAssets({
      query,
      fromMs: timeRange?.fromMs,
      toMs: timeRange?.toMs,
      limit,
      cursor: body.cursor,
    });

    // Search returns a flat, relevance-ordered list of file references only.
    const items: FileReferenceItem[] = files.map((file) => ({
      type: "reference",
      reference: {
        kind: "file",
        displayName: file.displayName,
        location: { type: "app-data-relative", path: file.relativePath },
        ...(file.sizeBytes != null ? { sizeBytes: file.sizeBytes } : {}),
        ...(file.mtimeMs != null ? { mtimeMs: file.mtimeMs } : {}),
        ...(file.mimeType ? { mimeType: file.mimeType } : {}),
        score: file.score,
        parentGroupLabel: file.projectName,
      },
    }));
    return reply.code(200).send({ items, nextCursor });
  });
}
