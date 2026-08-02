// HiHatStateTracker

export type HiHatState = 'open' | 'closed' | 'partial';

export interface HiHatTrackerOptions {
  /** The minimum calibrated value (e.g., fully open) */
  min?: number;
  /** The maximum calibrated value (e.g., fully closed) */
  max?: number;
  /** Percentage of travel considered "closed" (e.g. 0.9 for 90%) */
  closedThresholdPct?: number;
  /** Percentage of travel considered "open" (e.g. 0.1 for 10%) */
  openThresholdPct?: number;
  /** Maximum time (ms) a full open-to-close transit can take to register as a 'chick' */
  chickTimeWindowMs?: number;
  /** Callback when a discrete hi-hat event occurs (chick, open, closed) */
  onEvent?: (eventType: 'hihat-chick' | 'hihat-open' | 'hihat-closed', velocity: number, timestamp: number) => void;
}

export class HiHatStateTracker {
  private min: number = 0;
  private max: number = 127;
  private closedThresholdPct: number = 0.9;
  private openThresholdPct: number = 0.1;
  private chickTimeWindowMs: number = 300;
  
  private currentState: HiHatState = 'partial';
  private lastOpenTimestamp: number = 0;
  private onEvent?: HiHatTrackerOptions['onEvent'];

  constructor(options: HiHatTrackerOptions = {}) {
    this.min = options.min ?? 0;
    this.max = options.max ?? 127;
    this.closedThresholdPct = options.closedThresholdPct ?? 0.9;
    this.openThresholdPct = options.openThresholdPct ?? 0.1;
    this.chickTimeWindowMs = options.chickTimeWindowMs ?? 300;
    this.onEvent = options.onEvent;
  }

  public calibrate(min: number, max: number) {
    this.min = min;
    this.max = max;
  }

  /**
   * Process an incoming CC#4 value.
   * Uses percentage-based hysteresis. 
   * Works regardless of polarity (e.g., min=127, max=0 or min=0, max=127).
   */
  public processCC(value: number, timestampMs: number) {
    // Calculate normalized percentage (0.0 to 1.0)
    // Avoid division by zero
    const range = this.max - this.min;
    if (range === 0) return;

    // Percentage of travel from min towards max
    let pct = (value - this.min) / range;
    
    // Clamp
    if (pct < 0) pct = 0;
    if (pct > 1) pct = 1;

    if (pct >= this.closedThresholdPct && this.currentState !== 'closed') {
      this.currentState = 'closed';
      this.onEvent?.('hihat-closed', value, timestampMs);

      // Check for chick
      const dt = timestampMs - this.lastOpenTimestamp;
      if (dt <= this.chickTimeWindowMs) {
        // Calculate velocity (pseudo-velocity based on time)
        // Shorter dt = higher velocity. 
        // Let's say dt=50ms is 127 velocity, dt=chickTimeWindowMs is 30.
        let velocity = 127 - ((dt - 50) / (this.chickTimeWindowMs - 50)) * (127 - 30);
        velocity = Math.max(1, Math.min(127, Math.round(velocity)));
        
        this.onEvent?.('hihat-chick', velocity, timestampMs);
      }
    } 
    else if (pct <= this.openThresholdPct && this.currentState !== 'open') {
      this.currentState = 'open';
      this.lastOpenTimestamp = timestampMs;
      this.onEvent?.('hihat-open', value, timestampMs);
    }
    else if (pct > this.openThresholdPct && pct < this.closedThresholdPct) {
      this.currentState = 'partial';
    }
  }
}
