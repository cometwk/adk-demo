-- DROP TABLE IF EXISTS `user_oauth`
CREATE TABLE IF NOT EXISTS `user_oauth` (
  `uuid`        VARCHAR(36) PRIMARY KEY NOT NULL COMMENT '主键',
  `create_at`   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `user_uuid`   VARCHAR(36) NOT NULL COMMENT '用户UUID',
  `provider`    VARCHAR(32) NOT NULL COMMENT '提供商',
  `userid`      VARCHAR(256) NOT NULL DEFAULT '' COMMENT '用户ID',
  `email`       VARCHAR(128) NOT NULL DEFAULT '' COMMENT '邮箱',
  `login`       VARCHAR(128) NOT NULL DEFAULT '' COMMENT '登录名',
  `name`        VARCHAR(128) NOT NULL DEFAULT '' COMMENT '姓名',
  `avatar`      VARCHAR(256) NOT NULL DEFAULT '' COMMENT '头像',
  `profile`     TEXT NULL COMMENT '资料',
  `status`      INT NOT NULL DEFAULT 1 COMMENT '状态: 1. 未授权, 2. 已授权',
  `usage`       INT NOT NULL DEFAULT 1 COMMENT '用途: 1. 授权, 2. 登录'
) COMMENT='用户OAuth表';
