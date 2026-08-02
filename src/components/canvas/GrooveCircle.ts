import { BlindModeController } from './BlindModeController';
import { SCORING_CATEGORIES } from '../../workers/scoring.types';
import { isBlindModeEnabled, blindModeThreshold, hitVisualMode } from '../../state/settings';

export interface GrooveCircleConfig {
  bpm: number;
  timeSignature: number; // e.g., 4 for 4/4
  canvasSize: number;
}

export class GrooveCircle {
  private _container: HTMLElement | null = null;
  private _canvas: HTMLCanvasElement | null = null;
  private _ctx: CanvasRenderingContext2D | null = null;
  private _config: GrooveCircleConfig;
  private _rafId: number = 0;
  private _running: boolean = false;
  
  private _blindMode: BlindModeController;

  // Pre-allocated styling strings
  private readonly COLOR_GREEN = 'hsl(142, 76%, 45%)';
  private readonly COLOR_YELLOW = 'hsl(45, 95%, 55%)';
  private readonly COLOR_RED = 'hsl(0, 80%, 55%)';
  private readonly COLOR_BG = '#000000';
  private readonly COLOR_RING = '#333333';
  private readonly COLOR_TEXT = '#ffffff';

  // Math cache
  private readonly _twoPi = Math.PI * 2;
  
  private _lastHitTimeMs: number = 0;
  private _lastHitDelta: number = 0;
  private _lastHitScore: number = SCORING_CATEGORIES.MISS;
  
  constructor(config: GrooveCircleConfig) {
    this._config = config;
    this._blindMode = new BlindModeController();
    this._render = this._render.bind(this);
  }

  mount(container: HTMLElement): void {
    this._container = container;
    this._canvas = document.createElement('canvas');
    this._canvas.dataset.testid = 'groove-circle-canvas';
    this._canvas.width = this._config.canvasSize;
    this._canvas.height = this._config.canvasSize;
    this._canvas.style.width = `${this._config.canvasSize}px`;
    this._canvas.style.height = `${this._config.canvasSize}px`;

    // alpha: false for optimization
    this._ctx = this._canvas.getContext('2d', { alpha: false });
    
    // E2E QA Hooks
    (window as any).__E2E_GROOVE_CIRCLE_CTX__ = this._ctx;
    (window as any).__E2E_SIMULATE_HIT__ = (type: 'perfect' | 'early' | 'late', timeMs?: number) => {
      const score = type === 'perfect' ? SCORING_CATEGORIES.GREEN : type === 'early' ? SCORING_CATEGORIES.YELLOW : SCORING_CATEGORIES.RED;
      const delta = type === 'perfect' ? 0 : type === 'early' ? -25 : 25;
      this.registerHit(delta, score);
      if (timeMs !== undefined) {
        this._lastHitTimeMs = timeMs;
      }
    };
    (window as any).__E2E_FORCE_RENDER__ = (timeMs?: number) => {
      this._render(timeMs ?? performance.now());
    };

    this._container.appendChild(this._canvas);
  }

  unmount(): void {
    this.stop();
    if (this._container && this._canvas) {
      this._container.removeChild(this._canvas);
    }
    this._canvas = null;
    this._ctx = null;
    this._container = null;
    
    // Cleanup E2E QA Hooks
    delete (window as any).__E2E_GROOVE_CIRCLE_CTX__;
    delete (window as any).__E2E_SIMULATE_HIT__;
  }

  start(): void {
    if (this._running) return;
    this._running = true;
    this._rafId = requestAnimationFrame(this._render);
  }

  stop(): void {
    if (!this._running) return;
    this._running = false;
    cancelAnimationFrame(this._rafId);
  }
  
  public get blindMode(): BlindModeController {
    return this._blindMode;
  }

  registerHit(deltaMs: number, score: number): void {
    this._lastHitTimeMs = performance.now();
    this._lastHitDelta = deltaMs;
    this._lastHitScore = score;
    
    // Convert numerical score to category string for blind mode
    let cat: 'green' | 'yellow' | 'red' | 'miss' = 'miss';
    if (score === SCORING_CATEGORIES.GREEN) cat = 'green';
    else if (score === SCORING_CATEGORIES.YELLOW) cat = 'yellow';
    else if (score === SCORING_CATEGORIES.RED) cat = 'red';
    
    this._blindMode.recordHit(cat);
  }

  private _render(timeMs: number): void {
    if (!this._running || !this._ctx || !this._canvas) return;
    const ctx = this._ctx;
    const size = this._config.canvasSize;
    const center = size / 2 | 0;
    const radius = center * 0.8 | 0;

    // Apply blind mode opacity
    const opacity = this._blindMode.getOpacity(timeMs, isBlindModeEnabled.value, blindModeThreshold.value);
    
    // E2E QA Hook
    (window as any).__E2E_LAST_OPACITY__ = opacity;

    // 1. Clear background (alpha:false means we must paint it fully)
    ctx.globalAlpha = 1.0;
    ctx.fillStyle = this.COLOR_BG;
    ctx.fillRect(0, 0, size, size);

    // If opacity is 0, we can skip most drawing to save time
    if (opacity > 0) {
      ctx.globalAlpha = opacity;
      
      // 2. Draw outer ring
      ctx.strokeStyle = this.COLOR_RING;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(center, center, radius, 0, this._twoPi);
      ctx.stroke();

      // 3. Draw beat indicators
      const numBeats = this._config.timeSignature;
      ctx.strokeStyle = this.COLOR_TEXT;
      ctx.lineWidth = 2;
      for (let i = 0; i < numBeats; i++) {
        const angle = (i / numBeats) * this._twoPi - Math.PI / 2;
        const c = Math.cos(angle);
        const s = Math.sin(angle);
        
        ctx.beginPath();
        ctx.moveTo(center + c * (radius - 10), center + s * (radius - 10));
        ctx.lineTo(center + c * (radius + 10), center + s * (radius + 10));
        ctx.stroke();
      }

      // 4. Draw BPM text
      ctx.fillStyle = this.COLOR_TEXT;
      ctx.font = '24px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(this._config.bpm.toString() + ' BPM', center, center);

      // Hit Visualization
      const timeSinceHit = timeMs - this._lastHitTimeMs;
      if (timeSinceHit < 300 && this._lastHitScore !== SCORING_CATEGORIES.MISS) {
        const hitAlpha = 1.0 - (timeSinceHit / 300);
        ctx.globalAlpha = opacity * hitAlpha;
        
        let hitColor = this.COLOR_GREEN;
        // The Tuner Pulse: Green for Perfect, Yellow on Left for Early, Red on Right for Late
        if (this._lastHitScore === SCORING_CATEGORIES.GREEN || Math.abs(this._lastHitDelta) < 15) {
          hitColor = this.COLOR_GREEN;
        } else if (this._lastHitDelta < -15) {
          hitColor = this.COLOR_YELLOW;
        } else if (this._lastHitDelta > 15) {
          hitColor = this.COLOR_RED;
        }
        
        // E2E QA Hook
        (window as any).__E2E_LAST_HIT_COLOR__ = hitColor;

        const mode = hitVisualMode.value;
        if (mode === 'pulse') {
          ctx.strokeStyle = hitColor;
          ctx.lineWidth = 8;
          ctx.beginPath();
          if (hitColor === this.COLOR_GREEN) {
            ctx.arc(center, center, radius + 10, 0, this._twoPi);
          } else if (hitColor === this.COLOR_YELLOW) { // Early -> Left half
            ctx.arc(center, center, radius + 10, Math.PI / 2, (3 * Math.PI) / 2);
          } else { // Late -> Right half
            ctx.arc(center, center, radius + 10, -Math.PI / 2, Math.PI / 2);
          }
          ctx.stroke();
        } else if (mode === 'arrows') {
          ctx.fillStyle = hitColor;
          const arrowOffset = 50;
          ctx.beginPath();
          if (hitColor === this.COLOR_GREEN) {
            ctx.arc(center, center - 40, 15, 0, this._twoPi);
          } else if (hitColor === this.COLOR_YELLOW) { // Left arrow
            ctx.moveTo(center - arrowOffset, center - 40);
            ctx.lineTo(center - arrowOffset + 20, center - 40 - 15);
            ctx.lineTo(center - arrowOffset + 20, center - 40 + 15);
          } else { // Right arrow
            ctx.moveTo(center + arrowOffset, center - 40);
            ctx.lineTo(center + arrowOffset - 20, center - 40 - 15);
            ctx.lineTo(center + arrowOffset - 20, center - 40 + 15);
          }
          ctx.fill();
        }
      }

      ctx.globalAlpha = 1.0;
    }

    this._rafId = requestAnimationFrame(this._render);
  }
}
