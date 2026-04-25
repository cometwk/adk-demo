// ── Decision support artifacts ──

export type Evidence = {
	id: string;
	sourceType: "property" | "method_result" | "rule_evaluation" | "aggregation";
	entityIds: string[];
	relatedRuleIds: string[];
	content: string;
	confidence: number;
};

export type CandidateAnswer = {
	id: string;
	label: string;
	description: string;
	supportingEvidenceIds: string[];
	score?: number;
};

export type Uncertainty = {
	id: string;
	description: string;
	impact: "high" | "medium" | "low";
	missingFacts: string[];
	nextQuery: string;
};

export type DecisionRecommendation = {
	candidateId: string;
	confidence: number;
	explanation: string;
};

export type DecisionOutput = {
	goal: string;
	recommendation: DecisionRecommendation;
	alternatives: CandidateAnswer[];
	evidence: Evidence[];
	triggeredRules: string[];
	uncertainties: Uncertainty[];
	nextQueries: string[];
};

// ── Per-run workspace ──

let nextId = 0;
function genId(prefix: string): string {
	return `${prefix}_${++nextId}`;
}

export class DecisionWorkspace {
	private candidates = new Map<string, CandidateAnswer>();
	private evidence = new Map<string, Evidence>();
	private uncertainties = new Map<string, Uncertainty>();
	private triggeredRuleIds = new Set<string>();

	addCandidate(label: string, description: string): CandidateAnswer {
		const id = genId("cand");
		const candidate: CandidateAnswer = {
			id,
			label,
			description,
			supportingEvidenceIds: [],
		};
		this.candidates.set(id, candidate);
		return candidate;
	}

	getCandidate(id: string): CandidateAnswer | undefined {
		return this.candidates.get(id);
	}

	listCandidates(): CandidateAnswer[] {
		return [...this.candidates.values()];
	}

	addEvidence(input: Omit<Evidence, "id">): Evidence {
		const id = genId("ev");
		const ev: Evidence = { id, ...input };
		this.evidence.set(id, ev);
		return ev;
	}

	getEvidence(id: string): Evidence | undefined {
		return this.evidence.get(id);
	}

	listEvidence(): Evidence[] {
		return [...this.evidence.values()];
	}

	linkEvidenceToCandidate(candidateId: string, evidenceId: string): boolean {
		const candidate = this.candidates.get(candidateId);
		const ev = this.evidence.get(evidenceId);
		if (!candidate || !ev) return false;
		if (!candidate.supportingEvidenceIds.includes(evidenceId)) {
			candidate.supportingEvidenceIds.push(evidenceId);
		}
		return true;
	}

	addUncertainty(input: Omit<Uncertainty, "id">): Uncertainty {
		const id = genId("unc");
		const unc: Uncertainty = { id, ...input };
		this.uncertainties.set(id, unc);
		return unc;
	}

	listUncertainties(): Uncertainty[] {
		return [...this.uncertainties.values()];
	}

	addTriggeredRule(ruleId: string): void {
		this.triggeredRuleIds.add(ruleId);
	}

	listTriggeredRules(): string[] {
		return [...this.triggeredRuleIds];
	}

	setCandidateScore(candidateId: string, score: number): boolean {
		const candidate = this.candidates.get(candidateId);
		if (!candidate) return false;
		candidate.score = score;
		return true;
	}
}

export function resetIdCounter(): void {
	nextId = 0;
}
