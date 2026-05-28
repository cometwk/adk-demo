CREATE TABLE IF NOT EXISTS chan_merch (
  id                BIGINT NOT NULL COMMENT '分布式雪花ID',

  chan_merch_no     VARCHAR(64) NOT NULL COMMENT '机构商户号',
  chan_merch_name   VARCHAR(128) NOT NULL COMMENT '机构商户名称',
  chan_param        JSON NOT NULL  COMMENT '通道参数', -- 通道类型不同，参数字段都可能不一样, 由代码负责解释

  chan_no           VARCHAR(64) NOT NULL COMMENT '通道编号',
  chan_name         VARCHAR(64) NOT NULL COMMENT '通道名称', -- 冗余
  chan_type         VARCHAR(64) NOT NULL COMMENT '通道类型', -- 冗余
  chan_id           BIGINT NOT NULL DEFAULT 0 COMMENT '通道ID', -- 冗余

  merch_id          BIGINT NOT NULL DEFAULT 0 COMMENT '平台商户ID', -- 为0表示还未绑定
  merch_no          VARCHAR(64) NOT NULL DEFAULT '' COMMENT '平台商户编号', -- 冗余
  merch_name        VARCHAR(128) NOT NULL DEFAULT '' COMMENT '平台商户名称', -- 冗余
  active            TINYINT NOT NULL DEFAULT 0 COMMENT '是否被激活', -- 冗余 0: 未启用, 1: 启用 跟 merch.chan_merch_id = chan_merch.id 一致

  disabled          TINYINT NOT NULL DEFAULT 0 COMMENT '是否禁用',
  created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uq_chan_merch (chan_no, chan_merch_no)

) COMMENT='机构商户';
