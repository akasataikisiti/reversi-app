import mysql from 'mysql2/promise'
import { squareRecord } from './squareRecord'

export class SquareGateway {
  async findForTurnId(
    conn: mysql.Connection,
    turnId: number
  ): Promise<squareRecord[]> {
    const squareSelectResult = await conn.execute<mysql.RowDataPacket[]>(
      'select id, turn_id, x, y, disc from squares where turn_id = ?',
      [turnId]
    )
    const records = squareSelectResult[0]

    return records.map((r) => {
      return new squareRecord(r['id'], r['turn_id'], r['x'], r['y'], r['disc'])
    })
  }

  async insertAll(conn: mysql.Connection, turnId: number, board: number[][]) {
    const squareCount = board
      .map((line) => line.length)
      .reduce((v1, v2) => v1 + v2, 0)

    const squareInsertSql =
      'insert into squares (turn_id, x, y, disc) values ' +
      Array.from(Array(squareCount))
        .map(() => '(?, ?, ?, ?)')
        .join(', ')

    const squaresInsertValues: any[] = []
    board.forEach((line, y) => {
      line.forEach((disc, x) => {
        squaresInsertValues.push(turnId)
        squaresInsertValues.push(x)
        squaresInsertValues.push(y)
        squaresInsertValues.push(disc)
      })
    })
    // === squaresテーブルへのデータインサート文作成と実行(終了) ===

    await conn.execute(squareInsertSql, squaresInsertValues)
  }
}
