# Architect's own findings — serial track

*Working draft, opened 2026-08-22.  **NOT AUTHORITY.**  These are the findings
the architect took himself, in the serial track, while the read-only auditors
worked in parallel.  Each carries file:line, a verbatim quotation, and a
failure scenario, or it is not here.*

---

## CONFIRMED

### A1. The repository history is NOT in this checkout (environment, not defect)

**Evidence.**

    $ git rev-parse --is-shallow-repository
    true
    $ ls .git/shallow
    .git/shallow                       (exists, 41 bytes)
    $ git rev-list --count main
    50
    $ git log --format='%h %ad %s' --date=short main | tail -1
    bf12487a 2026-08-17 The publish refused over a notice for a file nobody receives

Fifty commits, the oldest dated 2026-08-17.  The project's own documents
describe work from 2026-05-16 onward, so upwards of three months of history is
absent from this working copy.

**Failure scenario.**  Every file in the tree reports the same creation date
under `git log --diff-filter=A`.  An audit that measures "when did this
subsystem appear" from this checkout concludes that the ENTIRE project was
created on one day — which is the exact signature of a system designed complex
up front, and it would be a pure artefact of the clone.  A Gall's Law
assessment taken this way would reach the most consequential possible
conclusion on evidence that does not exist.  Nothing in the tree announces the
truncation; `git log` succeeds and prints a plausible history.

**Consequence, already acted on.**  The growth half of the accretion survey was
redirected mid-flight to reconstruct the chronology from the project's own
dated prose (`decision-records.md`, `CLAUDE.md` §5/§6, `CHANGELOG.md`, source
header comments), with the standing requirement that the reconstruction be
labelled as documentary and not as a measurement of the repository — it
inherits whatever errors the prose contains, and the prose has been wrong
before.

**This is not a criticism of the project.**  It is a property of how this
session's working copy was created, and it bounds what this campaign can
honestly claim.

### A2. The stopping rule of §5a is satisfied over the last 15 slices — by a PROXY test whose blind spot is stated

**The rule** (`docs/architecture/project-philosophy.md` §5a, level 1, ruled by
Vítor 2026-08-09):

> "Three consecutive substantial slices that fit inside the existing
> architecture without reopening a Level-1 or Level-2 boundary are evidence
> that the architecture is FROZEN."

**What was measured.**  For each of the last 15 commits on `main`, whether it
modified any of the eleven level-1/level-2 authority documents.  Result: 13 of
15 touched none.  The two that did are both index maintenance, not boundary
work:

- `020b4650` — `decision-records.md` only, +4/-3: adds one design record to the
  ADR index and recounts.  Quotation: `-## 1. Why an index, when 77 records
  already exist` / `+## 1. Why an index, when 78 records already exist`.
- `60623158` — `decision-records.md` only, same shape, 76 → 77.

An independent count taken here agrees with the index: `ls docs/design/*.md |
wc -l` → **78**, and the index says 78.

**THE BLIND SPOT, stated rather than discovered later.**  Editing a level-1
document is a PROXY for reopening a boundary, and it is the weaker direction of
the two.  The dangerous case is the opposite: a new architectural boundary
introduced in `src/` — a new subsystem, a new abstract base, a new special-case
path — **without any document being touched**, which is precisely how a
boundary gets reopened silently.  That test requires knowing which source files
are NEW, and per A1 this checkout cannot answer that.

**So the honest verdict is:** no slice in the last 15 announced a boundary
reopening, and this campaign currently has no instrument that could detect an
unannounced one.  That gap is the reason the parallel auditors were pointed at
reachability and at duplicated homes — both of which detect a new boundary by
its consequences rather than by its birth date.

---

## DROPPED — a candidate that failed the failure-scenario test

Recorded because the discipline is only visible when something actually fails
it.

**Two distinct classes share the name `TransportModel`:**

    src/thermo/transport/TransportModel.H:64            class TransportModel
    src/unitOperations/membrane/transport/TransportModel.H:115  class TransportModel

and two different translation units include them by the SAME string:

    src/thermo/ThermoPackage.cpp:43                #include "transport/TransportModel.H"
    src/unitOperations/membrane/SpiralWoundModule.cpp:42   #include "transport/TransportModel.H"

**Why it is dropped.**  The two classes are in different namespaces —
`Choupo::TransportModel` and `Choupo::membrane::TransportModel` (the second
nested inside `namespace membrane {` at line 77) — so there is no C++ collision.
The identical include strings resolve correctly and deterministically, because a
quoted include is searched relative to the including file's own directory first;
each `.cpp` therefore reaches the header in its own subtree by the language
rule, not by luck of include-path ordering.

No concrete wrong answer could be constructed for a user.  Per
`development-governance.md` §5.3 — *"If that scenario cannot be constructed, the
finding is dropped, however plausible it looks"* — it is dropped.  It survives
only as an observation about vocabulary, relevant to how many distinct concepts
the naming scheme carries, and not as a defect.

---

## Measurements taken (not findings)

| quantity | value | method |
|---|---|---|
| abstract base classes in `src/` | 41 | `grep -rlE 'virtual[^;]*=\s*0\s*;' src --include=*.H \| wc -l` |
| commits available on `main` | 50 | `git rev-list --count main` |
| design records | 78 | `ls docs/design/*.md \| wc -l` |

The abstract-base count is a PROXY (a header declaring at least one pure
virtual); it counts headers, not classes, and a header holding two abstract
bases counts once.  Stated so the number is not later quoted as exact.

---

## A1 — SUPERSEDED, and the correction is itself the finding

`git fetch --unshallow origin` succeeded.  The history IS recoverable and is now
present:

    $ git rev-parse --is-shallow-repository        → false
    $ git rev-list --count main                    → 1175
    $ git log --format='%h %ad %s' --date=short main | tail -1
      7ec686c13 2026-06-19 Choupo — open-source, glass-box educational chemical process simulator

Commits by month: 2026-06 → 103 · 2026-07 → 444 · 2026-08 → 628.

A1 stands as a record of what a truncated clone would have made this campaign
conclude, and of the fact that nothing announced the truncation — `git log`
succeeded and printed a plausible history.  Its remedy was to try the recovery
before reporting the limitation.  The accretion survey has been redirected back
to real git dates.

---

## A3. WHAT GREW IS NOT THE ENGINE — it is the machinery that checks the engine

This is the central measurement for the Gall's Law question, and its answer was
not the expected one.

**The initial commit, `7ec686c13` (2026-06-19): 3336 files, 241 836 insertions.**

| quantity | at first commit | today (2026-08-22) | factor |
|---|---|---|---|
| C++ lines under `src/` | 72 050 | 145 386 | ×2.0 |
| C++ files under `src/` | 426 | 648 | ×1.5 |
| tutorial cases (`*.cho`) | 222 | 391 | ×1.8 |
| **gates (`bin/curate/check_*.py`)** | **1** | **149** | **×149** |
| markdown docs under `docs/` | 24 | 164 | ×6.8 |
| documents in `docs/architecture/` | 0 | 32 | from nothing |

Methods: `git ls-tree -r --name-only 7ec686c13 | grep -cE '^src/.*\.(cpp|H)$'`
and, for lines, `git show 7ec686c13:<path>` summed over that list; today's
figures by the same `find`/`wc` commands recorded in PLAN.md §4.

The single gate present at the first commit is `bin/curate/check_ion_pins.py`.

**Scale of the machinery today**: `bin/curate/` holds 196 Python files and
43 572 lines, of which the 149 gates are 32 972 lines; `bin/runTests` is a
further 3637 lines.  The verification and curation layer is therefore roughly
**30 % the size of the engine it verifies**, and it did not exist at the start.

### What this does and does not license anyone to conclude

**It does NOT show that the engine was designed complex up front.**  Git cannot
see the engine's genesis: the project's own documents date decisions to before
the first commit — the GUI credo to 2026-05-16 and the property architecture to
2026-06-05, both weeks earlier — so roughly five weeks of development preceded
the repository.  Whether the engine grew from a simple working thing in that
period is a question this repository cannot answer, and no measurement here
should be quoted as answering it.

**It DOES show, with dates, that the verification and governance layer grew by
accretion** — from one gate to 149, and from no architecture documents to
thirty-two — over the sixty-four days the repository covers.  That growth is
recorded, in this project's own idiom, one defect at a time: nearly every gate
names the specific defect that paid for it.

**The consolidation question therefore points somewhere unexpected.**  If a
subsystem here grew large by accretion without anyone having stepped back to ask
whether it still has a simple core, the strongest candidate is not the engine.
It is the 43 572 lines of checking machinery, which was built one gate at a time
under exactly the pressure that produces accretion, and which — unlike the
engine — has never been the subject of an architecture document of its own.

Stated as a hypothesis with its evidence, not as a conclusion.  What would
confirm or refute it: whether those 149 gates share a small number of common
shapes that could be expressed once, or whether each genuinely needs its own
code.  That is measurable and is not yet measured.

---

## A4. A record can contradict ITSELF about when its substance boils — 13 do

Reported by the arity auditor; **re-derived independently here** rather than
accepted, then corrected in one material respect.

**The identity.**  A component record may carry both a normal boiling point
`Tb` and an Antoine vapour-pressure set.  These are not independent: Antoine
evaluated at `Tb` must give one atmosphere.  The engine states the identity in
its own words at `src/propertyOps/EstimateComponent.cpp:534` — *"Psat(Tb) is the
self-consistency check (should sit near 1 atm)"* — and prints the deviation for
ESTIMATED components.  Curated records are never checked against it.

**The convention was verified before the arithmetic was trusted.**
`src/thermo/vaporPressure/Antoine.cpp:59-63`:

    // Antoine published convention: log10(Psat[bar]) = A − B / (T+C).
    const scalar Psat_bar = std::pow(10.0, A_ - B_ / (T + C_));
    return Psat_bar * units::bar_to_Pa;

**Independent sweep of all 247 curated component records** (own script, not the
auditor's): 105 carry both `Tb` and an Antoine set; **19 deviate by more than
3 % in pressure at `Tb`; 16 of those have `Tb` INSIDE the record's own declared
`Trange`**, so extrapolation is not the excuse.

**THE CORRECTION.**  The three largest deviations are `compC`, `compA` and
`compB`, and they are not defects.  `data/standards/components/compA.dat`
declares itself:

    Component: compA  -- synthetic PSEUDO-component for VLLE algorithm audit.
    Antoine tuned so Psat ≈ 5 bar at 350 K …
    NOT A REAL SUBSTANCE -- a numerical test stand-in (formula "A", CAS 00-00-0).

Their disagreement is deliberate and documented.  Excluding the three synthetic
stand-ins leaves **13 real substances**:

| record | `Tb` declared | Psat at `Tb` | deviation | `Tb` implied by Antoine | ΔT |
|---|---|---|---|---|---|
| `H2O2` | 423.35 K | 2.2479 bar | +121.9 % | 396.41 K | −26.9 K |
| `HCHO` | 254.05 K | 0.0551 bar | −94.6 % | 313.42 K | **+59.4 K** |
| `HCl` | 188.00 K | 0.3232 bar | −68.1 % | 207.61 K | +19.6 K |
| `NO` | 121.40 K | 0.4204 bar | −58.5 % | 130.14 K | +8.7 K |
| `propylene` | 225.46 K | 0.7167 bar | −29.3 % | 233.20 K | +7.7 K |
| `N2O` | 184.67 K | 0.7181 bar | −29.1 % | 190.82 K | +6.1 K |
| `ethylAcetate` | 350.21 K | 1.2908 bar | +27.4 % | 342.64 K | −7.6 K |
| `Cl2` | 239.18 K | 0.8033 bar | −20.7 % | 244.42 K | +5.2 K |
| `HCN` | 298.85 K | 1.2182 bar | +20.2 % | 294.59 K | −4.3 K |
| `Ar` | 87.30 K | 1.1918 bar | +17.6 % | 85.88 K | −1.4 K |
| `H2S` | 213.60 K | 0.8598 bar | −15.1 % | 216.77 K | +3.2 K |
| `He` | 4.22 K | 0.8946 bar | −11.7 % | 4.40 K | +0.2 K |
| `N2` | 77.35 K | 0.9673 bar | −4.5 % | 77.73 K | +0.4 K |

**Both homes are live consumers.**  `Tb` feeds the Watson ΔHvap scaling and the
derived `K_b` (`src/thermo/Component.H:403`); the Antoine set feeds every flash
and every bubble point.

**Failure scenario.**  A student runs a 1 atm bubble point on ethyl acetate and
gets ≈342.6 K, then reads `Tb 350.21;` seven lines above the coefficients in the
very record the run loaded.  The simulator contradicts its own datasheet by
7.6 K with no announcement.  Nobody notices, because the golden pins the flash
result and not the record's self-consistency, and no gate evaluates Psat(`Tb`).
The case is not hypothetical: the sealed
`tutorials/plant/esterification2sector` mirrors the same ethyl-acetate record,
and its separation sector is a flash whose split those coefficients set.

**WHICH HALF IS WRONG IS NOT DECIDED HERE, deliberately.**  Determining whether
`Tb` or the Antoine set is the bad number requires the primary literature, which
cannot be opened from this environment.  Under the calibration rule
(`development-governance.md` §4) that claim would have to be marked unverified,
so it is not made.  What IS checkable from here, and is asserted: **the record
disagrees with itself, inside its own declared validity window.**  Notably
`H2O2` and `HCHO` both already carry the header *"primary re-citation pending
(IST review)"*.

**Category, per philosophy §5a**: this is a DATA GAP, and possibly a missing
VALIDATION gate.  It is not architectural incompleteness — the identity is
already stated in the engine's own source and merely never applied to curated
records.

## A5. The abstraction count the accretion survey reported is wrong, and the correction reverses its meaning

The accretion auditor reported "70 % of abstract bases (28/40) have ≤3
subclasses; 16 have ≤2; one has zero", with
`src/thermo/electrolyte/AqueousVolumetric.H` named as the zero.  A base with no
implementation would be a strong signature of abstraction built ahead of need —
exactly what a Gall's Law assessment looks for.

**It is wrong.**  `AqueousVolumetricModel` has two implementations:

    src/thermo/electrolyte/AqueousVolumetric.cpp:90   class DiluteVolume : public AqueousVolumetricModel
    src/thermo/electrolyte/AqueousVolumetric.cpp:115  class StandardStateVolumes : public AqueousVolumetricModel

and one pure virtual, not seven.  **The cause is systematic**: the auditor
counted subclasses by grepping headers only, and this project routinely defines
implementation classes inside the `.cpp`, keeping them out of the public
interface.  Every count in that table is therefore an undercount, not just this
one.

**Recount including `.cpp` definitions**, over all abstract bases:

Bases with a SINGLE implementation: `CostingModel` (Guthrie) · `DiffusivityModel`
(Fuller) · `PureFluidModel` (IF97WaterFluid) · `SurfaceTensionModel` (BrockBird)
· `ThermalConductivityModel` (Eucken) · `ElectrolyteModel`.  **Six, not
twenty-eight.**  The rest carry 2 to 42 — `UnitOperation` 42,
`PropertyOperation` 31, `Report` 12, `EquipmentSize` 8, `ActivityModel` 7,
`BatchUnitOperation` 7, `Signal` 6, `CycloneModel` 5, `OuterDriver` 5.

**Why this matters for the consolidation question.**  Six single-implementation
factories in a simulator whose stated purpose is that a student can add their
own model is a set of extension points, not premature abstraction — each is a
model FAMILY (costing methods, diffusivity correlations, surface-tension
correlations) where further members are the obvious next contribution.  The
undercounted version supported the opposite conclusion, and it would have been
the more dramatic one to report.

**Standing lesson for this campaign, and it has now fired twice:** a fleet
finding is evidence, never a conclusion.  Both auditor claims checked so far
needed correction — one materially wrong (this), one materially incomplete
(A4's synthetic stand-ins).  Nothing reaches the architect's findings file
without being re-derived here.

---

## A6. SEVEN gates guard 200 curated records and NONE of them can fail

Found by the gate auditor; **every element re-verified here.**

`data/standards/electrolyte/` was retired (commit `c07f5c9a9`, *"retire the
vestigial data/standards/electrolyte/ dir"*).  Seven gates read a file in that
directory as their FIRST act, and on not finding it print a reassuring line and
`sys.exit(0)`:

    $ ls data/standards/electrolyte/
    ls: cannot access 'data/standards/electrolyte/': No such file or directory

| gate | line | the construct |
|---|---|---|
| `check_pitzer_pairs.py` | 11 | `print("electrolyte/pairs.dat ABSENT -- pairs kind consolidated. OK."); sys.exit(0)` |
| `check_enrtl.py` | 10 | `print("electrolyte/enrtl.dat ABSENT -- eNRTL kind consolidated. OK."); sys.exit(0)` |
| `check_speciation.py` | 10 | `print("electrolyte/speciation.dat ABSENT -- aqueousSpeciation consolidated. OK."); sys.exit(0)` |
| `check_gases.py` | 11 | `print("electrolyte/gases.dat ABSENT -- gasLiquid kind consolidated. OK."); sys.exit(0)` |
| `check_ionexchange.py` | 10 | `print("electrolyte/exchange.dat ABSENT -- ionExchange consolidated. OK."); sys.exit(0)` |
| `check_minerals.py` | 11 | `print("electrolyte/minerals.dat ABSENT -- mineralSolubility consolidated. OK."); sys.exit(0)` |
| `check_mixing.py` | 13 | `print("electrolyte/mixing.dat ABSENT -- mixing kind consolidated. OK."); sys.exit(0)` |

**Everything else in each script sits BELOW that line** — including the ORPHAN
arm, which is the only check on the per-file corpus itself.  The docstrings
promise a flip to "assert the file is ABSENT"; the post-flip arm asserts nothing.

**They are all wired into `bin/runTests`, and the wiring converts exit 0 into
the word PASS** (`bin/runTests:2738-2745`, the pattern is identical for all
seven):

    if "$ROOT/bin/curate/check_pitzer_pairs.py" > /tmp/… 2>&1; then
        printf "PASS  %-40s  (%s)\n" "pitzer-pairs-gate" "$(tail -1 /tmp/…)"

So the suite prints seven PASS lines, each with a sentence explaining why
everything is fine.

**What is left unguarded — counted here, not taken from the auditor:**

| catalogue | records |
|---|---|
| `parameters/Pitzer/pairs/` | 55 |
| `parameters/Pitzer/{theta,psi,lambda,zeta}/` | 65 |
| `chemistry/` `recordType aqueousSpeciation` | 62 |
| `chemistry/` `recordType gasLiquidEquilibrium` | 9 |
| `chemistry/` `recordType ionExchangeEquilibrium` | 6 |
| `parameters/eNRTL/` | 3 |
| **total** | **200** |

Two are **doubly dead**: `check_minerals` also points at
`data/standards/chemistry/mineralSolubility`, which does not exist, and
`check_mixing` at `parameters/Pitzer/mixing`, which does not exist either — its
records live in four sibling directories.  `check_mixing`'s bijection assertion
was therefore already broken BEFORE its input was deleted.

**Failure scenario.**  Any `beta0`, `beta1`, `Cphi`, `alpha1` or `logK25` in
those 200 records can be edited — by a curation script, a bad merge, or a hand
slip — and nothing recomputes or compares it.  The corpus goldens pin the
ANSWERS of the cases that happen to reach a given parameter, so a record no
tutorial exercises is unprotected in both directions at once.
`check_gases`'s own docstring states that it is *"the SOLE net"* for its nine
records, which have *"zero golden coverage"*.

### A6b. An eighth gate: the only failing branch is behind a flag nobody passes

`bin/curate/check_groups.py:94-96`:

    if args.strict and missing:
        return 1
    return 0

`--strict` is opt-in (`check_groups.py:61`).  `bin/runTests:2782` invokes the
script bare.  The gate can print `[check_groups] MISSING a UNIFAC groups block`
and still be scored `PASS groups-gate`.  Its own docstring says *"It is NOT
wired into bin/runTests"* — but it is, at line 2782, as a scored gate.

**Category, per philosophy §5a**: BUG, in the verification machinery.  Not
architectural incompleteness — the correct form exists three files away
(`check_caveat_surface.py:131-134` returns 1 for exactly this condition, saying
*"a check that cannot run must not pass"*).

## A7. THE GIBBS DIRECT MINIMISER REPORTS A CONVERGENCE IT NEVER COMPUTED — and a golden pins the fabrication

The sharpest finding of the campaign.  Verified verbatim.

`src/unitOperations/reactor/gibbsMethod/DirectMin.cpp:205-219`:

    sVector nV, nL;
    if (xBest.empty() || !unpack(xBest, nV, nL) || fBest >= 0.5 * PENALTY)
        return gas;                              // fall back to gas-only

    GibbsEquilibrium eq;
    …
    eq.pi.assign(M, 0.0);                          // not produced by direct min
    eq.twoPhase  = (NL > 1.0e-10 * (NV + NL));
    eq.converged = true;
    eq.iterations = 0;
    eq.residual   = 0.0;
    return eq;

Three separate claims are asserted rather than measured — `converged`,
`iterations`, `residual` — by a routine that ran a multi-start Nelder-Mead and
terminated on a simplex-size criterion, never on a residual.  A fourth,
`pi` (the element potentials), is filled with zeros and the comment says why.

**No announcement exists at any verbosity.**  The whole file is 223 lines and

    $ grep -cE 'cout|cerr|Advisory|throw' src/unitOperations/reactor/gibbsMethod/DirectMin.cpp
    0

There is no verbosity gate to argue about, because there is no message.

**The fabrications then reach the reader as fact.**
`src/unitOperations/reactor/GibbsReactor.cpp:320-325` prints
`Conv.: yes   in 0 Newton-ND iters` and `Final |F|: 0.000e+00`; line 297 emits
`kpis_["lambda_" + elems[j]] = eq.pi[j] * RT_final;` unconditionally, so every
element potential is published as exactly zero.

**And the corpus has baselined it.**
`tutorials/steady/gibbs/gibbs09_wgs_cooled_directmin/expected:15-17`:

    kpi     wgs                    lambda_C         0                1e-4
    kpi     wgs                    lambda_H         0                1e-4
    kpi     wgs                    lambda_O         0                1e-4

The regression suite now ENFORCES the fabricated values.  A future correction
that computes real element potentials will be reported as a FAILURE.

**Failure scenario.**  A student comparing the three Gibbs routes on the shipped
`gibbs09` water-gas-shift case reads `lambda_C = 0 J/mol` beside
`elementPotential`'s genuine λ_C of order −10⁵ J/mol, and — because
`Final |F| = 0.000e+00` is the tightest residual on the page — concludes that
the direct minimiser is the MORE accurate method and that the carbon element
potential of a WGS mixture is zero.

**Why this one matters beyond its own numbers.**  It is the exact failure the
project names as the one it treats most seriously — *"a warning that lets a
wrong answer through with exit code 0"* (philosophy §2a) — except that there is
not even a warning.  It contradicts the founding anti-crutch principle in its
own words: *"the solver ANNOUNCES what it does to converge and never disguises
it."*  And the secondary branch is worse than the primary: on optimiser failure
`return gas` hands back the gas-only equilibrium still carrying
`converged = true` from its own Newton, so a failed two-phase minimisation is
bit-for-bit indistinguishable at the call site from a successful one.

**Category, per philosophy §5a**: BUG.  Emphatically not architectural
incompleteness — `solver/Convergence.H` already exists as the ONE home for a
convergence verdict, and the ADR that created it lists which solvers are wired
to it and which are not, each with a reason.  This routine is not on either
list.
