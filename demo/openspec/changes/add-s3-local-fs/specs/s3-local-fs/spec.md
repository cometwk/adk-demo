## ADDED Requirements

### Requirement: 基于内容寻址的存储与 blob 标识
系统 SHALL 在单一 `file_blobs` 表中建模已存储的数据：
- 以密码学 hash 标识的内容层（即“blob”）。
- 一个不可枚举的 `file_id`，作为 blob 的主键（`file_blobs.id`）。

#### Scenario: 上传返回文件标识
- **WHEN** 客户端成功上传文件
- **THEN** 系统返回 `file_id` 作为客户端使用的主标识
- **AND** 系统 SHALL NOT 要求客户端知道 blob 的 hash 才能下载或预览文件

### Requirement: 基于 SHA-256 hash 的 blob 唯一性
系统 SHALL 为上传内容计算 SHA-256 hash，并将其作为 blob 的唯一键。

#### Scenario: 相同内容去重
- **WHEN** 两次上传具有相同的内容字节
- **THEN** 系统仅持久化一条该 hash 对应的 blob 记录
- **AND** 两次上传返回相同的 `file_id`

### Requirement: 本地文件系统存储布局
系统 SHALL 使用由 hash 派生的两级目录布局，将 blob 内容保存到本地文件系统：
`/<root>/<hash[0:2]>/<hash[2:4]>/<hash>`。

#### Scenario: 存储路径可确定
- **WHEN** 某 blob 的 hash 为 `h`
- **THEN** 系统可以从 `h` 确定性地推导出存储路径

### Requirement: 上传 MUST 为流式且内存有界
系统 SHALL 在不将整个文件读入内存的前提下实现上传，并在流式读取请求体时计算 blob hash。

#### Scenario: 大文件上传无需全量缓冲
- **WHEN** 客户端通过 multipart/form-data 上传大文件
- **THEN** 系统在内存使用有界的前提下完成处理（与文件大小无关）

### Requirement: 并发去重正确性
系统 SHALL 依赖数据库对 blob hash 的唯一约束，确保并发上传相同内容时的正确性。

#### Scenario: 并发相同内容上传
- **WHEN** 两个客户端并发上传相同内容
- **THEN** 至多只有一次 blob 插入成功
- **AND** 另一次上传复用已有 blob，不会持久化第二份内容拷贝

### Requirement: 下载与预览 handler
系统 SHALL 提供 Echo handlers 以 `file_id` 获取文件，期望挂载为：
- `GET /files/:file_id` 用于下载（`Content-Disposition: attachment`）
- `GET /files/:file_id/preview` 用于内联预览（`Content-Disposition: inline`）

#### Scenario: 下载返回 attachment disposition
- **WHEN** 客户端请求由下载 handler 处理（挂载在 `GET /files/:file_id`）
- **THEN** 响应包含 `Content-Disposition: attachment`

#### Scenario: 预览返回 inline disposition
- **WHEN** 客户端请求由预览 handler 处理（挂载在 `GET /files/:file_id/preview`）
- **THEN** 响应包含 `Content-Disposition: inline`

### Requirement: 预览/下载的 HTTP Range 支持
系统 SHALL 支持字节范围请求（RFC 7233），以便媒体流式播放和 PDF 部分加载。

#### Scenario: 无 Range 头时返回完整内容
- **WHEN** 客户端请求不包含 `Range` 头
- **THEN** 系统返回 `200 OK` 与完整内容

#### Scenario: 合法 Range 返回部分内容
- **WHEN** 客户端请求携带合法的 `Range: bytes=start-end` 头
- **THEN** 系统返回 `206 Partial Content`
- **AND** 包含 `Accept-Ranges: bytes`
- **AND** 包含有效的 `Content-Range: bytes start-end/total` 头

#### Scenario: Range 不可满足
- **WHEN** 客户端请求携带非法或不可满足的范围
- **THEN** 系统返回 `416 Range Not Satisfiable`
- **AND** 包含 `Content-Range: bytes */total`

