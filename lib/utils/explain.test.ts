import { describe, it, expect } from 'bun:test';
import type { UserPreferences } from '../types';
import { DEFAULT_PREFERENCES } from '../types';
import { explainRanking } from './explain';

const neutralPrefs: UserPreferences = {
  ...DEFAULT_PREFERENCES,
  interests: { ...DEFAULT_PREFERENCES.interests },
  sources: {},
};

const base = {
  category: 'ai-ml' as const,
  sourceName: 'TechCrunch',
  sourceCount: 1,
  ageHours: 5,
  preferences: neutralPrefs,
};

describe('explainRanking', () => {
  it('leads with semantic fit when it is strong', () => {
    const r = explainRanking({ ...base, fit: 0.6 });
    expect(r.kind).toBe('fit');
    expect(r.label).toMatch(/similar/i);
  });

  it('credits a followed topic when category weight is high', () => {
    const prefs = { ...neutralPrefs, interests: { ...neutralPrefs.interests, 'ai-ml': 90 } };
    const r = explainRanking({ ...base, preferences: prefs });
    expect(r.kind).toBe('topic');
    expect(r.label).toContain('AI & ML');
  });

  it('credits a favored source when source weight is high', () => {
    const prefs = { ...neutralPrefs, sources: { TechCrunch: 90 } };
    const r = explainRanking({ ...base, preferences: prefs });
    expect(r.kind).toBe('source');
    expect(r.label).toContain('TechCrunch');
  });

  it('calls out a big multi-source story', () => {
    const r = explainRanking({ ...base, sourceCount: 5 });
    expect(r.kind).toBe('popular');
    expect(r.label).toContain('5 sources');
  });

  it('falls back to freshness when nothing else stands out', () => {
    const r = explainRanking({ ...base, ageHours: 2 });
    expect(r.kind).toBe('fresh');
    expect(r.label).toMatch(/fresh/i);
  });

  it('falls back to a neutral tag for an old, unremarkable item', () => {
    const r = explainRanking({ ...base, ageHours: 72 });
    expect(r.kind).toBe('fresh');
    expect(r.label).toMatch(/briefing/i);
  });

  it('does not claim a topic the user has down-weighted', () => {
    const prefs = { ...neutralPrefs, interests: { ...neutralPrefs.interests, 'ai-ml': 20 } };
    const r = explainRanking({ ...base, ageHours: 48, preferences: prefs });
    expect(r.kind).not.toBe('topic');
  });

  it('prefers strong fit over a high topic weight', () => {
    const prefs = { ...neutralPrefs, interests: { ...neutralPrefs.interests, 'ai-ml': 80 } };
    const r = explainRanking({ ...base, fit: 0.7, preferences: prefs });
    expect(r.kind).toBe('fit');
  });
});
