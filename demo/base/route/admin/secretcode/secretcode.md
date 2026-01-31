# 安全操作码（Secret Code）使用手册

## 1. 功能概述

安全操作码（Secret Code）是一个二次验证机制，用于保护系统中的敏感操作。
它类似于银行转账时的交易密码，在执行重要操作（如删除数据、修改关键信息等）前，需要用户输入预先设置的6位数字安全操作码进行验证。

### 1.1 主要特性

- **二次验证**：在执行敏感操作前需要额外验证
- **Token 机制**：验证成功后生成临时 Token，避免重复输入
- **时效性**：Token 有效期为 10 分钟
- **失败限制**：最多允许 5 次验证失败，超过后需重新验证
- **可选启用**：用户可以选择是否设置安全操作码，未设置时自动跳过验证
- **安全存储**：使用 PHC（Password Hash Competition）格式加密存储

## 2. 架构设计

### 关键步骤

- 用户操作
- 前端: 检测到需要安全操作码的操作 (这由 echo route 定义, 参见 `secretcode.Verify`)
- 前端: 在发送真正的请求 API 之前， `SecretCodeProvider` 配合 `useSecretcodeAsync` 呼叫录入安全码画面
- 前端: 录入安全码后，调用 `/admin/secretcode/verify` 验证操作码,
- 后端: 验证成功 → 返回 Token（有效期10分钟）
- 前端: 携带 Token (被写入 `X-Secretcode-Token`) 调用真正的请求 API .
- 后端: 先通过 `e.POST("/delete/:id", h.Delete, secretcode.Verify())` 校验 Token .
- 后端: 然后执行真正的API (如 `h.Delete`)


### 说明

- 为了避免在http报文中传递，故采用自定义头 `X-Secretcode-Token`
- 安全码需要先设置后，才能生效。保存在 `User` 表中


## 3. API 文档

- 3.1 验证安全操作码 **端点**: `POST /admin/secretcode/verify`
- 3.2 设置/修改安全操作码 **端点**: `POST /admin/user/secretcode`

## 4. 使用方式

### 4.1 后端：保护路由

在需要保护的路由上添加 `secretcode.Verify()` 中间件：

```go
package task

import (
    "github.com/cometwk/base/route/admin/secretcode"
)

func attach(e *echo.Group) {
    // 删除操作需要验证安全操作码
    e.POST("/delete/:id", h.Delete, secretcode.Verify())
    
    // 其他操作不需要验证
    e.GET("/search", h.SearchPage)
    e.POST("/create", add)
}
```

### 4.3 前端：调用流程

#### 步骤 1: 验证安全操作码

```typescript
// 用户输入安全操作码后调用
const response = await axios.post('/admin/secretcode/verify', {
  secretcode: '123456'
}, {
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded'
  }
})

const token = response.data // 获取返回的 Token
```

#### 步骤 2: 携带 Token 执行操作

有三种方式传递 Token：

**方式 1: 表单字段**
```typescript
const formData = new FormData()
formData.append('secretcode_token', token)
formData.append('other_data', 'value')

await axios.post('/admin/system/task/delete/123', formData)
```

**方式 2: 查询参数**
```typescript
await axios.post(`/admin/system/task/delete/123?secretcode_token=${token}`)
```

**方式 3: 请求头（推荐）**
```typescript
await axios.post('/admin/system/task/delete/123', {
  // 其他数据
}, {
  headers: {
    'X-Secretcode-Token': token
  }
})
```


## 5. Token 机制详解

### 5.1 Token 生成

- **长度**: 32 个十六进制字符（16 字节的随机数据）
- **存储**: 使用 `ticket` 模块缓存，支持内存和数据库两种模式
- **有效期**: 10 分钟
- **唯一性**: 每个用户同一时间只有一个有效 Token

### 5.2 Token 验证规则

1. **过期检查**: Token 创建后 10 分钟内有效
2. **失败计数**: 每次验证失败，失败次数 +1
3. **失败限制**: 失败次数超过 5 次，Token 失效，需重新验证
4. **匹配检查**: Token 必须完全匹配

### 5.3 Token 存储结构

```go
type TicketEntry struct {
    KeyID    string // 用户 UUID
    CreateAt int64  // 创建时间（Unix 时间戳）
    ExpiryAt int64  // 过期时间（Unix 时间戳）
    Code     string // Token 值
    Failed   int    // 失败次数
    UserData string // 用户数据（未使用）
}
```

## 6. 安全特性

### 6.1 密码存储

- 使用 PHC（Password Hash Competition）格式加密存储
- 支持多种哈希算法（默认使用 Argon2）
- 密码不会以明文形式存储或传输

### 6.2 验证保护

- Token 有时效性（10分钟）
- 失败次数限制（最多5次）
- 验证失败会记录日志

### 6.3 可选启用

- 用户可以选择不设置安全操作码
- 未设置时，系统自动跳过验证，不影响正常使用
- 已设置的用户在执行敏感操作时必须验证

## 7. 使用场景

### 7.1 典型应用场景

1. **删除操作**
   ```go
   e.POST("/delete/:id", h.Delete, secretcode.Verify())
   ```

2. **修改关键信息**
   ```go
   // 修改密码、邮箱、手机号等
   e.POST("/passwd", updatePassword, secretcode.Verify())
   e.POST("/email", updateEmail, secretcode.Verify())
   ```

3. **资金操作**
   ```go
   // 修改银行账户信息
   e.POST("/bank", updateBank, secretcode.Verify())
   ```

4. **系统配置**
   ```go
   // 修改系统关键配置
   e.POST("/config", updateConfig, secretcode.Verify())
   ```

### 7.2 不适用场景

以下场景**不建议**使用安全操作码验证：

- 频繁的操作（如查询、列表展示）
- 不需要额外安全保护的操作
- 已经有其他安全机制的操作（如 OTP 验证）

## 8. 配置说明

### 8.1 用户设置安全操作码

用户可以通过以下方式设置安全操作码：

1. **前端页面**: `/settings/secretcode`
2. **API 端点**: `POST /admin/user/secretcode`

### 8.2 管理员清空安全操作码

管理员可以通过以下方式清空用户的安全操作码：

**端点**: `POST /admin/system/user/clearsecretcode`

**请求体**:
```json
{
  "uuid": "user-uuid"
}
```

## 9. 错误处理

### 9.1 常见错误

| HTTP 状态码 | 错误信息 | 原因 | 解决方案 |
|------------|---------|------|---------|
| 403 | 该操作需验证安全操作码 | 未提供 Token | 先调用验证接口获取 Token |
| 403 | 验证安全操作码失败 | Token 无效或过期 | 重新验证获取新 Token |
| 403 | 验证失败 | 安全操作码错误 | 检查输入的操作码是否正确 |
| 400 | 安全操作码必须是6位数字 | 格式错误 | 输入6位数字 |

### 9.2 错误处理示例

```typescript
try {
  await axios.post('/admin/system/task/delete/123', {}, {
    headers: { 'X-Secretcode-Token': token }
  })
} catch (error: any) {
  if (error.response?.status === 403) {
    const message = error.response.data
    
    if (message.includes('需验证安全操作码')) {
      // Token 未提供，需要先验证
      await verifyAndRetry()
    } else if (message.includes('验证失败') || message.includes('超时')) {
      // Token 无效或过期，需要重新验证
      toast.error('验证已过期，请重新验证')
      await verifyAndRetry()
    } else {
      toast.error('验证失败')
    }
  }
}
```

## 10. 最佳实践

### 10.1 前端实践

1. **用户体验优化**
   - 在执行敏感操作前，提前提示用户需要验证安全操作码
   - 验证成功后，Token 可以缓存，避免重复验证
   - 提供清晰的错误提示

2. **Token 管理**
   - Token 有效期 10 分钟，可以在有效期内复用
   - 建议将 Token 存储在内存中，不要存储在 localStorage
   - Token 过期后自动重新验证

3. **错误处理**
   - 捕获 403 错误并提示用户重新验证
   - 区分不同的错误类型，给出相应的提示

### 10.2 后端实践

1. **路由保护**
   - 只对真正敏感的操作添加验证
   - 避免过度使用，影响用户体验

2. **日志记录**
   - 验证失败会记录日志，便于安全审计
   - 可以监控验证失败频率，发现异常行为

3. **性能考虑**
   - Token 存储在内存或数据库中，查询速度快
   - 过期 Token 会自动清理

## 11. 技术细节

### 11.1 依赖模块

- `github.com/cometwk/base/lib/ticket`: Token 存储和管理
- `github.com/cometwk/base/pkg/secure`: 密码加密和验证
- `github.com/cometwk/base/ctx`: 上下文处理

### 11.2 数据库字段

用户表中的 `secretcode` 字段：
- 类型: `VARCHAR(256)`
- 存储: PHC 格式的加密字符串
- 默认值: 空字符串（表示未设置）

### 11.3 Ticket 存储模式

- **单实例模式**: 使用内存 Map 存储（`mapTicket`）
- **集群模式**: 使用数据库存储（`dbTicket`），支持多实例共享

## 12. 测试示例

### 12.1 设置安全操作码测试

```go
func TestSetSecretcode(t *testing.T) {
    // 设置安全操作码
    p := `{"secretcode":"123456"}`
    rec := testutil.Post(e, "/admin/user/secretcode", p)
    assert.Equal(t, http.StatusOK, rec.Code)
    
    // 验证 secretcode 已被更新
    user := getUser()
    assert.NotEmpty(t, user.SecretCode)
}
```

### 12.2 验证安全操作码测试

```go
func TestVerifySecretcode(t *testing.T) {
    // 先设置安全操作码
    setSecretcode("123456")
    
    // 验证正确操作码
    rec := testutil.PostForm(e, "/admin/secretcode/verify", 
        map[string]string{"secretcode": "123456"})
    assert.Equal(t, http.StatusOK, rec.Code)
    assert.NotEmpty(t, rec.Body.String()) // 返回 Token
    
    // 验证错误操作码
    rec = testutil.PostForm(e, "/admin/secretcode/verify", 
        map[string]string{"secretcode": "000000"})
    assert.Equal(t, http.StatusForbidden, rec.Code)
}
```

## 13. 常见问题

### Q1: 用户忘记安全操作码怎么办？

A: 管理员可以通过 `/admin/system/user/clearsecretcode` 接口清空用户的安全操作码，然后用户可以重新设置。

### Q2: Token 可以跨会话使用吗？

A: Token 与用户 UUID 绑定，只要在同一用户会话中，Token 可以在 10 分钟内复用。

### Q3: 为什么验证失败后需要重新验证？

A: 为了防止暴力破解，系统限制了失败次数（最多5次）。超过限制后，Token 失效，需要重新验证获取新 Token。

### Q4: 如何判断用户是否设置了安全操作码？

A: 前端可以通过用户信息接口获取 `secretcode_isset` 字段，后端可以通过检查 `user.SecretCode` 是否为空。

### Q5: 安全操作码和 OTP 有什么区别？

A: 
- **安全操作码**: 用户自定义的6位数字，用于保护敏感操作
- **OTP**: 基于时间的一次性密码，由系统生成，用于登录验证

两者可以同时使用，提供多层安全保护。

## 14. 更新日志

- **初始版本**: 实现基本的安全操作码验证功能
- **Token 机制**: 添加 Token 缓存机制，避免重复验证
- **失败限制**: 添加失败次数限制，提高安全性

---

**注意**: 本文档基于当前代码实现编写，如有更新请及时同步文档。

