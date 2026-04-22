---
title: feat: Schema Discovery for Agent-Accessible Methods
type: feat
status: active
date: 2026-04-23
origin: docs/brainstorms/2026-04-23-schema-discovery-requirements.md
---

# feat: Schema Discovery for Agent-Accessible Methods

## Overview

Add introspection capability so LLM agents know which methods exist on each node type, their parameter schemas, and return types. This transforms agent reasoning from "guessing" to "orchestrating" and enables whitelist-based security.

## Problem Frame

The current demo separates LLM decision from Runtime execution, but lacks a critical bridge: **LLM does not know what methods are available on each node type**. The prompt hardcodes generic action templates without schema information, forcing LLM to guess which methods exist on `Person` or `Project` and what parameters they accept.

This creates blind invocation risk, maintenance burden, and no type safety.

## Requirements Trace

- R1. BaseNode must expose an abstract `getCapabilities()` method returning the schema of all agent-accessible methods
- R2. Each concrete node class must implement `getCapabilities()` returning its method schemas
- R3. Method schema must include: method name, parameter definitions (zod), return type description, and human-readable description
- R4. Schema must be convertible to JSON Schema format for LLM consumption
- R5. Methods must be marked with `@agentMethod(zodSchema)` decorator to register them as agent-accessible
- R6. Decorator must automatically collect method metadata into a class-level registry
- R7. `buildPrompt()` must inject a `AVAILABLE_CAPABILITIES` block before the action templates
- R8. Capabilities block must enumerate each node type and its callable methods with JSON Schema
- R9. Validator must only allow methods that exist in the capabilities registry (whitelist enforcement)

## Scope Boundaries

- NOT: Context window optimization / observation summarization
- NOT: Scratchpad / temporary variable storage
- NOT: Thought field / CoT support
- NOT: Migration to Claude/OpenAI tool calling API format

## Context & Research

### Relevant Code and Patterns

- `src/demo/runtime/graph.ts` - BaseNode (abstract), Person, Project classes
- `src/demo/runtime/types.ts` - NextAction, Observation types
- `src/demo/runtime/validator.ts` - Current `typeof` check (line 13-15)
- `src/demo/runtime/executor.ts` - Dynamic invocation `(node as any)[method]` (line 18)
- `src/demo/agent/prompt.ts` - Prompt builder with hardcoded actions block (line 14-18)
- `tsconfig.json` - Needs `experimentalDecorators: true`
- `package.json` - Has zod, needs `zod-to-json-schema`

### Institutional Learnings

No `docs/solutions/` exists. This is greenfield implementation for schema discovery.

### External References

- Zod documentation: https://zod.dev
- zod-to-json-schema: https://github.com/StefanTerdell/zod-to-json-schema

## Key Technical Decisions

- **Inheritance handling**: Registry walks prototype chain so subclass inherits parent's agent methods. Enables DRY when BaseNode adds common methods.
- **Decorator type**: Method decorator on descriptor (not property decorator). Standard pattern that accesses method metadata and can wrap execution.
- **Capabilities format in prompt**: Per-node block (`Person: [getWorkload(...)]`). More readable for graph reasoning than unified tools list.
- **Validator refactor**: Check against registry (whitelist) + validate args against zod schema before execution. Blocks constructor and non-decorated methods.
- **Registry structure**: Static `AGENT_METHODS` Map on BaseNode, keyed by `(constructor.name, methodName)`. Decorator populates at class definition time.

## Open Questions

### Resolved During Planning

- **Inheritance handling**: Registry walks prototype chain; subclass inherits parent methods. Resolution: enables DRY for common BaseNode methods.
- **Decorator type**: Method decorator on descriptor. Resolution: standard pattern, accesses method metadata.
- **Capabilities format**: Per-node block. Resolution: more readable for graph reasoning.
- **Validator whitelist**: Check against registry + validate args. Resolution: blocks constructor/non-decorated methods.

### Deferred to Implementation

- **Registry implementation detail**: Exact Map structure and prototype chain traversal logic - discoverable during implementation.
- **JSON Schema format nuance**: Exact output format for LLM readability - refine after seeing actual output.

## Implementation Units

- [ ] **Unit 1: Enable TypeScript decorator support**

**Goal:** Configure tsconfig for decorator compilation and add missing dependency.

**Requirements:** R5 (decorator mechanism prerequisite)

**Dependencies:** None

**Files:**
- Modify: `tsconfig.json`
- Modify: `package.json`

**Approach:**
- Add `experimentalDecorators: true` to compilerOptions
- Add `emitDecoratorMetadata: true` for optional reflection
- Install `zod-to-json-schema` dependency

**Patterns to follow:** Standard TypeScript config modifications.

**Test scenarios:**
- Happy path: Decorator syntax compiles without error after config change

**Verification:**
- `tsc --noEmit` passes with decorator syntax in test file

---

- [ ] **Unit 2: Create decorator and registry infrastructure**

**Goal:** Implement `@agentMethod` decorator and `AgentMethodRegistry` that collects method metadata.

**Requirements:** R5, R6

**Dependencies:** Unit 1 (decorator support enabled)

**Files:**
- Create: `src/demo/runtime/registry.ts`
- Create: `src/demo/runtime/decorator.ts`

**Approach:**
- Create `AgentMethodRegistry` class with static `methods: Map<string, MethodSchema>` keyed by `${className}:${methodName}`
- Create `agentMethod(schema: MethodSchemaConfig)` decorator factory that:
  - Registers method in registry at class definition time
  - Stores schema on method's metadata
- `MethodSchemaConfig` includes: `params: z.ZodType`, `returns: string`, `description: string`

**Patterns to follow:** Zod schema patterns, TypeScript method decorator pattern.

**Test scenarios:**
- Happy path: `@agentMethod({ params: z.object({}), returns: "number", description: "..." })` registers method
- Edge case: Multiple decorators on same class work correctly
- Edge case: Subclass inherits parent's registered methods (registry walks prototype chain)
- Error path: Invalid zod schema in decorator throws at registration time

**Verification:**
- Registry contains expected methods after class definition
- `getCapabilities()` returns registered methods for instantiated class

---

- [ ] **Unit 3: Add getCapabilities() to BaseNode and node classes**

**Goal:** Implement introspection method on BaseNode and apply decorator to Person/Project methods.

**Requirements:** R1, R2, R3

**Dependencies:** Unit 2 (decorator and registry exist)

**Files:**
- Modify: `src/demo/runtime/graph.ts`
- Test: `src/demo/runtime/graph.test.ts` (new)

**Approach:**
- Add abstract `getCapabilities(): MethodCapabilities[]` to BaseNode
- Implement in Person/Project using registry lookup (walk prototype chain)
- Apply `@agentMethod` decorator to:
  - `Person.getWorkload()` - params: none, returns: "number"
  - `Project.checkRiskStatus(teamLoad)` - params: `{ teamLoad: z.number() }`, returns: `{ risk: string }`

**Patterns to follow:** Abstract method pattern from existing BaseNode.

**Test scenarios:**
- Happy path: `person.getCapabilities()` returns array with `getWorkload` schema
- Happy path: `project.getCapabilities()` returns array with `checkRiskStatus` schema
- Edge case: Empty capabilities for node with no decorated methods
- Integration: Registry prototype chain walk includes inherited methods

**Verification:**
- `new Person("alice", 50).getCapabilities()` returns correct JSON Schema format
- Schema includes method name, params, returns, description

---

- [ ] **Unit 4: Integrate capabilities into prompt builder**

**Goal:** Inject AVAILABLE_CAPABILITIES block into LLM prompt with JSON Schema format.

**Requirements:** R7, R8, R4

**Dependencies:** Unit 3 (getCapabilities() implemented)

**Files:**
- Modify: `src/demo/agent/prompt.ts`
- Test: `src/demo/agent/prompt.test.ts` (new)

**Approach:**
- Modify `buildPrompt(goal, history)` to accept `graph: Graph` parameter
- Iterate `graph.nodes` and call `node.getCapabilities()` for each
- Convert zod schemas to JSON Schema using `zod-to-json-schema`
- Format as per-node block: `Person: [getWorkload(params: {}, returns: number)]`
- Insert between RULES and Available actions sections

**Patterns to follow:** Existing string interpolation pattern in prompt.ts.

**Test scenarios:**
- Happy path: Prompt contains capabilities block with Person and Project methods
- Happy path: JSON Schema format is valid and parseable by LLM
- Edge case: Empty graph produces empty capabilities block (or warning)
- Integration: Capabilities match actual methods on seeded graph nodes

**Verification:**
- Generated prompt shows method schemas in expected format
- `zod-to-json-schema` conversion produces valid JSON Schema

---

- [ ] **Unit 5: Upgrade validator to whitelist enforcement**

**Goal:** Validate call actions against capabilities registry and validate args against zod schema.

**Requirements:** R9

**Dependencies:** Unit 2 (registry exists), Unit 3 (capabilities implemented)

**Files:**
- Modify: `src/demo/runtime/validator.ts`
- Modify: `src/demo/runtime/executor.ts` (optional: move validation here)
- Test: `src/demo/runtime/validator.test.ts` (new)

**Approach:**
- Replace `typeof (node as any)[method]` check with registry lookup
- Check `${node.constructor.name}:${method}` exists in registry
- Parse action.args and validate against method's zod params schema
- Return detailed validation error if schema mismatch

**Patterns to follow:** Current validator.ts structure, zod.safeParse pattern.

**Test scenarios:**
- Happy path: Decorated method with matching args passes validation
- Error path: Non-decorated method (e.g., `constructor`) fails validation
- Error path: `args` schema mismatch returns descriptive error
- Edge case: Missing args for method with no params passes
- Integration: Validator + Executor chain validates before execution

**Verification:**
- Calling `constructor` fails validation
- Calling `getWorkload` on Person passes
- Calling `checkRiskStatus` with wrong arg type fails with schema error

---

- [ ] **Unit 6: End-to-end integration and demo update**

**Goal:** Update agent loop to pass graph to prompt builder, verify full flow works.

**Requirements:** R7, R8 integration validation

**Dependencies:** Unit 4 (prompt integration), Unit 5 (validator)

**Files:**
- Modify: `src/demo/agent/loop.ts`
- Modify: `src/demo/index.ts` (entry point)
- Modify: `src/demo/data/seed.ts` (ensure seeded nodes have decorated methods)

**Approach:**
- Pass `graph` to `buildPrompt()` in agent loop
- Ensure seeded Person/Project instances are decorated
- Run demo loop and verify LLM receives capabilities block

**Patterns to follow:** Existing loop.ts structure.

**Test scenarios:**
- Integration: Full loop runs with capabilities in prompt
- Integration: LLM action selection uses schema information correctly
- Integration: Invalid actions are caught by validator

**Verification:**
- Demo runs without error
- Prompt output shows capabilities block
- `getWorkload` and `checkRiskStatus` appear in prompt with schemas

## System-Wide Impact

- **Interaction graph:** Validator now checks against registry before Executor invocation
- **Error propagation:** Validation errors now include zod schema violations (more descriptive)
- **State lifecycle risks:** Registry is populated at class definition time (static), no runtime state concerns
- **API surface parity:** getCapabilities() added to BaseNode - all node subclasses must implement
- **Unchanged invariants:** traverse and stop actions unchanged; only call action validation enhanced

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Decorator compilation requires tsconfig change | Verify `tsc --noEmit` passes before proceeding |
| zod-to-json-schema output format unfamiliar to LLM | Test with sample prompt to verify readability |
| Prototype chain walk complexity | Keep registry logic simple; document inheritance behavior |

## Documentation / Operational Notes

- After implementation, document the `@agentMethod` decorator pattern in code comments or future `docs/solutions/`
- Adding new agent-accessible methods: just add decorator, no prompt changes needed

## Sources & References

- **Origin document:** [docs/brainstorms/2026-04-23-schema-discovery-requirements.md](docs/brainstorms/2026-04-23-schema-discovery-requirements.md)
- Related code: `src/demo/runtime/graph.ts`, `src/demo/runtime/validator.ts`, `src/demo/agent/prompt.ts`
- External docs: https://zod.dev, https://github.com/StefanTerdell/zod-to-json-schema