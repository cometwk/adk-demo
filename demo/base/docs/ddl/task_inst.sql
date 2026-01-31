-- DROP TABLE IF EXISTS `task_inst`
CREATE TABLE IF NOT EXISTS `task_inst` (
  `uuid`        VARCHAR(36) PRIMARY KEY NOT NULL COMMENT '任务实例ID, reqid',
  `create_at`   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_at`   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '更新时间',
  `task_uuid`   VARCHAR(36) NOT NULL COMMENT '任务UUID',
  `task_name`   VARCHAR(64) NOT NULL COMMENT '任务名称',
  `task_type`   INT NOT NULL COMMENT '任务类型',
  `code`        INT NOT NULL DEFAULT 0 COMMENT '状态码: 200, 400, 500',
  `message`     TEXT NOT NULL COMMENT '消息',
  `elapsed`     INT NOT NULL DEFAULT 0 COMMENT '耗时(毫秒)'
) COMMENT='任务实例表';
