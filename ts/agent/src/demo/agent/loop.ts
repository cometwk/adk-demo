import { Executor } from "../runtime/executor";
import { Validator } from "../runtime/validator";
import { NextAction } from "../runtime/types";
import { buildPrompt } from "./prompt";

// ⚠️ 这里你替换成真实 LLM（Claude / OpenAI）
async function callLLM(prompt: string): Promise<NextAction> {
  console.log("\nPROMPT:\n", prompt);

  // 👉 Demo: 伪造一个简单策略（你可以替换为真实 API）
  return { op: "stop", reason: "Demo finished" };
}

export async function runAgentLoop(
  goal: string,
  executor: Executor,
  validator: Validator
) {
  const history: any[] = [];

  for (let step = 0; step < 6; step++) {
    const prompt = buildPrompt(goal, history);

    const action = await callLLM(prompt);

    console.log("ACTION:", action);

    if (!validator.validate(action)) {
      console.log("❌ Invalid action");
      break;
    }

    const obs = executor.execute(action);

    console.log("OBS:", obs);

    history.push({ action, obs });

    if (action.op === "stop") {
      console.log("✅ DONE:", obs.data);
      break;
    }
  }
}