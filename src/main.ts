import express from 'express'
import type { Server } from 'http'
import morgan from 'morgan'
import 'express-async-errors'
import { gameRouter } from './presentation/gameRouter'
import { turnRouter } from './presentation/turnRouter'
import { DomainError } from './domain/error/domainError'
import { ApplicationError } from './application/error/applicationError'

const PORT = Number(process.env.PORT || 3000)
const HOST = process.env.HOST || '127.0.0.1'

const app = express()

app.use(morgan('dev'))
app.use(express.static('static', { extensions: ['html'] }))
app.use(express.json())

app.use(gameRouter)
app.use(turnRouter)

app.use(errorHandler)

startServer(PORT)

function startServer(port: number, maxTries = 5) {
  let server: Server
  server = app
    .listen(port, HOST, () => {
      console.log(`Reversi application started: http://${HOST}:${port}`)
    })
    .on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE' && maxTries > 0) {
        const nextPort = port + 1
        console.warn(
          `Port ${port} is in use. Retrying with ${nextPort}...`
        )
        server.close(() => startServer(nextPort, maxTries - 1))
        return
      }
      if (err.code === 'EPERM') {
        console.error(`Permission denied to bind ${HOST}:${port}`)
      } else {
        console.error('Server failed to start', err)
      }
      process.exit(1)
    })
}

function errorHandler(
  err: any,
  _req: express.Request,
  res: express.Response,
  _next: express.NextFunction
) {
  if (err instanceof DomainError) {
    res.status(400).json({
      type: err.type,
      message: err.message,
    })
    return
  }

  if (err instanceof ApplicationError) {
    switch (err.type) {
      case 'LatestGameNotFound':
        res.status(404).json({
          type: err.type,
          message: err.message,
        })
        return
    }
  }
  console.log('Unexpected error occurrd', err)
  res.status(500).send({
    message: 'Unexpected error occurred',
  })
}
