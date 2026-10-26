"use client";

import { useState, type FormEvent } from "react";
import { useRequestKey } from "@/components/OwnKeyProvider";
import { Button } from "@/components/ui/Button";
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
    <div className="rounded-[var(--radius-xl)] border border-[var(--border-hairline)] bg-pure-white p-[var(--card-padding)]">
      <h2 className="text-heading-sm font-bold tracking-[-0.242px]">Your topics</h2>
      <p className="mt-[8px] text-body-sm text-graphite">
        Merge topics your course treats as one, or rename a topic to match your
        teacher&apos;s name for it. Every figure on this page follows.
      </p>

      {pending > 0 && (
        <div className="mt-[16px] flex flex-wrap items-center gap-[12px]">
          <p className="text-body-sm text-graphite">
            {plural(pending, "topic label")} {pending === 1 ? "has" : "have"} not been
            grouped yet.
          </p>
          <Button variant="ghost" onClick={group} disabled={grouping}>
            {grouping ? "Grouping topics…" : "Group topics"}
          </Button>
        </div>
      )}

      <form onSubmit={apply} className="mt-[16px]">
        <fieldset>
          <legend className="text-body-sm font-medium">
            Choose one topic to rename, or several to merge
          </legend>
          <ul className="mt-[8px] flex flex-wrap gap-[8px]">
            {topics.map((topic) => (
              <li key={topic}>
                <label className="flex items-center gap-[6px] rounded-[var(--radius-full)] border border-[var(--border-hairline)] px-[12px] py-[4px] text-body-sm">
                  <input
                    type="checkbox"
                    checked={selected.includes(topic)}
                    onChange={() => toggle(topic)}
                  />
                  {topic}
                </label>
              </li>
            ))}
          </ul>
        </fieldset>

        <div className="mt-[16px] flex flex-wrap items-end gap-[8px]">
          <label className="text-body-sm font-medium">
            New topic name
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-[4px] block w-[280px] max-w-full rounded-[var(--radius-md)] border border-[var(--border-hairline)] px-[12px] py-[8px] font-normal"
            />
          </label>
          <Button type="submit" variant="ghost" disabled={!canApply}>
            {selected.length > 1 ? `Merge ${selected.length} topics` : "Rename topic"}
          </Button>
        </div>
      </form>

      {overrides.length > 0 && (
        <div className="mt-[24px]">
          <h3 className="text-body font-medium">Your changes</h3>
          <ul className="mt-[8px] space-y-[8px]">
            {overrides.map((override, index) => (
              <li
                key={`${index}-${override.to}`}
                className="flex flex-wrap items-center gap-[12px] text-body-sm"
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
        className={`mt-[16px] min-h-[20px] text-body-sm ${message?.error ? "text-vermillion" : "text-graphite"}`}
      >
        {message?.text}
      </p>
    </div>
  );
}
