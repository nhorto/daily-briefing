/**
 * Vector math for the embedding layer — pure, framework-free, unit-tested.
 *
 * Used to compute "personal fit": cosine similarity between an article's
 * embedding and the user's profile vector (the mean of liked embeddings minus a
 * scaled mean of disliked ones). Brute-force cosine in TS is sub-millisecond at
 * our scale (hundreds–few thousand vectors), so no vector DB is needed.
 *
 * See docs/research/recommendation-engine-and-ux.md → Part A4.
 */

/** Cosine similarity of two equal-length vectors, in [-1, 1]. Zero/empty/mismatched → 0. */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    normA += x * x;
    normB += y * y;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/** Element-wise mean of vectors. Returns null for an empty list. */
export function meanVector(vectors: number[][]): number[] | null {
  if (vectors.length === 0) return null;
  const dim = vectors[0]?.length ?? 0;
  const sum = new Array<number>(dim).fill(0);
  for (const v of vectors) {
    for (let i = 0; i < dim; i++) sum[i] = (sum[i] ?? 0) + (v[i] ?? 0);
  }
  return sum.map((s) => s / vectors.length);
}

/** Add two equal-length vectors. Mismatched lengths use the longer, treating missing as 0. */
export function addVectors(a: number[], b: number[]): number[] {
  const dim = Math.max(a.length, b.length);
  const out = new Array<number>(dim);
  for (let i = 0; i < dim; i++) out[i] = (a[i] ?? 0) + (b[i] ?? 0);
  return out;
}

/** Multiply a vector by a scalar. */
export function scaleVector(v: number[], k: number): number[] {
  return v.map((x) => x * k);
}

/** Subtract b from a (a − b), element-wise. */
export function subtractVectors(a: number[], b: number[]): number[] {
  const dim = Math.max(a.length, b.length);
  const out = new Array<number>(dim);
  for (let i = 0; i < dim; i++) out[i] = (a[i] ?? 0) - (b[i] ?? 0);
  return out;
}

/** L2-normalize to a unit vector. A zero vector is returned unchanged. */
export function normalizeVector(v: number[]): number[] {
  let norm = 0;
  for (const x of v) norm += x * x;
  norm = Math.sqrt(norm);
  if (norm === 0) return v.slice();
  return v.map((x) => x / norm);
}
