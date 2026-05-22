// // 必须 import 实体类以触发装饰器注册（副作用 import）
// import "@xui/agent/ex/ontology";

// // 从 @xui/agent 导入，确保与 ontology 使用同一个 Registry 实例
// import { AgentRegistry } from "@xui/agent";

// import { ModelMessage } from "ai";
// import {
//   newAgentContext,
//   S0,
//   S1,
//   S2,
//   S3,
//   S4,
//   S5,
//   S6,
//   S7,
//   S8,
//   S9,
//   S10,
// } from "@xui/agent/ex/use-case";

// // console.log("AgentRegistry.all()", AgentRegistry.all());

// type Context = ReturnType<typeof newAgentContext>;

// // 使用 global 对象避免热重载时状态丢失
// const globalCache = global as unknown as {
//   __agentContexts: Record<string, Context>;
// };
// if (!globalCache.__agentContexts) {
//   globalCache.__agentContexts = {};
// }

// const predefinedContexts: Record<string, Context> = {
//   S0,
//   S1,
//   S2,
//   S3,
//   S4,
//   S5,
//   S6,
//   S7,
//   S8,
//   S9,
//   S10,
// };

// export function getAgentContext(chatId: string) {
//   const ctx = globalCache.__agentContexts[chatId];
//   console.log("getAgentContext:", chatId, "found:", !!ctx);
//   return ctx;
// }

// export function parseAgentInput({
//   text,
//   chatId,
// }: {
//   text: string;
//   chatId: string;
// }) {
//   console.log("text", text);
//   let ctx = predefinedContexts[text.trim()];
//   if (!ctx) {
//     ctx = newAgentContext(text);
//   }
//   // console.log("ctx", ctx);

//   // save to global cache
//   globalCache.__agentContexts[chatId] = ctx;
//   console.log(
//     "parseAgentInput saved:",
//     chatId,
//     "cache keys:",
//     Object.keys(globalCache.__agentContexts)
//   );

//   const init: ModelMessage[] = [
//     {
//       role: "system",
//       content: "```\n" + ctx.system + "\n```",
//     },
//     {
//       role: "user",
//       content: ctx.prompt,
//     },
//   ];

//   return init;
// }
