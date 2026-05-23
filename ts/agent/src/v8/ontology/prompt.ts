import type { Ontology } from './schema'

/** Serialize Ontology as System Prompt fragment for Agent */
export function buildOntologyPrompt(ontology: Ontology): string {
  const typeLines = ontology.types.map((t) => {
    // Filter: agentVisible !== false && sensitive !== true
    const props = t.properties
      .filter((p) => p.agentVisible !== false && p.sensitive !== true)
      .map((p) => `    ${p.name}: ${p.type} — ${p.description}`)
      .join('\n')
    const methods = t.methods
      .map((m) => `    ${m.name}() — ${m.description}`)
      .join('\n')
    return `- ${t.name}: ${t.description}\n  Properties:\n${props}\n  Methods:\n${methods}`
  })

  const relLines = ontology.relations.map(
    (r) => `- ${r.fromType} --${r.type}--> ${r.toType}: ${r.description}`,
  )

  return [
    '# Ontology Schema',
    '',
    '## Entity Types',
    ...typeLines,
    '',
    '## Relation Types',
    ...relLines,
  ].join('\n')
}