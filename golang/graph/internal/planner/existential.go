package planner

import "github.com/lucky-byte/graph/internal/ir"

func buildExistentialScopes(steps []*ir.TraversalStep) []*ir.ExistentialScope {
	scopes := make([]*ir.ExistentialScope, 0)
	idx := 0
	for _, step := range steps {
		if step == nil {
			continue
		}
		switch step.Require {
		case ir.RequireExists:
			step.ScopeIndex = idx
			scopes = append(scopes, &ir.ExistentialScope{
				Type:             ir.ScopeExists,
				BoundaryAlias:    step.ToAlias,
				ContainedAliases: []string{step.ToAlias},
				Correlation: &ir.CorrelationRef{
					ParentAlias: step.FromAlias,
					ParentField: step.Relation.FromField,
					ChildAlias:  step.ToAlias,
					ChildField:  step.Relation.ToField,
				},
			})
			idx++
		case ir.RequireNone:
			step.ScopeIndex = idx
			scopes = append(scopes, &ir.ExistentialScope{
				Type:             ir.ScopeNotExists,
				BoundaryAlias:    step.ToAlias,
				ContainedAliases: []string{step.ToAlias},
				Correlation: &ir.CorrelationRef{
					ParentAlias: step.FromAlias,
					ParentField: step.Relation.FromField,
					ChildAlias:  step.ToAlias,
					ChildField:  step.Relation.ToField,
				},
			})
			idx++
		default:
			step.ScopeIndex = -1
		}
	}
	return scopes
}
