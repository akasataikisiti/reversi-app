import mysql from 'mysql2/promise'

export async function connectMySQL() {
  return await mysql.createConnection({
    host: process.env.DB_HOST ?? 'localhost',
    database: process.env.DB_NAME ?? 'reversi',
    user: process.env.DB_USER ?? 'reversi',
    password: process.env.DB_PASSWORD ?? 'password',
  })
}
