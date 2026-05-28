-- DROP TABLE IF EXISTS lib_category;

CREATE TABLE IF NOT EXISTS lib_category (
  id                          BIGINT NOT NULL COMMENT '分布式雪花ID',

  category_code               VARCHAR(64) NOT NULL UNIQUE COMMENT '类目编号',
  name                        VARCHAR(128) NOT NULL COMMENT '类目名称',
  is_restricted               TINYINT NOT NULL DEFAULT 0 COMMENT '是否为限制类目: 0-否, 1-是',
  required_membership_level   VARCHAR(16) NOT NULL DEFAULT 'basic' COMMENT '借阅所需最低会员等级: gold/silver/basic',

  created_at                  DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at                  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id)
) COMMENT='图书类目';
