import type { ContentUnit } from './types'
import type { SessionPhase } from '../state/session'
import {
  DynamicsGateDrill1,
  DynamicsGateDrill2,
  DynamicsGateDrill3,
  DynamicsGateDrill4,
  DynamicsGateDrill5,
} from './bootcamps/dynamics-gate'
import {
  HiHatIndependenceDrill1,
  HiHatIndependenceDrill2,
  HiHatIndependenceDrill3,
  HiHatIndependenceDrill4,
  HiHatIndependenceDrill5,
} from './bootcamps/hihat-independence'

/**
 * The single source of truth for what content exists and where it appears.
 *
 * Before this, `app.tsx` imported one drill directly and the QuickMenu listed
 * hardcoded strings that resolved to nothing — so nine of the ten authored
 * drills were unreachable and the menu was decorative.
 */

export interface DrillEntry {
  unit: ContentUnit
  phase: SessionPhase
  /** Heading this drill sits under in the menu. */
  section: string
}

export const DRILL_REGISTRY: DrillEntry[] = [
  { unit: DynamicsGateDrill1, phase: 'practice', section: 'Dynamics Gate' },
  { unit: DynamicsGateDrill2, phase: 'practice', section: 'Dynamics Gate' },
  { unit: DynamicsGateDrill3, phase: 'practice', section: 'Dynamics Gate' },
  { unit: DynamicsGateDrill4, phase: 'practice', section: 'Dynamics Gate' },
  { unit: DynamicsGateDrill5, phase: 'practice', section: 'Dynamics Gate' },
  { unit: HiHatIndependenceDrill1, phase: 'practice', section: 'Hi-Hat Independence' },
  { unit: HiHatIndependenceDrill2, phase: 'practice', section: 'Hi-Hat Independence' },
  { unit: HiHatIndependenceDrill3, phase: 'practice', section: 'Hi-Hat Independence' },
  { unit: HiHatIndependenceDrill4, phase: 'practice', section: 'Hi-Hat Independence' },
  { unit: HiHatIndependenceDrill5, phase: 'practice', section: 'Hi-Hat Independence' },
]

export const DEFAULT_DRILL_ID = DynamicsGateDrill1.id

export function getEntry(id: string | null | undefined): DrillEntry | null {
  if (!id) return null
  return DRILL_REGISTRY.find((e) => e.unit.id === id) ?? null
}

export function getDrill(id: string | null | undefined): ContentUnit | null {
  return getEntry(id)?.unit ?? null
}

export function drillIds(): string[] {
  return DRILL_REGISTRY.map((e) => e.unit.id)
}

/** Menu structure for a phase, grouped by section in registry order. */
export function sectionsForPhase(phase: SessionPhase): { section: string; entries: DrillEntry[] }[] {
  const out: { section: string; entries: DrillEntry[] }[] = []
  for (const entry of DRILL_REGISTRY) {
    if (entry.phase !== phase) continue
    let group = out.find((g) => g.section === entry.section)
    if (!group) {
      group = { section: entry.section, entries: [] }
      out.push(group)
    }
    group.entries.push(entry)
  }
  return out
}

/**
 * Honest empty-state copy per phase.
 *
 * Learn and Fun previously listed invented items ("Grip & Posture",
 * "Rock Groove 1") that resolved to nothing. Naming content that does not
 * exist is how a menu starts lying about the product; say it plainly instead.
 */
export const PHASE_EMPTY_STATE: Record<SessionPhase, string | null> = {
  learn: 'Learn units are not built yet. They arrive with roadmap M7.',
  practice: null,
  fun: 'Backing tracks and play-along grooves are not built yet (roadmap M8).',
}
