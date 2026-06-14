import "./utils/env";
import { z } from "zod";
import { generateStructured, getModelInstance, MODELS } from "@/lib/llm";
import { generateText } from "ai";

// 订单数最多的商户是哪个？

const inputSchema = z.object({
  name: z.string().describe("用户的全名"),
  age: z.number().describe("用户的年龄"),
  hobbies: z.array(z.string()).describe("兴趣爱好列表"),
});

async function main() {
  const r = await generateStructured({
    model: MODELS.STRUCTURED,
    prompt: "提取以下信息：张三，今年 25 岁，喜欢游泳和看书。",
    schema: inputSchema,
  });
  console.log("r=", r);

  //   const result = await generateText(
  //     model: getModelInstance(MODELS.AGENT),
  //     system: "你是一个助手，请根据用户的问题给出回答。",
  //     prompt: "你好，世界！",
  //   });
  //   console.log("result=", result);
}

main();
