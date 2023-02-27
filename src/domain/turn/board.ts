import { Disc, isOppositeDisc } from './disc'
import { Move } from './move'
import { Point } from './point'

export class Board {
  private _walledDiscs: Disc[][]

  constructor(private _discs: Disc[][]) {
    this._walledDiscs = this.walledDiscs()
  }

  place(move: Move): Board {
    // からのマス目ではない場合、置くことはできない
    if (this._discs[move.point.y][move.point.x] !== Disc.Empty)
      throw new Error('Selected point is not empty')
    // ひっくり返せる点をリストアップ
    const flipPoints = this.listFlipPoints(move)

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

  private listFlipPoints(move: Move): Point[] {
    const flipPoints: Point[] = []

    const walledX = move.point.x + 1
    const walledY = move.point.y + 1

    // 上
    const flipCandidate: Point[] = []

    // 一つ動いた位置から開始
    const cursorX = walledX
    let cursorY = walledY - 1

    while (isOppositeDisc(move.disc, this._walledDiscs[cursorY][cursorX])) {
      // 番兵を考慮して-1する
      flipCandidate.push(new Point(cursorX - 1, cursorY - 1))
      cursorY--
      // 次の手が同じ色の石なら、ひっくり返す石が確定
      if (move.disc === this._walledDiscs[cursorY][cursorX]) {
        flipPoints.push(...flipCandidate)
        break
      }
    }
    return flipPoints
  }

  private walledDiscs(): Disc[][] {
    const walled: Disc[][] = []

    const topAndBottomWall = Array(this._discs[0].length + 2).fill(Disc.Wall)
    walled.push(topAndBottomWall)

    this._discs.forEach((line) => {
      const walledLine = [Disc.Wall, ...line, Disc.Wall]
      walled.push(walledLine)
    })

    walled.push(topAndBottomWall)

    return walled
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
