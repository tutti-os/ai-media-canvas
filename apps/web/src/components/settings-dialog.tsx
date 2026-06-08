"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { useAppTranslation } from "@/i18n";
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
  const { t } = useAppTranslation("settings");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        disableDefaultMaxWidth
        className="flex w-[min(1040px,calc(100vw-1.5rem))] max-h-[90vh] max-w-[min(1040px,calc(100vw-1.5rem))] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(1040px,calc(100vw-3rem))]"
      >
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle className="text-sm font-semibold tracking-[0.18em] uppercase text-muted-foreground">
            {t("dialogTitle")}
          </DialogTitle>
        </DialogHeader>
        <SettingsPanel initialTab={initialTab} surface="dialog" />
      </DialogContent>
    </Dialog>
  );
}
