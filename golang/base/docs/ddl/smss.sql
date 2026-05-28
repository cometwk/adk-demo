DROP TABLE IF EXISTS `smss`;
CREATE TABLE IF NOT EXISTS `smss` (
  `uuid`        VARCHAR(36) NOT NULL COMMENT '主键',
  `isp`         VARCHAR(16) NOT NULL COMMENT 'ISP',
  `isp_name`    VARCHAR(64) NOT NULL COMMENT 'ISP名称',
  `appid`       VARCHAR(32) NOT NULL DEFAULT '' COMMENT '应用ID',
  `secret_id`   VARCHAR(64) NOT NULL DEFAULT '' COMMENT '密钥ID',
  `secret_key`  VARCHAR(64) NOT NULL DEFAULT '' COMMENT '密钥',
  `prefix`      VARCHAR(32) NOT NULL DEFAULT '' COMMENT '前缀',
  `textno1`     VARCHAR(32) NOT NULL DEFAULT '' COMMENT '文本号1',
  `textno2`     VARCHAR(32) NOT NULL DEFAULT '' COMMENT '文本号2',
  `textno3`     VARCHAR(32) NOT NULL DEFAULT '' COMMENT '文本号3',
  `textno4`     VARCHAR(32) NOT NULL DEFAULT '' COMMENT '文本号4',
  `sortno`      INT UNIQUE COMMENT '排序号',
  `nsent`       INT DEFAULT 0 COMMENT '发送次数',
  `disabled`    BOOLEAN DEFAULT FALSE COMMENT '是否禁用',
  `create_at`   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_at`   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`uuid`)
) COMMENT='短信服务表';

-- 默认添加 aliyun
INSERT INTO `smss` (`uuid`, `isp`, `isp_name`) VALUES ('1', 'aliyun', '阿里云');