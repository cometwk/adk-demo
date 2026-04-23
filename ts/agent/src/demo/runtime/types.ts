export type NodeId = string;

export type Edge = {
	from: NodeId;
	to: NodeId;
	type: string;
};

export type NextAction =
	| { op: "traverse"; from: NodeId; relation: string }
	| { op: "read_node"; node: NodeId }
	| { op: "call"; node: NodeId; method: string; args?: any }
	| { op: "update_state"; key: string; value: any }
	| { op: "stop"; reason: string };

export type Observation = {
	success: boolean;
	data?: any;
	error?: string;
};
