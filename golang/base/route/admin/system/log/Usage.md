```sh
cat main.log | jq .

jq -c ' select(.level == "debug" or .level =="trace")' main.log
cat main.log | jq -c 'select(.level == "debug" and (.file | test("job.go")))'


```

| 需求 | `jq` 代码 |
|------|----------|
| `.level` **精确匹配** `"debug"`，`.file` **包含** `"job.go"` | `select(.level == "debug" and (.file | test("job.go")))` |
| `.level` **精确匹配** `"debug"`，`.file` **不区分大小写** | `select(.level == "debug" and (.file | test("job.go"; "i")))` |
| `.level` **精确匹配** `"debug"`，`.file` **以 `"job.go"` 结尾** | `select(.level == "debug" and (.file | test("job\\.go$")))` |


基于字符串排序（ISO 8601 格式）
```sh
jq -c 'sort_by(.time) | reverse | .[]' main.log

jq -c 'sort_by(.time) ' main.log
```
sort_by(.timestamp) 按 timestamp 升序排列。
🔹 reverse 让时间变成倒序。


```sh
cat main.log | jq -s 'sort_by(.time)' 

cat main.log | jq -s 'map(select(.level == "trace")) | sort_by(.time) | reverse'

sort -r main.log | jq -c 'select(.level == "trace") 

cat main.log | jq -s 'select(.time | test("2025")) | reverse | .[0:2]'
```

```sh
PAGE=2
PAGE_SIZE=2
FILTERED=$(jq -s '[.[] | select(.message | test("Error"))]' log.json)
TOTAL_PAGES=$(echo "$FILTERED" | jq 'length / '$PAGE_SIZE' | ceil')
PAGE_DATA=$(echo "$FILTERED" | jq '.[(('$PAGE'-1)*'$PAGE_SIZE'):('$PAGE'*'$PAGE_SIZE')]')

echo "总页数: $TOTAL_PAGES"
echo "当前页数据:"
echo "$PAGE_DATA"

cat main.log | jq -s '[.[] | select(.level | test("debug"))]' | jq  [.[1:5]]

```



jq -s '[.[] | select((.message | test("x")) or (.level | test("x")) and (.level == "debug"))]'


<!-- cat /tmp/main.log | jq -s '[.[] | select(.level | in(["debug"]))] ' -->

cat /tmp/main.log | jq -s '[.[] | select(((.message | test("SQL")) or (.level | test("SQL"))))] '
cat /tmp/main.log | jq -s '[.[]]' 
