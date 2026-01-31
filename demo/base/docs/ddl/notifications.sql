-- DROP TABLE IF EXISTS `notifications`
CREATE TABLE IF NOT EXISTS `notifications` (
  `uuid`        VARCHAR(36) PRIMARY KEY NOT NULL COMMENT '主键',
  `create_at`   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `user_uuid`   VARCHAR(36) NOT NULL COMMENT '用户UUID',
  `type`        INT NOT NULL DEFAULT 1 COMMENT '类型: 1. 通知, 2. 公告',
  `title`       VARCHAR(256) NOT NULL COMMENT '标题',
  `content`     TEXT NOT NULL COMMENT '内容',
  `status`      INT NOT NULL DEFAULT 1 COMMENT '状态: 1. 未读, 2. 已读',
  `refer`       VARCHAR(36) COMMENT '引用'
) COMMENT='通知表';
