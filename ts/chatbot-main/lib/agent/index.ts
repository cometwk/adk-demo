import { ModelMessage } from "ai";
import { newAgentContext, S1 } from "@xui/agent/ex/use-case";

type Context = ReturnType<typeof newAgentContext>;

// 使用 global 对象避免热重载时状态丢失
const globalCache = global as unknown as {
  __agentContexts: Record<string, Context>;
};
if (!globalCache.__agentContexts) {
  globalCache.__agentContexts = {};
}

const predefinedContexts: Record<string, Context> = {
  S1,
};

export function getAgentContext(chatId: string) {
  const ctx = globalCache.__agentContexts[chatId];
  console.log("getAgentContext:", chatId, "found:", !!ctx);
  return ctx;
}

export function parseAgentInput({
  text,
  chatId,
}: {
  text: string;
  chatId: string;
}) {
  let ctx = predefinedContexts[text.trim()];
  if (!ctx) {
    ctx = newAgentContext(text);
  }

  // save to global cache
  globalCache.__agentContexts[chatId] = ctx;
  console.log(
    "parseAgentInput saved:",
    chatId,
    "cache keys:",
    Object.keys(globalCache.__agentContexts)
  );

  const init: ModelMessage[] = [
    {
      role: "user",
      content: ctx.system,
    },
    {
      role: "user",
      content: ctx.prompt,
    },
  ];

  return init;
}
