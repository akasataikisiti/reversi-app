import express from 'express'
import { connectMySQL } from '../infrastructure/connection'
import { Game } from '../domain/game/game'
import { GameRepository } from '../domain/game/gameRepository'
import { firstTurn } from '../domain/turn/turn'
import { TurnRepository } from '../domain/turn/turnRepository'

const gameRepository = new GameRepository()
const turnRepository = new TurnRepository()

export class GameService {
  async startNewGame() {
    const now = new Date()

    const conn = await connectMySQL()

    try {
      await conn.beginTransaction()

      const game = await gameRepository.save(conn, new Game(undefined, now))

      if (!game.id) throw new Error('game.id not exist')
      const turn = firstTurn(game.id, now)

      await turnRepository.save(conn, turn)

      await conn.commit()
    } finally {
      await conn.end()
    }
  }
}
