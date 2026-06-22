-- DROP TABLE IF EXISTS chan;

CREATE TABLE IF NOT EXISTS chan (
  id                BIGINT NOT NULL COMMENT '分布式雪花ID',

  chan_no           VARCHAR(64) NOT NULL UNIQUE COMMENT '通道编号',
  chan_type         VARCHAR(64) COMMENT '通道类型（跟代码绑定，如 mock: 沙箱, ccb: 建行）',

  rate              BIGINT DEFAULT 0 COMMENT '费率, 十万分比率',
  name              VARCHAR(128) NOT NULL COMMENT '通道名称',

  remark            VARCHAR(255) COMMENT '备注',

  disabled          TINYINT NOT NULL DEFAULT 0 COMMENT '是否禁用',
  created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id)
) COMMENT='通道';
