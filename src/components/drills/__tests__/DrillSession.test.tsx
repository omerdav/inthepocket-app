/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from 'preact'
import { DrillSession } from '../DrillSession'
import { audioEngine } from '../../../audio/AudioEngine'
import { profilesStore } from '../../../store'

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

describe('DrillSession', () => {
  let container: HTMLDivElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    vi.clearAllMocks()
  })

  it('R-T1: unlocks audio synchronously on start gesture, before async storage reads', async () => {
    let resolveProfiles: (val: any) => void
    const profilesPromise = new Promise((resolve) => { resolveProfiles = resolve })
    // @ts-ignore
    profilesStore.load.mockReturnValue(profilesPromise)

    const unit = { id: 'test', bpm: 80, sequence: [], passCriteria: {} } as any
    const worker = {} as Worker

    render(<DrillSession unit={unit} worker={worker} />, container)
    
    // Find and click start
    const startBtn = container.querySelector('[data-testid="drill-start"]') as HTMLButtonElement
    startBtn.click()

    // Assert unlock is called IMMEDIATELY before profilesStore resolves
    expect(audioEngine.unlock).toHaveBeenCalledTimes(1)
    
    // Cleanup
    resolveProfiles!({ noteMap: {} })
    render(null, container)
  })
})
