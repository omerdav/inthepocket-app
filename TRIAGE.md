# Triage — what is real and what is scaffolding

> **Updated 2026-08-03** after milestones M4 (audio engine) and M5-slice
> (playable drill). Full evidence: `../inthepocket-planning/Verified_Status_Audit.md`.
> Next work: `../inthepocket-planning/Execution_Queue.md`.

This repository had no version control until 2026-08-02. The baseline commit captures ten sprints of prior work unmodified. This file exists so nobody has to rediscover which parts run.

## Resolved since the baseline

| Was | Now |
|---|---|
| No `AudioContext` anywhere; `MetronomeProcessor` silent and never loaded | **Real metronome.** Sample-accurate click, tempo-parameterised, worklet loaded via a Vite build entry. Measured: 0.02ms worst-case drift over 4s. |
| `TimestampCorrelator` never constructed; SAB bridge unreachable | Constructed and wired; `setSyncData` called; hit offsets derive from the audio clock. |
| `deltaMs` differenced against the *next* beat | Folds to the *nearest* beat — a hit 5ms late reads +5ms, not ~495ms early. |
| **`ScoringWorker` never loaded** (type-only names in a value import broke ES module linking under `verbatimModuleSyntax`) | Fixed with `import type`. The worker had been dead since it was written — it was instantiated, posted to, and answered nothing. |
| Bootcamp drills authored but unrenderable | `DrillSession` plays `DynamicsGateDrill1` end to end and reports a specific diagnosis. |
| `generateSequence` eighth-notes-only | Subdivision (quarter/eighth/triplet/sixteenth) + explicit accent/ghost mask. |
| Worker hardcoded 30/50ms bands, ignoring `PassCriteria` | Grades against each drill's `timingWindowMs`. |
| `app.tsx` demo harness on the product path | Product path is the drill screen. Harness moved behind `?dev=1`. |
| 2 tests asserting `expect(true).toBe(true)`; 1 red test | Deleted. 8 engine tests on measured audio + 5 end-to-end drill tests. |

**Suites:** Vitest 61/61, Playwright 30/30. Both verified by running them.

---

## ✅ Real, wired, working

| Module | Notes |
|---|---|
| `src/audio/midi.ts` | Object-pooled zero-allocation hot path, causal 10ms crosstalk filter, 80ms UI debounce, dead-zones, CC#4 tracking. The strongest code here. |
| `src/workers/ScoringWorker.ts` | TypedArray protocol, pre-allocated buffers, target-iterating match with MISS detection. Instantiated in `app.tsx`, results drive the canvas. |
| `src/workers/DecouplingMath.ts` | Detrended Pearson correlation with variance guard. |
| `src/workers/DiagnosticEngine.ts` | Per-limb/zone error classification. Nothing renders its output yet. |
| `src/audio/HiHatStateTracker.ts` | CC#4 hysteresis banding, polarity resilient. |
| `src/audio/StickNavigationController.ts` | Pad-to-UI mapping, compound gestures. |
| `src/components/canvas/GrooveCircle.ts` | Allocation-free render loop. Mounted and running. |
| `src/data/` types + bootcamp drills | Well-formed data. See caveat below. |
| **43 Vitest unit tests** | All passing, re-verified. This layer is honest. |

---

## ❌ Exists as a file, never runs

| Module | Reality |
|---|---|
| `src/audio/MetronomeProcessor.ts` | **Emits no audio** — `process()` never writes to `outputs`. Tempo hardcoded to 120 BPM. No lookahead. Never loaded: there is no `addModule()` call anywhere. Also lacks the Vite build entry a worklet needs. |
| `src/audio/TimestampCorrelator.ts` | Never constructed. Nothing creates the `AudioContext` it requires. |
| SAB timing bridge | `midi.ts:setSyncData()` has no caller, so the `Atomics.load` path at `midi.ts:448` is unreachable. |
| `AudioContext` | **Does not exist anywhere in `src/`.** No metronome, no audio output, no scoring against an audio clock. |

**This is the critical path.** Everything that depends on a clock is blocked behind it.

---

## 🟡 Built, but fed placeholder data

- **`RhythmGrid.tsx`** — real component, rendered with `dummySequence`: two hardcoded notes at 1000ms and 1500ms (`app.tsx:182`).
- **Bootcamp drills** (`src/data/bootcamps/`) — 10 drills authored across two bootcamps. **No UI renders them.** Reachable only through `window.__E2E_EVALUATE_DRILL5__`.
- **`ThroneView.tsx`** — real container; its contents are the demo harness below.

---

## 🔴 Stubs

- **Placement diagnostic** (`app.tsx:267-286`) — "Start Placement Diagnostic" and "Skip" execute identical code. No medley, no measurement. Suppressed entirely under `navigator.webdriver`, so no test covers first-run.
- **`app.tsx` product surface** — still the Vite scaffold: emoji pad grid, "Live Event Feed", mouse-driven "Play Drill"/"Toggle Menu" buttons, `PRO VIRTUAL DRUMMER` badge. Useful for debugging; the inverse of the Anti-DAW premise. Layout A from the UX spec is unbuilt.
- **Persistence** — none. `src/state/session.ts` is 8 lines of in-memory signals. No IndexedDB, no `ProgressionStore`. Mastery gating currently gates nothing across a reload.
- **PWA** — no service worker, no manifest. `public/` holds two SVGs.

---

## ⚠️ Known-bad tests

- **`e2e/audioworklet.spec.ts`** — both tests reduce to `expect(true).toBe(true)`. The payload is literally `page.evaluate(() => { return true; })`. They pass whether or not an audio engine exists. **Delete and rewrite.**
- **`e2e/drill-gating.spec.ts`** — **currently RED.** Asserts a boolean against a `{passed, message}` object. Also claims to test zone confusion, but the hook discards the `diagnostics` argument and calls `evaluateIndependencePass`, which never reads zone data — and is the hi-hat drill, not the dynamics-gate drill its own comments describe.
- **Suite status:** Vitest 43/43 green. Playwright **19 passed, 1 failed** (not the 18/18 previously reported).
- Most bootcamp "E2E" tests call pure functions via `window` hooks with hand-built arrays. They are Vitest tests wearing a Playwright costume — slower, more fragile, no more informative.

---

## 🔧 Correctness issues to fix in passing

| Issue | Location |
|---|---|
| Velocity bands yield ~8–12 dB, not the "15–25dB" the comment claims | `src/data/utils.ts:19` |
| `generateSequence` hardcodes eighth notes (`notesPerBeat = 2`) — cannot express 16ths or triplets | `src/data/utils.ts:42` |
| Two competing hi-hat foot representations: note 44 vs CC#4. **CC#4 is authoritative.** | `src/data/utils.ts:11` |
| `@types/webmidi@^2.1.0` against `webmidi@^3.1.16` runtime — major version mismatch | `package.json` |
| COOP/COEP set for dev and preview only; production hosting unaddressed | `vite.config.ts` |
| `tone` and `workbox-window` installed and entirely unused | `package.json` |
| No coverage tooling, no `test:e2e` script, no linter | `package.json` |
| `__E2E_*` hooks and `navigator.webdriver` branches ship in the production bundle | `app.tsx:18-32, 263` |

---

## Working agreement

1. **"Done" requires a user-reachable path.** A module with green unit tests and no caller is written, not done.
2. **No test may assert a literal** or a value the test itself supplied.
3. **E2E means end-to-end.** If the payload is a `window.__E2E_*` call, it belongs in Vitest.
4. **Run the suite and paste the output** into the status entry. Do not report from memory.
