import { beforeAll, describe, expect, it, vi } from 'vitest';
import { answerCorrectness } from '../scorer/llm/answer-correctness';
import { initializeModel } from '#/model';
import { getModelInstance, getEmbeddingModel, loadEnv } from '#/lib';

describe('answerCorrectness', () => {
  loadEnv()
  initializeModel({
    embedding: getEmbeddingModel(),
    language: getModelInstance(),
  });
  it('simple', async () => {
    const scorer = answerCorrectness();
    console.log('x=', scorer);
    const result = await scorer({
      input: 'What is 2+2?',
      output: 'four',
      expected: '4',
    });

    console.log(result);
  });
});
