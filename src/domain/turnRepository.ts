import mysql from 'mysql2/promise'
import { MoveGateway } from '../dataaccess/moveGateway'
import { SquareGateway } from '../dataaccess/squareGateway'
import { TurnGateway } from '../dataaccess/turnGateway'
import { Board } from './board'
import { toDisc } from './disc'
import { Move } from './move'
import { Point } from './point'
import { Turn } from './turn'

const turnGateway = new TurnGateway()
const squareGateway = new SquareGateway()
const moveGateway = new MoveGateway()

export class TurnRepository {
  // 指定したターンを取得できるようにする (元は一つ前のターン取得)
  async findForGameIdAndTurnCount(
    conn: mysql.Connection,
    gameId: number,
    turnCount: number
  ): Promise<Turn> {
    const turnRecord = await turnGateway.findForGameIdAndTurnCount(
      conn,
      gameId,
      turnCount
    )

    if (!turnRecord) throw new Error('Specified turn not found')

    const squareRecords = await squareGateway.findForTurnId(conn, turnRecord.id)
    const board = Array.from(Array(8)).map(() => Array.from(Array(8)))
    squareRecords.forEach((s) => {
      board[s.y][s.x] = s.disc
    })

    // 指定したターンのmoveを取得
    const moveRecord = await moveGateway.findForTurnId(conn, turnRecord.id)
    let move: Move | undefined = undefined
    if (moveRecord) {
      move = new Move(
        toDisc(moveRecord.disc),
        new Point(moveRecord.x, moveRecord.y)
      )
    }
    return new Turn(
      gameId,
      turnCount,
      toDisc(turnRecord.nextDisc),
      move,
      new Board(board),
      turnRecord.endAt
    )
  }
}
