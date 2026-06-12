/**
 * Sessions API — 会话列表 + 保存
 */
import { NextRequest } from "next/server"
import { listSessions, saveSession, loadSession, loadSessionByIndex } from "@/lib/engine/session"

/** GET /api/sessions — 列出所有会话 */
export async function GET(req: NextRequest) {
  const cwd = req.nextUrl.searchParams.get("cwd") || process.cwd()
  const sessions = await listSessions(cwd)
  return Response.json(sessions)
}

/** POST /api/sessions — 保存或加载会话 */
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { action, cwd: rawCwd, sessionId, messages, idx } = body
  const cwd = rawCwd || process.cwd()

  if (action === "save") {
    const session = await saveSession(cwd, messages, sessionId)
    if (!session) return Response.json({ error: "Failed to save session" }, { status: 500 })
    return Response.json({ id: session.metadata.id, systemPrompt: session.systemPrompt })
  }

  if (action === "load") {
    const session =
      idx !== undefined ? await loadSessionByIndex(cwd, idx) : await loadSession(cwd, sessionId)
    if (!session) return Response.json({ error: "Session not found" }, { status: 404 })
    return Response.json(session)
  }

  return Response.json({ error: "Invalid action" }, { status: 400 })
}
