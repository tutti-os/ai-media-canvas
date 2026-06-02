"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { SettingsPanel, type SettingsTab } from "./settings-panel";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialTab?: SettingsTab;
}

export function SettingsDialog({
  open,
  onOpenChange,
  initialTab = "agent",
}: SettingsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="h-[min(90vh,820px)] w-[min(1180px,calc(100vw-1.5rem))] max-w-[min(1180px,calc(100vw-1.5rem))] gap-0 overflow-hidden p-0 sm:max-w-[min(1180px,calc(100vw-3rem))]"
      >
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle className="text-sm font-semibold tracking-[0.18em] uppercase text-muted-foreground">
            Settings
          </DialogTitle>
        </DialogHeader>
        <SettingsPanel initialTab={initialTab} surface="dialog" />
      </DialogContent>
    </Dialog>
  );
}
