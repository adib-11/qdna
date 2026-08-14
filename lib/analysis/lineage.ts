import {
  CONTAINMENT_WEIGHT,
  JACCARD_WEIGHT,
  MIN_TOKENS_FOR_CONTAINMENT,
  NUMERIC_BONUS,
  VARIANT_THRESHOLD,
} from "@/lib/config";
import { numericLiterals, stem, stemSet } from "@/lib/analysis/normalize";
import type { LineageCluster, Question } from "@/lib/types";

/**
 * Lineage detection: finding the same question wearing different clothes.
 *
 * Recycled exam questions share near-identical surface text — that is what
 * makes them recycled — so a lexical measure is the right instrument here.
 * Embeddings would cost an API call per question against the binding
 * requests-per-day ceiling and would make the numbers shown to a user
 * non-deterministic, for no gain on a signal this shallow (ALT-004).
 */

interface Fingerprint {
  tokens: Set<string>;
  numbers: Set<string>;
}

function fingerprint(question: Question): Fingerprint {
  return {
    tokens: stemSet(question.text),
    numbers: new Set(numericLiterals(question.text).map(stem)),
  };
}

function intersectionSize(a: Set<string>, b: Set<string>): number {
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  let shared = 0;
  for (const item of small) if (large.has(item)) shared++;
  return shared;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  const shared = intersectionSize(a, b);
  return shared / (a.size + b.size - shared);
}

function score(a: Fingerprint, b: Fingerprint): number {
  if (a.tokens.size === 0 || b.tokens.size === 0) return 0;

  const shared = intersectionSize(a.tokens, b.tokens);
  const union = a.tokens.size + b.tokens.size - shared;
  const overlap = shared / union;
  const shorter = Math.min(a.tokens.size, b.tokens.size);

  // Containment is only meaningful once the shorter question has enough
  // substance to be contained in something.
  const containment =
    shorter >= MIN_TOKENS_FOR_CONTAINMENT ? shared / shorter : overlap;

  const lexical = JACCARD_WEIGHT * overlap + CONTAINMENT_WEIGHT * containment;

  // Numbers only ever add. A pair that shares "80", "8" and "10" is almost
  // certainly the same problem; a pair that shares none may still be the same
  // question with the parameters changed, which is precisely a lineage.
  const numeric = jaccard(a.numbers, b.numbers);

  return lexical + NUMERIC_BONUS * numeric * (1 - lexical);
}

/** Similarity of two questions' text, 0–1. Symmetric; 1 only for identical token sets. */
export function similarity(a: string, b: string): number {
  const fa: Fingerprint = {
    tokens: stemSet(a),
    numbers: new Set(numericLiterals(a).map(stem)),
  };
  const fb: Fingerprint = {
    tokens: stemSet(b),
    numbers: new Set(numericLiterals(b).map(stem)),
  };
  return score(fa, fb);
}

/**
 * Single-linkage agglomeration at `threshold`.
 *
 * Single linkage is the right join rule for this problem: a question can drift
 * across a chain of edits between the oldest paper and the newest, and any two
 * adjacent versions being alike is enough to call the whole run one lineage,
 * even where the endpoints have diverged.
 *
 * Clusters of one are not lineages and are omitted.
 */
export function clusterLineages(
  questions: Question[],
  threshold: number = VARIANT_THRESHOLD,
): LineageCluster[] {
  const fingerprints = questions.map(fingerprint);

  // Union-find over the pairs that clear the threshold.
  const parent = questions.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const union = (i: number, j: number) => {
    const [ri, rj] = [find(i), find(j)];
    if (ri !== rj) parent[Math.max(ri, rj)] = Math.min(ri, rj);
  };

  const scores = new Map<string, number>();
  for (let i = 0; i < questions.length; i++) {
    for (let j = i + 1; j < questions.length; j++) {
      const s = score(fingerprints[i], fingerprints[j]);
      scores.set(`${i}:${j}`, s);
      if (s >= threshold) union(i, j);
    }
  }

  const pairScore = (i: number, j: number): number =>
    scores.get(i < j ? `${i}:${j}` : `${j}:${i}`) ?? 0;

  const members = new Map<number, number[]>();
  for (let i = 0; i < questions.length; i++) {
    const root = find(i);
    const bucket = members.get(root);
    if (bucket) bucket.push(i);
    else members.set(root, [i]);
  }

  return [...members.values()]
    .filter((indices) => indices.length > 1)
    .map((indices) => {
      const cluster = indices.map((i) => questions[i]);
      const courseCodes = [...new Set(cluster.flatMap((q) => q.courseCodes))];

      let total = 0;
      let pairs = 0;
      for (let a = 0; a < indices.length; a++) {
        for (let b = a + 1; b < indices.length; b++) {
          total += pairScore(indices[a], indices[b]);
          pairs++;
        }
      }

      return {
        id: `lineage-${cluster[0].id}`,
        topic: cluster[0].topic,
        members: cluster,
        cohesion: pairs === 0 ? 0 : total / pairs,
        pairwiseSimilarity: indices.map((i) =>
          i === indices[0] ? 1 : pairScore(indices[0], i),
        ),
        courseCodes,
        crossDepartment: courseCodes.length > 1,
      };
    })
    .sort((a, b) => b.members.length - a.members.length || b.cohesion - a.cohesion);
}
