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
import type { TopicOverride } from "@/lib/analysis/topics";
import { groupSavedCorpus } from "@/lib/corpus/useCorpora";
import { handleModelError, ownKeyStore } from "@/lib/key/ownKey";
import type { Question } from "@/lib/types";

/** Export the corpus as a `.qdna.json` file: share sheet where supported, download otherwise. */
export function ExportCorpusButton({
  questions,
  topicOverrides,
}: {
  questions: Question[];
  topicOverrides: TopicOverride[];
}) {
  async function exportCorpus() {
    const slug =
      corpusTitle(corpusCourses(questions))
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || "corpus";
    const file = new File([exportCorpusFile(questions, topicOverrides)], slug + CORPUS_FILE_EXTENSION, {
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
 * Import a classmate's corpus file into `existing`, paper by paper. The import
 * itself makes no model request; when the student holds a key, topic grouping
 * then runs once over the merged corpus. A rejected file leaves the corpus
 * untouched; `onMerged` may throw (storage full), and that is reported the
 * same way. `onMerged` returns the id the merged corpus was saved under.
 */
export function ImportCorpusButton({
  existing,
  existingOverrides = [],
  onMerged,
}: {
  existing: Question[];
  existingOverrides?: TopicOverride[];
  onMerged: (questions: Question[], topicOverrides: TopicOverride[]) => string | undefined;
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
    const result = importCorpusFile(existing, text, existingOverrides);
    if (!result.ok) {
      setMessage({ error: true, text: `${result.error} Your corpus is unchanged.` });
      return;
    }
    const summary = describeImport(result.added, result.skipped);
    let id: string | undefined;
    try {
      if (result.added.length > 0) id = onMerged(result.questions, result.topicOverrides);
      setMessage({ error: false, text: summary });
    } catch (err) {
      setMessage({
        error: true,
        text: err instanceof Error ? err.message : "The import could not be saved.",
      });
      return;
    }

    // Grouping never asks for a key here: without one, the import keeps the
    // raw topic labels and "Group topics" waits as a pending action.
    const apiKey = ownKeyStore().get();
    if (!id || !apiKey) return;
    setMessage({ error: false, text: `${summary} Grouping topics…` });
    try {
      await groupSavedCorpus(id, apiKey);
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
