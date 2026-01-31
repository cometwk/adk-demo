package migrategen

import (
	"fmt"
	"strings"
)

// BuildAIPrompt returns a Markdown prompt that can be pasted into an AI tool
// to rewrite destructive DROP+CREATE migrations into safer ALTER TABLE statements.
//
// It intentionally includes only table-level changes (not the full snapshots) to keep it focused.
func BuildAIPrompt(version, name string, changes []TableChange) string {
	var b strings.Builder

	b.WriteString("# 迁移改写（DROP+CREATE -> ALTER TABLE）\n\n")
	b.WriteString("你是资深 MySQL DBA/后端工程师。请把下面 migration 里“对已存在表的 DROP+CREATE”改写成 **尽量安全的** `ALTER TABLE` 语句，确保数据不丢失。\n\n")
	if version != "" || name != "" {
		b.WriteString("## 迁移元信息\n\n")
		if version != "" {
			b.WriteString(fmt.Sprintf("- **version**: %s\n", version))
		}
		if name != "" {
			b.WriteString(fmt.Sprintf("- **name**: %s\n", name))
		}
		b.WriteString("\n")
	}

	b.WriteString("## 约束与输出要求\n\n")
	b.WriteString("- **不要**建议 `DROP TABLE` 作为变更方式（除非变更类型明确为 removed）。\n")
	b.WriteString("- 对于 **changed** 的表：输出从 old -> new 的 `ALTER TABLE` 序列（含索引/约束/分区等必要变更）。\n")
	b.WriteString("- 如果检测到“疑似重命名（列名变了但语义相似）”或存在多种方案，请给出 **两个方案**：保守方案 + 更优方案，并说明风险。\n")
	b.WriteString("- 输出 SQL 时请保持可执行性；如果需要分步骤（例如先新增列回填数据再切换），请明确步骤。\n")
	b.WriteString("- 最后给出一个**验证清单**：如何在测试库验证 schema 等价、如何验证数据不丢。\n\n")

	// Changes
	var hasChanged bool
	for _, c := range changes {
		if c.Type == TableChangeChanged {
			hasChanged = true
			break
		}
	}
	if !hasChanged {
		b.WriteString("## 提示\n\n当前变更不包含 `changed` 类型表（仅新增/删除表），通常不需要 `ALTER TABLE` 改写。\n")
		return b.String()
	}

	b.WriteString("## 表结构对比（old vs new）\n\n")
	for _, c := range changes {
		if c.Type != TableChangeChanged {
			continue
		}
		b.WriteString(fmt.Sprintf("### 表：`%s`\n\n", c.Table))

		b.WriteString("#### old（基线快照中的 CREATE TABLE）\n\n")
	b.WriteString("```sql\n")
		b.WriteString(strings.TrimSpace(c.FromCreate))
		b.WriteString("\n```\n\n")

		b.WriteString("#### new（当前 DDL 合并快照中的 CREATE TABLE）\n\n")
		b.WriteString("```sql\n")
		b.WriteString(strings.TrimSpace(c.ToCreate))
		b.WriteString("\n```\n\n")

		b.WriteString("#### 你需要输出\n\n")
		b.WriteString("- `ALTER TABLE` 语句（可能多条）从 old 迁移到 new\n")
		b.WriteString("- 如需要数据回填/默认值变更，请给出安全的分步方案\n\n")
	}

	return b.String()
}


