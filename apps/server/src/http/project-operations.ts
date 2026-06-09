import {
  type ProjectCreateRequest,
  projectCreateResponseSchema,
  projectDetailResponseSchema,
  projectListResponseSchema,
} from "@aimc/shared";

import type { AuthenticatedUser } from "../auth/types.js";
import type { ProjectService } from "../features/projects/project-service.js";

export type ProjectOperations = ReturnType<typeof createProjectOperations>;

export function createProjectOperations(options: {
  localUser: AuthenticatedUser;
  projectService: ProjectService;
}) {
  return {
    async listProjects() {
      const projects = await options.projectService.listProjects(
        options.localUser,
      );
      return projectListResponseSchema.parse({ projects });
    },
    async getProject(projectId: string) {
      const project = await options.projectService.getProject(
        options.localUser,
        projectId,
      );
      return projectDetailResponseSchema.parse({
        project: {
          id: project.id,
          name: project.name,
          slug: project.slug,
          description: project.description,
          brandKitId: project.brand_kit_id,
          createdAt: project.created_at,
          updatedAt: project.updated_at,
        },
      });
    },
    async createProject(input: ProjectCreateRequest) {
      const project = await options.projectService.createProject(
        options.localUser,
        input,
      );
      return projectCreateResponseSchema.parse({ project });
    },
  };
}
