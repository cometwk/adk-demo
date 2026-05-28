-- DROP TABLE IF EXISTS lib_branch;

CREATE TABLE IF NOT EXISTS lib_branch (
  id                      BIGINT NOT NULL COMMENT '分布式雪花ID',

  branch_code             VARCHAR(64) NOT NULL UNIQUE COMMENT '分馆编号',
  name                    VARCHAR(128) NOT NULL COMMENT '分馆名称',
  max_borrow_per_reader   INT NOT NULL DEFAULT 3 COMMENT '每位读者可同时借阅上限',
  new_book_protection_days INT NOT NULL DEFAULT 7 COMMENT '新书保护期（天）：上架不足此天数不允许外借',
  allow_inter_library_loan TINYINT NOT NULL DEFAULT 0 COMMENT '是否支持馆际互借: 0-否, 1-是',

  created_at              DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at              DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id)
) COMMENT='图书馆分馆';
