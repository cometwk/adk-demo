import { ToolContext } from "@/lib/tools"
import { ToolExtra } from "@/lib/tools/types"
import cube from "@cubejs-client/core"
import { discover_entities, execute_query } from "./tools"
import { tool, type Tool } from "ai"

export const cubeApi = cube("token", { apiUrl: "http://localhost:4000/cubejs-api/v1" })

export interface Extra extends ToolExtra<Extra> {
  cubeApi: typeof cubeApi
}

export function createExtra(): Extra {
  return {
    cubeApi,
    createTools: (extra: Extra) => {
      return {
        execute_query: execute_query(extra),
        discover_entities: discover_entities(extra),
      }
    },
  }
}
