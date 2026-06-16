---
title: "Split discover_entities into search_entities + get_entity_schema to reduce LLM context waste"
date: "2026-06-14"
category: best-practices
module: bi-tools
problem_type: best_practice
component: tooling
symptoms:
  - "discover_entities tool returns all entity schemas at once, consuming large amounts of LLM context window"
  - "LLM receives unnecessary schema data for entities unrelated to the current question"
  - "single monolithic tool forces all-or-nothing entity discovery pattern"
root_cause: wrong_api
resolution_type: code_fix
severity: medium
tags: [agent-tools, llm-context, tool-design, entity-discovery, bi-tools]
---

# Split discover_entities into search_entities + get_entity_schema to reduce LLM context waste

## Problem

The original `discover_entities` BI tool returned the complete schema (all dimensions, measures, and metadata) for every Cube.js entity in a single call, flooding the LLM context window with irrelevant information — the "list_contacts" anti-pattern where a tool dumps an entire dataset instead of letting the agent narrow down first.

## Symptoms

- LLM context window consumed by large, mostly-irrelevant entity schemas when the agent only needed one or two entities
- Higher token costs per BI query due to oversized tool responses
- Agent performance degradation on follow-up reasoning after `discover_entities` calls, since the bloated response pushed earlier conversation context out
- No way for the agent to incrementally explore the entity catalog without paying the full-schema cost

## What Didn't Work

This was a deliberate redesign based on the recognized anti-pattern (no failed investigation). The original tool functioned correctly but was architecturally wasteful for agent-based consumption. CLAUDE.md had already designed the `search_entities` interface, but the code still implemented the old `discover_entities` — design intent and implementation were out of sync.

## Solution

Split the monolithic `discover_entities` into two focused tools following the "search_contacts" design principle: a lightweight search that returns summaries, and a precise fetch that returns full schemas only for requested entities.

### Before — single bloated tool (`src/bi/tools.ts`):

```typescript
export const discover_entities = (ctx: Extra) => {
  return tool({
    description: "Discover available Data Assets (Entities)...",
    inputSchema: z.object({}),
    execute: async () => {
      const meta = await ctx.cubeApi.meta()
      const cubes = meta.cubes || []
      const entities: Record<string, any> = {}
      for (const cube of cubes) {
        // Returns ALL entities with ALL fields — massive context waste
        entities[entityName] = { title, description, dimensions, measures }
      }
      return { entities }
    },
  })
}
```

### After — two focused tools (`src/bi/tools.ts`):

```typescript
export const search_entities = (ctx: Extra) => {
  return tool({
    description:
      "Search for Data Assets (Entities) by keyword. " +
      "Returns matching entities with brief info (name, title, description). " +
      "Use this to discover which entities are relevant to your analysis question. " +
      "Then use 'get_entity_schema' to get the full field details for specific entities.",
    parameters: z.object({
      keyword: z.string().describe("Search keyword to filter entities..."),
    }),
    execute: async ({ keyword }) => {
      const meta = await ctx.cubeApi.meta()
      const cubes = meta.cubes || []
      const kw = keyword.toLowerCase()
      const matched = cubes.filter((cube) => {
        const haystack = [cube.name, cube.title, cube.description]
          .filter(Boolean).join(" ").toLowerCase()
        return haystack.includes(kw)
      })
      const results = matched.map((cube) => ({
        name: cube.name,
        title: cube.title || cube.name,
        description: (cube.description || "").slice(0, 120),
        num_dimensions: (cube.dimensions || []).length,
        num_measures: (cube.measures || []).length,
      }))
      const catalog = cubes.map((cube) => ({
        name: cube.name,
        title: cube.title || cube.name,
      }))
      return {
        matched: results,
        all_entity_names: catalog,
        hint: results.length === 0
          ? `No entities matched '${keyword}'. Use all_entity_names to find the right entity...`
          : `Matched ${results.length} entity(ies). Call get_entity_schema with entity_names...`,
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
    parameters: z.object({
      entity_names: z.array(z.string())
        .describe("List of entity names to get schema for (e.g., ['order_daily', 'profit_daily'])."),
    }),
    execute: async ({ entity_names }) => {
      const meta = await ctx.cubeApi.meta()
      const cubes = meta.cubes || []
      const entities: Record<string, any> = {}
      const not_found: string[] = []
      for (const name of entity_names) {
        const cube = cubes.find((c) => c.name === name)
        if (!cube) { not_found.push(name); continue }
        // ... full dimensions + measures for ONLY this entity
        entities[cube.name] = { title, description, dimensions, measures }
      }
      const result: Record<string, any> = { entities }
      if (not_found.length > 0) {
        result.not_found = not_found
        result.available_entity_names = cubes.map((c) => c.name)
        result.hint = `Entities not found: ${not_found.join(", ")}. Check available_entity_names...`
      }
      return result
    },
  })
}
```

### Wiring change (`src/bi/extra.ts`):

```typescript
// Before
import { discover_entities, execute_query } from "./tools"
createTools: (extra: Extra) => ({
  execute_query: execute_query(extra),
  discover_entities: discover_entities(extra),
})

// After
import { search_entities, get_entity_schema, execute_query } from "./tools"
createTools: (extra: Extra) => ({
  execute_query: execute_query(extra),
  search_entities: search_entities(extra),
  get_entity_schema: get_entity_schema(extra),
})
```

### CLAUDE.md change:

- Tool count: 2 → 3
- Workflow: `discover_entities → execute_query` became `search_entities → get_entity_schema → execute_query`
- Added search example for exploratory questions ("分润相关的数据有哪些？")

## Why This Works

**Root cause:** The original tool violated the "search_contacts" principle — it forced the agent to ingest the entire entity catalog with full schemas in one shot, even when only one entity was relevant. This is the same anti-pattern as a CRM tool that returns all contacts instead of letting the agent search first.

**Why the fix works:**

1. **`search_entities` returns summaries, not schemas.** Each matched entity includes only name, title, truncated description, and field counts — enough for the agent to decide which entities matter, at a fraction of the token cost. The `all_entity_names` catalog provides a fallback when the keyword misses.

2. **`get_entity_schema` is demand-driven.** The agent only fetches full schemas for entities it has already identified as relevant, so context window usage scales with actual need rather than total catalog size.

3. **Error recovery is built in.** When `entity_names` contains unknown names, the response includes `not_found`, `available_entity_names`, and a `hint` — giving the agent everything it needs to self-correct without an extra round trip.

4. **Guided workflow via hints.** Both tools return `hint` strings that nudge the agent toward the next step in the pipeline (`search_entities` → `get_entity_schema` → `execute_query`), reducing the chance of the agent skipping steps or calling tools in the wrong order.

## Prevention

- **Never return full schemas in listing/search tools.** Listing tools should return just enough metadata for the agent to make a selection decision. Full details belong in a separate "get by ID" tool.
- **Design tools as search-then-fetch pairs.** Any tool that exposes a catalog of items should be split into (a) a search/list tool returning summaries and (b) a detail tool accepting specific identifiers. This is the "search_contacts" pattern vs. the "list_contacts" anti-pattern.
- **Always include a lightweight catalog.** The `all_entity_names` field in `search_entities` ensures the agent can recover from a failed keyword search without needing a separate catalog tool.
- **Include self-correction hints in error responses.** When a detail tool can't find a requested item, return the list of valid options so the agent can retry immediately.
- **Token-budget your tool responses.** Measure the average response size of each tool. If a single tool response exceeds ~2KB of structured data, consider whether it can be split or paginated.
- **Update CLAUDE.md and agent prompts when tool signatures change.** The workflow description must reflect the new multi-step discovery process so the agent system prompt guides correct tool chaining.

## Related Issues

- Requirements doc: `docs/brainstorms/2026-06-14-search-entities-tool-redesign-requirements.md`
- Industry precedent: `src/bi/docs/ref.md` (Anthropic self-service data analytics blog) — describes the same "concept-to-entity mapping" problem and "discover-then-fetch" workflow pattern
- Agent engine token budget system: `src/lib/engine/token-budget.ts` — reactive fallback that this tool split makes less necessary (preventive vs reactive context management)
