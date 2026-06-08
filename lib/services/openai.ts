/**
 * Lazily-created OpenAI client.
 *
 * Constructing `new OpenAI()` at module load throws when OPENAI_API_KEY is unset,
 * which breaks `next build` (it evaluates these modules without runtime env).
 * Creating the client on first use defers that to request time.
 */

import OpenAI from 'openai';

let client: OpenAI | null = null;

export function getOpenAI(): OpenAI {
  if (!client) {
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return client;
}
