export class squareRecord {
  constructor(
    private _id: number,
    private _turnId: number,
    private _x: number,
    private _y: number,
    private _disc: Date
  ) {}
  get id() {
    return this._id
  }
  get x() {
    return this._x
  }
  get y() {
    return this._y
  }
  get disc() {
    return this._disc
  }
}
