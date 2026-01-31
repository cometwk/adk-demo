-- DROP TABLE IF EXISTS `tree`
CREATE TABLE IF NOT EXISTS `tree` (
  `uuid`        VARCHAR(36) PRIMARY KEY NOT NULL COMMENT '主键',
  `create_at`   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_at`   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '更新时间',
  `name`        VARCHAR(64) NOT NULL COMMENT '名称',
  `summary`     VARCHAR(256) NOT NULL DEFAULT '' COMMENT '摘要',
  `up`          VARCHAR(36) NOT NULL DEFAULT '' COMMENT '上级',
  `tpath`       TEXT NOT NULL COMMENT '路径',
  `tpath_hash`  VARCHAR(32) NOT NULL COMMENT '路径哈希',
  `nlevel`      INT NOT NULL COMMENT '层级',
  `disabled`    BOOLEAN DEFAULT FALSE COMMENT '是否禁用',
  `sortno`      INT NOT NULL COMMENT '排序号'
) COMMENT='树形结构表';
CREATE UNIQUE INDEX `tree_path_hash` ON `tree`(`tpath_hash`);

INSERT INTO `tree` (`uuid`, `name`, `summary`, `tpath`, `tpath_hash`, `nlevel`, `sortno`) VALUES (
  '6e0c44c6-08ef-48d8-b48e-69c9903cc3f1',
  '根', '根节点', '0', 'cfcd208495d565ef66e7dff9f98764da', 1, 1
);
