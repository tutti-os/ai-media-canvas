"use client";

export const WORKSPACE_SETTINGS_UPDATED_EVENT =
  "aimc:workspace-settings-updated";

export function notifyWorkspaceSettingsUpdated() {
  window.dispatchEvent(new Event(WORKSPACE_SETTINGS_UPDATED_EVENT));
}
