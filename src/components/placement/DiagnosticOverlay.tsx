import { useState, useEffect, useRef } from 'preact/hooks';
import { DIAGNOSTIC_SEGMENTS } from './diagnosticSegments';
import { calculatePlacement } from './placementLogic';
import type { Depth, SkillCategory } from '../../store/ProgressionStore';
import { progressionStore } from '../../store';
import { DrillSession } from '../drills/DrillSession';
import type { DrillResult } from '../../session/DrillRunner';
import { isCalibrationOpen, restoreHiHatCalibration } from '../layout/HiHatCalibration';
import { hasCompletedDiagnostic } from '../../state/session';
import { audioEngine } from '../../audio/AudioEngine';

interface Props {
  onComplete: () => void;
  worker: Worker;
}

export function DiagnosticOverlay({ onComplete, worker }: Props) {
  const [step, setStep] = useState<'intro' | 'playing' | 'summary'>('intro');
  const [segmentIndex, setSegmentIndex] = useState(0);
  const [focusIndex, setFocusIndex] = useState(0); // 0 = Start, 1 = Skip
  const [results, setResults] = useState<Partial<Record<SkillCategory, Depth>>>({});

  useEffect(() => {
    if (step !== 'intro' && step !== 'summary') return;
    
    const handleScroll = (e: Event) => {
      e.stopImmediatePropagation();
      setFocusIndex(prev => (prev === 0 ? 1 : 0));
    };

    const handleSelect = (e: Event) => {
      e.stopImmediatePropagation();
      if (step === 'intro') {
        if (focusIndex === 0) {
          void startDiagnostic();
        } else {
          void skipDiagnostic();
        }
      } else if (step === 'summary') {
        void finishDiagnostic();
      }
    };

    window.addEventListener('stick-scroll-down', handleScroll);
    window.addEventListener('stick-select', handleSelect);

    return () => {
      window.removeEventListener('stick-scroll-down', handleScroll);
      window.removeEventListener('stick-select', handleSelect);
    };
  }, [step, focusIndex]);

  const startDiagnostic = async () => {
    const unlocked = await audioEngine.unlock();
    if (!unlocked) {
      console.warn("Audio unlock failed");
      return;
    }
    setStep('playing');
    setSegmentIndex(0);
  };

  const skipDiagnostic = async () => {
    hasCompletedDiagnostic.value = true;
    await progressionStore.recordPlacementSkip();
    if (!(await restoreHiHatCalibration())) {
      isCalibrationOpen.value = true;
    }
    onComplete();
  };

  const finishDiagnostic = async () => {
    hasCompletedDiagnostic.value = true;
    await progressionStore.recordPlacement(results);
    if (!(await restoreHiHatCalibration())) {
      isCalibrationOpen.value = true;
    }
    onComplete();
  };

  const handleSegmentComplete = (r: DrillResult) => {
    const currentSegment = DIAGNOSTIC_SEGMENTS[segmentIndex];
    const category = currentSegment.category as SkillCategory;
    const depth = calculatePlacement(category, r);
    
    setResults(prev => ({
      ...prev,
      [category]: depth
    }));

    if (segmentIndex < DIAGNOSTIC_SEGMENTS.length - 1) {
      setSegmentIndex(segmentIndex + 1);
    } else {
      setStep('summary');
      setFocusIndex(0);
    }
  };

  if (step === 'intro') {
    return (
      <div class="diagnostic-overlay" data-testid="diagnostic-overlay" style={{
        position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', 
        background: 'rgba(0,0,0,0.85)', zIndex: 9999, display: 'flex', 
        flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
      }}>
        <h2>Welcome to In The Pocket</h2>
        <p>Let's calibrate your drum kit placement.</p>
        <div style={{ display: 'flex', gap: '16px', marginTop: '24px' }}>
          <button 
            class={`tab-btn ${focusIndex === 0 ? 'active' : ''}`} 
            onClick={startDiagnostic}
          >
            Start Placement Diagnostic
          </button>
          <button 
            class={`tab-btn ${focusIndex === 1 ? 'active' : ''}`} 
            onClick={skipDiagnostic}
          >
            Skip
          </button>
        </div>
      </div>
    );
  }

  if (step === 'playing') {
    const unit = DIAGNOSTIC_SEGMENTS[segmentIndex];
    return (
      <div style={{
        position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
        background: '#111', zIndex: 9999, padding: '20px'
      }}>
        <h2 style={{ textAlign: 'center', marginBottom: '20px' }}>
          Segment {segmentIndex + 1} of {DIAGNOSTIC_SEGMENTS.length}: {unit.category.toUpperCase()}
        </h2>
        <p style={{ textAlign: 'center', marginBottom: '40px', color: '#888' }}>
          Now try this — don't worry about perfection, we're just finding your starting point.
        </p>
        <div style={{ width: '100%', maxWidth: '800px', margin: '0 auto', border: '1px solid #333', padding: '20px', borderRadius: '12px' }}>
           <DrillSession 
             key={unit.id} 
             unit={unit} 
             worker={worker}
             onComplete={handleSegmentComplete} 
           />
        </div>
      </div>
    );
  }

  if (step === 'summary') {
    return (
      <div class="diagnostic-overlay" style={{
        position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', 
        background: 'rgba(0,0,0,0.85)', zIndex: 9999, display: 'flex', 
        flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
      }}>
        <h2>Placement Complete</h2>
        <div style={{ marginTop: '20px', textAlign: 'left', minWidth: '300px' }}>
          {Object.entries(results).map(([cat, depth]) => (
            <div key={cat} style={{ marginBottom: '12px' }}>
              <span style={{ color: '#00fff5', textTransform: 'capitalize' }}>{cat}:</span> {depth}
            </div>
          ))}
        </div>
        <button 
          class="tab-btn active" 
          style={{ marginTop: '40px' }}
          onClick={finishDiagnostic}
        >
          Continue
        </button>
      </div>
    );
  }

  return null;
}
