# Stream state — what a `0/<stream>` file may say

`flowsheetDict` declares the **topology**; the numbers live in the stream's own
file under `0/`.  This file documents the grammar those files actually accept.

**Completeness is a contract.**  N streams in the flattened graph means N files
in `0/`; a missing or orphan file is FATAL for `choupoSolve` before any solve
starts.  `bin/choupo-init0` materialises the directory by propagating the
authored inlets through the topology, and refuses to invent a tear seed — that
one is yours.

A stream's ROLE is inferred from the topology, never declared: no producer and
a consumer → inlet; both → internal; a producer and no consumer → outlet.
There is no `fixed` / `guess` / `boundary` mini-language.

---

## 1. The material — exactly ONE of seven canonical forms

A stream's material may be written seven ways.  They are **mutually
exclusive**: two material blocks in one file cannot say which one the author
meant, so the reader REFUSES rather than applying a precedence rule nobody
declared.

| Form | Grammar | When |
|---|---|---|
| A | `componentMolarFlows { benzene 40 kmol/h; … }` | the canonical inventory |
| A′ | `componentFlows { … }` | LEGACY alias of A, fluid-only |
| B | `molarFlow 100 kmol/h;` + `moleFractions { … }` | flow plus composition |
| C | `componentMassFlows { water 900 kg/h; … }` | → molar via MW |
| D | `massFlow 1000 kg/h;` + `massFractions { … }` | mass basis |
| E | `speciesMolarFlows { network <set>; <species> <kmol/h>; … }` | the AQUEOUS-SPECIES basis — a water written in the ions a laboratory measures |
| F | `aqueousAnalysis { … }` | a laboratory MEASUREMENT (§5) |
| G | `totalMassFlow <kg/h>;` | a mass-only anchor |

Note that `molarComposition` / `massComposition` — the spellings a batch or
dynamic unit-op block uses in its `initial {}` / `feed {}` — are **not** stream
keys.  Two readers, two vocabularies.

**E and F are different KINDS of claim, and that is why they are two forms.**
`speciesMolarFlows` is an INVENTORY that has already been reconciled: charge
closure is a contract there, and a violation is refused.  `aqueousAnalysis` is
a MEASUREMENT: charge closure is the thing to be reconciled, in the open,
within a declared limit.  Inventory is not measurement.

### The optional `material {}` wrapper

Any of the seven may be wrapped:

```
material
{
    componentMolarFlows { water 110.8 kmol/h; }
}
```

Declaring the wrapper AND a bare material form at top level is ambiguous and
REFUSES, naming the offending top-level keys.

---

## 2. The state keys

```
T               313.15 K;
P               101325 Pa;
vaporFraction   0.3039835731;    // optional pin, see below
phase           gas;             // optional pin, alternative to the above
category        LP_steam_200kPa; // optional, for utility aggregation
```

`vaporFraction` is spelled in full — **`vf` is not a dict key** (it is the
field name inside `ProcessStream`), and there is no `state saturatedVapour;`
keyword; both belonged to the retired `flowsheetDict streams {}` block.

**`T` + `P` is the implemented closure.**  `(P, vaporFraction)` and
`(T, vaporFraction)` are recognised and their flash resolution is DEFERRED, so
a declared `vaporFraction` is a PIN carried into the solve (it raises
`phasePinned`, which energy-pricing consumers ask instead of testing `vf == 0`)
and not a spec that solves for `T`.  All three together are carried, not
refused, and the pin is not checked against the flash — see `pitfalls.md`.

---

## 3. `phases {}` — a decomposition, never a second material

`componentMolarFlows` stays the OVERALL material, all phases, and the apparent
basis is never disturbed.  A `phases {}` block decomposes it and **must sum
back to it exactly**; splits close by SUBTRACTION (one side stored, the other
derived) so two roundings cannot drift apart.

The three names are `aqueous`, `organic`, `solid`, and each is checked against
what it names:

* a **precipitate is a PHASE, not a species** — a mineral listed among the
  aqueous species reports a crystal as dissolved, and closes, which is why the
  error is invisible.  The owning component comes from its own `solidPhases {}`
  record, never matched by name;
* a **size distribution belongs to its population** — inside `phases.solid`,
  never at the top level, where it could only describe "the combined solid";
* outlets bind POSITIONALLY, so an `aqueous` outlet holding less solvent than
  the `organic` one is refused, and the name `aqueous` is refused outright in a
  system with no solvent.

---

## 4. `speciation {}` — the second basis

Where the package resolves ions, a stream carries BOTH bases: the apparent
components (which ARE the state) and the species decomposition.  **The inlet
included** — a feed nobody speciates is exactly the stream a student compares
an outlet against.

```
speciation
{
    network   ( carbonate );
    basis     stoichiometric;
    origin    "reported:postSolve";   // or "solved:<unit>" / "transported:<unit>"
    solvedAtT 313.15 K;
    pH        7.907745048;

    HCO3    0.005357769121 kmol/h;
    Ca      0.003988768889 kmol/h;
    …
}
```

* It decomposes the **liquid**.  A precipitated crystal stays in the solid
  phase; dissolving it here is an error.
* It attaches to the AQUEOUS material: top level when there is one liquid (the
  stream *is* that material), inside `phases.aqueous` when a second liquid or a
  solid is named.
* The reader VERIFIES `m = A n` against the same declared bridges the writer
  used, so the block closes by construction.  A block declaring no `network`
  and no `basis` is refused; so is a case with neither a network nor any
  declared bridge (names that answer to nothing).
* With no equilibrium network the block is COMPLETE DISSOCIATION through each
  component's declared bridge — `network ( completeDissociation ); basis
  stoichiometric;` and **no pH**, because there is no H⁺ network to solve one
  from and a neutral 7 would be a number with no model behind it.
* `origin` says who produced it, and a CARRIED block also states `solvedAtT` —
  an outlet at 332 K may carry a block solved at 313 K, and saying
  "transported" without saying from where leaves the reader to assume the two
  agree.
* A molecular case gets NO block: one basis is its whole structure.

---

## 5. `aqueousAnalysis {}` — the inlet that is a measurement

This is the form for what a laboratory actually sends: milligrams per litre,
with uncertainties, partly on surrogate formulae, and **not closing in
charge**, because every number on the sheet carries measurement error.

```
aqueousAnalysis
{
    network            carbonate;   // WHICH chemistry set these names belong to
    basis              mg/L;        // ...and what KIND of quantity they are
    defaultQualifier   dissolved;   // what the sheet's numbers MEAN

    sampleTemperature  293.15 K;

    density   { value 998.4 kg/m3;  provenance measured; }
    volumetricFlow     2.0 m3/h;    // the flow anchor -- one, never two

    pH                 7.6;         // MEASURED, carried; not a balancing variable
    closureTolerance   0.5 percent;

    reconciliation
    {
        method             adjustChloride;   // sugar for adjustSingleSpecies + Cl
        maximumCorrection  10 percent;
    }

    analytes
    {
        Ca    { value  84.0 mg/L;  uncertainty 2 percent; }
        Cl    { value  45.0 mg/L;  uncertainty 5 percent; }

        alkalinity
        {
            species         HCO3;     // what the row actually reports
            value          143.0 mg/L;
            as             CaCO3;     // ...on the CaCO3 mass basis
            perFormulaUnit   2;       // 2 HCO3 per CaCO3 -- a CONVENTION, declared
            uncertainty      4 percent;
        }
    }
}
```

Five things the engine will not infer for you:

1. **`defaultQualifier` has no default.**  `dissolved` computes.  `total` and
   `freeIon` parse, and then REFUSE at resolution — they are named so a sheet
   can be transcribed faithfully, not so the engine can guess what a number
   means.  A per-analyte `qualifier` overrides the default for one row.
2. **The density route is required and explicit.**  `mg/L` is per VOLUME and a
   stream carries a FLOW; two facts close the gap:
   * `provenance measured;` with a `value` — the laboratory's number;
   * `provenance derived;` **plus** `volumetric { method <name>; }`, which
     selects a formulation from the volumetric-model slot:
     `standardStateVolumes` (ideal V^E = 0 mixing on each species' cited
     infinite-dilution standard-state volume) or `diluteVolume` (the
     zero-solute-volume closure, weakest and honest about it).  There is no
     default — the formulation is a claim about the physics, and it is yours.
   * `provenance derivedDiluteVolume;` is readable SUGAR for the pair, expanded
     aloud;
   * **`provenance iterative;` is REFUSED**, by name.  The only closure the
     engine owns is independent of ρ, so an iteration over it would be a direct
     calculation wearing a loop.  A real fixed point needs a
     composition-dependent volume model, which does not exist yet, and the
     refusal states that rather than hiding it.
3. **One flow anchor, never two.**  `volumetricFlow` (or an equivalent single
   anchor) sets the scale; a second one would over-determine it.
4. **The reconciliation rule is declared or the case refuses.**  If the charge
   balance error exceeds `closureTolerance`, the two legal remedies — declare a
   rule, or fix the analysis — are the author's to choose.  A rule bounds how
   far it may move a species (`maximumCorrection`, in percent of the reported
   value or in σ of its declared uncertainty; a single-species rule bounds its
   own correction).
5. **This file is layer 1 and is NEVER rewritten.**  Reconciling into the
   measurement would destroy the measurement, and the next run would reconcile
   the reconciliation.

---

## 6. `calculated {}` — engine output, in `converged/`, never authored

The solved state is written to `converged/<stream>` (not `final/`, not a
number).  Beside the material and the `speciation {}` block it carries
`calculated {}`, which is where the engine records what the authored file
resolved to.

**`analysisReconciliation`** holds the measurement layer: the reported values,
the corrections, `chargeImbalanceBefore` / `After`, the method as written and
as expanded.  Every quantity in it is a MEASUREMENT or the distance a
measurement had to move — **not one of them is a chemistry result**.  Three
structural marks keep the two apart without the reader having to remember
which is which: a corrected row carries `reportedValue` and nothing in
`speciation {}` ever can; corrections are quoted in `correctionSigma`, a
measurement-quality unit meaningless for a calculated quantity; and the two use
different KEY SPACES — sheet labels (`alkalinity`, `totalHardness`) here,
species ids (`HCO3`, `CaCO3aq`) there.  A label is not a species.

**`equilibriumState`** is a CROSS-REFERENCE, not a copy:

```
equilibriumState
{
    target       speciation;
    fingerprint  "18815332ce905004";
}
```

The fingerprint is recomputed from the canonical `speciation {}` block of the
same file on every read.  Edit the state and leave the reference behind, and
the mismatch REFUSES — a reference must never outlive what it references.
Deleting the canonical block refuses too; so does one that cannot be resolved
unambiguously within the sealed snapshot.

**`densityDerivation`** records a derived density term by term — the water
density at T, each species' contribution with the standard-state volume and
the convention profile it is stated on, the solute volume fraction and the
solute mass — so the sum can be re-derived by hand.  Single-ion volumes are
CONVENTIONAL (V⁰(H⁺) = 0 in `MilleroConventional-v1`); only electroneutral sums
are physical, which is exactly why the reconciliation closes charge first: a
convention shift adds λ·zᵢ to every V⁰ᵢ and cancels over a charge-closed
inventory.  Mixing two conventions in one sum is refused — the result would be
neither convention's number.

---

## 7. The other state directories

| Directory | Holds |
|---|---|
| `0/` | the COMPLETE initial state, one file per stream |
| `converged/` | the steady solution |
| `iterations/` | optional numerical history — NEVER physical time |
| `0.01/` `0.02/` … | physical transient snapshots |
| `design/` | equipment realisation |
| `economics/` | cost and value |

Inter-sector streams are stored ONCE, owned by the producing sector.  Drilling
into a sector changes the DOMAIN, not the stream: a producer leaving the domain
flips a stream's role from internal to inlet, and the child `0/` is
materialised from the parent's persisted state — `converged/` by default, never
a silent "latest".

Full contract: `docs/architecture/stream-state-architecture.md`.
