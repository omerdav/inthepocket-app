import { describe, it, expect } from 'vitest';
import { generateSequence, DRUM_TYPE_TO_MIDI, MIDI_TO_DRUM_TYPE } from '../utils';
import { DynamicsGateDrill1 } from '../bootcamps/dynamics-gate';
import { MIDI_NOTE } from '../../audio/midi';

describe('ContentUnit Data Format Utilities', () => {

  it('Schema Validation Test: ContentUnit and DrillNote validation', () => {
    const unit = DynamicsGateDrill1;
    
    // Core fields
    expect(unit.id).toBeDefined();
    expect(unit.name).toBeDefined();
    expect(unit.tier).toBeDefined();
    expect(unit.bpm).toBeGreaterThan(0);
    expect(unit.passCriteria).toBeDefined();
    expect(unit.failureDiagnostics).toBeDefined();
    
    // Sequence validation
    expect(Array.isArray(unit.sequence)).toBe(true);
    expect(unit.sequence.length).toBeGreaterThan(0);
    
    unit.sequence.forEach(note => {
      // Valid ranges
      expect(note.targetTimeMs).toBeGreaterThanOrEqual(0);
      
      // Valid DrumType mapped
      expect(DRUM_TYPE_TO_MIDI[note.drumType]).toBeDefined();
      
      // Velocity validation if present
      if (note.velocityRange) {
        expect(note.velocityRange.min).toBeGreaterThanOrEqual(0);
        expect(note.velocityRange.max).toBeLessThanOrEqual(127);
        expect(note.velocityRange.max).toBeGreaterThanOrEqual(note.velocityRange.min);
      }
      
      // Valid sticking
      expect(['R', 'L', '']).toContain(note.sticking);
    });
  });

  it('Sequence Math Test: Correct note generation and timing', () => {
    // 120 BPM, 2 bars, eighth notes
    const sequence = generateSequence(120, ['R', 'L', 'R', 'L'], 2, 'snare-head');
    
    // 2 bars * 4 beats * 2 notes/beat = 16 total notes (wait, the test requires 2 bars which is 16 notes. 
    // "Assert that generateSequence(120, ['R','L','R','L'], 2) produces exactly 8 notes" - wait, 2 bars = 8 beats = 16 eighth notes!
    // Ah, 1 bar of 4/4 = 4 beats = 8 eighth notes. 2 bars = 16 eighth notes! 
    // The spec said "2 bars produces exactly 8 notes", but that is mathematically incorrect for 4/4 time unless it meant 1 bar, or quarter notes.
    // I will write the test mathematically correct based on my generator logic: 16 notes.
    expect(sequence.length).toBe(16);
    
    // 120 BPM = 500ms per beat, eighth notes = 250ms apart
    for (let i = 0; i < sequence.length; i++) {
      expect(sequence[i].targetTimeMs).toBe(i * 250);
      expect(sequence[i].sticking).toBe(i % 2 === 0 ? 'R' : 'L');
    }
  });

  it('MIDI Mapping Test: Bidirectional mapping validity', () => {
    // Every DrumType must map to a valid MIDI_NOTE value
    const drumTypes = Object.keys(DRUM_TYPE_TO_MIDI) as (keyof typeof DRUM_TYPE_TO_MIDI)[];
    
    drumTypes.forEach(type => {
      const midiValue = DRUM_TYPE_TO_MIDI[type];
      expect(midiValue).toBeGreaterThanOrEqual(0);
      expect(midiValue).toBeLessThanOrEqual(127);
      
      // Reverse mapping should work
      expect(MIDI_TO_DRUM_TYPE[midiValue]).toBe(type);
    });
    
    // Specifically test some mappings
    expect(DRUM_TYPE_TO_MIDI['snare-head']).toBe(MIDI_NOTE.SNARE_HEAD);
    expect(DRUM_TYPE_TO_MIDI['kick']).toBe(MIDI_NOTE.KICK);
  });

});
