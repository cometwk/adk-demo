-- DROP TABLE IF EXISTS `dicts`
CREATE TABLE IF NOT EXISTS `dicts` (
  `cat`       VARCHAR(36) NOT NULL COMMENT '分类',
  `value`     VARCHAR(256) DEFAULT '' COMMENT '值',
  `label`     VARCHAR(64) NOT NULL COMMENT '显示名称',
  `code`      VARCHAR(256) DEFAULT '' COMMENT '编码,特殊目的',
  `seqno`     VARCHAR(64) DEFAULT '' COMMENT '排序',
  `remark`    VARCHAR(256) DEFAULT '' COMMENT '备注',
  `builtin`   BOOLEAN NOT NULL DEFAULT FALSE COMMENT '内置不能修改',
  `parent`    VARCHAR(36) DEFAULT '' COMMENT 'Tree 结构',
  `uuid`      VARCHAR(36) NOT NULL COMMENT '主键',
  CONSTRAINT `dicts_cat_val` UNIQUE (`cat`, `value`),
  PRIMARY KEY (`uuid`)
) COMMENT='数据字典表';
