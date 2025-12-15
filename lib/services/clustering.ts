/**
 * Article Clustering Service
 * Groups similar articles into topic clusters using text-based similarity
 */

import { nanoid } from 'nanoid';
import type { Article, Cluster } from '../types';
import {
  areArticlesDuplicates,
  calculateTitleSimilarity,
  calculateArticleSimilarity,
} from '../utils/similarity';

/**
 * Cluster articles by similarity
 * Returns clusters (groups of 2+ similar articles) and remaining individual articles
 */
export function clusterArticles(
  articles: Article[],
  minClusterSize = 2,
  similarityThreshold = 0.7
): { clusters: Cluster[]; individualArticles: Article[] } {
  const clusters: Cluster[] = [];
  const visited = new Set<string>();

  for (const article of articles) {
    if (visited.has(article.id)) continue;

    // Find all similar articles
    const similar: Article[] = [];
    for (const other of articles) {
      if (other.id === article.id || visited.has(other.id)) continue;

      if (areArticlesDuplicates(article, other, similarityThreshold)) {
        similar.push(other);
      }
    }

    // Require at least minClusterSize articles to form a cluster
    if (similar.length >= minClusterSize - 1) {
      const clusterArticles = [article, ...similar];

      // Select representative article (highest source authority)
      const representative = clusterArticles.reduce((best, curr) =>
        curr.sourceAuthority > best.sourceAuthority ? curr : best
      );

      // Calculate average similarity within cluster
      const avgSimilarity = calculateAverageSimilarity(clusterArticles);

      // Create cluster
      clusters.push({
        id: nanoid(),
        title: representative.title, // Use best source's title
        summary: '', // Will be filled by summarization service
        articles: clusterArticles,
        representativeArticle: representative,
        avgSimilarity,
        createdAt: new Date().toISOString(),
      });

      // Mark all articles as visited
      clusterArticles.forEach((a) => visited.add(a.id));
    }
  }

  // Collect unclustered articles
  const individualArticles = articles.filter((a) => !visited.has(a.id));

  return { clusters, individualArticles };
}

/**
 * Calculate average pairwise similarity within a cluster
 */
function calculateAverageSimilarity(articles: Article[]): number {
  if (articles.length < 2) return 1;

  let totalSim = 0;
  let count = 0;

  for (let i = 0; i < articles.length; i++) {
    for (let j = i + 1; j < articles.length; j++) {
      totalSim += calculateArticleSimilarity(articles[i], articles[j]);
      count++;
    }
  }

  return count > 0 ? totalSim / count : 1;
}

/**
 * Sort clusters by article count (descending)
 */
export function sortClustersBySize(clusters: Cluster[]): Cluster[] {
  return [...clusters].sort((a, b) => b.articles.length - a.articles.length);
}

/**
 * Sort articles by publish time (newest first)
 */
export function sortArticlesByTime(articles: Article[]): Article[] {
  return [...articles].sort((a, b) => {
    const timeA = new Date(a.publishedAt).getTime();
    const timeB = new Date(b.publishedAt).getTime();
    return timeB - timeA; // Descending (newest first)
  });
}

/**
 * Get cluster statistics
 */
export function getClusterStats(clusters: Cluster[]): {
  totalClusters: number;
  totalClusteredArticles: number;
  avgClusterSize: number;
  avgSimilarity: number;
} {
  const totalClusters = clusters.length;
  const totalClusteredArticles = clusters.reduce((sum, c) => sum + c.articles.length, 0);
  const avgClusterSize = totalClusters > 0 ? totalClusteredArticles / totalClusters : 0;
  const avgSimilarity =
    totalClusters > 0 ? clusters.reduce((sum, c) => sum + c.avgSimilarity, 0) / totalClusters : 0;

  return {
    totalClusters,
    totalClusteredArticles,
    avgClusterSize,
    avgSimilarity,
  };
}
