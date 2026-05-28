-- DROP TABLE IF EXISTS merch;

CREATE TABLE IF NOT EXISTS merch (
  id                BIGINT NOT NULL COMMENT '分布式雪花ID',

  merch_no          VARCHAR(64) NOT NULL UNIQUE COMMENT '商户编号',
  rate              BIGINT DEFAULT 0 COMMENT '费率, 十万分比率',
  name              VARCHAR(128) NOT NULL COMMENT '商户名称',
  contact_name      VARCHAR(64) COMMENT '联系人姓名',
  contact_phone     VARCHAR(32) COMMENT '联系人手机号',
  address           VARCHAR(255) COMMENT '商户地址',
  apply_date        DATE NOT NULL COMMENT '进件日期', -- 签约日期

  chan_merch_id     BIGINT  COMMENT '当前机构商户', -- 商户在一个通道上，可能存在多个账户
  chan_merch_no     VARCHAR(64) COMMENT '机构商户编号', -- 冗余
  chan_merch_name   VARCHAR(128) COMMENT '机构商户名称', -- 冗余

  api_key           VARCHAR(128) COMMENT '商户API密钥',

  remark            VARCHAR(255) COMMENT '备注',

  apply_info        TEXT COMMENT '请求参数', -- 对应于 apply_info struct

  disabled          TINYINT NOT NULL DEFAULT 0 COMMENT '是否禁用',
  created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id)
) COMMENT='商户';

