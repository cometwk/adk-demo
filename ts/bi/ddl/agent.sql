-- DROP TABLE IF EXISTS agent;

CREATE TABLE IF NOT EXISTS agent (
  id                BIGINT NOT NULL COMMENT '分布式雪花ID',

  agent_no          VARCHAR(64) NOT NULL UNIQUE COMMENT '代理商编号',
  name              VARCHAR(128) NOT NULL COMMENT '代理商名称',
  contact_name      VARCHAR(64) COMMENT '联系人姓名',
  contact_phone     VARCHAR(32) NOT NULL UNIQUE COMMENT '联系人手机号',

  disabled          TINYINT NOT NULL DEFAULT 0 COMMENT '是否禁用', -- 禁用后，不参与分润

  rate              BIGINT DEFAULT 0 COMMENT '备注费率', -- 十万分比, 用于助记代理商的成本
  notify            TINYINT NOT NULL DEFAULT 0 COMMENT '是否发送进件通知', -- 0: 不发送, 1: 发送

  created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  parent_id BIGINT NOT NULL DEFAULT 0 COMMENT '直接父节点（仅辅助）',
  sort INT NOT NULL DEFAULT 0 COMMENT '同级排序',

  INDEX idx_parent (parent_id),
  PRIMARY KEY (id)
) COMMENT='代理';
