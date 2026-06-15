import { ToolContext } from "@/lib/tools"
import { ToolExtra } from "@/lib/tools/types"
import cube from "@cubejs-client/core"
import { search_entities, get_entity_schema, execute_query } from "./tools"
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
        search_entities: search_entities(extra),
        get_entity_schema: get_entity_schema(extra),
      }
    },
  }
}
