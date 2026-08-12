export class BalanceTracker {
  private _leftCount = 0;
  private _leftSum = 0;
  private _rightCount = 0;
  private _rightSum = 0;

  // R6: require at least 4 hits per hand to be meaningful
  private readonly MIN_HITS = 4;

  public registerHit(sticking: 'L' | 'R' | '' | undefined, velocity: number): void {
    if (sticking === 'L') {
      this._leftCount++;
      this._leftSum += velocity;
    } else if (sticking === 'R') {
      this._rightCount++;
      this._rightSum += velocity;
    }
  }

  public get leftCount(): number { return this._leftCount; }
  public get rightCount(): number { return this._rightCount; }
  public get leftMean(): number { return this._leftCount > 0 ? this._leftSum / this._leftCount : 0; }
  public get rightMean(): number { return this._rightCount > 0 ? this._rightSum / this._rightCount : 0; }
  public get hasEnoughData(): boolean { return this._leftCount >= this.MIN_HITS && this._rightCount >= this.MIN_HITS; }

  public reset(): void {
    this._leftCount = 0;
    this._leftSum = 0;
    this._rightCount = 0;
    this._rightSum = 0;
  }
}
