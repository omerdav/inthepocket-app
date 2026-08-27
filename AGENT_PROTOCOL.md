# Agent Protocol — read this before every task

You are implementing a task for **InThePocket**, a zero-latency practice app for electronic drummers. Timing correctness is the product; a subtle error here is worse than a crash, because it silently teaches a drummer the wrong thing.

This document is standing law. The task spec tells you *what*; this tells you *how*, and it wins wherever the two disagree.

---

## 1. Why this protocol is strict

This codebase was previously built by agents who reported work complete without verifying it. The result, found by later audit:

- A metronome whose `process()` never wrote to `outputs` — **it produced no sound at all** — recorded as "✅ COMPLETE — ALL QA CHECKS PASSED".
- Two tests "verifying" that engine which both reduced to `expect(true).toBe(true)`.
- A `ScoringWorker` that failed to load in the browser and answered nothing, while the app posted messages to it. No hit was ever scored.
- A suite reported as "18/18 passing" that was actually 19 passed, 1 failed.

Every rule below exists because one of those happened. None of them are ceremony.

---

## 2. The six hard rules

### Rule 1 — Never weaken a test to make it pass

You may **not**, without explicit written approval in the task spec:

- change an assertion's expected value
- loosen a tolerance, threshold, or timeout to make a check pass
- add `test.skip`, `test.fail`, `.only`, or comment a test out
- delete a test or an assertion
- catch and swallow an error that a test was relying on

If a test fails, the default assumption is **the code is wrong**. If you believe the test is wrong, **stop and report it** (§6). Do not decide this yourself.

### Rule 2 — Never assert a literal

A test must assert a value produced by the system under test. These are forbidden:

```js
expect(true).toBe(true)                    // asserts nothing
const x = 5; expect(x).toBe(5)             // asserts your own input
return true                                // "simulated check"
```

If you cannot obtain a real value to assert, the test is not ready — say so.

### Rule 3 — "Done" requires a user-reachable path

A module with passing unit tests and no caller is **written**, not **done**. In your report you must name the screen or flow a person can use to reach the code you wrote. "It is exported" and "it is called from a test" are not answers.

### Rule 4 — No test scaffolding in the production bundle

Do not add `window.__E2E_*` hooks, `navigator.webdriver` branches, or test-only flags to `src/`. If a test needs to reach something, expose it the way a **user** reaches it — a URL, a DOM attribute, a real event. Precedent: drill selection is `?drill=<id>`, a real deep link, not a hook.

### Rule 5 — Report only what you ran

Every claim of success must be backed by **pasted terminal output** from a command you actually executed in that session. Never write "tests pass" from memory or inference.

**Pasted output must be a verbatim copy of one real run.** Not reconstructed from memory, not assembled from several runs, not edited for length, and never relabelled. If a task asks for ten lines and the command emits twenty, paste twenty and say so — the instruction was wrong, and truncating to satisfy it hides the correction.

If output is missing, say it is missing. "I did not run this" is an acceptable report. Output that looks right but did not come from the machine is worse than no output at all, because it costs a reviewer a full verification cycle to discover, and it puts every other line in the report in doubt.

> This rule was tightened after a report pasted a ten-line "after" block in which two lines were real output from *different drills*, relabelled. The underlying work was correct; the report was not, and the only way to establish that was to re-run everything by hand — which is precisely the cost this protocol exists to avoid.

---

### Rule 6 — Commit your work before you report it

**Work that is not committed is not delivered.** Before you write your report, commit on your task branch. Report the commit hash.

Not a formality. Four things break when a task is handed back as an uncommitted working tree:

- **Your history is lost.** The reviewer commits your changes for you, so the record says they wrote it. What you tried, what order you did it in, and what you reverted all disappear — and that reasoning is often the most useful part of the work.
- **The reviewer cannot separate your change from the baseline.** `git diff master..HEAD` is the first thing they run. Against an uncommitted tree it shows nothing, and they have to reconstruct your scope from your prose.
- **It is fragile.** A stray `git checkout`, `git stash`, or worktree operation destroys it silently. Reviewers here routinely use `git stash push -u` for attribution — that would take your uncommitted work with it.
- **Nobody can tell whether you finished.** A dirty tree looks the same whether you are done or stopped halfway.

Commit as often as you like. One commit at the end is fine. Zero is not.

If something genuinely cannot be committed — a file you were told not to touch, a generated artefact — say so in the report rather than leaving it loose in the tree, and delete the scratch files you no longer need.

> Added after three consecutive tasks were handed back with every change sitting uncommitted in the worktree. It cost no correctness, because the reviewer committed each one — under their own name, with the dev's reasoning gone.

---

## 3. Verification — run all of these, every task

```bash
npm run build
```
```bash
npm test
```
```bash
npm run test:e2e
```

All three must be green. Paste the **tail of each** into your report.

**Use `npm run test:e2e`, not `npx playwright test`.** The E2E suite is split
into two projects: `product` (yours) and `simulation` (another team's).
Playwright aborts *all* collection on a single module-load error, so a break in
their specs would otherwise leave you with `0 tests in 0 files` — no safety net,
and silently. `npm run test:e2e` runs only the product project and is immune.

**If a test fails, re-run it once.** This suite has occasional flakes. If it
passes on the second run, report it as flaky and name the test — do not treat
it as green without saying so, and never "fix" it by adding a timeout or a
retry. A flake nobody reports becomes a flake nobody can trust.

If something was already failing before you started, say so and quote it.

### Mutation check — required when you add or change a test

A test that cannot fail is worse than no test, because it manufactures confidence. So prove yours can:

1. Deliberately break the code the test covers (one line is enough).
2. Run the test. **Confirm it goes red.**
3. Restore the code exactly.
4. Re-run. Confirm green.
5. Report what you broke and which tests failed.

Example from this repo: silencing the metronome turns 5 of 8 engine tests red; restoring the hardcoded 120 BPM fails the tempo test alone. That is what a working test suite looks like.

---

## 4. Scope discipline

- Touch **only** the files listed in the task spec. If the work genuinely requires another file, stop and report before touching it.
- Never modify files under `e2e/simulation/` — another team owns them.
- Never modify `AGENT_PROTOCOL.md` or anything in `../inthepocket-planning/`.
- Do not refactor, rename, reformat, or "clean up" code outside the task. Unrequested churn makes review expensive and hides the real change.
- Do not add dependencies. If you think one is needed, report it.

---

## 5. Code standards

- **Match the surrounding code.** Its naming, comment density, and idiom are the style guide.
- **Comment the *why*, never the *what*.** `// increment i` is noise. `// Fold to the nearest beat: differencing against the next one reports a hit 5ms late as ~495ms early` is the reason the code exists.
- **Zero allocation in hot paths.** No `new`, no array literals, no closures inside render loops, MIDI handlers, or the audio worklet. Pre-allocate and reuse.
- **TypeScript is strict.** `erasableSyntaxOnly` forbids `enum` and constructor parameter properties. `verbatimModuleSyntax` means type-only imports **must** use `import type` — getting this wrong silently breaks module loading at runtime, which is exactly how the ScoringWorker died.
- **Never guess at timing.** If you need to know when something happens, read the clock or await the real signal. Do not add `setTimeout` to "let things settle" in `src/`.

---

## 6. When you are blocked or disagree

**Stop and report. Do not improvise.**

Report immediately if:

- a test fails and you believe the test is wrong
- the spec is ambiguous or contradicts the code
- the work requires a file outside your scope
- you cannot make something pass without breaking one of the six rules
- you find a bug unrelated to your task (report it, do not fix it)

A blocked task reported honestly is a good outcome. A task reported complete that isn't is the failure this protocol exists to prevent.

---

## 7. Report format

**Write your report to the path the task spec names**, inside the repo — and also return it in your response. A report saved to a scratch directory outside the repo is a report nobody reads. This has already happened once: a full audit was written to `~/.gemini/antigravity/brain/…` and was nearly lost, while the findings it contained were the entire deliverable.

If the spec names no path, use `reports/<task-id>.md` in the app repo.

End every task with exactly this:

```markdown
## Task: <id> — <title>

### Commit
<hash> on <branch>   <!-- Rule 6. `git log --oneline master..HEAD`. Must not be empty. -->

### What I changed
- <file>: <one line on what and why>

### User-reachable path
<The exact screen/flow a person uses to reach this. Required.>

### Verification
$ npm run build
<pasted tail>

$ npx vitest run
<pasted tail>

$ npx playwright test
<pasted tail>

### Mutation check
Broke: <what>
Result: <which tests went red>
Restored: yes — re-ran, green

### Requirements
- [x] R1 — <how it was satisfied>
- [ ] R3 — NOT DONE because <reason>

### Notes for review
<Anything you were unsure about, chose between, or noticed in passing.>
```

Never mark a requirement `[x]` you did not complete. An honest `[ ]` with a reason is always the right answer.

---

## 8. Bugs from the simulation suite

The simulation suite plays drills as modelled drummers on modelled hardware and checks the app's diagnosis against known ground truth. A failure there means one of three things:

1. **The app is wrong** — the common case. Fix the app.
2. **The oracle's expectation is wrong.** Not yours to change (§4).
3. **The simulated drummer is unrealistic.** Also not yours to change.

**You may only act on case 1**, and only when the task spec says so. For 2 and 3, report the finding with evidence and stop.

When fixing case 1, the fix must address the **cause**, not the symptom. Example: a drummer with scattered timing being told they are "rushing" is not fixed by changing the message — it is fixed by checking variance before consulting per-hit rules. Ask what the drummer would do with the feedback; if the answer is "the wrong thing", you have not fixed it.

---

## 9. Current state and standing hazards

**Maintained by the owner. Read this before every task — it replaces the context that used to be pasted into each handoff.**

### Baselines

A task is not green unless it matches or beats these:

| | |
|---|---|
| `npm run build` | clean (`tsc -b && vite build`) |
| `npm test` | **179 passing** |
| `npm run test:e2e` | **88 passing** (product project), ~10.6 min |
| `npm run check:isolation` | both COOP/COEP headers on the built bundle |
| `npm run check:offline` | 18 precache entries, worklet and scoring worker present |
| drill audit | **30 run lines**, 31 tests including the boundary guard |

Verified together on 2026-08-24. **`tsc -b` does not cover `e2e/`** — nothing does, see H-9 — so a syntax error there survives every check above and surfaces only when Playwright compiles it, ten minutes in.

`npm run test:e2e` is **not** an alias for the drill-audit command. The audit is 31 of those 88 tests. Run both, paste both.

### The audit is the guard

The 30 drill-audit lines assert a verdict per drill per run type, and none of them depend on live visual feedback. **If an audit row moves and your change did not touch scoring, stop and report.** Something has leaked into the grade, which is worse than whatever you were fixing.

### One machine, one dev server

`playwright.config.ts` sets `reuseExistingServer: false`. **Playwright will refuse to start if port 5173 is already in use.** That is deliberate.

Every worktree's Playwright wants the same port, so attaching to whatever is already there meant verifying another branch's code and reporting a green result about a tree you never ran (register P-10 — it cost a full thirty-row audit that had to be discarded). A refusal costs minutes; a false green costs everything built on it.

**If your run fails to start:** something else is serving 5173 — another worktree, or a dev server you left running. Stop it. Do not change this setting, and do not move to another port: the port is not the only shared resource. `workers: 1` exists because concurrent browser contexts starve the audio thread, so two suites on two ports would corrupt each other's timing just as effectively.

### Known intermittents — report as observed, do not fix

- **P-1** — the audio clock wedges (renders one buffer and stops dead). Shows as `"Audio System Interrupted"` on the results screen. Proven to be a wedged output stream, not a starved thread. **It can start mid-suite**, after the preflight has already passed — the preflight is a gate, not a monitor. **A suite running much longer than ~11 minutes is a symptom**: check `node scripts/check-audio.mjs` before waiting it out. Transient and self-healing, so a green run means the window is closed, not that the fault is gone.
- **P-7** — the Vite dev server dies mid-suite and every spec after it fails with `net::ERR_CONNECTION_REFUSED`. Seen twice: 27 failures once, 38 on 2026-08-24. It reads as a broad application regression across routing, first-run, quickmenu and persistence. **If you see a block of connection-refused failures, the server died — do not start bisecting.**

If any of these fires, say so and move on. Do not chase them, and do not let them stop you reporting your own result honestly.

### Invariants — each is a fix for a real defect, do not disturb

- **`DrillSession.start()` unlocks audio before any async storage read** (T-014). Awaiting IndexedDB first consumed the transient user activation and left every drummer with a silent, frozen count-in.
- **The error path dispatches `DRILL_PHASE_EVENT`** rather than setting phase locally (T-021). Setting local state strands `isDrillPlaying` true and suppresses the drummer's quick menu for the rest of the session.
- **`DrillResult.error`** (`'audio-stall' | 'cancelled'`) is surfaced as `data-error` and read by both the results verdict and the audit guard. It is structural on purpose — do not replace it with prose matching.
- **Hit matching is sequence alignment, not nearest-neighbour** (T-022). Greedy per-target matching cascaded: one dropped note made the app report the whole drill as rushed.
- **Live feedback measures against the drill's targets, not the metronome click** (T-027). The click is quarter notes; drills are written in eighths. The same nearest-target loop also attributes sticking for the balance meter (T-004) — reuse it rather than writing a second matcher.
- **One documented `navigator.webdriver` exception remains**, guarded by `src/__tests__/no-e2e.test.ts`, which fails if a second appears or if any `__E2E_` string returns to `src/`.

### Scaffolding freeze

`AGENT_PROTOCOL` Rule 4 forbids `window.__E2E_*` hooks, `navigator.webdriver` branches and test-only flags in `src/`. Eleven predate the rule and are being removed (T-020).

**Do not add a twelfth, and do not widen an existing one.** If a test cannot reach something without a hook, that is a finding — report it.
