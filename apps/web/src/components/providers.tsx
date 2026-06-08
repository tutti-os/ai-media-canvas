"use client";

import { ThemeProvider } from "next-themes";
import type { ReactNode } from "react";

import { I18nProvider } from "@/i18n";

import { ToastProvider } from "./toast";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
      <I18nProvider>
        <ToastProvider>{children}</ToastProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}
