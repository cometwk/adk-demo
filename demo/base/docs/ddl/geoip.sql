-- DROP TABLE IF EXISTS `geoip`
CREATE TABLE IF NOT EXISTS `geoip` (
  `amap_webkey`     VARCHAR(128) DEFAULT '' COMMENT '高德WebKey',
  `amap_enable`     BOOLEAN DEFAULT FALSE COMMENT '高德启用',
  `amap_apiver`     VARCHAR(8) DEFAULT 'v3' COMMENT '高德API版本',
  `tencent_webkey`  VARCHAR(128) DEFAULT '' COMMENT '腾讯WebKey',
  `tencent_enable`  BOOLEAN DEFAULT FALSE COMMENT '腾讯启用'
) COMMENT='地理位置IP表';
INSERT INTO `geoip` (`amap_webkey`) VALUES ('');
