---
name: fetch-zh
description: Translate a webpage into Chinese Markdown and save locally.
tools:
  - agent-browser
  - write_file
---

# Translate Webpage To Chinese

## Description

输入一个网页 URL。

自动完成以下流程：

1. 使用 agent-browser 打开网页
2. 获取网页主要内容（HTML 或可读正文）
3. 翻译为简体中文
4. 转换为 Markdown
5. 保存到当前工作目录

输出文件名格式：

```text
yyyymmdd-<timestamp_seconds>-{2到3个英文单词的摘要}.md
```

例如：

```text
20260606-1749182736-agent-tools.md
```

---

## When To Use

当用户提出以下需求时使用本 Skill：

* 翻译网页
* 将英文博客翻译成中文
* 保存网页为中文 Markdown
* 阅读并归档网页内容
* URL → 中文 Markdown

示例：

```text
翻译这个网页：
https://example.com/article
```

```text
把这篇博客保存成中文 markdown
```

---

## Input

用户必须提供：

```text
URL
```

例如：

```text
https://example.com/article
```

---

## Workflow

### Step 1: Open Page

使用 agent-browser 打开网页：

```bash
agent-browser open <url>
```

等待页面完全加载。

---

### Step 2: Extract Content

优先获取：

* article
* main
* markdown body
* 阅读模式正文

**图片处理**：提取页面中所有正文图片的 URL，包括 `<img>` 标签的 `src` 属性和 CSS 背景图。图片是文章内容的重要组成部分，丢失图片会严重降低翻译质量。在提取时，使用 WebFetch 的 prompt 中明确要求保留所有图片引用：

```text
Extract the full article content. IMPORTANT: Preserve ALL image URLs — include every
img tag or image reference as markdown image syntax ![alt](url).
```

避免提取：

* 导航栏
* Footer
* 广告
* 评论区
* 推荐阅读

目标：

```text
获得文章正文（含图片链接）
```

如果网页不是文章页面，则提取主要可读内容。

---

### Step 3: Convert To Markdown

将正文转换为 Markdown：

保留：

* 标题
* 段落
* 列表
* 表格
* 代码块
* 引用
* **图片**：以 Markdown 图片语法 `![描述](图片URL)` 保留，图片应插入到原文中对应的位置。图片的 alt 文本翻译为中文，URL 保持原样不修改。

删除：

* 广告
* 导航菜单
* Cookie Banner
* 无关页面元素

---

### Step 4: Translate

翻译为简体中文。

要求：

* 保持原文结构
* 保留 Markdown 格式
* 保留代码块原文
* 保留链接 URL
* 保留图片 URL——图片必须以 `![中文描述](原始URL)` 格式保留在翻译后的 Markdown 中，且位于原文对应位置，不可省略或移至文末
* 技术术语优先采用通用中文译法
* 人名、库名、项目名保持原文

代码块禁止翻译：

````markdown
```go
fmt.Println("hello")
```
````

应原样保留。

---

### Step 5: Generate Filename

生成文件名：

```text
<yyyymmdd>-<unix_seconds>-<2 or 3 words digest>.md
```

示例：

```text
20260606-1749182736-agent-tools.md
```

---

### Step 6: Save File

在 Markdown 文件顶部，添加原文来源链接：

```markdown
> 原文链接：https://example.com/article
```

然后保存到当前工作目录：

```text
./<filename>.md
```

例如：

```text
./20260606-1749182736-agent-tools.md
```

---

## Output

完成后返回：

```text
✅ Translation completed

Source:
https://example.com/article

Output:
./20260606-1749182736-agent-tools.md
```

---

## Error Handling

### Page Load Failed

返回：

```text
Failed to open URL
```

### Content Not Found

尝试：

1. snapshot
2. reread page
3. extract body

若仍失败：

```text
Unable to extract readable content
```

### Translation Failed

保留原始 Markdown 并保存：

```text
Translation failed, original content saved
```

---

## Rules

必须：

* 保留 Markdown 结构
* 保留代码块
* 保留链接
* 保留表格
* 保留图片链接（`![描述](URL)` 格式，位于原文对应位置）
* 在文件顶部记录原文链接（`> 原文链接：<URL>`）

禁止：

* 总结替代全文翻译
* 删除技术内容
* 修改代码
* 编造缺失内容

目标：

```text
URL
→ Web Content
→ Chinese Markdown
→ Local File
```
