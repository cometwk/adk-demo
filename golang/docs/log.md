
需求：
======

满足 VictoriaLogs 的日志配置： _stream_fields=module,level,feature。

同时还有:

### 1️⃣ request 级别上下文（reqId）

* 一次请求 → 所有日志自动带上

### 2️⃣ 业务维度字段（feature / module）

* 例如：

  * module=payment
  * feature=refund

👉 要能“逐层叠加”

---

### 3️⃣ 老函数不感知 reqId

```go
func DoSomething() {
    log.Info("xxx") // 没有 reqId
}
```

👉 这是最难点（现实项目一定会遇到）


目标:
======



# 二、完整方案（logrus 版本）

## 1️⃣ 定义 ctx 存 logger

```go
type ctxKey struct{}

func WithLogger(ctx context.Context, log *logrus.Entry) context.Context {
    return context.WithValue(ctx, ctxKey{}, log)
}

func Logger(ctx context.Context) *logrus.Entry {
    if ctx == nil {
        return baseLogger
    }
    if log, ok := ctx.Value(ctxKey{}).(*logrus.Entry); ok {
        return log
    }
    return baseLogger
}
```

---

## 2️⃣ 初始化 baseLogger（关键）

```go
var baseLogger = logrus.New().WithFields(logrus.Fields{
    "module":  "default",
    "feature": "default",
})
```

👉 重点：

- 提前填好字段，避免 VictoriaLogs 丢字段
    

---

## 3️⃣ request 入口注入 reqId

```go
func Middleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        reqId := uuid.New().String()

        log := baseLogger.WithField("req_id", reqId)

        ctx := WithLogger(r.Context(), log)
        next.ServeHTTP(w, r.WithContext(ctx))
    })
}
```

---

## 4️⃣ 模块级 logger（module）

```go
func WithModule(ctx context.Context, module string) context.Context {
    log := Logger(ctx).WithField("module", module)
    return WithLogger(ctx, log)
}
```

---

## 5️⃣ feature 叠加（关键点）

```go
func WithFeature(ctx context.Context, feature string) context.Context {
    log := Logger(ctx).WithField("feature", feature)
    return WithLogger(ctx, log)
}
```

---

## 6️⃣ 使用方式（核心体验）

```go
func Handler(ctx context.Context) {
    ctx = WithModule(ctx, "order")
    Service(ctx)
}

func Service(ctx context.Context) {
    ctx = WithFeature(ctx, "create")

    Logger(ctx).Info("processing order")
}
```

👉 输出：

```text
req_id=xxx module=order feature=create level=info msg="processing order"
```

