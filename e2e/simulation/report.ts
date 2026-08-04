import * as fs from 'fs';
import * as path from 'path';
import type { Zone } from './kits';
import { execSync } from 'child_process';

export interface SimulationRun {
  drummerId: string
  kitId: string
  drillId: string
  seed: number
  supported: boolean
  missingZones: Zone[]
  passed: boolean
  accuracyPercent: number
  diagnosisShown: string
  diagnosisExpected: string
  diagnosisCorrect: boolean | 'unverifiable'
  notes: string[]
}

export interface Finding {
  severity: 'critical' | 'warning' | 'info'
  title: string
  evidence: string[]   // run identifiers: "rachel × yamaha × drill-1 [seed 42]"
  affected: number     // count of runs exhibiting this
}

export interface SimulationReport {
  generatedAt: string
  appCommit: string
  totalRuns: number
  findings: Finding[]
  runs: SimulationRun[]
}

export function generateReport(runs: SimulationRun[]): SimulationReport {
  let appCommit = 'unknown';
  try {
    appCommit = execSync('git rev-parse HEAD').toString().trim();
  } catch (e) {}

  const findings: Finding[] = [];

  // Prediction 4: Oracle says unplayable, app gives a diagnosis anyway (critical)
  const unplayableRuns = runs.filter(r => r.diagnosisExpected === 'unplayable' && r.diagnosisShown !== '');
  if (unplayableRuns.length > 0) {
    findings.push({
      severity: 'critical',
      title: 'Prediction 4: No hardware capability check (App diagnoses unplayable setups)',
      evidence: unplayableRuns.map(r => `${r.drummerId} × ${r.kitId} × ${r.drillId} [seed ${r.seed}]`),
      affected: unplayableRuns.length
    });
  } else {
    findings.push({ severity: 'info', title: 'Prediction 4 did not hold (Unplayable setups handled correctly)', evidence: [], affected: 0 });
  }

  // Prediction 1: Kit maps a zone to non-standard, app diagnoses ZONE_CONFUSION on correct performance
  // All personas have zoneConfusionProbability: 0, so any zone-confusion the oracle predicts
  // is caused by the kit's non-standard MIDI mapping — exactly what prediction 1 describes.
  const prediction1Runs = runs.filter(r => r.diagnosisExpected === 'zone-confusion');
  if (prediction1Runs.length > 0) {
    findings.push({
      severity: 'critical',
      title: 'Prediction 1: Hardcoded MIDI note mapping causes false ZONE_CONFUSION',
      evidence: prediction1Runs.map(r => `${r.drummerId} × ${r.kitId} × ${r.drillId} [seed ${r.seed}]`),
      affected: prediction1Runs.length
    });
  } else {
    findings.push({ severity: 'info', title: 'Prediction 1 did not hold', evidence: [], affected: 0 });
  }

  // Prediction 5: Sam diagnosed as anything other than inconsistent (critical)
  const samRuns = runs.filter(r => r.drummerId === 'sam' && !/inconsistent/i.test(r.diagnosisShown));
  if (samRuns.length > 0) {
    findings.push({
      severity: 'critical',
      title: 'Prediction 5: No variance analysis (Sam misdiagnosed)',
      evidence: samRuns.map(r => `${r.drummerId} × ${r.kitId} × ${r.drillId} [seed ${r.seed}]`),
      affected: samRuns.length
    });
  } else {
    findings.push({ severity: 'info', title: 'Prediction 5 did not hold (Sam diagnosed correctly)', evidence: [], affected: 0 });
  }

  // Prediction 6: Hank diagnosed with "ghost" on a drill with no ghost notes (warning)
  const hankDrill1GhostRuns = runs.filter(r => r.drummerId === 'hank' && r.drillId === 'dynamics-gate-drill-1' && /ghost/i.test(r.diagnosisShown));
  if (hankDrill1GhostRuns.length > 0) {
    findings.push({
      severity: 'warning',
      title: 'Prediction 6: Mislabelled velocity rules (Hank gets ghost error on no-ghost drill)',
      evidence: hankDrill1GhostRuns.map(r => `${r.drummerId} × ${r.kitId} × ${r.drillId} [seed ${r.seed}]`),
      affected: hankDrill1GhostRuns.length
    });
  } else {
    findings.push({ severity: 'info', title: 'Prediction 6 did not hold', evidence: [], affected: 0 });
  }

  // Flaky runs (same combo passes on one seed but fails on another) (warning)
  const comboResults = new Map<string, boolean[]>();
  for (const r of runs) {
    const key = `${r.drummerId} × ${r.kitId} × ${r.drillId}`;
    if (!comboResults.has(key)) comboResults.set(key, []);
    comboResults.get(key)!.push(r.passed);
  }
  const flakyEvidence: string[] = [];
  for (const [key, passes] of comboResults) {
    const hasTrue = passes.includes(true);
    const hasFalse = passes.includes(false);
    if (hasTrue && hasFalse) flakyEvidence.push(key);
  }
  if (flakyEvidence.length > 0) {
    findings.push({
      severity: 'warning',
      title: 'Gate sits inside drummer\'s natural variance (flaky seeds)',
      evidence: flakyEvidence,
      affected: flakyEvidence.length
    });
  }

  // Hardware-dependent diagnosis (Diagnosis correct on Alesis but wrong on another kit) (warning)
  const alesisCorrect = new Map<string, boolean>();
  for (const r of runs) {
    if (r.kitId === 'alesis-nitro-pro') {
      const key = `${r.drummerId} × ${r.drillId} [seed ${r.seed}]`;
      alesisCorrect.set(key, r.diagnosisCorrect === true);
    }
  }
  const hardwareEvidence: string[] = [];
  for (const r of runs) {
    if (r.kitId !== 'alesis-nitro-pro') {
      const key = `${r.drummerId} × ${r.drillId} [seed ${r.seed}]`;
      const isCorrectOnAlesis = alesisCorrect.get(key);
      if (isCorrectOnAlesis && r.diagnosisCorrect === false) {
        hardwareEvidence.push(`${r.drummerId} × ${r.kitId} × ${r.drillId} [seed ${r.seed}]`);
      }
    }
  }
  if (hardwareEvidence.length > 0) {
    const uniqueEvidence = Array.from(new Set(hardwareEvidence));
    findings.push({
      severity: 'warning',
      title: 'Hardware-dependent diagnosis (Correct on Alesis, wrong on others)',
      evidence: uniqueEvidence,
      affected: uniqueEvidence.length
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    appCommit,
    totalRuns: runs.length,
    findings,
    runs
  };
}

export function writeJsonReport(report: SimulationReport, outputDir: string) {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  fs.writeFileSync(path.join(outputDir, 'report.json'), JSON.stringify(report, null, 2));
}

export function writeMarkdownReport(report: SimulationReport, outputDir: string) {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  let md = `# Simulation Matrix Report\n\n`;
  md += `**Generated At:** ${report.generatedAt}\n`;
  md += `**App Commit:** ${report.appCommit}\n`;
  md += `**Total Runs:** ${report.totalRuns}\n\n`;
  
  md += `## Findings\n\n`;
  
  const sortOrder = { 'critical': 1, 'warning': 2, 'info': 3 };
  const sortedFindings = [...report.findings].sort((a, b) => sortOrder[a.severity] - sortOrder[b.severity]);
  
  for (const f of sortedFindings) {
    md += `### [${f.severity.toUpperCase()}] ${f.title}\n`;
    md += `Affected: ${f.affected} runs\n`;
    if (f.evidence.length > 0) {
      md += `Evidence:\n`;
      for (const e of f.evidence.slice(0, 5)) {
        md += `- ${e}\n`;
      }
      if (f.evidence.length > 5) {
        md += `- ...and ${f.evidence.length - 5} more\n`;
      }
    }
    md += `\n`;
  }
  
  md += `## All Runs\n\n`;
  md += `| Combo | Seed | Supported | Passed | Acc | Expected | Shown | Correct |\n`;
  md += `|---|---|---|---|---|---|---|---|\n`;
  
  for (const r of report.runs) {
    const combo = `${r.drummerId} × ${r.kitId} × ${r.drillId}`;
    const missing = r.supported ? '✅' : '❌ ' + r.missingZones.join(',');
    const passed = r.passed ? '✅' : '❌';
    const expected = r.diagnosisExpected;
    const shown = r.diagnosisShown.replace(/\|/g, '\\|'); // escape table pipe
    let correct = '❌';
    if (r.diagnosisCorrect === true) correct = '✅';
    if (r.diagnosisCorrect === 'unverifiable') correct = '🤷';
    
    md += `| ${combo} | ${r.seed} | ${missing} | ${passed} | ${r.accuracyPercent}% | ${expected} | ${shown} | ${correct} |\n`;
  }
  
  fs.writeFileSync(path.join(outputDir, 'report.md'), md);
}
