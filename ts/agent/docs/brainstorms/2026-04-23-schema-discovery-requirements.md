---
date: 2026-04-23
topic: schema-discovery
---

# Schema Discovery for Agent-Accessible Methods

## Problem Frame

The current demo architecture separates LLM decision from Runtime execution, but lacks a critical bridge: **LLM does not know what methods are available on each node type**. The prompt hardcodes generic action templates (`call { node, method }`), but LLM must guess which methods exist on `Person` or `Project`. This creates:

- **Blind invocation risk**: LLM may call non-existent methods
- **Maintenance burden**: Adding new node methods requires manual prompt updates
- **No type safety**: LLM has no schema for parameters or return values

**Who is affected**: Agents making decisions, developers maintaining node types, and the reliability of the entire loop.

**Why it matters**: Without introspection, agent reasoning is "guessing" not "orchestrating". The architecture's elegance is undermined by this foundational gap.

## Requirements

**Core Mechanism**
- R1. BaseNode must expose an abstract `getCapabilities()` method returning the schema of all agent-accessible methods
- R2. Each concrete node class must implement `getCapabilities()` returning its method schemas

**Schema Format**
- R3. Method schema must include: method name, parameter definitions (zod), return type description, and human-readable description
- R4. Schema must be convertible to JSON Schema format for LLM consumption

**Declaration Mechanism**
- R5. Methods must be marked with `@agentMethod(zodSchema)` decorator to register them as agent-accessible
- R6. Decorator must automatically collect method metadata into a class-level registry

**Runtime Integration**
- R7. `buildPrompt()` must inject a `AVAILABLE_CAPABILITIES` block before the action templates
- R8. Capabilities block must enumerate each node type and its callable methods with JSON Schema
- R9. Validator must only allow methods that exist in the capabilities registry (whitelist enforcement)

## Success Criteria
- LLM prompt shows `Person: [getWorkload(params: none, returns: number)]` and `Project: [checkRiskStatus(params: {teamLoad: number}, returns: {risk: string})]`
- LLM can correctly infer parameter types without guessing
- Calling `constructor` or non-decorated methods fails validation
- Adding a new method on Person requires only the decorator, no prompt changes

## Scope Boundaries
- NOT: Context window optimization / observation summarization
- NOT: Scratchpad / temporary variable storage
- NOT: Thought field / CoT support
- NOT: Migration to Claude/OpenAI tool calling API format

## Key Decisions
- **Zod + JSON Schema**: Standard schema format, familiar to LLMs, easy conversion
- **Decorator per method**: Metadata travels with code, auto-collection into registry
- **Full schema (params + returns + desc)**: LLM needs return type to reason about call chains

## Dependencies / Assumptions
- TypeScript decorator support (experimental feature, enabled in tsconfig)
- `zod-to-json-schema` package for conversion
- Node classes remain simple (no inheritance beyond BaseNode)

## Outstanding Questions

### Deferred to Planning
- [Affects R5][Technical] How to handle class inheritance? If `Project extends BaseNode`, does `Project` inherit `BaseNode`'s agent methods?
- [Affects R6][Needs research] Should decorator be a property decorator or method decorator? Property decorator on prototype vs method decorator on descriptor.
- [Affects R8][Technical] Capabilities format in prompt: per-node block vs unified tools list?
- [Affects R9][Technical] Validator refactor: check against registry instead of `typeof (node as any)[method]`

## Next Steps
→ `/ce:plan` for structured implementation planning