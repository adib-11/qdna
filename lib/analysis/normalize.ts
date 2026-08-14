/**
 * Text normalisation shared by every analysis function.
 *
 * Exam questions arrive as OCR transcriptions, so surface form varies in ways
 * that carry no meaning: smart quotes, inconsistent spacing around operators,
 * `µ` versus `μ`. Everything downstream compares normalised text so those
 * differences never register as substantive.
 */

/** Greek blocks, kept because `ρ`, `μ`, `λ`, `ε` are load-bearing in physics questions. */
const GREEK = "\\u0370-\\u03ff\\u1f00-\\u1fff";

const NON_MEANINGFUL = new RegExp(`[^a-z0-9${GREEK}\\s]+`, "g");

/**
 * Lowercase, strip punctuation, collapse whitespace. Digits and Greek letters
 * survive. Idempotent: `normalizeText(normalizeText(s)) === normalizeText(s)`.
 *
 * NFKC runs first so that compatibility characters fold to their canonical
 * form before anything is discarded — notably `µ` (MICRO SIGN) to `μ` (GREEK
 * SMALL LETTER MU), which OCR emits interchangeably.
 */
export function normalizeText(s: string): string {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(NON_MEANINGFUL, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Normalised whitespace-delimited tokens. Empty input yields an empty array. */
export function tokenize(s: string): string[] {
  const normalized = normalizeText(s);
  return normalized.length === 0 ? [] : normalized.split(" ");
}

/**
 * Tokens that are bare numbers. These are the parameters an examiner changes
 * when recycling a question, so lineage detection scores them separately from
 * the surrounding words.
 */
export function numericLiterals(s: string): string[] {
  return tokenize(s).filter((t) => /^\d+(\.\d+)?$/.test(t));
}

/**
 * Suffixes stripped in order, longest first. A full Porter stemmer is more
 * machinery than this needs: the goal is only to make `writing`/`write` and
 * `densities`/`density` compare equal.
 */
const SUFFIXES = [
  "ization",
  "isation",
  "ational",
  "ations",
  "ition",
  "ations",
  "ities",
  "ation",
  "ions",
  "ness",
  "ment",
  "ical",
  "ion",
  "ity",
  "ing",
  "ies",
  "ed",
  "es",
  "ly",
  "ic",
  "al",
  "s",
];

/** Minimum surviving length. Below this, stripping destroys the word. */
const MIN_STEM_LENGTH = 4;

/**
 * Crude suffix stripper. Numbers pass through untouched so that `10` never
 * becomes `1`.
 */
export function stem(token: string): string {
  if (/^\d/.test(token)) return token;

  for (const suffix of SUFFIXES) {
    if (token.length - suffix.length < MIN_STEM_LENGTH) continue;
    if (token.endsWith(suffix)) {
      return trimTrailingE(token.slice(0, -suffix.length));
    }
  }

  return trimTrailingE(token);
}

/** `write` and `writing` only meet once the silent `e` is gone. */
function trimTrailingE(token: string): string {
  return token.length > MIN_STEM_LENGTH && token.endsWith("e")
    ? token.slice(0, -1)
    : token;
}

/** Distinct stemmed tokens, the unit of comparison for lineage similarity. */
export function stemSet(s: string): Set<string> {
  return new Set(tokenize(s).map(stem));
}
