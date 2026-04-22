import { Graph, Person, Project } from "../runtime/graph";

export function seedGraph(): Graph {
  const g = new Graph();

  const p1 = new Person("person_1", 60);
  const p2 = new Person("person_2", 70);

  const project = new Project("project_1", 0.8);

  g.addNode(p1);
  g.addNode(p2);
  g.addNode(project);

  g.addEdge({ from: "person_1", to: "project_1", type: "involved_in" });
  g.addEdge({ from: "person_2", to: "project_1", type: "involved_in" });

  return g;
}