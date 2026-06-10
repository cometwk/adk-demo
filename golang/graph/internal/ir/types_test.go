package ir

import (
	"encoding/json"
	"testing"
)

func TestExistentialScopeJSONRoundTrip(t *testing.T) {
	tests := []struct {
		name  string
		scope ExistentialScope
	}{
		{
			name: "no inner steps (backward compatible)",
			scope: ExistentialScope{
				Type:             ScopeNotExists,
				BoundaryAlias:    "od",
				ContainedAliases: []string{"od"},
				InnerSteps:       nil,
				Correlation: &CorrelationRef{
					ParentAlias: "m",
					ParentField: "id",
					ChildAlias:  "od",
					ChildField:  "merch_id",
				},
			},
		},
		{
			name: "with inner steps",
			scope: ExistentialScope{
				Type:             ScopeNotExists,
				BoundaryAlias:    "od",
				ContainedAliases: []string{"od", "d"},
				InnerSteps: []*TraversalStep{
					{
						FromAlias: "od",
						ToAlias:   "d",
						Require:   RequireAlways,
						Relation: &RelationSchema{
							Name:        "has_detail",
							FromTable:   "order_daily",
							FromField:   "id",
							ToTable:     "order_detail",
							ToField:     "order_id",
							Cardinality: "one_to_many",
						},
						JoinCondition: &JoinCondition{
							LeftAlias:  "od",
							LeftField:  "id",
							RightAlias: "d",
							RightField: "order_id",
						},
						ScopeIndex: 0,
						IsFanOut:   false,
					},
				},
				Correlation: &CorrelationRef{
					ParentAlias: "m",
					ParentField: "id",
					ChildAlias:  "od",
					ChildField:  "merch_id",
				},
			},
		},
		{
			name: "exists scope with inner steps",
			scope: ExistentialScope{
				Type:             ScopeExists,
				BoundaryAlias:    "od",
				ContainedAliases: []string{"od", "d", "p"},
				InnerSteps: []*TraversalStep{
					{
						FromAlias: "od",
						ToAlias:   "d",
						Require:   RequireAlways,
						Relation: &RelationSchema{
							Name:        "has_detail",
							FromTable:   "order_daily",
							FromField:   "id",
							ToTable:     "order_detail",
							ToField:     "order_id",
							Cardinality: "one_to_many",
						},
						JoinCondition: &JoinCondition{
							LeftAlias:  "od",
							LeftField:  "id",
							RightAlias: "d",
							RightField: "order_id",
						},
						ScopeIndex: 0,
						IsFanOut:   false,
					},
					{
						FromAlias: "d",
						ToAlias:   "p",
						Require:   RequireAlways,
						Relation: &RelationSchema{
							Name:        "has_payment",
							FromTable:   "order_detail",
							FromField:   "id",
							ToTable:     "payment",
							ToField:     "detail_id",
							Cardinality: "many_to_one",
						},
						JoinCondition: &JoinCondition{
							LeftAlias:  "d",
							LeftField:  "id",
							RightAlias: "p",
							RightField: "detail_id",
						},
						ScopeIndex: 0,
						IsFanOut:   false,
					},
				},
				Correlation: &CorrelationRef{
					ParentAlias: "m",
					ParentField: "id",
					ChildAlias:  "od",
					ChildField:  "merch_id",
				},
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			data, err := json.Marshal(tt.scope)
			if err != nil {
				t.Fatalf("marshal: %v", err)
			}

			var got ExistentialScope
			if err := json.Unmarshal(data, &got); err != nil {
				t.Fatalf("unmarshal: %v", err)
			}

			// 比较关键字段
			if got.Type != tt.scope.Type {
				t.Errorf("Type: got %v, want %v", got.Type, tt.scope.Type)
			}
			if got.BoundaryAlias != tt.scope.BoundaryAlias {
				t.Errorf("BoundaryAlias: got %q, want %q", got.BoundaryAlias, tt.scope.BoundaryAlias)
			}
			if len(got.ContainedAliases) != len(tt.scope.ContainedAliases) {
				t.Errorf("ContainedAliases length: got %d, want %d", len(got.ContainedAliases), len(tt.scope.ContainedAliases))
			} else {
				for i, alias := range got.ContainedAliases {
					if alias != tt.scope.ContainedAliases[i] {
						t.Errorf("ContainedAliases[%d]: got %q, want %q", i, alias, tt.scope.ContainedAliases[i])
					}
				}
			}
			if len(got.InnerSteps) != len(tt.scope.InnerSteps) {
				t.Errorf("InnerSteps length: got %d, want %d", len(got.InnerSteps), len(tt.scope.InnerSteps))
			} else {
				for i, step := range got.InnerSteps {
					wantStep := tt.scope.InnerSteps[i]
					if step.FromAlias != wantStep.FromAlias {
						t.Errorf("InnerSteps[%d].FromAlias: got %q, want %q", i, step.FromAlias, wantStep.FromAlias)
					}
					if step.ToAlias != wantStep.ToAlias {
						t.Errorf("InnerSteps[%d].ToAlias: got %q, want %q", i, step.ToAlias, wantStep.ToAlias)
					}
					if step.Require != wantStep.Require {
						t.Errorf("InnerSteps[%d].Require: got %v, want %v", i, step.Require, wantStep.Require)
					}
					if step.ScopeIndex != wantStep.ScopeIndex {
						t.Errorf("InnerSteps[%d].ScopeIndex: got %d, want %d", i, step.ScopeIndex, wantStep.ScopeIndex)
					}
				}
			}
		})
	}
}

func TestExistentialScopeOmitEmptyInnerSteps(t *testing.T) {
	// InnerSteps 为 nil 时，JSON 序列化应省略 inner_steps 字段（omitempty）
	scope := ExistentialScope{
		Type:             ScopeNotExists,
		BoundaryAlias:    "od",
		ContainedAliases: []string{"od"},
		InnerSteps:       nil,
		Correlation: &CorrelationRef{
			ParentAlias: "m",
			ParentField: "id",
			ChildAlias:  "od",
			ChildField:  "merch_id",
		},
	}

	data, err := json.Marshal(scope)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	var raw map[string]any
	if err := json.Unmarshal(data, &raw); err != nil {
		t.Fatalf("unmarshal to map: %v", err)
	}

	if _, exists := raw["inner_steps"]; exists {
		t.Errorf("inner_steps should be omitted when nil, got JSON: %s", string(data))
	}
}

func TestTraversalPlanJSONRoundTripWithInnerSteps(t *testing.T) {
	// 完整 TraversalPlan 包含 InnerSteps 的序列化 round-trip
	plan := TraversalPlan{
		ID:               "test_plan",
		RootAlias:        "m",
		RootTable:        "merch",
		RootPrimaryKey:   "id",
		AliasBindings:    map[string]*AliasBinding{
			"m":  {Alias: "m", Table: "merch", ScopeType: ScopeMaterialize},
			"od": {Alias: "od", Table: "order_daily", ParentAlias: "m", ScopeType: ScopeNotExists},
			"d":  {Alias: "d", Table: "order_detail", ParentAlias: "od", ScopeType: ScopeNotExists},
		},
		Steps: []*TraversalStep{
			{FromAlias: "m", ToAlias: "od", Require: RequireNone, ScopeIndex: 0},
			{FromAlias: "od", ToAlias: "d", Require: RequireAlways, ScopeIndex: 0},
		},
		ExistentialScopes: []*ExistentialScope{
			{
				Type:             ScopeNotExists,
				BoundaryAlias:    "od",
				ContainedAliases: []string{"od", "d"},
				InnerSteps: []*TraversalStep{
					{FromAlias: "od", ToAlias: "d", Require: RequireAlways, ScopeIndex: 0},
				},
				Correlation: &CorrelationRef{
					ParentAlias: "m",
					ParentField: "id",
					ChildAlias:  "od",
					ChildField:  "merch_id",
				},
			},
		},
		HasFanOut: false,
	}

	data, err := json.Marshal(plan)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	var got TraversalPlan
	if err := json.Unmarshal(data, &got); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	if len(got.ExistentialScopes) != 1 {
		t.Fatalf("ExistentialScopes length: got %d, want 1", len(got.ExistentialScopes))
	}
	scope := got.ExistentialScopes[0]
	if scope.Type != ScopeNotExists {
		t.Errorf("Scope Type: got %v, want %v", scope.Type, ScopeNotExists)
	}
	if len(scope.InnerSteps) != 1 {
		t.Fatalf("InnerSteps length: got %d, want 1", len(scope.InnerSteps))
	}
	if scope.InnerSteps[0].ToAlias != "d" {
		t.Errorf("InnerSteps[0].ToAlias: got %q, want %q", scope.InnerSteps[0].ToAlias, "d")
	}
	if len(scope.ContainedAliases) != 2 {
		t.Errorf("ContainedAliases length: got %d, want 2", len(scope.ContainedAliases))
	}
}
