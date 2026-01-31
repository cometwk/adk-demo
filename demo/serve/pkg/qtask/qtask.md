为了满足**去重**、**有序调度（重试退避）以及并发处理**的要求，我们需要结合以下数据结构：

1.  **Map (`map[string]*Task`)**: 用于 $O(1)$ 时间复杂度的查找，实现**去重**和**按Key删除**。
2.  **最小堆 (Min-Heap)**: 用于按 `NextExecuteTime`（下一次执行时间）排序。这对于实现**指数退避**（Delay）至关重要，因为重试的任务需要“睡”一会儿，不能立即被取出。
3.  **Channel + Goroutines**: 实现 Worker Pool。

以下是完整的 Golang 实现代码，包含详细注释和使用示例。

### 核心设计图示

* **入队**: Check Map (存在则忽略) -> Add to Map -> Push to Heap.
* **调度器 (Dispatcher)**: 循环检查 Heap 堆顶 -> 如果时间到了 -> Pop -> 发送给 Worker Channel.
* **Worker**: 执行任务 -> 成功 (从 Map 删除) / 失败 (计算退避时间 -> 修改 Task 时间 -> Push back to Heap).

### 代码关键点解析

1.  **UniqueKey 去重机制 (`Add` 方法)**
    *   在插入前，直接检查 `tasksMap`。如果 Key 存在，立即返回 Error，保证了队列中同一个 Key 只会存在一个任务实例。

2.  **Worker Pool 与 调度**
    *   **Worker Pool**: 使用 `workerCount` 个 Goroutine 同时消费 `jobChan`。
    *   **Dispatcher**: 单独的一个 Goroutine。它不仅仅是简单的轮询，而是结合了 `time.Timer` 和 `Heap`。
        *   如果有任务且时间到了，取出推入 `jobChan`。
        *   如果有任务但时间没到，设置 Timer 睡眠 `NextRun - Now`。
        *   如果没任务，睡眠直到有新任务 `Add` 进来（通过 `readySignal` 唤醒）。

3.  **指数退避 (Exponential Backoff)**
    *   逻辑在 `handleRetry` 中。
    *   公式：`delay = base * 2^retryCount`。
    *   **关键点**：重试不是立即扔回 `jobChan`，而是修改 `NextRun` 时间后扔回 `Heap`。Dispatcher 会等到时间到了才再次分发该任务。

4.  **删除任务 (`Remove`)**
    *   利用 `map` 进行 $O(1)$ 删除。
    *   为了保持 Heap 的一致性，使用了 `heap.Remove`（需要维护 `index`）。
    *   *Worker 安全性*: Worker 在执行前会做一个 Double Check (`if _, exists := mq.tasksMap[key]; !exists`)。如果你在任务等待执行期间调用了 Remove，Worker 拿到任务后发现 Map 里没了，会直接跳过。

5.  **并发安全**
    *   使用 `sync.RWMutex` 保护 `tasksMap` 和 `taskQueue`。
    *   统计数据使用 `sync/atomic` 保证高性能计数。

### 任务生命周期与统计说明

以 `MaxRetries = 3` 为例，一个总是失败的任务会经历以下过程：

1.  **Add**: 任务进入队列。(`Pending: 1`)
2.  **Execute 1 (初始)**: 失败。
    *   `RetryCount` 0 -> 1。
    *   计算退避时间，推回 Heap。
    *   **状态**: 任务仍在 Map 中，`Pending` 仍为 1，`Failed` + 1。
3.  **Wait**: 等待退避时间（任务在 Heap 中沉睡）。
4.  **Execute 2 (重试1)**: 失败。
    *   `RetryCount` 1 -> 2。
    *   推回 Heap。
    *   **状态**: `Pending` 仍为 1，`Failed` + 1。
5.  ... 直到 **Execute 4 (重试3)**: 失败。
    *   `RetryCount` 3 >= MaxRetries。
    *   **Drop**: 从 Map 中删除任务。
    *   **状态**: `Pending` 变为 0，`Failed` + 1。

因此，**Pending** 包含了所有“正在排队”以及“正在等待重试”的任务。

### 缺陷与局限性分析

本实现在单机、非关键业务场景下非常高效，但存在以下显著缺陷，**不适合**对数据可靠性要求极高的生产环境：

1.  **数据易失性 (无持久化)**
    *   所有任务存储在内存中。如果进程重启、崩溃或机器断电，所有 `Pending` 任务（包括等待重试的任务）都会永久丢失。
2.  **无界内存风险**
    *   没有设置队列容量上限。如果生产速度持续高于消费速度，或者大量任务进入重试堆积，可能导致 OOM (Out Of Memory)。
3.  **单点故障**
    *   不支持分布式部署。无法多实例共享队列。
4.  **调度精度开销**
    *   依赖 Go Timer。在海量高频短任务场景下，频繁创建/重置 Timer 可能带来一定的 CPU 开销。

**改进建议**:
对于生产环境，建议使用 Redis (Sorted Set 实现延时队列) 或专业的队列中间件 (RabbitMQ, Kafka, RocketMQ) 来替代纯内存实现，以获得持久化和高可用能力。

# 备注

你好！这是因为你看到的日志输出时，`task-fail` **刚刚失败了第 1 次**，它正在“冷却期”等待下一次重试，并没有耗尽所有的重试机会，所以它仍然算作“待处理任务”（Pending）。

### 1. 现象分析：为什么 `Pending: 1`？

根据代码逻辑，`mq.maxRetries = 3` 意味着允许**重试 3 次**，加上初始执行的 1 次，总共最多会执行 **4 次**。

时间线如下（假设 baseBackoff=1s）：

1.  **T+0s (初始执行)**: `task-fail` 执行失败。
    *   `Stats`: Failed: 1。
    *   **逻辑**: `RetryCount` (0) < 3，计算退避时间 (1s)，推回队列等待。
    *   **状态**: 任务还在 Map 中，**Pending: 1**。
2.  **T+1s (第1次重试)**: 再次执行失败。
    *   `Stats`: Failed: 2。
    *   **逻辑**: `RetryCount` (1) < 3，计算退避时间 (2s)，推回队列等待。
    *   **状态**: **Pending: 1**。
3.  **T+3s (第2次重试)**: 再次执行失败。
    *   `Stats`: Failed: 3。
    *   **逻辑**: `RetryCount` (2) < 3，计算退避时间 (4s)，推回队列等待。
    *   **状态**: **Pending: 1**。
4.  **T+7s (第3次重试 - 最后一次)**: 再次执行失败。
    *   `Stats`: Failed: 4。
    *   **逻辑**: `RetryCount` (3) >= 3，**彻底删除任务**。
    *   **状态**: 任务从 Map 移除，**Pending: 0**。

你看到的日志 `Stats: Pending: 1 | Processed: 3 | Success: 2 | Failed: 1` 刚好是在 **第一阶段**。任务虽然失败了，但因为它还有重试机会，所以它“活着”，只是在排队等待下一次唤醒。

---

### 2. 代码设计缺陷分析

虽然这个 `MemoryQueue` 实现了基本的去重和退避重试，但在生产环境中使用存在以下显著缺陷：

1.  **数据易失性 (Volatility)**
    *   纯内存存储。程序重启、崩溃或服务器断电，所有 `Pending` 任务（包括等待重试的任务）都会**永久丢失**。
    *   **修复方案**: 需要持久化存储（如 Redis, MySQL, Wal文件）。

2.  **内存无界风险 (OOM Risk)**
    *   没有设置队列的最大容量。如果生产任务的速度远大于 Worker 消费的速度，或者大量任务进入长时重试状态，`tasksMap` 和 `taskQueue` 会无限增长，最终导致内存溢出。
    *   **修复方案**: 增加 MaxCapacity 配置，超过阈值时拒绝新任务或启用背压机制。

3.  **重试状态不透明**
    *   外部无法得知某个具体任务处于第几次重试，还需要等多久。`Stats()` 只提供了聚合数据。
    *   **修复方案**: 提供 `Inspect(key)` 接口查询单个任务详情。

4.  **单点故障**
    *   无法横向扩展。只能单机运行，无法在多台服务器之间共享任务队列。

5.  **调度精度与性能**
    *   虽然 Go 的 Timer 性能已经很好，但如果堆顶任务频繁变动（例如大量短延迟任务插入），Dispatcher 的唤醒和 Timer 重置逻辑会带来一定的 CPU 开销。
