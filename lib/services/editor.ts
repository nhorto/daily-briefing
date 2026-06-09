/**
 * LLM-as-editor "smell test" service (Phase 4).
 *
 * A single cheap pass over the day's importance shortlist that flags clickbait /
 * soft news / near-duplicates so the curated "Today" surface can drop them. Uses
 * gpt-4o-mini (this is a quick editorial judgment, not synthesis) in JSON mode.
 * Best-effort: any failure returns an empty map and the feed is unaffected.
 *
 * The prompt + parser are pure and unit-tested in lib/utils/editor.ts.
 */

import type { EditorialVerdict } from '../types';
import { getOpenAI } from './openai';
import {
  type EditorialCandidate,
  EDITOR_SYSTEM_PROMPT,
  buildEditorialPrompt,
  parseEditorialVerdicts,
} from '../utils/editor';

const MODEL = 'gpt-4o-mini';

export type { EditorialCandidate } from '../utils/editor';

/**
 * Run the editorial smell test over `candidates`, returning the lead-article ids
 * to drop. `maxDrops` caps honored drops so the editor can't gut the list.
 */
export async function runEditorialPass(
  candidates: EditorialCandidate[],
  maxDrops?: number
): Promise<Map<string, EditorialVerdict>> {
  if (candidates.length === 0) return new Map();

  try {
    const completion = await getOpenAI().chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: EDITOR_SYSTEM_PROMPT },
        { role: 'user', content: buildEditorialPrompt(candidates) },
      ],
      max_tokens: 600,
      temperature: 0.2,
      response_format: { type: 'json_object' },
    });

    const raw = completion.choices[0]?.message?.content?.trim() || '';
    const verdicts = parseEditorialVerdicts(
      raw,
      candidates.map((c) => c.id),
      maxDrops
    );
    console.log(
      `[Editor] Smell test dropped ${verdicts.size}/${candidates.length} shortlist items`
    );
    return verdicts;
  } catch (error) {
    console.error('[Editor] Smell test failed (continuing):', error);
    return new Map();
  }
}
