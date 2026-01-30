NAME ?= ReactGo
VERSION ?= $(shell git describe --tags 2>/dev/null | cut -c 2-)
BUILD_YEAR ?= $(shell date +%Y)
BUILD_DATE ?= $(shell date +%Y%m%d)

LDFLAGS ?= -s -w

# 版本信息
LDFLAGS += -X main.Name=${NAME} -X main.Version=${VERSION}
LDFLAGS += -X main.BuildDate=${BUILD_DATE} -X main.BuildYear=${BUILD_YEAR}

# 执行文件名
EXECUTABLE ?= agent

# sqlite json functions
TAGS ?= x

all: 
	go run -tags '${TAGS} dev' .
	#go run -tags '${TAGS} x-dev' main.go 

# 更新 web 文件
web:
	rm -rf ./web/dist
	mv ../../web/dist ./web

# 构建生产版本执行文件
build:
	go build -ldflags='$(LDFLAGS)' -tags '${TAGS}' -o ${EXECUTABLE}-release

# 构建开发版本执行文件
build-dev:
	go build -ldflags='$(LDFLAGS)' -tags '${TAGS} dev' -o ${EXECUTABLE}

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

# run test
test:
	#go test $(arg) ./test/...

align:
	tagalign -fix ./biz/tables.go

# 清理
clean:
	go clean
	rm -f ${EXECUTABLE} ${EXECUTABLE}-dev ${EXECUTABLE}-linux-*

.PHONY: web build build-dev dev test all clean linux
