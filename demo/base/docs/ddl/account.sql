-- DROP TABLE IF EXISTS `account`
CREATE TABLE IF NOT EXISTS `account` (
  `signupable`    BOOLEAN DEFAULT FALSE COMMENT '允许注册',
  `signupacl`     VARCHAR(36) DEFAULT '' COMMENT '注册ACL',
  `lookuserid`    BOOLEAN DEFAULT TRUE COMMENT '查看用户ID',
  `resetpass`     BOOLEAN DEFAULT TRUE COMMENT '重置密码',
  `sessduration`  INT DEFAULT 1440 COMMENT '会话时长(分钟)',
  `jwtsignkey`    VARCHAR(32) DEFAULT '' COMMENT 'JWT签名密钥',
  `jwtsignkey2`   VARCHAR(32) DEFAULT '' COMMENT 'JWT签名密钥2'
) COMMENT='账户配置表';
INSERT INTO `account` (`lookuserid`) VALUES (TRUE);
