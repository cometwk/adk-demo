-- DROP TABLE IF EXISTS `dict_cats`
CREATE TABLE IF NOT EXISTS `dict_cats` (
  `cat`       VARCHAR(36) NOT NULL COMMENT '分类',
  `label`     VARCHAR(64) NOT NULL COMMENT '分类名称',
  `remark`    VARCHAR(256) DEFAULT '' COMMENT '备注',
  `builtin`   BOOLEAN NOT NULL DEFAULT FALSE COMMENT '是否系统内置',
  PRIMARY KEY (`cat`)
) COMMENT='数据字典分类表';
