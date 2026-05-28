-- DROP TABLE IF EXISTS lib_book;

CREATE TABLE IF NOT EXISTS lib_book (
  id                  BIGINT NOT NULL COMMENT '分布式雪花ID',

  book_code           VARCHAR(64) NOT NULL UNIQUE COMMENT '书籍编号',
  title               VARCHAR(256) NOT NULL COMMENT '书名',
  isbn                VARCHAR(32) NOT NULL COMMENT 'ISBN编号',
  days_on_shelf       INT NOT NULL DEFAULT 0 COMMENT '上架距今天数',
  total_copies        INT NOT NULL DEFAULT 1 COMMENT '馆藏总册数',
  available_copies    INT NOT NULL DEFAULT 1 COMMENT '当前可借册数',
  series_volume       INT NOT NULL DEFAULT 0 COMMENT '系列卷号（0=非系列书）',

  author_id           BIGINT NOT NULL COMMENT '作者ID',
  category_id         BIGINT NOT NULL COMMENT '类目ID',
  series_id           BIGINT NOT NULL DEFAULT 0 COMMENT '系列ID（0=非系列书）',

  created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  INDEX idx_author (author_id),
  INDEX idx_category (category_id),
  INDEX idx_series (series_id)
) COMMENT='馆藏书籍';
