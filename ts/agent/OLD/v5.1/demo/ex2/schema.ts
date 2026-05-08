import type { Ontology } from "../../ontology/schema";

// ── 图书馆借书场景本体 ──

export const libraryOntology: Ontology = {
	types: [
		{
			name: "Reader",
			description: "读者，拥有借书数量和逾期状态",
			properties: [
				{
					name: "borrowedCount",
					type: "number",
					description: "已借书籍数量",
					agentVisible: true,
				},
				{
					name: "hasOverdue",
					type: "boolean",
					description: "是否有逾期未还的书",
					agentVisible: true,
				},
				{
					name: "borrowedBooks",
					type: "string[]",
					description: "已借书籍列表",
					agentVisible: true,
				},
				{
					name: "overdueBooks",
					type: "string[]",
					description: "逾期书籍列表",
					agentVisible: true,
				},
			],
			methods: [
				{ name: "canBorrowMore", description: "判断是否还能借更多书" },
			],
		},
		{
			name: "Book",
			description: "书籍，拥有上架天数和书名",
			properties: [
				{
					name: "title",
					type: "string",
					description: "书名",
					agentVisible: true,
				},
				{
					name: "daysOnShelf",
					type: "number",
					description: "上架天数",
					agentVisible: true,
				},
			],
			methods: [
				{ name: "isNewBook", description: "判断是否为新书（上架不满7天）" },
			],
		},
	],
	relations: [
		{
			type: "wants_to_borrow",
			from: "Reader",
			to: "Book",
			description: "读者想要借这本书",
		},
		{
			type: "borrowed",
			from: "Reader",
			to: "Book",
			description: "读者已借阅这本书",
		},
	],
};