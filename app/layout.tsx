import type { Metadata } from "next";
import { Inter, Source_Serif_4 } from "next/font/google";
import { OwnKeyProvider } from "@/components/OwnKeyProvider";
import "./globals.css";

// NotionInter substitute
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

// Lyon Text substitute
const sourceSerif = Source_Serif_4({
  variable: "--font-source-serif",
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
    <html
      lang="en"
      className={`${inter.variable} ${sourceSerif.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-paper-warmth">
        {/* The first Tab stop on every page. Every page's <main> is #main. */}
        <a
          href="#main"
          className="sr-only rounded-[var(--radius-lg)] bg-pure-white px-[15px] py-[6px] text-body-sm font-medium text-notion-blue focus:not-sr-only focus:fixed focus:left-[16px] focus:top-[16px] focus:z-[70] print:hidden"
        >
          Skip to content
        </a>
        <OwnKeyProvider>{children}</OwnKeyProvider>
      </body>
    </html>
  );
}
