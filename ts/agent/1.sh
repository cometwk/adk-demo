curl -X POST http://localhost:4000/cubejs-api/v1/load \
  -H "Content-Type: application/json" \
  -d '{
    "query": {
      "dimensions": [],
      "measures": ["order_daily.count"],
      "filters": [
        {
          "member": "order_daily.over_1000_count",
          "operator": "set"
        }
      ]
    }
  }' | jq
