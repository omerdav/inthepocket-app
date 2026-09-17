# Triage — what is real and what is scaffolding

> **Re-derived 2026-09-17** from the code at `600049a`, not from the previous version of this file.
> Status of record: `../inthepocket-planning/Verified_Status_Audit.md` **§8**.
> Next work: `../inthepocket-planning/Execution_Queue.md`.

This file exists so nobody has to rediscover which parts run.

> **It had stopped doing that job.** Between 2026-08-03 and 2026-09-17 this file was never updated,
> while the app went from "no persistence, no PWA, no product screen" to shipping all three. Every
> section below had drifted, and two entries were outright false — it claimed `setSyncData` was
> called (it never has been, see P-20) and that the demo harness lived behind `?dev=1` (deleted in
> T-055). **A triage file that is not re-derived is worse than no triage file**, because it is
> written to be trusted. If you are reading this more than a few weeks after the date above, check
> it against the code before you rely on it.

---

## Verified 2026-09-17

| Command | Result |
|---|---|
| `npm run build` | ✅ clean — `tsc -b && vite build`, service worker, 18 precache entries / 281 KiB |
| `npm test` | ✅ **217 passed**, 34 files |
| `npm run check:isolation` | ✅ COOP `same-origin` + COEP `require-corp` on the built bundle |
| `npm run check:offline` | ✅ worklet, scoring worker, index, css; no duplicates |
| `npm run test:e2e` | ⚠️ **not completed in this pass** — 33 of 98, failure-free. Last completed run: **96 passed, 2 skipped**. Re-derive on your machine. |

**Do not quote these as a gate without re-running them.** `AGENT_PROTOCOL.md` §Baselines carries the
same numbers and the same warning; four documents disagreeing about this is what produced P-20's
sibling finding in the planning repo.

---

## ✅ Real, wired, and reachable by a drummer

The bar is `AGENT_PROTOCOL.md`'s: a module with green unit tests and no caller is *written*, not
done. Each row names where it is reached from.

| Module | Reached from |
|---|---|
| `src/audio/midi.ts` | The input layer. Object-pooled zero-allocation hot path, causal 10ms crosstalk filter, 80ms UI debounce, dead-zones, CC#4 tracking, per-kit note mapping. Still the strongest code here. |
| `src/audio/AudioEngine.ts` | `:106` creates the `AudioContext`, `:109` loads the worklet, `:122` constructs the `TimestampCorrelator`. |
| `src/audio/metronome.worklet.ts` | Real click: `process()` writes to `outputs[0]`, tempo-parameterised, lookahead published through the SAB. |
| `src/session/DrillRunner.ts` | Count-in → play → grade → diagnose. `:134` maps every hit onto the audio clock. |
| `src/workers/ScoringWorker.ts` | Instantiated in `app.tsx`, results drive the Groove Circle. |
| `src/workers/DiagnosticEngine.ts` | **Its output is now rendered** — `DrillSession.tsx:355` shows the headline, `:358` the detail. |
| `src/workers/DecouplingMath.ts` | Detrended Pearson with a variance guard. ⚠️ **Honest, and therefore currently inert** — see Q-2. |
| `src/components/drills/DrillSession.tsx` | Layout A: `:285-391`, three zones — BPM header, Groove Circle, balance meter + RhythmGrid. |
| `src/components/canvas/GrooveCircle.ts` | On the product path since T-001, not only the dev harness. |
| `src/components/placement/` | Real placement: segments through `DrillRunner`, capped at `MAX_PLACEMENT_DEPTH`; a skip leaves the drummer *unplaced*. |
| `src/components/settings/KitMapper.tsx` | Stick-operable per-kit mapping; an unmapped pad raises a named banner. |
| `src/components/settings/DynamicsCalibrator.tsx` | Per-drummer thresholds; **refuses and says why** when the levels do not separate. |
| `src/store/` | IndexedDB — progression, telemetry, profiles. Survives reload. |
| `src/sw.ts` | `injectManifest` service worker; offline session verified against a real production build. |
| `src/ErrorReporter.ts` | Bounded ring buffer in IndexedDB, viewable from Settings. Nothing leaves the device. |
| `e2e/drill-audit.spec.ts` | **The guard.** 30 run lines, 31 tests: every drill, perfect / inside-band / outside-band, each verdict asserted. |

---

## ❌ Dead code — exists, tested, never runs

Two entries, both filed in the planning repo's Defect Register. **Both are kept green by unit tests,
which is exactly why they survived.**

| What | Reality |
|---|---|
| `midi.ts:654-662` + `nearestBeatDeltaMs` | **`setSyncData` (`midi.ts:336`) has no caller** — not in `src/`, `e2e/` or `scripts/`, and `git log -S` finds none at any point in this repo's history. So the nearest-beat fold is unreachable. Live feedback is *not* broken: `DrillSession.tsx:101-128` recomputes the delta from the correlator against the drill's own targets. **Register P-20.** Do not "fix" this by calling `setSyncData` — that creates a second timing path competing with the one that works. |
| `dynamicContrastDb` | A **required** field on `PassCriteria` (`src/data/types.ts:19`), declared by all ten drills with meaningful-looking values — `dynamics-gate.ts:55` asks for 15 dB — and read by nothing in `src/workers/` or `src/session/`. **Register P-21.** |

**Latent, and worth knowing about:** when `correlator` is null, `DrillSession` falls back to
`hit.deltaMs`, which is permanently `0` — every hit would read a perfect GREEN. That is P-10's exact
failure mode, one null away. Part of P-20.

---

## 🟡 Still scaffolding in the production bundle

**`__E2E_*` hooks and `?dev=1` are gone** (C-30, C-57) — both grep clean out of `dist/`. Verified.

**A second surface still ships** — register **P-17**: `itp-simulate-hit`, `itp-force-render`,
`itp-correlator-mock`, the `lastOpacity` / `lastHitColor` / `playheadX` / `noteX` dataset writes,
`window.setHitVisualMode`, `window.setStickingCuePlacement`, and the `itp-set-blind-mode` listener.
Confirmed present in `dist/assets/index-*.js` on 2026-09-17.

It is **bounded, not open-ended**: `src/__tests__/no-e2e.test.ts` enumerates the surface and fails on
a new hook. Removing it is blocked on replacing coverage, not on effort — `e2e/throneview.spec.ts`
gets its colour assertions (G1, G3, G4, G5) entirely through these hooks, and deleting them without a
replacement deletes the only proof the Groove Circle colours a hit correctly.

One documented `navigator.webdriver` exception remains, listed by file in `no-e2e.test.ts` so a
second one fails the test rather than quietly joining an allowlist.

---

## 🔧 Correctness issues still open

| Issue | Location |
|---|---|
| **The velocity-band comment still asserts a calibration nobody performed.** `// Velocity Ranges (Calibrated for ~15-25dB drop on ghost notes)` — the bands yield roughly 8–12 dB typical under a linear assumption, and dB is not derivable from velocity at all. T-046 made *velocity* per-drummer, which is the honest fix; the comment was never updated. | `src/data/utils.ts:75` |
| `@types/webmidi@^2.1.0` against `webmidi@^3.1.16` runtime — major version mismatch | `package.json` |
| `tone` installed and entirely unused — Cover Track Studio is post-V1, so this is a dependency waiting years | `package.json` |
| No linter and no coverage tooling. `AGENT_PROTOCOL.md` requires `tsc -b` clean, which catches unused imports, but nothing enforces style or measures coverage. | `package.json` |

**Fixed since the last version of this file, and worth not re-filing:** `generateSequence` now takes a
subdivision and an explicit accent mask (`utils.ts:128-135`); COOP/COEP ship to production via
`public/_headers` and are asserted against the built bundle (C-37); `workbox-*` is genuinely used by
`src/sw.ts`; `test:e2e` exists. **The `hihat-chick` → note 44 mapping at `utils.ts:11` is deliberate,
not a defect** — C-46 de-duplicates note 44 against CC#4 within 100ms rather than removing it,
because modules that send note 44 without continuous pedal data would otherwise stop working.

---

## ⚠️ Tests: what changed

The two tautologies are gone. `e2e/audioworklet.spec.ts` now measures real audio — `overallPeak > 0.01`
would fail against a processor that writes silence, and the onset assertions check clicks land on the
beat grid. `drill-gating.spec.ts` and `independence-gate.spec.ts`, the Vitest tests in Playwright
costume, no longer exist.

**The audit is the guard.** Its 30 run lines assert a verdict per drill per run type and none depend
on live visual feedback. If an audit row moves and your change did not touch scoring, stop and report.

**Known intermittents — report as observed, do not fix:** P-1 (the audio clock wedges; proven to be an
output device re-enumerating underneath Chromium, not our code) and P-7 (the dev server dies mid-suite
and every later spec reports `ERR_CONNECTION_REFUSED`). Both are in `AGENT_PROTOCOL.md` §9 in full.

**One trap worth naming:** the preflight in `e2e/global-setup.ts:64-67` deliberately fails open when
the browser cannot launch — correct, since a broken tool must not be why nothing runs, but it means
*a missing browser and a healthy audio clock print the same thing.* A preflight pass is not evidence
of audio on its own.

---

## Working agreement

1. **"Done" requires a user-reachable path.** A module with green unit tests and no caller is written, not done. P-20 and P-21 are what this rule catches.
2. **No test may assert a literal** or a value the test itself supplied.
3. **E2E means end-to-end.** If the payload is a `window.__E2E_*` call, it belongs in Vitest.
4. **Run the suite and paste the output** into the status entry. Do not report from memory.
5. **Re-derive this file when you change what it describes.** It went six weeks without that and started telling people things that were not true.
