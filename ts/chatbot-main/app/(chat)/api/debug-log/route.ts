import { getAgentContext } from "@/lib/agent";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const chatId = searchParams.get("chatId");

  if (!chatId) {
    return Response.json({ error: "chatId required" }, { status: 400 });
  }

  const cachePath = join("/tmp", `${chatId}.json`);

  const ctx = getAgentContext(chatId);
  if (!ctx) {
    // 先尝试读取缓存
    if (existsSync(cachePath)) {
      try {
        const cached = JSON.parse(readFileSync(cachePath, "utf-8"));
        return Response.json(cached);
      } catch {
        // 缓存读取失败，继续正常流程
      }
    }
    return Response.json({ error: "context not found" }, { status: 404 });
  }

  const workspace = ctx.workspace.debugLog();
  const facts = ctx.facts.debugLog();
  const result = { facts, workspace };

  // 写入缓存
  writeFileSync(cachePath, JSON.stringify(result, null, 2));

  return Response.json(result);
}
