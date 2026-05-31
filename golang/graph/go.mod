module github.com/lucky-byte/graph

go 1.24.2

replace github.com/lucky-byte/lib => ../lib

require (
	github.com/mattn/go-sqlite3 v1.14.44
	xorm.io/xorm v1.3.11
)

require (
	github.com/goccy/go-json v0.10.5 // indirect
	github.com/golang/snappy v0.0.4 // indirect
	github.com/syndtr/goleveldb v1.0.0 // indirect
	xorm.io/builder v0.3.13 // indirect
)
