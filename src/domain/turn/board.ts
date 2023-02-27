import { Disc } from './disc'
import { Move } from './move'
import { Point } from './point'

export class Board {
  constructor(private _discs: Disc[][]) {}

  place(move: Move): Board {
    // からのマス目ではない場合、置くことはできない
    if (this._discs[move.point.y][move.point.x] !== Disc.Empty)
      throw new Error('Selected point is not empty')
    // ひっくり返せる点をリストアップ
    const flipPoints = this.listFlipPoints()

    // ひっくり返せる点がない場合置くことはできない
    if (flipPoints.length === 0) throw new Error('Flip points is empty')

    //  盤面をコピー
    const newDiscs = this._discs.map((line) => {
      return line.map((disc) => disc)
    })
    // 石を置く
    newDiscs[move.point.y][move.point.x] = move.disc

    // ひっくり返す
    return new Board(newDiscs)
  }

  private listFlipPoints(): Point[] {
    return [new Point(0, 0)]
  }

  get discs() {
    return this._discs
  }
}

const E = Disc.Empty
const D = Disc.Dark
const L = Disc.Light

const INITAL_DISCS = [
  [E, E, E, E, E, E, E, E],
  [E, E, E, E, E, E, E, E],
  [E, E, E, E, E, E, E, E],
  [E, E, E, D, L, E, E, E],
  [E, E, E, L, D, E, E, E],
  [E, E, E, E, E, E, E, E],
  [E, E, E, E, E, E, E, E],
  [E, E, E, E, E, E, E, E],
]

export const initialBoard = new Board(INITAL_DISCS)
