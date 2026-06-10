package errors

import (
	"errors"
	"fmt"
)

// PlanError 携带 Planner 校验错误的上下文。
type PlanError struct {
	Code    string
	Message string
	Step    int
	Alias   string
	Detail  string
}

func (e *PlanError) Error() string {
	if e.Step >= 0 {
		return fmt.Sprintf("[%s] step=%d alias=%s: %s", e.Code, e.Step, e.Alias, e.Message)
	}
	return fmt.Sprintf("[%s] alias=%s: %s", e.Code, e.Alias, e.Message)
}

// ProjectionError 携带 Projection Planner 校验错误的上下文。
type ProjectionError struct {
	Code    string
	Message string
	Alias   string
}

func (e *ProjectionError) Error() string {
	if e.Alias != "" {
		return fmt.Sprintf("[%s] alias=%s: %s", e.Code, e.Alias, e.Message)
	}
	return fmt.Sprintf("[%s] %s", e.Code, e.Message)
}

// CompilerError 携带 SQL Compiler 错误的上下文。
type CompilerError struct {
	Code    string
	Message string
	Detail  string
}

func (e *CompilerError) Error() string {
	if e.Detail != "" {
		return fmt.Sprintf("[%s] %s (%s)", e.Code, e.Message, e.Detail)
	}
	return fmt.Sprintf("[%s] %s", e.Code, e.Message)
}

// Sentinel errors for Planner (V1–V10).
var (
	ErrEmptyMatchType          = errors.New("match.type must not be empty")
	ErrEmptyMatchAlias         = errors.New("match.alias must not be empty")
	ErrUnknownTable            = errors.New("match.type not found in table schema registry")
	ErrUndefinedAlias          = errors.New("traverse.from references undefined alias")
	ErrUnknownRelation         = errors.New("traverse.relation not found in registry")
	ErrRelationTableMismatch   = errors.New("traverse.from alias table does not match relation.from_table")
	ErrDuplicateAlias          = errors.New("traverse.alias is already defined")
	ErrInvalidRequire          = errors.New("traverse.require must be one of: always, optional, exists, none")
	ErrTraverseFromExistential = errors.New("V1: cannot traverse from an existential alias (exists/none)")
	ErrCyclicTraversal         = errors.New("cyclic traversal detected: table appears twice in the same path")
	ErrExistentialInnerNotAlways = errors.New("inner step of existential scope must use require: always")
	ErrEmptyInValues           = errors.New("where predicate 'in'/'not_in' requires a non-empty array")
	ErrTraverseStepLimit       = errors.New("traverse step count exceeds limit")
)

// Sentinel errors for Projection Planner (P1–P5).
var (
	ErrSelectFromExistential = errors.New("cannot SELECT from existential alias (require: exists/none)")
	ErrOrderByExistential    = errors.New("cannot ORDER BY existential alias (require: exists/none)")
	ErrInvalidDirection      = errors.New("order_by.direction must be 'asc' or 'desc'")
	ErrEmptyFields           = errors.New("select.fields must not be empty")
	ErrLimitExceeded         = errors.New("limit exceeds maximum allowed value")
)

// Sentinel errors for Compiler.
var (
	ErrUnsupportedOp = errors.New("unsupported predicate operator")
)

// Sentinel errors for PlanCache and limits.
var (
	ErrPlanCacheFull = errors.New("plan cache is full")
)

// NewPlanError wraps a sentinel with structured context.
func NewPlanError(code string, err error, step int, alias string) *PlanError {
	return &PlanError{
		Code:    code,
		Message: err.Error(),
		Step:    step,
		Alias:   alias,
	}
}

// NewProjectionError wraps a sentinel with structured context.
func NewProjectionError(code string, err error, alias string) *ProjectionError {
	return &ProjectionError{
		Code:    code,
		Message: err.Error(),
		Alias:   alias,
	}
}

// NewCompilerError creates a compiler error.
func NewCompilerError(code, message, detail string) *CompilerError {
	return &CompilerError{Code: code, Message: message, Detail: detail}
}
