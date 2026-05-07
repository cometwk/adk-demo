import './env'
import mysql from 'mysql2/promise'
import { executeSql, pool } from './sql'

// export const pool = mysql.createPool({
//   host: '124.220.20.177',
//   port: 3306,
//   user: 'root',
//   password: 'your_strong_password',
//   database: 'tmpdb',

//   waitForConnections: true,
//   connectionLimit: 10,

//   charset: 'utf8mb4',
//   timezone: 'Z',

//   // ⚠️ 慎用
//   multipleStatements: false,
// })

// export type SqlResult = {
//   rows: Record<string, unknown>[]
//   rowCount: number
//   executionTimeMs: number
// }

// export async function executeSql(sql: string): Promise<SqlResult> {
//   // Mock implementation — returns empty result with timing
//   console.log(`[executeSql] Mock executing: ${sql.slice(0, 100)}...`)
//   return {
//     rows: [],
//     rowCount: 0,
//     executionTimeMs: 0,
//   }
// }

async function main() {
  // A simple SELECT query
  const { rows, rowCount, executionTimeMs } = await executeSql('SELECT * FROM `users` WHERE `userid` = "wk"')

  console.log(rows) // results contains rows returned by server
  console.log(rowCount) // fields contains extra meta data about results, if available
  console.log(executionTimeMs) // fields contains extra meta data about results, if available
  pool.end()
}

main()
