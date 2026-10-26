"use client";

import { useState, type FormEvent } from "react";
import { useRequestKey } from "@/components/OwnKeyProvider";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ungroupedLabels, type TopicOverride } from "@/lib/analysis/topics";
import { browserCorpusStore, type SavedCorpus } from "@/lib/corpus/store";
import { corpusChanged, groupSavedCorpus } from "@/lib/corpus/useCorpora";
import { handleModelError } from "@/lib/key/ownKey";

type Message = { error: boolean; text: string } | null;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * The corpus's topics, under the student's control: "Group topics" while some
 * topic labels have not been through topic grouping, and the student's own
 * merges and renames, each of which can be undone. Overrides are saved with
 * the corpus, so they survive a reload and a re-run of the grouping.
 */
export function TopicEditor({
  corpus,
  topics,
}: {
  corpus: SavedCorpus;
  /** The corpus's current topics, most asked first. */
  topics: string[];
}) {
  const requestKey = useRequestKey();
  const [selected, setSelected] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [grouping, setGrouping] = useState(false);
  const [message, setMessage] = useState<Message>(null);

  const overrides = corpus.topicOverrides ?? [];
  const pending = ungroupedLabels(corpus.outcome.questions, corpus.topicGrouping).length;

  const toggle = (topic: string) =>
    setSelected((prev) =>
      prev.includes(topic) ? prev.filter((t) => t !== topic) : [...prev, topic],
    );

  const canApply =
    selected.length > 0 &&
    name.trim() !== "" &&
    !(selected.length === 1 && selected[0] === name.trim());

  async function group() {
    // Grouping is a model action, so this is where the key is asked for.
    const apiKey = await requestKey();
    if (!apiKey) return;
    setGrouping(true);
    setMessage(null);
    try {
      await groupSavedCorpus(corpus.id, apiKey);
      setMessage({ error: false, text: "Topics grouped. Your own merges and renames still apply." });
    } catch (err) {
      setMessage({ error: true, text: handleModelError(err, "Topic grouping failed.") });
    } finally {
      setGrouping(false);
    }
  }

  function saveOverrides(next: TopicOverride[], done: string) {
    try {
      browserCorpusStore()?.saveTopics(corpus.id, { topicOverrides: next });
      corpusChanged();
      setMessage({ error: false, text: done });
    } catch (err) {
      setMessage({
        error: true,
        text: err instanceof Error ? err.message : "Your change could not be saved.",
      });
    }
  }

  function apply(event: FormEvent) {
    event.preventDefault();
    const to = name.trim();
    if (!canApply) return;
    saveOverrides(
      [...overrides, { from: selected, to }],
      selected.length > 1
        ? `Merged ${plural(selected.length, "topic")} into ${to}.`
        : `Renamed ${selected[0]} to ${to}.`,
    );
    setSelected([]);
    setName("");
  }

  return (
    <Card>
      <h2 className="text-xl sm:text-2xl">Your topics</h2>
      <p className="mt-3 max-w-[65ch] text-ink-2">
        Merge topics your course treats as one, or rename a topic to match your
        teacher&apos;s name for it. Every figure on this page follows.
      </p>

      {pending > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <p className="text-ink-2">
            {plural(pending, "topic label")} {pending === 1 ? "has" : "have"} not been
            grouped yet.
          </p>
          <Button variant="ghost" onClick={group} disabled={grouping}>
            {grouping ? "Grouping topics…" : "Group topics"}
          </Button>
        </div>
      )}

      <form onSubmit={apply} className="mt-6">
        <fieldset>
          <legend className="font-semibold">
            Choose one topic to rename, or several to merge
          </legend>
          <ul className="mt-3 flex flex-wrap gap-2">
            {topics.map((topic) => (
              <li key={topic}>
                <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-pill border border-rule bg-surface px-3 text-sm transition-[background-color,border-color] duration-(--dur-micro) ease-out hover:border-muted has-checked:border-ink has-checked:bg-ink has-checked:text-surface has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus">
                  <input
                    type="checkbox"
                    checked={selected.includes(topic)}
                    onChange={() => toggle(topic)}
                    className="size-4 accent-surface"
                  />
                  {topic}
                </label>
              </li>
            ))}
          </ul>
        </fieldset>

        <div className="mt-6 flex flex-wrap items-end gap-2">
          <label className="text-sm font-semibold">
            New topic name
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-2 block min-h-11 w-[280px] max-w-full rounded-control border border-muted bg-surface px-3 text-md font-normal"
            />
          </label>
          <Button type="submit" variant="ghost" disabled={!canApply}>
            {selected.length > 1 ? `Merge ${selected.length} topics` : "Rename topic"}
          </Button>
        </div>
      </form>

      {overrides.length > 0 && (
        <div className="mt-10">
          <h3 className="text-lg">Your changes</h3>
          <ul className="mt-3 border-t border-ink">
            {overrides.map((override, index) => (
              <li
                key={`${index}-${override.to}`}
                className="flex flex-wrap items-center justify-between gap-3 border-b border-rule py-1"
              >
                <span>
                  {override.from.join(" + ")} → {override.to}
                </span>
                <Button
                  variant="text"
                  aria-label={`Undo ${override.from.join(" + ")} → ${override.to}`}
                  onClick={() =>
                    saveOverrides(
                      overrides.filter((_, i) => i !== index),
                      `Undone: ${override.from.join(" + ")} → ${override.to}.`,
                    )
                  }
                >
                  Undo
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p
        role="status"
        className={`mt-4 min-h-6 text-sm ${message?.error ? "text-error" : "text-ink-2"}`}
      >
        {message?.text}
      </p>
    </Card>
  );
}
