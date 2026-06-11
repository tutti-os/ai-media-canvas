"use client";

import type { SkillDetail, SkillFileEntry, SkillSource } from "@aimc/shared";
import {
  Calendar,
  ChevronRight,
  ShieldCheck,
  UserPen,
  Users,
} from "lucide-react";
import { useCallback, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAppTranslation } from "@/i18n";
import { cn } from "@/lib/utils";

const SOURCE_CONFIG: Record<
  SkillSource,
  { labelKey: string; icon: typeof ShieldCheck }
> = {
  system: { labelKey: "sources.system", icon: ShieldCheck },
  community: { labelKey: "sources.community", icon: Users },
  user: { labelKey: "sources.user", icon: UserPen },
};

function FileTreeItem({ file }: { file: SkillFileEntry }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full items-center gap-2 px-3 py-2 text-xs font-mono text-foreground transition-colors hover:bg-muted/50"
      >
        <ChevronRight
          className={cn(
            "size-3 shrink-0 transition-transform duration-150",
            expanded && "rotate-90",
          )}
        />
        <span className="truncate">{file.filePath}</span>
      </button>
      {expanded ? (
        <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words border-t border-border bg-secondary/50 px-3 pb-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
          {file.content}
        </pre>
      ) : null}
    </div>
  );
}

export function SkillDetailDialog({
  skill,
  open,
  onOpenChange,
  onInstall,
  onUninstall,
}: {
  skill: SkillDetail | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInstall: (skillId: string) => Promise<void>;
  onUninstall: (skillId: string) => Promise<void>;
}) {
  const { i18n, t } = useAppTranslation("skills");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const handleAction = useCallback(
    async (action: () => Promise<void>, label: string) => {
      setActionLoading(label);
      try {
        await action();
      } finally {
        setActionLoading(null);
      }
    },
    [],
  );

  if (!skill) return null;

  const sourceEntry = SOURCE_CONFIG[skill.source] ?? SOURCE_CONFIG.system;
  const SourceIcon = sourceEntry.icon;
  const isInstalled = skill.installed ?? false;
  const updatedDate = new Date(skill.updatedAt).toLocaleDateString(
    i18n.language === "en" ? "en" : "zh-CN",
    {
      year: "numeric",
      month: "long",
      day: "numeric",
    },
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-start gap-3 pr-12">
            <span className="min-w-0 flex-1 break-words text-left">
              {skill.name}
            </span>
            <span
              data-testid="skill-detail-source-badge"
              className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
            >
              <SourceIcon className="size-3" />
              {t(sourceEntry.labelKey)}
            </span>
          </DialogTitle>
          <DialogDescription>{skill.description}</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="space-y-0.5">
            <span className="text-muted-foreground">{t("detail.author")}</span>
            <p className="font-medium text-foreground">{skill.author}</p>
          </div>
          <div className="space-y-0.5">
            <span className="text-muted-foreground">{t("detail.version")}</span>
            <p className="font-medium text-foreground">v{skill.version}</p>
          </div>
          {skill.license ? (
            <div className="space-y-0.5">
              <span className="text-muted-foreground">
                {t("detail.license")}
              </span>
              <p className="font-medium text-foreground">{skill.license}</p>
            </div>
          ) : null}
          <div className="space-y-0.5">
            <span className="flex items-center gap-1 text-muted-foreground">
              <Calendar className="size-3" />
              {t("detail.updatedAt")}
            </span>
            <p className="font-medium text-foreground">{updatedDate}</p>
          </div>
        </div>

        <div className="space-y-1.5">
          <span className="text-xs font-medium text-muted-foreground">
            SKILL.md
          </span>
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-secondary p-3 font-mono text-xs leading-relaxed text-foreground">
            {skill.skillContent}
          </pre>
        </div>

        {skill.files && skill.files.length > 0 ? (
          <div className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              {t("detail.files", { count: skill.files.length })}
            </span>
            <div className="overflow-hidden rounded-lg border border-border divide-y divide-border">
              {skill.files.map((file) => (
                <FileTreeItem key={file.id} file={file} />
              ))}
            </div>
          </div>
        ) : null}

        <DialogFooter>
          {isInstalled ? (
            <Button
              variant="outline"
              disabled={actionLoading === "uninstall"}
              onClick={() =>
                handleAction(() => onUninstall(skill.id), "uninstall")
              }
            >
              {t("actions.uninstall")}
            </Button>
          ) : (
            <Button
              disabled={actionLoading === "install"}
              onClick={() => handleAction(() => onInstall(skill.id), "install")}
            >
              {t("actions.install")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
