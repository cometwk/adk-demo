/**
 * 记忆图谱基础节点
 *
 * 所有节点类型继承此抽象类，
 * 提供统一的游走和感知协议。
 *
 * @semantic
 * type: abstract_base
 * purpose: define_traversal_protocol
 */
export abstract class BaseNode {
  /**
   * 节点唯一标识符
   */
  id: string;

  constructor(id: string) {
    this.id = id;
  }

  /**
   * 游走函数：寻找与当前节点关联的其他节点
   *
   * @semantic
   * relation: dynamic (子类指定具体关系类型)
   * traversal_cost: varies (根据关系类型变化)
   * cardinality: many
   * operation: graph_traversal
   *
   * @param relation 关系类型，如 'prerequisite', 'belongs_to', 'related_to'
   * @returns 关联的节点列表
   */
  abstract linkTo(relation: string): BaseNode[];

  /**
   * 感知函数：判断当前节点是否具备某种特质
   *
   * @semantic
   * operation: trait_check
   * cost: low
   * returns: boolean_match
   *
   * @param trait 特质名称，如 'foundational', 'advanced', 'practical'
   * @returns 是否具备该特质
   */
  abstract hasTrait(trait: string): boolean;

  /**
   * 获取节点类型名称
   *
   * @semantic
   * operation: type_identification
   * cost: low
   * purpose: debugging_and_display
   *
   * @returns 节点类型名称（如 'Concept', 'Topic', 'Source'）
   */
  abstract getType(): string;

  /**
   * 获取节点 ID
   *
   * @semantic
   * operation: id_access
   * cost: low
   * purpose: node_identification
   *
   * @returns 节点唯一标识符
   */
  getId(): string {
    return this.id;
  }
}