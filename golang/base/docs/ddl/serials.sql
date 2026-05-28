-- DROP TABLE IF EXISTS `serials`
CREATE TABLE IF NOT EXISTS `serials` (
  `n`           BIGINT DEFAULT 0 COMMENT '序列号'
) COMMENT='序列号表';
INSERT INTO `serials` (`n`) VALUES (0);
