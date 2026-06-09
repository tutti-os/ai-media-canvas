"use client";

import { Settings2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAppTranslation } from "@/i18n";
import { fetchViewer } from "@/lib/server-api";

import { SettingsDialog } from "./settings-dialog";

function getInitials(name: string | null) {
  if (!name) return "AI";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (
    parts
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "AI"
  );
}

export function SidebarSettingsMenu() {
  const { t } = useAppTranslation("navigation");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [displayName, setDisplayName] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetchViewer()
      .then((viewer) => {
        if (!cancelled) {
          setDisplayName(viewer.profile.displayName);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDisplayName(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const initials = useMemo(() => getInitials(displayName), [displayName]);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          className="flex h-11 w-11 items-center justify-center rounded-full outline-none ring-offset-background transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:h-10 md:w-10"
          aria-label={t("settingsMenu.open")}
        >
          <Avatar size="default">
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
        </DropdownMenuTrigger>

        <DropdownMenuContent
          side="right"
          align="end"
          sideOffset={12}
          className="w-64"
        >
          <div className="px-3 py-2">
            <div className="text-sm font-medium text-foreground">
              {displayName ?? t("settingsMenu.localUser")}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {t("settingsMenu.description")}
            </div>
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setSettingsOpen(true)}>
            <Settings2 className="size-4" />
            {t("settingsMenu.settings")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </>
  );
}
