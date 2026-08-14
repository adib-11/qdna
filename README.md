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
  → batches of 4 pages  ──POST──▶  /api/extract  ──vision──▶  structured JSON
  ◀── questions ──────────────────      ◀──────────────────
  → SHA-256 content cache
  → deterministic analysis (zero API calls)
```

Pages are rasterised **in the browser** — no PDF is ever uploaded or persisted
server-side. Batches stay under Vercel's request-body ceiling, extraction
results are cached by page-image content hash so re-analysis costs no API
quota, and a failed batch never discards the batches that succeeded.

The statistics are ours; Gemini is the sensor. Rankings are counts over a
corpus that vision made countable, not a model's opinion about what matters.

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
| 3 | Deterministic analysis engine | planned |
| 4 | Results interface | planned |
| 5 | Grounded tutor and paper generation | planned |
| 6 | Sample corpora and backtest | planned |
