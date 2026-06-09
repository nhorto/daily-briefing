/**
 * Core TypeScript types for the Daily Briefing System
 */

export type SourceType = 'rss' | 'atom' | 'html' | 'blog';

export type BriefingStatus = 'processing' | 'ready' | 'error';

export type ArticleCategory =
  | 'ai-ml'
  | 'business'
  | 'science'
  | 'security'
  | 'programming'
  | 'devops'
  | 'design'
  | 'hardware'
  | 'other';

export const CATEGORY_META: Record<ArticleCategory, { label: string; icon: string }> = {
  'ai-ml':       { label: 'AI & ML',            icon: '🤖' },
  'business':    { label: 'Business & Startups', icon: '🏢' },
  'science':     { label: 'Science & Research',  icon: '🔬' },
  'security':    { label: 'Security & Privacy',  icon: '🔒' },
  'programming': { label: 'Programming',         icon: '💻' },
  'devops':      { label: 'DevOps & Infra',      icon: '☁️' },
  'design':      { label: 'Design & UX',         icon: '🎨' },
  'hardware':    { label: 'Hardware & Devices',  icon: '📱' },
  'other':       { label: 'Other',               icon: '📄' },
};

/**
 * Content Source Configuration
 * Supports both RSS feeds and HTML websites with auto-detection
 */
export interface Source {
  id: string; // UUID
  name: string; // Display name (e.g., "TechCrunch")
  url: string; // RSS feed URL or website URL
  type: SourceType; // Feed type (auto-detected or manual)
  authority: number; // 0-100 scale for deduplication ranking
  isActive: boolean; // Enable/disable without deleting
  lastFetchedAt?: string; // ISO timestamp of last successful fetch
  createdAt: string; // ISO timestamp of when source was added
}

/**
 * Individual Article/Content Item
 */
export interface Article {
  id: string; // UUID
  url: string; // Canonical article URL
  title: string; // Article title
  excerpt: string; // First 300 chars or description
  author?: string; // Author name (if available)
  publishedAt: string; // ISO timestamp
  sourceId: string; // Reference to Source.id
  sourceName: string; // Denormalized for display performance
  sourceAuthority: number; // Denormalized for clustering
  fetchedAt: string; // ISO timestamp of when we fetched this
  summary?: string; // AI-generated 1-sentence summary
  category?: ArticleCategory; // AI-assigned content category
  imageUrl?: string; // Thumbnail (feed media or og:image), if available
}

/**
 * A bookmarked article. We store a full snapshot (not just an ID) so saved
 * articles survive briefing rollover — the original briefing it came from expires.
 */
export interface SavedArticle extends Article {
  savedAt: string; // ISO timestamp when the article was bookmarked
}

/**
 * Topic Cluster (group of similar articles)
 */
export interface Cluster {
  id: string; // UUID
  title: string; // Generated from representative article
  summary: string; // GPT-4o synthesized summary (2-3 sentences)
  articles: Article[]; // All articles in this cluster
  representativeArticle: Article; // Highest authority source
  avgSimilarity: number; // 0-1 scale (text similarity score)
  createdAt: string; // ISO timestamp
}

/**
 * Daily Briefing (complete day's content)
 */
export interface Briefing {
  date: string; // YYYY-MM-DD
  startTime: string; // ISO timestamp (e.g., yesterday 8 AM)
  endTime: string; // ISO timestamp (e.g., today 8 AM)

  // Content
  clusters: Cluster[]; // Topic clusters (sorted by article count desc)
  individualArticles: Article[]; // Unclustered articles (sorted by time desc)

  // Statistics
  totalArticles: number;
  totalClusters: number;
  totalSources: number;

  // Metadata
  status: BriefingStatus;
  generatedAt: string; // ISO timestamp
  processingTimeMs: number;
  errors?: Array<{
    sourceId: string;
    sourceName: string;
    error: string;
  }>;
}

/**
 * AI-synthesized daily intelligence summary
 */
export interface DailyIntelligence {
  topStories: string;
  categories: Array<{
    name: string;
    icon: string;
    summary: string;
    articleIds: string[];
    priority: number;
  }>;
  generatedAt: string;
}

/**
 * A training signal the user gives on an article.
 * - `up`   → "more like this" (boosts its category + source)
 * - `down` → "less like this" (lowers its category + source)
 * - `hide` → "not interested" (strong lower + hides it from the feed)
 */
export type FeedbackSignal = 'up' | 'down' | 'hide';

/**
 * An implicit engagement signal captured from behavior (Phase 4) — distinct from
 * an explicit 👍/👎. These are dense but noisy, so they nudge the model gently and
 * are time-decayed. Position-biased/clickbait-prone signals are weakest.
 * - `feed-open`     → opened a story from the feed (a click; noisy, position-biased)
 * - `open-original` → clicked through to the original source (deliberate jump off-platform)
 * - `read-to-end`   → scrolled to the bottom of the detail page
 * - `dwell`         → spent genuine foreground time, length-normalized (see signals.ts)
 * - `impression`    → shown in the feed but not engaged (weak negative)
 */
export type EngagementType =
  | 'feed-open'
  | 'open-original'
  | 'read-to-end'
  | 'dwell'
  | 'impression';

/**
 * How much each implicit signal nudges the learned affinity (category + source
 * weights, 0-100). Deliberately gentle vs. an explicit ±8 — implicit signals are
 * noisy, and many accumulate. Quality signals (read-to-end, open-original)
 * outweigh raw clicks; a bare feed click barely counts; an ignored impression
 * is a small negative.
 */
export const ENGAGEMENT_AFFINITY_DELTA: Record<EngagementType, number> = {
  'open-original': 4,
  'read-to-end': 4,
  'dwell': 2,
  'feed-open': 1,
  'impression': -0.5,
};

/**
 * Which implicit signals are strong enough to also move the *semantic* profile
 * vector (a genuine "I engaged with this content" signal). Bare clicks and
 * impressions are too noisy to fold into the embedding profile.
 */
export const PROFILE_POSITIVE_ENGAGEMENTS: readonly EngagementType[] = [
  'open-original',
  'read-to-end',
  'dwell',
];

/**
 * Time-decay (Phase 4). Behavioral signals age out with an exponential ~30-day
 * half-life so taste can drift; the stated onboarding prior (interestBaseline)
 * decays far slower. When explicit feedback conflicts with the stated prior,
 * explicit wins — it refreshes the decay clock, so it dominates while it's recent.
 */
export const SIGNAL_HALF_LIFE_DAYS = 30;
export const ONBOARDING_HALF_LIFE_DAYS = 180;

/**
 * User Preferences — the learned/manual model used to rank content.
 * Category weights start from the settings sliders and are nudged by feedback;
 * source weights are learned purely from feedback.
 */
export interface UserPreferences {
  interests: Record<ArticleCategory, number>; // category → weight (0-100)
  sources: Record<string, number>; // sourceName → learned weight (0-100)
  mutedKeywords: string[]; // articles whose title/excerpt match are filtered out
  // The stated/onboarding prior for category interest (Phase 4). Behavioral
  // signals decay the live `interests` back toward this baseline (slow-decay);
  // unset until onboarding/settings set it, in which case it falls back to 50.
  interestBaseline?: Record<ArticleCategory, number>;
  onboardedAt?: string; // ISO timestamp when onboarding was completed (Phase 4)
  updatedAt: string; // ISO timestamp
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  interests: {
    'ai-ml': 50,
    'business': 50,
    'science': 50,
    'security': 50,
    'programming': 50,
    'devops': 50,
    'design': 50,
    'hardware': 50,
    'other': 50,
  },
  sources: {},
  mutedKeywords: [],
  updatedAt: new Date().toISOString(),
};

/** Weight applied to category vs source signal when scoring an article. */
export const SCORE_WEIGHTS = { category: 0.6, source: 0.4 } as const;

/**
 * The user's semantic interest profile, accumulated from feedback. Running sums
 * (not a precomputed mean) so it updates incrementally and survives briefing
 * regenerations. The profile vector is normalize(mean(pos) − λ·mean(neg)).
 */
export interface ProfileState {
  posSum: number[]; // sum of liked/saved embeddings
  posCount: number;
  negSum: number[]; // sum of disliked/hidden embeddings
  negCount: number;
  dim: number; // embedding dimension (resets profile if it changes)
  updatedAt: string;
}

/** How strongly disliked content pushes the profile away (the λ in pos − λ·neg). */
export const PROFILE_DISLIKE_WEIGHT = 0.4;

/** How far each feedback signal nudges the relevant weights (clamped 0-100). */
export const FEEDBACK_DELTAS: Record<FeedbackSignal, number> = {
  up: 8,
  down: -8,
  hide: -15,
};

/**
 * Chat Message for the chat interface
 */
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: string;
}

/**
 * Chat Context for RAG-style chat
 */
export interface ChatContext {
  briefingDate: string; // Which day's briefing to query
  topicClusterId?: string; // Optional: focus on specific cluster
  articles: Article[]; // Context articles for the LLM
}

/**
 * Source Configuration (for file-based config)
 */
export interface SourceConfig {
  version: string; // Config file version
  lastUpdated: string; // ISO timestamp
  sources: Array<{
    name: string;
    url: string;
    type?: SourceType; // Optional: will be auto-detected if not specified
    authority?: number; // Optional: defaults to 50 if not specified
  }>;
}

/**
 * API Response Types
 */
export interface APIResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface BriefingResponse {
  briefing: Briefing;
}

export interface SourcesResponse {
  sources: Source[];
}

export interface AggregationResponse {
  success: boolean;
  briefingId: string;
  statistics: {
    articlesProcessed: number;
    articlesClustered: number;
    clustersCreated: number;
    individualArticles: number;
    processingTimeMs: number;
  };
  errors?: Array<{
    sourceId: string;
    sourceName: string;
    error: string;
  }>;
}
