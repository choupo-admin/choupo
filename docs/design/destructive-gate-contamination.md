# A destructive gate poisoned the evidence, and the evidence was committed

*Incident 2026-08-18.  Verification/provenance system.  Status: corrected,
sabotage-verified, evidence re-gathered.*

## 1. Root cause

`bin/curate/check_gate_selftest.py` is the meta-gate that proves other gates
can fail: it **sabotages curated records and engine sources, rebuilds the
engine, and requires the covered gate to exit non-zero**.  It restores
everything afterwards, from bytes held in memory, inside `try/finally`, and it
compares the restored bytes to the originals.

That makes it **exception-safe**.  It is not **death-safe**, and the whole
incident lives in that gap:

* `bin/curate/gate_manifest.py` runs every gate through
  `subprocess.run(..., timeout=TIMEOUT)`;
* CPython's implementation of that timeout **`kill()`s** the child — SIGKILL;
* **no `finally` block runs against SIGKILL.**

The ceiling was `TIMEOUT = 600`.  `check_gate_selftest` was **measured at
250 s** on an idle machine — comfortably inside it.  On 2026-08-18 three
browser-driving subagents were running concurrently; under that load the same
gate exceeded 600 s and was killed **mid-sabotage**, leaving a **rebuilt engine
containing a sabotaged `src/solver/Convergence.H`** on disk.

The manifest walk is alphabetical, so every engine-running gate after
`check_gate_selftest` then ran against a poisoned binary.

Two further properties turned a loud failure into a silent one:

1. **The working tree was clean.**  The source sabotage had been reverted by an
   earlier, successful arm; only the *binary* carried the damage.  `git status`
   said nothing, and `check_build_fresh` — which would have caught it — sits
   *before* `check_gate_selftest` in the alphabet and had already run.
2. **`gate_manifest.py` recorded failures as claims and wrote the file anyway**:
   `{"exit": 1, "claim": "check_x: FAILED"}`.  A claim is what a gate says when
   it has something to say; a failure is the *absence* of one.  Recording it as
   the gate's own account of itself answers *"what does this project check?"*
   **wrongly, with authority** — the precise defect that file's own header says
   it exists to prevent.

## 2. Blast radius

**Contaminated in this run (7 gates), all alphabetically after the killed
gate:** `check_inlet_resolution`, `check_solid_service`, `check_stage_identity`,
`check_stream_transport_closure`, `check_tray_chemistry`, `check_second_liquid`,
`check_utility_allocation_pinned`.  Every one recovered from a single
`make all`, **with no source change whatsoever** — which is the proof that none
of those failures was ever about those gates.

**It had happened before, and been committed.**  Counting entries whose
recorded `claim` is a failure, across the committed history of
`generated/gateManifest.json`:

| commit | date | contaminated entries |
|---|---|---|
| `a5ae7438` | 08-17 12:40 | **12** |
| `8c276270` | 08-16 21:11 | **12** |
| `fa6cf191` | 08-15 21:47 | 0 |
| `bb16ff51` | 08-15 16:17 | 2 |
| `b2ebdcc3` | 08-15 13:52 | 2 |
| `e55d8d03` | 08-13 15:50 | 1 |
| `90078335` | 08-12 13:35 | 1 |
| `60760552` | 08-12 01:34 | 1 |

The last committed manifest therefore described **12 of its 145 gates with a
failure instead of a claim**.

**A SECOND contamination mode is visible in that table and must not be
conflated with the first.**  In `a5ae7438` the twelve include
`check_build_fresh: FAILED` — the manifest was generated against a **stale
build**, not a sabotaged one.  Different cause, identical consequence, and the
same single defect let both through: *the manifest was written regardless of
whether the gates passed.*

**Goldens: NOT contaminated.**  This was the highest-stakes question — a
`runTests --record` against a poisoned binary would freeze a wrong answer with
the authority of a reference.  The decisive test is the full regression against
a clean build: a golden recorded off a sabotaged engine cannot agree with a
correct one.  See §6.

**Not in the blast radius:** the published site and `main`.  The contamination
reached `generated/gateManifest.json` only; no engine source, no curated
record, and no case golden was altered by it.

## 3. Architectural correction

### 3a. A destructive gate declares itself in a journal that outlives it

`bin/curate/destructive_session.py` — **one home** for *"a gate is about to
mutate this tree and may not survive it."*

A **lock** would only stop two destructive runs colliding.  That is not the
failure mode.  The failure mode is *one destructive run dies and nobody
downstream can tell*.  So this is a **journal**: written before the first
mutation, naming the owner, the pid, the start time and each file's original
sha256 — and removed **only on a clean exit**.  It is a claim in the negative:
*while this file exists, neither the working tree nor `build/` is trustworthy.*

It survives SIGKILL because it is on disk and nothing but a verified restore
removes it.  That is the property `try/finally` cannot have.

It lives in `build/` — gitignored, persistent across processes, beside the
artefact whose trustworthiness is in question.  If `build/` is wiped the binary
is gone too, so a missing journal there cannot mean "the build is fine" when it
is not.

An **unparseable** journal counts as PRESENT, never as absent: a process that
died mid-write still leaves an untrustworthy tree.

### 3b. The campaign-invalidating rule

Every harness that produces **evidence** calls `assert_tree_undisturbed()` and
**refuses** while a journal stands:

* `bin/runTests` — at the very top, **before** `check_workspace_truth` and
  `check_build_fresh`, so the refusal that names the actual cause is the one the
  reader sees;
* `bin/runTests --record` — the most important of the three, because it
  **freezes an answer into a golden**;
* `bin/curate/gate_manifest.py`, both arms — and in the full arm **between every
  gate**, not once at the top.  Checking only at the start would have caught
  nothing on 2026-08-18: the tree was clean when the run began.

The refusal is spelled **once**, in Python, and the bash harness calls it
through a `--assert` entry point.  A second implementation in bash is how two
rules drift into disagreeing.

The refusal prints the recovery procedure and states the trap explicitly: *a
clean `git status` does NOT clear it — the build carries the damage even when
the sources are back.*

### 3c. A failing gate makes no claim

`gate_manifest.py` now **refuses to write** on any non-zero exit or timeout,
naming every offending gate, and says to rebuild when a timeout was involved.
A partial write mixing today's claims with yesterday's would be worse than a
stale file, because a reader could not tell which lines were observed.  One bad
gate blocking the whole regeneration is the right trade for a file whose only
purpose is to be true.

### 3d. The timeout becomes a backstop, not a tuning knob

`TIMEOUT` 600 → **3600**, because 600 s was shorter than a healthy gate needs
under load, so the harness was killing a working gate and blaming the tree.
Each gate's **elapsed seconds are now recorded in the manifest**, so the ceiling
is judged against measurements rather than remembered, and a gate that grows
slow becomes visible *before* it starts timing out.

### What was deliberately NOT done

* **No automatic repair.**  The journal announces and instructs; it does not
  `git checkout` or `make` on anyone's behalf.  A mechanism that silently
  repairs a tree it does not fully understand is how a real edit gets destroyed
  — and `check_gate_selftest` already refuses to start over a dirty file for the
  same reason.
* **The alphabetical walk was left alone.**  Reordering so the destructive gate
  runs last would hide this class of failure rather than detect it, and the next
  destructive gate would reintroduce it.
* **No retro-judgement of the historical manifests.**  The contaminated entries
  are recorded in the table above; the committed files themselves are history
  and are not rewritten.

## 4. Evidence invalidated or replaced

| artefact | verdict |
|---|---|
| `generated/gateManifest.json` as committed at `a5ae7438` | **INVALID in 12 of 145 entries** — replaced by a regeneration in which every gate was observed passing |
| the regeneration performed at 16:47 on 2026-08-18 | **DISCARDED, never committed** — it carried 7 contaminated entries and was recognised as such before staging |
| historical manifests with 1–2 failure entries (08-12 … 08-15) | recorded above as contaminated; not rewritten |
| every case golden (`expected`) | **VALID** — established by full regression against a clean build, §6 |
| commit `f81cf624` (the pellet slice) | **VALID** — its gate was written, run and sabotage-verified before the manifest run began, and its two witness cases were re-run after the clean rebuild |

## 5. Sabotage proof of the correction

The correction was verified by reproducing the incident's own mechanism:
`check_gate_selftest` was started and **SIGKILLed mid-run** — the exact signal
`subprocess.run`'s timeout sends.

* the journal **survived the kill**, carrying the owner, the pid, the start time
  and five files with their pre-sabotage sha256;
* **`git status --porcelain` on all five reported nothing** — the sources were
  already clean and only the *binary* was wrong.  This is the incident's exact
  shape, and it is the case no other instrument covered;
* `bin/runTests` **refused**, naming the cause, before running any case;
* `bin/runTests --record` **refused** — no golden could be written;
* `gate_manifest.py --check` **refused**;
* following the printed recovery (`git checkout` → `make all` → remove the
  journal) returned the tree to `no destructive session is open`.

A control was run in the other direction: a **clean** `check_gate_selftest` run
removes its own journal on success, and the harnesses stop refusing.

## 6. Current trustworthy state

Recorded in the commit that carries this document — the full regression result
and the freshly regenerated manifest, in which **every one of the gates was
observed passing** rather than merely recorded.
