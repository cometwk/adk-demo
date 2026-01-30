import { generateText, stepCountIs, tool, zodSchema, type ModelMessage } from 'ai'
import { exec } from 'node:child_process'
import { promises as fs } from 'node:fs'
import pathModule from 'node:path'
import readline from 'node:readline'
import { promisify } from 'node:util'
import { z } from 'zod'
import { model } from './model'

const execAsync = promisify(exec)

const MAX_OUTPUT_LENGTH = 50_000
const COMMAND_TIMEOUT_MS = 300_000

// 配置

const WORKDIR = process.cwd()
const MODEL = model

const SYSTEM = `You are a CLI agent at ${process.cwd()}. 

Loop: think briefly -> use tools -> report results.

Rules:
- Prefer tools over prose. Act, don't just explain.
- Never invent file paths. Use bash ls/find first if unsure.
- Make minimal changes. Don't over-engineer.
- After finishing, summarize what changed.`

// Tool Definitions - 4 tools cover 90% of coding tasks

const ensureWorkspacePath = (p: string) => {
  const resolved = pathModule.resolve(WORKDIR, p)
  const relative = pathModule.relative(WORKDIR, resolved)
  if (relative.startsWith('..') || pathModule.isAbsolute(relative)) {
    throw new Error(`Path escapes workspace: ${p}`)
  }
  return resolved
}

const truncateOutput = (output: string) => {
  if (output.length > MAX_OUTPUT_LENGTH) {
    return output.slice(0, MAX_OUTPUT_LENGTH)
  }
  return output
}

// TOOLS = [
//   # Tool 1: Bash - The gateway to everything
//   # Can run any command: git, npm, python, curl, etc.
//   {
//       "name": "bash",
//       "description": "Run a shell command. Use for: ls, find, grep, git, npm, python, etc.",
//       "input_schema": {
//           "type": "object",
//           "properties": {
//               "command": {
//                   "type": "string",
//                   "description": "The shell command to execute"
//               }
//           },
//           "required": ["command"],
//       },
//   },

//   # Tool 2: Read File - For understanding existing code
//   # Returns file content with optional line limit for large files
//   {
//       "name": "read_file",
//       "description": "Read file contents. Returns UTF-8 text.",
//       "input_schema": {
//           "type": "object",
//           "properties": {
//               "path": {
//                   "type": "string",
//                   "description": "Relative path to the file"
//               },
//               "limit": {
//                   "type": "integer",
//                   "description": "Max lines to read (default: all)"
//               },
//           },
//           "required": ["path"],
//       },
//   },

//   # Tool 3: Write File - For creating new files or complete rewrites
//   # Creates parent directories automatically
//   {
//       "name": "write_file",
//       "description": "Write content to a file. Creates parent directories if needed.",
//       "input_schema": {
//           "type": "object",
//           "properties": {
//               "path": {
//                   "type": "string",
//                   "description": "Relative path for the file"
//               },
//               "content": {
//                   "type": "string",
//                   "description": "Content to write"
//               },
//           },
//           "required": ["path", "content"],
//       },
//   },

//   # Tool 4: Edit File - For surgical changes to existing code
//   # Uses exact string matching for precise edits
//   {
//       "name": "edit_file",
//       "description": "Replace exact text in a file. Use for surgical edits.",
//       "input_schema": {
//           "type": "object",
//           "properties": {
//               "path": {
//                   "type": "string",
//                   "description": "Relative path to the file"
//               },
//               "old_text": {
//                   "type": "string",
//                   "description": "Exact text to find (must match precisely)"
//               },
//               "new_text": {
//                   "type": "string",
//                   "description": "Replacement text"
//               },
//           },
//           "required": ["path", "old_text", "new_text"],
//       },
//   },
// ]
// def safe_path(p: str) -> Path:
// """
// Ensure path stays within workspace (security measure).

// Prevents the model from accessing files outside the project directory.
// Resolves relative paths and checks they don't escape via '../'.
// """
// path = (WORKDIR / p).resolve()
// if not path.is_relative_to(WORKDIR):
//     raise ValueError(f"Path escapes workspace: {p}")
// return path


// def run_bash(command: str) -> str:
// """
// Execute shell command with safety checks.

// Security: Blocks obviously dangerous commands.
// Timeout: 60 seconds to prevent hanging.
// Output: Truncated to 50KB to prevent context overflow.
// """
// # Basic safety - block dangerous patterns
// dangerous = ["rm -rf /", "sudo", "shutdown", "reboot", "> /dev/"]
// if any(d in command for d in dangerous):
//     return "Error: Dangerous command blocked"

// try:
//     result = subprocess.run(
//         command,
//         shell=True,
//         cwd=WORKDIR,
//         capture_output=True,
//         text=True,
//         timeout=60
//     )
//     output = (result.stdout + result.stderr).strip()
//     return output[:50000] if output else "(no output)"

// except subprocess.TimeoutExpired:
//     return "Error: Command timed out (60s)"
// except Exception as e:
//     return f"Error: {e}"


// def run_read(path: str, limit: int = None) -> str:
// """
// Read file contents with optional line limit.

// For large files, use limit to read just the first N lines.
// Output truncated to 50KB to prevent context overflow.
// """
// try:
//     text = safe_path(path).read_text()
//     lines = text.splitlines()

//     if limit and limit < len(lines):
//         lines = lines[:limit]
//         lines.append(f"... ({len(text.splitlines()) - limit} more lines)")

//     return "\n".join(lines)[:50000]

// except Exception as e:
//     return f"Error: {e}"


// def run_write(path: str, content: str) -> str:
// """
// Write content to file, creating parent directories if needed.

// This is for complete file creation/overwrite.
// For partial edits, use edit_file instead.
// """
// try:
//     fp = safe_path(path)
//     fp.parent.mkdir(parents=True, exist_ok=True)
//     fp.write_text(content)
//     return f"Wrote {len(content)} bytes to {path}"

// except Exception as e:
//     return f"Error: {e}"


// def run_edit(path: str, old_text: str, new_text: str) -> str:
// """
// Replace exact text in a file (surgical edit).

// Uses exact string matching - the old_text must appear verbatim.
// Only replaces the first occurrence to prevent accidental mass changes.
// """
// try:
//     fp = safe_path(path)
//     content = fp.read_text()

//     if old_text not in content:
//         return f"Error: Text not found in {path}"

//     # Replace only first occurrence for safety
//     new_content = content.replace(old_text, new_text, 1)
//     fp.write_text(new_content)
//     return f"Edited {path}"

// except Exception as e:
//     return f"Error: {e}"


// # Tool 1: Bash - The gateway to everything
// # Can run any command: git, npm, python, curl, etc.
const bashTool = tool<{ command: string }, string>({
  description: 'Run a shell command. Use for: ls, find, grep, git, npm, python, etc.',
  inputSchema: zodSchema(
    z.object({
      command: z.string().describe('The shell command to execute'),
    })
  ),
  /*
    Execute shell command with safety checks.

    Security: Blocks obviously dangerous commands.
    Timeout: 60 seconds to prevent hanging.
    Output: Truncated to 50KB to prevent context overflow.
    */
  execute: async ({ command }) => {
    // console.log('command', command)
    let output = ''

    // # Basic safety - block dangerous patterns
    const dangerous = ['rm -rf /', 'sudo', 'shutdown', 'reboot', '> /dev/']
    if (dangerous.some((d) => command.includes(d))) {
      return 'Error: Dangerous command blocked'
    }

    try {
      const result = await execAsync(command, {
        cwd: WORKDIR,
        timeout: COMMAND_TIMEOUT_MS,
        maxBuffer: 10 * 1024 * 1024,
      })
      output = `${result.stdout ?? ''}${result.stderr ?? ''}` || '(no output)'
    } catch (error) {
      output = 'Error: ' + (error instanceof Error ? error.message : String(error))
    }
    if (output.length > MAX_OUTPUT_LENGTH) {
      return output.slice(0, MAX_OUTPUT_LENGTH)
    }
    return output
  },
})

const readTool = tool<{ path: string; limit?: number }, string>({
  description: 'Read file contents. Returns UTF-8 text.',
  inputSchema: zodSchema(
    z.object({
      path: z.string().describe('Relative path to the file'),
      limit: z.number().int().positive().optional().describe('Max lines to read (default: all)'),
    })
  ),
  execute: async ({ path, limit }) => {
    try {
      const filePath = ensureWorkspacePath(path)
      const text = await fs.readFile(filePath, 'utf8')
      let lines = text.split('\n')
      if (limit && limit < lines.length) {
        const remaining = lines.length - limit
        lines = lines.slice(0, limit)
        lines.push(`... (${remaining} more lines)`)
      }
      return truncateOutput(lines.join('\n'))
    } catch (error) {
      return 'Error: ' + (error instanceof Error ? error.message : String(error))
    }
  },
})

const writeTool = tool<{ path: string; content: string }, string>({
  description: 'Write content to a file. Creates parent directories if needed.',
  inputSchema: zodSchema(
    z.object({
      path: z.string().describe('Relative path for the file'),
      content: z.string().describe('Content to write'),
    })
  ),
  execute: async ({ path, content }) => {
    try {
      const filePath = ensureWorkspacePath(path)
      await fs.mkdir(pathModule.dirname(filePath), { recursive: true })
      await fs.writeFile(filePath, content, 'utf8')
      return `Wrote ${Buffer.byteLength(content)} bytes to ${path}`
    } catch (error) {
      return 'Error: ' + (error instanceof Error ? error.message : String(error))
    }
  },
})

const editTool = tool<{ path: string; old_text: string; new_text: string }, string>({
  description: 'Replace exact text in a file. Use for surgical edits.',
  inputSchema: zodSchema(
    z.object({
      path: z.string().describe('Relative path to the file'),
      old_text: z.string().describe('Exact text to find (must match precisely)'),
      new_text: z.string().describe('Replacement text'),
    })
  ),
  execute: async ({ path, old_text, new_text }) => {
    try {
      const filePath = ensureWorkspacePath(path)
      const content = await fs.readFile(filePath, 'utf8')
      if (!content.includes(old_text)) {
        return `Error: Text not found in ${path}`
      }
      const updated = content.replace(old_text, new_text)
      await fs.writeFile(filePath, updated, 'utf8')
      return `Edited ${path}`
    } catch (error) {
      return 'Error: ' + (error instanceof Error ? error.message : String(error))
    }
  },
})

const tools = {
  bash: bashTool,
  read_file: readTool,
  write_file: writeTool,
  edit_file: editTool,
}

async function agent_loop(prompt: string, history: ModelMessage[] = []) {
  history.push({ role: 'user', content: prompt })

  // # 1. Call the model with tools
  const result = await generateText({
    model,
    system: SYSTEM,
    messages: history,
    tools: tools,
    stopWhen: stepCountIs(5),
    onStepFinish: (step) => {
      // console.log('--- Step Finished ---')
      step.content.forEach((part) => {
        if (part.type === 'text') {
          // console.log('文本:', part.text)
        } else if (part.type === 'tool-call') {
          // console.log('工具调用:', part.toolName)
          console.log('\x1b[33m$' + part.toolName + '\x1b[0m') //# Yellow color for commands
          console.log(JSON.stringify(part.input, null, 2))
        } else if (part.type === 'tool-result') {
          // console.log('工具结果:', part.toolName)
        }
      })
    },
  })

  const response = await result.response
  history.push(...response.messages)

  // console.log('history=\n', JSON.stringify(history, null, 2))

  return result.text
}

async function run() {
  const args = process.argv.slice(2)
  if (args.length > 0) {
    const prompt = args.join(' ')
    const text = await agent_loop(prompt)
    console.log(text)
    return
  }

  const history: ModelMessage[] = []
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  const ask = () => {
    rl.question('\x1b[36m>> \x1b[0m', async (line) => {
      const query = line.trim()
      if (!query || query === 'q' || query === 'exit') {
        rl.close()
        return
      }

      try {
        const text = await agent_loop(query, history)
        console.log(text)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        console.error(message)
      }

      ask()
    })
  }

  ask()
}

run()
