
为加快本地测试速度，`ResetTestOnce()` 通过 `serve/biz/testutil.DoOnce(key, fn)` 使用 **once-file** 机制：
- 标记目录：`/tmp/testonce/`
- 标记文件：`/tmp/testonce/<key>`（例如 `reset_test_db`）
- 行为：当标记文件已存在时，**跳过**重建数据库表结构的逻辑（避免每次测试都 drop/create）。

**常见坑**：当你新增/修改了 DDL（例如新增统计表）但本地 once-file 命中时，测试可能仍在旧表结构上跑，出现 `no such table` / 字段不一致等问题。

**解决方式**：手动清理对应标记文件后重跑测试：

```bash
rm -f /tmp/testonce/reset_test_db
```
