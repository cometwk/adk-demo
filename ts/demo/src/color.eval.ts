import { DataItem, evaluate } from 'viteval';
import { generateText } from 'ai'; // or your preferred LLM library
import { scorers } from '@xui/lib';

evaluate('Color detection', {
  data: async () => [
    { input: 'What color is the sky?', expected: 'Blue' },
    { input: 'What color is grass?', expected: 'Green' },
    { input: 'What color is snow?', expected: 'White' },
  ],
  task: async (input) => {
    const result = await generateText({
      model: 'gpt-4', // Configure your model here
      prompt: input.input,
    });
    return result.text;
  },
  scorers: [scorers.levenshtein as any],
  threshold: 0.8,
});
