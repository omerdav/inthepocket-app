/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { h, render } from 'preact'
import { DrillSession } from '../DrillSession'
import { DrillRunner } from '../../../session/DrillRunner'
import { audioEngine } from '../../../audio/AudioEngine'

vi.mock('../../../audio/AudioEngine', () => ({
  audioEngine: {
    unlock: vi.fn().mockResolvedValue(true),
    start: vi.fn(),
    stop: vi.fn(),
    view: new BigInt64Array(10),
    correlator: { mapHitTime: vi.fn().mockReturnValue(0) },
    context: { currentTime: 0 }
  }
}))

vi.mock('../../../audio/midi', async (importOriginal) => {
  const actual = await importOriginal<any>()
  return {
    ...actual,
    midiEngine: {
      onHit: vi.fn().mockReturnValue(vi.fn()),
      setDrillActive: vi.fn()
    }
  }
})

vi.mock('../../../store', () => ({
  profilesStore: {
    load: vi.fn().mockResolvedValue({ noteMap: {} })
  },
  progressionStore: {
    load: vi.fn().mockResolvedValue({})
  },
  isMastered: vi.fn().mockReturnValue(false)
}))

describe('DrillSession error handling', () => {
  let container: HTMLDivElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    vi.clearAllMocks()
  })

  afterEach(() => {
    render(null, container)
    container.remove()
    vi.restoreAllMocks()
  })

  it('shows audio locked overlay if audioEngine fails to unlock', async () => {
    vi.mocked(audioEngine.unlock).mockResolvedValueOnce(false)
    
    const unit = { id: 'test', bpm: 80, sequence: [], passCriteria: {} } as any
    const worker = {} as Worker

    render(h(DrillSession, { unit, worker }), container)
    
    const startBtn = container.querySelector('[data-testid="drill-start"]') as HTMLButtonElement
    startBtn.click()

    // Wait for async promises to process
    await new Promise(r => setTimeout(r, 10))

    // Assert what the user sees
    expect(container.querySelector('[data-testid="audio-locked"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="drill-result"]')).toBeNull()
  })

  it('shows an Audio System Interrupted result for "Metronome did not start within 2s"', async () => {
    // Wait a tick after render so useEffect populates runnerRef
    const unit = { id: 'test', bpm: 80, sequence: [], passCriteria: {} } as any
    const worker = {} as Worker

    render(h(DrillSession, { unit, worker }), container)
    await new Promise(r => setTimeout(r, 10))
    
    vi.spyOn(DrillRunner.prototype, 'run').mockRejectedValueOnce(new Error('Metronome did not start within 2s.'))
    
    const startBtn = container.querySelector('[data-testid="drill-start"]') as HTMLButtonElement
    startBtn.click()

    await new Promise(r => setTimeout(r, 10))

    expect(container.querySelector('[data-testid="drill-result"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="result-diagnosis"]')?.textContent).toContain('Audio System Interrupted')
    expect(container.querySelector('.result-detail')?.textContent).toContain('metronome failed to start')
  })

  it('shows an Audio System Interrupted result for "AudioContext clock is not advancing"', async () => {
    const unit = { id: 'test', bpm: 80, sequence: [], passCriteria: {} } as any
    const worker = {} as Worker

    render(h(DrillSession, { unit, worker }), container)
    await new Promise(r => setTimeout(r, 10))
    
    vi.spyOn(DrillRunner.prototype, 'run').mockRejectedValueOnce(new Error('AudioContext clock is not advancing. Audio may be locked or failed to start.'))
    
    const startBtn = container.querySelector('[data-testid="drill-start"]') as HTMLButtonElement
    startBtn.click()

    await new Promise(r => setTimeout(r, 10))

    expect(container.querySelector('[data-testid="drill-result"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="result-diagnosis"]')?.textContent).toContain('Audio System Interrupted')
    expect(container.querySelector('.result-detail')?.textContent).toContain('browser audio engine stalled')
  })
})
