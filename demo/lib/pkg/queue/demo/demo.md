SELECT id FROM job_queue WHERE available_at<='2025-11-25 06:08:55' AND (lease_until is null and attempts < max_attempts)
ORDER BY priority DESC, available_at ASC, id ASC
LIMIT 1
FOR UPDATE SKIP LOCKED
[high default low email image report slow error 2025-11-25 06:08:55.414991 +0000 UTC] - 74.674541ms

基于 `lib/pkg/queue/queue.go` 的代码实现和你提供的数据快照，这两条记录无法被消费者 Dequeue 的原因如下：

### 1. 核心原因：SQL 查询条件限制

在 `queue.go` 的 `Dequeue` 方法中（约第 315 行），查询可用任务的 SQL `WHERE` 条件明确包含了：

```go
// lib/pkg/queue/queue.go:315
And(builder.Expr("lease_until is null and attempts < max_attempts"))
```

这意味着 **只有 `lease_until` 字段为 `NULL` 的任务才会被选中**。

### 2. 数据状态分析

根据你提供的表格数据：

| 队列      | ID  | LeaseUntil (租约到期时间) | 状态                 |
| :-------- | :-- | :------------------------ | :------------------- |
| **image** | 45  | `2025-11-25 14:03:10`     | **非 NULL** (被锁定) |
| **email** | 30  | `2025-11-25 14:03:00`     | **非 NULL** (被锁定) |

这两条记录的 `lease_until` 都有具体的时间值。在代码逻辑看来，这意味着任务 **“当前正在被某个 Worker 处理中”**（Locked），为了防止重复处理，`Dequeue` 会直接跳过它们。

### 3. 为什么会“卡死”？

即使当前时间已经过了 `14:03:10`，由于 SQL 只检查 `IS NULL` 而不检查 `lease_until < NOW()`，这些任务依然不会被取出。

这通常发生在以下场景：

1.  **Worker 崩溃**：持有锁的消费者（`example-worker-1` / `2`）在处理过程中宕机或重启，没来得及发送 `Ack` (完成) 或 `Nack` (失败释放)。
2.  **缺失清理机制**：代码中提供了一个 `RecoverExpiredLeases` 方法（第 570 行），用于将超时的租约重置为 `NULL`。
    - **目前系统中似乎没有定期调用这个方法**（如通过 Cron 或后台 Goroutine）。

### 建议修复方案

你需要引入一个后台协程或定时任务，定期调用 `RecoverExpiredLeases` 来“解救”这些超时未完成的任务：

```go
// 建议在服务启动时添加如下逻辑
go func() {
    // 每分钟检查一次过期租约
    ticker := time.NewTicker(1 * time.Minute)
    defer ticker.Stop()

    for range ticker.C {
        // 将超时任务的 lease_until 重置为 NULL，使其可再次被 Dequeue
        affected, err := queueClient.RecoverExpiredLeases(context.Background(), 1000)
        if err != nil {
            log.Printf("Error recovering leases: %v", err)
        } else if affected > 0 {
            log.Printf("Recovered %d expired jobs", affected)
        }
    }
}()
```
