-- DROP TABLE IF EXISTS `signin_history`
CREATE TABLE IF NOT EXISTS `signin_history` (
  `uuid`        VARCHAR(36) PRIMARY KEY NOT NULL COMMENT '主键',
  `create_at`   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `user_uuid`   VARCHAR(36) NOT NULL COMMENT '用户UUID',
  `userid`      VARCHAR(128) NOT NULL COMMENT '用户ID',
  `name`        VARCHAR(64) NOT NULL COMMENT '姓名',
  `ip`          VARCHAR(128) NOT NULL DEFAULT '' COMMENT 'IP地址',
  `country`     VARCHAR(64) DEFAULT '' COMMENT '国家',
  `province`    VARCHAR(64) DEFAULT '' COMMENT '省份',
  `city`        VARCHAR(64) DEFAULT '' COMMENT '城市',
  `district`    VARCHAR(64) DEFAULT '' COMMENT '区县',
  `longitude`   FLOAT DEFAULT 0 COMMENT '经度',
  `latitude`    FLOAT DEFAULT 0 COMMENT '纬度',
  `ua`          VARCHAR(512) NOT NULL DEFAULT '' COMMENT '用户代理',
  `clientid`    VARCHAR(36) NOT NULL COMMENT '客户端ID',
  `trust`       BOOLEAN COMMENT '是否信任',
  `tfa`         INT DEFAULT 0 COMMENT '双因素认证类型: 0. 无, 1. 短信, 2. 动态密码',
  `act_type`    INT NOT NULL DEFAULT 1 COMMENT '操作类型: 1. 系统账号登录, 2. 三方账号登录',
  `oauthp`      VARCHAR(32) NOT NULL DEFAULT '' COMMENT 'OAuth提供商'
) COMMENT='登录历史表';
