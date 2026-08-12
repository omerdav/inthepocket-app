
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
}

export const RhythmGrid = ({ sequence, correlator }: RhythmGridProps) => {
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
          canvas.width = rect.width;
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
        
        if (i === 0 && x !== lastNoteX && mockCorrelatorTime !== null) {
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
        
        ctx.fillStyle = '#000';
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        
        if (isX) {
          ctx.beginPath();
          ctx.moveTo(x - 5, y - 5);
          ctx.lineTo(x + 5, y + 5);
          ctx.moveTo(x + 5, y - 5);
          ctx.lineTo(x - 5, y + 5);
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.arc(x, y, 5, 0, Math.PI * 2);
          ctx.fill();
        }
        
        if (note.isAccent) {
          ctx.beginPath();
          ctx.moveTo(x - 4, y - 12);
          ctx.lineTo(x + 4, y - 10);
          ctx.lineTo(x - 4, y - 8);
          ctx.stroke();
        }
        
        if (note.sticking) {
          ctx.font = '10px Arial';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          
          if (cuePlacement === 'inside' && !isX) {
            ctx.fillStyle = '#fff';
            ctx.fillText(note.sticking, x, y);
          } else {
            ctx.fillStyle = '#000';
            ctx.fillText(note.sticking, x, staffTop + 50);
          }
        }
      }
      
      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
      canvas.removeEventListener('itp-correlator-mock', onCorrelatorMock);
    };
  }, [sequence, correlator]);

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
