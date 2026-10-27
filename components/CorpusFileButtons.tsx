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
import { corpusTitle, needsSplit, splitCourses } from "@/lib/corpus/courses";
import type { TopicOverride } from "@/lib/analysis/topics";
import { browserCorpusStore } from "@/lib/corpus/store";
import { groupSavedCorpus } from "@/lib/corpus/useCorpora";
import { handleModelError, ownKeyStore } from "@/lib/key/ownKey";
import type { AnalysisResult, Question } from "@/lib/types";

/** A file name for the corpus, from its course: "software-engineering". */
function corpusSlug(questions: Question[]): string {
  return (
    corpusTitle(questions)
      .name.toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "corpus"
  );
}

/** Share sheet where supported, download otherwise. */
async function deliver(content: string, name: string, type: string) {
  await deliverFile(new File([content], name, { type }), navigator, downloadFile);
}

/** Export the corpus as a `.qdna.json` file. */
export function ExportCorpusButton({
  questions,
  topicOverrides,
  sameCourse,
}: {
  questions: Question[];
  topicOverrides: TopicOverride[];
  sameCourse?: string[][];
}) {
  async function exportCorpus() {
    await deliver(
      exportCorpusFile(questions, topicOverrides, sameCourse),
      corpusSlug(questions) + CORPUS_FILE_EXTENSION,
      "application/json",
    );
  }

  return (
    <Button variant="text" onClick={exportCorpus}>
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
 * Import a classmate's corpus file into `existing`, paper by paper. The import
 * itself makes no model request; when the student holds a key, topic grouping
 * then runs once over the merged corpus. A rejected file leaves the corpus
 * untouched; `onMerged` may throw (storage full), and that is reported the
 * same way. `onMerged` returns the id the merged corpus was saved under.
 */
export function ImportCorpusButton({
  existing,
  existingOverrides = [],
  existingSameCourse = [],
  onMerged,
  variant = "ghost",
}: {
  existing: Question[];
  /** Ghost where importing is the screen's own action; text beside the results' other actions. */
  variant?: "ghost" | "text";
  existingOverrides?: TopicOverride[];
  existingSameCourse?: string[][];
  onMerged: (
    questions: Question[],
    topicOverrides: TopicOverride[],
    sameCourse: string[][],
  ) => string | undefined;
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
    const result = importCorpusFile(existing, text, existingOverrides, existingSameCourse);
    if (!result.ok) {
      setMessage({ error: true, text: `${result.error} Your corpus is unchanged.` });
      return;
    }
    const summary = describeImport(result.added, result.skipped);
    let id: string | undefined;
    try {
      if (result.added.length > 0) id = onMerged(result.questions, result.topicOverrides, result.sameCourse);
      setMessage({ error: false, text: summary });
    } catch (err) {
      setMessage({
        error: true,
        text: err instanceof Error ? err.message : "The import could not be saved.",
      });
      return;
    }

    // Grouping never asks for a key here: without one, the import keeps the
    // raw topic labels and "Group topics" waits as a pending action. A corpus
    // holding several courses is grouped once it has been split.
    const apiKey = ownKeyStore().get();
    const merged = id ? browserCorpusStore()?.get(id) : null;
    if (!merged || !apiKey) return;
    if (needsSplit(splitCourses(merged.outcome.questions, merged.sameCourse))) return;
    setMessage({ error: false, text: `${summary} Grouping topics…` });
    try {
      await groupSavedCorpus(merged.id, apiKey);
      setMessage({ error: false, text: `${summary} Topics grouped.` });
    } catch (err) {
      setMessage({
        error: true,
        text: `${summary} ${handleModelError(err, "Topic grouping failed.")} Group topics is still pending.`,
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
      <Button variant={variant} onClick={() => inputRef.current?.click()}>
        Import corpus file
      </Button>
      <p
        role="status"
        className={`mt-2 max-w-[48ch] text-sm ${message?.error ? "text-error" : "text-ink-2"}`}
      >
        {message?.text}
      </p>
    </div>
  );
}
