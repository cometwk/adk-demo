import { Concept } from './nodes.js';

/**
 * 前置依赖边关系
 *
 * 表示概念之间的前置依赖关系，定义学习顺序。
 * 例如：JavaScript 是 TypeScript 的前置概念。
 *
 * @edge
 * from: Concept
 * to: Concept
 * type: prerequisite
 * cardinality: many
 * bidirectional: false
 * semantic: defines_learning_sequence
 */
export class Prerequisite {
  /**
   * 依赖源概念（需要先学习的概念）
   */
  from: Concept;

  /**
   * 依赖目标概念（需要后学习的概念）
   */
  to: Concept;

  /**
   * 依赖强度：required（必须）或 recommended（推荐）
   *
   * @semantic
   * meaning: required = 必须掌握才能学习; recommended = 有助于理解但非必须
   */
  strength: 'required' | 'recommended';

  /**
   * 依赖说明/备注
   */
  notes?: string;

  constructor(
    from: Concept,
    to: Concept,
    strength: 'required' | 'recommended' = 'required',
    notes?: string
  ) {
    this.from = from;
    this.to = to;
    this.strength = strength;
    this.notes = notes;
  }

  /**
   * 获取边类型
   *
   * @semantic
   * operation: edge_type_identification
   * cost: low
   *
   * @returns 'prerequisite'
   */
  getType(): string {
    return 'prerequisite';
  }

  /**
   * 检查依赖是否为必须
   *
   * @semantic
   * operation: strength_check
   * cost: low
   * use_case: learning_path_validation
   *
   * @returns 是否为必须依赖
   */
  isRequired(): boolean {
    return this.strength === 'required';
  }

  /**
   * 获取依赖描述
   *
   * @semantic
   * operation: description_generation
   * cost: low
   * format: "Concept A -> Concept B (strength)"
   *
   * @returns 依赖关系描述字符串
   */
  describe(): string {
    const strengthLabel = this.strength === 'required' ? '必须' : '推荐';
    const notesPart = this.notes ? ` (${this.notes})` : '';
    return `${this.from.name} → ${this.to.name} (${strengthLabel}${notesPart})`;
  }
}