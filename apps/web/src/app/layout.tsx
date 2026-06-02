import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";

import { Providers } from "../components/providers";

import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });
const metadataBase = process.env.AIMC_SERVER_BASE_URL
  ? new URL(process.env.AIMC_SERVER_BASE_URL)
  : undefined;

export const metadata: Metadata = {
  metadataBase,
  title: "AI Media Canvas",
  description: "Local-first AI media canvas app",
  icons: {
    icon: "/favicon.svg",
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: "AI Media Canvas",
    description: "Local-first AI media canvas app",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "AI Media Canvas",
    description: "Local-first AI media canvas app",
    images: ["/og-image.png"],
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={cn(geist.variable, "scroll-smooth")} suppressHydrationWarning>
      <body className="min-h-screen bg-background font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
