package ir

// ScopeType 标注 alias 所在的作用域类型。
type ScopeType int

const (
	// ScopeMaterialize 表示 alias 的行被物化（always / optional），对应 INNER/LEFT JOIN。
	ScopeMaterialize ScopeType = iota
	// ScopeExists 表示 alias 处于 EXISTS 子查询边界内。
	ScopeExists
	// ScopeNotExists 表示 alias 处于 NOT EXISTS 子查询边界内。
	ScopeNotExists
)

func (s ScopeType) String() string {
	switch s {
	case ScopeMaterialize:
		return "materialize"
	case ScopeExists:
		return "exists"
	case ScopeNotExists:
		return "not_exists"
	default:
		return "unknown"
	}
}

// RequireType 决定遍历步骤对父节点的影响方式。
type RequireType int

const (
	RequireAlways RequireType = iota
	RequireOptional
	RequireExists
	RequireNone
)

func (r RequireType) String() string {
	switch r {
	case RequireAlways:
		return "always"
	case RequireOptional:
		return "optional"
	case RequireExists:
		return "exists"
	case RequireNone:
		return "none"
	default:
		return "unknown"
	}
}

// PaginationStrategy 标注 Query 模式的分页策略。
type PaginationStrategy int

const (
	PaginateDirect PaginationStrategy = iota
	PaginateRootFirst
)

func (p PaginationStrategy) String() string {
	switch p {
	case PaginateDirect:
		return "direct"
	case PaginateRootFirst:
		return "root_first"
	default:
		return "unknown"
	}
}
