import { beforeAll, describe, expect, it } from "vitest"
import { loadAllSkills } from "../engine/skills"
import { createSkillsTool } from "../tools/skills-tool"

describe("just test", () => {
  beforeAll(async () => {
    console.log("init success")
  })

  it("load skills", async () => {
    const skills = await loadAllSkills(process.cwd())
    console.log(skills)
    const read_skill = createSkillsTool({ skills } as any)
    const result = await (read_skill.execute as any)({ skill_id: "translate" }, {})
    console.log(result)
  })
})
