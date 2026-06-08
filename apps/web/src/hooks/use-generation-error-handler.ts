"use client";

import { useCallback } from "react";

import { ApiApplicationError } from "@/lib/api-errors";
import { useToast } from "@/components/toast";

/**
 * Returns a handler function that inspects generation errors and routes them
 * to the local toast UI.
 *
 * @returns handleGenerationError(error) => boolean — true if the error was a
 *          known application error and was already surfaced to the user
 */
export function useGenerationErrorHandler() {
  const { error: showErrorToast } = useToast();

  const handleGenerationError = useCallback(
    (error: unknown): boolean => {
      if (!(error instanceof ApiApplicationError)) {
        // Not an application error — log for debugging, show generic toast to user
        console.error("[generation-error] Unexpected error:", error);
        showErrorToast("生成失败，请重试。");
        return false;
      }

      console.error("[generation-error] Application error:", error.code, error.message);
      showErrorToast(error.message || "生成失败，请重试。");
      return true;
    },
    [showErrorToast],
  );

  return { handleGenerationError };
}
