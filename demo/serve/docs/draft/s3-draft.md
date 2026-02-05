<!-- chat输入：

先讨论设计问题

- 采用golang + mysql + xorm + echo 实现
- 实现基于本地目录文件存储的web服务
    - 提供基于 http 接口的上传，下载 的 echo handler
    - 提供基于 shadcn-ui 的文件预览页面
- 要求 存储目录采用 `/二级/hashcode` 的形式，对每个文件做hash，保存到目录中，这样防止文件重复

是否应该建立一张表：保存这些文件的 hashcode 或者，重新定义某种file-id ? 

-->


这是一个**典型且值得一开始就想清楚的设计点**。我先给结论，再系统拆解设计取舍。

---

## 结论（先给你答案）

**👉 应该建一张 `files` 表，并且：**

* **对外使用 `file_id`（业务 ID）**
* **对内用 `hash`（内容地址）做去重与存储定位**
* **hash ≠ file_id，各司其职**

> 换句话说：
> **hash 是存储层概念，file-id 是业务层概念**

---

## 为什么「只用 hash」不够？

你现在的设计是：

```
/{level2}/{hashcode}
```

乍一看很优雅（内容寻址，类似 Git / CAS），但**如果直接把 hash 当 file-id，会在业务层吃亏**。

### 1️⃣ hash 是「内容唯一」，不是「文件唯一」

以下场景会立即出现：

| 场景           | 只用 hash 的问题    |
| ------------ | -------------- |
| 同一个文件被多个用户上传 | 无法区分 ownership |
| 同一内容，不同文件名   | 文件名信息丢失        |
| 同一内容，不同用途    | 无法做权限、生命周期管理   |
| 文件逻辑删除       | hash 仍被其他引用使用  |

👉 **hash 更像是 blob_id，而不是 file_id**

---

## 正确抽象：拆两层概念

### 层次 1：内容层（Content / Blob）

* 以 **hash** 唯一
* 负责：

  * 去重
  * 存储路径
  * 实体文件生命周期

### 层次 2：文件层（File / Reference）

* 以 **file_id** 唯一
* 负责：

  * 业务引用
  * 权限
  * 文件名、扩展名
  * 上传者、所属对象

> ✅ 这是 Git、Docker、S3、对象存储系统的通用设计

---

## 推荐表设计（核心）

### `file_blobs`（内容表）

```sql
CREATE TABLE file_blobs (
  id           BIGINT AUTO_INCREMENT PRIMARY KEY,
  hash         CHAR(64) NOT NULL COMMENT 'SHA-256',
  size         BIGINT NOT NULL,
  mime_type    VARCHAR(128),
  storage_path VARCHAR(255) NOT NULL,
  ref_count    INT NOT NULL DEFAULT 1,
  created_at   DATETIME NOT NULL,

  UNIQUE KEY uk_hash (hash)
);
```

**职责**

* hash → 唯一内容
* `storage_path = /ab/cd/{hash}`
* `ref_count`：用于 GC（可选但非常推荐）

---

### `files`（业务文件表）

```sql
CREATE TABLE files (
  file_id     CHAR(26) PRIMARY KEY COMMENT 'ULID / Snowflake',
  blob_id     BIGINT NOT NULL,
  filename    VARCHAR(255) NOT NULL,
  ext         VARCHAR(32),
  size        BIGINT NOT NULL,
  owner_id    BIGINT,
  visibility  TINYINT NOT NULL DEFAULT 0,
  created_at  DATETIME NOT NULL,

  KEY idx_blob_id (blob_id),
  CONSTRAINT fk_blob
    FOREIGN KEY (blob_id) REFERENCES file_blobs(id)
);
```

**职责**

* 对外暴露的文件 ID
* 可被：

  * 订单
  * 用户头像
  * 附件
  * 富文本内容引用

---

## hash vs file-id 的清晰分工

| 维度      | hash  | file_id |
| ------- | ----- | ------- |
| 是否暴露给前端 | ❌ 不建议 | ✅ 是     |
| 是否可变    | ❌ 不可  | ✅ 可     |
| 是否业务语义  | ❌     | ✅       |
| 去重      | ✅     | ❌       |
| 安全性     | 易被猜   | 不可枚举    |
| 重命名     | ❌     | ✅       |

---

## 你的目录结构如何落地？

你提到：

```
/二级/hashcode
```

**推荐：**

```
/data/files/
  ├── ab/
  │   └── cd/
  │       └── abcdef...hash
```

规则：

```go
dir1 := hash[0:2]
dir2 := hash[2:4]
path := fmt.Sprintf("/data/files/%s/%s/%s", dir1, dir2, hash)
```

> 这是 Git / Docker / CAS 的成熟方案

---

## Echo Handler 设计建议

### 上传流程（关键）

1. 接收 multipart
2. **流式计算 hash（避免读入内存）**
3. 查 `file_blobs` 是否存在
4. 不存在 → 写文件 → 插入 blob
5. 创建 `files` 记录
6. 返回 `file_id`

---

### 下载流程

```
GET /files/{file_id}
```

流程：

1. `files` → `blob_id`
2. `file_blobs` → `storage_path`
3. `echo.Context.File()`

---

## shadcn-ui 预览页的好处

前端永远只认：

```ts
/file/{file_id}/preview
```

**你后端随时可以：**

* 换存储目录结构
* 换 hash 算法
* 加 CDN
* 加权限控制

而不破坏前端。

---

## 什么时候可以「只用 hash」？

**只有一种情况：**

> 👉 **这是一个纯内部、只读、无权限、无重命名的 blob 服务**

比如：

* 私有构建缓存
* CI artifact cache

否则都不建议。

---

## 最后一句设计判断

> **hash = 内容地址（物理层）**
> **file_id = 文件身份（逻辑层）**

如果你愿意，下一步我可以直接帮你：

* 画 **完整 ERD**
* 写 **Echo 上传 handler 伪代码（流式 hash）**
* 或直接给 **xorm struct + 迁移 SQL**

你想先落哪一块？
