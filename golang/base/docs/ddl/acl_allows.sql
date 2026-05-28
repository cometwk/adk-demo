-- DROP TABLE IF EXISTS `acl_allows`
CREATE TABLE IF NOT EXISTS `acl_allows` (
  `uuid`        VARCHAR(36) PRIMARY KEY NOT NULL COMMENT '主键',
  `acl`         VARCHAR(36) NOT NULL COMMENT '访问控制UUID',
  `code`        INT NOT NULL COMMENT '代码',
  `title`       VARCHAR(64) NOT NULL COMMENT '标题',
  `url`         VARCHAR(128) NOT NULL COMMENT 'URL',
  `iread`       BOOLEAN NOT NULL DEFAULT TRUE COMMENT '读权限',
  `iwrite`      BOOLEAN NOT NULL DEFAULT FALSE COMMENT '写权限',
  `iadmin`      BOOLEAN NOT NULL DEFAULT FALSE COMMENT '管理权限'
) COMMENT='访问控制权限表';
CREATE UNIQUE INDEX `acl_allows_acl_code` ON `acl_allows`(`acl`, `code`);
-- CREATE UNIQUE INDEX `acl_allows_acl_url` ON `acl_allows`(`acl`, `url`);

INSERT INTO `acl_allows` (
  `uuid`, `acl`, `code`, `title`, `url`, `iread`, `iwrite`, `iadmin`
) VALUES (
  'd17a5324-63d4-4bdb-998e-c5ec52c80bc1', '7e9633f6-c83a-49a4-9a96-e120d6ca6055',
  9000, '用户管理', '/system/user', TRUE, TRUE, TRUE
);
INSERT INTO `acl_allows` (
  `uuid`, `acl`, `code`, `title`, `url`, `iread`, `iwrite`, `iadmin`
) VALUES (
  '669d23b1-be43-40c8-8f7f-c013d217b1e8', '7e9633f6-c83a-49a4-9a96-e120d6ca6055',
  9010, '访问控制', '/system/acl', TRUE, TRUE, TRUE
);
