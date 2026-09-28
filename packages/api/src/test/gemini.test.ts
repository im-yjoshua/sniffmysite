/**
 * gemini.ts — the one-liner module. All Gemini failure modes must resolve
 * to null: the one-liner is a bonus, never a scan blocker.
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateOneLiner,
  __testReset,
  __testSetCaps,
  type OneLinerInput,
  type GenerateOpts,
} from '../lib/gemini';

const INPUT: OneLinerInput = {
  domain: 'hype.example',
  sniffScore: 42,
  tier: 'JESTER',
  verdict: 'The verdict we already gave.',
  topPhrases: ['revolutionary', 'unlock growth'],
  snapshotHash: 'abc123',
};

function okFetch(text: string): GenerateOpts['fetchImpl'] {
  return (async () =>
    new Response(
      JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )) as GenerateOpts['fetchImpl'];
}

describe('generateOneLiner', () => {
  const OLD_KEY = process.env.GEMINI_API_KEY;

  beforeEach(() => {
    __testReset();
    process.env.GEMINI_API_KEY = 'test-key';
  });

  afterEach(() => {
    __testReset();
    if (OLD_KEY === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = OLD_KEY;
  });

  it('returns null without a key — and never calls the API', async () => {
    delete process.env.GEMINI_API_KEY;
    let called = 0;
    const line = await generateOneLiner(INPUT, {
      fetchImpl: (async () => {
        called += 1;
        throw new Error('must not be called');
      }) as GenerateOpts['fetchImpl'],
    });
    assert.equal(line, null);
    assert.equal(called, 0);
  });

  it('returns the cleaned line on success', async () => {
    const line = await generateOneLiner(INPUT, {
      fetchImpl: okFetch('"Their roadmap has a roadmap."\nSecond line ignored.'),
    });
    assert.equal(line, 'Their roadmap has a roadmap.');
  });

  it('returns null on API errors', async () => {
    const line = await generateOneLiner(INPUT, {
      fetchImpl: (async () => new Response('nope', { status: 500 })) as GenerateOpts['fetchImpl'],
    });
    assert.equal(line, null);
  });

  it('returns null on timeout instead of hanging the scan', async () => {
    // A fetch impl that honors the abort signal, like the real fetch does.
    const hanging: GenerateOpts['fetchImpl'] = ((_url: unknown, init?: { signal?: AbortSignal }) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(new DOMException('aborted', 'AbortError')),
        );
      })) as unknown as GenerateOpts['fetchImpl'];
    const line = await generateOneLiner(INPUT, { timeoutMs: 50, fetchImpl: hanging });
    assert.equal(line, null);
  });

  it('returns null when the spend cap is hit', async () => {
    __testSetCaps({ perMinute: 2, perDay: 100 });
    const opts = { fetchImpl: okFetch('Funny line.') };
    assert.equal(await generateOneLiner({ ...INPUT, snapshotHash: 'h1' }, opts), 'Funny line.');
    assert.equal(await generateOneLiner({ ...INPUT, snapshotHash: 'h2' }, opts), 'Funny line.');
    assert.equal(await generateOneLiner({ ...INPUT, snapshotHash: 'h3' }, opts), null);
  });

  it('caches per (domain, snapshotHash) — re-scans do not re-spend', async () => {
    let called = 0;
    const counting: GenerateOpts['fetchImpl'] = (async () => {
      called += 1;
      return new Response(
        JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Cached wit.' }] } }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }) as GenerateOpts['fetchImpl'];
    assert.equal(await generateOneLiner(INPUT, { fetchImpl: counting }), 'Cached wit.');
    assert.equal(await generateOneLiner(INPUT, { fetchImpl: counting }), 'Cached wit.');
    assert.equal(called, 1);
  });

  it('drops lines that trip the denylist', async () => {
    const line = await generateOneLiner(INPUT, {
      fetchImpl: okFetch('You absolute f4gg0t of a landing page.'),
    });
    assert.equal(line, null);
  });

  it('drops empty or absurdly long lines', async () => {
    assert.equal(await generateOneLiner(INPUT, { fetchImpl: okFetch('   ') }), null);
    assert.equal(
      await generateOneLiner({ ...INPUT, snapshotHash: 'long' }, { fetchImpl: okFetch('x'.repeat(500)) }),
      null,
    );
  });
});
