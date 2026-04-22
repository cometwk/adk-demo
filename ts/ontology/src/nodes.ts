import { BaseNode } from './base.js';

/**
 * 评估结果类型
 */
export interface ReadinessResult {
  ready: boolean;
  score: number;
  missing: import('./nodes.js').Concept[];
  reason: string;
}

/**
 * 概念节点：知识单元
 *
 * 表示一个可学习的概念，包含定义、关键词、难度等属性，
 * 以及与其他概念、主题、学习来源的关系。
 *
 * @semantic
 * type: knowledge_unit
 * primary_attributes: name, definition, keywords, difficulty
 * relations: prerequisite, belongs_to_topic, has_source
 */
export class Concept extends BaseNode {
  /**
   * 概念名称
   */
  name: string;

  /**
   * 概念定义/描述
   */
  definition: string;

  /**
   * 关键词列表
   */
  keywords: string[];

  /**
   * 难度级别
   */
  difficulty: 'beginner' | 'intermediate' | 'advanced';

  /**
   * 特质标签列表
   */
  traits: string[];

  /**
   * 前置概念列表
   * @internal 存储前置依赖引用
   */
  private _prerequisites: Concept[] = [];

  /**
   * 所属主题列表
   * @internal 存储主题引用
   */
  private _topics: import('./nodes.js').Topic[] = [];

  /**
   * 学习来源列表
   * @internal 存储来源引用
   */
  private _sources: import('./nodes.js').Source[] = [];

  constructor(
    id: string,
    name: string,
    definition: string,
    keywords: string[] = [],
    difficulty: 'beginner' | 'intermediate' | 'advanced' = 'intermediate',
    traits: string[] = []
  ) {
    super(id);
    this.name = name;
    this.definition = definition;
    this.keywords = keywords;
    this.difficulty = difficulty;
    this.traits = traits;
  }

  /**
   * 设置前置概念
   *
   * @semantic
   * operation: relation_setup
   * relation_type: prerequisite
   *
   * @param concepts 前置概念列表
   */
  setPrerequisites(concepts: Concept[]): void {
    this._prerequisites = concepts;
  }

  /**
   * 设置所属主题
   *
   * @semantic
   * operation: relation_setup
   * relation_type: belongs_to_topic
   *
   * @param topics 主题列表
   */
  setTopics(topics: import('./nodes.js').Topic[]): void {
    this._topics = topics;
  }

  /**
   * 设置学习来源
   *
   * @semantic
   * operation: relation_setup
   * relation_type: has_source
   *
   * @param sources 来源列表
   */
  setSources(sources: import('./nodes.js').Source[]): void {
    this._sources = sources;
  }

  /**
   * 获取学习当前概念所需的前置概念
   *
   * @semantic
   * relation: prerequisite
   * traversal_cost: low
   * cardinality: many
   * risk_signal: missing_prerequisite
   * direction: backward (依赖关系)
   *
   * @returns 前置概念列表
   */
  getPrerequisites(): Concept[] {
    return this._prerequisites;
  }

  /**
   * 获取当前概念所属的主题
   *
   * @semantic
   * relation: belongs_to_topic
   * traversal_cost: low
   * cardinality: many
   * direction: outward
   *
   * @returns 主题列表
   */
  getTopics(): import('./nodes.js').Topic[] {
    return this._topics;
  }

  /**
   * 获取当前概念的学习来源
   *
   * @semantic
   * relation: has_source
   * traversal_cost: low
   * cardinality: many
   * direction: outward
   *
   * @returns 学习来源列表
   */
  getSources(): import('./nodes.js').Source[] {
    return this._sources;
  }

  /**
   * 游走函数：根据关系类型获取关联节点
   *
   * @semantic
   * operation: graph_traversal
   * supported_relations: prerequisite, belongs_to_topic, has_source
   * traversal_cost: varies_by_relation
   * cardinality: many
   *
   * @param relation 关系类型
   * @returns 关联的节点列表
   */
  linkTo(relation: string): BaseNode[] {
    switch (relation) {
      case 'prerequisite':
        return this._prerequisites;
      case 'belongs_to_topic':
        return this._topics;
      case 'has_source':
        return this._sources;
      default:
        return [];
    }
  }

  /**
   * 感知函数：判断是否具备某种特质
   *
   * @semantic
   * operation: trait_check
   * cost: low
   * supported_traits: foundational, advanced, practical, theoretical
   *
   * @param trait 特质名称
   * @returns 是否具备该特质
   */
  hasTrait(trait: string): boolean {
    return this.traits.includes(trait);
  }

  /**
   * 评估是否满足学习当前概念的前置知识要求
   *
   * @semantic
   * operation: readiness_evaluation
   * cost: medium
   * returns: confidence_score + missing_concepts + reason
   * use_case: learning_path_validation
   *
   * @param knownConcepts 已掌握的概念列表
   * @returns 评估结果
   */
  evaluateReadiness(knownConcepts: Concept[]): ReadinessResult {
    const missing: Concept[] = [];
    let score = 100;

    for (const prereq of this._prerequisites) {
      const isKnown = knownConcepts.some((c) => c.id === prereq.id);
      if (!isKnown) {
        missing.push(prereq);
        score -= 20; // 每缺少一个前置概念扣 20 分
      }
    }

    // 确保分数在 0-100 范围内
    score = Math.max(0, Math.min(100, score));

    const ready = missing.length === 0;
    const reason = ready
      ? `所有前置知识已具备，可以学习 ${this.name}`
      : `缺少 ${missing.length} 个前置概念：${missing.map((c) => c.name).join(', ')}`;

    return {
      ready,
      score,
      missing,
      reason,
    };
  }

  /**
   * 获取节点类型
   *
   * @semantic
   * operation: type_identification
   * cost: low
   *
   * @returns 'Concept'
   */
  getType(): string {
    return 'Concept';
  }
}

/**
 * 主题节点：概念的主题分组
 *
 * 用于按领域或类别组织概念，便于导航和分类。
 *
 * @semantic
 * type: concept_grouping
 * primary_attributes: name, description
 * relations: contains_concept
 */
export class Topic extends BaseNode {
  /**
   * 主题名称
   */
  name: string;

  /**
   * 主题描述
   */
  description: string;

  /**
   * 包含的概念列表
   * @internal 存储概念引用
   */
  private _concepts: Concept[] = [];

  constructor(id: string, name: string, description: string = '') {
    super(id);
    this.name = name;
    this.description = description;
  }

  /**
   * 设置包含的概念
   *
   * @semantic
   * operation: relation_setup
   * relation_type: contains_concept
   *
   * @param concepts 概念列表
   */
  setConcepts(concepts: Concept[]): void {
    this._concepts = concepts;
  }

  /**
   * 获取主题包含的所有概念
   *
   * @semantic
   * relation: contains_concept
   * traversal_cost: low
   * cardinality: many
   * direction: inward
   *
   * @returns 概念列表
   */
  getConcepts(): Concept[] {
    return this._concepts;
  }

  /**
   * 游走函数：根据关系类型获取关联节点
   *
   * @semantic
   * operation: graph_traversal
   * supported_relations: contains_concept
   * traversal_cost: low
   *
   * @param relation 关系类型
   * @returns 关联的节点列表
   */
  linkTo(relation: string): BaseNode[] {
    switch (relation) {
      case 'contains_concept':
        return this._concepts;
      default:
        return [];
    }
  }

  /**
   * 感知函数：判断是否具备某种特质
   *
   * @semantic
   * operation: trait_check
   * cost: low
   *
   * @param trait 特质名称
   * @returns 是否具备该特质
   */
  hasTrait(trait: string): boolean {
    // Topic 可以基于包含的概念判断特质
    if (trait === 'foundational') {
      return this._concepts.some((c) => c.difficulty === 'beginner');
    }
    if (trait === 'advanced') {
      return this._concepts.some((c) => c.difficulty === 'advanced');
    }
    return false;
  }

  /**
   * 获取节点类型
   *
   * @semantic
   * operation: type_identification
   * cost: low
   *
   * @returns 'Topic'
   */
  getType(): string {
    return 'Topic';
  }
}

/**
 * 学习来源节点：概念的学习资源
 *
 * 表示概念的学习来源，如书籍、课程、文章等，支持知识溯源。
 *
 * @semantic
 * type: learning_resource
 * primary_attributes: name, type, url, reliability
 * relations: teaches_concept
 */
export class Source extends BaseNode {
  /**
   * 来源名称
   */
  name: string;

  /**
   * 来源类型
   */
  type: 'book' | 'course' | 'article' | 'documentation' | 'video';

  /**
   * 来源 URL 或位置
   */
  url?: string;

  /**
   * 可靠性评分 (1-5)
   */
  reliability: number;

  /**
   * 教授的概念列表
   * @internal 存储概念引用
   */
  private _concepts: Concept[] = [];

  constructor(
    id: string,
    name: string,
    type: 'book' | 'course' | 'article' | 'documentation' | 'video',
    reliability: number = 3,
    url?: string
  ) {
    super(id);
    this.name = name;
    this.type = type;
    this.reliability = Math.max(1, Math.min(5, reliability));
    this.url = url;
  }

  /**
   * 设置教授的概念
   *
   * @semantic
   * operation: relation_setup
   * relation_type: teaches_concept
   *
   * @param concepts 概念列表
   */
  setConcepts(concepts: Concept[]): void {
    this._concepts = concepts;
  }

  /**
   * 获取来源教授的所有概念
   *
   * @semantic
   * relation: teaches_concept
   * traversal_cost: low
   * cardinality: many
   * direction: inward
   *
   * @returns 概念列表
   */
  getConcepts(): Concept[] {
    return this._concepts;
  }

  /**
   * 游走函数：根据关系类型获取关联节点
   *
   * @semantic
   * operation: graph_traversal
   * supported_relations: teaches_concept
   * traversal_cost: low
   *
   * @param relation 关系类型
   * @returns 关联的节点列表
   */
  linkTo(relation: string): BaseNode[] {
    switch (relation) {
      case 'teaches_concept':
        return this._concepts;
      default:
        return [];
    }
  }

  /**
   * 感知函数：判断是否具备某种特质
   *
   * @semantic
   * operation: trait_check
   * cost: low
   * supported_traits: official, reliable, beginner_friendly
   *
   * @param trait 特质名称
   * @returns 是否具备该特质
   */
  hasTrait(trait: string): boolean {
    if (trait === 'official') {
      return this.type === 'documentation';
    }
    if (trait === 'reliable') {
      return this.reliability >= 4;
    }
    if (trait === 'beginner_friendly') {
      // 可以基于教授的概念判断
      return this._concepts.some((c) => c.difficulty === 'beginner');
    }
    return false;
  }

  /**
   * 获取节点类型
   *
   * @semantic
   * operation: type_identification
   * cost: low
   *
   * @returns 'Source'
   */
  getType(): string {
    return 'Source';
  }
}