/**
 * Teach the app which notes this kit sends (Release_Plan 7.3, register P-3).
 *
 * `MIDI_NOTE` is one hardcoded layout written against an Alesis. A Roland
 * closed hi-hat sends 22 and a Yamaha cross-stick sends 37, and before this
 * those pads did nothing at all — no error, no message, nothing on screen.
 *
 * SNARE HEAD AND RIM ARE MAPPED FIRST, deliberately. They are what stick
 * navigation runs on, so until they are known the drummer cannot operate the
 * menu that maps everything else. Once they are mapped, `applyStickNav`
 * reconfigures navigation live and the rest can be done from the stool.
 *
 * Every pad must be hit twice to confirm. A single hit only proposes a note —
 * so a mis-hit costs one more strike rather than a wrong mapping the drummer
 * then has to find and undo. "Restart Mapping" exists for the same reason:
 * getting this wrong once and being stuck is worse than not having it.
 */
import { useState, useLayoutEffect, useRef } from 'preact/hooks';
import { signal, useSignalEffect } from '@preact/signals';
import { midiEngine } from '../../audio/midi';
import { profilesStore } from '../../store';
import type { DrumType } from '../../data/types';
import { DRUM_TYPE_TO_DISPLAY_NAME } from '../../data/zoneNames';
import { DEFAULT_STICK_NAV_CONFIG } from '../../audio/StickNavigationController';

export const isKitMapperOpen = signal(false);

const REMAINING_PADS: DrumType[] = ['kick', 'hihat-closed', 'hihat-open'];

export function KitMapper() {
  const [phase, setPhase] = useState<'HEAD' | 'RIM' | 'MENU' | 'MAPPING_PAD'>('HEAD');
  const [candidateNote, setCandidateNote] = useState<number | null>(null);
  const [noteMap, setNoteMap] = useState<Partial<Record<DrumType, number | null>>>({});
  
  const [menuFocus, setMenuFocus] = useState<number>(0);
  const [padToMap, setPadToMap] = useState<DrumType | null>(null);

  /**
   * Reset on CLOSE, never on open (register P-14).
   *
   * Same shape, same bug as the dynamics calibrator: the order is signal set,
   * render, subscription installed, paint, and only then this effect. A strike
   * arriving in that window was recorded and then wiped by a reset that ran
   * after it — so the drummer's first hit on the very screen that says "hit
   * your snare head" did nothing, with no way to tell that from a dead pad.
   *
   * Clearing on the way out leaves nothing to race. Loading the stored map
   * stays on open, because it only adds to state rather than clearing it.
   */
  const wasOpen = useRef(false);
  useSignalEffect(() => {
    const open = isKitMapperOpen.value;
    if (open && !wasOpen.current) {
      // Additive only: the existing map is shown, nothing is cleared.
      void profilesStore.load().then(profile => {
        setNoteMap(profile.noteMap || {});
      });
    }
    if (!open && wasOpen.current) {
      setPhase('HEAD');
      setCandidateNote(null);
      setMenuFocus(0);
      setPadToMap(null);
    }
    wasOpen.current = open;
  });

  /**
   * useLayoutEffect, not useEffect (register P-14).
   *
   * A plain effect runs *after* paint, so this screen was visible — telling the
   * drummer to hit something — before it was listening. A strike in that window
   * went nowhere. The drummer hits, sees no response, and has no way to tell
   * whether the app, the cable or their pad is at fault.
   *
   * A layout effect runs before the browser paints, so the subscription exists
   * by the time the prompt is on screen. Nothing here touches layout, so there
   * is no cost to running it earlier.
   */
  useLayoutEffect(() => {
    if (!isKitMapperOpen.value) return;

    const applyStickNav = (map: Partial<Record<DrumType, number | null>>) => {
      const navCtrl = (window as any)._stickNavCtrl;
      if (navCtrl) {
        const head = map['snare-head'] ?? DEFAULT_STICK_NAV_CONFIG.select.notes[0];
        const rim = map['snare-rim'] ?? DEFAULT_STICK_NAV_CONFIG.scrollDown.notes[0];
        const kick = map['kick'] ?? DEFAULT_STICK_NAV_CONFIG.select.notes[1];
        navCtrl.setConfig({
          scrollDown: { notes: [rim] },
          select: { notes: [head, kick] },
          pause: { notes: [rim], modifier: DEFAULT_STICK_NAV_CONFIG.pause.modifier }
        });
      }
    };

    // RAW notes, not onHit. This is the one component whose job is to learn
    // what a pad sends, so it cannot use the canonical stream: an unmapped pad
    // never reaches `onHit` at all, and a pad being *re*-mapped would arrive
    // already translated into whatever it currently means.
    const unsub = midiEngine.onRawNote((rawNote) => {
      const hit = { note: rawNote }
      if (phase === 'HEAD') {
        if (candidateNote === hit.note) {
          const newMap = { ...noteMap, 'snare-head': hit.note };
          setNoteMap(newMap);
          setCandidateNote(null);
          setPhase('RIM');
        } else {
          setCandidateNote(hit.note);
        }
      } else if (phase === 'RIM') {
        if (candidateNote === hit.note) {
          const newMap = { ...noteMap, 'snare-rim': hit.note };
          setNoteMap(newMap);
          setCandidateNote(null);
          setPhase('MENU');
          applyStickNav(newMap);
        } else {
          setCandidateNote(hit.note);
        }
      } else if (phase === 'MAPPING_PAD' && padToMap) {
        if (candidateNote === hit.note) {
          const newMap = { ...noteMap, [padToMap]: hit.note };
          setNoteMap(newMap);
          setCandidateNote(null);
          setPadToMap(null);
          setPhase('MENU');
          applyStickNav(newMap);
        } else {
          setCandidateNote(hit.note);
        }
      }
    });

    const handleScroll = (e: Event) => {
      if (phase !== 'MENU') return;
      e.stopImmediatePropagation();
      setMenuFocus(f => (f + 1) % (REMAINING_PADS.length + 2)); // +2 for Restart and Finish
    };

    const handleSelect = (e: Event) => {
      if (phase !== 'MENU') return;
      e.stopImmediatePropagation();
      
      if (menuFocus < REMAINING_PADS.length) {
        setPadToMap(REMAINING_PADS[menuFocus]);
        setCandidateNote(null);
        setPhase('MAPPING_PAD');
      } else if (menuFocus === REMAINING_PADS.length) {
        // Restart
        setPhase('HEAD');
        setCandidateNote(null);
      } else {
        // Finish
        void profilesStore.load().then(profile => {
          profilesStore.save({ ...profile, noteMap }).then(() => {
            isKitMapperOpen.value = false;
          });
        });
      }
    };

    window.addEventListener('stick-scroll-down', handleScroll);
    window.addEventListener('stick-select', handleSelect);

    return () => {
      unsub();
      window.removeEventListener('stick-scroll-down', handleScroll);
      window.removeEventListener('stick-select', handleSelect);
    };
  }, [isKitMapperOpen.value, phase, candidateNote, noteMap, menuFocus, padToMap]);

  if (!isKitMapperOpen.value) return null;

  return (
    <div class="diagnostic-overlay" data-testid="kit-mapper-overlay" style={{
      position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', 
      background: 'rgba(0,0,0,0.85)', zIndex: 10000, display: 'flex', 
      flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      color: 'white'
    }}>
      <h2>Kit Mapping</h2>
      
      {(phase === 'HEAD' || phase === 'RIM' || phase === 'MAPPING_PAD') && (
        <div style={{ textAlign: 'center', fontSize: '24px' }}>
          <p>
            Hit your <strong>
              {phase === 'HEAD' ? 'Snare Head' : phase === 'RIM' ? 'Snare Rim' : padToMap ? DRUM_TYPE_TO_DISPLAY_NAME[padToMap] : ''}
            </strong> pad.
          </p>
          {candidateNote !== null ? (
            <p style={{ color: '#ffe600' }}>Heard Note {candidateNote}. Hit it again to confirm, or hit a different pad to change.</p>
          ) : (
            <p style={{ color: '#aaa' }}>Waiting for hit...</p>
          )}
        </div>
      )}

      {phase === 'MENU' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', fontSize: '24px' }}>
          <p style={{ marginBottom: '20px', color: '#00fff5' }}>Stick navigation is active! Use Rim to scroll, Head to select.</p>
          
          {REMAINING_PADS.map((drum, i) => (
            <div key={drum} style={{ 
              padding: '12px 24px', 
              border: menuFocus === i ? '2px solid #00fff5' : '2px solid transparent',
              background: menuFocus === i ? 'rgba(0,255,245,0.1)' : 'transparent',
              borderRadius: '8px'
            }}>
              Map {DRUM_TYPE_TO_DISPLAY_NAME[drum]} 
              <span style={{ float: 'right', color: '#aaa' }}>
                {noteMap[drum] !== undefined ? `Note ${noteMap[drum]}` : 'Unmapped'}
              </span>
            </div>
          ))}

          <div style={{ 
            padding: '12px 24px', 
            border: menuFocus === REMAINING_PADS.length ? '2px solid #ffe600' : '2px solid transparent',
            background: menuFocus === REMAINING_PADS.length ? 'rgba(255,230,0,0.1)' : 'transparent',
            borderRadius: '8px',
            marginTop: '20px'
          }}>
            Restart Mapping
          </div>

          <div style={{ 
            padding: '12px 24px', 
            border: menuFocus === REMAINING_PADS.length + 1 ? '2px solid #00ff66' : '2px solid transparent',
            background: menuFocus === REMAINING_PADS.length + 1 ? 'rgba(0,255,102,0.1)' : 'transparent',
            borderRadius: '8px'
          }}>
            Finish & Save
          </div>
        </div>
      )}
      
      <div style={{ position: 'absolute', bottom: '40px' }}>
        <button class="tab-btn" onClick={() => isKitMapperOpen.value = false}>
          Close Menu (Mouse)
        </button>
      </div>
    </div>
  );
}
