import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// export function loadEnv1() {

//   // 尝试多个可能的路径
//   const paths = [
//     '.env', //
//     '../.env',
//     '../../.env',
//     '../../../.env',
//     '../../../../.env',
//     '../../../../../.env',
//   ]

//   //   let loaded = false

//   for (const p of paths) {
//     const fullPath = path.resolve(p)

//     if (fs.existsSync(fullPath)) {
//       const result = dotenv.config({ path: fullPath })

//       if (result.error) {
//         throw new Error(`加载 .env 文件失败: ${result.error}`)
//       }

//       console.log(`加载 .env 文件成功: ${p} => ${fullPath}`)
//       loaded = true
//       break
//     }
//   }

//   if (!loaded) {
//     throw new Error('加载 .env 文件失败')
//   }
// }

// loadEnv()

let loaded = false;
/**
 * 逐层向上查找并加载 .env 文件
 * @param maxDepth 最大向上查找的层数，默认 3 次
 * @returns 是否成功加载了某个 .env 文件
 */
export function loadEnv(maxDepth: number = 5): boolean {
  if (loaded) return true;
  // 从当前 Node.js 进程的工作目录开始
  let currentDir = process.cwd();

  for (let depth = 0; depth <= maxDepth; depth++) {
    const envPath = path.join(currentDir, '.env');

    // 检查当前目录下是否存在 .env 文件
    if (fs.existsSync(envPath)) {
      const result = dotenv.config({ path: envPath });
      if (!result.error) {
        // 成功加载，打印一下当前加载的路径（可选，方便调试）
        console.log(`[Env] Loaded from: ${envPath}`);
        return true;
      }
    }

    // 获取上一级目录
    const parentDir = path.dirname(currentDir);

    // 如果已经到达根目录（比如 C:\ 或 /），无法再向上，则提前退出
    if (parentDir === currentDir) {
      break;
    }

    currentDir = parentDir;
  }

  console.warn('[Env] No .env file found within the specified depth.');
  return false;
}
