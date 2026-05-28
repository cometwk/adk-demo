-- DROP TABLE IF EXISTS `acl`
CREATE TABLE IF NOT EXISTS `acl` (
  `uuid`        VARCHAR(36) PRIMARY KEY NOT NULL COMMENT '主键',
  `create_at`   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_at`   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '更新时间',
  `code`        INT NOT NULL UNIQUE COMMENT '代码',
  `name`        VARCHAR(64) NOT NULL UNIQUE COMMENT '名称',
  `summary`     VARCHAR(512) NOT NULL COMMENT '摘要',
  `features`    TEXT NOT NULL COMMENT '功能'
) COMMENT='访问控制表';
INSERT INTO `acl` (`uuid`, `code`, `name`, `summary`, `features`) VALUES (
  '7e9633f6-c83a-49a4-9a96-e120d6ca6055', 0, '系统管理', '可以访问系统所有功能', 'event'
);
