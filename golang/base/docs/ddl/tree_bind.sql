-- DROP TABLE IF EXISTS `tree_bind`
CREATE TABLE IF NOT EXISTS `tree_bind` (
  `uuid`        VARCHAR(36) PRIMARY KEY NOT NULL COMMENT '主键',
  `create_at`   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `node`        VARCHAR(36) NOT NULL COMMENT '节点',
  `entity`      VARCHAR(36) NOT NULL COMMENT '实体',
  `type`        INT NOT NULL COMMENT '类型'
) COMMENT='树形结构绑定表';
CREATE UNIQUE INDEX `tree_bind_node_entity_type` ON `tree_bind`(`node`, `entity`, `type`);
