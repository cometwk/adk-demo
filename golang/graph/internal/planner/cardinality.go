package planner

import "github.com/lucky-byte/graph/internal/ir"

func analyzeCardinality(steps []*ir.TraversalStep, bindings map[string]*ir.AliasBinding) bool {
	hasFanOut := false
	for _, step := range steps {
		if step == nil {
			continue
		}
		binding := bindings[step.ToAlias]
		if binding == nil {
			step.IsFanOut = false
			continue
		}
		if binding.ScopeType == ir.ScopeMaterialize &&
			(step.Relation.Cardinality == "one_to_many" || step.Relation.Cardinality == "many_to_many") {
			step.IsFanOut = true
			hasFanOut = true
		} else {
			step.IsFanOut = false
		}
	}
	return hasFanOut
}
