export class BlindModeController {
  private _consecutiveGreens: number = 0;
  private _opacity: number = 1.0;
  private readonly _fadeDurationMs: number = 2000;
  private _lastTimeMs: number = 0;

  constructor() {}

  /**
   * Called to register a new hit category.
   */
  recordHit(category: 'green' | 'yellow' | 'red' | 'miss'): void {
    if (category === 'green') {
      this._consecutiveGreens++;
    } else {
      this.reset();
    }
  }

  /**
   * Calculate and return the current opacity based on consecutive greens and elapsed time.
   * Called per frame.
   */
  getOpacity(currentTimeMs: number, isEnabled: boolean, threshold: number): number {
    if (this._lastTimeMs === 0) {
      this._lastTimeMs = currentTimeMs;
    }
    
    const deltaTime = currentTimeMs - this._lastTimeMs;
    this._lastTimeMs = currentTimeMs;

    if (isEnabled && this._consecutiveGreens >= threshold) {
      this._opacity = Math.max(0, this._opacity - (deltaTime / this._fadeDurationMs));
    } else {
      this._opacity = 1.0;
    }

    return this._opacity;
  }

  /**
   * Snap opacity back to 1.0 and reset consecutive greens counter.
   */
  reset(): void {
    this._opacity = 1.0;
    this._consecutiveGreens = 0;
  }
}
