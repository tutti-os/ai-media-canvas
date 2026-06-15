"use client";

import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";

import { useAppTranslation } from "@/i18n";
import { Button } from "./ui/button";
import { Dialog, DialogContent } from "./ui/dialog";

interface DeleteProjectDialogProps {
  open: boolean;
  deleting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DeleteProjectDialog({
  open,
  deleting,
  onConfirm,
  onCancel,
}: DeleteProjectDialogProps) {
  const { t } = useAppTranslation("projects");

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onCancel();
      }}
    >
      <DialogContent className="sm:max-w-sm" showCloseButton={false}>
        <p className="text-sm font-medium text-foreground">
          {t("archiveConfirmDescription")}
        </p>
        <div className="mt-4 flex items-center justify-end gap-3">
          <Button
            variant="ghost"
            onClick={onCancel}
            disabled={deleting}
            className="rounded-xl"
          >
            {t("common:actions.cancel")}
          </Button>
          <Button
            onClick={onConfirm}
            disabled={deleting}
            className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {deleting ? (
              <motion.span
                animate={{ rotate: 360 }}
                transition={{
                  duration: 0.8,
                  repeat: Number.POSITIVE_INFINITY,
                  ease: "linear",
                }}
                className="flex items-center justify-center"
              >
                <Loader2 size={16} />
              </motion.span>
            ) : (
              t("archiveAction")
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
