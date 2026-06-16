---
name: fetch-zh
description: Fetch a webpage, translate it to Simplified Chinese Markdown, and save it locally.
tools:
  - agent-browser
  - write_file
---

# Translate Webpage To Chinese

## Description

输入一个网页 URL。

自动完成以下流程：

1. 使用 agent-browser skill 打开网页
2. 获取网页主要内容（HTML 或可读正文）
3. 翻译为简体中文
4. 转换为 Markdown
5. 保存到当前工作目录

输出文件名：

```text
yyyymmdd-<unix_seconds>-<2-3-word-summary>.md
```

例如：

```text
20260606-1749182736-agent-tools.md
```

Tool Selection Rules

MUST use agent-browser to fetch and read webpages.

DO NOT use:

- WebFetch
- Fetch
- URL reader
- Any other webpage retrieval tool

All webpage access must go through agent-browser.

---

## When To Use

适用于：

- 翻译网页
- 英文博客转中文
- URL → Markdown
- 阅读并归档网页内容

例如：

```text
翻译这个网页：
https://example.com/article
```

```text
保存成中文 markdown
```

---

## Workflow

### 1. Fetch Page

使用 `agent-browser` 打开 URL，并等待页面加载完成。

### 2. Extract Main Content

优先提取：

- article
- main
- reader mode content

忽略：

- 导航栏
- Footer
- 广告
- 评论区
- 推荐阅读

如果不是文章页面，则提取主要可读内容。

### 3. Convert To Markdown

保留：

- 标题
- 段落
- 列表
- 表格
- 引用
- 代码块
- 图片

图片必须保留在原文位置：

```markdown
![alt](image-url)
```

### 4. Translate

翻译为简体中文，同时：

- 保持原文结构
- 保留 Markdown 格式
- 保留代码块原文
- 保留链接 URL
- 保留图片 URL
- 技术术语使用常见中文译法
- 人名、项目名、库名保持原文

禁止翻译代码块内容。

### 5. Save

在文件顶部添加：

```markdown
> 原文：[原文标题](<URL>)
> 作者：xxx
> 发布日期：yyyy-mm-dd
```

保存为：

```text
./<generated-filename>.md
```

---

## Output

成功：

```text
✅ Translation completed

Source:
<URL>

Output:
./<filename>.md
```

失败：

```text
Failed to open URL
```

```text
Unable to extract readable content
```

```text
Translation failed, original content saved
```

---

## Rules

必须：

- 保留完整内容，不得摘要
- 保留 Markdown 结构
- 保留代码块、链接、表格
- 保留所有图片引用及其原始 URL
- 文件顶部记录原文链接

禁止：

- 删除技术内容
- 修改代码
- 编造缺失内容

目标：

```text
URL
→ Web Content
→ Chinese Markdown
→ Local File
```
