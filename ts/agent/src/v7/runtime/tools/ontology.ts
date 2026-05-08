// import { tool } from 'ai'
// import { z } from 'zod'
// import type { Ontology } from '..//schema'
// import { getRelationsFor, getTypeSchema } from '../schema'
// import { type ToolResult, toolErr, toolOk } from '../types'

// // TODO: 好像没有啥意义, 提示词中包含全量的摘要
// // 但是，relations 没有问题了，但是 type 存在问题，属性和方法只有name,没有说明
// export function createOntologyTools(ontology: Ontology) {
//   const inspect_schema = tool({
//     description: '查询本体的类型和关系 Schema。可按类型名称过滤，不指定则返回全部。',
//     inputSchema: z.object({
//       typeName: z.string().optional().describe("要检查的特定类型名称（如 'Project'）。不指定则返回全部类型。"),
//     }),
//     execute: async ({ typeName }): Promise<ToolResult> => {
//       if (typeName) {
//         const ts = getTypeSchema(ontology, typeName)
//         if (!ts) {
//           return toolErr('NOT_FOUND', `类型 '${typeName}' 在本体中未找到`, {
//             expected: { availableTypes: ontology.types.map((t) => t.name) },
//           })
//         }
//         const relations = getRelationsFor(ontology, typeName)
//         return toolOk({ type: ts, relations })
//       }

//       return toolOk({
//         types: ontology.types.map((t) => ({
//           name: t.name,
//           description: t.description,
//           propertyCount: t.properties.length,
//           methodCount: t.methods.length,
//         })),
//         relations: ontology.relations,
//       })
//     },
//   })

//   return { inspect_schema }
// }
