export type NodeId = string;

export type Edge = {
  from: NodeId;
  to: NodeId;
  type: string;
};

export type NextAction =
  | { op: "traverse"; from: NodeId; relation: string }
  | { op: "call"; node: NodeId; method: string; args?: any }
  | { op: "stop"; reason: string };

export type Observation = {
  success: boolean;
  data?: any;
  error?: string;
};