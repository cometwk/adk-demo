// ─────────────────────────────────────────────────────────────────────────────────
// V5 决策支持类型：DecisionTask, Evidence, CandidateAnswer, Uncertainty
// ─────────────────────────────────────────────────────────────────────────────────

export type DecisionIntent =
	| "risk_assessment"
	| "prioritization"
	| "diagnosis"
	| "recommendation"
	| "unknown";

// ─────────────────────────────────────────────────────────────────────────────────
// Evidence: 证据记录
// ─────────────────────────────────────────────────────────────────────────────────

export type EvidenceSource =
	| "node"
	| "edge"
	| "method"
	| "rule"
	| "aggregate"
	| "user";

export type Evidence = {
	id: string;
	source: EvidenceSource;
	statement: string;
	entityIds: string[];
	relationTypes?: string[];
	constraintIds?: string[];
	confidence: number;
};

// ─────────────────────────────────────────────────────────────────────────────────
// CandidateAnswer: 候选答案
// ─────────────────────────────────────────────────────────────────────────────────

export type CandidateAnswer = {
	id: string;
	answer: string;
	summary: string;
	score?: number;
	confidence: number;
	supportingEvidenceIds: string[];
	opposingEvidenceIds: string[];
	triggeredConstraintIds: string[];
};

// ─────────────────────────────────────────────────────────────────────────────────
// Uncertainty: 不确定性记录
// ─────────────────────────────────────────────────────────────────────────────────

export type UncertaintyImpact = "low" | "medium" | "high";

export type Uncertainty = {
	id: string;
	missingFact: string;
	impact: UncertaintyImpact;
	suggestedQuery?: string;
};

// ─────────────────────────────────────────────────────────────────────────────────
// DecisionTask: 决策任务模型
// ─────────────────────────────────────────────────────────────────────────────────

export type DecisionTask = {
	question: string;
	intent: DecisionIntent;
	entryEntities: string[];
	criteria: string[];
	candidateAnswers: CandidateAnswer[];
	evidence: Evidence[];
	uncertainty: Uncertainty[];
};

// ─────────────────────────────────────────────────────────────────────────────────
// DecisionOutput: 最终决策输出结构
// ─────────────────────────────────────────────────────────────────────────────────

export type DecisionOutput = {
	recommendation: {
		answer: string;
		summary: string;
		confidence: number;
		supportingEvidenceIds: string[];
		triggeredConstraintIds: string[];
	};
	alternatives: Array<{
		answer: string;
		summary: string;
		confidence: number;
		reasonForNotChoosing: string;
	}>;
	evidence: Evidence[];
	triggeredConstraints: string[];
	uncertainty: Uncertainty[];
	nextQueries: string[];
};

// ─────────────────────────────────────────────────────────────────────────────────
// DecisionWorkspace: 单次运行时的决策工作空间
// 用于在 tool calls 之间维护稳定的 ID 和状态
// ─────────────────────────────────────────────────────────────────────────────────

export class DecisionWorkspace {
	private evidence: Map<string, Evidence> = new Map();
	private candidates: Map<string, CandidateAnswer> = new Map();
	private uncertainty: Map<string, Uncertainty> = new Map();
	private selectedCriteria: string[] = [];
	private question: string = "";
	private intent: DecisionIntent = "unknown";
	private entryEntities: string[] = [];

	private nextEvidenceId = 1;
	private nextCandidateId = 1;
	private nextUncertaintyId = 1;

	setup(
		question: string,
		intent: DecisionIntent,
		entryEntities: string[],
	): void {
		this.question = question;
		this.intent = intent;
		this.entryEntities = entryEntities;
	}

	getQuestion(): string {
		return this.question;
	}

	getIntent(): DecisionIntent {
		return this.intent;
	}

	getEntryEntities(): string[] {
		return this.entryEntities;
	}

	// Evidence 操作
	recordEvidence(evidence: Omit<Evidence, "id">): Evidence {
		const id = `evidence_${this.nextEvidenceId++}`;
		const fullEvidence: Evidence = { ...evidence, id };
		this.evidence.set(id, fullEvidence);
		return fullEvidence;
	}

	getEvidence(id: string): Evidence | undefined {
		return this.evidence.get(id);
	}

	getAllEvidence(): Evidence[] {
		return Array.from(this.evidence.values());
	}

	// Candidate 操作
	proposeCandidate(candidate: Omit<CandidateAnswer, "id">): CandidateAnswer {
		const id = `candidate_${this.nextCandidateId++}`;
		const fullCandidate: CandidateAnswer = { ...candidate, id };
		this.candidates.set(id, fullCandidate);
		return fullCandidate;
	}

	getCandidate(id: string): CandidateAnswer | undefined {
		return this.candidates.get(id);
	}

	getAllCandidates(): CandidateAnswer[] {
		return Array.from(this.candidates.values());
	}

	updateCandidate(id: string, updates: Partial<CandidateAnswer>): boolean {
		const candidate = this.candidates.get(id);
		if (!candidate) return false;
		this.candidates.set(id, { ...candidate, ...updates });
		return true;
	}

	// Uncertainty 操作
	addUncertainty(uncertainty: Omit<Uncertainty, "id">): Uncertainty {
		const id = `uncertainty_${this.nextUncertaintyId++}`;
		const fullUncertainty: Uncertainty = { ...uncertainty, id };
		this.uncertainty.set(id, fullUncertainty);
		return fullUncertainty;
	}

	getAllUncertainty(): Uncertainty[] {
		return Array.from(this.uncertainty.values());
	}

	// Criteria 操作
	setCriteria(criteria: string[]): void {
		this.selectedCriteria = criteria;
	}

	getCriteria(): string[] {
		return this.selectedCriteria;
	}

	// 清理（用于测试）
	clear(): void {
		this.evidence.clear();
		this.candidates.clear();
		this.uncertainty.clear();
		this.selectedCriteria = [];
		this.question = "";
		this.intent = "unknown";
		this.entryEntities = [];
		this.nextEvidenceId = 1;
		this.nextCandidateId = 1;
		this.nextUncertaintyId = 1;
	}
}
