import type { Metadata } from "next";
import { Epilogue, IBM_Plex_Mono } from "next/font/google";
import { OwnKeyProvider } from "@/components/OwnKeyProvider";
import "./globals.css";

// Heads at 700, names and controls at 600, everything read at 400.
const epilogue = Epilogue({
  variable: "--font-epilogue",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
});

// Only on figures that compare down a column: ranks, counts, marks.
const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400"],
});

export const metadata: Metadata = {
  title: "qDNA — the question genome of your course",
  description:
    "Upload past exam papers. qDNA extracts every question and computes the topic genome: frequency, Pareto coverage, question lineage, and expected marks.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${epilogue.variable} ${plexMono.variable} h-full`}>
      <body className="flex min-h-full flex-col">
        {/* The first Tab stop on every page. Every page's <main> is #main. */}
        <a
          href="#main"
          className="sr-only rounded-control bg-ink px-4 py-3 text-sm font-semibold text-surface focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[70] print:hidden"
        >
          Skip to content
        </a>
        <OwnKeyProvider>{children}</OwnKeyProvider>
      </body>
    </html>
  );
}
