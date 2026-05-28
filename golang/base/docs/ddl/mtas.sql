-- DROP TABLE IF EXISTS `mtas`
CREATE TABLE IF NOT EXISTS `mtas` (
  `uuid`        VARCHAR(36) PRIMARY KEY NOT NULL COMMENT '主键',
  `create_at`   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_at`   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '更新时间',
  `name`        VARCHAR(32) NOT NULL UNIQUE COMMENT '名称',
  `host`        VARCHAR(128) NOT NULL COMMENT '主机',
  `port`        INT NOT NULL DEFAULT 465 COMMENT '端口',
  `sslmode`     BOOLEAN NOT NULL DEFAULT TRUE COMMENT 'SSL模式',
  `sender`      VARCHAR(128) NOT NULL COMMENT '发件人',
  `replyto`     VARCHAR(128) COMMENT '回复地址',
  `username`    VARCHAR(128) COMMENT '用户名',
  `passwd`      VARCHAR(128) COMMENT '密码',
  `cc`          TEXT COMMENT '抄送',
  `bcc`         TEXT COMMENT '密送',
  `prefix`      VARCHAR(128) DEFAULT '' COMMENT '前缀',
  `sortno`      INT UNIQUE COMMENT '排序号',
  `nsent`       INT DEFAULT 0 COMMENT '发送次数',
  `disabled`    BOOLEAN DEFAULT FALSE COMMENT '是否禁用'
) COMMENT='邮件传输代理表';
