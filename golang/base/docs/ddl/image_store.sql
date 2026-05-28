-- DROP TABLE IF EXISTS `image_store`
CREATE TABLE IF NOT EXISTS `image_store` (
  `place`       INT NOT NULL DEFAULT 1 COMMENT '存储位置: 1. 数据库, 2. 文件系统',
  `rootpath`    VARCHAR(256) NOT NULL DEFAULT '' COMMENT '根路径'
) COMMENT='图片存储配置表';
INSERT INTO `image_store` (`place`) VALUES (1);
