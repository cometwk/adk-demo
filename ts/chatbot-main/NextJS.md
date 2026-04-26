# Next.js App Router 关键概念

## Route Groups (路由组)

带括号的目录名 `(xxx)` 是 Next.js App Router 的 **Route Groups** 功能。

### 核心特性

1. **不参与 URL 路径** - 括号内的名称不会出现在 URL 中
2. **组织代码结构** - 按功能模块分组，便于维护
3. **共享布局** - 组内页面可共享同一个 layout.tsx
4. **分离逻辑** - 不同组可以有不同的中间件、配置或布局策略

### 本项目目录结构

```
app/
├─ (auth)/              # 认证相关页面组
│   ├─ layout.tsx       # 认证组共享布局 (简洁登录界面)
│   ├─ login/page.tsx   → URL: /login
│   ├─ register/page.tsx → URL: /register
│   └─ api/auth/
│       ├─ [...nextauth]/route.ts → URL: /api/auth/...
│       └─ guest/route.ts
│
├─ (chat)/              # 聊天相关页面组
│   ├─ layout.tsx       # 聊天组共享布局 (侧边栏、数据流)
│   ├─ page.tsx         → URL: /          (首页，新聊天)
│   ├─ chat/[id]/page.tsx → URL: /chat/:id
│   └─ api/
│       ├─ chat/route.ts
│       ├─ messages/route.ts
│       ├─ vote/route.ts
│       └─ ...
│
└─ layout.tsx           # 根布局 (全局样式)
```

### URL 映射对照

| 文件路径 | 实际 URL | 说明 |
|---|---|---|
| `app/(auth)/login/page.tsx` | `/login` | `(auth)` 不出现在 URL |
| `app/(auth)/register/page.tsx` | `/register` | 同上 |
| `app/(chat)/page.tsx` | `/` | 首页 |
| `app/(chat)/chat/[id]/page.tsx` | `/chat/abc123` | 动态路由 |

### 布局嵌套关系

```
Root Layout (app/layout.tsx)
    │
    ├─→ Auth Group (app/(auth)/layout.tsx)
    │       │
    │       ├─→ /login
    │       └─→ /register
    │
    └─→ Chat Group (app/(chat)/layout.tsx)
            │
            ├─→ /         (新聊天首页)
            └─→ /chat/:id (具体聊天)
```

两组使用完全不同的布局策略：
- **(auth) 组**: 简洁的登录/注册界面，无侧边栏
- **(chat) 组**: 完整聊天界面，包含侧边栏、消息流、Artifact 面板

---

## Auth 认证机制

### 本项目现状：Mock 认证

当前项目已 **屏蔽真实认证**，使用 Mock User 模式。核心实现在 `app/(auth)/auth.ts`:

```typescript
// app/(auth)/auth.ts

// 模拟 session，屏蔽认证检查
const MOCK_USER_ID = "mock-user-001";

export async function auth() {
  return {
    user: {
      id: MOCK_USER_ID,
      email: "mock@example.com",
      type: "regular" as UserType,
      name: "Mock User",
    },
    expires: "2099-12-31T00:00:00.000Z",
  } as any;
}

// Mock signIn/signOut - 直接返回成功
export async function signIn(_provider?: string, _options?: any) {
  return { status: "success" };
}

export async function signOut(_options?: any) {
  return { status: "success" };
}
```

### 认证流程（原始设计）

原始项目使用 **NextAuth.js** 进行认证，流程如下：

```
┌─────────────────────────────────────────────────────────────┐
│                        登录流程                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. 用户访问 /login                                          │
│     └─→ (auth)/login/page.tsx 渲染登录表单                   │
│                                                             │
│  2. 提交表单 → Server Action                                │
│     └─→ (auth)/actions.ts → login()                         │
│         └─→ signIn("credentials", { email, password })      │
│                                                             │
│  3. NextAuth 验证                                            │
│     └─→ /api/auth/[...nextauth] 路由处理                     │
│         └─→ 验证 credentials                                 │
│         └─→ 创建 JWT session                                 │
│                                                             │
│  4. Session 存储                                             │
│     └─→ JWT 存储在 cookie (next-auth.session-token)         │
│                                                             │
│  5. 页面跳转                                                 │
│     └─→ router.refresh() → 跳转到首页 /                      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 关键文件

| 文件 | 作用 |
|---|---|
| `app/(auth)/auth.ts` | NextAuth 配置 + **Mock 实现**（已替换真实认证） |
| `app/(auth)/auth.config.ts` | NextAuth 基础配置（basePath、signIn 页面） |
| `app/(auth)/actions.ts` | Server Actions：login、register |
| `app/(auth)/api/auth/[...nextauth]/route.ts` | NextAuth API 路由入口 |
| `app/(auth)/layout.tsx` | 认证页面布局 |
| `app/(auth)/login/page.tsx` | 登录页面 |
| `app/(auth)/register/page.tsx` | 注册页面 |

### API 路由认证检查

各个 API 路由通过调用 `auth()` 获取当前用户：

```typescript
// app/(chat)/api/chat/route.ts
import { auth } from "@/app/(auth)/auth";

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  // 使用 session.user.id 进行后续操作
  const userId = session.user.id;
  ...
}
```

由于 `auth()` 返回 Mock User，所有请求都会被视为已认证的 `mock-user-001` 用户。

### 数据库初始化

`lib/db/queries.ts` 在初始化时会创建 Mock User：

```typescript
export async function initDatabase() {
  // 创建表...

  // 确保 mock 用户存在
  const MOCK_USER_ID = "mock-user-001";
  const existingUser = sqlite.prepare("SELECT id FROM User WHERE id = ?").get(MOCK_USER_ID);

  if (!existingUser) {
    sqlite.prepare(`
      INSERT INTO User (id, email, password, name, ...)
      VALUES (?, ?, ?, ?, ...)
    `).run(MOCK_USER_ID, "mock@example.com", ...);
  }
}
```

---

## Vercel AI SDK 消息类型

在 AI SDK v5/v6/v7 中，有两种核心消息类型：**UIMessage** (ChatMessage) 和 **ModelMessage**。

### 类型定义对比

#### UIMessage (ChatMessage)

用于 **前端 UI 状态管理**，是 `useChat` hook 使用的消息格式：

```typescript
interface UIMessage<
  METADATA = unknown,
  DATA_PARTS extends UIDataTypes = UIDataTypes,
  TOOLS extends UITools = UITools,
> {
  id: string;                              // 唯一标识
  role: 'system' | 'user' | 'assistant';   // 角色
  metadata?: METADATA;                     // 自定义元数据
  parts: Array<UIMessagePart<...>>;        // 消息部件数组
}
```

**特点：**
- 使用 `parts` 数组存储内容，而非 `content` 字符串
- 包含 UI 特定元数据（如 createdAt、自定义数据类型）
- 支持工具审批状态 (approval-responded, output-denied)
- 是应用状态的完整表示

#### ModelMessage

用于 **AI 模型调用**，是 `streamText`、`generateText` 等函数使用的格式：

```typescript
// 系统消息
type SystemModelMessage = {
  role: 'system';
  content: string;
};

// 用户消息
type UserModelMessage = {
  role: 'user';
  content: string | Array<TextPart | ImagePart | FilePart>;
};

// 助手消息
type AssistantModelMessage = {
  role: 'assistant';
  content: string | Array<TextPart | CustomPart | ToolCallPart>;
};

// 工具结果消息
type ToolModelMessage = {
  role: 'tool';
  content: Array<ToolResultPart>;
};
```

**特点：**
- 使用 `content` 字段，可以是字符串或部件数组
- 只包含模型需要的信息，无 UI 特定数据
- `tool` 角色用于工具结果（UIMessage 中工具结果嵌入在 assistant 的 parts 中）

### 核心差异总结

| 特性 | UIMessage (ChatMessage) | ModelMessage |
|---|---|---|
| 用途 | 前端 UI 状态、useChat | 后端 AI 模型调用 |
| 内容字段 | `parts: Array` | `content: string | Array` |
| 角色类型 | system, user, assistant | system, user, assistant, tool |
| 元数据 | 支持 `metadata`、自定义数据类型 | 不支持 |
| 工具调用 | 嵌入在 assistant.parts 中 | 单独 ToolCallPart + ToolModelMessage |
| ID 字段 | 必须有 | 不需要 |

### 本项目中的定义

```typescript
// lib/types.ts
import type { UIMessage } from "ai";

// ChatMessage 是 UIMessage 的自定义类型
export type ChatMessage = UIMessage<
  MessageMetadata,      // 自定义元数据：createdAt
  CustomUIDataTypes,    // 自定义数据类型：textDelta, id, title...
  ChatTools             // 工具类型定义
>;
```

### 相互转换

#### 1. UIMessage → ModelMessage

使用 `convertToModelMessages()` 函数：

```typescript
import { convertToModelMessages, streamText } from "ai";
import type { UIMessage } from "ai";

// 前端传入的 UIMessages
const uiMessages: UIMessage[] = [...];

// 转换为 ModelMessages 用于模型调用
const modelMessages = await convertToModelMessages(uiMessages);

const result = streamText({
  model: openai("gpt-4"),
  messages: modelMessages,
});
```

**转换逻辑：**
- 提取 `parts` 中的有效内容转为 `content`
- 将 assistant 的 tool-call parts 转为 ToolCallPart
- 生成对应的 ToolModelMessage 存放工具结果
- 丢弃 UI 特定元数据

#### 2. DBMessage → UIMessage (ChatMessage)

本项目自定义转换函数 `convertToUIMessages()`：

```typescript
// lib/utils.ts
export function convertToUIMessages(messages: DBMessage[]): ChatMessage[] {
  return messages.map((message) => ({
    id: message.id,
    role: message.role as 'user' | 'assistant' | 'system',
    parts: message.parts as UIMessagePart<CustomUIDataTypes, ChatTools>[],
    metadata: {
      createdAt: formatISO(message.createdAt),
    },
  }));
}
```

#### 3. ModelMessage 输出 → UIMessage 流式返回

使用 `toUIMessageStream()`：

```typescript
// app/(chat)/api/chat/route.ts
const result = streamText({
  model: getLanguageModel(chatModel),
  messages: modelMessages,
  tools: { getWeather, createDocument, ... },
});

// 将 ModelMessage 输出转换为 UIMessage 流
dataStream.merge(
  result.toUIMessageStream({ sendReasoning: isReasoningModel })
);
```

### 数据流向图

```
┌─────────────────────────────────────────────────────────────┐
│                        前端 (Client)                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  useChat() 状态: UIMessage[] (ChatMessage[])                │
│                                                             │
│  发送请求: POST /api/chat                                   │
│  Body: { id, message: UIMessage, ... }                      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────┐
│                        后端 (Server)                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. 接收 UIMessage                                          │
│                                                             │
│  2. convertToModelMessages(UIMessage[])                     │
│     └─→ 转为 ModelMessage[]                                  │
│                                                             │
│  3. streamText({ messages: ModelMessage[] })                │
│                                                             │
│  4. result.toUIMessageStream()                              │
│     └─→ 输出转回 UIMessage 格式                              │
│                                                             │
│  5. createUIMessageStreamResponse()                         │
│     └─→ SSE 流式返回给前端                                   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────┐
│                        数据库 (SQLite)                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  DBMessage 存储格式:                                         │
│  { id, chatId, role, parts, createdAt }                     │
│                                                             │
│  加载时: convertToUIMessages(DBMessage[])                    │
│  └─→ 转为前端使用的 ChatMessage[]                            │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 关键转换函数

| 函数 | 来源 | 目标 | 使用场景 |
|---|---|---|---|
| `convertToModelMessages()` | `UIMessage[]` | `ModelMessage[]` | 后端调用 AI 模型前 |
| `convertToUIMessages()` | `DBMessage[]` | `ChatMessage[]` | 加载历史消息 |
| `toUIMessageStream()` | Model 输出 | `UIMessage` 流 | 流式返回前端 |

---

## 总结

| 功能 | 实现 |
|---|---|
| 路由组织 | Route Groups `(auth)` / `(chat)` |
| 认证框架 | NextAuth.js (已 Mock) |
| 认证状态 | `auth()` 函数返回 Mock User |
| 数据库 | SQLite + Drizzle ORM |
| Session | JWT Cookie (Mock 模式下无效) |
| 前端消息类型 | `ChatMessage` (基于 `UIMessage`) |
| 后端消息类型 | `ModelMessage` |
| 消息转换 | `convertToModelMessages()` / `convertToUIMessages()`