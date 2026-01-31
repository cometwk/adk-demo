# MySQL 全局约定

## MySQL 时间或日期规范
1. **禁止使用 `TIMESTAMP`
2. **所有时间点字段使用 `DATETIME`

   - 语义：UTC 时间点
   - 写入：应用层 `time.Now().UTC()`
3. **DSN 固定**

   ```
   parseTime=true&loc=UTC&time_zone=%27%2B00%3A00%27
   ```
4. `DATE` 字段表示业务日期**

   - 不表示时间点
   - 要求映射为 `string (YYYY-MM-DD)`
   - 本地日界：在生产环境由 Golang `time.Local` 决定（随系统时区自适应），不引入额外的时区配置

一句话总结:

- Go 世界：`UTC`
- MySQL session：`UTC`
- DATETIME：时间点
- DATE：业务日期
- 可以使用NOW() / CURRENT_TIMESTAMP

## MySQL Upsert SQL 写法规范

在 MySQL 中，`INSERT ... SELECT ... ON DUPLICATE KEY UPDATE ...` 语句里,
如果 `SELECT` 使用了 `JOIN ... ON ...`（包含 `CROSS JOIN`），
容易与 `ON DUPLICATE KEY UPDATE` 产生歧义，导致 MySQL 将后者误解析为 `JOIN` 的 `ON` 条件，
从而出现 `Error 1064 (42000)` 语法错误。

- **禁止写法**：在 `INSERT ... SELECT ...` 中使用 `... CROSS JOIN (...) r ON DUPLICATE KEY UPDATE ...` 这种结构（或任何需要 `JOIN ... ON ...` 的结构紧邻 `ON DUPLICATE`）。
- **推荐写法**：
  - 使用逗号笛卡尔积（当子查询各自聚合为 1 行时）：`FROM (...) o, (...) r ON DUPLICATE KEY UPDATE ...`
  - 或将 `SELECT` 外包一层子查询，再在最外层写 `ON DUPLICATE KEY UPDATE`，确保语法边界清晰。

