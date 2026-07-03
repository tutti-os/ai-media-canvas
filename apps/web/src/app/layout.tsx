import { cn } from "@/lib/utils";
import type { Metadata } from "next";
import { Geist } from "next/font/google";
import type { ReactNode } from "react";

import { Providers } from "../components/providers";

import "@tutti-os/ui-rich-text/at-panel/index.css";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });
const metadataBase = process.env.AIMC_SERVER_BASE_URL
  ? new URL(process.env.AIMC_SERVER_BASE_URL)
  : undefined;

export const metadata: Metadata = {
  metadataBase,
  title: "AI Canvas",
  description: "Generate and organize AI images and videos on a canvas.",
  icons: {
    icon: [
      { url: "/brand/aimc-logo-cloud-spark.svg", type: "image/svg+xml" },
      { url: "/brand/favicon.png", sizes: "64x64", type: "image/png" },
    ],
    apple: "/brand/apple-touch-icon.png",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="zh-CN"
      className={cn(geist.variable, "scroll-smooth")}
      suppressHydrationWarning
    >
      <body className="min-h-screen bg-background font-sans antialiased">
        <script
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html: `
try {
  var match = document.cookie.match(/(?:^|; )aimc_locale=([^;]+)/);
  var saved = localStorage.getItem("aimc_locale") || (match ? decodeURIComponent(match[1]) : "");
  var locale = /^en/i.test(saved) ? "en" : /^zh/i.test(saved) ? "zh-CN" : "zh-CN";
  document.documentElement.lang = locale;
} catch (_) {}
            `.trim(),
          }}
        />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
