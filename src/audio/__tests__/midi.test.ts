import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MidiEngine, MIDI_NOTE, type HitEvent } from '../midi'


// Mock WebMidi
vi.mock('webmidi', () => ({
  WebMidi: {
    enable: vi.fn().mockResolvedValue(undefined),
    inputs: [{
      addListener: vi.fn(),
      removeListener: vi.fn()
    }]
  }
}))

describe('MidiEngine', () => {
  let engine: MidiEngine

  beforeEach(async () => {
    engine = new MidiEngine()
    await engine.init()
  })

  afterEach(() => {
    engine.dispose()
  })

  // Helper to trigger handleNoteOn
  const triggerNoteOn = (note: number, timestamp: number, velocity: number = 1.0) => {
    const event = {
      note: { number: note, attack: velocity },
      timestamp
    } as any
    ;(engine as any)._handleNoteOn(event)
  }

  // Helper to trigger handleControlChange
  const triggerControlChange = (controller: number, value: number, timestamp: number) => {
    const event = {
      controller: { number: controller },
      value: value / 127.0, // WebMidi uses 0-1 float
      timestamp
    } as any
    ;(engine as any)._handleControlChange(event)
  }

  describe('Crosstalk filter', () => {
    it('should pass rim if arriving >10ms after head', () => {
      const hits: HitEvent[] = []
      engine.onHit(h => hits.push({ ...h }))
      triggerNoteOn(MIDI_NOTE.SNARE_HEAD, 100)
      triggerNoteOn(MIDI_NOTE.SNARE_RIM, 111) // 11ms after
      expect(hits).toHaveLength(2)
      expect(hits[1].note).toBe(MIDI_NOTE.SNARE_RIM)
    })

    it('should discard rim if arriving <10ms after head', () => {
      const hits: HitEvent[] = []
      engine.onHit(h => hits.push({ ...h }))
      triggerNoteOn(MIDI_NOTE.SNARE_HEAD, 100)
      triggerNoteOn(MIDI_NOTE.SNARE_RIM, 109) // 9ms after
      expect(hits).toHaveLength(1)
      expect(hits[0].note).toBe(MIDI_NOTE.SNARE_HEAD)
    })

    it('should pass rim with no prior head', () => {
      const hits: HitEvent[] = []
      engine.onHit(h => hits.push({ ...h }))
      triggerNoteOn(MIDI_NOTE.SNARE_RIM, 100)
      expect(hits).toHaveLength(1)
      expect(hits[0].note).toBe(MIDI_NOTE.SNARE_RIM)
    })

    it('should pass head even if arriving <10ms after rim (causal filter)', () => {
      const hits: HitEvent[] = []
      engine.onHit(h => hits.push({ ...h }))
      triggerNoteOn(MIDI_NOTE.SNARE_RIM, 100)
      triggerNoteOn(MIDI_NOTE.SNARE_HEAD, 105) // 5ms after
      expect(hits).toHaveLength(2)
      expect(hits[0].note).toBe(MIDI_NOTE.SNARE_RIM)
      expect(hits[1].note).toBe(MIDI_NOTE.SNARE_HEAD)
    })
  })

  describe('UI debounce', () => {
    it('should allow both rim clicks if >80ms apart', () => {
      const hits: HitEvent[] = []
      engine.onHit(h => hits.push({ ...h }))
      triggerNoteOn(MIDI_NOTE.SNARE_RIM, 100)
      triggerNoteOn(MIDI_NOTE.SNARE_RIM, 181) // 81ms after
      expect(hits[0].uiNavigationAllowed).toBe(true)
      expect(hits[1].uiNavigationAllowed).toBe(true)
    })

    it('should block second rim click if <80ms apart', () => {
      const hits: HitEvent[] = []
      engine.onHit(h => hits.push({ ...h }))
      triggerNoteOn(MIDI_NOTE.SNARE_RIM, 100)
      triggerNoteOn(MIDI_NOTE.SNARE_RIM, 150) // 50ms after
      expect(hits[0].uiNavigationAllowed).toBe(true)
      expect(hits[1].uiNavigationAllowed).toBe(false)
    })

    it('should never allow non-rim notes for UI navigation', () => {
      const hits: HitEvent[] = []
      engine.onHit(h => hits.push({ ...h }))
      triggerNoteOn(MIDI_NOTE.KICK, 100)
      triggerNoteOn(MIDI_NOTE.SNARE_HEAD, 200)
      expect(hits[0].uiNavigationAllowed).toBe(false)
      expect(hits[1].uiNavigationAllowed).toBe(false)
    })
  })

  describe('Active dead-zone', () => {
    it('should disallow UI navigation when drill is active', () => {
      engine.setDrillActive(true)
      const hits: HitEvent[] = []
      engine.onHit(h => hits.push({ ...h }))
      triggerNoteOn(MIDI_NOTE.SNARE_RIM, 100)
      expect(hits[0].uiNavigationAllowed).toBe(false)
    })

    it('should allow UI navigation when drill is not active', () => {
      engine.setDrillActive(false)
      const hits: HitEvent[] = []
      engine.onHit(h => hits.push({ ...h }))
      triggerNoteOn(MIDI_NOTE.SNARE_RIM, 100)
      expect(hits[0].uiNavigationAllowed).toBe(true)
    })

    it('should reset debounce when toggling drill off', () => {
      engine.setDrillActive(true)
      triggerNoteOn(MIDI_NOTE.SNARE_RIM, 100) // This hit's time is recorded in lastRimUiTime
      
      const hits: HitEvent[] = []
      engine.onHit(h => hits.push({ ...h }))
      
      engine.setDrillActive(false) // This should reset lastRimUiTime
      triggerNoteOn(MIDI_NOTE.SNARE_RIM, 110) // 10ms after, but should pass because of reset
      
      expect(hits[0].uiNavigationAllowed).toBe(true)
    })
  })

  describe('Object pool', () => {
    it('should recycle objects after HIT_POOL_SIZE hits and reuse the same references', () => {
      let capturedHits: HitEvent[] = []
      engine.onHit(h => capturedHits.push(h)) // Intentionally storing the reference
      
      const HIT_POOL_SIZE = 64
      
      // Fire 64 hits to fill the pool
      for (let i = 0; i < HIT_POOL_SIZE; i++) {
        triggerNoteOn(MIDI_NOTE.KICK, i * 100)
      }
      
      expect(capturedHits).toHaveLength(HIT_POOL_SIZE)
      
      const firstHitRef = capturedHits[0]
      expect(firstHitRef.seq).toBe(0)
      // Actually, if we pushed the raw reference, all elements are mutated by the time we check? No, the pool recycles, so capturedHits[0] is one specific object from the pool.
      // But wait! When the pool recycles, the FIRST hit object will be reused for the 65th hit.
      // So let's fire the 65th hit
      triggerNoteOn(MIDI_NOTE.KICK, HIT_POOL_SIZE * 100)
      
      expect(capturedHits[0]).toBe(capturedHits[HIT_POOL_SIZE])
      expect(capturedHits[0].timestamp).toBe(HIT_POOL_SIZE * 100)
    })
  })

  describe('Lifecycle', () => {
    it('should make dispose idempotent', () => {
      expect(() => {
        engine.dispose()
        engine.dispose()
      }).not.toThrow()
    })

    it('should allow init after dispose', async () => {
      engine.dispose()
      await engine.init()
      expect(engine.initialized).toBe(true)
    })

    it('should allow subscriber dispose function to work correctly', () => {
      const hits: HitEvent[] = []
      const unsubscribe = engine.onHit(h => hits.push({ ...h }))
      
      triggerNoteOn(MIDI_NOTE.KICK, 100)
      expect(hits).toHaveLength(1)
      
      unsubscribe()
      
      triggerNoteOn(MIDI_NOTE.KICK, 200)
      expect(hits).toHaveLength(1) // No new hit recorded
    })

    describe('HiHat chicks (R1)', () => {
      it('should deduplicate if CC4 and note 44 are both received for the same chick', () => {
        const hits: HitEvent[] = []
        engine.onHit(h => hits.push({ ...h }))
        
        triggerControlChange(4, 0, 1000)
        triggerNoteOn(44, 1100)
        triggerControlChange(4, 127, 1100)
        
        expect(hits).toHaveLength(1)
        expect(hits[0].note).toBe(44)
      })
    })
  })
})
