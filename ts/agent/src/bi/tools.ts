import { tool, jsonSchema, InferSchema } from 'ai'
import { z } from 'zod'
import { cubeApi } from './client'
import { buildCubeQuery, ExecuteQueryArgs } from './query'
import path from 'path'
import fs from 'fs'

// Tool Definitions
export const DISCOVER_ENTITIES_TOOL = {
  name: 'discover_entities',
  description:
    'Discover available Data Assets (Entities). Use this tool FIRST to understand the schema (Dimensions and Measures) available for querying. Returns a catalog of Semantic Entities with descriptions of their fields.',
  inputSchema: {
    type: 'object',
    properties: {},
  },
}

export const EXECUTE_QUERY_TOOL = {
  name: 'execute_query',
  description: "Execute an Analytical Query. Perform multi-dimensional analysis on one of the entities discovered via 'discover_entities'.",
  inputSchema: {
    type: 'object',
    properties: {
      entity_name: {
        type: 'string',
        description: "The name of the Entity to query (e.g., 'Components').",
      },
      measures: {
        type: 'array',
        items: { type: 'string' },
        description: "Measures to calculate (e.g., ['Components.area']). MUST use 'Entity.Measure' format.",
      },
      dimensions: {
        type: 'array',
        items: { type: 'string' },
        description: "Dimensions to group/segment by (e.g., ['Components.id']). MUST use 'Entity.Dimension' format.",
      },
      filters: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            member: { type: 'string', description: "Fully qualified field name (e.g., 'EntityName.FieldName')" },
            operator: {
              type: 'string',
              description:
                "Comparison operator: 'equals', 'notEquals', 'contains', 'notContains', 'startsWith', 'notStartsWith', 'endsWith', 'notEndsWith', 'gt', 'gte', 'lt', 'lte', 'inDateRange', 'notInDateRange', 'beforeDate', 'beforeOrOnDate', 'afterDate', 'afterOrOnDate', 'set', 'notSet'",
            },
            values: {
              type: 'array',
              items: { type: 'string' },
              description: 'List of filter values. Warning: Large identifiers (like scene_id) must be strings to prevent precision loss.',
            },
          },
          required: ['member', 'operator', 'values'],
        },
        description: 'Optional filters to apply to the query.',
      },
      timeDimensions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            dimension: {
              type: 'string',
              description: "Time dimension member (e.g., 'Orders.createdAt').",
            },
            granularity: {
              type: 'string',
              description: "Optional time granularity such as 'day', 'week', or 'month'.",
            },
            dateRange: {
              oneOf: [
                { type: 'string' },
                {
                  type: 'array',
                  items: { type: 'string' },
                  minItems: 2,
                  maxItems: 2,
                },
              ],
              description: 'Optional date range as a preset string or [start, end].',
            },
            compareDateRange: {
              type: 'array',
              items: {
                oneOf: [
                  { type: 'string' },
                  {
                    type: 'array',
                    items: { type: 'string' },
                    minItems: 2,
                    maxItems: 2,
                  },
                ],
              },
              description: 'Optional compare date ranges.',
            },
          },
          required: ['dimension'],
        },
        description: 'Optional Cube time dimensions.',
      },
      segments: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional Cube segments.',
      },
      limit: {
        type: 'number',
        description: 'Max rows to return (default None).',
      },
      rowLimit: {
        type: 'number',
        description: 'Optional Cube rowLimit.',
      },
      offset: {
        type: 'number',
        description: 'Optional row offset.',
      },
      order: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            member: {
              type: 'string',
              description: "Fully qualified field name to sort by (e.g., 'Components.count').",
            },
            direction: {
              type: 'string',
              enum: ['asc', 'desc', 'none'],
              description: 'Sort direction.',
            },
          },
          required: ['member', 'direction'],
        },
        description: 'Optional multi-column sort rules applied in order.',
      },
      timezone: {
        type: 'string',
        description: "Optional query timezone, for example 'UTC' or 'Asia/Shanghai'.",
      },
      renewQuery: {
        type: 'boolean',
        description: 'Optional Cube renewQuery flag.',
      },
      ungrouped: {
        type: 'boolean',
        description: 'Optional Cube ungrouped flag.',
      },
      responseFormat: {
        type: 'string',
        enum: ['compact', 'default'],
        description: 'Optional Cube response format.',
      },
      total: {
        type: 'boolean',
        description: 'Optional Cube total flag.',
      },
    },
    required: ['entity_name'],
  },
}

export const execute_query = tool({
  description: "Execute an Analytical Query. Perform multi-dimensional analysis on one of the entities discovered via 'discover_entities'.",
  inputSchema: jsonSchema(EXECUTE_QUERY_TOOL.inputSchema),
  execute: async (args0) => {
    const args = args0 as ExecuteQueryArgs
    const { entity_name } = args
    const query = buildCubeQuery(args)

    const resultSet = await cubeApi.load(query)
    const data = resultSet.rawData() || []

    const is_truncated = data.length > 50
    const preview_limit = 50
    const columns = resultSet.tableColumns().map((c: { key: string }) => c.key)

    const timestamp = Date.now()
    const tmpFilepath = path.join('/tmp', `cube_query_result_${timestamp}.json`)
    fs.writeFileSync(tmpFilepath, JSON.stringify(data, null, 2), 'utf-8')

    return {
      entity: entity_name,
      num_rows: data.length,
      columns,
      preview: data.slice(0, preview_limit),
      is_truncated,
      result_filepath: tmpFilepath,
      message: `Successfully executed query. Received ${data.length} rows. Full context saved at: ${tmpFilepath}`,
    }
  },
})

export const discover_entities = tool({
  description:
    'Discover available Data Assets (Entities). ' +
    'Use this tool FIRST to understand the schema (Dimensions and Measures) available for querying. ' +
    'Returns a catalog of Semantic Entities with descriptions of their fields.',
  inputSchema: z.object({}),
  execute: async () => {
    const meta = await cubeApi.meta()
    const cubes = meta.cubes || []
    const entities: Record<string, any> = {}

    for (const cube of cubes) {
      const entityName = cube.name

      const dimensions: Record<string, any> = {}
      for (const dim of cube.dimensions || []) {
        dimensions[dim.name] = {
          type: dim.type,
          description: dim.description || '',
          title: dim.title || '',
        }
      }

      const measures: Record<string, any> = {}
      for (const meas of cube.measures || []) {
        measures[meas.name] = {
          type: meas.type,
          description: meas.description || '',
          title: meas.title || '',
        }
      }

      entities[entityName] = {
        title: cube.title || entityName,
        description: cube.description || '',
        dimensions,
        measures,
      }
    }

    return { entities }
  },
})
