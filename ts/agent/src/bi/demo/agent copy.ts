// import '../lib/env'
// import { createSdkMcpServer, query } from '@anthropic-ai/claude-agent-sdk'
// import { discover_entities, execute_query } from './tools'
// import { ExecuteQueryInputSchema } from './types'

// function toMcpTool(
//   name: string,
//   aiTool: { description?: string; execute?: (input: any, options: any) => unknown },
//   inputSchema: Record<string, unknown>,
// ) {
//   return {
//     name,
//     description: aiTool.description ?? '',
//     inputSchema,
//     handler: async (args: any, _extra: unknown) => ({
//       content: [
//         {
//           type: 'text' as const,
//           text: JSON.stringify(await aiTool.execute!(args, { toolCallId: name, messages: [] }), null, 2),
//         },
//       ],
//     }),
//   }
// }

// // Wrap the tool in an in-process MCP server
// const biServer = createSdkMcpServer({
//   name: 'bi',
//   version: '1.0.0',
//   tools: [
//     toMcpTool('discover_entities', discover_entities, {}),
//     toMcpTool('execute_query', execute_query, ExecuteQueryInputSchema.shape),
//   ],
// })

// // Workflow:
// // 1. discover_entities
// // 2. inspect entity metadata
// // 3. construct execute_query
// // 4. never invent measures/dimensions
// // 5. ask clarification if multiple entities match

// for await (const message of query({
//   // prompt: "订单数最多的商户是哪个？",
//   prompt: '检索entity',
//   options: {
//     systemPrompt: `你是BI助手，可以回答关于BI的问题。

//     `,
//     mcpServers: { bi: biServer },
//     allowedTools: ['mcp__bi__discover_entities', 'mcp__bi__execute_query'],

//     strictMcpConfig: true, // 忽略 .mcp.json / 插件 MCP，只用你传的
//     tools: [], // 关掉所有内置工具
//     skills: [], // 关掉 skills
//     settingSources: [], // 不加载 CLAUDE.md 等项目配置
//   },
// })) {
//   // "result" is the final message after all tool calls complete
//   if (message.type === 'result' && message.subtype === 'success') {
//     console.log(message.result)
//   }
// }
