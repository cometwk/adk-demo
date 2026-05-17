# 业务建模 + GraphAgent 推理

在本体论（Ontology）建模中， 
G = {E, R, T, C} 可以理解为一个语义系统的四个核心组成： 

建模：


- T (Class 定义，包含： agentProperty 属性, agentRelation, agentMethod) 
- C (Constraints , 业务约束)

对 AI 可见


数据：

E (Entities)：实体 
R (Relations)： 关系 

对 AI 不可见，但是 Graph 访问接口以tool，对 AI 可以，比如在Graph中，搜索节点，顺着关系查找，在图中导航游走，去访问数据



推理架构：

1. GraphAgent 负责收集证据 
2. LLM 根据证据给出 LLM Model论断

其他管道处理：

1. LLM 给出 论断后
2. 将证据，交给固定的 rule 由固定的程序，也给出论断
3. 综合 LLM 论断 和 程序论断：给出最终结论

