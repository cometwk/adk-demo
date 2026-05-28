
## 问题
- **Critical · 心跳周期会在小租约下变为 0 触发 panic**：`HeartbeatEvery` 默认值使用整数除法 `(opts.LeaseSeconds*4)/10`，当租约 < 3 秒时结果为 0，`time.NewTicker(0)` 会直接 panic，使整个 worker 无法启动。应改成浮点/ceil 计算并至少 clamp 到 1 秒。
```78:89:lib/pkg/queue/dispatch.go
if opts.LeaseSeconds <= 0 {
    opts.LeaseSeconds = 30
}
if opts.HeartbeatEvery <= 0 {
    opts.HeartbeatEvery = time.Duration((opts.LeaseSeconds*4)/10) * time.Second
}
```

- **Major · 并发竞争时任务被悄悄丢弃一个租约周期**：当前置检查通过但加锁检查发现 `inflight` 已满时，代码只是取消本地 context 并返回，没有写回 Ack/Nack。此时任务已经被 `Dequeue` 加租并从可见队列移除，却既不在 `inflight` 追踪也无人心跳，导致它在整个 `lease_until` 期间都不可见，吞吐量被硬性限制在“当前 inflight + 等待 lease 过期”的总数。
```250:295:lib/pkg/queue/dispatch.go
if len(w.inflight) >= w.opts.Concurrency {
    w.mu.Unlock()
    ...
    jobCancel()
    log.Printf("[worker] warning: worker capacity filled during dequeue for job %d", job.ID)
    return
}
```
  建议要么在持锁分支内调用一个非事务版 `Nack`/`Release`，要么在并发检查前就保留 DB 连接上下文以便回滚该次租约。

- **Major · 优雅停机未释放租约，阻塞同一批任务达 LeaseSeconds**：`Stop()` 会调用 `drainAndCancelInflight()` 仅取消本地 context+清空 map，但不会把仍持有的 `job_queue` 租约放回队列。结果是 worker 关闭后，所有 inflight 任务仍需等待 `lease_until` 超时才能被其他 worker 捞到，服务重启期间这批任务处于“锁住但没人处理”的状态。
```378:386:lib/pkg/queue/dispatch.go
for _, m := range w.inflight {
    m.cancel()
}
w.inflight = make(map[int64]*inflightMeta)
```
  应在 drain 时尝试事务内 `Nack` 或至少调用一个幂等释放租约的 DB API，保证关机不会造成长达 `LeaseSeconds` 的空窗。

## 建议
- 修复后请补充针对“小租约”“并发溢出”“Stop 后任务立即可见”这三种情景的单测，以防回归。
- 若缺乏无事务 `Nack` 能力，建议在 `DB` 接口补充一个显式的 `ReleaseLease` 以便上述两处及时释放任务。
