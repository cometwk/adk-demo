import { z } from "zod";
import {
	AgentMethodRegistry,
	agentMethod,
	agentProperty,
	type MethodSchema,
} from "../../runtime/decorator";
import { BaseNode, Graph } from "../../runtime/graph";

// ── 场景：图书馆借书决策 ─────────────────────────────────────────

export class Reader extends BaseNode {
	@agentProperty({ returns: "number", description: "已借书籍数量" })
	borrowedCount: number;

	@agentProperty({ returns: "boolean", description: "是否有逾期未还的书" })
	hasOverdue: boolean;

	@agentProperty({ returns: "string[]", description: "已借书籍列表" })
	borrowedBooks: string[];

	@agentProperty({ returns: "string[]", description: "逾期书籍列表" })
	overdueBooks: string[];

	constructor(
		id: string,
		borrowedCount: number,
		hasOverdue: boolean,
		borrowedBooks: string[] = [],
		overdueBooks: string[] = [],
	) {
		super(id);
		this.borrowedCount = borrowedCount;
		this.hasOverdue = hasOverdue;
		this.borrowedBooks = borrowedBooks;
		this.overdueBooks = overdueBooks;
	}

	@agentMethod({
		returns: "{ canBorrow: boolean; remaining: number }",
		description: "判断是否还能借更多书",
		requiredFacts: ["borrowedCount"],
		relatedRuleIds: ["borrow_limit_3"],
	})
	canBorrowMore(_args: Record<string, never> = {}): {
		canBorrow: boolean;
		remaining: number;
	} {
		const remaining = 3 - this.borrowedCount;
		return { canBorrow: remaining > 0, remaining };
	}

	getCapabilities(): MethodSchema[] {
		return AgentMethodRegistry.getMethodsForClass("Reader");
	}
}

export class Book extends BaseNode {
	@agentProperty({ returns: "string", description: "书名" })
	title: string;

	@agentProperty({ returns: "number", description: "上架天数" })
	daysOnShelf: number;

	constructor(id: string, title: string, daysOnShelf: number) {
		super(id);
		this.title = title;
		this.daysOnShelf = daysOnShelf;
	}

	@agentMethod({
		returns: "{ isNew: boolean; daysRemaining: number }",
		description: "判断是否为新书（上架不满7天）",
		requiredFacts: ["daysOnShelf"],
		relatedRuleIds: ["new_book_restriction"],
	})
	isNewBook(_args: Record<string, never> = {}): {
		isNew: boolean;
		daysRemaining: number;
	} {
		const daysRemaining = 7 - this.daysOnShelf;
		return { isNew: this.daysOnShelf < 7, daysRemaining };
	}

	getCapabilities(): MethodSchema[] {
		return AgentMethodRegistry.getMethodsForClass("Book");
	}
}

export function seedGraph(): Graph {
	const g = new Graph();

	// 读者小明：已借 2 本书（《飘》《三体》），有逾期（《老人与海》）
	const xiaoming = new Reader(
		"xiaoming",
		2, // 已借数量
		true, // 有逾期
		["gone_with_wind", "old_man_sea"], // 已借书籍
		["old_man_sea"], // 逾期书籍
	);

	// 书籍
	const goneWithWind = new Book("gone_with_wind", "飘", 30);
	const oldManSea = new Book("old_man_sea", "老人与海", 15);
	const santi = new Book("santi", "三体", 10); // 上架 10 天

	g.addNode(xiaoming);
	g.addNode(goneWithWind);
	g.addNode(oldManSea);
	g.addNode(santi);

	// 已借关系
	g.addEdge({ from: "xiaoming", to: "gone_with_wind", type: "borrowed" });
	g.addEdge({ from: "xiaoming", to: "old_man_sea", type: "borrowed" });

	// 小明想借《三体》
	g.addEdge({ from: "xiaoming", to: "santi", type: "wants_to_borrow" });

	return g;
}