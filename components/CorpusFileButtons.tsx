"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import {
  CORPUS_FILE_EXTENSION,
  describeImport,
  exportCorpusFile,
  importCorpusFile,
} from "@/lib/corpus/corpusFile";
import { deliverFile, downloadFile } from "@/lib/corpus/deliver";
import { studyPack } from "@/lib/corpus/studyPack";
import { corpusCourses, corpusTitle } from "@/lib/analysis/papers";
import type { AnalysisResult, Question } from "@/lib/types";

/** A file name for the corpus, from its course: "software-engineering". */
function corpusSlug(questions: Question[]): string {
  return (
    corpusTitle(corpusCourses(questions))
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "corpus"
  );
}

/** Share sheet where supported, download otherwise. */
async function deliver(content: string, name: string, type: string) {
  await deliverFile(new File([content], name, { type }), navigator, downloadFile);
}

/** Export the corpus as a `.qdna.json` file. */
export function ExportCorpusButton({ questions }: { questions: Question[] }) {
  async function exportCorpus() {
    await deliver(
      exportCorpusFile(questions),
      corpusSlug(questions) + CORPUS_FILE_EXTENSION,
      "application/json",
    );
  }

  return (
    <Button variant="ghost" onClick={exportCorpus}>
      Export corpus file
    </Button>
  );
}

/** Export the study pack, a Markdown file to paste into a chatbot. */
export function StudyPackButton({ result }: { result: AnalysisResult }) {
  async function exportPack() {
    await deliver(
      studyPack(result),
      `${corpusSlug(result.questions)}-study-pack.md`,
      "text/markdown",
    );
  }

  return (
    <Button variant="ghost" onClick={exportPack}>
      Study pack
    </Button>
  );
}

/**
 * Import a classmate's corpus file into `existing`, paper by paper. No model
 * request is made. A rejected file leaves the corpus untouched; `onMerged` may
 * throw (storage full), and that is reported the same way.
 */
export function ImportCorpusButton({
  existing,
  onMerged,
}: {
  existing: Question[];
  onMerged: (questions: Question[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);

  async function importFile(file: File | undefined) {
    if (!file) return;
    let text: string;
    try {
      text = await file.text();
    } catch {
      setMessage({ error: true, text: "This file could not be read. Your corpus is unchanged." });
      return;
    }
    const result = importCorpusFile(existing, text);
    if (!result.ok) {
      setMessage({ error: true, text: `${result.error} Your corpus is unchanged.` });
      return;
    }
    try {
      if (result.added.length > 0) onMerged(result.questions);
      setMessage({ error: false, text: describeImport(result.added, result.skipped) });
    } catch (err) {
      setMessage({
        error: true,
        text: err instanceof Error ? err.message : "The import could not be saved.",
      });
    }
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(e) => {
          void importFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <Button variant="ghost" onClick={() => inputRef.current?.click()}>
        Import corpus file
      </Button>
      <p
        role="status"
        className={`mt-[8px] text-body-sm ${message?.error ? "text-vermillion" : "text-graphite"}`}
      >
        {message?.text}
      </p>
    </div>
  );
}
