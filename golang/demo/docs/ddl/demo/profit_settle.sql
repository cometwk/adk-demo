
-- =========================================
-- 分润结算表
-- =========================================

-- DROP TABLE IF EXISTS `profit_settle`;
CREATE TABLE IF NOT EXISTS `profit_settle` (
  id                  BIGINT NOT NULL COMMENT '分布式雪花ID',

  start_date          DATE NOT NULL COMMENT '结算开始日期（本地日）',
  end_date            DATE NOT NULL COMMENT '结算结束日期（本地日）', -- [start_date, end_date] 闭区间，即 stat_date BETWEEN start_date AND end_date

  agent_no            VARCHAR(64) NOT NULL COMMENT '代理商编号',
  agent_type          VARCHAR(32) NOT NULL COMMENT '代理类型: MERCH / CHAN',
  agent_name          VARCHAR(128) NOT NULL COMMENT '代理商名称',

  -- 交易/退款统计（所有金额单位: 分）
  total_trade_amt     BIGINT NOT NULL DEFAULT 0 COMMENT '结算期间交易总金额',
  order_cnt           BIGINT NOT NULL DEFAULT 0 COMMENT '结算期间成功订单数',
  total_profit        BIGINT NOT NULL DEFAULT 0 COMMENT '结算期间分润总收入(基于交易)',
  total_refund_amt    BIGINT NOT NULL DEFAULT 0 COMMENT '结算期间退款总金额(原交易金额)',
  refund_cnt          BIGINT NOT NULL DEFAULT 0 COMMENT '结算期间退款笔数',
  total_refund_deduct BIGINT NOT NULL DEFAULT 0 COMMENT '结算期间退款需扣除的分润(负向支出)',
  net_profit          BIGINT NOT NULL DEFAULT 0 COMMENT '结算期间净分润 = total_profit - total_refund_deduct',

  status              INT NOT NULL DEFAULT 0 COMMENT '结算状态: 0=未结算, 1=审批中, 2=已审批/已结算',

  file_id             BIGINT NOT NULL DEFAULT 0 COMMENT '结算凭证图片ID',
  remark              VARCHAR(128) NOT NULL DEFAULT '' COMMENT '结算备注',

  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uk_settle_agent (start_date, end_date, agent_type, agent_no),
  KEY idx_settle_date (start_date, end_date),
  KEY idx_agent (agent_type, agent_no)
) COMMENT='代理商分润结算';


