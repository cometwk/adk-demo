// import { z } from 'zod'

// export const DateRangeSchema = z.union([
//   z.string(),
//   z.tuple([z.string(), z.string()]),
// ])
// export type DateRange = z.infer<typeof DateRangeSchema>

// export const FilterSchema = z.object({
//   member: z.string().describe("Fully qualified field name (e.g., 'EntityName.FieldName')"),
//   operator: z
//     .string()
//     .describe(
//       "Comparison operator: 'equals', 'notEquals', 'contains', 'notContains', 'startsWith', 'notStartsWith', 'endsWith', 'notEndsWith', 'gt', 'gte', 'lt', 'lte', 'inDateRange', 'notInDateRange', 'beforeDate', 'beforeOrOnDate', 'afterDate', 'afterOrOnDate', 'set', 'notSet'",
//     ),
//   values: z
//     .array(z.string())
//     .describe(
//       'List of filter values. Warning: Large identifiers (like scene_id) must be strings to prevent precision loss.',
//     ),
// })
// export type Filter = z.infer<typeof FilterSchema>

// export const TimeDimensionSchema = z.object({
//   dimension: z.string().describe("Time dimension member (e.g., 'Orders.createdAt')."),
//   granularity: z
//     .string()
//     .optional()
//     .describe("Optional time granularity such as 'day', 'week', or 'month'."),
//   dateRange: DateRangeSchema.optional().describe(
//     'Optional date range as a preset string or [start, end].',
//   ),
//   compareDateRange: z
//     .array(DateRangeSchema)
//     .optional()
//     .describe('Optional compare date ranges.'),
// })
// export type TimeDimension = z.infer<typeof TimeDimensionSchema>

// export const OrderDirectionSchema = z.enum(['asc', 'desc', 'none'])
// export type OrderDirection = z.infer<typeof OrderDirectionSchema>

// export const OrderRuleSchema = z.object({
//   member: z
//     .string()
//     .describe("Fully qualified field name to sort by (e.g., 'Components.count')."),
//   direction: OrderDirectionSchema.describe('Sort direction.'),
// })
// export type OrderRule = z.infer<typeof OrderRuleSchema>

// // export const ResponseFormatSchema = z.enum(['compact', 'default'])
// // export type ResponseFormat = z.infer<typeof ResponseFormatSchema>

// export const ExecuteQueryInputSchema = z.object({
//   entity_name: z.string().describe("The name of the Entity to query (e.g., 'Components')."),
//   measures: z
//     .array(z.string())
//     .optional()
//     .describe("Measures to calculate (e.g., ['Components.area']). MUST use 'Entity.Measure' format."),
//   dimensions: z
//     .array(z.string())
//     .optional()
//     .describe(
//       "Dimensions to group/segment by (e.g., ['Components.id']). MUST use 'Entity.Dimension' format.",
//     ),
//   filters: z.array(FilterSchema).optional().describe('Optional filters to apply to the query.'),
//   timeDimensions: z
//     .array(TimeDimensionSchema)
//     .optional()
//     .describe('Optional Cube time dimensions.'),
//   segments: z.array(z.string()).optional().describe('Optional Cube segments.'),
//   limit: z.number().optional().describe('Max rows to return (default None).'),
// //   total: z.number().optional().describe('If set to true, Cube will run a total query and return the total number of rows as if no row limit or offset are set in the query. The default value is false.'),
//   total: z.boolean().optional().describe('Optional Cube total flag.'),
//   offset: z.number().optional().describe('Optional row offset.'),
//   order: z
//     .array(OrderRuleSchema)
//     .optional()
//     .describe('Optional multi-column sort rules applied in order.'),
//   timezone: z
//     .string()
//     .optional()
//     .describe("Optional query timezone, for example 'UTC' or 'Asia/Shanghai'."),
//   renewQuery: z.boolean().optional().describe('Optional Cube renewQuery flag.'),
//   ungrouped: z.boolean().optional().describe('Optional Cube ungrouped flag.'),
// //   responseFormat: ResponseFormatSchema.optional().describe('Optional Cube response format.'),
// })
// export type ExecuteQueryInput = z.infer<typeof ExecuteQueryInputSchema>
