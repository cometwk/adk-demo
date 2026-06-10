package ir

import "fmt"

// TraversalPlan 是 Graph Traversal Planner 的输出 IR。
type TraversalPlan struct {
	ID               string                     `json:"id"`
	RootAlias        string                     `json:"root_alias"`
	RootTable        string                     `json:"root_table"`
	RootPrimaryKey   string                     `json:"root_primary_key"`
	RootPredicates   []*Predicate               `json:"root_predicates"`
	AliasBindings    map[string]*AliasBinding   `json:"alias_bindings"`
	Steps            []*TraversalStep           `json:"steps"`
	ExistentialScopes []*ExistentialScope       `json:"existential_scopes"`
	HasFanOut        bool                       `json:"has_fan_out"`
}

// AliasBinding 记录一个 alias 的完整绑定信息。
type AliasBinding struct {
	Alias        string    `json:"alias"`
	Table        string    `json:"table"`
	ParentAlias  string    `json:"parent_alias"`
	RelationName string    `json:"relation_name"`
	ScopeType    ScopeType `json:"scope_type"`
}

// TraversalStep 描述单步遍历的完整语义。
type TraversalStep struct {
	FromAlias     string           `json:"from_alias"`
	ToAlias       string           `json:"to_alias"`
	Require       RequireType      `json:"require"`
	Relation      *RelationSchema  `json:"relation"`
	JoinCondition *JoinCondition   `json:"join_condition"`
	Predicates    []*Predicate     `json:"predicates"`
	ScopeIndex    int              `json:"scope_index"`
	IsFanOut      bool             `json:"is_fan_out"`
}

// JoinCondition 描述两个 alias 之间的 JOIN 条件。
type JoinCondition struct {
	LeftAlias   string `json:"left_alias"`
	LeftField   string `json:"left_field"`
	RightAlias  string `json:"right_alias"`
	RightField  string `json:"right_field"`
}

// ExistentialScope 定义 EXISTS / NOT EXISTS 子查询边界。
type ExistentialScope struct {
	Type             ScopeType       `json:"type"`
	BoundaryAlias    string          `json:"boundary_alias"`
	ContainedAliases []string        `json:"contained_aliases"`
	InnerSteps       []*TraversalStep `json:"inner_steps,omitempty"`
	Correlation      *CorrelationRef `json:"correlation"`
}

// CorrelationRef 描述子查询与父作用域的关联引用。
type CorrelationRef struct {
	ParentAlias string `json:"parent_alias"`
	ParentField string `json:"parent_field"`
	ChildAlias  string `json:"child_alias"`
	ChildField  string `json:"child_field"`
}

// Predicate 是 IR 中的谓词表示。
type Predicate struct {
	Alias string `json:"alias"`
	Field string `json:"field"`
	Op    string `json:"op"`
	Value any    `json:"value"`
}

// RelationSchema 是全局注册的边定义。
type RelationSchema struct {
	Name        string `json:"name"`
	FromTable   string `json:"from_table"`
	FromField   string `json:"from_field"`
	ToTable     string `json:"to_table"`
	ToField     string `json:"to_field"`
	Cardinality string `json:"cardinality"`
}

// TableSchema 记录数据库表的元数据。
type TableSchema struct {
	TableName  string `json:"table_name"`
	PrimaryKey string `json:"primary_key"`
}

// QueryProjection 是 Projection Planner 的输出。
type QueryProjection struct {
	SelectItems        []*SelectItem        `json:"select_items"`
	OrderByItems       []*OrderByItem       `json:"order_by_items"`
	Limit              int                  `json:"limit"`
	Offset             int                  `json:"offset"`
	PaginationStrategy PaginationStrategy   `json:"pagination_strategy"`
}

// SelectItem 描述一个字段选择项。
type SelectItem struct {
	Alias  string   `json:"alias"`
	Fields []string `json:"fields"`
	As     string   `json:"as"`
}

// OrderByItem 描述一个排序项。
type OrderByItem struct {
	Alias     string `json:"alias"`
	Field     string `json:"field"`
	Direction string `json:"direction"`
}

// ParseRequireType 将 DSL 字符串转为 RequireType。
func ParseRequireType(s string) (RequireType, error) {
	switch s {
	case "", "always":
		return RequireAlways, nil
	case "optional":
		return RequireOptional, nil
	case "exists":
		return RequireExists, nil
	case "none":
		return RequireNone, nil
	default:
		return 0, fmt.Errorf("invalid require type: %s", s)
	}
}
