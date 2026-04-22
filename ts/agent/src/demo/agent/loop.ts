import { Executor } from "../runtime/executor";
import { Validator } from "../runtime/validator";
import { NextAction } from "../runtime/types";
import { Graph } from "../runtime/graph";
import { buildPrompt } from "./prompt";

async function callLLM(prompt: string): Promise<NextAction> {
  console.log("\nPROMPT:\n", prompt);

  return { op: "stop", reason: "Demo finished" };
}

export async function runAgentLoop(
  goal: string,
  graph: Graph,
  executor: Executor,
  validator: Validator
) {
  const history: any[] = [];

  for (let step = 0; step < 6; step++) {
    const prompt = buildPrompt(goal, history, graph);

    const action = await callLLM(prompt);

    console.log("ACTION:", action);

    const validation = validator.validate(action);
    if (!validation.valid) {
      console.log("❌ Invalid action:", validation.error);
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