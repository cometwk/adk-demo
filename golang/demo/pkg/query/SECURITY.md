TODO

# 7. 你的 DSL 其实比“开放 SQL”安全得多

因为：

你实际上是在做：

```text id="z4m2z9"
有限语义 DSL
```

。

这和：

```text id="95lqlu"
用户直接写 SQL
```

完全不是一个风险等级。

你是：

```text id="tr9t5o"
Controlled Query Language
```

。

只要：

* AST 化
* 白名单
* 参数化

安全性其实非常高。

---
