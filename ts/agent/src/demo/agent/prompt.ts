export function buildPrompt(goal: string, history: any[]): string {
  return `
You are a reasoning agent.

GOAL:
${goal}

RULES:
- You can ONLY output ONE JSON action
- Do NOT assume facts
- If missing info → explore
- If confident → stop

Available actions:
1. traverse { from, relation }
2. call { node, method }
3. stop { reason }

History:
${JSON.stringify(history, null, 2)}

Respond ONLY JSON:
`;
}