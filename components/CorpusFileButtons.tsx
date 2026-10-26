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
import { corpusCourses, corpusTitle } from "@/lib/analysis/papers";
import type { Question } from "@/lib/types";

/** Export the corpus as a `.qdna.json` file: share sheet where supported, download otherwise. */
export function ExportCorpusButton({ questions }: { questions: Question[] }) {
  async function exportCorpus() {
    const slug =
      corpusTitle(corpusCourses(questions))
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || "corpus";
    const file = new File([exportCorpusFile(questions)], slug + CORPUS_FILE_EXTENSION, {
      type: "application/json",
    });
    await deliverFile(file, navigator, downloadFile);
  }

  return (
    <Button variant="ghost" onClick={exportCorpus}>
      Export corpus file
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
