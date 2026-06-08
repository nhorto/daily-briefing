import { test, expect, describe } from 'bun:test';
import { JSDOM } from 'jsdom';
import { extractImageFromRssItem, extractOgImage } from './aggregator';

const BASE = 'https://news.example.com/article';

describe('extractImageFromRssItem', () => {
  test('uses an image enclosure', () => {
    const item = { enclosure: { url: 'https://cdn.example.com/a.jpg', type: 'image/jpeg' } };
    expect(extractImageFromRssItem(item, BASE)).toBe('https://cdn.example.com/a.jpg');
  });

  test('ignores a non-image enclosure', () => {
    const item = { enclosure: { url: 'https://cdn.example.com/a.mp3', type: 'audio/mpeg' } };
    expect(extractImageFromRssItem(item, BASE)).toBeUndefined();
  });

  test('uses media:thumbnail', () => {
    const item = { mediaThumbnail: { $: { url: 'https://cdn.example.com/thumb.png' } } };
    expect(extractImageFromRssItem(item, BASE)).toBe('https://cdn.example.com/thumb.png');
  });

  test('uses an image entry from a media:content array', () => {
    const item = {
      mediaContent: [
        { $: { url: 'https://cdn.example.com/clip.mp4', medium: 'video' } },
        { $: { url: 'https://cdn.example.com/pic.jpg', medium: 'image' } },
      ],
    };
    expect(extractImageFromRssItem(item, BASE)).toBe('https://cdn.example.com/pic.jpg');
  });

  test('falls back to the first <img> in content', () => {
    const item = { 'content:encoded': '<p>hi</p><img src="/img/hero.png" alt="x">' };
    expect(extractImageFromRssItem(item, BASE)).toBe('https://news.example.com/img/hero.png');
  });

  test('returns undefined when there is no image', () => {
    expect(extractImageFromRssItem({ content: '<p>no images here</p>' }, BASE)).toBeUndefined();
  });
});

describe('extractOgImage', () => {
  function docFrom(head: string): Document {
    return new JSDOM(`<!doctype html><html><head>${head}</head><body></body></html>`).window
      .document as unknown as Document;
  }

  test('reads og:image', () => {
    const doc = docFrom('<meta property="og:image" content="https://cdn.example.com/og.jpg">');
    expect(extractOgImage(doc, BASE)).toBe('https://cdn.example.com/og.jpg');
  });

  test('falls back to twitter:image', () => {
    const doc = docFrom('<meta name="twitter:image" content="https://cdn.example.com/tw.jpg">');
    expect(extractOgImage(doc, BASE)).toBe('https://cdn.example.com/tw.jpg');
  });

  test('absolutizes a relative og:image', () => {
    const doc = docFrom('<meta property="og:image" content="/media/hero.jpg">');
    expect(extractOgImage(doc, BASE)).toBe('https://news.example.com/media/hero.jpg');
  });

  test('returns undefined when no image meta is present', () => {
    expect(extractOgImage(docFrom('<title>x</title>'), BASE)).toBeUndefined();
  });
});
