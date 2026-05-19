/** 关系类型 → 物理存储映射（DML 层，与 RelationSchema 分离） */

export type RelationBinding = JunctionBinding | ForeignKeyBinding | InverseForeignKeyBinding

/** 关联表：多对多或一对多事实表 */
export type JunctionBinding = {
  kind: 'junction'
  table: string
  fromColumn: string
  toColumn: string
  /** 可选：限制边类型；同一表多关系时用 where 区分 */
  where?: string
}

/** 源表上的外键列 → 目标表一行 */
export type ForeignKeyBinding = {
  kind: 'fk'
  onType: string
  column: string
  toType: string
}

/** 目标表上的外键指向源（入边懒查时用） */
export type InverseForeignKeyBinding = {
  kind: 'inverse_fk'
  onType: string
  column: string
  fromType: string
}

export type RelationBindingMap = Record<string, RelationBinding>
