-- DROP TABLE IF EXISTS `users`
CREATE TABLE IF NOT EXISTS `users` (
  `uuid`            VARCHAR(36) PRIMARY KEY NOT NULL COMMENT '主键',
  `create_at`       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_at`       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '更新时间',
  `signin_at`       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '最后登录时间',
  `disabled`        BOOLEAN NOT NULL DEFAULT FALSE COMMENT '是否禁用',
  `deleted`         BOOLEAN NOT NULL DEFAULT FALSE COMMENT '是否删除',
  `userid`          VARCHAR(128) UNIQUE NOT NULL COMMENT '用户ID',
  `passwd`          VARCHAR(256) NOT NULL COMMENT '密码',
  `name`            VARCHAR(64) DEFAULT '' COMMENT '姓名',
  `avatar`          VARCHAR(36) DEFAULT '' COMMENT '头像',
  `email`           VARCHAR(128) NOT NULL COMMENT '邮箱', 
  `mobile`          VARCHAR(16) NOT NULL COMMENT '手机号',
  `idno`            VARCHAR(32) NOT NULL DEFAULT '' COMMENT '身份证号',
  `address`         VARCHAR(256) DEFAULT '' COMMENT '地址',
  `acct_name`       VARCHAR(64) DEFAULT '' COMMENT '账户名',
  `acct_no`         VARCHAR(64) DEFAULT '' COMMENT '账户号',
  `acct_idno`       VARCHAR(64) DEFAULT '' COMMENT '账户身份证号',
  `acct_mobile`     VARCHAR(16) DEFAULT '' COMMENT '账户手机号',
  `acct_bank_name`  VARCHAR(256) DEFAULT '' COMMENT '账户银行名称',
  `tfa`             BOOLEAN NOT NULL DEFAULT TRUE COMMENT '双因素认证',
  `acl`             VARCHAR(36) NOT NULL COMMENT '访问控制',
  `bind_no`         VARCHAR(36) NOT NULL default '' COMMENT '绑定编号', -- 代理商或商户编号
  `bind_name`       VARCHAR(64) NOT NULL default '' COMMENT '绑定名称', -- 代理商或商户名称
  `secretcode`      VARCHAR(256) NOT NULL DEFAULT '' COMMENT '密钥码',
  `totp_secret`     VARCHAR(256) NOT NULL DEFAULT '' COMMENT 'TOTP密钥',
  `n_signin`        INT NOT NULL DEFAULT 0 COMMENT '登录次数',
  `noti_popup`      BOOLEAN DEFAULT TRUE COMMENT '弹窗通知',
  `noti_browser`    BOOLEAN DEFAULT FALSE COMMENT '浏览器通知',
  `noti_mail`       BOOLEAN DEFAULT FALSE COMMENT '邮件通知'
) COMMENT='用户表';
