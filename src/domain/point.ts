export class Point {
  constructor(private _x: number, private _y: number) {}

  get x() {
    return this._x
  }
  public get y() {
    return this._y
  }
}
