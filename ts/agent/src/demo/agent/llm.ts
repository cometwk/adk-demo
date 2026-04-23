import { generateText, tool } from 'ai';
import { z } from 'zod';
import { model } from '../../lib/model';


// 1. 使用 tool() 定义你的工具
const extractUserInfoTool = tool({
  description: '提取并保存用户信息',
  // 这里就是告诉 LLM Zod-schema 的地方
  inputSchema: z.object({
    name: z.string().describe('用户的全名'),
    age: z.number().describe('用户的年龄'),
    hobbies: z.array(z.string()).describe('兴趣爱好列表'),
  }),
  // 如果你只是想提取数据，execute 可以返回数据本身或简单的确认
  execute: async ({ name, age, hobbies }) => {
    console.log('正在保存到数据库...', { name, age, hobbies });
    return { name, age, hobbies }
  },
});

async function main() {
  const r = await generateText({
    model: model,
    
    // 2. 将定义好的工具放入 tools 对象
    tools: {
      extract: extractUserInfoTool,
    },

    // 3. 关键点：强制模型必须调用这个工具，从而实现“结构化返回”
    toolChoice: 'required', 

    prompt: '提取以下信息：张三，今年 25 岁，喜欢游泳和看书。',
  });

  console.log(r)

  // 4. 获取结果
  // 由于设置了 toolChoice: 'required'，第一个 toolCall 就是你要的结构化数据
  const result = r.toolCalls[0].input
  
  console.log('解析后的结构化对象:', result);
  // 输出: { name: '张三', age: 25, hobbies: ['游泳', '看书'] }
}

main()