import { tool, jsonSchema, InferSchema } from "ai"
import { z } from "zod"
// import { cubeApi } from './client'
import { buildCubeQuery, ExecuteQueryArgs } from "./query"
import path from "path"
import fs from "fs"
import { trace } from "./utils/trace"
import { Extra } from "./extra"

// Tool Definitions
export const EXECUTE_QUERY_TOOL = {
  name: "execute_query",
  description:
    "Execute an Analytical Query. Perform multi-dimensional analysis on one of the entities discovered via 'search_entities' or 'get_entity_schema'.",
  inputSchema: {
    type: "object",
    properties: {
      entity_name: {
        type: "string",
        description: "The name of the Entity to query (e.g., 'Components').",
      },
      measures: {
        type: "array",
        items: { type: "string" },
        description:
          "Measures to calculate (e.g., ['Components.area']). MUST use 'Entity.Measure' format.",
      },
      dimensions: {
        type: "array",
        items: { type: "string" },
        description:
          "Dimensions to group/segment by (e.g., ['Components.id']). MUST use 'Entity.Dimension' format.",
      },
      filters: {
        type: "array",
        items: {
          type: "object",
          properties: {
            member: {
              type: "string",
              description: "Fully qualified field name (e.g., 'EntityName.FieldName')",
            },
            operator: {
              type: "string",
              description:
                "Comparison operator: 'equals', 'notEquals', 'contains', 'notContains', 'startsWith', 'notStartsWith', 'endsWith', 'notEndsWith', 'gt', 'gte', 'lt', 'lte', 'inDateRange', 'notInDateRange', 'beforeDate', 'beforeOrOnDate', 'afterDate', 'afterOrOnDate', 'set', 'notSet'",
            },
            values: {
              type: "array",
              items: { type: "string" },
              description:
                "List of filter values. Warning: Large identifiers (like scene_id) must be strings to prevent precision loss.",
            },
          },
          required: ["member", "operator", "values"],
        },
        description: "Optional filters to apply to the query.",
      },
      timeDimensions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            dimension: {
              type: "string",
              description: "Time dimension member (e.g., 'Orders.createdAt').",
            },
            granularity: {
              type: "string",
              description: "Optional time granularity such as 'day', 'week', or 'month'.",
            },
            dateRange: {
              oneOf: [
                { type: "string" },
                {
                  type: "array",
                  items: { type: "string" },
                  minItems: 2,
                  maxItems: 2,
                },
              ],
              description: "Optional date range as a preset string or [start, end].",
            },
            compareDateRange: {
              type: "array",
              items: {
                oneOf: [
                  { type: "string" },
                  {
                    type: "array",
                    items: { type: "string" },
                    minItems: 2,
                    maxItems: 2,
                  },
                ],
              },
              description: "Optional compare date ranges.",
            },
          },
          required: ["dimension"],
        },
        description: "Optional Cube time dimensions.",
      },
      segments: {
        type: "array",
        items: { type: "string" },
        description: "Optional Cube segments.",
      },
      limit: {
        type: "number",
        description: "Max rows to return (default None).",
      },
      rowLimit: {
        type: "number",
        description: "Optional Cube rowLimit.",
      },
      offset: {
        type: "number",
        description: "Optional row offset.",
      },
      order: {
        type: "array",
        items: {
          type: "object",
          properties: {
            member: {
              type: "string",
              description: "Fully qualified field name to sort by (e.g., 'Components.count').",
            },
            direction: {
              type: "string",
              enum: ["asc", "desc", "none"],
              description: "Sort direction.",
            },
          },
          required: ["member", "direction"],
        },
        description: "Optional multi-column sort rules applied in order.",
      },
      timezone: {
        type: "string",
        description: "Optional query timezone, for example 'UTC' or 'Asia/Shanghai'.",
      },
      renewQuery: {
        type: "boolean",
        description: "Optional Cube renewQuery flag.",
      },
      ungrouped: {
        type: "boolean",
        description: "Optional Cube ungrouped flag.",
      },
      responseFormat: {
        type: "string",
        enum: ["compact", "default"],
        description: "Optional Cube response format.",
      },
      total: {
        type: "boolean",
        description: "Optional Cube total flag.",
      },
    },
    required: ["entity_name"],
  },
}

export const execute_query = (ctx: Extra) => {
  return tool({
    description:
      "Execute an Analytical Query. Perform multi-dimensional analysis on one of the entities discovered via 'search_entities' or 'get_entity_schema'.",
    inputSchema: jsonSchema(EXECUTE_QUERY_TOOL.inputSchema),
    execute: async (args0) => {
      const args = args0 as ExecuteQueryArgs
      const { entity_name } = args
      const query = buildCubeQuery(args)

      const resultSet = await ctx.cubeApi.load(query)
      const data = resultSet.rawData() || []

      const sql = await ctx.cubeApi.sql(query)
      const sqlText = sql.sql()
      trace.system("\n    " + sqlText)

      const is_truncated = data.length > 50
      const preview_limit = 50
      const columns = resultSet.tableColumns().map((c: { key: string }) => c.key)

      const timestamp = Date.now()
      const tmpFilepath = path.join("/tmp", `cube_query_result_${timestamp}.json`)
      fs.writeFileSync(tmpFilepath, JSON.stringify(data, null, 2), "utf-8")

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
}

export const search_entities = (ctx: Extra) => {
  return tool({
    description:
      "Search for Data Assets (Entities) by keyword. " +
      "Returns matching entities with brief info (name, title, description). " +
      "Use this to discover which entities are relevant to your analysis question. " +
      "Then use 'get_entity_schema' to get the full field details for specific entities.",
    inputSchema: z.object({
      keyword: z
        .string()
        .describe(
          "Search keyword to filter entities. Matches against entity name, title, and description " +
            "(e.g., '交易', '分润', '商户', 'order', 'profit')."
        ),
    }),
    execute: async ({ keyword }) => {
      const meta = await ctx.cubeApi.meta()
      const cubes = meta.cubes || []

      const kw = keyword.toLowerCase()
      const matched = cubes.filter((cube) => {
        const haystack = [cube.name, cube.title, cube.description]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
        return haystack.includes(kw)
      })

      const results = matched.map((cube) => ({
        name: cube.name,
        title: cube.title || cube.name,
        description: (cube.description || "").slice(0, 120),
        num_dimensions: (cube.dimensions || []).length,
        num_measures: (cube.measures || []).length,
      }))

      // 轻量目录：所有实体的 name + title，方便 LLM 发现其他实体
      const catalog = cubes.map((cube) => ({
        name: cube.name,
        title: ((cube.title || cube.name || "") + (" " + cube.description || "")).slice(0, 120),
      }))

      return {
        matched: results,
        all_entity_names: catalog,
        hint:
          results.length === 0
            ? `No entities matched '${keyword}'. Use all_entity_names to find the right entity, then call get_entity_schema.`
            : `Matched ${results.length} entity(ies). Call get_entity_schema with entity_names to get field details.`,
      }
    },
  })
}

export const get_entity_schema = (ctx: Extra) => {
  return tool({
    description:
      "Get the full schema (Dimensions and Measures) for specific entities. " +
      "Use after 'search_entities' to confirm available fields before querying. " +
      "Only returns schema for the requested entities, not all entities.",
    inputSchema: z.object({
      entity_names: z
        .array(z.string())
        .describe(
          "List of entity names to get schema for (e.g., ['order_daily', 'profit_daily'])."
        ),
    }),
    execute: async ({ entity_names }) => {
      const meta = await ctx.cubeApi.meta()
      const cubes = meta.cubes || []

      const entities: Record<string, any> = {}
      const not_found: string[] = []

      for (const name of entity_names) {
        const cube = cubes.find((c) => c.name === name)
        if (!cube) {
          not_found.push(name)
          continue
        }

        const dimensions: Record<string, any> = {}
        for (const dim of cube.dimensions || []) {
          dimensions[dim.name] = {
            type: dim.type,
            description: dim.description || "",
            title: dim.title || "",
          }
        }

        const measures: Record<string, any> = {}
        for (const meas of cube.measures || []) {
          measures[meas.name] = {
            type: meas.type,
            description: meas.description || "",
            title: meas.title || "",
          }
        }

        entities[cube.name] = {
          title: cube.title || cube.name,
          description: cube.description || "",
          dimensions,
          measures,
        }
      }

      const result: Record<string, any> = { entities }
      if (not_found.length > 0) {
        const available = cubes.map((c) => c.name)
        result.not_found = not_found
        result.available_entity_names = available
        result.hint = `Entities not found: ${not_found.join(
          ", "
        )}. Check available_entity_names for valid names.`
      }

      return result
    },
  })
}
