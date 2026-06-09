import { test, expect, describe } from 'bun:test';
import {
  type EditorialCandidate,
  buildEditorialPrompt,
  parseEditorialVerdicts,
} from './editor';

const candidates: EditorialCandidate[] = [
  { id: 'a', title: 'Big chip launch', source: 'TechCrunch', summary: 'A new chip.' },
  { id: 'b', title: 'You won\'t BELIEVE this trick', source: 'Buzz', summary: 'Clickbait.' },
  { id: 'c', title: 'Same chip launch', source: 'Verge', summary: 'A new chip again.' },
];

describe('buildEditorialPrompt', () => {
  test('lists every candidate id and asks for the verdicts JSON shape', () => {
    const prompt = buildEditorialPrompt(candidates);
    expect(prompt).toContain('id: a');
    expect(prompt).toContain('id: b');
    expect(prompt).toContain('id: c');
    expect(prompt).toContain('"verdicts"');
  });
});

describe('parseEditorialVerdicts', () => {
  const ids = ['a', 'b', 'c'];

  test('keeps only drop=true entries with valid ids', () => {
    const raw = JSON.stringify({
      verdicts: [
        { id: 'b', drop: true, reason: 'clickbait' },
        { id: 'a', drop: false },
        { id: 'c', drop: true, reason: 'duplicate of a' },
      ],
    });
    const map = parseEditorialVerdicts(raw, ids);
    expect([...map.keys()].sort()).toEqual(['b', 'c']);
    expect(map.get('b')?.reason).toBe('clickbait');
  });

  test('ignores ids not in the candidate set', () => {
    const raw = JSON.stringify({ verdicts: [{ id: 'zzz', drop: true }] });
    expect(parseEditorialVerdicts(raw, ids).size).toBe(0);
  });

  test('returns an empty map on malformed JSON', () => {
    expect(parseEditorialVerdicts('not json', ids).size).toBe(0);
    expect(parseEditorialVerdicts('{}', ids).size).toBe(0);
    expect(parseEditorialVerdicts(JSON.stringify({ verdicts: 'nope' }), ids).size).toBe(0);
  });

  test('honors maxDrops, earliest-listed first', () => {
    const raw = JSON.stringify({
      verdicts: [
        { id: 'a', drop: true },
        { id: 'b', drop: true },
        { id: 'c', drop: true },
      ],
    });
    const map = parseEditorialVerdicts(raw, ids, 2);
    expect(map.size).toBe(2);
    expect(map.has('a')).toBe(true);
    expect(map.has('b')).toBe(true);
    expect(map.has('c')).toBe(false);
  });

  test('a missing reason is allowed', () => {
    const raw = JSON.stringify({ verdicts: [{ id: 'a', drop: true }] });
    expect(parseEditorialVerdicts(raw, ids).get('a')).toEqual({ drop: true, reason: undefined });
  });
});
