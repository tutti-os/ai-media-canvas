import type {
  SkillCreateRequest,
  SkillDetail,
  SkillImportRequest,
  SkillListItem,
  SkillToggleRequest,
} from "@aimc/shared";

import type { AuthenticatedUser } from "../../auth/types.js";

export type SkillService = {
  createSkill(user: AuthenticatedUser, input: SkillCreateRequest): Promise<SkillDetail>;
  getSkillDetail(user: AuthenticatedUser, skillId: string): Promise<SkillDetail>;
  importSkill(user: AuthenticatedUser, input: SkillImportRequest): Promise<SkillDetail>;
  installCatalogSkill(user: AuthenticatedUser, skillId: string): Promise<SkillDetail>;
  listCatalogSkills(user: AuthenticatedUser): Promise<SkillListItem[]>;
  listInstalledSkills(user: AuthenticatedUser): Promise<SkillListItem[]>;
  listEnabledSkills(user: AuthenticatedUser): Promise<SkillListItem[]>;
  toggleSkill(user: AuthenticatedUser, skillId: string, input: SkillToggleRequest): Promise<SkillDetail>;
  uninstallSkill(user: AuthenticatedUser, skillId: string): Promise<void>;
};

export class SkillServiceError extends Error {
  readonly statusCode: number;
  readonly code:
    | "skill_create_failed"
    | "skill_import_failed"
    | "skill_install_failed"
    | "skill_not_found"
    | "skill_query_failed"
    | "skill_toggle_failed"
    | "skill_uninstall_failed";

  constructor(
    code:
      | "skill_create_failed"
      | "skill_import_failed"
      | "skill_install_failed"
      | "skill_not_found"
      | "skill_query_failed"
      | "skill_toggle_failed"
      | "skill_uninstall_failed",
    message: string,
    statusCode: number,
  ) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}
