"use server";

import { generateText, type UIMessage } from "ai";
import { cookies } from "next/headers";
import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import type { VisibilityType } from "@/components/chat/visibility-selector";
import { titleModel } from "@/lib/ai/models";
import { titlePrompt } from "@/lib/ai/prompts";
import { getTitleModel } from "@/lib/ai/providers";
import {
  convertOpenAIToUIMessages,
  extractTitleFromMessages,
  type OpenAIMessage,
} from "@/lib/convert-openai-to-ui-messages";
import {
  deleteMessagesByChatIdAfterTimestamp,
  getChatById,
  getMessageById,
  saveChat,
  saveMessages,
  updateChatVisibilityById,
} from "@/lib/db/queries";
import { generateUUID, getTextFromMessage } from "@/lib/utils";

export async function saveChatModelAsCookie(model: string) {
  const cookieStore = await cookies();
  cookieStore.set("chat-model", model);
}

export async function generateTitleFromUserMessage({
  message,
}: {
  message: UIMessage;
}) {
  const { text } = await generateText({
    model: getTitleModel(),
    system: titlePrompt,
    prompt: getTextFromMessage(message),
    providerOptions: {
      gateway: { order: titleModel.gatewayOrder },
    },
  });
  return text
    .replace(/^[#*"\s]+/, "")
    .replace(/["]+$/, "")
    .trim();
}

export async function deleteTrailingMessages({ id }: { id: string }) {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  const [message] = await getMessageById({ id });
  if (!message) {
    throw new Error("Message not found");
  }

  const chat = await getChatById({ id: message.chatId });
  if (!chat || chat.userId !== session.user.id) {
    throw new Error("Unauthorized");
  }

  await deleteMessagesByChatIdAfterTimestamp({
    chatId: message.chatId,
    timestamp: message.createdAt,
  });
}

export async function updateChatVisibility({
  chatId,
  visibility,
}: {
  chatId: string;
  visibility: VisibilityType;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  const chat = await getChatById({ id: chatId });
  if (!chat || chat.userId !== session.user.id) {
    throw new Error("Unauthorized");
  }

  await updateChatVisibilityById({ chatId, visibility });
}

// Zod schema for OpenAI API format validation
const openAIMessageSchema = z.object({
  role: z.enum(["system", "user", "assistant", "tool"]),
  content: z.string().nullable(),
  reasoning_content: z.string().optional(),
  tool_calls: z
    .array(
      z.object({
        id: z.string(),
        type: z.literal("function"),
        function: z.object({
          name: z.string(),
          arguments: z.string(),
        }),
      })
    )
    .optional(),
  tool_call_id: z.string().optional(),
});

const openAIChatRequestSchema = z.object({
  model: z.string().optional(),
  messages: z
    .array(openAIMessageSchema)
    .min(1, "messages array must have at least one message"),
  tools: z.array(z.unknown()).optional(),
  tool_choice: z.string().optional(),
  stream: z.boolean().optional(),
});

export async function importChatFromJSON({
  jsonString,
}: {
  jsonString: string;
}): Promise<{ chatId: string; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) {
    return { chatId: "", error: "Unauthorized" };
  }

  // Parse JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonString);
  } catch {
    return { chatId: "", error: "Invalid JSON format" };
  }

  // Validate with Zod
  const validationResult = openAIChatRequestSchema.safeParse(parsed);
  if (!validationResult.success) {
    const errorMessage =
      validationResult.error.errors[0]?.message || "Invalid JSON structure";
    return { chatId: "", error: errorMessage };
  }

  const { messages } = validationResult.data;

  // Convert OpenAI messages to UIMessage format
  try {
    const uiMessages = convertOpenAIToUIMessages(messages as OpenAIMessage[]);
    const title = extractTitleFromMessages(messages as OpenAIMessage[]);
    const chatId = generateUUID();

    // Save chat
    await saveChat({
      id: chatId,
      userId: session.user.id,
      title,
      visibility: "private",
    });

    // Save messages
    await saveMessages({
      messages: uiMessages.map((msg) => ({
        id: msg.id,
        chatId,
        role: msg.role,
        parts: msg.parts,
        attachments: [],
        createdAt: new Date(msg.metadata?.createdAt ?? Date.now()),
      })),
    });

    return { chatId };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to convert messages";
    return { chatId: "", error: message };
  }
}
