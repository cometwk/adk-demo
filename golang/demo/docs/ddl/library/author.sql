-- DROP TABLE IF EXISTS lib_author;

CREATE TABLE IF NOT EXISTS lib_author (
  id                  BIGINT NOT NULL COMMENT '分布式雪花ID',

  author_code         VARCHAR(64) NOT NULL UNIQUE COMMENT '作者编号',
  name                VARCHAR(128) NOT NULL COMMENT '作者姓名',
  nationality         VARCHAR(64) COMMENT '国籍',
  active_book_count   INT NOT NULL DEFAULT 0 COMMENT '当前在馆作品数量',

  created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id)
) COMMENT='书籍作者';
