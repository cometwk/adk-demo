package dsl

// GraphTraversalQuery 是 Planner 的完整输入，对应 DSL 的 match + traverse 部分。
type GraphTraversalQuery struct {
	Match    *MatchClause      `json:"match"`
	Traverse []*TraverseClause `json:"traverse"`
}

// MatchClause 定义 Traversal 起点（Root Scope）。
type MatchClause struct {
	Type  string            `json:"type"`
	Alias string            `json:"alias"`
	Where []*WherePredicate `json:"where"`
}

// TraverseClause 定义单步遍历。
type TraverseClause struct {
	From     string            `json:"from"`
	Relation string            `json:"relation"`
	Alias    string            `json:"alias"`
	Require  string            `json:"require"`
	Where    []*WherePredicate `json:"where"`
}

// WherePredicate 是通用谓词结构，match.where 和 traverse[].where 共享。
type WherePredicate struct {
	Field string `json:"field"`
	Op    string `json:"op"`
	Value any    `json:"value"`
}

// QueryReturnDef 对应 DSL 中 return 的 Query 模式部分。
type QueryReturnDef struct {
	Select  []*SelectDef   `json:"select"`
	OrderBy []*OrderByDef  `json:"order_by"`
	Limit   *int           `json:"limit"`
	Offset  *int           `json:"offset"`
}

// SelectDef 是 return.select 项。
type SelectDef struct {
	Alias  string   `json:"alias"`
	Fields []string `json:"fields"`
	As     string   `json:"as"`
}

// OrderByDef 是 return.order_by 项。
type OrderByDef struct {
	Alias     string `json:"alias"`
	Field     string `json:"field"`
	Direction string `json:"direction"`
}
