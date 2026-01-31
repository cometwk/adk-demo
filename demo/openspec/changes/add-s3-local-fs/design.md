## Context
本变更在 `serve` 服务内新增一个“Local FS 版对象存储”能力：文件内容以 hash（SHA-256）定位并去重，业务侧以不可枚举的 `file_id` 引用文件并承载权限/归属等属性。

## Goals / Non-Goals
- Goals:
  - 本地磁盘作为存储介质，路径分桶（`/<2>/<2>/<hash>`）避免单目录过大
  - 上传流式计算 hash（常数内存），并支持并发去重
  - 下载/预览支持 HTTP Range（RFC 7233），满足 `<video>`/PDF 等场景
  - 对外稳定暴露 `file_id`（业务层 ID），内部以 `hash` 管理内容实体
- Non-Goals:
  - S3 协议兼容（签名、bucket、ACL、multipart upload 等）
  - 前端预览页面（本变更只定义后端能力与接口）

## Decisions
### Decision: 单表模型（file_blobs）
- **file_blobs**：内容实体，唯一键为 `hash`，记录 `storage_path`、`size`、`mime_type`、`filename`，可选 `ref_count` 支撑后续 GC。
- 对外 `file_id` 直接使用 `file_blobs.id`，不再拆分业务引用表。

### Decision: 存储路径按 hash 分桶
- 规则：`dir1=hash[0:2]`，`dir2=hash[2:4]`，最终路径 `/<root>/<dir1>/<dir2>/<hash>`。
- 目的：避免目录膨胀，提高文件系统性能与可维护性。

### Decision: 并发去重以 DB 唯一约束兜底
- `file_blobs.hash` 设为 UNIQUE。
- 上传流程中先计算 hash，再尝试插入 blob；若唯一冲突则复用既有 blob（并更新引用计数或跳过）。

### Decision: Range 支持手写实现
- Echo 的 `c.File()` 在此场景下不可控/不满足 Range 与多种 `Content-Disposition` 切换需求。
- 采用 `os.File` + `Seek` + `io.CopyN` 实现 `206 Partial Content`。

## Risks / Trade-offs
- **一致性风险**：先落盘再入库 vs 先入库再落盘。
  - 本变更以“DB 唯一约束 + 事务 + 原子 rename”作为一致性手段；详细顺序在 tasks 的实现中进一步约束并补测试。
- **安全风险**：仅以 `file_id` 隐匿不足以满足权限。
  - 本提案只定义最小能力；权限控制（鉴权、所有权、分享链接）建议后续扩展为独立变更。

## Migration Plan
- 新增 DDL（`serve/docs/ddl/s3-local-fs.sql`）并同步 `serve/biz/tables.go` 的 xorm struct（仅 `file_blobs`）。
- 新增路由与 handler，保持与现有 `serve` 路由组织方式一致。
- 回滚：删除新增路由；删除新表（或保留表但不再使用）按数据库迁移流程执行。

## Open Questions
## Resolved Decisions
### Decision: `file_id` generation uses project Snowflake
- `file_id` / `blob.id` 等标识统一沿用 `github.com/lucky-byte/lib/pkg/snowflake`（例如 `snowflake.SnowflakeId()`）。

### Decision: Provide handlers as a module; defer route mounting
- 本变更先实现可复用的 Echo handlers（模块输出），不在 `serve/main.go` 或路由 attach 中挂载。
- 完成标准以单元测试为准：仿照 `serve/routes/api/route/query_test.go` 的模式，使用 `serve.EchoTestSetup()` 启动测试用 echo 实例，对 handler 进行请求级验证。

