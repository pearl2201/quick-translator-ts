export class CharRange {
  private _startIndex: number;
  private _length: number;

  constructor(startIndex: number, length: number) {
    this._startIndex = startIndex;
    this._length = length;
  }

  get startIndex(): number {
    return this._startIndex;
  }

  set startIndex(value: number) {
    this._startIndex = value;
  }

  get length(): number {
    return this._length;
  }

  set length(value: number) {
    this._length = value;
  }

  IsInRange(index: number): boolean {
    return this._startIndex <= index &&
      index <= this._startIndex + this._length - 1;
  }

  GetEndIndex(): number {
    return this._startIndex + this._length - 1;
  }
}
