-- DROP TABLE IF EXISTS `debug`
CREATE TABLE IF NOT EXISTS `debug` (
  `debug`       BOOLEAN DEFAULT TRUE COMMENT '调试开关'
) COMMENT='调试配置表';
INSERT INTO `debug` (`debug`) VALUES (TRUE);
