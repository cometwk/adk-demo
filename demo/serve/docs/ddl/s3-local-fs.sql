-- Local FS 对象存储（类 S3）：单表 file_blobs（hash 去重，对外 id）
-- DROP TABLE IF EXISTS `file_blobs`;

CREATE TABLE IF NOT EXISTS `file_blobs` (
  `id`            BIGINT NOT NULL COMMENT '分布式雪花ID',
  `hash`          CHAR(64) NOT NULL COMMENT 'SHA-256 hex（内容唯一键）',
  `filename`      VARCHAR(255) NOT NULL COMMENT '原始文件名',
  `size`          BIGINT NOT NULL COMMENT '内容大小（字节）',
  `mime_type`     VARCHAR(128) NOT NULL DEFAULT '' COMMENT 'MIME 类型（可选）',
  `storage_path`  VARCHAR(255) NOT NULL COMMENT '本地存储路径（/<root>/<2>/<2>/<hash>）',
  `ref_count`     INT NOT NULL DEFAULT 1 COMMENT '引用计数（预留给 GC）',

  `created_at`    DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_file_blobs_hash` (`hash`)
) COMMENT='文件内容实体（按 hash 去重）';
