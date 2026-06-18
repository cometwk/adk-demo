import { z } from "zod";
import { generateStructured, MODELS } from "./index";
import { beforeAll, describe, expect, it } from "vitest";

describe("just test", () => {
  beforeAll(async () => {
    // console.log("init success");
  });

  it("just test", async () => {
    const inputSchema = z.object({
      name: z.string().describe("用户的全名"),
      age: z.number().describe("用户的年龄"),
      hobbies: z.array(z.string()).describe("兴趣爱好列表"),
    });

    const r = await generateStructured({
      prompt: "提取以下信息：张三，今年 25 岁，喜欢游泳和看书。",
      schema: inputSchema,
      model: MODELS.STRUCTURED,
    });
    console.log("r=", r);
  }, 60_000);
});
