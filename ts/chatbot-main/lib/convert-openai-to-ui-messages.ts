import type { UIMessagePart } from "ai";
import { formatISO } from "date-fns";
import type { ChatMessage, ChatTools, CustomUIDataTypes } from "./types";
import { generateUUID } from "./utils";

// OpenAI API 格式类型定义
export interface OpenAIToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface OpenAIMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  reasoning_content?: string;
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
}

export interface OpenAIChatRequest {
  model?: string;
  messages: OpenAIMessage[];
  tools?: unknown[];
  tool_choice?: string;
  stream?: boolean;
}

// 转换结果中的消息
interface ConvertedMessage {
  id: string;
  role: "system" | "user" | "assistant";
  parts: UIMessagePart<CustomUIDataTypes, ChatTools>[];
  createdAt: Date;
}

// 工具调用输出映射（tool_call_id → output content）
type ToolOutputMap = Map<string, string>;

/**
 * 将 OpenAI API 格式的 messages 数组转换为 UIMessage 格式
 */
export function convertOpenAIToUIMessages(
  openAIMessages: OpenAIMessage[]
): ChatMessage[] {
  if (!Array.isArray(openAIMessages)) {
    throw new Error("messages must be an array");
  }

  if (openAIMessages.length === 0) {
    throw new Error("messages array cannot be empty");
  }

  // 先收集 tool 消息，建立 tool_call_id → output 的映射
  const toolOutputs: ToolOutputMap = new Map();
  for (const msg of openAIMessages) {
    if (msg.role === "tool" && msg.tool_call_id && msg.content) {
      toolOutputs.set(msg.tool_call_id, msg.content);
    }
  }

  // 转换非 tool 消息
  const convertedMessages: ConvertedMessage[] = [];
  const baseTime = Date.now();

  for (let i = 0; i < openAIMessages.length; i++) {
    const msg = openAIMessages[i];

    // 跳过 tool 角色消息（已合并到 assistant 的 tool_calls）
    if (msg.role === "tool") {
      continue;
    }

    // 验证必要字段
    if (!msg.role) {
      throw new Error(`message at index ${i} missing required field: role`);
    }

    const parts: UIMessagePart<CustomUIDataTypes, ChatTools>[] = [];
    const messageId = generateUUID();
    const createdAt = new Date(baseTime + i * 1000);

    // 处理 reasoning_content（转为 reasoning part）
    if (msg.reasoning_content?.trim()) {
      parts.push({
        type: "reasoning",
        text: msg.reasoning_content,
        state: "done",
      });
    }

    // 处理 content（转为 text part）
    if (msg.content?.trim()) {
      parts.push({
        type: "text",
        text: msg.content,
        state: "done",
      });
    }

    // 处理 tool_calls（转为 tool-* parts）
    if (msg.tool_calls && msg.tool_calls.length > 0) {
      for (const toolCall of msg.tool_calls) {
        const toolName = toolCall.function.name;
        const toolCallId = toolCall.id;

        // 解析 arguments JSON
        let input: Record<string, unknown>;
        try {
          input = JSON.parse(toolCall.function.arguments);
        } catch {
          input = { raw: toolCall.function.arguments };
        }

        // 获取对应的 output
        const outputContent = toolOutputs.get(toolCallId);
        let output: Record<string, unknown> | undefined;
        if (outputContent) {
          try {
            output = JSON.parse(outputContent);
          } catch {
            output = { raw: outputContent };
          }
        }

        // 创建 tool part - 使用宽松类型以支持动态工具名称
        parts.push({
          type: `tool-${toolName}`,
          toolCallId,
          state: output ? "output-available" : "input-available",
          input,
          output,
        } as unknown as UIMessagePart<CustomUIDataTypes, ChatTools>);
      }
    }

    // 确保至少有一个 part
    if (parts.length === 0) {
      // content 为 null 但有 tool_calls 的情况，不添加空 text
      if (msg.role === "assistant" && msg.tool_calls) {
        // 已处理 tool_calls，跳过
      } else {
        // 其他情况添加空 text part
        parts.push({
          type: "text",
          text: "",
          state: "done",
        });
      }
    }

    convertedMessages.push({
      id: messageId,
      role: msg.role as "system" | "user" | "assistant",
      parts,
      createdAt,
    });
  }

  // 转换为 ChatMessage 格式
  return convertedMessages.map((msg) => ({
    id: msg.id,
    role: msg.role,
    parts: msg.parts,
    metadata: {
      createdAt: formatISO(msg.createdAt),
    },
  }));
}

/**
 * 从首条 user 消息提取标题
 */
export function extractTitleFromMessages(messages: OpenAIMessage[]): string {
  const firstUserMessage = messages.find(
    (msg) => msg.role === "user" && msg.content && msg.content.trim()
  );

  if (!firstUserMessage || !firstUserMessage.content) {
    return "Imported Chat";
  }

  // 截取前 50 个字符作为标题
  const title = firstUserMessage.content.trim();
  if (title.length <= 50) {
    return title;
  }
  return `${title.slice(0, 50)}...`;
}
