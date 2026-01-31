# S3 LocalFS GET 与 Content-Range

本文说明 `get.go` 对 `Range/Content-Range` 的处理方式，以及客户端应如何配合请求。

## 服务端行为概览

`get.go` 在响应中始终设置：

- `Accept-Ranges: bytes`
- `Content-Type`：来自文件 `MimeType`
- `Content-Disposition`：由调用方决定 `inline` 或 `attachment`

当请求不带 `Range`：

- 返回 `200 OK`
- 返回完整内容
- `Content-Length` 等于文件大小

当请求带 `Range`：

- 仅支持单区间范围（拒绝多段 `bytes=0-1,3-4`）
- 支持三种格式：
  - `bytes=start-end`
  - `bytes=start-`
  - `bytes=-suffix`
- 若范围有效：
  - 返回 `206 Partial Content`
  - `Content-Range: bytes start-end/size`
  - `Content-Length` 等于 `end-start+1`
- 若范围无效：
  - 返回 `416 Requested Range Not Satisfiable`
  - `Content-Range: bytes */size`

## Content-Range/Range 通信方式

客户端通过 `Range` 请求部分内容，服务端通过 `Content-Range` 回告实际返回的范围和总大小。

示例：

- 请求：`Range: bytes=0-1023`
- 响应：`Content-Range: bytes 0-1023/123456`
- 状态码：`206`

若请求超出范围或格式不被支持（如多段），则返回 `416`，并附带：

- `Content-Range: bytes */123456`

这意味着客户端应修正范围或回退到完整下载。

## 客户端如何操作

1. **完整下载或文件较小**
   - 直接 GET，不带 `Range`
   - 服务器返回 `200` 和完整内容

2. **仅需预览或减少带宽**
   - 发送 `Range` 请求获取前 N 字节
   - 处理 `206` 并按需继续请求后续范围

3. **浏览器原生预览**
   - 使用 `<img src>` / `<video src>` / `<iframe src>` 直接指向该地址
   - 浏览器可能自动发送 `Range`（尤其是媒体类型）

## 示例：Axios 预览

你提供的示例在不带 `Range` 时会下载完整文件，**适合小文件或确实需要完整内容**。
如果目的是“只取预览”，建议带 `Range`：

```ts
const fetchPreview = async () => {
  const response = await axios.get(`/admin/preview/${fileId}`, {
    responseType: "blob",
    headers: {
      Range: "bytes=0-1048575", // 取前 1MB 作为预览
    },
  })
  revokedUrl = URL.createObjectURL(response.data)
  setPreviewUrl(revokedUrl)
}
```

注意点：

- 预期状态码为 `206`（而非 `200`）
- 如返回 `416`，需要重新计算范围或退回完整下载
- 对图片格式，部分内容可能无法渲染；是否可预览取决于文件格式
