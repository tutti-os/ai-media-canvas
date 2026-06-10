import {
  skillDetailResponseSchema,
  skillListResponseSchema,
} from "@aimc/shared";

import type { AuthenticatedUser } from "../auth/types.js";
import type { SkillService } from "../features/skills/skill-service.js";

export type SkillOperations = ReturnType<typeof createSkillOperations>;

export function createSkillOperations(options: {
  localUser: AuthenticatedUser;
  skillService: SkillService;
}) {
  return {
    async listInstalledSkills() {
      const skills = await options.skillService.listInstalledSkills(
        options.localUser,
      );
      return skillListResponseSchema.parse({ skills });
    },
    async getSkill(skillId: string) {
      const skill = await options.skillService.getSkillDetail(
        options.localUser,
        skillId,
      );
      return skillDetailResponseSchema.parse({ skill });
    },
    async installCatalogSkill(skillId: string) {
      const skill = await options.skillService.installCatalogSkill(
        options.localUser,
        skillId,
      );
      return skillDetailResponseSchema.parse({ skill });
    },
    async toggleSkill(skillId: string, enabled: boolean) {
      const skill = await options.skillService.toggleSkill(
        options.localUser,
        skillId,
        { enabled },
      );
      return skillDetailResponseSchema.parse({ skill });
    },
  };
}
