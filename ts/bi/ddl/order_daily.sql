
-- 商户日报统计(导入)
CREATE TABLE IF NOT EXISTS `order_daily` (
  `id`            BIGINT        NOT NULL COMMENT '分布式雪花ID',

  -- 维度字段
  `report_date`   DATE          NOT NULL COMMENT '结算日期',

  -- 商户信息
  `merch_id`      BIGINT        NOT NULL COMMENT '商户ID', -- 冗余
  `merch_no`      VARCHAR(32)   NOT NULL DEFAULT '' COMMENT '商户编号',
  `merch_name`    VARCHAR(64)   NOT NULL DEFAULT '' COMMENT '商户名称',

  -- 通道信息
  `chan_id`       BIGINT        NOT NULL COMMENT '通道ID', -- 冗余
  `chan_no`       VARCHAR(32)   NOT NULL COMMENT '通道编号',
  `chan_merch_no` VARCHAR(32)            COMMENT '通道机构商户号',

  -- 统计指标
  `total_count`   INT           NOT NULL DEFAULT 0 COMMENT '总订单数',
  `total_amount`  BIGINT        NOT NULL DEFAULT 0 COMMENT '总交易额(分)',

  `created_at`    DATETIME      NOT NULL COMMENT '要求在代码中设置, 避免差异',
  `updated_at`    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_report_date_merch_chan` (`report_date`, `merch_no`, `chan_no`)

) COMMENT='商户日报统计(导入)';
