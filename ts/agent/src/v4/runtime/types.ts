export type NodeId = string;

export type Edge = {
	from: NodeId;
	to: NodeId;
	type: string;
};
