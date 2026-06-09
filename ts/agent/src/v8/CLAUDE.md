本项目是一个demo原型验证项目，有很多不同的版本, 比如 v6, v8, 还可能有更多


## 基于本体论的LLM Agent 推理模型

```text
G = {
  E,   // Entities
  R,   // Relations
  T,   // Types
  C,   // Constraints / Rules
  Q    // Query & Compute Layer
}
```

- T = 定义业务本体模型
- C = 定义业务约束
- E,R,Q = 定义 Graph 的查询引擎，负责执行 本体模型 的实时查询

再适当的将 G 通过 system-prompt + tools 暴露给 LLM agent, 实现推理。

## 关键目录结构:

```
src/v8/docs         # 设计文档
├── ontology        # 本体模块
├── rule            # 约束模型
├── engine          # graph 查询引擎
├── pipeline        # LLM Agent 管道
├── rest-query      # 基于 Rest CRUD 的 graph 查询实现

./src
├── lib         # 公共
├── v6          # v6 (废弃)
└── v8          # v8 目前工作的代码
```
