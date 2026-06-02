"use client";

import { useCallback, useState } from "react";
import {
  Calendar,
  ChevronRight,
  ShieldCheck,
  Trash2,
  UserPen,
  Users,
} from "lucide-react";
import type { SkillDetail, SkillFileEntry, SkillSource } from "@aimc/shared";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const SOURCE_CONFIG: Record<
  SkillSource,
  { label: string; icon: typeof ShieldCheck }
> = {
  system: { label: "官方", icon: ShieldCheck },
  community: { label: "社区", icon: Users },
  user: { label: "自定义", icon: UserPen },
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
  onDelete,
}: {
  skill: SkillDetail | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInstall: (skillId: string) => Promise<void>;
  onUninstall: (skillId: string) => Promise<void>;
  onDelete?: (skillId: string) => Promise<void>;
}) {
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

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

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) setConfirmDelete(false);
      onOpenChange(next);
    },
    [onOpenChange],
  );

  if (!skill) return null;

  const sourceEntry = SOURCE_CONFIG[skill.source] ?? SOURCE_CONFIG.system;
  const SourceIcon = sourceEntry.icon;
  const isUserSkill = skill.source === "user";
  const isInstalled = skill.installed ?? false;
  const updatedDate = new Date(skill.updatedAt).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {skill.name}
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              <SourceIcon className="size-3" />
              {sourceEntry.label}
            </span>
          </DialogTitle>
          <DialogDescription>{skill.description}</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="space-y-0.5">
            <span className="text-muted-foreground">作者</span>
            <p className="font-medium text-foreground">{skill.author}</p>
          </div>
          <div className="space-y-0.5">
            <span className="text-muted-foreground">版本</span>
            <p className="font-medium text-foreground">v{skill.version}</p>
          </div>
          {skill.license ? (
            <div className="space-y-0.5">
              <span className="text-muted-foreground">许可证</span>
              <p className="font-medium text-foreground">{skill.license}</p>
            </div>
          ) : null}
          <div className="space-y-0.5">
            <span className="flex items-center gap-1 text-muted-foreground">
              <Calendar className="size-3" />
              更新日期
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
              附属文件 ({skill.files.length})
            </span>
            <div className="overflow-hidden rounded-lg border border-border divide-y divide-border">
              {skill.files.map((file) => (
                <FileTreeItem key={file.id} file={file} />
              ))}
            </div>
          </div>
        ) : null}

        <DialogFooter>
          {isUserSkill && onDelete ? (
            confirmDelete ? (
              <div className="mr-auto flex items-center gap-2">
                <span className="text-xs text-destructive">确认删除?</span>
                <Button
                  variant="destructive"
                  size="xs"
                  disabled={actionLoading === "delete"}
                  onClick={() =>
                    handleAction(() => onDelete(skill.id), "delete")
                  }
                >
                  <Trash2 className="size-3.5" />
                  删除
                </Button>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => setConfirmDelete(false)}
                >
                  取消
                </Button>
              </div>
            ) : (
              <Button
                variant="ghost"
                size="xs"
                className="mr-auto text-destructive"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 className="size-3.5" />
                删除
              </Button>
            )
          ) : null}

          {isInstalled ? (
            <Button
              variant="outline"
              disabled={actionLoading === "uninstall"}
              onClick={() => handleAction(() => onUninstall(skill.id), "uninstall")}
            >
              卸载
            </Button>
          ) : (
            <Button
              disabled={actionLoading === "install"}
              onClick={() => handleAction(() => onInstall(skill.id), "install")}
            >
              安装到本地
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
