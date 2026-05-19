-- DROP TABLE IF EXISTS agent_rel;

CREATE TABLE IF NOT EXISTS agent_rel (
  id                BIGINT NOT NULL COMMENT '分布式雪花ID',

  agent_no          VARCHAR(64) NOT NULL COMMENT '代理商编号',
  agent_type        VARCHAR(32) NOT NULL COMMENT '代理类型: MERCH or CHAN',
  agent_id          BIGINT NOT NULL COMMENT '代理商ID', -- 冗余

  obj_no            VARCHAR(64) NOT NULL COMMENT '对象编号: 商户编号或通道编号',  -- 注意 obj_no 是全局唯一的,obj_no 本质上包含有编号类型信息
  obj_name          VARCHAR(64) NOT NULL COMMENT '对象名称: 商户名称或通道名称', -- 冗余
  obj_id            BIGINT NOT NULL COMMENT '对象ID: 商户ID或通道ID', -- 冗余

  rate              BIGINT DEFAULT 0 COMMENT '分润比例, 十万分比率, 只有该字段参与分润计算',
  mode              TINYINT DEFAULT 2 NOT NULL COMMENT '分润模式: 1: 收益占比模式PERCENT,单位是百分比 or 2: 固定模式FIXED, 单位是十万分比', 
  rate_value        BIGINT DEFAULT 0 COMMENT '用户设置的值，不参与计算，每次设置后根据mode计算后写入rate字段', -- 当收益占比模式时，计算方法: rate = (merch.rate - chan.rate) * rate_value 
  apply             TINYINT DEFAULT 0 COMMENT '进件人标志：0: 不是，1: 是',

  created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uk_agent_rel (agent_no, obj_no)
) COMMENT='代理关系';
