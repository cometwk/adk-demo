import { getAgentContext } from "@/lib/agent";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const chatId = searchParams.get("chatId");

  if (!chatId) {
    return Response.json({ error: "chatId required" }, { status: 400 });
  }

  const ctx = getAgentContext(chatId);
  if (!ctx) {
    return Response.json({ error: "context not found" }, { status: 404 });
  }

  const debugLog = ctx.workspace.debugLog();
  return Response.json(debugLog);
}