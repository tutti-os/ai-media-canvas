"use client";

import type {
  ImageGenerationPreference,
  VideoGenerationPreference,
} from "@aimc/shared";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";

import { useToast } from "@/components/toast";
import type { ReadyAttachment } from "@/hooks/use-image-attachments";
import { useAppTranslation } from "@/i18n";
import { createProject } from "@/lib/server-api";

/** sessionStorage key used to pass attachments into the next canvas session. */
export const INITIAL_ATTACHMENTS_KEY = "aimc:initial-attachments";
export const INITIAL_IMAGE_GENERATION_PREFERENCE_KEY =
  "aimc:initial-image-generation-preference";
export const INITIAL_VIDEO_GENERATION_PREFERENCE_KEY =
  "aimc:initial-video-generation-preference";
export const INITIAL_AGENT_MODEL_KEY = "aimc:initial-agent-model";

function clearInitialCreateProjectState() {
  sessionStorage.removeItem(INITIAL_ATTACHMENTS_KEY);
  sessionStorage.removeItem(INITIAL_IMAGE_GENERATION_PREFERENCE_KEY);
  sessionStorage.removeItem(INITIAL_VIDEO_GENERATION_PREFERENCE_KEY);
  sessionStorage.removeItem(INITIAL_AGENT_MODEL_KEY);
}

/**
 * Shared hook for creating an Untitled project and navigating to its canvas.
 * Used by the projects page and canvas navigation entry points.
 */
export function useCreateProject() {
  const router = useRouter();
  const { error: toastError } = useToast();
  const { t } = useAppTranslation("errors");
  const [creating, setCreating] = useState(false);
  const creatingRef = useRef(false);

  const routerRef = useRef(router);
  routerRef.current = router;

  const create = useCallback(
    async (opts?: {
      prompt?: string;
      attachments?: ReadyAttachment[];
      imageGenerationPreference?: ImageGenerationPreference;
      videoGenerationPreference?: VideoGenerationPreference;
      model?: string;
    }) => {
      if (creatingRef.current) return;
      creatingRef.current = true;

      // Persist attachments in sessionStorage BEFORE window.open so the
      // new tab's cloned sessionStorage already contains them.
      // (sessionStorage is per-tab; new tabs get a snapshot at open time.)
      if (opts?.attachments && opts.attachments.length > 0) {
        try {
          sessionStorage.setItem(
            INITIAL_ATTACHMENTS_KEY,
            JSON.stringify(opts.attachments),
          );
        } catch {
          // sessionStorage write failure is non-fatal
        }
      } else {
        sessionStorage.removeItem(INITIAL_ATTACHMENTS_KEY);
      }

      if (opts?.imageGenerationPreference) {
        try {
          sessionStorage.setItem(
            INITIAL_IMAGE_GENERATION_PREFERENCE_KEY,
            JSON.stringify(opts.imageGenerationPreference),
          );
        } catch {
          // sessionStorage write failure is non-fatal
        }
      } else {
        sessionStorage.removeItem(INITIAL_IMAGE_GENERATION_PREFERENCE_KEY);
      }

      if (opts?.videoGenerationPreference) {
        try {
          sessionStorage.setItem(
            INITIAL_VIDEO_GENERATION_PREFERENCE_KEY,
            JSON.stringify(opts.videoGenerationPreference),
          );
        } catch {
          // sessionStorage write failure is non-fatal
        }
      } else {
        sessionStorage.removeItem(INITIAL_VIDEO_GENERATION_PREFERENCE_KEY);
      }

      if (opts?.model) {
        try {
          sessionStorage.setItem(INITIAL_AGENT_MODEL_KEY, opts.model);
        } catch {
          // sessionStorage write failure is non-fatal
        }
      } else {
        sessionStorage.removeItem(INITIAL_AGENT_MODEL_KEY);
      }

      const newTab = window.open("/loading-preview", "_blank");

      setCreating(true);
      try {
        const result = await createProject({ name: "Untitled" });
        const canvasId = result.project.primaryCanvas.id;

        const url = opts?.prompt
          ? `/canvas?id=${canvasId}&prompt=${encodeURIComponent(opts.prompt)}`
          : `/canvas?id=${canvasId}`;

        if (newTab) {
          try {
            newTab.location.href = url;
          } catch {
            newTab.close();
            routerRef.current.push(url);
          }
        } else {
          // Popup was blocked despite sync open — fallback to in-page navigation
          routerRef.current.push(url);
        }
      } catch {
        clearInitialCreateProjectState();
        // Close the blank tab on failure
        newTab?.close();
        toastError(t("project.createFailed"));
      } finally {
        creatingRef.current = false;
        setCreating(false);
      }
    },
    [t, toastError],
  );

  return { create, creating };
}
