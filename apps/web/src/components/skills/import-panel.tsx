"use client";

import type { SkillCategory } from "@aimc/shared";
import { CheckCircle2, FileUp, FolderOpen, Loader2 } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";

import { useToast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { useAppTranslation } from "@/i18n";
import { ApiApplicationError } from "@/lib/api-errors";
import { cn } from "@/lib/utils";

const CATEGORY_OPTIONS: Array<{ value: SkillCategory; label: string }> = [
  { value: "design", label: "Design" },
  { value: "generation", label: "Generation" },
  { value: "code", label: "Code" },
  { value: "data", label: "Data" },
  { value: "writing", label: "Writing" },
  { value: "custom", label: "Custom" },
];

const MAX_IMPORT_FILE_BYTES = 2 * 1024 * 1024;
const TEXT_FILE_EXTENSIONS = new Set([
  "cjs",
  "css",
  "csv",
  "gitignore",
  "html",
  "js",
  "json",
  "jsx",
  "md",
  "mjs",
  "py",
  "sh",
  "toml",
  "ts",
  "tsx",
  "txt",
  "xml",
  "yaml",
  "yml",
]);
const TEXT_MIME_TYPES = new Set([
  "application/javascript",
  "application/json",
  "application/typescript",
  "application/x-javascript",
  "application/x-sh",
  "application/x-yaml",
  "application/xml",
]);

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
  const { t } = useAppTranslation("skills");
  const { success, error: showError } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const directoryInputRef = useRef<HTMLInputElement>(null);
  const nameTouchedRef = useRef(false);
  const descriptionTouchedRef = useRef(false);
  const [files, setFiles] = useState<SelectedImportFile[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<SkillCategory>("custom");
  const [loading, setLoading] = useState(false);
  const [successName, setSuccessName] = useState<string | null>(null);
  const [skippedFileCount, setSkippedFileCount] = useState(0);

  const skillFile = useMemo(
    () => files.find((file) => /(^|\/)SKILL\.md$/i.test(file.filePath)),
    [files],
  );

  const handleFilesSelected = useCallback(
    async (selectedFiles: FileList | null) => {
      if (!selectedFiles || selectedFiles.length === 0) return;
      const candidateFiles = Array.from(selectedFiles);
      const importableFiles = candidateFiles.filter(isImportableSkillFile);
      setSkippedFileCount(candidateFiles.length - importableFiles.length);
      if (importableFiles.length === 0) {
        setFiles([]);
        setSuccessName(null);
        showError(t("toasts.noImportableFiles"));
        return;
      }
      const nextFiles = await Promise.all(
        importableFiles.map(async (file) => ({
          filePath: file.webkitRelativePath || file.name,
          content: await file.text(),
          mimeType: file.type || "text/plain",
        })),
      );
      setFiles(nextFiles);
      const nextSkillFile = nextFiles.find((file) =>
        /(^|\/)SKILL\.md$/i.test(file.filePath),
      );
      if (nextSkillFile) {
        const metadata = extractSkillMetadata(
          nextSkillFile.content,
          nextSkillFile.filePath,
        );
        if (!nameTouchedRef.current) {
          setName(metadata.name ?? "");
        }
        if (!descriptionTouchedRef.current) {
          setDescription(metadata.description ?? "");
        }
      }
      setSuccessName(null);
    },
    [showError, t],
  );

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
      success(t("toasts.imported", { name: result.skillName }));
    } catch (error) {
      const message =
        error instanceof ApiApplicationError
          ? error.message
          : t("toasts.importFailed");
      showError(message);
    } finally {
      setLoading(false);
    }
  }, [category, description, files, name, onImported, showError, success, t]);

  const resetSelection = useCallback(() => {
    setFiles([]);
    setName("");
    setDescription("");
    nameTouchedRef.current = false;
    descriptionTouchedRef.current = false;
    setCategory("custom");
    setSuccessName(null);
    setSkippedFileCount(0);
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
            <h3 className="text-sm font-medium text-foreground">
              {t("importPanel.title")}
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t("importPanel.description")}
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
          {...({ webkitdirectory: "", directory: "" } as Record<
            string,
            string
          >)}
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
                  ? t("importPanel.selectedFiles", { count: files.length })
                  : t("importPanel.chooseSkill")}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {skillFile
                  ? t("importPanel.detectedFile", { path: skillFile.filePath })
                  : t("importPanel.suggestion")}
              </p>
              {skippedFileCount > 0 ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("importPanel.skippedFiles", { count: skippedFileCount })}
                </p>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
              >
                <FileUp className="size-3.5" />
                {t("importPanel.chooseFiles")}
              </Button>
              <Button
                variant="outline"
                onClick={() => directoryInputRef.current?.click()}
              >
                <FolderOpen className="size-3.5" />
                {t("importPanel.chooseDirectory")}
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
            <span className="text-xs text-muted-foreground">
              {t("fields.nameOptional")}
            </span>
            <input
              value={name}
              onChange={(event) => {
                nameTouchedRef.current = true;
                setName(event.target.value);
              }}
              placeholder={t("importPanel.namePlaceholder")}
              className="h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">
              {t("fields.category")}
            </span>
            <select
              value={category}
              onChange={(event) =>
                setCategory(event.target.value as SkillCategory)
              }
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
          <span className="text-xs text-muted-foreground">
            {t("fields.descriptionOptional")}
          </span>
          <textarea
            rows={3}
            value={description}
            onChange={(event) => {
              descriptionTouchedRef.current = true;
              setDescription(event.target.value);
            }}
            placeholder={t("importPanel.descriptionPlaceholder")}
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
              <span className="text-xs text-muted-foreground">
                {t("importPanel.imported")}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {onSwitchToInstalled ? (
                <Button
                  variant="outline"
                  size="xs"
                  onClick={onSwitchToInstalled}
                >
                  {t("importPanel.viewInstalled")}
                </Button>
              ) : null}
              <Button variant="ghost" size="xs" onClick={resetSelection}>
                {t("importPanel.continueImport")}
              </Button>
            </div>
          </div>
        ) : null}

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={resetSelection}>
            {t("actions.clear")}
          </Button>
          <Button
            disabled={files.length === 0 || loading}
            onClick={() => void handleImport()}
          >
            {loading ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                {t("importPanel.importing")}
              </>
            ) : (
              <>
                <FileUp className="size-3.5" />
                {t("importPanel.importLocal")}
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

function extractSkillMetadata(content: string, filePath: string) {
  const frontmatter = parseLooseFrontmatter(content);
  return {
    name:
      frontmatter.name ??
      /^#\s+(.+)$/m.exec(content)?.[1]?.trim() ??
      deriveNameFromPath(filePath),
    description:
      frontmatter.description ?? extractDescriptionSection(content) ?? "",
  };
}

function parseLooseFrontmatter(content: string) {
  const lines = content.trimStart().split(/\r?\n/);
  const metadata: Record<string, string> = {};
  let index = lines[0]?.trim() === "---" ? 1 : 0;

  for (; index < lines.length; index++) {
    const line = lines[index];
    if (!line) break;
    const trimmed = line.trim();
    if (!trimmed || trimmed === "---" || trimmed.startsWith("#")) break;
    const match = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(trimmed);
    if (!match) break;
    const key = match[1];
    if (!key) break;
    metadata[key.toLowerCase()] = stripYamlScalar(match[2] ?? "");
  }

  return metadata;
}

function stripYamlScalar(value: string) {
  const trimmed = value.trim();
  const quoted = /^(['"])([\s\S]*)\1$/.exec(trimmed);
  return (quoted?.[2] ?? trimmed).trim();
}

function extractDescriptionSection(content: string) {
  const match = /## Description\s+([\s\S]*?)(?:\n## |\n# |$)/i.exec(content);
  return match?.[1]?.trim();
}

function deriveNameFromPath(filePath: string) {
  const parts = filePath.split("/").filter(Boolean);
  const basename = parts.at(-1) ?? filePath;
  const source =
    /^SKILL\.md$/i.test(basename) && parts.length > 1
      ? (parts.at(-2) ?? basename)
      : basename.replace(/\.[^.]+$/, "");
  return (
    source
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase()) || "Imported Skill"
  );
}

function isImportableSkillFile(file: File) {
  if (file.size > MAX_IMPORT_FILE_BYTES) {
    return false;
  }
  const path = file.webkitRelativePath || file.name;
  if (/(^|\/)SKILL\.md$/i.test(path)) {
    return true;
  }
  const mimeType = file.type.toLowerCase();
  if (mimeType.startsWith("text/") || TEXT_MIME_TYPES.has(mimeType)) {
    return true;
  }
  const extension = /\.([^.\/]+)$/.exec(path)?.[1]?.toLowerCase();
  return extension ? TEXT_FILE_EXTENSIONS.has(extension) : false;
}
