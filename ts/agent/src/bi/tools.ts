import '../lib/env'
import { tool, createSdkMcpServer , query} from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

// Define a tool: name, description, input schema, handler
const getTemperature = tool(
  "get_temperature",
  "Get the current temperature at a location",
  {
    latitude: z.number().describe("Latitude coordinate"), // .describe() adds a field description Claude sees
    longitude: z.number().describe("Longitude coordinate")
  },
  async (args) => {
    // args is typed from the schema: { latitude: number; longitude: number }
    const response = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${args.latitude}&longitude=${args.longitude}&current=temperature_2m&temperature_unit=fahrenheit`
    );
    const data: any = await response.json();

    // Return a content array - Claude sees this as the tool result
    return {
      content: [{ type: "text", text: `Temperature: ${data.current.temperature_2m}°F` }]
    };
  }
);

// Wrap the tool in an in-process MCP server
const weatherServer = createSdkMcpServer({
  name: "weather",
  version: "1.0.0",
  tools: [getTemperature]
});


for await (const message of query({
  prompt: "What's the temperature in San Francisco?",
  options: {
    systemPrompt: "你是天气助手，可以回答关于天气的问题。",
    mcpServers: { weather: weatherServer },
    allowedTools: ["mcp__weather__get_temperature"],

    strictMcpConfig: true,        // 忽略 .mcp.json / 插件 MCP，只用你传的
    tools: [],                    // 关掉所有内置工具
    skills: [],                   // 关掉 skills
    settingSources: [],           // 不加载 CLAUDE.md 等项目配置

  }
})) {
  // "result" is the final message after all tool calls complete
  if (message.type === "result" && message.subtype === "success") {
    console.log(message.result);
  }
}
