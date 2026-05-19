import { describe, expect, it } from 'vitest'
import { buildOntology } from '../../../runtime/ontology-builder'
import { validateRelationBindings } from '../../../ontology/validate-bindings'
import './ontology'
import { libraryRelationBindings } from './bindings'

describe('libraryRelationBindings', () => {
  it('covers all RelationSchema types from ontology', () => {
    const ontology = buildOntology({ version: 'test' })
    expect(() => validateRelationBindings(ontology.relations, libraryRelationBindings)).not.toThrow()
  })
})
