import express from 'express'
import morgan from 'morgan'
import 'express-async-errors'
import mysql from 'mysql2/promise'

const PORT = 3000

const app = express()

app.use(morgan('dev'))
app.use(express.static('static', { extensions: ['html'] }))

app.get('/api/hello', async (req, res) => {
  res.json({
    message: 'Hello nodemon',
  })
})

app.get('/api/error', async (req, res) => {
  throw new Error('Error endpoint')
})

app.post('/api/games', async (req, res) => {
  const startedAt = new Date()

  const conn = await mysql.createConnection({
    host: 'localhost',
    database: 'reversi',
    user: 'reversi',
    password: 'password',
  })

  try {
    await conn.beginTransaction()

    await conn.execute('insert into games (started_at) values (?)', [startedAt])

    await conn.commit()
  } finally {
    await conn.end()
  }

  res.status(201).end()
})

app.use(errorHandler)

app.listen(PORT, () => {
  console.log(`Reversi application started: http://localhost:${PORT}`)
})

function errorHandler(
  err: any,
  _req: express.Request,
  res: express.Response,
  _next: express.NextFunction
) {
  console.log('Unexpected error occurrd', err)
  res.status(500).send({
    message: 'Unexpected error occurred',
  })
}
