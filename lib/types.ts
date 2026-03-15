/**
 * Core TypeScript types for the Daily Briefing System
 */

export type SourceType = 'rss' | 'atom' | 'html';

export type BriefingStatus = 'processing' | 'ready' | 'error';

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
