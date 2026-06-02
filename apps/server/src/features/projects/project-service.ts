import type {
  ProjectCreateRequest,
  ProjectSummary,
  ProjectUpdateRequest,
} from "@aimc/shared";

import type { AuthenticatedUser } from "../../auth/types.js";

export type ProjectService = {
  archiveProject(user: AuthenticatedUser, projectId: string): Promise<void>;
  createProject(
    user: AuthenticatedUser,
    input: ProjectCreateRequest,
  ): Promise<ProjectSummary>;
  getProject(
    user: AuthenticatedUser,
    projectId: string,
  ): Promise<{
    id: string;
    name: string;
    slug: string;
    description: string | null;
    workspace_id: string;
    brand_kit_id: string | null;
    created_at: string;
    updated_at: string;
  }>;
  listProjects(user: AuthenticatedUser): Promise<ProjectSummary[]>;
  saveThumbnail(
    user: AuthenticatedUser,
    projectId: string,
    buffer: Buffer,
    mimeType: string,
  ): Promise<{ thumbnailUrl: string }>;
  updateProject(
    user: AuthenticatedUser,
    projectId: string,
    input: ProjectUpdateRequest,
  ): Promise<void>;
};

export class ProjectServiceError extends Error {
  readonly statusCode: number;
  readonly code:
    | "brand_kit_not_found"
    | "project_create_failed"
    | "project_delete_failed"
    | "project_not_found"
    | "project_query_failed"
    | "project_slug_taken"
    | "project_update_failed";

  constructor(
    code:
      | "brand_kit_not_found"
      | "project_create_failed"
      | "project_delete_failed"
      | "project_not_found"
      | "project_query_failed"
      | "project_slug_taken"
      | "project_update_failed",
    message: string,
    statusCode: number,
  ) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}
