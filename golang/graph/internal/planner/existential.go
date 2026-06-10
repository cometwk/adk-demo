package planner

import "github.com/lucky-byte/graph/internal/ir"

func buildExistentialScopes(steps []*ir.TraversalStep) []*ir.ExistentialScope {
	scopes := make([]*ir.ExistentialScope, 0)
	// scopeMap: alias → scopeIndex，用于将 inner step 归入正确的 scope
	scopeMap := make(map[string]int)

	for _, step := range steps {
		if step == nil {
			continue
		}

		// 检查 from alias 是否已在某个 existential scope 内
		if scopeIdx, inScope := scopeMap[step.FromAlias]; inScope {
			// inner step：归入已有 scope
			scope := scopes[scopeIdx]
			step.ScopeIndex = scopeIdx
			scope.ContainedAliases = append(scope.ContainedAliases, step.ToAlias)
			scope.InnerSteps = append(scope.InnerSteps, step)
			scopeMap[step.ToAlias] = scopeIdx
			continue
		}

		// 新建 scope（boundary step）
		switch step.Require {
		case ir.RequireExists:
			step.ScopeIndex = len(scopes)
			scope := &ir.ExistentialScope{
				Type:             ir.ScopeExists,
				BoundaryAlias:    step.ToAlias,
				ContainedAliases: []string{step.ToAlias},
				Correlation: &ir.CorrelationRef{
					ParentAlias: step.FromAlias,
					ParentField: step.Relation.FromField,
					ChildAlias:  step.ToAlias,
					ChildField:  step.Relation.ToField,
				},
			}
			scopes = append(scopes, scope)
			scopeMap[step.ToAlias] = step.ScopeIndex
		case ir.RequireNone:
			step.ScopeIndex = len(scopes)
			scope := &ir.ExistentialScope{
				Type:             ir.ScopeNotExists,
				BoundaryAlias:    step.ToAlias,
				ContainedAliases: []string{step.ToAlias},
				Correlation: &ir.CorrelationRef{
					ParentAlias: step.FromAlias,
					ParentField: step.Relation.FromField,
					ChildAlias:  step.ToAlias,
					ChildField:  step.Relation.ToField,
				},
			}
			scopes = append(scopes, scope)
			scopeMap[step.ToAlias] = step.ScopeIndex
		default:
			step.ScopeIndex = -1
		}
	}
	return scopes
}
