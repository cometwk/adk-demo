import { tool } from 'ai'
import { z } from 'zod'
import { cubeApi } from './client'
import { buildCubeQuery } from './query'
import { ExecuteQueryInputSchema } from './types'
import path from 'path'
import fs from 'fs'

export const execute_query = tool({
  name: 'execute_query',
  description: "Execute an Analytical Query. Perform multi-dimensional analysis on one of the entities discovered via 'mcp__bi__discover_entities'.",
  inputSchema: ExecuteQueryInputSchema,
  // execute: async (args) => {
  //   const executeQueryArgs = args
  //   const { entity_name } = executeQueryArgs
  //   const query = buildCubeQuery(executeQueryArgs)
  // }
  // "Execute an Analytical Query. Perform multi-dimensional analysis on one of the entities discovered via 'mcp__bi__discover_entities'.",
  // ExecuteQueryInputSchema.shape,
  execute: async (args) => {
    const executeQueryArgs = args
    const { entity_name } = executeQueryArgs
    const query = buildCubeQuery(executeQueryArgs)

    const resultSet = await cubeApi.load(query)
    const data = resultSet.rawData() || []

    const is_truncated = data.length > 50
    const preview_limit = 50
    const columns = resultSet.tableColumns().map((c: any) => c.key)

    // Save full context to tmp space
    const timestamp = Date.now()
    const tmpFilepath = path.join('/tmp', `cube_query_result_${timestamp}.json`)
    fs.writeFileSync(tmpFilepath, JSON.stringify(data, null, 2), 'utf-8')

    const resultPayload = {
      entity: entity_name,
      num_rows: data.length,
      columns: columns,
      preview: data.slice(0, preview_limit),
      is_truncated,
      result_filepath: tmpFilepath,
      message: `Successfully executed query. Received ${data.length} rows. Full context saved at: ${tmpFilepath}`,
    }

    return {
      content: [{ type: 'text', text: JSON.stringify(resultPayload, null, 2) }],
    }
  }
)

// export const discover_entities = tool(
//   'discover_entities',
//   'Discover available Data Assets (Entities). ' +
//     'Use this tool FIRST to understand the schema (Dimensions and Measures) available for querying. ' +
//     'Returns a catalog of Semantic Entities with descriptions of their fields.',
//   {},
//   async (args) => {
//     const meta = await cubeApi.meta()
//     const cubes = meta.cubes || []
//     const entities: Record<string, any> = {}

//     for (const cube of cubes) {
//       const entityName = cube.name

//       const dimensions: Record<string, any> = {}
//       for (const dim of cube.dimensions || []) {
//         dimensions[dim.name] = {
//           type: dim.type,
//           description: dim.description || '',
//           title: dim.title || '',
//         }
//       }

//       const measures: Record<string, any> = {}
//       for (const meas of cube.measures || []) {
//         measures[meas.name] = {
//           type: meas.type,
//           description: meas.description || '',
//           title: meas.title || '',
//         }
//       }

//       entities[entityName] = {
//         title: cube.title || entityName,
//         description: cube.description || '',
//         dimensions,
//         measures,
//       }
//     }

//     return {
//       content: [{ type: 'text', text: JSON.stringify({ entities }, null, 2) }],
//     }
//   }
// )
