-- DROP TABLE IF EXISTS `apply`;

-- 商户进件申请主表 (`apply`)
CREATE TABLE `apply` (
  id                BIGINT NOT NULL COMMENT '分布式雪花ID, 只是前端使用',
  agent_no          VARCHAR(32) NOT NULL COMMENT '代理商编号', 

  -- 服务商信息, 废弃
  saas_no           VARCHAR(32) NOT NULL DEFAULT '' COMMENT '服务商编号',
  out_apply_no      VARCHAR(32) NOT NULL DEFAULT '' COMMENT '服务商申请号, 服务商内唯一',
  apply_no          VARCHAR(32) NOT NULL COMMENT '平台进件单号',

  rate              BIGINT DEFAULT 0 COMMENT '签约费率, 十万分比率',
  branch_id         VARCHAR(32) NOT NULL COMMENT '网点ID', -- 105361054020 12位
  userid            VARCHAR(32) NOT NULL DEFAULT ''  COMMENT '用户ID', -- 没有使用到
  remark            VARCHAR(256) DEFAULT '' COMMENT '备注',

  -- 申请状态(通道)
  status            INT DEFAULT 1 COMMENT '申请状态:0-INIT, 1-PENDING, 2-SUCCESS, 3-FAIL',
  status_reason     VARCHAR(128) COMMENT '造成申请状态的原因说明',
  query_count       INT DEFAULT 0 COMMENT '已查询次数',
  next_query_time   DATETIME COMMENT '下次查询时间',

  -- 通知状态(商户)
  notify            INT DEFAULT 1 COMMENT '通知状态: 1-PENDING, 2-SUCCESS, 3-FAIL',
  notify_reason     VARCHAR(128) COMMENT '造成通知状态的原因说明',
  notify_count      INT DEFAULT 0 COMMENT '已重试次数',
  next_notify_time  DATETIME COMMENT '下次通知时间',
  notify_url        VARCHAR(256) COMMENT '商户异步通知URL',

  -- 商户信息
  merch_name        VARCHAR(128) NOT NULL COMMENT '商户名称', -- 商户名称, 申请时录入
  merch_id          BIGINT NOT NULL COMMENT '商户ID', -- 废弃
  merch_no          VARCHAR(32) NOT NULL COMMENT '商户编号', -- 申请成功后的关联商户编号

  -- 机构商户
  chan_merch_id     BIGINT NOT NULL COMMENT '机构商户ID', -- 申请成功后分配
  chan_merch_no     VARCHAR(64) NOT NULL COMMENT '机构商户号', -- 冗余
  chan_merch_name   VARCHAR(128) NOT NULL COMMENT '机构商户名称', -- 冗余

  -- 支付通道 TODO ???
  -- chan_type         VARCHAR(64) NOT NULL COMMENT '通道类型', -- 初始化指定，目前只支持一对一, 比如 MOCK or CCB
 
  -- 联系人信息
  contact_name      VARCHAR(64) COMMENT '联系人姓名',
  contact_phone     VARCHAR(32) COMMENT '联系人手机号',

  req_params        TEXT COMMENT '请求参数', -- 对应于 apply_info struct

  
  disabled          TINYINT NOT NULL DEFAULT 0 COMMENT '是否禁用',
  created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (`id`)
) COMMENT='代理商商户进件申请主表';
