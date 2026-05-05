import {
	registerConstraint,
	type EvaluableConstraint,
} from "../../ontology/constraints";

// ── 图书馆借书场景约束 ──

export function registerLibraryConstraints(): void {
	registerConstraint({
		id: "borrow_limit_3",
		kind: "hard_constraint",
		appliesTo: ["Reader"],
		description: "每个读者最多只能借 3 本书",
		requiredFacts: ["borrowedCount"],
		explanationTemplate: "读者已借 {borrowedCount} 本书，{status}",
		evaluate(facts) {
			const borrowedCount = facts.borrowedCount as number;
			const triggered = borrowedCount >= 3;
			return {
				triggered,
				severity: triggered ? "high" : "low",
				evidence: `borrowedCount=${borrowedCount}`,
				explanation: triggered
					? `已借 ${borrowedCount} 本书，达到上限`
					: `已借 ${borrowedCount} 本书，未达上限`,
				missingFacts: [],
			};
		},
	} as EvaluableConstraint);

	registerConstraint({
		id: "new_book_restriction",
		kind: "hard_constraint",
		appliesTo: ["Book"],
		description: "新书（上架不满 7 天）不能外借",
		requiredFacts: ["daysOnShelf"],
		explanationTemplate: "书籍上架 {daysOnShelf} 天，{status}",
		evaluate(facts) {
			const daysOnShelf = facts.daysOnShelf as number;
			const triggered = daysOnShelf < 7;
			return {
				triggered,
				severity: triggered ? "high" : "low",
				evidence: `daysOnShelf=${daysOnShelf}`,
				explanation: triggered
					? `上架仅 ${daysOnShelf} 天，属于新书，不可外借`
					: `上架 ${daysOnShelf} 天，可外借`,
				missingFacts: [],
			};
		},
	} as EvaluableConstraint);

	registerConstraint({
		id: "overdue_ban",
		kind: "hard_constraint",
		appliesTo: ["Reader"],
		description: "有逾期未还书的读者不能借新书",
		requiredFacts: ["hasOverdue", "bookIsNew"],
		explanationTemplate: "读者{overdueStatus}，书籍{bookStatus}，{result}",
		evaluate(facts) {
			const hasOverdue = facts.hasOverdue as boolean;
			const bookIsNew = facts.bookIsNew as boolean;
			const triggered = hasOverdue && bookIsNew;
			return {
				triggered,
				severity: triggered ? "high" : "low",
				evidence: `hasOverdue=${hasOverdue}, bookIsNew=${bookIsNew}`,
				explanation: triggered
					? "有逾期记录且书为新书，不能借"
					: hasOverdue
						? "有逾期记录，但书非新书，可借"
						: "无逾期记录，可借",
				missingFacts: [],
			};
		},
	} as EvaluableConstraint);
}