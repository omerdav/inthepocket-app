import type { DrummerProfile } from './drummers';
import type { KitProfile, Zone } from './kits';
import { getDrill } from '../../src/data/registry';
import { kitSupportsZones, kits } from './kits';
import { DiagnosticRuleId } from '../../src/workers/scoring.types';

/**
 * The oracle defines the ground truth for what the app *should* diagnose
 * based on the known properties of the simulated drummer and kit.
 * It simulates the zone->dynamics->timing priority ladder.
 */
export function getExpectedDiagnosis(drummer: DrummerProfile, kit: KitProfile, drillId: string): { category: string, regex: RegExp | null } {
  const drill = getDrill(drillId);
  if (!drill) return { category: 'unknown', regex: /.*/ };
  
  const zones = Array.from(new Set(drill.sequence.map(n => n.drumType as Zone)));
  const { ok } = kitSupportsZones(kit, zones);
  
  if (!ok) {
    return { category: 'unplayable', regex: /unplayable/i }; // The app should ideally say this
  }

  const standardMapping = kits.find(k => k.id === 'alesis-nitro-pro')!.notes;
  const byRule = new Map<number, number>();

  for (const note of drill.sequence) {
    const drumType = note.drumType as Zone;
    const targetZone = standardMapping[drumType]!;
    const hitZone = kit.notes[drumType]!;

    let intendedVelocity = 65;
    if (note.isAccent) intendedVelocity = 110;
    else if (note.velocityRange && note.velocityRange.max <= 35) intendedVelocity = 25;
    if (drummer.minimumVelocity !== undefined) {
      intendedVelocity = Math.max(drummer.minimumVelocity, intendedVelocity);
    }
    const hitVelocity = kit.velocityCurve(intendedVelocity);
    
    const targetMin = note.velocityRange?.min ?? 0;
    const targetMax = note.velocityRange?.max ?? 127;

    const offsetMs = drummer.timingBiasMs + kit.triggerLatencyMs;

    let ruleId: DiagnosticRuleId = DiagnosticRuleId.OK;

    if (hitZone !== targetZone) {
      ruleId = DiagnosticRuleId.ZONE_CONFUSION;
    } else if (hitVelocity < targetMin) {
      ruleId = DiagnosticRuleId.ACCENT_TOO_SOFT;
    } else if (hitVelocity > targetMax) {
      ruleId = DiagnosticRuleId.GHOST_TOO_LOUD;
    } else if (offsetMs < -30) {
      ruleId = DiagnosticRuleId.RUSHING;
    } else if (offsetMs > 30) {
      ruleId = DiagnosticRuleId.DRAGGING;
    }

    if (ruleId !== DiagnosticRuleId.OK) {
      byRule.set(ruleId, (byRule.get(ruleId) ?? 0) + 1);
    }
  }

  // Aggregate: most frequent rule
  let topRule: DiagnosticRuleId = DiagnosticRuleId.OK;
  let topCount = 0;
  for (const [rule, count] of byRule) {
    if (count > topCount) {
      topRule = rule as DiagnosticRuleId;
      topCount = count;
    }
  }

  switch (topRule) {
    case DiagnosticRuleId.RUSHING: return { category: 'rushing', regex: /rushing.*ahead/i };
    case DiagnosticRuleId.DRAGGING: return { category: 'dragging', regex: /dragging.*behind/i };
    case DiagnosticRuleId.GHOST_TOO_LOUD: return { category: 'ghost-too-loud', regex: /ghost/i };
    case DiagnosticRuleId.ACCENT_TOO_SOFT: return { category: 'accent-too-soft', regex: /accent/i };
    case DiagnosticRuleId.ZONE_CONFUSION: return { category: 'zone-confusion', regex: /head instead of the rim/i };
  }

  // If no rule matched, check variance. In the oracle, Sam has 0 bias, so topRule is DiagnosticRuleId.OK.
  // But Sam's sigma is 45, which means he is inconsistent. The oracle SHOULD predict inconsistent.
  if (drummer.timingSigmaMs > 20) {
    return { category: 'inconsistent', regex: /inconsistent/i };
  }
  
  if (Math.abs(drummer.timingBiasMs + kit.triggerLatencyMs) > 8) {
    const mean = drummer.timingBiasMs + kit.triggerLatencyMs;
    return { 
      category: mean < 0 ? 'rushing' : 'dragging', 
      regex: mean < 0 ? /consistently.*ahead/i : /consistently.*behind/i 
    };
  }

  return { category: 'in-the-pocket', regex: /in the pocket/i };
}
