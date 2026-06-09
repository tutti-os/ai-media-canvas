import type { ToolRuntime } from "@langchain/core/tools";
import {
  type AnyBackendProtocol,
  type BackendFactory,
  type BackendProtocolV2,
  resolveBackend as resolveDeepAgentBackend,
} from "deepagents";
import { tool } from "langchain";
import { z } from "zod";

const DEFAULT_SEARCH_ROOT = "/workspace";
const DEFAULT_MAX_MATCHES = 5;

const projectSearchSchema = z.object({
  query: z.string().min(1),
  glob: z.string().min(1).optional(),
  maxMatches: z.number().int().min(1).max(20).optional(),
});

type ProjectSearchInput = z.infer<typeof projectSearchSchema>;

type ProjectSearchResult = {
  matchCount: number;
  matches: Array<{
    line: number;
    path: string;
    text: string;
  }>;
  summary: string;
};

export async function runProjectSearch(
  backend: BackendProtocolV2,
  input: ProjectSearchInput,
): Promise<ProjectSearchResult> {
  const grepResult = await backend.grep(
    input.query,
    DEFAULT_SEARCH_ROOT,
    input.glob ?? null,
  );

  if (grepResult.error) {
    return {
      matchCount: 0,
      matches: [],
      summary: grepResult.error,
    };
  }

  const rawMatches = grepResult.matches ?? [];
  const sortedMatches = [...rawMatches].sort((left, right) => {
    if (left.path === right.path) {
      return left.line - right.line;
    }

    return left.path.localeCompare(right.path);
  });
  const matchCount = sortedMatches.length;
  const limitedMatches = sortedMatches.slice(
    0,
    input.maxMatches ?? DEFAULT_MAX_MATCHES,
  );
  const fileCount = new Set(sortedMatches.map((match) => match.path)).size;

  return {
    matchCount,
    matches: limitedMatches.map((match) => ({
      line: match.line,
      path: match.path,
      text: match.text,
    })),
    summary:
      matchCount === 0
        ? `No workspace matches found for "${input.query}".`
        : `Found ${matchCount} workspace match(es) for "${input.query}" across ${fileCount} file(s).`,
  };
}

export function createProjectSearchTool(
  backend: AnyBackendProtocol | BackendFactory,
) {
  return tool(
    async (input, runtime: ToolRuntime) => {
      return await runProjectSearch(
        await resolveDeepAgentBackend(backend, runtime),
        input,
      );
    },
    {
      name: "project_search",
      description:
        "Search the AI Media Canvas workspace for matching project text without using shell execution.",
      schema: projectSearchSchema,
    },
  );
}
