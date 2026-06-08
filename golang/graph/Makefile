NAME ?= ReactGo
VERSION ?= $(shell git describe --tags 2>/dev/null | cut -c 2-)
BUILD_YEAR ?= $(shell date +%Y)
BUILD_DATE ?= $(shell date +%Y%m%d)

LDFLAGS ?= -s -w

# 版本信息
LDFLAGS += -X github.com/lucky-byte/base/cmd.Name=${NAME} -X github.com/lucky-byte/base/cmd.Version=${VERSION}
LDFLAGS += -X github.com/lucky-byte/base/cmd.BuildDate=${BUILD_DATE} -X github.com/lucky-byte/base/cmd.BuildYear=${BUILD_YEAR}

# 执行文件名
EXECUTABLE ?= reactgo

# sqlite json functions
TAGS ?= x

all: 
	go run -tags '${TAGS} dev' main.go 

import:
	go run -tags '${TAGS} dev' main.go data import -input ../../shell/output/agent-rel.jsonl

# 更新 web 文件
web:
	rm -rf ./web/dist
	mv ../../web/dist ./web

# 构建生产版本执行文件
build:
	go build -ldflags='$(LDFLAGS)' -tags '${TAGS}' -o ${EXECUTABLE}

# 构建开发版本执行文件
build-dev:
	go build -ldflags='$(LDFLAGS)' -tags '${TAGS} dev' -o ${EXECUTABLE}-dev

# 采用默认的参数启动开发服务器
dev: build-dev
	./${EXECUTABLE}-dev -config .config/config.yaml -webfs osdir -mailfs osdir

# 采用默认的参数启动开发服务器
run:
	go run -ldflags='$(LDFLAGS)' -tags '${TAGS} dev' . \
		-config .config/config.yaml -webfs osdir -mailfs osdir

# build a linux amd64 executable
linux:
	GOOS=linux GOARCH=amd64 \
	go build -ldflags='$(LDFLAGS)' -tags '${TAGS}' -o ${EXECUTABLE}-linux-amd64

push:
	source proxy start && git push

# run test
test:
	#go test $(arg) ./test/...

align:
	tagalign -fix ./biz 

# 清理
clean:
	go clean
	rm -f ${EXECUTABLE} ${EXECUTABLE}-dev ${EXECUTABLE}-linux-*

.PHONY: web build build-dev dev test all clean linux
