export type NodeId = string;

export type Edge = {
	from: NodeId;
	to: NodeId;
	type: string;
};

export type NextAction =
	| { op: "traverse"; from: NodeId; relation: string }
	| { op: "read_node"; node: NodeId }
	| {
			op: "call";
			node: NodeId;
			method: string;
			/** 显式内联参数，优先级高于 from_state */
			args?: Record<string, any>;
			/** 声明式黑板绑定：{ 参数名: 黑板 key }，Runtime 自动解析当前值 */
			from_state?: Record<string, string>;
	  }
	| { op: "update_state"; key: string; value: any }
	| { op: "stop"; reason: string };

export type Observation = {
	success: boolean;
	data?: any;
	error?: string;
};
