---
title: feat: Add JSON Import for Chat History
type: feat
status: completed
date: 2026-04-26
origin: docs/brainstorms/2026-04-26-import-json-chat-requirements.md
---

# feat: Add JSON Import for Chat History

## Overview

为现有 chat 应用添加 JSON 导入功能，允许用户上传或粘贴 OpenAI API 格式的对话数据，转换为 UIMessage 格式后保存到数据库，支持继续对话。

## Problem Frame

用户需要导入拦截到的 OpenAI API 通信 JSON 数据（调试/分析/复现场景），在现有 chat 应用中查看完整对话历史并继续对话。复用现有 chat/message 表和消息渲染组件，避免创建新的数据模型或路由组。

## Requirements Trace

- R1. 在 chat 页面提供"导入 JSON"按钮入口
- R2. 支持本地文件上传和粘贴 JSON 两种方式
- R3-R6. 解析 OpenAI API 格式，转换为 UIMessage 格式
- R7-R8. 保存到现有 chat/message 表，生成标题
- R9-R12. 跳转到 chat 页面显示，可继续对话
- R13-R14. 错误处理和友好提示

## Scope Boundaries

- 不支持批量导入多个 JSON 文件
- 不支持导入后编辑已有消息
- 不处理非 OpenAI API 格式（Anthropic、Google 等）
- 不创建独立的 view 路由组

## Context & Research

### Relevant Code and Patterns

- **消息类型定义**: `lib/types.ts` — ChatMessage = UIMessage<MessageMetadata, CustomUIDataTypes, ChatTools>
- **数据库操作**: `lib/db/queries.ts` — saveChat(), saveMessages(), generateUUID()
- **消息渲染**: `components/chat/message.tsx` — PreviewMessage 处理 text, reasoning, tool-* parts
- **侧边栏**: `components/chat/app-sidebar.tsx:107-119` — "New chat" 按钮模式
- **UIMessage parts 类型**: text, reasoning, tool-${name}, file

### Key Technical Decisions

- **直接转换 OpenAI → UIMessage**：跳过 ModelMessage 中间层，避免反向转换复杂性（见 origin 讨论）
- **导入按钮位置**：侧边栏 "New chat" 按钮下方，复用 SidebarMenuButton 模式
- **Server Action 实现导入逻辑**：避免新建 API 路由，复用现有数据库操作函数

### External References

- Vercel AI SDK UIMessage parts 定义：TextUIPart, ReasoningUIPart, ToolUIPart, FileUIPart
- OpenAI Chat Completions API 格式：messages 数组含 role, content, tool_calls, tool_call_id

## Open Questions

### Resolved During Planning

- **转换方向**: 直接 OpenAI Format → UIMessage，不经过 ModelMessage（用户确认）
- **数据存储**: 复用现有 chat/message 表，不新建 view 表（用户确认）
- **按钮位置**: 侧边栏，New chat 下方（研究确认模式匹配）
- **交互模式**: 导入后可继续对话，非只读（用户确认）

### Deferred to Implementation

- JSON schema 详细验证规则
- 标题生成的具体策略（首条 user 消息截取 vs 默认标题）
- tool_calls 中未知工具名称的处理方式

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification.*

### OpenAI → UIMessage 转换逻辑

```
OpenAI Message Format                    UIMessage Parts
─────────────────────────────────────────────────────────────
{ role: "system", content: "..." }  →  [{ type: "text", text: "..." }]

{ role: "user", content: "..." }    →  [{ type: "text", text: "..." }]

{ role: "assistant",
  content: "Hello",
  reasoning_content: "...",
  tool_calls: [{id, function}]
}                                    →  [
                                        { type: "text", text: "Hello" },
                                        { type: "reasoning", text: "..." },
                                        { type: "tool-getWeather",
                                          toolCallId: id,
                                          state: "output-available",
                                          input: parsed args,
                                          output: from tool message }
                                      ]

{ role: "tool",
  tool_call_id: "...",
  content: "{...}"
}                                    →  (合并到对应 tool_calls 的 output)
```

**处理顺序**：
1. 遍历 messages 数组
2. 对 assistant 带 tool_calls 的消息，先收集后续 tool 消息作为 output
3. 生成 UIMessage，将 content、reasoning_content、tool_calls 转为 parts
4. 生成唯一 ID 和 createdAt 元数据

### 用户流程

```
[侧边栏: Import JSON 按钮]
        ↓
[导入对话框]
  ├─ 文件选择 (.json)
  └─ 粘贴文本框
        ↓
[预览解析结果] ← 可选，简化版可跳过
        ↓
[Server Action: importChat]
  ├─ 验证 JSON
  ├─ 转换为 UIMessage[]
  ├─ saveChat (新 chatId)
  ├─ saveMessages
  └─ 返回 chatId
        ↓
[router.push(`/chat/${chatId}`)]
        ↓
[现有 ChatShell 渲染导入的消息]
        ↓
[用户可继续对话]
```

## Implementation Units

- [x] **Unit 1: 创建 OpenAI → UIMessage 转换函数**

**Goal:** 实现 `convertOpenAIToUIMessages()` 函数，将 OpenAI API 格式的 messages 数组转换为 UIMessage 格式。

**Requirements:** R4, R5, R6

**Dependencies:** None

**Files:**
- Create: `lib/convert-openai-to-ui-messages.ts`
- Test: `lib/__tests__/convert-openai-to-ui-messages.test.ts`

**Approach:**
- 定义 OpenAI 消息类型接口（OpenAIMessage, OpenAIToolCall）
- 实现转换逻辑：遍历 messages，处理 tool 消息合并，生成 parts 数组
- 使用 generateUUID() 生成消息 ID
- 使用 formatISO() 生成 createdAt 元数据

**Patterns to follow:**
- `lib/utils.ts:convertToUIMessages()` 的返回结构
- `lib/types.ts:ChatMessage` 类型定义

**Test scenarios:**
- Happy path: 简单 user/assistant 对话转换正确
- Happy path: system 消息转换正确
- Happy path: tool_calls + tool 消息合并转换正确
- Happy path: reasoning_content 转换为 reasoning part
- Edge case: content 为 null 的 assistant 消息（仅 tool_calls）
- Edge case: 多个 tool_calls 对应多个 tool 消息
- Error path: JSON 格式无效抛出明确错误
- Error path: 缺少必要字段提供友好提示

**Verification:**
- 转换函数导出并可被 Server Action 调用
- 单元测试覆盖所有场景

---

- [x] **Unit 2: 创建导入 Server Action**

**Goal:** 实现 `importChatFromJSON()` Server Action，处理 JSON 验证、转换、数据库保存。

**Requirements:** R7, R8, R13, R14

**Dependencies:** Unit 1

**Files:**
- Create: `app/(chat)/actions.ts` 中添加 importChatFromJSON 函数
- Modify: `app/(chat)/actions.ts`（现有文件，添加新函数）

**Approach:**
- 接收 JSON 字符串参数
- 使用 Zod schema 验证 JSON 结构
- 调用 convertOpenAIToUIMessages 转换
- 生成 chatId，调用 saveChat() 创建 chat
- 调用 saveMessages() 保存转换后的消息
- 生成标题：首条 user 消息 text 截取前 50 字符，或默认 "Imported Chat"
- 返回 { chatId, error?: string }

**Patterns to follow:**
- `app/(chat)/actions.ts:generateTitleFromUserMessage()` 的 server action 模式
- `app/(chat)/api/chat/route.ts` 的 saveChat/saveMessages 调用模式

**Test scenarios:**
- Happy path: 完整 JSON 导入成功返回 chatId
- Happy path: 标题从首条 user 消息提取
- Edge case: 无 user 消息时使用默认标题
- Error path: JSON 解析失败返回明确错误信息
- Error path: messages 数组为空返回错误
- Integration: 数据库正确保存 chat 和 messages

**Verification:**
- Server Action 可从前端组件调用
- 导入后可通过 getChatById 和 getMessagesByChatId 查询到数据

---

- [x] **Unit 3: 创建导入对话框组件**

**Goal:** 创建 `ImportJsonDialog` 组件，提供文件上传和粘贴 JSON 两种输入方式。

**Requirements:** R1, R2

**Dependencies:** Unit 2

**Files:**
- Create: `components/chat/import-json-dialog.tsx`
- Modify: `components/chat/app-sidebar.tsx`（添加打开对话框的按钮）

**Approach:**
- 使用 `Dialog` 组件作为容器
- Tab 切换：文件上传 vs 粘贴文本
- 文件上传：使用 input[type="file"] accept=".json"
- 粘贴文本：使用 TextArea 组件
- 调用 Server Action 提交
- 成功后 router.push(`/chat/${chatId}`)
- 失败时 toast.error 显示错误信息

**Patterns to follow:**
- `components/ui/dialog.tsx` 的 Dialog 模式
- `components/chat/multimodal-input.tsx` 的文件上传模式
- `components/chat/app-sidebar.tsx:53-65` 的按钮和对话框组合模式

**Test scenarios:**
- Happy path: 文件上传后成功导入并跳转
- Happy path: 粘贴 JSON 后成功导入并跳转
- Edge case: 大 JSON 文件处理不阻塞 UI
- Error path: 无效 JSON 显示 toast 错误
- Error path: Server Action 返回错误显示友好提示

**Verification:**
- 对话框可从侧边栏按钮打开
- 导入成功后跳转到正确的 chat 页面
- 错误信息清晰可见

---

- [x] **Unit 4: 添加导入按钮到侧边栏**

**Goal:** 在侧边栏 "New chat" 按钮下方添加 "Import JSON" 按钮，打开导入对话框。

**Requirements:** R1

**Dependencies:** Unit 3

**Files:**
- Modify: `components/chat/app-sidebar.tsx`

**Approach:**
- 在 SidebarMenuItem（第 119 行后）添加新按钮
- 使用 UploadIcon 或 FileJsonIcon 作为图标
- onClick 打开 ImportJsonDialog
- 状态管理：useState 控制 dialog open 状态

**Patterns to follow:**
- `components/chat/app-sidebar.tsx:107-119` 的 SidebarMenuButton 模式
- 第 120-131 行的 "Delete all" 按钮作为参考

**Test scenarios:**
- Happy path: 点击按钮打开导入对话框
- Happy path: 侧边栏折叠状态下按钮显示 tooltip
- Edge case: 移动端侧边栏关闭后对话框正常显示

**Verification:**
- 按钮在侧边栏可见且可点击
- 点击后对话框正常打开

## System-Wide Impact

- **Interaction graph**: 导入功能不影响现有 chat 流程，仅作为新入口
- **Error propagation**: Server Action 错误通过 toast 显示，不影响其他组件
- **State lifecycle**: 导入后刷新历史列表（SWR mutate）
- **API surface parity**: 不涉及 API 变更，使用 Server Action
- **Integration coverage**: 导入后跳转的 chat 页面使用现有 ChatShell，无需额外集成测试
- **Unchanged invariants**: 现有 chat/message 数据结构不变，消息渲染逻辑不变

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| 大 JSON 文件阻塞 UI | 使用 FileReader 异步读取，考虑进度提示 |
| 未知工具名称导致渲染异常 | tool parts 使用通用格式，前端 message.tsx 已处理未知类型 |
| tool_calls 与 tool 消息匹配错误 | 转换函数严格按 tool_call_id 匹配，缺失时标记 output 为空 |

## Documentation / Operational Notes

- 可在 `docs/solutions/` 记录 OpenAI → UIMessage 转换的解决方案（使用 `/ce:compound`）
- 用户文档：说明支持的 JSON 格式（OpenAI API format）

## Sources & References

- **Origin document:** [docs/brainstorms/2026-04-26-import-json-chat-requirements.md](docs/brainstorms/2026-04-26-import-json-chat-requirements.md)
- Related code: `lib/utils.ts:convertToUIMessages`, `lib/types.ts:ChatMessage`
- External docs: Vercel AI SDK UIMessagePart types