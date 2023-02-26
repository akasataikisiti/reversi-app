import { Disc } from './disc'
import { Move } from './move'

export class Board {
  constructor(private _discs: Disc[][]) {}

  place(move: Move): Board {
    // TODO 盤面に置けるかチェック
    //  盤面をコピー
    const newDiscs = this._discs.map((line) => {
      return line.map((disc) => disc)
    })
    // 石を置く
    newDiscs[move.point.y][move.point.x] = move.disc

    // ひっくり返す
    return new Board(newDiscs)
  }

  get discs() {
    return this._discs
  }
}
