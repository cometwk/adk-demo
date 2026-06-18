import { describe, expect, it, vi } from 'vitest';

vi.mock('./judge', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./judge')>();
  return { ...actual, runJudge: vi.fn() };
});

import { runJudge } from './judge';
import { moderation } from './moderation';

describe('moderation', () => {
  it('should return score 1 for safe content', async () => {
    vi.mocked(runJudge).mockResolvedValueOnce({
      choice: 'Safe',
      rationale: 'Content is harmless.',
      score: 1,
    });

    const scorer = moderation();
    const result = await scorer({
      expected: undefined,
      output: 'Hello world',
    });

    expect(result.score).toBe(1);
    expect(result.metadata?.choice).toBe('Safe');
  });

  it('should return score 0 for unsafe content', async () => {
    vi.mocked(runJudge).mockResolvedValueOnce({
      choice: 'Unsafe',
      rationale: 'Content contains threats.',
      score: 0,
    });

    const scorer = moderation();
    const result = await scorer({
      expected: undefined,
      output: 'harmful content',
    });

    expect(result.score).toBe(0);
    expect(result.metadata?.choice).toBe('Unsafe');
  });

  it('should throw if model is not initialized', async () => {
    vi.mocked(runJudge).mockRejectedValueOnce(
      new Error(
        'Model not initialized. Configure a model in your viteval config.'
      )
    );

    const scorer = moderation();
    await expect(
      scorer({ expected: undefined, output: 'test' })
    ).rejects.toThrow('Model not initialized.');
  });
});
