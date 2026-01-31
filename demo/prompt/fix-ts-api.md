按照下面的模版，为用户输入的新接口，genereate typescript axios api.ts:

```ts
import axios from 'axios'

export interface ChanBindAgentInput {
  // 注意：后端字段通常是 `json:",string"`，这里建议用 string 传递
  chan_id: string
  agent_id: string
  action: 'rate' | 'bound' | 'unbound'
  rate: number
}

export function chanBindAgent(input: ChanBindAgentInput) {
  return axios.post(`/admin/chan/agent/bind-agent`, input) as Promise<void>
}
```
