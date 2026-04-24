
# V3 Update 1：`call` op 鲁棒性改造

本文记录 V3 运行时暴露的一个三层叠加缺陷，以及同时落地的三个修复方案。

---

## 一、问题复现

运行 V3 原始代码后，LLM 生成的 `call` 动作触发了如下错误：

```
ACTION: { op: 'call', node: 'project_1', method: 'checkRiskStatus', args: {} }
❌ Invalid action: Args validation failed: [
  {
    "expected": "number",
    "code": "invalid_type",
    "path": ["teamLoad"],
    "message": "Invalid input: expected number, received undefined"
  }
]
```

表面看是参数缺失，实际是三层设计缺陷同时叠加的结果。

---

## 二、根因分析

### 缺陷一：LLM Tool Schema 对 `args` 没有任何字段约束

`llm.ts` 中 `call` 变体的原始 `args` 定义：

```json
"args": { "type": "object", "description": "可选参数" }
```

LLM 只知道这是个 `object`，完全不知道需要哪些字段。黑板里已经有 `teamLoadAccumulator: 130`，方法需要 `teamLoad`，LLM 要靠自己推断这两者是同一个数字，推断失败就产生了 `args: {}`。

**本质**：LLM 被要求"手工抄写黑板上的值并翻译字段名"，这是信息黑洞 + 语义跳跃的双重负担。

### 缺陷二：Validator 存在校验盲区

原始 `validator.ts`：

```ts
if (schema && action.args !== undefined) {
  const result = schema.params.safeParse(action.args);
  // ...
}
```

当 `action.args` 是 `{}` 时（非 `undefined`），进入校验路径，报错。  
当 `action.args` 是 `undefined` 时，**跳过校验**，即使方法有必填参数也会通过，留下执行期的隐患。

**本质**：校验逻辑依赖 `args` 是否显式传入，而不是依赖方法是否有必填参数。

### 缺陷三：Loop 遇到错误直接终止，LLM 没有修正机会

原始 `loop.ts`：

```ts
if (!validation.valid) {
  console.log('❌ Invalid action:', validation.error)
  break   // ← 一错即死
}
```

错误没有作为观测反馈给 LLM，导致整个推理链就此中断。

**本质**：Agent Loop 应当是一个自修正闭环，而非单次失败即终止的线性流程。

### 缺陷四（伴随缺陷）：黑板 key 与方法参数 key 语义割裂

黑板存储：`teamLoadAccumulator`  
方法签名：`checkRiskStatus({ teamLoad: number })`

LLM 需要跨越这个命名鸿沟，无论 Tool Schema 描述多详细，这种隐式映射都是风险点。

---

## 三、整合方案设计

三个缺陷互相关联，修复策略需要在**类型层 → 校验层 → 执行层 → 循环层 → 提示层**形成统一闭环。

### 核心设计原则

> **LLM 只做"声明意图"，Runtime 负责"值的解析与校验"。**

---

### 方案一：`call` op 新增 `from_state` 声明式绑定字段

在 `types.ts` 中扩展 `call` op：

```ts
| {
    op: "call";
    node: NodeId;
    method: string;
    /** 显式内联参数，优先级高于 from_state */
    args?: Record<string, any>;
    /** 声明式黑板绑定：{ 参数名: 黑板 key }，Runtime 自动解析当前值 */
    from_state?: Record<string, string>;
  }
```

**`from_state` 的语义**：LLM 声明"把黑板上 `teamLoad` 这个 key 的值，绑定到方法的 `teamLoad` 参数"。Runtime 负责在执行时读取实际值，LLM 不需要复制数字。

**优先级规则**：`resolvedArgs = { ...fromStateArgs, ...args }`

- `from_state` 提供基础绑定（来自黑板）
- `args` 可以覆盖或补充（用于黑板里没有的值）
- 两者都可选，Runtime 把合并结果送进 Zod 校验

同时，将黑板 key 命名从 `teamLoadAccumulator` 改为 `teamLoad`，与方法参数名对齐，消除语义翻译负担：

```ts
// index.ts
const workflowSchema = z.object({
  teamLoad: z.number().default(0),  // ← 与 checkRiskStatus({ teamLoad }) 对齐
});
```

---

### 方案二：Validator 和 Executor 统一 resolved args 逻辑，消除校验盲区

`validator.ts` 改造后的 `call` 校验流程：

```ts
// 1. 校验 from_state 引用的 key 在黑板 schema 中存在
const schemaShape = this.agentState.getSchemaShape();
if (action.from_state) {
  for (const [, stateKey] of Object.entries(action.from_state)) {
    if (!(stateKey in schemaShape)) {
      return { valid: false, error: `from_state: blackboard key '${stateKey}' not found in state schema` };
    }
  }
}

// 2. 解析最终参数：from_state 提供基础值，args 显式覆盖
const stateValues = this.agentState.get();
const fromStateArgs = action.from_state
  ? Object.fromEntries(
      Object.entries(action.from_state).map(([argKey, stateKey]) => [argKey, stateValues[stateKey]])
    )
  : {};
const resolvedArgs = { ...fromStateArgs, ...(action.args ?? {}) };

// 3. 始终做全量 Zod 校验（修复：不再依赖 args !== undefined）
const result = schema.params.safeParse(resolvedArgs);
if (!result.success) {
  return { valid: false, error: `Args validation failed: ${JSON.stringify(result.error.issues)}` };
}
```

`executor.ts` 中 `call` 分支采用**完全相同**的 resolve 逻辑：

```ts
const stateValues = this.agentState.get();
const fromStateArgs = action.from_state
  ? Object.fromEntries(
      Object.entries(action.from_state).map(([argKey, stateKey]) => [argKey, stateValues[stateKey]])
    )
  : {};
const resolvedArgs = { ...fromStateArgs, ...(action.args ?? {}) };

const parsed = schema.params.parse(resolvedArgs);
const result = typeof parsed === "object" && parsed !== null
  ? fn.apply(node, Object.values(parsed))
  : fn.call(node, parsed);
```

**关键决策：Validator 和 Executor 的 resolve 逻辑必须完全对称。**  
如果两者逻辑不一致，会出现"校验通过但执行用了不同的参数来源"的隐蔽 bug。

---

### 方案三：Loop 错误回注 + 连续错误计数器

`loop.ts` 引入两个机制：

**连续错误计数器（consecutiveErrors）：**
- 每次验证失败或执行失败时递增
- 成功时归零
- 超过 `MAX_CONSECUTIVE_ERRORS`（默认 2）时才真正终止

**错误回注为 lastObservation：**
- 验证失败：`VALIDATION_ERROR: <message> — please fix your action and retry`
- 执行失败：`EXECUTION_ERROR: <message> — please fix your action and retry`
- 下一轮 LLM 看到这个错误观测，有机会修正

```ts
const MAX_CONSECUTIVE_ERRORS = 2;
let consecutiveErrors = 0;

// 校验失败时：
consecutiveErrors++
if (consecutiveErrors > MAX_CONSECUTIVE_ERRORS) { break }
lastObservation = `VALIDATION_ERROR: ${validation.error} — please fix your action and retry`
continue   // ← 不 break，继续下一步让 LLM 修正

// 执行失败时：同上

// 成功时：
consecutiveErrors = 0   // ← 重置，不影响后续步骤的重试配额
```

**关键决策：用连续计数而非总计数。**  
如果用总计数，早期某次失败会消耗后续步骤的重试配额。连续计数更公平：每一步成功后，下一步都有完整的重试机会。

---

### 方案叠加：Prompt 和 Tool Schema 同步更新

`llm.ts` tool schema 中 `call` 变体新增 `from_state` 字段描述，让 LLM 在 Schema 层就知道这个选项：

```json
"from_state": {
  "type": "object",
  "description": "声明式黑板绑定：{ 参数名: 黑板key }，Runtime 自动读取当前值。优先使用此字段代替手动复制黑板数值",
  "additionalProperties": { "type": "string" }
}
```

`prompt.ts` RULES 新增两条指引：

```
- When calling a method, use from_state to bind args from the blackboard instead of
  repeating values manually in args; e.g. from_state: { "teamLoad": "teamLoad" }
- Use args only for values not available in the blackboard
- If a previous action returned VALIDATION_ERROR or EXECUTION_ERROR, fix the action and retry
```

---

## 四、完整数据流（修复后）

```
1. LLM 输出：
   { op: "call", node: "project_1", method: "checkRiskStatus",
     from_state: { teamLoad: "teamLoad" } }

2. Validator.validate():
   ├─ 检查 "project_1" 存在 ✓
   ├─ 检查 "checkRiskStatus" 在注册表 ✓
   ├─ 检查 from_state["teamLoad"] = "teamLoad" 在黑板 schema ✓
   ├─ 读取当前黑板：{ teamLoad: 130 }
   ├─ resolvedArgs = { teamLoad: 130 }
   └─ Zod safeParse({ teamLoad: 130 }) ✓ → { valid: true }

3. Executor.execute():
   ├─ 同样的 resolve 逻辑 → resolvedArgs = { teamLoad: 130 }
   ├─ schema.params.parse({ teamLoad: 130 }) → { teamLoad: 130 }
   └─ checkRiskStatus(130) → { risk: "HIGH" }

4. Loop:
   consecutiveErrors = 0
   lastObservation = 'call → {"risk":"HIGH"}'
```

---

## 五、改动文件汇总

| 文件 | 改动内容 |
|------|----------|
| `runtime/types.ts` | `call` op 新增 `args?: Record<string,any>` 和 `from_state?: Record<string,string>` |
| `runtime/validator.ts` | 统一 resolved args 逻辑；始终做全量 Zod 校验；新增 from_state key 合法性检查 |
| `runtime/executor.ts` | 与 Validator 完全对称的 resolve 逻辑；去掉原来的 `args === undefined` 分支 |
| `agent/loop.ts` | 连续错误计数器；失败时回注 `VALIDATION_ERROR`/`EXECUTION_ERROR` 为 lastObservation |
| `agent/llm.ts` | `call` 变体 tool schema 新增 `from_state` 字段及描述 |
| `agent/prompt.ts` | RULES 补充 `from_state` 使用指引和错误重试指引 |
| `agent/llm_mock.ts` | Mock 序列改用 `from_state` 绑定；同步更新黑板 key 命名 |
| `index.ts` | 黑板 schema key 从 `teamLoadAccumulator` 改为 `teamLoad` |

---

## 六、关键设计决策记录

### 决策 1：`from_state` 优先级低于 `args`

合并顺序：`resolvedArgs = { ...fromStateArgs, ...args }`

**理由**：允许"大部分参数来自黑板，个别参数在调用时显式覆盖"的混合场景。如果反转优先级，`from_state` 就无法被 `args` 局部覆盖，灵活性降低。

### 决策 2：Validator 和 Executor 的 resolve 逻辑必须完全对称

两处都写了相同的 `fromStateArgs` + `resolvedArgs` 逻辑，没有复用成公共函数。

**理由**：Validator 和 Executor 是两个独立的类，没有共同的父类或组合关系。如果将 resolve 逻辑提取到工具函数，需要传入 `agentState`，会增加不必要的耦合。目前规模下，显式重复比隐式共享更易于理解和维护。如果将来 resolve 逻辑变复杂，再提取为 `resolveCallArgs(action, state)` 工具函数。

### 决策 3：连续错误计数而非总错误计数

`consecutiveErrors` 在每次成功后重置为 0。

**理由**：Agent 推理链的典型模式是"大量成功步骤 + 偶尔失败后立即修正"。用总计数会让早期的失败消耗后续步骤的重试配额，导致整体上限变低，不符合直觉。连续计数的语义是"连续 N 次无法修正则放弃"，更精确。

### 决策 4：黑板 key 命名与方法参数名对齐

`teamLoadAccumulator → teamLoad`

**理由**：当黑板 key 和方法参数名一致时，`from_state` 绑定写法最简洁：`{ teamLoad: "teamLoad" }`，无需任何语义翻译。如果两者不同，LLM 仍然需要推断映射关系，`from_state` 的优势减半。对于简单场景，统一命名是最低成本的解决方案。

### 决策 5：错误回注包含明确的行动指令

错误格式：`VALIDATION_ERROR: <message> — please fix your action and retry`

**理由**：LLM 看到错误后，需要决定下一步是"重试修正"还是"执行别的动作"。加上 `— please fix your action and retry` 明确告知期望行为，减少 LLM 误判为需要执行其他步骤的概率。
