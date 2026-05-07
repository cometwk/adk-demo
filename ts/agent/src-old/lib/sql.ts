import './env'
import mysql from 'mysql2/promise'

const { MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE } = process.env
if (!MYSQL_HOST || !MYSQL_PORT || !MYSQL_USER || !MYSQL_PASSWORD || !MYSQL_DATABASE) {
  throw new Error('Missing MySQL environment variables')
}

export const pool = mysql.createPool({
  host: MYSQL_HOST,
  port: Number(MYSQL_PORT),
  user: MYSQL_USER,
  password: MYSQL_PASSWORD,
  database: MYSQL_DATABASE,

  waitForConnections: true,
  connectionLimit: 10,

  charset: 'utf8mb4',
  timezone: 'Z',

  // ⚠️ 慎用
  multipleStatements: false,
})

export type SqlResult = {
  rows: Record<string, unknown>[]
  rowCount: number
  executionTimeMs: number
}

export async function executeSql(sql: string): Promise<SqlResult> {
  const startTime = Date.now()
  const [results] = await pool.query(sql)
  const rows = results as Record<string, unknown>[]
  return {
    rows,
    rowCount: rows.length,
    executionTimeMs: Date.now() - startTime,
  }
}
