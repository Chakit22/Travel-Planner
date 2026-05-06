import type { Metadata } from "next";
import { Fraunces, Inter_Tight, JetBrains_Mono } from "next/font/google";
import { HeaderRail } from "@/components/HeaderRail";
import "./globals.css";

const fraunces = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
  axes: ["opsz"],
});

const interTight = Inter_Tight({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Atlas — The travel companion that remembers you",
  description:
    "Atlas walks with you and remembers you. AI travel planning with memory and live companion mode.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${interTight.variable} ${fraunces.variable} ${jetbrainsMono.variable} h-full`}
    >
      <body className="h-full flex flex-col antialiased overflow-hidden">
        <header className="relative z-10 px-8 h-14 flex items-center justify-between border-b border-[var(--color-ink-line-soft)] shrink-0">
          <a href="/" className="flex items-center gap-2.5 group">
            <span className="block w-1.5 h-1.5 rounded-full bg-[var(--color-brass)] group-hover:bg-[var(--color-violet-bright)] transition-colors" />
            <span
              className="font-[family-name:var(--font-display)] text-[15px] tracking-[0.32em] uppercase text-[var(--color-text-primary)]"
              style={{ fontWeight: 400 }}
            >
              Atlas
            </span>
          </a>
          <HeaderRail />
        </header>

        <main className="relative z-10 flex-1 flex flex-col min-h-0">{children}</main>
      </body>
    </html>
  );
}
