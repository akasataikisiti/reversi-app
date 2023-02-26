import express from 'express'
import morgan from 'morgan'
import 'express-async-errors'
import { GameGateway } from './dataaccess/gameGateway'
import { TurnGateway } from './dataaccess/turnGateway'
import { MoveGateway } from './dataaccess/moveGateway'
import { SquareGateway } from './dataaccess/squareGateway'
import { gameRouter } from './presentation/gameRouter'
import { turnRouter } from './presentation/turnRouter'

const PORT = 3000

const app = express()

app.use(morgan('dev'))
app.use(express.static('static', { extensions: ['html'] }))
app.use(express.json())

const gameGateway = new GameGateway()
const turnGateway = new TurnGateway()
const moveGateway = new MoveGateway()
const squareGateway = new SquareGateway()

app.get('/api/hello', async (req, res) => {
  res.json({
    message: 'Hello nodemon',
  })
})

app.get('/api/error', async (req, res) => {
  throw new Error('Error endpoint')
})

app.use(gameRouter)
app.use(turnRouter)

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
