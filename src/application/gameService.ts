import express from 'express'
import { DARK, INITIAL_BOARD } from '../application/constants'
import { connectMySQL } from '../dataaccess/connection'
import { GameGateway } from '../dataaccess/gameGateway'
import { SquareGateway } from '../dataaccess/squareGateway'
import { TurnGateway } from '../dataaccess/turnGateway'
import { Board } from '../domain/board'
import { Disc } from '../domain/disc'
import { Turn } from '../domain/turn'
import { TurnRepository } from '../domain/turnRepository'

const gameGateway = new GameGateway()
const turnGateway = new TurnGateway()
const squareGateway = new SquareGateway()

const turnRepository = new TurnRepository()

export class GameService {
  async startNewGame() {
    const now = new Date()

    const conn = await connectMySQL()

    try {
      await conn.beginTransaction()

      const gameRecord = await gameGateway.insert(conn, now)

      const firstTurn = new Turn(
        gameRecord.id,
        0,
        Disc.Dark,
        undefined,
        new Board(INITIAL_BOARD),
        now
      )

      await turnRepository.save(conn, firstTurn)

      await conn.commit()
    } finally {
      await conn.end()
    }
  }
}
