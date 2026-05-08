// ── 约束类型 (C) ──

export type ConstraintKind =
	| "hard_constraint"
	| "soft_criterion"
	| "inference_rule"
	| "conflict_policy"
	| "explanation_policy";

export type Constraint = {
	id: string;
	kind: ConstraintKind;
	appliesTo: string[];
	description: string;
	requiredFacts: string[];
	weight?: number;
	priority?: number;
	explanationTemplate: string;
};

export type EvaluableConstraint = Constraint & {
	evaluate: (facts: Record<string, unknown>) => ConstraintResult;
};

export type ConstraintResult = {
	triggered: boolean;
	severity: "high" | "medium" | "low";
	evidence: string;
	explanation: string;
	missingFacts: string[];
};

function isEvaluable(c: Constraint): c is EvaluableConstraint {
	return "evaluate" in c;
}

// ── 约束注册表 ──

const constraints: Constraint[] = [];

export function registerConstraint(c: Constraint): void {
	constraints.push(c);
}

export function getConstraints(): Constraint[] {
	return [...constraints];
}

export function getConstraintById(id: string): Constraint | undefined {
	return constraints.find((c) => c.id === id);
}

export function queryConstraints(opts: {
	intent?: string;
	entityType?: string;
	kind?: ConstraintKind;
}): Constraint[] {
	return constraints.filter((c) => {
		if (opts.entityType && !c.appliesTo.includes(opts.entityType)) return false;
		if (opts.kind && c.kind !== opts.kind) return false;
		if (opts.intent) {
			const intentKeywords: Record<string, string[]> = {
				risk_assessment: [
					"risk",
					"burnout",
					"overload",
					"pressure",
					"dependency",
					"coverage",
				],
				prioritization: ["priority", "pressure"],
			};
			const keywords = intentKeywords[opts.intent] ?? [];
			if (keywords.length > 0) {
				const idAndDesc = `${c.id} ${c.description}`.toLowerCase();
				if (!keywords.some((k) => idAndDesc.includes(k))) return false;
			}
		}
		return true;
	});
}

export function evaluateConstraint(
	id: string,
	facts: Record<string, unknown>,
): ConstraintResult | { error: string } {
	const c = constraints.find((c) => c.id === id);
	if (!c) return { error: `约束 '${id}' 未找到` };
	if (!isEvaluable(c))
		return { error: `约束 '${id}' 仅是元数据，不可执行` };

	const missing = c.requiredFacts.filter((f) => !(f in facts));
	if (missing.length > 0) {
		return {
			triggered: false,
			severity: "low",
			evidence: "",
			explanation: "",
			missingFacts: missing,
		};
	}

	return c.evaluate(facts);
}

export function clearConstraints(): void {
	constraints.length = 0;
}

