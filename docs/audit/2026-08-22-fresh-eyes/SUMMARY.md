# Fresh-eyes audit — first report

*2026-08-22.  **WORKING DRAFT, NOT AUTHORITY.**  Seven read-only auditors have
reported; every finding below was re-derived by the architect before being
written here.  Two auditor claims were found WRONG on verification and are
recorded as such.  Coverage and blind spots are stated at the end.*

---

## The headline: the suite is RED on a clean checkout, and nothing said so

    $ python3 bin/curate/check_doc_references.py
    check_doc_references: FAIL
      - CLAUDE.md: path 'gui/public/wasm/' does not exist
    exit: 1

The gate is wired unconditionally into the suite at `bin/runTests:2516`.
`gui/public/wasm/` is a BUILD OUTPUT (`make wasm-gui`), absent from a fresh
clone, carried by no `.gitignore` entry and absent from the gate's own
`ALLOWED_PATHS` table — which already exempts two comparable cases.

This is invariant **I2** firing on the file loaded into every session.  Its cost
is not the red line itself but what a standing red line does: it teaches every
reader that a failing suite is normal, which is how the next real failure gets
waved through.

## The three findings that matter most

### 1. Seven gates guard 200 curated records and none of them can fail

`data/standards/electrolyte/` was retired.  Seven gates read a file there as
their first act and, not finding it, print a reassuring sentence and `sys.exit(0)`
— with every later arm, including the orphan arm that is the only check on the
per-file corpus, sitting below that line.  All seven are wired into `bin/runTests`,
whose wiring turns exit 0 into the word **PASS**.

Left guarded by nothing: **55** Pitzer pairs, **65** Pitzer ternary terms, **62**
aqueous-speciation records, **9** gas-liquid, **6** ion-exchange, **3** eNRTL.

Two are doubly dead — they also name directories that do not exist — and one of
those bijection assertions was already broken *before* its input was deleted.
An eighth gate, `check_groups`, keeps its only failing branch behind a `--strict`
flag the suite never passes.

This is the `check_true_ions` shape the project has already paid for, seven times
over.  Detail and per-gate line numbers: FINDINGS-architect.md A6.

### 2. The Gibbs direct minimiser reports a convergence it never computed

`src/unitOperations/reactor/gibbsMethod/DirectMin.cpp:214-218` asserts
`converged = true`, `iterations = 0`, `residual = 0.0` after a multi-start
Nelder-Mead that terminated on simplex size, and fills the element potentials
with zeros.  The file contains **no output of any kind at any verbosity**
(`grep -cE 'cout|cerr|Advisory|throw'` → `0`).  The reactor then prints
`Conv.: yes in 0 Newton-ND iters` and `Final |F|: 0.000e+00`.

A golden pins the fabrication:
`tutorials/steady/gibbs/gibbs09_wgs_cooled_directmin/expected:15-17` fixes
`lambda_C`, `lambda_H`, `lambda_O` at `0`.  **A future correction that computes
real element potentials will be reported as a regression.**

This is the failure the project names as the one it treats most seriously — a
wrong answer at exit code 0 — with not even a warning.  Detail: A7.

### 3. Thirteen component records disagree with themselves about when the substance boils

Antoine evaluated at a record's own `Tb` must give one atmosphere; the engine
states the identity in its own source and applies it only to *estimated*
components.  An independent sweep of all 247 curated records: 105 carry both, 19
deviate by more than 3 %, **16 with `Tb` inside the record's own declared
`Trange`**.  Three of those sixteen are synthetic pseudo-components that declare
their own tuning, leaving **13 real substances** — formaldehyde worst, 59.4 K.

Which half of each record is wrong is deliberately NOT decided: that needs
primary literature this environment cannot open, and the calibration rule forbids
asserting what cannot be checked.  Detail: A4.

## What the growth measurement says about Gall's Law

The repository covers 1175 commits from 2026-06-19 (recovered — the working copy
arrived shallow, and that is its own finding, A1).

| | first commit | today | factor |
|---|---|---|---|
| C++ lines | 72 050 | 145 386 | ×2.0 |
| tutorial cases | 222 | 391 | ×1.8 |
| **gates** | **1** | **149** | **×149** |
| architecture documents | 0 | 32 | from nothing |

`bin/curate/` is now 43 572 lines — roughly **30 % the size of the engine it
verifies** — and did not exist at the start.

**The part of this project that grew by accretion is the part that CHECKS.**  That
is where a Gall's Law consolidation question actually points, and it is the one
layer that has never had an architecture document of its own.  What the engine did
before the repository opened, git cannot see: five weeks of work precede the first
commit, so no claim is made about the engine's genesis.

Consistent with this: the two auditor claims that failed verification both
concerned the ENGINE's structure and both, when corrected, made the engine look
BETTER than the auditor reported (A5 — six abstractions with a single
implementation, not twenty-eight).  The defects that survived verification are
concentrated in the checking machinery and the data, not in the physics.

## Two level-1 documents assert the opposite of what the machinery measures

    $ python3 bin/curate/check_layering.py
    check_layering: OK -- 61 subsystem edge(s) measured across all 14 declared subsystems.
      I17 is ASSERTED: there is NO upward edge in the runtime graph …

- `global-invariants.md:123` — **"HOLDS as of 2026-08-05"**.  Correct.
- `architecture-description.md:114` (C1) — **"INCONSISTENT — 4 upward edges"**.
- `module-boundaries.md:32-33` — **"both are currently violated by measured code"**.

The last two are level 1.  A reader who believes them concludes upward edges are
tolerated, or spends a session hunting four that no longer exist and then decides
the gate is broken.

## Standing lesson from running the fleet

**Two of the auditor findings I checked were wrong, and both would have been the
more dramatic report.**  One claimed an abstract base with zero implementations
(it has two, defined in the `.cpp` — a header-only grep cannot see them).  One
counted three synthetic pseudo-components among thirteen real defects.  Nothing
from an auditor is in this summary that was not re-derived here.

The governance rule that an audit produces *evidence, never authority* is not
ceremony.  It is load-bearing.

## Coverage — what this campaign has NOT done

- **No case has been run.**  The build was still in progress while the auditors
  worked, and the law forbids building while the suite runs.  Every claim above
  is static: read from source, records and goldens, or from a gate run directly.
- **96 of the 149 gates were not read**, only swept by five automated static
  passes.  Those 96 are NOT cleared: a semantically vacuous assertion, a regex
  that no longer matches its subject, or a floor set below a collapsed count
  would all survive that sweep.
- **The corpus was not exercised.**  Findings about what a golden pins are read
  from the `expected` files, not from a live diff.
- Several subsystems under `src/thermo/` and `src/unitOperations/` were never
  opened by the silent-fallback sweep; they are listed in that auditor's own
  coverage statement.
- No finding here has a FIRED witness. Except A7, whose wrong values are already
  baselined in a checked-in golden — that witness has fired and been accepted.
