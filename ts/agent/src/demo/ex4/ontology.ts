import { buildOntology } from '../../runtime/ontology-builder'
import './entities' // 触发 @agentType / @agentProperty / @agentMethod / @agentRelation 注册

// ── Library Borrow Request Decision Ontology ──
// 场景：小明想借一本书 — 评估借阅申请是否符合图书馆规定
//
// types    — 从 @agentType / @agentProperty / @agentMethod 装饰器自动收集
// relations — 从 @agentRelation 装饰器自动收集，不再需要手动声明

export const libraryOntology = buildOntology({ version: '1.0.0' })
