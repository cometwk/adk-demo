-- DROP TABLE IF EXISTS lib_series;

CREATE TABLE IF NOT EXISTS lib_series (
  id                BIGINT NOT NULL COMMENT '分布式雪花ID',

  series_code       VARCHAR(64) NOT NULL UNIQUE COMMENT '系列编号',
  name              VARCHAR(128) NOT NULL COMMENT '系列名称',
  total_volumes     INT NOT NULL COMMENT '系列总卷数',

  created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id)
) COMMENT='系列丛书';
