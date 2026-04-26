import { generateText, ModelMessage, tool } from 'ai'
import { model } from './model'

async function hello() {
  const { text } = await generateText({
    model: model,
    // prompt: '写一副春节对联，横批：福星高照',
    prompt: '推荐顺德一道美食',
    onStepFinish: (result) => {
      console.log(result)
    },
  })

  console.log(text)
}

hello()