"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { useAppTranslation } from "@/i18n";
import type { AgentModelSourceTab } from "@/lib/agent-model-groups";
import { SettingsPanel, type SettingsTab } from "./settings-panel";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialTab?: SettingsTab;
  initialAgentSourceTab?: AgentModelSourceTab | undefined;
}

export function SettingsDialog({
  open,
  onOpenChange,
  initialTab = "agent",
  initialAgentSourceTab,
}: SettingsDialogProps) {
  const { t } = useAppTranslation("settings");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        disableDefaultMaxWidth
        className="flex h-[min(820px,calc(100vh-3rem))] w-[min(1040px,calc(100vw-1.5rem))] max-w-[min(1040px,calc(100vw-1.5rem))] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(1040px,calc(100vw-3rem))]"
      >
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle className="text-sm font-semibold tracking-[0.18em] uppercase text-muted-foreground">
            {t("dialogTitle")}
          </DialogTitle>
        </DialogHeader>
        <SettingsPanel
          initialTab={initialTab}
          initialAgentSourceTab={initialAgentSourceTab}
          surface="dialog"
        />
      </DialogContent>
    </Dialog>
  );
}
