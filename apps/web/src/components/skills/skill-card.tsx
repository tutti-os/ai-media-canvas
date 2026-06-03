"use client";

import { motion } from "framer-motion";
import { ShieldCheck, Sparkles, UserPen, Users } from "lucide-react";
import { useCallback } from "react";
import type { SkillCategory, SkillListItem, SkillSource } from "@aimc/shared";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const CATEGORY_LABELS: Record<SkillCategory, string> = {
  design: "Design",
  generation: "Generation",
  code: "Code",
  data: "Data",
  writing: "Writing",
  custom: "Custom",
};

const SOURCE_CONFIG: Record<
  SkillSource,
  { label: string; icon: typeof ShieldCheck }
> = {
  system: { label: "官方", icon: ShieldCheck },
  community: { label: "社区", icon: Users },
  user: { label: "自定义", icon: UserPen },
};

function ToggleSwitch({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={(event) => {
        event.stopPropagation();
        onChange(!checked);
      }}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 sm:h-5 sm:w-9",
        checked ? "bg-primary" : "bg-muted",
      )}
    >
      <motion.span
        className="pointer-events-none block h-4 w-4 rounded-full bg-white shadow-sm sm:h-3.5 sm:w-3.5"
        animate={{ x: checked ? 22 : 4 }}
        transition={{ type: "spring", stiffness: 500, damping: 30 }}
      />
    </button>
  );
}

export function SkillCard({
  skill,
  onToggle,
  onClick,
  onUninstall,
}: {
  skill: SkillListItem;
  onToggle: (skillId: string, enabled: boolean) => void;
  onClick: (skill: SkillListItem) => void;
  onUninstall?: (skillId: string) => void;
}) {
  const sourceEntry = SOURCE_CONFIG[skill.source] ?? SOURCE_CONFIG.system;
  const SourceIcon = sourceEntry.icon;

  const handleToggle = useCallback(
    (next: boolean) => {
      onToggle(skill.id, next);
    },
    [onToggle, skill.id],
  );

  const formattedDate = new Date(skill.updatedAt).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return (
    <motion.div
      whileHover={{ y: -2, boxShadow: "0 4px 12px rgba(0,0,0,0.06)" }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
      onClick={() => onClick(skill)}
      className="group cursor-pointer rounded-xl border border-border bg-card p-4 transition-colors hover:bg-muted/50"
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
            {CATEGORY_LABELS[skill.category]}
          </span>
          <span className="truncate text-sm font-medium text-foreground">
            {skill.name}
          </span>
          {skill.isFeatured ? (
            <Sparkles className="size-3.5 shrink-0 text-muted-foreground" />
          ) : null}
        </div>

        <ToggleSwitch
          checked={skill.enabled ?? false}
          onChange={handleToggle}
        />
      </div>

      <p className="mb-3 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
        {skill.description}
      </p>

      <div className="border-t border-border" />

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
          <SourceIcon className="size-3" />
          {sourceEntry.label}
        </span>

        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground">
            {formattedDate}
          </span>
          <Button
            variant="ghost"
            size="xs"
            onClick={(event) => {
              event.stopPropagation();
              onClick(skill);
            }}
          >
            详情
          </Button>
          {skill.installed && onUninstall ? (
            <Button
              variant="outline"
              size="xs"
              onClick={(event) => {
                event.stopPropagation();
                onUninstall(skill.id);
              }}
            >
              卸载
            </Button>
          ) : null}
        </div>
      </div>
    </motion.div>
  );
}
