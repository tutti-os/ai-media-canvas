"use client";

import { useCallback, useState } from "react";
import { FileText, Plus, X } from "lucide-react";
import type { SkillCategory } from "@aimc/shared";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAppTranslation } from "@/i18n";

const SKILL_TEMPLATE = `# Skill Name

## Description
Describe what this skill does and when the agent should use it.

## Instructions
1. Step-by-step instructions for the agent.
2. Be specific about inputs, outputs, and constraints.

## Examples
\`\`\`
User: example prompt
Agent: example response
\`\`\`

## Constraints
- List any limitations or boundaries.
`;

const CATEGORY_OPTIONS: Array<{ value: SkillCategory; label: string }> = [
  { value: "design", label: "Design" },
  { value: "generation", label: "Generation" },
  { value: "code", label: "Code" },
  { value: "data", label: "Data" },
  { value: "writing", label: "Writing" },
  { value: "custom", label: "Custom" },
];

const VALID_PATH_PREFIXES = ["scripts/", "references/", "assets/"];

function isValidFilePath(path: string) {
  return VALID_PATH_PREFIXES.some((prefix) => path.startsWith(prefix));
}

export function CreateSkillDialog({
  open,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: {
    name: string;
    description: string;
    category: SkillCategory;
    skillContent: string;
    files?: Array<{ filePath: string; content: string }>;
  }) => Promise<void>;
}) {
  const { t } = useAppTranslation("skills");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<SkillCategory>("custom");
  const [skillContent, setSkillContent] = useState("");
  const [files, setFiles] = useState<
    Array<{ filePath: string; content: string }>
  >([]);
  const [submitting, setSubmitting] = useState(false);

  const addFile = useCallback(() => {
    setFiles((prev) => [...prev, { filePath: "", content: "" }]);
  }, []);

  const removeFile = useCallback((index: number) => {
    setFiles((prev) => prev.filter((_, current) => current !== index));
  }, []);

  const updateFile = useCallback(
    (index: number, field: "filePath" | "content", value: string) => {
      setFiles((prev) =>
        prev.map((file, current) =>
          current === index ? { ...file, [field]: value } : file,
        ),
      );
    },
    [],
  );

  const resetForm = useCallback(() => {
    setName("");
    setDescription("");
    setCategory("custom");
    setSkillContent("");
    setFiles([]);
  }, []);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) resetForm();
      onOpenChange(next);
    },
    [onOpenChange, resetForm],
  );

  const handleSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (!name.trim() || !description.trim() || !skillContent.trim()) return;
      const validFiles = files.filter(
        (file) =>
          file.filePath.trim() &&
          file.content.trim() &&
          isValidFilePath(file.filePath.trim()),
      );

      setSubmitting(true);
      try {
        await onSubmit({
          name,
          description,
          category,
          skillContent,
          ...(validFiles.length > 0 ? { files: validFiles } : {}),
        });
        handleOpenChange(false);
      } finally {
        setSubmitting(false);
      }
    },
    [
      category,
      description,
      files,
      handleOpenChange,
      name,
      onSubmit,
      skillContent,
    ],
  );

  const canSubmit =
    name.trim().length > 0 &&
    description.trim().length > 0 &&
    skillContent.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("createDialog.title")}</DialogTitle>
          <DialogDescription>{t("createDialog.description")}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="skill-name">{t("fields.name")}</Label>
            <Input
              id="skill-name"
              placeholder="e.g. UI Design Expert"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={200}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="skill-category">{t("fields.category")}</Label>
            <select
              id="skill-category"
              value={category}
              onChange={(event) =>
                setCategory(event.target.value as SkillCategory)
              }
              className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {CATEGORY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="skill-desc">{t("fields.description")}</Label>
            <textarea
              id="skill-desc"
              rows={2}
              placeholder={t("createDialog.descriptionPlaceholder")}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={2000}
              className="w-full resize-none rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="skill-content">SKILL.md</Label>
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={() => setSkillContent(SKILL_TEMPLATE)}
              >
                {t("createDialog.useTemplate")}
              </Button>
            </div>
            <textarea
              id="skill-content"
              rows={12}
              placeholder="# Skill Name..."
              value={skillContent}
              onChange={(event) => setSkillContent(event.target.value)}
              className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 font-mono text-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>{t("detail.attachments")}</Label>
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={addFile}
              >
                <Plus className="size-3.5" />
                {t("createDialog.addFile")}
              </Button>
            </div>
            {files.map((file, index) => {
              const pathValid =
                file.filePath.trim().length === 0 ||
                isValidFilePath(file.filePath.trim());
              return (
                <div
                  key={`${index}-${file.filePath}`}
                  className="space-y-2 rounded-lg border border-border p-3"
                >
                  <div className="flex items-center gap-2">
                    <FileText className="size-4 text-muted-foreground" />
                    <Input
                      placeholder="scripts/tool.ts"
                      value={file.filePath}
                      onChange={(event) =>
                        updateFile(index, "filePath", event.target.value)
                      }
                      className={pathValid ? "" : "border-destructive"}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => removeFile(index)}
                    >
                      <X className="size-3.5" />
                    </Button>
                  </div>
                  {!pathValid ? (
                    <p className="text-[11px] text-destructive">
                      {t("createDialog.invalidPath")}
                    </p>
                  ) : null}
                  <textarea
                    rows={4}
                    placeholder={t("createDialog.fileContentPlaceholder")}
                    value={file.content}
                    onChange={(event) =>
                      updateFile(index, "content", event.target.value)
                    }
                    className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 font-mono text-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  />
                </div>
              );
            })}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
            >
              {t("actions.cancel")}
            </Button>
            <Button type="submit" disabled={!canSubmit || submitting}>
              {submitting ? t("createDialog.adding") : t("customCard.add")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
