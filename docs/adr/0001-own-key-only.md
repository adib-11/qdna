---
status: accepted
---

# Students bring their own Gemini key

qDNA calls models only with the student's own Gemini API key. We considered a shared server key protected by per-IP rate limiting, and rejected it. A shared key makes us pay for every student's extraction and turns our routes into a public Gemini proxy that needs abuse defences. It also caps every student at one shared free-tier budget (20 requests per day per model), which one 35-page paper can exhaust.

## Consequences

- Rate limiting, bot checks and server-side quota accounting are not needed, so we don't build them.
- A student must create a key before extracting their own papers. The bundled sample corpora stay usable without one, because analysis runs locally.
- Each student's quota is their own, so requests per paper decide how many papers a student can extract per day.
- The server routes (`/api/extract`, `/api/tutor`, `/api/practice-paper`) stay in the codebase but hold no key. A paid tier may come later, where we supply the key and students pay for the requests. If it does, the routes come back with our key, and rate limiting and authentication must come back with them.
