"use client";

import { AimcLogo } from "@/components/icons/aimc-logo";

/**
 * Full-screen loading screen with animated AI Media Canvas logo.
 * Uses the same traced vector logo as the brand lockup so loading stays
 * visually consistent with the product chrome.
 */
export function LoadingScreen() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-5">
        <div className="animate-logo-float">
          <AimcLogo className="size-14 text-foreground" />
        </div>
        <div className="flex items-center gap-1">
          <span className="h-1 w-1 rounded-full bg-foreground/30 animate-loading-dot [animation-delay:0ms]" />
          <span className="h-1 w-1 rounded-full bg-foreground/30 animate-loading-dot [animation-delay:160ms]" />
          <span className="h-1 w-1 rounded-full bg-foreground/30 animate-loading-dot [animation-delay:320ms]" />
        </div>
      </div>
    </div>
  );
}
