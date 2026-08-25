
import { useEffect, useRef } from 'preact/hooks';
import { stickingCuePlacement } from '../../state/settings';

export type DrumType = 'kick' | 'snare' | 'hihat';

export interface DrillNote {
  targetTimeMs: number;
  drumType: DrumType;
  sticking: 'R' | 'L' | '';
  isAccent: boolean;
}

export type DrillSequence = DrillNote[];

interface RhythmGridProps {
  sequence: DrillSequence;
  correlator?: any; // To fulfill the TimestampCorrelator requirement if passed as prop
  startPerfMs?: number | null;
}

export const RhythmGrid = ({ sequence, correlator, startPerfMs }: RhythmGridProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // E2E QA Hook

    let animationFrameId: number;
    let mockCorrelatorTime: number | null = null;
    let lastPlayheadX = -1;
    let lastNoteX = -1;

    const onCorrelatorMock = (e: Event) => {
      mockCorrelatorTime = (e as CustomEvent).detail.timeMs;
    };
    canvas.addEventListener('itp-correlator-mock', onCorrelatorMock);
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (canvas.parentElement && entry.target === canvas.parentElement) {
          const rect = entry.contentRect;
          // Set internal coordinate scale to match display pixels
          const newWidth = Math.round(rect.width);
          if (canvas.width !== newWidth) {
            requestAnimationFrame(() => {
              if (canvasRef.current) {
                canvasRef.current.width = newWidth;
              }
            });
          }
          // Keep fixed height for the drum staff for now, just stretch horizontally
        }
      }
    });
    
    // We observe the parent container to get correct width before canvas scales
    if (canvas.parentElement) {
      resizeObserver.observe(canvas.parentElement);
    }

    const render = (timeMs: number) => {
      // 1. Calculate time
      let currentTimeMs = timeMs;
      if (correlator) {
        // Read the exact audio time correlated with this frame's performance time
        // mapHitTime returns seconds, convert back to ms if targetTimeMs is in ms
        currentTimeMs = correlator.mapHitTime(timeMs) * 1000;
      } else if (startPerfMs != null) {
        currentTimeMs = timeMs - startPerfMs;
      } else {
        currentTimeMs = 0; // Stable resting state before start
      }
      
      if (mockCorrelatorTime !== null) {
        currentTimeMs = mockCorrelatorTime;
      }
      
      const width = canvas.width;
      const height = canvas.height;
      const staffTop = height / 2 - 20;
      const staffSpacing = 10;
      
      // Clear canvas
      ctx.clearRect(0, 0, width, height);
      
      // Draw 5-line staff
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1;
      for (let i = 0; i < 5; i++) {
        const y = staffTop + i * staffSpacing;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
      
      // We want to display a window of roughly 2 seconds
      const windowMs = 2000;
      const pixelsPerMs = width / windowMs;
      const playheadX = width * 0.2; // Playhead at 20% of width
      
      // Draw Playhead
      ctx.strokeStyle = 'red';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(playheadX, staffTop - 20);
      ctx.lineTo(playheadX, staffTop + 40 + 20);
      ctx.stroke();
      
      if (playheadX !== lastPlayheadX) {
        lastPlayheadX = playheadX;
        canvas.dataset.playheadX = String(playheadX);
      }
      
      // Draw Notes
      const cuePlacement = stickingCuePlacement.peek(); // No allocation on hot path
      
      for (let i = 0; i < sequence.length; i++) {
        const note = sequence[i];
        
        const deltaMs = note.targetTimeMs - currentTimeMs;
        const x = playheadX + deltaMs * pixelsPerMs;
        
        if (i === 0 && x !== lastNoteX) {
          lastNoteX = x;
          canvas.dataset.noteX = String(x);
        }
        
        // Only draw if visible
        if (x < -50 || x > width + 50) continue;
        
        // Determine Y position
        let y = staffTop;
        let isX = false;
        
        if (note.drumType === 'kick') {
          y = staffTop + 3.5 * staffSpacing;
        } else if (note.drumType === 'snare') {
          y = staffTop + 1.5 * staffSpacing;
        } else if (note.drumType === 'hihat') {
          y = staffTop - 0.5 * staffSpacing;
          isX = true;
        }
        
        const isActive = Math.abs(deltaMs) < 100;
        const scale = isActive ? 1.2 : 1.0;
        const color = isActive ? '#00ffff' : '#000';
        
        if (isActive) {
          ctx.shadowColor = '#00ffff';
          ctx.shadowBlur = 10;
        } else {
          ctx.shadowColor = 'transparent';
          ctx.shadowBlur = 0;
        }
        
        ctx.fillStyle = color;
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        
        if (isX) {
          const s = 5 * scale;
          ctx.beginPath();
          ctx.moveTo(x - s, y - s);
          ctx.lineTo(x + s, y + s);
          ctx.moveTo(x + s, y - s);
          ctx.lineTo(x - s, y + s);
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.arc(x, y, 5 * scale, 0, Math.PI * 2);
          ctx.fill();
        }
        
        if (note.isAccent) {
          ctx.beginPath();
          const s = scale;
          ctx.moveTo(x - 4*s, y - 12*s);
          ctx.lineTo(x + 4*s, y - 10*s);
          ctx.lineTo(x - 4*s, y - 8*s);
          ctx.stroke();
        }
        
        if (note.sticking) {
          ctx.font = `${10 * scale}px Arial`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          
          if (cuePlacement === 'inside' && !isX) {
            ctx.fillStyle = '#fff';
            ctx.fillText(note.sticking, x, y);
          } else {
            ctx.fillStyle = color;
            ctx.fillText(note.sticking, x, staffTop + 50);
          }
        }

        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
      }
      
      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
      canvas.removeEventListener('itp-correlator-mock', onCorrelatorMock);
    };
  }, [sequence, correlator, startPerfMs]);

  return (
    <canvas 
      ref={canvasRef} 
      width={800} 
      height={200} 
      data-testid="rhythm-grid-canvas"
      style={{ width: '100%', height: 'auto', display: 'block', backgroundColor: '#f5f5f5' }} 
    />
  );
};
