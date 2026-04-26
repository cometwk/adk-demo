# Next.js Chatbot 架构说明

## 整体架构概览

```
┌─────────────────────────────────────────────────────────────┐
│                        前端 (Client)                         │
├─────────────────────────────────────────────────────────────┤
│  app/(chat)/layout.tsx                                      │
│  ├─ DataStreamProvider (全局数据流状态)                       │
│  ├─ ActiveChatProvider (聊天状态管理)                         │
│  └─ ChatShell (聊天界面容器)                                  │
│     ├─ Messages (消息列表)                                   │
│     ├─ MultimodalInput (输入框)                              │
│     └─ Artifact (右侧文档面板)                                │
└─────────────────────────────────────────────────────────────┘
          │
          │ HTTP/SSE 流式请求
          ▼
┌─────────────────────────────────────────────────────────────┐
│                        后端 (Server)                         │
├─────────────────────────────────────────────────────────────┤
│  app/(chat)/api/                                            │
│  ├─ chat/route.ts (POST: 聊天流式响应)                        │
│  ├─ messages/route.ts (GET: 加载历史消息)                    │
│  └─ vote/route.ts (投票功能)                                 │
└─────────────────────────────────────────────────────────────┘
          │
          │ Drizzle ORM
          ▼
┌─────────────────────────────────────────────────────────────┐
│                        数据层 (Database)                      │
│  SQLite + better-sqlite3                                   │
└─────────────────────────────────────────────────────────────┘
```

## 详细流程

### 1. 页面加载阶段

**前端路由解析：**

- 用户访问 `/chat/[id]` 时，`app/(chat)/chat/[id]/page.tsx` 返回 null（页面是空壳）
- 实际渲染由 `layout.tsx` 中的 `ChatShell` 组件完成
- `use-active-chat.tsx` 中的 `extractChatId()` 从 URL pathname 提取 chatId

**加载历史消息：**

```typescript
// use-active-chat.tsx:85-91
const { data: chatData, isLoading } = useSWR(
  isNewChat ? null : `/api/messages?chatId=${chatId}`,
  fetcher
);
```

- 前端通过 SWR 发送 GET 请求到 `/api/messages?chatId=${chatId}`
- 后端 `api/messages/route.ts` 执行：
  1. 验证用户身份 (`auth()`)
  2. 查询 Chat 和 Messages (`getChatById`, `getMessagesByChatId`)
  3. 权限检查（私有聊天只有 owner 可访问）
  4. 返回 `{ messages, visibility, isReadonly }`

### 2. 发送消息阶段

**前端发起请求：**

```typescript
// use-active-chat.tsx:109-172
const { sendMessage, ... } = useChat({
  transport: new DefaultChatTransport({
    api: "/api/chat",
    prepareSendMessagesRequest(request) {
      return {
        body: {
          id: request.id,
          message: lastMessage,
          selectedChatModel: currentModelId,
          selectedVisibilityType: visibility,
        },
      };
    },
  }),
});
```

- 使用 Vercel AI SDK 的 `useChat` hook
- 发送 POST 到 `/api/chat`，携带 chatId、消息内容、模型选择等

**后端处理流程 (`api/chat/route.ts`)：**

```typescript
// 1. 解析请求并验证
const requestBody = postRequestBodySchema.parse(json);
const session = await auth();

// 2. 检查权限和速率限制
await checkIpRateLimit(ipAddress(request));
const messageCount = await getMessageCountByUserId({ id, differenceInHours: 1 });

// 3. 新聊天则创建 Chat 记录
if (!chat && message?.role === "user") {
  await saveChat({ id, userId, title: "New chat", visibility });
  titlePromise = generateTitleFromUserMessage({ message });
}

// 4. 保存用户消息
await saveMessages({ messages: [{ chatId: id, id: message.id, ... }] });

// 5. 创建流式响应
const stream = createUIMessageStream({
  execute: async ({ writer: dataStream }) => {
    const result = streamText({
      model: getLanguageModel(chatModel),
      system: systemPrompt({ requestHints, supportsTools }),
      messages: modelMessages,
      tools: { getWeather, createDocument, editDocument, ... },
    });
    dataStream.merge(result.toUIMessageStream());
  },
  onFinish: async ({ messages }) => {
    await saveMessages({ messages: finishedMessages.map(...) });
  },
});

return createUIMessageStreamResponse({ stream });
```

### 3. 流式数据处理

**前端接收流：**

- `DataStreamHandler` 组件监听 `dataStream` 变化
- 处理特殊数据类型：
  - `data-chat-title`: 更新侧边栏历史列表
  - `data-id`, `data-title`, `data-kind`: 更新 Artifact 文档面板状态

**工具调用：**

- 支持的工具：`getWeather`, `createDocument`, `editDocument`, `updateDocument`, `requestSuggestions`
- 工具响应通过 `dataStream.write()` 实时推送到前端

### 4. 数据持久化

**数据库结构：**

```sql
Chat (id, userId, title, visibility, createdAt)
Message_v2 (id, chatId, role, parts, attachments, createdAt)
Vote_v2 (chatId, messageId, isUpvoted)
Document (id, title, kind, content, userId, createdAt)
Stream (id, chatId) - 用于恢复中断的流
```

## 关键技术栈

| 层 | 技术 |
|---|---|
| 前端状态管理 | React Context + SWR |
| AI SDK | `@ai-sdk/react` (useChat) + `ai` (streamText) |
| 流式通信 | SSE (Server-Sent Events) |
| 数据库 ORM | Drizzle ORM + better-sqlite3 |
| 认证 | NextAuth (已屏蔽，使用 mock user) |

## 核心文件路径

| 文件 | 作用 |
|---|---|
| `app/(chat)/layout.tsx` | 聊天布局，包含 DataStreamProvider 和 ActiveChatProvider |
| `app/(chat)/chat/[id]/page.tsx` | 聊天页面路由（空壳，实际内容由 layout 渲染） |
| `hooks/use-active-chat.tsx` | 聊天状态管理核心 hook，使用 useChat |
| `components/chat/shell.tsx` | 聊天界面容器组件 |
| `components/chat/data-stream-handler.tsx` | 处理流式数据更新 |
| `app/(chat)/api/chat/route.ts` | 聊天 API 端点，处理 POST 请求返回流式响应 |
| `app/(chat)/api/messages/route.ts` | 加载历史消息 API |
| `lib/db/queries.ts` | 数据库查询函数 |