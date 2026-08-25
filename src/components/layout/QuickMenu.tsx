import { useSignal } from '@preact/signals';
import { sessionPhase, isQuickMenuOpen, type SessionPhase } from '../../state/session';
import { sectionsForPhase, PHASE_EMPTY_STATE, type DrillEntry, getEntry } from '../../data/registry';
import { currentDrillId, navigateToDrill } from '../../state/routing';
import './QuickMenu.css';
import { useEffect, useRef } from 'preact/hooks';
import { useProgression } from '../progression/useProgression';
import { getProgressionRecommendation } from '../progression/selection';

const PHASES: SessionPhase[] = ['learn', 'practice', 'fun'];
const PHASE_LABEL: Record<SessionPhase, string> = {
  learn: '📖 Learn',
  practice: '🎯 Practice',
  fun: '🎵 Fun',
};

/**
 * Stick navigation model.
 *
 * One flat focus ring over [three phase tabs, ...drills in the current phase].
 * `stick-scroll-down` moves focus; `stick-select` activates whatever is
 * focused — switching phase on a tab, launching the drill on an item.
 *
 * Previously `stick-select` cycled tabs and nothing could launch a drill. The
 * source comment conceded that binding existed "to satisfy" its test rather
 * than because it was right, which left the menu decorative and the app
 * unusable without a mouse — the exact inverse of the Anti-DAW premise.
 */
type NavItem =
  | { kind: 'tab'; phase: SessionPhase }
  | { kind: 'drill'; entry: DrillEntry }
  | { kind: 'next-drill'; entry: DrillEntry };

export function QuickMenu() {
  const focusIndex = useSignal(PHASES.indexOf('practice'));
  const containerRef = useRef<HTMLDivElement>(null);

  const phase = sessionPhase.value;
  const sections = sectionsForPhase(phase);
  const emptyState = PHASE_EMPTY_STATE[phase];
  
  const progression = useProgression();
  const rec = progression ? getProgressionRecommendation(progression) : null;
  const nextDrillEntry = rec?.nextDrillId ? getEntry(rec.nextDrillId) : null;

  const navItems: NavItem[] = [
    ...PHASES.map((p) => ({ kind: 'tab' as const, phase: p })),
    ...(phase === 'practice' && nextDrillEntry ? [{ kind: 'next-drill' as const, entry: nextDrillEntry }] : []),
    ...sections.flatMap((s) => s.entries.map((entry) => ({ kind: 'drill' as const, entry }))),
  ];

  const indexOfDrill = (id: string) =>
    navItems.findIndex((n) => n.kind === 'drill' && n.entry.unit.id === id);

  useEffect(() => {
    // Focus the active tab when the phase changes, so the ring stays coherent.
    focusIndex.value = PHASES.indexOf(phase);
  }, [phase]);

  useEffect(() => {
    let active = isQuickMenuOpen.value;
    if (!active) return;

    const handleScroll = (e: Event) => {
      e.preventDefault();
      focusIndex.value = (focusIndex.value + 1) % navItems.length;
    };

    const handleSelect = (e: Event) => {
      e.preventDefault();
      const item = navItems[focusIndex.value];
      if (!item) return;
      if (item.kind === 'tab') {
        sessionPhase.value = item.phase;
      } else {
        navigateToDrill(item.entry.unit.id, { autoStart: true });
      }
    };

    window.addEventListener('stick-scroll-down', handleScroll);
    window.addEventListener('stick-select', handleSelect);

    return () => {
      window.removeEventListener('stick-scroll-down', handleScroll);
      window.removeEventListener('stick-select', handleSelect);
    };
  }, [isQuickMenuOpen.value, navItems.length, phase]);

  if (!isQuickMenuOpen.value) {
    return null;
  }

  return (
    <div className="quick-menu-panel" ref={containerRef} data-testid="quick-menu-panel">
      <div className="quick-menu-tabs">
        {PHASES.map((p, i) => (
          <button
            key={p}
            className={`tab-btn ${phase === p ? 'active' : ''} ${focusIndex.value === i ? 'focused' : ''}`}
            onClick={() => (sessionPhase.value = p)}
            data-testid={`tab-${p}`}
          >
            {PHASE_LABEL[p]}
          </button>
        ))}
      </div>

      <div className="quick-menu-list">
        {emptyState && (
          <p className="quick-menu-empty" data-testid="phase-empty-state">
            {emptyState}
          </p>
        )}

        {phase === 'practice' && rec && (
          <div className="progression-summary" data-testid="progression-summary" style={{ padding: '16px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', marginBottom: '16px' }}>
            <div data-testid="streak" style={{ marginBottom: '8px', fontWeight: 'bold' }}>
              Practice Streak: {rec.streak.current} days (Best: {rec.streak.longest})
            </div>
            <div className="progression-depths" style={{ display: 'flex', gap: '16px', fontSize: '0.9em', color: '#ccc' }}>
              <div data-testid="depth-timing">Timing: {rec.categoryDepths.timing}</div>
              <div data-testid="depth-dynamics">Dynamics: {rec.categoryDepths.dynamics}</div>
              <div data-testid="depth-independence">Independence: {rec.categoryDepths.independence}</div>
            </div>
          </div>
        )}

        {phase === 'practice' && nextDrillEntry && (
          <div className="quick-menu-section" data-testid="recommended-section">
            <h3 className="sticky-label" style={{ color: '#4caf50' }}>Play Next</h3>
            <ul>
              {(() => {
                const isFocused = navItems[focusIndex.value]?.kind === 'next-drill';
                return (
                  <li
                    className={`menu-item ${isFocused ? 'selected' : ''}`}
                    onClick={() => navigateToDrill(nextDrillEntry.unit.id, { autoStart: true })}
                    data-testid="menu-item-next-drill"
                  >
                    {nextDrillEntry.unit.name}
                  </li>
                );
              })()}
            </ul>
          </div>
        )}

        {sections.map((section) => (
          <div key={section.section} className="quick-menu-section">
            <h3
              className="sticky-label"
              data-testid={`sticky-label-${section.section.replace(/\s+/g, '-')}`}
            >
              {section.section}
            </h3>
            <ul>
              {section.entries.map((entry) => {
                const id = entry.unit.id;
                const isFocused = focusIndex.value === indexOfDrill(id);
                const isActive = currentDrillId.value === id;
                return (
                  <li
                    key={id}
                    className={`menu-item ${isFocused ? 'selected' : ''} ${isActive ? 'active-drill' : ''}`}
                    onClick={() => navigateToDrill(id, { autoStart: true })}
                    data-testid={`menu-item-${id}`}
                    data-active={String(isActive)}
                  >
                    {entry.unit.name}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
