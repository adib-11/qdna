"use client";

import { useRef, useState, type ReactNode } from "react";
import { useRequestKey } from "@/components/OwnKeyProvider";
import { Button } from "@/components/ui/Button";
import { analyze } from "@/lib/analysis";
import { describeAdded } from "@/lib/corpus/addPapers";
import { mergePapers } from "@/lib/corpus/corpusFile";
import { corpusCourses } from "@/lib/analysis/papers";
import { corpusTitle, otherOffering, type Course } from "@/lib/corpus/courses";
import { browserCorpusStore, type SavedCorpus } from "@/lib/corpus/store";
import { corpusChanged } from "@/lib/corpus/useCorpora";
import {
  emptyRunMessage,
  runExtraction,
  type ExtractionRun,
  type FileProgress,
} from "@/lib/extract/runExtraction";
import { UPLOAD_ACCEPT, uploadKind } from "@/lib/extract/uploads";
import { browserModelClient } from "@/lib/gemini/browserClient";
import { extractQuestions } from "@/lib/gemini/extract";
import { groupNewLabels } from "@/lib/gemini/groupTopics";
import { handleModelError } from "@/lib/key/ownKey";
import type { Question } from "@/lib/types";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Extracted papers waiting on the student's "Same course?" answer. */
interface Asking {
  run: ExtractionRun;
  incoming: Question[];
  skipped: string[];
  other: Course;
  apiKey: string;
}

type State =
  | { phase: "idle" }
  | { phase: "extracting"; names: string[]; files: FileProgress[] }
  | { phase: "asking"; asking: Asking }
  | { phase: "grouping" };

/**
 * Add papers to the open corpus: a file picker, extraction progress inline,
 * a "Same course?" question when an added paper is from another offering,
 * incremental topic grouping, and a one-line notice of what changed. Returns
 * the header's button and the strip that shows under the section nav.
 */
export function useAddPapers(corpus: SavedCorpus | null | undefined): {
  button: ReactNode;
  strip: ReactNode;
} {
  const requestKey = useRequestKey();
  const inputRef = useRef<HTMLInputElement>(null);
  const cancelRef = useRef<AbortController | null>(null);
  const [state, setState] = useState<State>({ phase: "idle" });
  const [notice, setNotice] = useState<{ error: boolean; text: string } | null>(null);

  async function addFiles(list: FileList | null) {
    const files = Array.from(list ?? []).filter((f) => uploadKind(f) !== null);
    if (!corpus || files.length === 0) return;
    // Extraction is a model action, so this is where the key is asked for.
    const apiKey = await requestKey();
    if (!apiKey) return;

    const controller = new AbortController();
    cancelRef.current = controller;
    const names = files.map((f) => f.name);
    setNotice(null);
    setState({ phase: "extracting", names, files: [] });
    const client = browserModelClient(apiKey);
    try {
      const run = await runExtraction(files, {
        extractBatch: (pages, signal) => extractQuestions(client, pages, { signal }),
        onProgress: (progress) => setState({ phase: "extracting", names, files: progress }),
        signal: controller.signal,
      });
      setState({ phase: "idle" });
      if (run.cancelled) {
        setNotice({
          error: false,
          text: "Adding cancelled. Pages that finished are saved in this browser, so adding them again will not pay for them.",
        });
        return;
      }
      if (run.outcome.questions.length === 0) {
        setNotice({
          error: true,
          text: emptyRunMessage(run, (error) => handleModelError(error, "Extraction failed.")),
        });
        return;
      }

      const { added, skipped } = mergePapers(corpus.outcome.questions, run.outcome.questions);
      const incoming = run.outcome.questions.filter((q) => added.includes(q.paper.label));
      if (added.length === 0) {
        setNotice({ error: false, text: describeAdded(analyzed(corpus), analyzed(corpus), [], skipped) });
        return;
      }
      const other = otherOffering(corpus.outcome.questions, incoming, corpus.sameCourse);
      if (other.papers.length > 0) {
        setState({ phase: "asking", asking: { run, incoming, skipped, other, apiKey } });
        return;
      }
      await merge(incoming, skipped, corpus.sameCourse, apiKey);
    } catch (err) {
      setState({ phase: "idle" });
      setNotice({ error: true, text: handleModelError(err, "Extraction failed.") });
    } finally {
      cancelRef.current = null;
    }
  }

  /**
   * Group the new labels against the corpus's topics, then save the papers
   * into it. A failed or skipped grouping still saves, leaving "Group topics"
   * pending for the new labels.
   */
  async function merge(
    incoming: Question[],
    skipped: string[],
    sameCourse: string[][] | undefined,
    apiKey: string,
  ) {
    if (!corpus) return;
    const controller = new AbortController();
    cancelRef.current = controller;
    setState({ phase: "grouping" });
    let topicGrouping = corpus.topicGrouping;
    let groupingNote = "";
    try {
      topicGrouping = await groupNewLabels(
        browserModelClient(apiKey),
        corpus.outcome.questions,
        corpus.topicGrouping,
        incoming,
        controller.signal,
      );
    } catch (err) {
      groupingNote = controller.signal.aborted
        ? " Topic grouping skipped, so Group topics is pending."
        : ` ${handleModelError(err, "Topic grouping failed.")} Group topics is pending.`;
    }
    cancelRef.current = null;
    setState({ phase: "idle" });

    const store = browserCorpusStore();
    // Read again: the student may have changed an override while the model worked.
    const latest = store?.get(corpus.id) ?? corpus;
    try {
      const saved = store?.saveImport(
        { ...latest, topicGrouping },
        [...latest.outcome.questions, ...incoming],
        latest.topicOverrides,
        sameCourse,
      );
      corpusChanged();
      if (!saved) return;
      const added = [...new Set(incoming.map((q) => q.paper.label))];
      setNotice({
        error: false,
        text: describeAdded(analyzed(latest), analyzed(saved), added, skipped) + groupingNote,
      });
    } catch (err) {
      setNotice({
        error: true,
        text: err instanceof Error ? err.message : "The papers could not be saved.",
      });
    }
  }

  /** The student's answer to "Same course?". */
  async function answer(same: boolean) {
    if (!corpus || state.phase !== "asking") return;
    const { run, incoming, skipped, other, apiKey } = state.asking;
    if (same) {
      const group = [...corpusTitle(corpus.outcome.questions).codes, ...other.codes];
      await merge(incoming, skipped, [...(corpus.sameCourse ?? []), group], apiKey);
      return;
    }

    // No: the other offering becomes its own corpus, and this one stays open.
    const theirs = new Set(other.papers);
    const store = browserCorpusStore();
    try {
      store?.save({ ...run.outcome, questions: incoming.filter((q) => theirs.has(q.paper.label)) });
      store?.open(corpus.id);
      corpusChanged();
    } catch (err) {
      setState({ phase: "idle" });
      setNotice({
        error: true,
        text: err instanceof Error ? err.message : "The papers could not be saved.",
      });
      return;
    }
    const savedNote = `Saved ${other.codes.join(" · ")} as its own corpus: open it from your saved corpora.`;
    const rest = incoming.filter((q) => !theirs.has(q.paper.label));
    if (rest.length > 0) {
      await merge(rest, skipped, corpus.sameCourse, apiKey);
      setNotice((n) => (n && !n.error ? { error: false, text: `${n.text} ${savedNote}` } : n));
      return;
    }
    setState({ phase: "idle" });
    setNotice({ error: false, text: savedNote });
  }

  const busy = state.phase !== "idle";
  const button = (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={UPLOAD_ACCEPT}
        multiple
        hidden
        onChange={(e) => {
          void addFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <Button onClick={() => inputRef.current?.click()} disabled={busy}>
        Add papers
      </Button>
    </>
  );

  const stripClass = "page-shell flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-ink py-4 print:hidden";
  let strip: ReactNode = null;
  if (state.phase === "extracting") {
    const total = (key: "pagesDone" | "pagesTotal" | "questionsFound") =>
      state.files.reduce((sum, file) => sum + file[key], 0);
    const pct = total("pagesTotal") > 0 ? (total("pagesDone") / total("pagesTotal")) * 100 : 0;
    strip = (
      <div className={stripClass}>
        <p role="status" className="min-w-0 flex-[1_1_20rem] break-words">
          <b>Adding {state.names.join(", ")}</b>{" "}
          {total("pagesTotal") === 0
            ? "Preparing pages…"
            : `Reading page ${total("pagesDone")} of ${total("pagesTotal")}, ${plural(total("questionsFound"), "question")} so far`}
        </p>
        <div aria-hidden="true" className="h-2 flex-[1_1_12rem] overflow-hidden rounded-control bg-surface-3">
          <div className="h-full bg-ink" style={{ width: `${pct}%` }} />
        </div>
        <Button variant="outlined" onClick={() => cancelRef.current?.abort()}>
          Cancel
        </Button>
      </div>
    );
  } else if (state.phase === "grouping") {
    strip = (
      <div className={stripClass}>
        <p role="status" className="flex-[1_1_20rem]">
          <b>Pages read.</b> Placing the new topic labels among your topics…
        </p>
        <Button variant="outlined" onClick={() => cancelRef.current?.abort()}>
          Skip topic grouping
        </Button>
      </div>
    );
  } else if (state.phase === "asking" && corpus) {
    const { other, incoming } = state.asking;
    const title = corpusTitle(corpus.outcome.questions);
    const theirName = corpusCourses(incoming.filter((q) => other.papers.includes(q.paper.label)))[0];
    const sameName = theirName && theirName.toLowerCase() === title.name.toLowerCase();
    strip = (
      <div
        role="alertdialog"
        aria-labelledby="same-course-heading"
        aria-describedby="same-course-detail"
        className={`${stripClass} items-start bg-surface-2`}
      >
        <div className="min-w-0 flex-[1_1_28rem]">
          <p id="same-course-heading" className="text-lg font-bold">
            Same course as {title.name}?
          </p>
          <p id="same-course-detail" className="mt-1 text-ink-2">
            {other.papers.join(", ")} {other.papers.length === 1 ? "is" : "are"} printed{" "}
            <Codes codes={other.codes} />. Every paper so far is <Codes codes={title.codes} />.{" "}
            {theirName &&
              (sameName ? `Both are titled ${title.name}.` : `${other.papers.length === 1 ? "It is" : "They are"} titled ${theirName}.`)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {/* The question blocks the add, so it takes focus as it appears. */}
          <Button autoFocus onClick={() => void answer(true)}>
            Yes, same course
          </Button>
          <Button variant="ghost" onClick={() => void answer(false)}>
            No, save it on its own
          </Button>
        </div>
      </div>
    );
  } else if (notice) {
    strip = (
      <div className={stripClass}>
        <p role="status" className={`flex-[1_1_20rem] font-semibold ${notice.error ? "text-error" : ""}`}>
          {notice.text}
        </p>
        <Button variant="text" onClick={() => setNotice(null)}>
          Dismiss
        </Button>
      </div>
    );
  }

  return { button, strip };
}

function Codes({ codes }: { codes: string[] }) {
  return <span className="font-outlier">{codes.join(" · ") || "no code"}</span>;
}

/** A corpus's analysis, as the page shows it. */
function analyzed(corpus: SavedCorpus) {
  return analyze(corpus.outcome.questions, {
    grouping: corpus.topicGrouping,
    overrides: corpus.topicOverrides,
  });
}
