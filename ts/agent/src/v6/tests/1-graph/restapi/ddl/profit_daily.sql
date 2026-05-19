
-- =========================================
-- 分润结算：定时任务 + T+1 结算
-- =========================================

-- DROP TABLE IF EXISTS `profit_daily`;
CREATE TABLE IF NOT EXISTS `profit_daily` (
  id                  BIGINT NOT NULL COMMENT '分布式雪花ID',
  stat_date           DATE NOT NULL COMMENT '统计日期（本地日）',

  -- 聚合维度
  agent_no            VARCHAR(64) NOT NULL COMMENT '代理商编号',
  agent_type          VARCHAR(32) NOT NULL COMMENT '代理类型: MERCH / CHAN',
  rate                BIGINT DEFAULT 0 COMMENT '分润比例, 十万分比率',

  -- 交易/退款统计（所有金额单位: 分）
  total_trade_amt     BIGINT NOT NULL DEFAULT 0 COMMENT '当日交易总金额',
  order_cnt           BIGINT NOT NULL DEFAULT 0 COMMENT '当日成功订单数',
  total_profit        BIGINT NOT NULL DEFAULT 0 COMMENT '当日分润总收入(基于交易)',

  total_refund_amt    BIGINT NOT NULL DEFAULT 0 COMMENT '当日退款总金额(原交易金额)',
  refund_cnt          BIGINT NOT NULL DEFAULT 0 COMMENT '当日退款笔数',
  total_refund_deduct BIGINT NOT NULL DEFAULT 0 COMMENT '当日退款需扣除的分润(负向支出)',

  net_profit          BIGINT NOT NULL DEFAULT 0 COMMENT '当日净分润 = total_profit - total_refund_deduct',

  -- 自己进件商户交易统计（apply=1 时累加）
  own_trade_amt     BIGINT NOT NULL DEFAULT 0 COMMENT '自己进件商户的交易金额(apply=1)',
  own_order_cnt     BIGINT NOT NULL DEFAULT 0 COMMENT '自己进件商户的订单数',
  own_profit        BIGINT NOT NULL DEFAULT 0 COMMENT '自己进件商户的分润收入(基于交易)',
  own_refund_amt    BIGINT NOT NULL DEFAULT 0 COMMENT '自己进件商户的退款金额(原交易金额)',
  own_refund_cnt    BIGINT NOT NULL DEFAULT 0 COMMENT '自己进件商户的退款笔数',
  own_refund_deduct BIGINT NOT NULL DEFAULT 0 COMMENT '自己进件商户的退款扣除分润',
  own_net_profit    BIGINT NOT NULL DEFAULT 0 COMMENT '自己进件商户的净分润 = own_profit - own_refund_deduct',

  status              INT NOT NULL DEFAULT 0 COMMENT '结算状态: 0=未结算, 1=审批中, 2=已审批/已结算',
  profit_settle_id    BIGINT NOT NULL DEFAULT 0 COMMENT '关联的结算记录ID',

  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uk_daily_agent (stat_date, agent_type, agent_no),
  -- 加入索引: 关联的结算记录ID
  KEY idx_profit_settle_id (profit_settle_id)
) COMMENT='代理商日分润统计';


