## 1. Implementation
- [x] 1.1 定义 DDL：编写 `serve/docs/ddl/s3-local-fs.sql`（仅 `file_blobs`，含必要索引/唯一约束）
- [x] 1.2 同步 xorm 表结构：在 `serve/biz/tables.go` 新增/维护 `file_blobs` 对应 struct 与 `TableName()`
- [x] 1.3 新增存储模块骨架：创建 `serve/pkg/s3` 包（配置、路径规则、hash 计算、落盘、查库/写库）
- [x] 1.4 实现上传 handler：`POST /files`（multipart），流式 hash，去重写入，返回 `file_id`（即 `file_blobs.id`）
- [x] 1.5 实现下载/预览 handler：`GET /files/:file_id` 与 `GET /files/:file_id/preview`（支持 Range）
- [x] 1.6 模块化输出：handler 以包形式输出（不在本变更中挂载到 `serve/main.go` / 路由 attach）

## 2. Validation
- [x] 2.1 单元测试：Range 解析（合法/非法 range；suffix range；open-ended range）
- [x] 2.2 集成测试（可选）：上传同内容并发去重（hash 唯一冲突分支，返回同一 `file_id`）
- [x] 2.3 路由级单测：仿照 `serve/routes/api/route/query_test.go`，用 `serve.EchoTestSetup()` 对 upload/download/preview handler 做请求级验证
- [x] 2.4 `openspec validate add-s3-local-fs --strict` 通过

