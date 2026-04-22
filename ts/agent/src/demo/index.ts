import { seedGraph } from "./data/seed";
import { Executor } from "./runtime/executor";
import { Validator } from "./runtime/validator";
import { runAgentLoop } from "./agent/loop";

async function main() {
  const graph = seedGraph();

  const executor = new Executor(graph);
  const validator = new Validator(graph);

  await runAgentLoop(
    "Assess project risk for project_1",
    executor,
    validator
  );
}

main();