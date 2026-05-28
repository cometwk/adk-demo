# 服务器设置
NAME=reactgo # 项目名称
HOST=0.0.0.0 # 监听地址
PORT=5099 # 监听端口
API_PREFIX=/api/v1 # API 前缀
WEB_DIR=./web # 静态文件目录
PUBLIC_DIR=../web/xui/public  # react dist 资源
TMP_DIR=/tmp # 临时目录
DATA_DIR=./data # 暂时未使用
DEBUG=true


# 日志
LOG_DIR=/tmp
LOG_FILE=main.log
LOG_LEVEL=debug # "fatal" | "error" | "warn" | "info" | "debug" | "trace"
LOG_OUTPUT=console # 暂时无用

# 数据库
DB_DRIVER=mysql # mysql_native_password or 默认使用 caching_sha2_password 
DB_URL="root:your_strong_password@tcp(124.220.20.177:3306)/pay?charset=utf8&parseTime=true&loc=UTC&multiStatements=true"
# DB_DRIVER=pgx
# DB_URL="postgres://admin:xxx@1y:5432/reactgo?search_path=public"
DB_MIN_CONNECTIONS=1
DB_MAX_CONNECTIONS=10
DB_DEBUG=true # 打印SQL日志

TEST_DB_URL="root:your_strong_password@tcp(124.220.20.177:3306)/reactgo?charset=utf8&parseTime=true&loc=UTC&multiStatements=true"

# 定时任务
TASK_PATH=/tmp # 执行文件路径
TASK_ENV=path/to/task.env # 环境变量，名称会转换为大些字母



### 集群部署

`HOST_ID=A`

- 若单例部署，不需要设置，或者设置为空
- 若集群部署，需要设置，`[0-9a-zA-Z]`

使用场景

- 生产流水号
- ticket 决定采用内存，还是数据库