import { connectMySQL } from '../dataaccess/connection'
import { DARK, LIGHT } from '../application/constants'
import { GameGateway } from '../dataaccess/gameGateway'
import { SquareGateway } from '../dataaccess/squareGateway'
import { TurnGateway } from '../dataaccess/turnGateway'
import { MoveGateway } from '../dataaccess/moveGateway'
import { Board } from '../domain/board'
import { toDisc } from '../domain/disc'
import { Turn } from '../domain/turn'
import { Point } from '../domain/point'

const gameGateway = new GameGateway()
const turnGateway = new TurnGateway()
const squareGateway = new SquareGateway()
const moveGateway = new MoveGateway()

class FindLatestGameTurnByTurnCountOutput {
  constructor(
    private _turnCount: number,
    private _board: number[][],
    private _nextDisc: number | undefined,
    private _winnerDisc: number | undefined
  ) {}
  get turnCount() {
    return this._turnCount
  }
  get board() {
    return this._board
  }
  get nextDisc() {
    return this._nextDisc
  }
  get winnerDisc() {
    return this._winnerDisc
  }
}

export class TurnService {
  async findLatestGameTurnByTurnCount(
    turnCount: number
  ): Promise<FindLatestGameTurnByTurnCountOutput> {
    const conn = await connectMySQL()
    try {
      const gameRecord = await gameGateway.findLatest(conn)

      if (!gameRecord) {
        throw new Error('Latest game not found')
      }

      const turnRecord = await turnGateway.findForGameIdAndTurnCount(
        conn,
        gameRecord.id,
        turnCount
      )

      if (!turnRecord) throw new Error('Specified turn not found')

      const squareRecords = await squareGateway.findForTurnId(
        conn,
        turnRecord.id
      )
      const board = Array.from(Array(8)).map(() => Array.from(Array(8)))
      squareRecords.forEach((s) => {
        board[s.y][s.x] = s.disc
      })

      return new FindLatestGameTurnByTurnCountOutput(
        turnCount,
        board,
        turnRecord.nextDisc,
        // TODO 決着がついている場合、game_resultsテーブルから取得する
        undefined
      )
    } finally {
      await conn.end()
    }
  }

  async registerTurn(turnCount: number, disc: number, x: number, y: number) {
    const conn = await connectMySQL()
    try {
      // 1つ前のターンを取得する
      const gameRecord = await gameGateway.findLatest(conn)
      if (!gameRecord) throw new Error('Latest game not found')

      const previousTurnCount = turnCount - 1

      const previousTurnRecord = await turnGateway.findForGameIdAndTurnCount(
        conn,
        gameRecord.id,
        previousTurnCount
      )

      if (!previousTurnRecord) throw new Error('Specified turn not found')

      const squareRecords = await squareGateway.findForTurnId(
        conn,
        previousTurnRecord.id
      )
      const board = Array.from(Array(8)).map(() => Array.from(Array(8)))
      squareRecords.forEach((s) => {
        board[s.y][s.x] = s.disc
      })

      const previousTurn = new Turn(
        gameRecord.id,
        previousTurnCount,
        toDisc(previousTurnRecord.nextDisc),
        undefined,
        new Board(board),
        previousTurnRecord.endAt
      )

      // 石を置く
      const newTurn = previousTurn.placeNext(toDisc(disc), new Point(x, y))

      // ターンを保存する
      const turnRecord = await turnGateway.insert(
        conn,
        newTurn.gameId,
        newTurn.turnCount,
        newTurn.nextDisc,
        newTurn.endAt
      )

      await squareGateway.insertAll(conn, turnRecord.id, newTurn.board.discs)

      await moveGateway.insert(conn, turnRecord.id, disc, x, y)

      await conn.commit()
    } finally {
      await conn.end()
    }
  }
}
