export class MoveRecord {
  constructor(
    private _id: number,
    private _turnId: number,
    private _x: number,
    private _y: number
  ) {}
  get id() {
    return this._id
  }
}
