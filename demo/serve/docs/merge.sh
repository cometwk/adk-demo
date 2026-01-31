awk 'FNR==1 && NR!=1 {print ""} {print}' \
ddl/s3-local-fs.sql \
> ./table.sql && echo "合并完成"

