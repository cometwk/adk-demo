import { tool } from 'ai'
import { z } from 'zod'
import type { Ontology } from './schema'
import { getRelationsFor, getTypeSchema } from './schema'
import { type ToolResult, toolErr, toolOk } from '../engine/runtime/types'

export function createOntologyTools(ontology: Ontology) {
  const inspect_schema = tool({
    description:
      'Query ontology types and relation schemas. ' +
      'Can filter by type name, or return all if not specified. ' +
      'Use to understand domain entity types, their properties and relations.',
    inputSchema: z.object({
      typeName: z.string().optional().describe("Specific type name to inspect (e.g. 'Reader'). Returns all types if not specified."),
    }),
    execute: async ({ typeName }): Promise<ToolResult> => {
      if (typeName) {
        const ts = getTypeSchema(ontology, typeName)
        if (!ts) {
          return toolErr('NOT_FOUND', `Type '${typeName}' not found in ontology`, {
            expected: { availableTypes: ontology.types.map((t) => t.name) },
          })
        }
        const relations = getRelationsFor(ontology, typeName)
        return toolOk({ type: ts, relations })
      }

      return toolOk({
        types: ontology.types.map((t) => ({
          name: t.name,
          description: t.description,
          propertyCount: t.properties.length,
          methodCount: t.methods.length,
        })),
        relations: ontology.relations,
      })
    },
  })

  return { inspect_schema }
}