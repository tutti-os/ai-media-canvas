"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { AgentModelSource } from "@aimc/shared";

const STORAGE_KEY = "aimc:agent-model";
const SOURCE_STORAGE_KEY = "aimc:agent-model-source";

type AgentModel = string | null; // null = let AI Media Canvas pick a sensible local default
type AgentModelSelection = {
  model: AgentModel;
  source: AgentModelSource | null;
};

const EMPTY_SELECTION: AgentModelSelection = { model: null, source: null };

// Listeners for cross-component reactivity
const listeners = new Set<() => void>();
function emitChange() {
  for (const listener of listeners) listener();
}

// Cache parsed result -- useSyncExternalStore requires stable references
let cachedRaw: string | null | undefined;
let cachedSourceRaw: string | null | undefined;
let cachedSelection: AgentModelSelection = EMPTY_SELECTION;

function normalizeSource(value: string | null): AgentModelSource | null {
  return value === "local-agent" ||
    value === "tutti-managed" ||
    value === "api-provider"
    ? value
    : null;
}

function getSnapshot(): AgentModelSelection {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const sourceRaw = localStorage.getItem(SOURCE_STORAGE_KEY);
    if (raw !== cachedRaw || sourceRaw !== cachedSourceRaw) {
      cachedRaw = raw;
      cachedSourceRaw = sourceRaw;
      cachedSelection = {
        model: raw || null,
        source: raw ? normalizeSource(sourceRaw) : null,
      };
    }
    return cachedSelection;
  } catch {
    return EMPTY_SELECTION;
  }
}

function getServerSnapshot(): AgentModelSelection {
  return EMPTY_SELECTION;
}

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

export function useAgentModel() {
  const selection = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  const setModel = useCallback((next: AgentModel, source?: AgentModelSource) => {
    if (next) {
      localStorage.setItem(STORAGE_KEY, next);
      if (source) {
        localStorage.setItem(SOURCE_STORAGE_KEY, source);
      } else {
        localStorage.removeItem(SOURCE_STORAGE_KEY);
      }
    } else {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(SOURCE_STORAGE_KEY);
    }
    emitChange();
  }, []);

  return { model: selection.model, modelSource: selection.source, setModel };
}
