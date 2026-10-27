# qDNA

**The question genome of your course.**

Live: **https://minihackathon-kappa.vercel.app**
Repository: https://github.com/adib-11/qdna

qDNA takes the scanned past papers a student already has, extracts every
question into structured JSON with Gemini vision, and computes a deterministic
*question genome* for the course: topic frequency, Pareto coverage, question
lineage (near-duplicate clustering across papers and departments), and
expected-marks ranking.

It is a prioritization tool, never a forecast. Every number it shows is
counted from the corpus you uploaded, and every topic links back to the source
questions that produced it.

## How it works

```
Browser (student's own Gemini key)                         Gemini
──────────────────────────────────                         ──────
PDF → canvas → JPEG pages, or JPG / PNG / HEIC photos as is
  → blank-page filter (PDF pages)
  → batches of 2 pages  ─────────── generateContent ──────▶  structured JSON
  ◀── questions ─────────────────────────────────────────────
  → SHA-256 content cache
  → deterministic analysis (zero API calls)
  → genome map · Pareto · lineage · dossier

  measured paper shape + ranked topics  ── generateContent ──▶  practice paper
  one question + its recurrence         ── generateContent ──▶  hint, not solution
```

Every model call goes from the student's browser straight to Gemini on the
student's **own key** (ADR 0001). The key is asked for only when an action
needs a model, checked with a models-list call, held in memory unless the
student chooses to remember it, and sent only to Google. The bundled samples
and all analysis need no key. qDNA's server routes (`/api/extract`,
`/api/tutor`, `/api/practice-paper`) are kept for a possible paid tier but
hold no key and answer 503.

Pages are prepared **in the browser** — no file is ever uploaded to or
persisted on qDNA's server. Extraction results are cached by page-image
content hash so re-analysis costs no API quota, a failed batch never discards
the batches that succeeded, and a cancelled extraction keeps the pages that
finished.

The statistics are ours; Gemini is the sensor. Rankings are counts over a
corpus that vision made countable, not a model's opinion about what matters.

### What you get back

- **Headline stat** — one computed sentence, e.g. *"7 topics out of 17 cover
  74.5% of every question asked."*
- **Genome map** — topics down, papers across, cell density by question count.
- **Pareto curve** — topic bars with cumulative coverage and the 70% threshold.
- **Lineage cards** — each recurring question with all its variants, the source
  paper of each, the similarity score, and the numbers that changed highlighted.
  Clusters spanning two offerings of the course are badged *asked in both departments*.
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

Two corpora ship in `data/`, extracted with the same pipeline from real RUET
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
- `@google/genai` for structured vision extraction, called from the browser on the student's own key
- `recharts` for the Pareto view
- Vitest for the pure analysis functions
- Playwright and axe-core for end-to-end and WCAG 2.2 AA checks, run in GitHub Actions
- Deployed on Vercel

## Local development

```bash
npm install
npm run dev
```

Tests:

```bash
npm test                  # Vitest: analysis, extraction, corpus files
npm run build             # Playwright runs against the production build
npx playwright install chromium
npm run test:e2e          # Playwright + axe, Gemini stubbed at the network level
```

CI (`.github/workflows/ci.yml`) runs lint, Vitest, the build, typechecking and
the Playwright suite on every push and pull request. The Playwright suite runs
axe on every app state and allows zero violations.

The app needs no server-side key: paste your own Gemini key when an action
asks for one. `GEMINI_API_KEY` in `.env.local` is read only by the offline
`scripts/extract-corpus.mjs`; it is never committed.

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
