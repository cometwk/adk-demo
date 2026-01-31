# Change: add-s3-local-fs（本地文件存储：类 S3 的 Local FS 实现）

## Why
- 当前项目需要一个可复用的文件存储能力，用于上传、下载与浏览器预览（图片 / PDF / 视频等）。
- 直接以“hash 作为对外 ID”会在权限、引用、重命名与生命周期管理上遇到业务问题；需要将“内容（blob）”与“业务文件引用（file）”拆分。
- 希望实现一个“Local FS 版对象存储”，在不引入外部对象存储服务的前提下，提供稳定 API，并支持 Range（视频/PDF 预览依赖）。

## What Changes
- 新增文件存储 capability：以本地目录作为存储介质，基于内容 hash（SHA-256）去重，支持二级目录分桶（`/ab/cd/<hash>`）。
- 新增数据库表：
  - `file_blobs`：内容层（hash 唯一、路径、文件名、大小、mime、引用计数），对外 `file_id` 即 `file_blobs.id`
- 新增 HTTP 接口（Echo handler）：
  - `POST /files`：上传（multipart），流式计算 hash，落盘到最终路径，返回 `file_id`
  - `GET /files/:file_id`：下载（`Content-Disposition: attachment`）
  - `GET /files/:file_id/preview`：预览（`Content-Disposition: inline`），支持 `Range: bytes=...`
- 明确实现约束：
  - 上传/下载均不得将文件整体读入内存
  - 并发上传相同内容需依赖 DB 唯一约束保障去重正确性

## Impact
- Affected specs: 新增 `s3-local-fs`
- Affected code/docs (planned):
  - DDL: `serve/docs/ddl/s3-local-fs.sql`
  - 代码: `serve/pkg/s3/*`（新模块，封装存储/服务逻辑），以及路由挂载位置（待在 tasks 中明确）
- Affected data:
  - 新增 `file_blobs` 表

## Non-Goals
- 不在本变更中实现真正的 S3 协议兼容（仅提供类对象存储语义的 HTTP API）。
- 不在本变更中实现完整的前端 shadcn-ui 预览页面（本提案只定义后端能力与接口约定；如需前端将另立变更）。

