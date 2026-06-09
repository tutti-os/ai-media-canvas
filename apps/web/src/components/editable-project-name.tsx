"use client";

import { useToast } from "@/components/toast";
import { useAppTranslation } from "@/i18n";
import { DEFAULT_PROJECT_NAME, formatProjectName } from "@/lib/project-display";
import { updateProject } from "@/lib/server-api";
import { useCallback, useEffect, useRef, useState } from "react";

interface EditableProjectNameProps {
  projectId: string;
  initialName: string;
}

export function EditableProjectName({
  projectId,
  initialName,
}: EditableProjectNameProps) {
  const [name, setName] = useState(initialName);
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const prevName = useRef(initialName);
  const { error: toastError } = useToast();
  const { t } = useAppTranslation("canvas");
  const displayName = formatProjectName(name, t("project.untitled"));

  // Sync if initialName changes externally
  useEffect(() => {
    setName(initialName);
    prevName.current = initialName;
  }, [initialName]);

  const save = useCallback(
    async (newName: string) => {
      const trimmed = newName.trim() || DEFAULT_PROJECT_NAME;
      const previousName = prevName.current;
      setName(trimmed);
      setEditing(false);
      if (trimmed !== previousName) {
        try {
          await updateProject(projectId, { name: trimmed });
          prevName.current = trimmed;
        } catch (err) {
          console.warn("Failed to update project name:", err);
          setName(previousName);
          toastError(t("project.renameFailed"));
        }
      }
    },
    [projectId, t, toastError],
  );

  const startEditing = useCallback(() => {
    setEditing(true);
    // Select all text after render
    requestAnimationFrame(() => inputRef.current?.select());
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        save(name);
      } else if (e.key === "Escape") {
        setName(prevName.current);
        setEditing(false);
      }
    },
    [name, save],
  );

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => save(name)}
        onKeyDown={handleKeyDown}
        className="h-8 rounded-lg bg-card/80 backdrop-blur-sm border border-border px-2.5 text-sm font-medium text-foreground outline-none focus:ring-1 focus:ring-ring/20 max-w-[200px]"
        maxLength={100}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={startEditing}
      className="h-8 rounded-lg bg-transparent hover:bg-card/60 backdrop-blur-sm px-2.5 text-sm font-medium text-foreground transition-colors truncate max-w-[200px] cursor-text"
      title={displayName}
    >
      {displayName}
    </button>
  );
}
