package biz

import (
	"time"
)

type PKey struct {
	Abbr      string    `xorm:"varchar(64) pk"       json:"abbr"`       // 缩写
	Name      string    `xorm:"varchar(64)"          json:"name"`       // 名称
	Py        string    `xorm:"varchar(64)"          json:"py"`         // 名称拼音
	Ref       string    `xorm:"varchar(64)"          json:"ref"`        // 参考值
	Unit      string    `xorm:"varchar(64)"          json:"unit"`       // 单位
	Notes     string    `xorm:"varchar(1024)"        json:"notes"`      // 备注
	CreatedAt time.Time `xorm:"created 'created_at'" json:"created_at"` // 创建时间
	UpdatedAt time.Time `xorm:"updated 'updated_at'" json:"updated_at"` // 更新时间
}

// FileBlob 文件内容实体（按 hash 去重，对外 id）
type FileBlob struct {
	ID          int64  `xorm:"bigint not null pk 'id'"                      json:"id,string"` // 分布式雪花ID
	Hash        string `xorm:"char(64) not null unique 'hash'"              json:"hash"`      // SHA-256 hex
	Filename    string `xorm:"varchar(255) not null 'filename'"             json:"filename"`
	Size        int64  `xorm:"bigint not null 'size'"                       json:"size"` // 内容大小（字节）
	MimeType    string `xorm:"varchar(128) not null default '' 'mime_type'" json:"mime_type"`
	StoragePath string `xorm:"varchar(255) not null 'storage_path'"         json:"storage_path"`
	RefCount    int    `xorm:"int not null default 1 'ref_count'"           json:"ref_count"`

	CreatedAt time.Time `xorm:"created 'created_at'" json:"created_at"`
	UpdatedAt time.Time `xorm:"updated 'updated_at'" json:"updated_at"`
}

func (b *FileBlob) TableName() string { return "file_blobs" }
