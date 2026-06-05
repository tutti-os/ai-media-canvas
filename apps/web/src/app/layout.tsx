import { cn } from "@/lib/utils";
import type { Metadata } from "next";
import { Geist } from "next/font/google";
import type { ReactNode } from "react";

import { Providers } from "../components/providers";

import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });
const metadataBase = process.env.AIMC_SERVER_BASE_URL
  ? new URL(process.env.AIMC_SERVER_BASE_URL)
  : undefined;

export const metadata: Metadata = {
  metadataBase,
  title: "AI Media Canvas",
  description: "Local-first AI canvas for image and video generation.",
  icons: {
    icon: [
      { url: "/brand/aimc-logo-cloud-spark.svg", type: "image/svg+xml" },
      { url: "/brand/favicon.png", sizes: "64x64", type: "image/png" },
    ],
    apple: "/brand/apple-touch-icon.png",
  },
  openGraph: {
    title: "AI Media Canvas",
    description: "Local-first AI canvas for image and video generation.",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "AI Media Canvas",
    description: "Local-first AI canvas for image and video generation.",
    images: ["/og-image.png"],
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={cn(geist.variable, "scroll-smooth")}
      suppressHydrationWarning
    >
      <body className="min-h-screen bg-background font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
