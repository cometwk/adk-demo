-- DROP TABLE IF EXISTS `bulletins`
CREATE TABLE IF NOT EXISTS `bulletins` (
  `uuid`        VARCHAR(36) PRIMARY KEY NOT NULL COMMENT '主键',
  `create_at`   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `user_uuid`   VARCHAR(36) NOT NULL COMMENT '用户UUID',
  `title`       VARCHAR(256) NOT NULL COMMENT '标题',
  `content`     TEXT NOT NULL COMMENT '内容',
  `send_time`   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '发送时间',
  `is_public`   BOOLEAN DEFAULT FALSE COMMENT '是否公开',
  `is_notify`   BOOLEAN DEFAULT TRUE COMMENT '是否通知',
  `status`      INT NOT NULL DEFAULT 1 COMMENT '状态: 1. 草稿, 2. 等待发布, 3. 发布成功, 4. 发布失败',
  `nread`       INT NOT NULL DEFAULT 0 COMMENT '阅读次数',
  `nstar`       INT NOT NULL DEFAULT 0 COMMENT '收藏次数'
) COMMENT='公告表';
