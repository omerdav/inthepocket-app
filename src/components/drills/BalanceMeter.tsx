import { useEffect, useRef } from 'preact/hooks';
import { BalanceTracker } from '../../session/balance';
import './BalanceMeter.css';

interface Props {
  tracker: BalanceTracker;
  hasHandContent: boolean;
}

export function BalanceMeter({ tracker, hasHandContent }: Props) {
  const markerRef = useRef<HTMLDivElement>(null);
  const insufficientRef = useRef<HTMLDivElement>(null);
  const barContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!hasHandContent) return;

    let animationFrameId: number;
    let lastHasData = false;
    let lastDrift = -999;

    const render = () => {
      const hasEnoughData = tracker.hasEnoughData;
      
      if (hasEnoughData !== lastHasData) {
        lastHasData = hasEnoughData;
        if (hasEnoughData) {
          if (insufficientRef.current) insufficientRef.current.style.display = 'none';
          if (barContainerRef.current) barContainerRef.current.style.display = 'flex';
        } else {
          if (insufficientRef.current) insufficientRef.current.style.display = 'block';
          if (barContainerRef.current) barContainerRef.current.style.display = 'none';
        }
      }

      if (hasEnoughData) {
        // Map velocity difference to a -1 to 1 range (clamped). 40 is max drift.
        // Positive drift = marker shifts right = right is weaker.
        // Negative drift = marker shifts left = left is weaker.
        // If leftMean < rightMean, left is weaker, we want drift < 0.
        // So drift = (leftMean - rightMean) / maxDiff
        const maxDiff = 40;
        let drift = (tracker.leftMean - tracker.rightMean) / maxDiff;
        if (drift < -1) drift = -1;
        if (drift > 1) drift = 1;
        
        if (drift !== lastDrift) {
          lastDrift = drift;
          const leftPercent = 50 + (drift * 50);
          if (markerRef.current) markerRef.current.style.left = `${leftPercent}%`;
        }
      }

      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animationFrameId);
  }, [tracker, hasHandContent]);

  if (!hasHandContent) {
    return null; // R7: Hidden entirely for drills with no left/right content
  }

  return (
    <div class="balance-meter" data-testid="balance-meter">
      <div class="balance-label">Assumed Sticking Balance</div>
      <div class="balance-insufficient" ref={insufficientRef} data-testid="balance-insufficient">Not enough data (needs 4 hits/hand)</div>
      <div class="balance-bar-container" ref={barContainerRef} style={{ display: 'none' }} data-testid="balance-bar">
        <span class="hand-label left">L</span>
        <div class="balance-bar">
          <div class="balance-marker" ref={markerRef} data-testid="balance-marker">[o]</div>
        </div>
        <span class="hand-label right">R</span>
      </div>
    </div>
  );
}
