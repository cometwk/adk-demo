import type { RelationBindingMap } from '../../../ontology/relation-binding'

/** 图书馆领域：关系类型 → 物理表/FK 映射（SqlGraphStore 使用） */
export const libraryRelationBindings: RelationBindingMap = {
  borrows: {
    kind: 'junction',
    table: 'borrow_record',
    fromColumn: 'reader_id',
    toColumn: 'book_id',
    where: "status = 'active'",
  },
  overdue: {
    kind: 'junction',
    table: 'borrow_record',
    fromColumn: 'reader_id',
    toColumn: 'book_id',
    where: "status = 'overdue'",
  },
  reserves: {
    kind: 'junction',
    table: 'reservation',
    fromColumn: 'reader_id',
    toColumn: 'book_id',
  },
  registered_at: {
    kind: 'fk',
    onType: 'Reader',
    column: 'branch_id',
    toType: 'Branch',
  },
  written_by: {
    kind: 'fk',
    onType: 'Book',
    column: 'author_id',
    toType: 'Author',
  },
  belongs_to: {
    kind: 'fk',
    onType: 'Book',
    column: 'category_id',
    toType: 'Category',
  },
  part_of: {
    kind: 'fk',
    onType: 'Book',
    column: 'series_id',
    toType: 'Series',
  },
  available_at: {
    kind: 'junction',
    table: 'branch_inventory',
    fromColumn: 'book_id',
    toColumn: 'branch_id',
  },
  specializes_in: {
    kind: 'junction',
    table: 'author_category',
    fromColumn: 'author_id',
    toColumn: 'category_id',
  },
  partners_with: {
    kind: 'junction',
    table: 'branch_partner',
    fromColumn: 'branch_id',
    toColumn: 'partner_branch_id',
  },
}
