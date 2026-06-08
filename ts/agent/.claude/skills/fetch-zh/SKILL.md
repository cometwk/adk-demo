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
yyyy-mm-dd-<timestamp_ms>.md
```

例如：

```text
2026-06-06-1749182736451.md
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

避免提取：

* 导航栏
* Footer
* 广告
* 评论区
* 推荐阅读

目标：

```text
获得文章正文
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
* 保留图片 URL
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
<yyyy-mm-dd>-<unix_milliseconds>.md
```

示例：

```text
2026-06-06-1749182736451.md
```

---

### Step 6: Save File

保存到当前工作目录：

```text
./<filename>.md
```

例如：

```text
./2026-06-06-1749182736451.md
```

---

## Output

完成后返回：

```text
✅ Translation completed

Source:
https://example.com/article

Output:
./2026-06-06-1749182736451.md
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
