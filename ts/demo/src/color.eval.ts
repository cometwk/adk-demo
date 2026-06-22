import { DataItem, evaluate } from 'viteval';
import { generateText } from 'ai'; // or your preferred LLM library
import { getModelInstance, scorers } from '@xui/lib';

evaluate('Color detection', {
  data: async () => [
    //input: 'What is 2+2?',
    { input: 'What is 2+2?', expected: '4' },
    // { input: 'What color is the sky?', expected: 'Blue' },
    // { input: 'What color is grass?', expected: 'Green' },
    // { input: 'What color is snow?', expected: 'White' },
  ],
  task: async (input) => {
    const result = await generateText({
      model: getModelInstance(),
      prompt: input.input,
    });
    return result.text;
  },
  scorers: [scorers.answerCorrectness()],
  threshold: 0.8,
});
