import mysql from 'mysql2/promise'
import { Turn } from './turn'

export interface TurnRepository {
  // 指定したターンを取得できるようにする (元は一つ前のターン取得)
  findForGameIdAndTurnCount(
    conn: mysql.Connection,
    gameId: number,
    turnCount: number
  ): Promise<Turn>

  save(conn: mysql.Connection, turn: Turn): Promise<void>
}
