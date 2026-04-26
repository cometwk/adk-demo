---
date: 2026-04-26
topic: import-json-chat
---

# JSON 导入聊天功能

## Problem Frame
用户希望能够导入拦截到的 OpenAI API 通信 JSON 数据，在现有 chat 应用中查看完整的对话历史，并能够继续对话。这对于调试、分析和复现 AI 对话场景非常有价值。

## Requirements

**导入入口**
- R1. 在 chat 页面提供"导入 JSON"按钮入口
- R2. 支持两种导入方式：本地文件上传（文件选择器）和粘贴 JSON 内容（文本输入框）

**JSON 格式处理**
- R3. 输入 JSON 格式为 OpenAI API 请求格式，包含 `model`、`messages`、`tools`、`tool_choice`、`stream` 等字段
- R4. 将 OpenAI `ModelMessage` 格式转换为 Vercel AI SDK `UIMessage` 格式（包含 parts 结构）
- R5. 支持 `system`、`user`、`assistant`、`tool` 角色的消息转换
- R6. 支持 `tool_calls`、`reasoning_content` 等扩展字段的转换处理

**数据存储**
- R7. 转换后的 UIMessage 数据保存到现有 `chat` 和 `message` 表
- R8. 导入后生成新的 chatId，自动生成标题（基于首条用户消息或默认标题）

**交互与展示**
- R9. 导入完成后跳转到对应 chat 页面，显示完整的对话历史
- R10. 复用现有 `Messages` 和 `PreviewMessage` 组件展示对话内容
- R11. 侧边栏历史记录列表包含导入创建的 chat，可切换查看
- R12. 导入的 chat 可继续对话（非只读模式）

**错误处理**
- R13. JSON 格式无效时显示明确的错误提示
- R14. JSON 内容缺失必要字段时提供友好提示

## Success Criteria
- 用户能够成功导入 OpenAI API 格式的 JSON 文件或粘贴内容
- 导入后的对话历史完整显示，包括工具调用结果、reasoning 等
- 导入的 chat 出现在侧边栏历史记录中，可正常切换
- 用户能在导入的 chat 基础上继续对话

## Scope Boundaries
- 不支持批量导入多个 JSON 文件
- 不支持导入后编辑已有消息内容（遵循现有 chat 行为）
- 不处理非 OpenAI API 格式的 JSON（如 Anthropic、Google 等格式）

## Key Decisions
- **复用 chat 表结构**：避免创建新表，简化架构，与现有 chat 功能无缝衔接
- **共用 chat 路由**：不创建独立的 view 路由组，导入功能作为 chat 的扩展入口

## Dependencies / Assumptions
- 依赖现有 chat 数据库表结构（`chat`、`message` 表）
- 依赖现有 `convertToUIMessages` 函数进行消息格式转换
- 前端需要实现 `ModelMessage → UIMessage` 的转换逻辑

## Outstanding Questions

### Deferred to Planning
- [Affects R4][Technical] OpenAI `ModelMessage` → Vercel AI SDK `UIMessage` 的具体转换逻辑实现细节
- [Affects R5][Needs research] `tool_calls` 数组转换为 `tool-*` parts 的具体映射规则
- [Affects R6][Needs research] `reasoning_content` 字段转换为 `reasoning` part 的处理方式
- [Affects R1][UX] 导入按钮的具体位置和样式设计

## Next Steps
→ /ce:plan for structured implementation planning