# qDNA

**The question genome of your course.**

Live: **https://minihackathon-kappa.vercel.app**
Repository: https://github.com/adib-11/qdna

qDNA takes the scanned past papers a student already has, extracts every
question into structured JSON with Gemini vision, and computes a deterministic
*question genome* for the course: topic frequency, Pareto coverage, question
lineage (near-duplicate clustering across papers and departments), and
expected-marks ranking.

It is a prioritization tool, not a prediction tool. Every number it shows is
counted from the corpus you uploaded, and every topic links back to the source
questions that produced it.

## How it works

```
Browser                              Server                    Gemini
───────                              ──────                    ──────
PDF → canvas → JPEG pages
  → blank-page filter
  → batches of 2 pages  ──POST──▶  /api/extract  ──vision──▶  structured JSON
  ◀── questions ──────────────────      ◀──────────────────
  → SHA-256 content cache
  → deterministic analysis (zero API calls)
  → genome map · Pareto · lineage · dossier

  measured paper shape + ranked topics  ──POST──▶  /api/predict  ──▶  practice paper
  one question + its recurrence         ──POST──▶  /api/tutor    ──▶  hint, not solution
```

Pages are rasterised **in the browser** — no PDF is ever uploaded or persisted
server-side. Batches stay under Vercel's request-body ceiling, extraction
results are cached by page-image content hash so re-analysis costs no API
quota, and a failed batch never discards the batches that succeeded.

The statistics are ours; Gemini is the sensor. Rankings are counts over a
corpus that vision made countable, not a model's opinion about what matters.

### What you get back

- **Headline stat** — one computed sentence, e.g. *"7 topics out of 17 cover
  74.5% of every question asked."*
- **Genome map** — topics down, papers across, cell density by question count.
- **Pareto curve** — topic bars with cumulative coverage and the 70% threshold.
- **Lineage cards** — each recurring question with all its variants, the source
  paper of each, the similarity score, and the numbers that changed highlighted.
  Clusters spanning two course codes are badged *appears across departments*.
- **Topic dossier** — every topic expands to the questions behind its count, so
  nothing above it is unauditable. Any question there opens a **hint** — the
  approach and the governing principle, never the final answer.
- **Backtest** — hide a paper, rebuild the ranking from the rest, then reveal
  it. The ranking is allowed to name exactly as many topics as the headline
  stat tells you to study, and coverage is counted in questions, not labels.
  On the bundled Software Engineering corpus, holding out the 2024 final: the
  21 topics ranked from the six earlier papers covered **37.5%** of it, and 11
  of its 24 questions were variants of a question asked before.
- **Practice paper** — a paper written in the corpus's own shape: the sections,
  question counts, and mark denominations are measured from the uploads and
  sent to the model as a constraint, so the structure is arithmetic and only
  the wording is generated. Each question carries the recurrence evidence that
  put it there, looked up locally by topic.

Three corpora ship in `data/`, extracted with the same pipeline from real RUET
papers, so the tool can be tried without an upload, without an API key, and
without a network call. They were produced by `scripts/extract-corpus.mjs`,
which rasterises with `pdftoppm` and then uses the same prompt, schema, batch
size, and model chain as the browser path.

Fewer than three papers and the view says so up front: the counts are still
shown, described as a count over that corpus rather than as recurrence.

### What the free tier actually allows

Measured, not assumed. The free tier meters requests-per-day **per model**, at
20/day for `gemini-flash-latest` — not enough for one 35-page paper on its own.
Three things follow, and all three are in the code:

- Requests carry 2 pages. Fewer pages per request would run out of daily quota
  before the paper ends; more than two stops returning inside the function
  window, because verbatim transcription of a dense page is 25–47s of output.
- Extraction walks a chain of flash models. A `429` moves to the next model,
  which has its own daily budget, so quota is pooled rather than capped at 20.
- Results are cached by page-image SHA-256, so the same pages are never paid
  for twice.

## Stack

- Next.js (App Router) + TypeScript + Tailwind CSS v4
- `pdfjs-dist` for client-side page rasterisation
- `@google/genai` for structured vision extraction, server-side only
- `recharts` for the Pareto view
- Vitest for the pure analysis functions
- Deployed on Vercel

## Local development

```bash
npm install
cp .env.example .env.local   # add your GEMINI_API_KEY
npm run dev
```

`GEMINI_API_KEY` is read only inside server route handlers. It is never
exposed through a `NEXT_PUBLIC_*` variable, never reaches the client bundle,
and never gets committed.

## Build status

| Phase | Scope | State |
|-------|-------|-------|
| 1 | Repository, deploy pipeline, design system | ✅ shipped |
| 2 | Client render → batch → extract → cache pipeline | ✅ shipped |
| 3 | Deterministic analysis engine | ✅ shipped |
| 4 | Results interface | ✅ shipped |
| 5 | Grounded tutor and paper generation | ✅ shipped |
| 6 | Sample corpora and backtest | ✅ shipped |
| 7 | Documentation sync and submission | planned |
