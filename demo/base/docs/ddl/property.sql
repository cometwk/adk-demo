-- DROP TABLE IF EXISTS `property`
CREATE TABLE IF NOT EXISTS `property` (
  `name`     VARCHAR(64) PRIMARY KEY COMMENT '主键',
  `value`    VARCHAR(300) COMMENT '值',
  `revision` BIGINT DEFAULT 0 COMMENT '乐观锁版本号'
) COMMENT='属性表';
