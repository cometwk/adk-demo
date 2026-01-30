import { generateText } from 'ai';
import { model } from './model';

const { text } = await generateText({
  model: model,
  prompt: '写一副春节对联，横批：福星高照',
  onStepFinish: (result) => {
    console.log(result);
  },
});

console.log(text);
