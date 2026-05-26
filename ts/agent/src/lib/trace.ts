import chalk from 'chalk'
import util from 'node:util'

type LogLevel = 'system' | 'user' | 'assistant' | 'reasoning' | 'tool-call' | 'tool-result' | 'content'

const styles: Record<LogLevel, (x: string) => string> = {
  system: chalk.bold.red,
  user: chalk.bold.gray,
  assistant: chalk.bold.white,
  reasoning: chalk.bold.green,
  content: chalk.white,
  'tool-call': chalk.bold.yellow,
  'tool-result': chalk.bold.blue,
}

function format(value: unknown): string {
  if (typeof value === 'string') return value

  return util.inspect(value, {
    colors: true,
    depth: 6,
    compact: false,
  })
}

function log(level: LogLevel, label: string, value: unknown) {
  const style = styles[level]

  console.log(style(`${label.padEnd(12)} ${format(value)}`))
}

export const trace = {
  system: (x: unknown) => log('system', 'system', x),

  user: (x: unknown) => log('user', 'user', x),

  assistant: (x: unknown) => log('assistant', 'assistant', x),

  reasoning: (x: unknown) => log('reasoning', 'reasoning', x),

  content: (x: unknown) => log('content', 'content', x),

  toolCall: (toolName: string, input: unknown) => {
    log('tool-call', 'tool-call', `${toolName}(${format(input)})`)
  },

  toolResult: (toolName: string, output: unknown) => {
    log('tool-result', 'tool-result', `${toolName} => ${format(output)}`)
  },

  divider: () => {
    console.log(chalk.dim('─'.repeat(80)))
  },

  step(stepNumber: number) {
    console.log(chalk.bgBlue.white.bold(` STEP ${stepNumber} `))
  },

  onStep: (step: any) => onStep(step),
}

function onStep(step: any) {
  trace.step(step.stepNumber)

  for (const toolCall of step.toolCalls ?? []) {
    trace.toolCall(toolCall.toolName, toolCall.input)
  }

  for (const toolResult of step.toolResults ?? []) {
    trace.toolResult(toolResult.toolName, toolResult.output)
  }

  for (const c of step.content ?? []) {
    switch (c.type) {
      case 'text':
        trace.content(c.text)
        break

      case 'reasoning':
        trace.reasoning(c.text)
        break
    }
  }

  trace.divider()
}
