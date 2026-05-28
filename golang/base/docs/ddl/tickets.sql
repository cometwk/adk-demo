-- DROP TABLE IF EXISTS `tickets`
CREATE TABLE IF NOT EXISTS `tickets` (
  `keyid`       VARCHAR(64) PRIMARY KEY NOT NULL COMMENT '主键',
  `create_at`   BIGINT NOT NULL COMMENT '创建时间',
  `expiry_at`   BIGINT NOT NULL COMMENT '过期时间',
  `code`        VARCHAR(64) NOT NULL COMMENT '代码',
  `failed`      INT NOT NULL DEFAULT 0 COMMENT '失败次数',
  `user_data`   VARCHAR(128) COMMENT '用户数据'
) COMMENT='票据表';
