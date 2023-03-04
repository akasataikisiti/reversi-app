import { connectMySQL } from '../../infrastructure/connection'
import {
  FindLastGamesQueryService,
  FindLastGamesQueryModel,
} from '../query/findLastGamesQueryService'

const FIND_COUNT = 10

export class FindLastGamesUseCase {
  constructor(private _queryService: FindLastGamesQueryService) {}

  async run(): Promise<FindLastGamesQueryModel[]> {
    const conn = await connectMySQL()
    try {
      return await this._queryService.query(conn, FIND_COUNT)
    } finally {
      conn.end()
    }
  }
}
