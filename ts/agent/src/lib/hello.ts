import { generateText, ModelMessage, tool } from 'ai'
import { z } from 'zod'
import { model } from './model'
import { generateStructureOutput } from './structure_output'

const inputSchema = z.object({
  name: z.string().describe('用户的全名'),
  age: z.number().describe('用户的年龄'),
  hobbies: z.array(z.string()).describe('兴趣爱好列表'),
})

const r = await generateStructureOutput({ prompt: '提取以下信息：张三，今年 25 岁，喜欢游泳和看书。', schema: inputSchema })
console.log('r=', r)
