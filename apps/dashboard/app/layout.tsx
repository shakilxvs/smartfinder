import type { Metadata, Viewport } from "next";
import "./globals.css";

// NOTE: We intentionally do NOT use next/font/google here. Some deployment
// environments (locked-down corporate networks, some CI/sandbox containers)
// block fonts.googleapis.com at build time, which fails the Next.js build
// entirely. Since the visual identity is carried by font *pairing and
// scale*, not by owning an exotic typeface, we ship well-supported system
// font stacks that approximate the same personality (geometric display /
// humanist body / monospace data) with zero network dependency. If your
// deployment network allows it, swap these for next/font/google("Space
// Grotesk"/"Inter"/"JetBrains Mono") for pixel-exact webfonts.

export const metadata: Metadata = {
  title: "SmartFind",
  description: "Find and message your devices over your home Wi-Fi.",
};

export const viewport: Viewport = {
  themeColor: "#12151c",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-bg text-text font-body">{children}</body>
    </html>
  );
}
