import { generateText, type ModelMessage, type Tool } from 'ai'
import { z } from 'zod'
import { model, provider } from './model'

export async function generateStructureOutput<T>({
  prompt,
  schema,
}: {
  prompt: string
  schema: z.ZodSchema<T>
}): Promise<T> {
  let output: T | null = null
  const extractTool = {
    inputSchema: schema,
    description: '',
    execute: async (data: T) => {
      const parsed = schema.safeParse(data)
      if (!parsed.success) {
        console.error('Invalid data:', parsed.error)
        return null
      }
      output = data
      return parsed.data
    },
  } as Tool

  let messages = [
    { role: 'system', content: 'generate structured data by extract tool' },
    { role: 'user', content: prompt },
  ]
  const r = await generateText({
    model: model,
    // model: provider('glm-5'),
    tools: {
      extract: extractTool,
    },
    // toolChoice: 'required',
    messages: messages as ModelMessage[],
  })
  if (!output) {
    throw new Error('Failed to generate structured data')
  }
  return output
}
