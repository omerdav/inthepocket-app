import { useSignal } from '@preact/signals';
import { sessionPhase, isQuickMenuOpen } from '../../state/session';
import './QuickMenu.css';
import { useEffect, useRef } from 'preact/hooks';

// Dummy data for the MVP menu items
const MENU_DATA = {
  learn: [
    { section: 'Foundations', items: ['Grip & Posture', 'Dynamics Gate', 'Timing Gate'] },
    { section: 'Rudiments', items: ['Single Strokes', 'Double Strokes', 'Paradiddles'] },
  ],
  practice: [
    { section: 'Bootcamps', items: ['Dynamics Gate Drill 1', 'Dynamics Gate Drill 5'] },
    { section: 'Independence', items: ['Bossa Nova Ostinato', 'Samba Feet'] },
  ],
  fun: [
    { section: 'Play-Alongs', items: ['Rock Groove 1', 'Funk Groove 1'] },
  ]
};

export function QuickMenu() {
  const selectedIndex = useSignal(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // When unmounted due to playing, we return null entirely (Visibility State Machine)
  if (!isQuickMenuOpen.value) {
    return null;
  }

  const currentData = MENU_DATA[sessionPhase.value];
  
  // Flatten items for keyboard/stick navigation logic
  const flatItems = currentData.flatMap(section => section.items);

  useEffect(() => {
    // Reset selection when phase changes
    selectedIndex.value = 0;
  }, [sessionPhase.value]);

  useEffect(() => {
    if (!isQuickMenuOpen.value) return;

    const handleScroll = (e: Event) => {
      e.preventDefault();
      // Cycle through flat items
      selectedIndex.value = (selectedIndex.value + 1) % flatItems.length;
    };

    const handleSelect = (e: Event) => {
      e.preventDefault();
      // MVP: Switch tab on stick-select if we are at the top, or just cycle tabs.
      // Let's just cycle tabs for now on stick-select to satisfy "stick-driven tab switches"
      const phases: SessionPhase[] = ['learn', 'practice', 'fun'];
      const currentIdx = phases.indexOf(sessionPhase.value);
      sessionPhase.value = phases[(currentIdx + 1) % phases.length];
    };

    window.addEventListener('stick-scroll-down', handleScroll);
    window.addEventListener('stick-select', handleSelect);

    return () => {
      window.removeEventListener('stick-scroll-down', handleScroll);
      window.removeEventListener('stick-select', handleSelect);
    };
  }, [isQuickMenuOpen.value, flatItems.length]);

  return (
    <div className="quick-menu-panel" ref={containerRef} data-testid="quick-menu-panel">
      <div className="quick-menu-tabs">
        <button 
          className={`tab-btn ${sessionPhase.value === 'learn' ? 'active' : ''}`}
          onClick={() => sessionPhase.value = 'learn'}
          data-testid="tab-learn"
        >
          📖 Learn
        </button>
        <button 
          className={`tab-btn ${sessionPhase.value === 'practice' ? 'active' : ''}`}
          onClick={() => sessionPhase.value = 'practice'}
          data-testid="tab-practice"
        >
          🎯 Practice
        </button>
        <button 
          className={`tab-btn ${sessionPhase.value === 'fun' ? 'active' : ''}`}
          onClick={() => sessionPhase.value = 'fun'}
          data-testid="tab-fun"
        >
          🎵 Fun
        </button>
      </div>

      <div className="quick-menu-list">
        {currentData.map((section, sIdx) => (
          <div key={sIdx} className="quick-menu-section">
            <h3 className="sticky-label" data-testid={`sticky-label-${section.section}`}>
              {section.section}
            </h3>
            <ul>
              {section.items.map((item) => {
                const globalIndex = flatItems.indexOf(item);
                const isSelected = selectedIndex.value === globalIndex;
                return (
                  <li 
                    key={item} 
                    className={`menu-item ${isSelected ? 'selected' : ''}`}
                    onClick={() => selectedIndex.value = globalIndex}
                    data-testid={`menu-item-${item.replace(/\s+/g, '-')}`}
                  >
                    {item}
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
