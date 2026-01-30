import * as fs from 'fs'
import * as path from 'path'
import * as dotenv from 'dotenv'

let loaded = false
export function loadEnv() {
  if (loaded) return

  // 尝试多个可能的路径
  const paths = [
    '.env', //
    '../.env',
    '../../.env',
    '../../../.env',
    '../../../../.env',
    '../../../../../.env',
  ]

  //   let loaded = false

  for (const p of paths) {
    const fullPath = path.resolve(p)

    if (fs.existsSync(fullPath)) {
      const result = dotenv.config({ path: fullPath })

      if (result.error) {
        throw new Error(`加载 .env 文件失败: ${result.error}`)
      }

      console.log(`加载 .env 文件成功: ${p} => ${fullPath}`)
      loaded = true
      break
    }
  }

  if (!loaded) {
    throw new Error('加载 .env 文件失败')
  }
}

loadEnv()