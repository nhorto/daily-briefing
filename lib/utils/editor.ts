/**
 * LLM-as-editor "smell test" — pure helpers (Phase 4).
 *
 * Apple News found ~30 human editors picking a handful of leads beat a pure
 * trending algorithm: they applied a "smell test" (drop clickbait / soft news /
 * near-duplicates) and kept source diversity. We give a cheap LLM that editorial
 * role over the day's importance shortlist. This module holds the prompt and the
 * response parser so they're unit-testable without a network call; the API call
 * lives in lib/services/editor.ts.
 *
 * See docs/research/recommendation-engine-and-ux.md → Part A3 step 4.
 */

import type { EditorialVerdict } from '../types';

/** One story handed to the editor. `id` is the lead article's id. */
export interface EditorialCandidate {
  id: string;
  title: string;
  source: string;
  summary: string;
}

export const EDITOR_SYSTEM_PROMPT =
  'You are a sharp news editor curating a short "top stories" list for one reader. ' +
  'You trim the shortlist: drop only items that clearly do not belong. ' +
  'Drop clickbait and engagement-bait headlines, soft/fluff/promotional filler, ' +
  'and near-duplicates (when two items cover the same thing, keep the stronger and ' +
  'drop the rest). Be conservative — when a story is substantive, keep it. Never ' +
  'drop something merely because the topic is niche.';

/** Build the user prompt listing the candidates and the required JSON shape. */
export function buildEditorialPrompt(candidates: EditorialCandidate[]): string {
  const list = candidates
    .map(
      (c) =>
        `- id: ${c.id}\n  source: ${c.source}\n  title: ${c.title}\n  summary: ${c.summary || '(none)'}`
    )
    .join('\n');

  return `Here are ${candidates.length} candidate stories for today's shortlist:

${list}

Return JSON of the form {"verdicts": [{"id": "...", "drop": true|false, "reason": "..."}]}.
Include an entry only for items you would DROP, each with a short reason
("clickbait", "soft news", "duplicate of <id>"). If nothing should be dropped,
return {"verdicts": []}.`;
}

/**
 * Parse the editor's JSON response into a map of dropped article id → verdict.
 * Robust to junk: ignores ids not in `validIds`, ignores non-drop entries, and
 * returns an empty map on any parse failure. `maxDrops` caps how many drops are
 * honored (a safety net against an over-zealous editor gutting the list) —
 * earliest-listed drops win.
 */
export function parseEditorialVerdicts(
  raw: string,
  validIds: string[],
  maxDrops: number = Number.POSITIVE_INFINITY
): Map<string, EditorialVerdict> {
  const out = new Map<string, EditorialVerdict>();
  const valid = new Set(validIds);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return out;
  }

  const verdicts = (parsed as { verdicts?: unknown })?.verdicts;
  if (!Array.isArray(verdicts)) return out;

  for (const v of verdicts) {
    if (out.size >= maxDrops) break;
    if (!v || typeof v !== 'object') continue;
    const { id, drop, reason } = v as { id?: unknown; drop?: unknown; reason?: unknown };
    if (typeof id !== 'string' || drop !== true || !valid.has(id) || out.has(id)) continue;
    out.set(id, { drop: true, reason: typeof reason === 'string' ? reason : undefined });
  }
  return out;
}
