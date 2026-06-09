/**
 * Feed ranking — the recommendation engine's scoring core.
 *
 * Two forces decide what surfaces, then we diversify:
 *  1. Importance — how big a deal a story is *today*, independent of taste:
 *     log-scaled cluster size × source quality × freshness (time-decay).
 *  2. Affinity — the user's learned/manual preference (category + source).
 *
 * Scores are blended (each term normalized across the day's batch so neither
 * dominates by scale), then MMR-reranked to spread topics, then a small
 * exploration budget promotes off-profile-but-important items so the feed
 * never collapses into a monoculture.
 *
 * Everything here is pure and framework-free so it stays unit-testable. The
 * embedding "personal fit" term (Phase 2) plugs into {@link blendScores} later.
 *
 * See docs/research/recommendation-engine-and-ux.md → Part A.
 */

/** Signals needed to rank one feed item (a cluster or a single article). */
export interface RankSignal {
  /** How many sources cover this story (1 for a singleton article). */
  clusterSize: number;
  /** Quality/authority of the best source in the item, 0-100. */
  sourceQuality: number;
  /** Hours since the most-recent article in the item. */
  ageHours: number;
  /** Learned/manual preference for this item (category+source blend), 0-100. */
  affinity: number;
  /** Semantic "fit": cosine of the item's embedding to the profile vector,
   *  ~[-1, 1]. Undefined until the profile exists (cold start). */
  fit?: number;
}

/** Weights for blending the score terms. */
export interface RankWeights {
  importance?: number;
  affinity?: number;
  fit?: number;
}

/** Tunable ranking parameters. */
export const RANK_DEFAULTS = {
  /** Time-decay exponent. Softened vs Hacker News' 1.8 so a great piece from
   *  yesterday can still appear in a once-daily briefing. */
  gravity: 1.2,
  /** Two-way weights when there's no profile yet (cold start). */
  weightImportance: 0.4,
  weightAffinity: 0.6,
  /** Three-way weights once embeddings give a semantic "fit" term. */
  weightImportanceFit: 0.35,
  weightAffinityFit: 0.2,
  weightFit: 0.45,
  /** MMR relevance-vs-diversity knob (1 = pure relevance, 0 = pure diversity). */
  mmrLambda: 0.7,
  /** Off-profile-but-important items promoted into the top region. */
  explorationSlots: 2,
  /** How many leading positions count as "the top" for exploration. */
  topRegion: 12,
} as const;

/** MMR λ at the two ends of the "Focused ↔ Diverse" dial. */
export const DIVERSITY_LAMBDA_FOCUSED = 0.9; // relevance-first; allows topical repeats
export const DIVERSITY_LAMBDA_DIVERSE = 0.4; // spreads hard across topics

/**
 * Map the user's 0-100 "Focused ↔ Diverse" dial to an MMR λ. 0 → most focused
 * (high λ, relevance dominates), 100 → most diverse (low λ, spread topics). The
 * range is clamped to a sane band so neither end degenerates (λ=1 stacks dupes;
 * λ=0 ignores quality). The default dial value maps back to the original λ 0.7.
 */
export function lambdaForDiversity(diversity: number): number {
  const d = Math.max(0, Math.min(100, diversity)) / 100;
  return DIVERSITY_LAMBDA_FOCUSED - d * (DIVERSITY_LAMBDA_FOCUSED - DIVERSITY_LAMBDA_DIVERSE);
}

/**
 * Time-decay multiplier in (0, 1]; newer → closer to 1. Hacker-News-style
 * `1 / (age + 2)^gravity`. The +2 keeps brand-new items from spiking to infinity.
 */
export function timeDecay(ageHours: number, gravity: number = RANK_DEFAULTS.gravity): number {
  const age = Math.max(0, ageHours);
  return 1 / (age + 2) ** gravity;
}

/**
 * Raw importance: how much a story matters today, independent of personal taste.
 * Cluster size is log-scaled (`log1p`) so a wire story syndicated 8× doesn't
 * dominate — and so singletons still score above zero (log1p(1) ≈ 0.69).
 */
export function importanceScore(
  sig: RankSignal,
  gravity: number = RANK_DEFAULTS.gravity
): number {
  const size = Math.log1p(Math.max(0, sig.clusterSize));
  const quality = Math.max(0, sig.sourceQuality) / 100;
  return size * quality * timeDecay(sig.ageHours, gravity);
}

/**
 * Min-max normalize to [0, 1]. An empty input returns []; an all-equal input
 * returns a neutral 0.5 for every element (no spread to stretch).
 */
export function minMaxNormalize(values: number[]): number[] {
  if (values.length === 0) return [];
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const range = max - min;
  if (range === 0) return values.map(() => 0.5);
  return values.map((v) => (v - min) / range);
}

/**
 * Blend normalized importance + affinity (+ semantic fit, when available) into a
 * [0, 1] score per item. Each term is normalized across the supplied batch so
 * none dominates by scale. If no signal carries a `fit` value (cold start), this
 * behaves exactly as the two-term importance/affinity blend.
 */
export function blendScores(
  signals: RankSignal[],
  weights: RankWeights = {},
  gravity: number = RANK_DEFAULTS.gravity
): number[] {
  const hasFit = signals.some((s) => typeof s.fit === 'number');
  const wImp = weights.importance ?? (hasFit ? RANK_DEFAULTS.weightImportanceFit : RANK_DEFAULTS.weightImportance);
  const wAff = weights.affinity ?? (hasFit ? RANK_DEFAULTS.weightAffinityFit : RANK_DEFAULTS.weightAffinity);
  const wFit = weights.fit ?? (hasFit ? RANK_DEFAULTS.weightFit : 0);

  const impN = minMaxNormalize(signals.map((s) => importanceScore(s, gravity)));
  const affN = minMaxNormalize(signals.map((s) => s.affinity));
  const fitN = hasFit ? minMaxNormalize(signals.map((s) => s.fit ?? 0)) : [];

  return signals.map(
    (_, i) => wImp * (impN[i] ?? 0) + wAff * (affN[i] ?? 0) + wFit * (fitN[i] ?? 0)
  );
}

/**
 * Maximal Marginal Relevance reorder. Greedily picks the item maximizing
 * `λ·relevance − (1−λ)·maxSimilarityToAlreadyPicked`, so near-duplicate topics
 * get spread out instead of stacking. `similarity(i, j)` returns 0-1 between the
 * original indices. Returns the original indices in their new order.
 */
export function mmrRerank(
  scores: number[],
  similarity: (i: number, j: number) => number,
  lambda: number = RANK_DEFAULTS.mmrLambda
): number[] {
  const n = scores.length;
  const remaining = new Set<number>();
  for (let i = 0; i < n; i++) remaining.add(i);

  const ordered: number[] = [];
  while (remaining.size > 0) {
    let best = -1;
    let bestVal = -Infinity;
    for (const i of remaining) {
      let maxSim = 0;
      for (const j of ordered) {
        const s = similarity(i, j);
        if (s > maxSim) maxSim = s;
      }
      const val = lambda * (scores[i] ?? 0) - (1 - lambda) * maxSim;
      if (val > bestVal) {
        bestVal = val;
        best = i;
      }
    }
    ordered.push(best);
    remaining.delete(best);
  }
  return ordered;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
    : (sorted[mid] ?? 0);
}

/**
 * Exploration budget — surface a few off-profile-but-important items near the top
 * so the feed never tunnels into a filter bubble. Deterministic (no randomness):
 * picks the highest-importance items from the tail whose affinity is at/below the
 * median, and slots them at the bottom of the top region, demoting the weakest
 * top-region items just past them. Returns a new ordering of indices.
 */
export function promoteExploration(
  order: number[],
  signals: RankSignal[],
  opts: { slots?: number; topRegion?: number; gravity?: number } = {}
): number[] {
  const slots = opts.slots ?? RANK_DEFAULTS.explorationSlots;
  const topRegion = opts.topRegion ?? RANK_DEFAULTS.topRegion;
  if (slots <= 0 || order.length <= topRegion) return order;

  const med = median(signals.map((s) => s.affinity));
  const importanceOf = (i: number) => importanceScore(signals[i] as RankSignal, opts.gravity);

  const top = order.slice(0, topRegion);
  const rest = order.slice(topRegion);

  const candidates = rest
    .filter((i) => (signals[i] as RankSignal).affinity <= med)
    .sort((a, b) => importanceOf(b) - importanceOf(a))
    .slice(0, slots);
  if (candidates.length === 0) return order;

  const candSet = new Set(candidates);
  const newRest = rest.filter((i) => !candSet.has(i));
  const keepTop = top.slice(0, topRegion - candidates.length);
  const demoted = top.slice(topRegion - candidates.length);
  return [...keepTop, ...candidates, ...demoted, ...newRest];
}

/**
 * Full ranking pipeline: blend → MMR diversify → exploration. Returns the
 * original indices in their final display order. `similarity(i, j)` compares two
 * items by original index (title/keyword overlap now; embeddings in Phase 2).
 */
export function rankIndices(
  signals: RankSignal[],
  similarity: (i: number, j: number) => number,
  opts: {
    weights?: RankWeights;
    gravity?: number;
    mmrLambda?: number;
    explorationSlots?: number;
    topRegion?: number;
    /** Optional per-item score multipliers (≤1), aligned to `signals`. Applied to
     *  the blended score before MMR — used for day-level fatigue / impression
     *  discounting (Phase 5) without touching the long-term learned weights. */
    multipliers?: number[];
  } = {}
): number[] {
  if (signals.length === 0) return [];
  const blended = blendScores(signals, opts.weights, opts.gravity);
  const scores = opts.multipliers
    ? blended.map((s, i) => s * (opts.multipliers?.[i] ?? 1))
    : blended;
  const mmrOrder = mmrRerank(scores, similarity, opts.mmrLambda);
  return promoteExploration(mmrOrder, signals, {
    slots: opts.explorationSlots,
    topRegion: opts.topRegion,
    gravity: opts.gravity,
  });
}
