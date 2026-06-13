// Read a skill's instructions from SKILL.md.
import { tool } from "ai"
import { z } from "zod"
import { findSkill } from "../engine/skills"
import { ToolContext } from "./types"

export function createSkillsTool(ctx: ToolContext) {
  if (ctx.skills.length === 0) {
    throw new Error("No skills found")
  }
   
  return tool({
    description: "Read a skill's instructions from SKILL.md.",
    inputSchema: z.object({
      skill_id: z.string().describe("Skill id or name"),
    }),
    execute: async ({ skill_id }) => {
      const skill = findSkill(ctx.skills, skill_id)
      if (!skill) {
        return {
          error: `Skill ${skill_id} not found`,
        }
      }
      return skill.prompt
    },
  })
}
