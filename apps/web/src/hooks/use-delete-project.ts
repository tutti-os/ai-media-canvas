"use client";

import { useCallback, useState } from "react";
import { LOCAL_ACCESS_TOKEN } from "@/lib/auth-context";
import { useToast } from "@/components/toast";
import { deleteProject } from "@/lib/server-api";

/**
 * Shared hook for deleting a project with confirmation dialog state.
 * Used by Home page, Projects page, and Canvas logo menu.
 */
export function useDeleteProject(opts?: {
  onDeleted?: (projectId: string) => void;
}) {
  const { success: toastSuccess, error: toastError } = useToast();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  /** Step 1: open confirm dialog */
  const requestDelete = useCallback((projectId: string) => {
    setPendingId(projectId);
  }, []);

  /** Step 2: user confirms */
  const confirmDelete = useCallback(async () => {
    if (!pendingId) return;

    setDeleting(true);
    try {
      await deleteProject(LOCAL_ACCESS_TOKEN, pendingId);
      toastSuccess("项目已删除");
      opts?.onDeleted?.(pendingId);
    } catch {
      toastError("项目删除失败");
    } finally {
      setDeleting(false);
      setPendingId(null);
    }
  }, [pendingId, toastSuccess, toastError, opts]);

  /** Step 3: user cancels */
  const cancelDelete = useCallback(() => {
    setPendingId(null);
  }, []);

  return {
    /** The project ID pending confirmation, null if no dialog open */
    pendingId,
    /** Whether the delete API call is in progress */
    deleting,
    /** Open confirm dialog for a project */
    requestDelete,
    /** Confirm and execute deletion */
    confirmDelete,
    /** Cancel and close dialog */
    cancelDelete,
  };
}
