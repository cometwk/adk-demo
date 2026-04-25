import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { dirname } from 'path'

function deepParseJsonStrings(obj: any): any {
  if (obj === null || obj === undefined) {
    return obj
  }

  if (Array.isArray(obj)) {
    return obj.map(item => deepParseJsonStrings(item))
  }

  if (typeof obj === 'object') {
    const result: any = {}
    for (const [key, value] of Object.entries(obj)) {
      result[key] = deepParseJsonStrings(value)
    }
    return result
  }

  if (typeof obj === 'string' && obj.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(obj)
      return deepParseJsonStrings(parsed)
    } catch {
      return obj
    }
  }

  return obj
}

const inputPath = './tmp/t1.json'
const outputPath = './tmp/t1.fix.json'

const content = readFileSync(inputPath, 'utf-8')
const obj = JSON.parse(content)

const fixedObj = deepParseJsonStrings(obj)

const outputDir = dirname(outputPath)
if (!existsSync(outputDir)) {
  mkdirSync(outputDir, { recursive: true })
}

writeFileSync(outputPath, JSON.stringify(fixedObj, null, 2))
console.log(`Fixed JSON written to ${outputPath}`)