// import chalk from 'chalk'

// // 用于打印 vercel ai sdk 交互的调试信息

// export const systemLog = (x: any) => {
//   console.log('system:', chalk.bold.red(x))
// }
// export const contentLog = (x: any) => {
//   console.log('content:', x)
// }
// export const userLog = (x: any) => {
//   console.log('user:', chalk.bold.gray(x))
// }
// export const reasoningLog = (x: any) => {
//   console.log('reasoning:', chalk.bold.green(x))
// }
// export const toolCallsLog = (x: any) => {
//   const { toolName, input } = x
//   console.log('toolCalls:', chalk.bold.yellow(`${toolName}(${JSON.stringify(input)})`))
// }
// export const toolResultsLog = (x: any) => {
//   const { toolName, output } = x
//   console.log('toolResults:', chalk.bold.blue(`${toolName}: ${JSON.stringify(output)}`))
// }

// // 用于打印 vercel ai sdk 交互的调试信息
// export function onStep(step: any) {
//   const stepNumber = chalk.bgGray.blue.bold('step:' + step.stepNumber)
//   console.log(stepNumber)

//   if (step.toolCalls.length > 0) {
//     for (let i = 0; i < step.toolCalls.length; i++) {
//       toolCallsLog(step.toolCalls[i])
//       toolResultsLog(step.toolResults[i])
//     }
//   }
//   if (step.content.length > 0) {
//     for (const c of step.content) {
//       if (c.type === 'text') {
//         contentLog(c.text)
//       }
//       if (c.type === 'reasoning') {
//         reasoningLog(c.text)
//       }
//     }
//   }

//   console.log('--------------------------------\n')
// }
