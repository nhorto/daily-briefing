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

/**
 * k-means clustering over vectors, scored by cosine similarity — used to build a
 * *multi-centroid* interest profile so a niche interest isn't averaged into mush
 * (Phase 5 / §A5). Returns the cluster means (un-normalized; the caller decides
 * whether to normalize). Empty clusters are dropped, so the result may have fewer
 * than `k` centroids.
 *
 * Deterministic by design (no randomness): seeds with farthest-first traversal
 * (Gonzalez) — start at the first vector, then repeatedly add the vector least
 * similar to every chosen seed — then runs Lloyd iterations to convergence. The
 * determinism keeps the profile stable run-to-run and makes it unit-testable.
 */
export function kMeans(vectors: number[][], k: number, maxIters = 25): number[][] {
  const n = vectors.length;
  if (n === 0) return [];
  if (k <= 1) {
    const mean = meanVector(vectors);
    return mean ? [mean] : [];
  }
  const kk = Math.min(k, n);

  // Farthest-first seeding (deterministic): maximize spread between seeds.
  const seedIdx: number[] = [0];
  while (seedIdx.length < kk) {
    let pick = -1;
    let pickScore = Infinity; // we want the vector whose *best* seed-similarity is lowest
    for (let i = 0; i < n; i++) {
      if (seedIdx.includes(i)) continue;
      let bestSim = -Infinity;
      for (const s of seedIdx) {
        const sim = cosineSimilarity(vectors[i] ?? [], vectors[s] ?? []);
        if (sim > bestSim) bestSim = sim;
      }
      if (bestSim < pickScore) {
        pickScore = bestSim;
        pick = i;
      }
    }
    if (pick === -1) break;
    seedIdx.push(pick);
  }
  let centroids = seedIdx.map((i) => (vectors[i] ?? []).slice());

  // Lloyd iterations: assign by max cosine, recompute means, stop when stable.
  let assignment = new Array<number>(n).fill(-1);
  for (let iter = 0; iter < maxIters; iter++) {
    let changed = false;
    const next = new Array<number>(n);
    for (let i = 0; i < n; i++) {
      let best = 0;
      let bestSim = -Infinity;
      for (let c = 0; c < centroids.length; c++) {
        const sim = cosineSimilarity(vectors[i] ?? [], centroids[c] ?? []);
        if (sim > bestSim) {
          bestSim = sim;
          best = c;
        }
      }
      next[i] = best;
      if (best !== assignment[i]) changed = true;
    }
    assignment = next;

    const groups: number[][][] = centroids.map(() => []);
    for (let i = 0; i < n; i++) groups[assignment[i] ?? 0]?.push(vectors[i] ?? []);
    centroids = centroids.map((prev, c) => meanVector(groups[c] ?? []) ?? prev);

    if (!changed) break;
  }

  // Drop centroids that ended up with no members.
  const counts = new Array<number>(centroids.length).fill(0);
  for (let i = 0; i < n; i++) counts[assignment[i] ?? 0] = (counts[assignment[i] ?? 0] ?? 0) + 1;
  return centroids.filter((_, c) => (counts[c] ?? 0) > 0);
}

/** The maximum cosine similarity of a vector to any of the given centroids. */
export function maxCosineSimilarity(v: number[], centroids: number[][]): number {
  let best = -Infinity;
  for (const c of centroids) {
    const sim = cosineSimilarity(v, c);
    if (sim > best) best = sim;
  }
  return best === -Infinity ? 0 : best;
}
