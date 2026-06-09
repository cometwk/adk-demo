import { beforeAll, describe, expect, it } from 'vitest'
import cube from '@cubejs-client/core'

describe('just test', () => {
  beforeAll(async () => {
    console.log('init success')
  })

  const cubeApi = cube('token', { apiUrl: 'http://localhost:4000/cubejs-api/v1' })

  it('just test', async () => {
    console.log('just test')
    const resultSet = await cubeApi.load(
      {
        "dimensions": [],
        "measures": [
          "order_daily.count"
        ],
        "filters": [
          {
            "member": "order_daily.over_1000_count",
            "operator": "set"
          }
        ]
      }
    );
    console.log(resultSet)
    // console.log(resultSet.loadResponses[0].data)
  })


  it('meta', async () => {
    const resultSet = await cubeApi.meta()

    console.log(resultSet)
    // console.log(resultSet.loadResponses[0].data)
  })
})
