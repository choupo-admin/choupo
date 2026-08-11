# The evidence-partition slice — executable plan

**Status: PLAN.  Authorised 2026-08-11 as the one final pre-release
`choupoProps` curation slice.  Not started.**

Scope boundary, stated first because it is what makes this admissible while the
engine is frozen: **changes are confined to `src/propertyOps/`, plus curation
tooling under `bin/curate/`, plus one new tutorial case.**  Nothing under
`src/thermo/`, `src/solver/`, `src/unitOperations/`, `src/streams/` or
`src/flowsheet/` is touched.  No physics, no new correlation, no importer.

---

## 1. What already exists, and what is actually missing

The research behind this plan changed its shape twice, so the findings come
first.

**A file-referenced dataset grammar already exists.**  Five ops already read
`dataset "constant/experiments/<name>.dat"`: `vaporPressureFit`,
`heatCapacityFit`, `vleConsistency`, `freezingPoint`, `pitzerActivity`.  The
dataset files carry `columns ( … )` plus named series, and their own header
prose stating source and licence.  **No new data-intake mechanism is needed.**

**A `validation {}` block already exists** — `FreezingPoint.H` calls it *"the
standard `validation {}` block"* — and is read by `freezingPoint` and
`pitzerActivity` to compute an AAD against a measured dataset.

**And that is precisely where the gap is.**  In those two ops the model
parameters come from the *catalogue*, not from a fit in the same run, so the
comparison is honest — but nothing anywhere establishes that the catalogue
parameters were not themselves fitted against that same data upstream.  The
block says *validation* and can only mean *comparison*.  Meanwhile
`fitParameters` and the two `*Fit` ops report χ² that is **always in-sample**,
with nothing marking it as such.

So the missing thing is not a mechanism.  It is a **declared, frozen,
refusable relationship between a fit and the evidence it did not see** — and
the honest name for what exists today is comparison, not validation.

Second finding, minor but to be fixed in passing: the `validation {}` parse is
duplicated in `FreezingPoint.cpp` and `PitzerActivity.cpp`.  Two homes for one
parse; the new shared reader absorbs both.

---

## 2. The contract

### 2a. Grammar

```
evidence
(
    {
        dataset   "constant/experiments/psat-water-lowT.dat";
        series    psat;                       // optional, as today
        identity  { doi "10.xxxx/aaaa"; sha256 "…"; }
        role      fit;
    }
    {
        dataset   "constant/experiments/psat-water-highT.dat";
        identity  { doi "10.xxxx/bbbb"; sha256 "…"; }
        role      validation;
    }
);
```

* **`role` has NO default.**  A defaulted role would silently make every
  dataset a fitting dataset and re-create the in-sample problem invisibly —
  the forward-reaction-`order` lesson, where five readers had five defaults and
  a missing declaration silently left a reactant out of its own rate law.
* `identity {}` carries what is knowable: `doi`, `sha256`, and (later)
  an archive dataset id.  A dataset with no identity is usable but is
  **announced** as unidentified — it cannot participate in the duplicate check.
* The legacy `validation { dataset …; series …; }` block stays readable and is
  converted at the boundary into one `role validation` entry, announced once as
  legacy — the adapter posture the D2 migration already uses.

### 2b. The anchor property, enforced BY CONSTRUCTION

The partition is parsed into an immutable record **before any fitting code
runs**, and the fitting routine is handed **only the fit subset**.  It is not
that the fitter is forbidden to move a validation point; it is that **it is
never given one**.  Enforcement by data flow beats enforcement by rule, and it
is the difference between a contract and a convention.

The dossier additionally records an **FNV-1a fingerprint over the canonical
partition declaration**, reusing the `equilibriumFingerprint` pattern from
`StreamStateIO`, so a partition edited after the fact is detectable rather than
merely discouraged.

### 2c. Refusals, each by name

| # | Condition | Message |
|---|---|---|
| R1 | no dataset carries `role validation` | `VALIDATION REFUSED: No independent experimental evidence remains after fitting.` |
| R2 | a dataset declares no `role` | refuses naming the dataset and both legal words |
| R3 | the same dataset appears in both roles (same path, or same `sha256`, or same `doi`) | refuses naming which identity collided |
| R4 | the validation set is empty after domain filtering | refuses — an empty comparison must never report as a pass |
| R5 | an `evidence ( )` partition declared on an op that performs no fit | refuses, naming that comparison-without-a-fit is not validation |

R1 and R4 are the two that matter most: both are cases where the tempting
behaviour is to report the in-sample number or a vacuous pass, and both are the
`check_true_ions` shape — *a check that cannot run must not pass.*

**R5 shipped 2026-08-11, and it is not the refusal this plan expected.**  The
plan deferred it to "the slice that folds `freezingPoint` and `pitzerActivity`
onto this reader" — an assumption that those ops would eventually become
fitters.  Measuring the operation catalogue rather than remembering it showed
they will not: `pitzerActivity` evaluates curated parameters, `freezingPoint`
derives the curve from the solvent's own record, `estimateComponent` computes
constants from groups.  **All three read data; none regresses against it.**

Two consequences the plan did not foresee, both worth having:

* **choupoProps has exactly TWO pure-property fitters** — vapour pressure and
  heat capacity — **and both already carried the contract.**  There was no
  backlog of fitters to extend it to; the honest scope of "item 7" was
  therefore R5 plus the boundary it draws, not a coverage sweep.  The remaining
  regression in the tool is `fitParameters` (`kind isotherm`, `kind T_bubble`),
  which is pair/phase-equilibrium work and belongs to item 8.
* **R5 is a permanent boundary, not a waypoint.**  An operation with no fit has
  nothing to withhold data *from*, so the held-out claim is *unavailable* to it,
  not merely unproven.  The three ops keep their `validation {}` comparison
  exactly as it was — the refusal governs the CLAIM, never the comparison.

Gate arm: `check_evidence_partition` A11 — all three ops, each through its own
route (one probe would test one route and claim three), each with its
unmodified case still running, and the message required to carry both the
distinction and the remedy.  Sabotage-verified twice.

### 2d. Independence is announced, never adjudicated

Five mechanical facts computed and reported, per the ruling: same/different
DOI, same/different dataset identity, duplicate observations, overlapping
experimental conditions, same source publication.  Only an outright identity
collision (R3) refuses.  Shared publication or overlapping domain is
**announced as a finding for the reviewer**, in the register already used for
*"two independent primaries 0.39 % apart — a finding, not an error."*

---

## 3. The dossier, and where it lives

**Home: `<case>/curation/<component>.dossier`.**

The rationale is structural, and it was checked rather than assumed.  Record
resolution looks in exactly three places — `<case>/constant/<sub>`,
`data/standards/`, `data/local/` (`RecordResolver.H:101,324`,
`Database.cpp:112,163`).  A file under `<case>/curation/` is therefore
**unreachable by the resolver by construction**, which is what makes *"nothing
in the curation dossier is visible to the solver"* a fact about the code rather
than a promise about behaviour.  A case already owns its own outputs
(`converged/`, `reports/`, `*.csv`), so this introduces no new concept.

`generated/` was considered and rejected: every artefact there is regenerable
on demand and gated on staleness, while a dossier whose evidence may sit outside
the repository is not regenerable by a third party — its staleness gate would be
checking something it cannot recompute.

Contents: identity · dataset identities (path, doi, sha256) · the partition and
its fingerprint · fitted parameters · fit residual statistics **labelled
in-sample** · validation residual statistics **labelled held-out** · declared
uncertainty · diagnostics (including the existing pivot-ratio identifiability
estimate) · validation verdict or refusal with its reason · `reviewStatus
unreviewed` · provenance.

---

## 4. The witness

**`tutorials/props/curation/curate01_water_evidence_partition`**, component
**water**, using ops that already exist:

| Property | Op | Evidence | Outcome |
|---|---|---|---|
| vapour pressure | `vaporPressureFit` | two datasets on **disjoint temperature ranges**, one `role fit`, one `role validation` | **VALIDATED**, held-out residuals reported |
| liquid Cp | `heatCapacityFit` | one dataset, all of it `role fit` | **VALIDATION REFUSED** (R1), in-sample χ² labelled in-sample, promotion blocked |

Water is chosen because both ops, the component record and the dataset grammar
already exist; the slice then tests the **contract** and not a new solver.

**Stated limitation, in the case header.**  The datasets are SYNTHETIC —
generated by evaluating Choupo's own curated Antoine correlation, exactly as
`psat-water-synthetic.dat` already is and declares.  A held-out set generated
from the same equation the model fits is a test of the **partition machinery**,
not of extrapolation or of physical accuracy: the residuals will be near-zero
by construction.  This is a STRUCTURAL witness, following the `edwards01`
precedent (*"no number in it is validated against measurement"*), and the header
must say so in those words.  Anchoring the contract against real measurement is
the next slice, and it needs the licensing question settled first.

---

## 5. Promotion

`bin/curate/promote-from-dossier` — a curation tool, not engine.  Takes a
dossier and a named property, and writes into `data/standards/` **only** when:

* the property's verdict is VALIDATED (a refused or in-sample-only property is
  refused for promotion by name);
* the promoter, date and grounds are recorded, in the shape `promotedDespite`
  already uses;
* the promoted record carries the dataset identities, the partition
  fingerprint, and the held-out residual statistics.

The promoted record claims *"validated against dataset X"* and **not** that it
contains what is needed to repeat that validation — the `validated` vs
`validatable here` distinction, carried as prose in this slice.  Making it
machine-readable is explicitly out of scope.

---

## 6. Files touched

| Path | Change |
|---|---|
| `src/propertyOps/EvidencePartition.{H,cpp}` | **NEW** — the one reader: parses `evidence ( … )`, resolves identity, enforces the partition, computes the five independence facts, fingerprints the declaration, raises R1–R5 |
| `src/propertyOps/CurationDossier.{H,cpp}` | **NEW** — assembles and writes `<case>/curation/<component>.dossier` |
| `src/propertyOps/VaporPressureFit.cpp` | consume the partition; fit on the fit subset only; report held-out residuals or the refusal |
| `src/propertyOps/HeatCapacityFit.cpp` | same |
| `src/propertyOps/FreezingPoint.cpp`, `PitzerActivity.cpp` | replace the duplicated `validation {}` parse with the shared reader (behaviour unchanged; the legacy block converts at the boundary, announced) |
| `bin/curate/promote-from-dossier` | **NEW** |
| `bin/curate/check_evidence_partition.py` | **NEW** gate |
| `bin/runTests` | one gate arm |
| `tutorials/props/curation/curate01_…` | **NEW** witness + `expected` |
| `docs/ai/` | the `evidence ( … )` grammar, in the props-authoring surface |

**Not touched:** every other directory under `src/`.

---

## 7. The gate

`check_evidence_partition.py`, sabotage-verified on each arm:

1. **the partition is honoured** — the validation points are provably absent
   from the fitted residual set (checked by value, not by count alone);
2. **R1 fires** when no `role validation` is declared, with the exact message;
3. **R3 fires** on a duplicate identity across roles;
4. **R2 fires** on a missing `role`;
5. **in-sample labelling** — a refused property's χ² is reported as in-sample
   and is not presented as validation;
6. **the solver cannot see the dossier** — the negative: a `choupoSolve` run of
   a case carrying a `curation/` directory resolves nothing from it.

Arm 6 is the one that keeps §3's guarantee true if the resolver ever grows a
search root, and it is worth having precisely because it tests something no
current code path does.

The gate must state its blind spots in its own OK line: it does **not** check
whether two datasets are scientifically independent (§2d), nor whether any
fitted number is physically right (§4's synthetic limitation).

---

## 8. Stopping condition

Adopted verbatim:

> `choupoProps` is consolidated when the fit/validation contract, dossier
> boundary, explicit promotion path, one successful held-out validation and one
> refusal are all executable without introducing a second trust tier or any
> solver-visible partially curated data.

Two things make it checkable rather than aspirational: *no second trust tier* is
verified by the dossier living outside every resolver root (§3, gate arm 6), and
*one refusal* is a gate arm, not a screenshot.

Explicitly beyond this slice and after the release: ThermoML importer, broad
component generation, AI automation, large-scale recuration, machine-readable
external-vs-sealed evidence availability, and anchoring the witness against real
measurement.

---

## 9. Order of work

1. `EvidencePartition` + its refusals, with the gate's R-arms written alongside
2. `vaporPressureFit` consumes it — the VALIDATED half
3. `heatCapacityFit` consumes it — the REFUSED half
4. `CurationDossier` + gate arm 6
5. the witness case + `expected`
6. fold `FreezingPoint`/`PitzerActivity` onto the shared reader (behaviour
   unchanged — their goldens must not move, and that is the check)
7. `promote-from-dossier`
8. docs
9. **one** full regression, attributed to the exact head that lands

Step 6 is deliberately late: it is the only step that touches passing cases, so
it happens once the contract is settled, and its success criterion is that
nothing moves.
