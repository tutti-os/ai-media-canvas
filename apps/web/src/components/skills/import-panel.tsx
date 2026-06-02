"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { CheckCircle2, FileUp, FolderOpen, Loader2 } from "lucide-react";
import type { SkillCategory } from "@aimc/shared";

import { Button } from "@/components/ui/button";
import { useToast } from "@/components/toast";
import { ApiApplicationError } from "@/lib/server-api";
import { cn } from "@/lib/utils";

const CATEGORY_OPTIONS: Array<{ value: SkillCategory; label: string }> = [
  { value: "design", label: "Design" },
  { value: "generation", label: "Generation" },
  { value: "code", label: "Code" },
  { value: "data", label: "Data" },
  { value: "writing", label: "Writing" },
  { value: "custom", label: "Custom" },
];

type SelectedImportFile = {
  filePath: string;
  content: string;
  mimeType: string;
};

export function ImportPanel({
  onImported,
  onSwitchToInstalled,
}: {
  onImported: (payload: {
    name?: string;
    description?: string;
    category?: SkillCategory;
    files: Array<{ filePath: string; content: string; mimeType?: string }>;
  }) => Promise<{ skillName: string }>;
  onSwitchToInstalled?: () => void;
}) {
  const { success, error: showError } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const directoryInputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<SelectedImportFile[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<SkillCategory>("custom");
  const [loading, setLoading] = useState(false);
  const [successName, setSuccessName] = useState<string | null>(null);

  const skillFile = useMemo(
    () => files.find((file) => /(^|\/)SKILL\.md$/i.test(file.filePath)),
    [files],
  );

  const handleFilesSelected = useCallback(async (selectedFiles: FileList | null) => {
    if (!selectedFiles || selectedFiles.length === 0) return;
    const nextFiles = await Promise.all(
      Array.from(selectedFiles).map(async (file) => ({
        filePath: file.webkitRelativePath || file.name,
        content: await file.text(),
        mimeType: file.type || "text/plain",
      })),
    );
    setFiles(nextFiles);
    setSuccessName(null);
  }, []);

  const handleImport = useCallback(async () => {
    if (files.length === 0) return;
    setLoading(true);
    try {
      const result = await onImported({
        ...(name.trim() ? { name: name.trim() } : {}),
        ...(description.trim() ? { description: description.trim() } : {}),
        category,
        files,
      });
      setSuccessName(result.skillName);
      success(`技能 "${result.skillName}" 导入成功`);
    } catch (error) {
      const message =
        error instanceof ApiApplicationError
          ? error.message
          : "导入失败，请检查本地文件内容后重试";
      showError(message);
    } finally {
      setLoading(false);
    }
  }, [category, description, files, name, onImported, showError, success]);

  const resetSelection = useCallback(() => {
    setFiles([]);
    setName("");
    setDescription("");
    setCategory("custom");
    setSuccessName(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  return (
    <div className="max-w-2xl">
      <div className="rounded-xl border border-border bg-card p-6">
          <div className="mb-5 flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-lg bg-muted">
            <FileUp className="size-4 text-muted-foreground" />
          </div>
          <div>
            <h3 className="text-sm font-medium text-foreground">从本地导入技能</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              选择本地 `SKILL.md`、skill 文件集合，或直接选择整个 skill 目录。
            </p>
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          accept=".md,.txt,.json,.js,.ts,.tsx,.mjs,.cjs,.yaml,.yml"
          onChange={(event) => void handleFilesSelected(event.target.files)}
        />
        <input
          ref={directoryInputRef}
          type="file"
          multiple
          className="hidden"
          {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
          onChange={(event) => void handleFilesSelected(event.target.files)}
        />

        <div
          className={cn(
            "rounded-xl border border-dashed border-border bg-muted/40 p-5",
            files.length > 0 && "border-foreground/20 bg-muted/20",
          )}
        >
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">
                {files.length > 0
                  ? `已选择 ${files.length} 个本地文件`
                  : "选择本地 skill 文件或目录"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {skillFile
                  ? `已识别 ${skillFile.filePath}`
                  : "建议至少包含一个 SKILL.md 文件，并尽量保留原目录结构。"}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
              >
                <FileUp className="size-3.5" />
                选择文件
              </Button>
              <Button
                variant="outline"
                onClick={() => directoryInputRef.current?.click()}
              >
                <FolderOpen className="size-3.5" />
                选择目录
              </Button>
            </div>
          </div>

          {files.length > 0 ? (
            <div className="mt-4 space-y-2">
              {files.slice(0, 6).map((file) => (
                <div
                  key={file.filePath}
                  className="rounded-lg border border-border bg-background px-3 py-2 text-xs text-muted-foreground"
                >
                  {file.filePath}
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">名称（可选）</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="默认从 SKILL.md 标题提取"
              className="h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">分类</span>
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value as SkillCategory)}
              className="h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {CATEGORY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="mt-3 block space-y-1">
          <span className="text-xs text-muted-foreground">描述（可选）</span>
          <textarea
            rows={3}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="默认从 SKILL.md 的 Description 段落提取"
            className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </label>

        {successName ? (
          <div className="mt-4 flex items-center justify-between rounded-lg border border-border bg-muted/50 px-4 py-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="size-4 text-emerald-500" />
              <span className="text-sm font-medium text-foreground">
                {successName}
              </span>
              <span className="text-xs text-muted-foreground">已导入</span>
            </div>
            <div className="flex items-center gap-2">
              {onSwitchToInstalled ? (
                <Button variant="outline" size="xs" onClick={onSwitchToInstalled}>
                  查看已安装
                </Button>
              ) : null}
              <Button variant="ghost" size="xs" onClick={resetSelection}>
                继续导入
              </Button>
            </div>
          </div>
        ) : null}

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={resetSelection}>
            清空
          </Button>
          <Button disabled={files.length === 0 || loading} onClick={() => void handleImport()}>
            {loading ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                导入中...
              </>
            ) : (
              <>
                <FileUp className="size-3.5" />
                导入到本地
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
