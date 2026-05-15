import { S0, syncPredictiveAgent } from './use-case'

await syncPredictiveAgent(S0, [])

console.log("over: =================================")
console.log("\n\n\n")

console.log("facts =================================")
console.log(S0.facts.debugLog())
console.log("workspace =================================")
console.log(S0.workspace.debugLog())