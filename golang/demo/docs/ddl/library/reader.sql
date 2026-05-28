-- DROP TABLE IF EXISTS lib_reader;

CREATE TABLE IF NOT EXISTS lib_reader (
  id                    BIGINT NOT NULL COMMENT '分布式雪花ID',

  reader_code           VARCHAR(64) NOT NULL UNIQUE COMMENT '读者编号',
  name                  VARCHAR(128) NOT NULL COMMENT '读者姓名',
  membership_level      VARCHAR(16) NOT NULL DEFAULT 'basic' COMMENT '会员等级: gold/silver/basic',
  current_borrow_count  INT NOT NULL DEFAULT 0 COMMENT '当前已借出未归还数量',
  registered_days       INT NOT NULL DEFAULT 0 COMMENT '注册距今天数',

  branch_id             BIGINT NOT NULL COMMENT '注册分馆ID',

  created_at            DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at            DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  INDEX idx_branch (branch_id)
) COMMENT='图书馆读者';
