# flashComplex — design decisions (2026-07-27)

This draft **merges** the chemical-potential proposal reviewed on 2026-07-27
with the doctrine already settled in this repository.  Vítor's judgement was
that the proposal's dictionary reads better than the earlier Choupo draft —
that judgement is accepted, and the proposal's *form* is the base here.  What
follows is every place the merge changed something, and why.

Nothing here is code.  The case still does not run.

---

## Adopted from the proposal (its form is better)

| adopted | why |
|---|---|
| **chemistry travels with the component** | `CO2.dat` now reads like a textbook page about CO₂: the species it brings, its three equilibria, its sources.  The earlier draft scattered the same information across six files the student had to hunt for. |
| **`equilibriumCondition zeroAffinity`** | states the physics (Σνᵢμᵢ = 0) instead of a number.  Homogeneous reaction, phase transfer and precipitation become the *same* condition on different stoichiometries. |
| **`componentDiscovery fromFeedAndDeclaredPhases`** | kills the `components ( … )` list, and with it the question "must a solid that is never fed be listed?" (Q3).  It cannot be forgotten because it is not written. |
| **`approximation { excludes (…) reason "…" }`** | clearer than the earlier `admits (…)`: it names what is being *left out*, which is the honest direction for an approximation. |
| **`reporting { … }` block** | makes the glass-box output a declared property of the case, not a verbosity accident. |
| **no student-authored `chemistryDict`** | settled: the closure assembles, the `[chemistry]` block prints.  See the evidence below. |

## Changed, with reasons

### 1. Equilibrium constants stay storable as primary data

The proposal's decision list says *"no K(T), pK, logK, Ksp or Henry
correlation is stored as primary data"* — everything derived from species
standard-state thermodynamics.  Its own §6.2 contradicts this by allowing
`equilibriumSource explicitK`; the merge keeps §6.2 and drops the ban.

The reason is precision.  `K = exp(−ΔrG°/RT)` with RT = 2.48 kJ/mol at 298 K,
so small errors in ΔGf are large errors in K.  Calcite:

| route | pKsp |
|---|---|
| from ΔGf: (−553.58) + (−527.81) − (−1129.1) = +47.71 kJ/mol | **8.36** |
| measured | **8.45** |

A 0.7 kJ/mol accumulation across three ΔGf values — entirely typical — is a
32 % error in the solubility product.  To match the measured precision
(±0.02) every ΔGf would need ±0.06 kJ/mol, which does not exist for aqueous
ions.  Worse, the chain of evidence often runs the other way: ΔGf(acetate,
aq) was itself obtained *from* the measured pKa, so deriving the pKa back
from it is a circle with added noise.  Single-ion standard properties are
also not measurable at all — they exist only relative to a convention
(here `protonZero`, declared in `species/H.dat`).

This also matches doctrine already settled here: the salt-formation decision
(2026-06-29) derives a solid's formation enthalpy *from* the measured heat of
solution, because the reaction quantity is the better-measured one.

**The merge keeps both routes and makes the relation explicit.**  There is one
equilibrium condition; the standard part Σνᵢμᵢ° can be parameterised either by
a measured K (`authority measuredK`) or by species data
(`authority speciesData`), because `Σνμ° = −RT ln K` is an identity, not an
approximation.  Every reaction declares its authority; when both exist the
engine prints both and the difference.

### 2. The cross-check is not decoration — it already finds a defect

Running that comparison over today's catalogue (van 't Hoff `dH` in the K
record versus Σν·hfAq from the species records):

| reaction | dH stored | Σν·hf | diff | error in log K at 358 K |
|---|---|---|---|---|
| CO3-formation | 14 899 | 14 850 | 49 | 0.001 ✓ |
| water-dissociation | 56 400 | 55 840 | 560 | 0.016 ✓ |
| **HSO4-formation** | 16 108 | **21 930** | **−5 822** | **0.171** ⚠ |

Only **3 of 59** reactions are checkable, because the neutral secondary
species (CO2aq, NH3aq, H2Saq, HAc…) carry no formation datum.  That is the
quantified curation debt, and it is why every such species record in this
draft says `status curationRequired` with the consequence spelled out.

### 3. Cross-family reactions get their own home — `constant/complexes/`

The proposal's own open-questions list asks *"how the catalogue deduplicates
species referenced by more than one component file"*.  This is that problem,
and it is not hypothetical: the reachability closure over this case activates
three calcium ion pairs

```
Ca2+ + HCO3-  = CaHCO3+
Ca2+ + CO3-2  = CaCO3(aq)
Ca2+ + H2O    = CaOH+ + H+
```

which belong to **neither** `CaCO3.dat` nor `CO2.dat`.  Putting them in one of
them makes that component silently claim the other's family; putting them in
both gives the value two homes (the arity sin).  They live in `complexes/`,
exactly as pair-dependent *parameters* (NRTL, Wilson, Henry) live in a pair
catalogue rather than inside a component — the same axiom applied to
reactions.

### 4. Species identifiers stay `H`, `HCO3`, `Ca` — not `H_p1`, `HCO3_m1`

The mangled form was removed from this corpus by the F2 campaign
(2026-07-26).  The problem it solves — telling Na⁺ from sodium metal — is
already solved more strongly by strong typing (`ComponentId` / `SpeciesId` /
`SolidId`, no implicit conversion, so the confusion is a compile error).  The
readability it wants is delivered by the presentation formula every record
carries (`formula "HCO3-"`).  Renaming would cost 41 species records, 59
chemistry records and every sealed case, to buy what the `formula` field
already gives.

### 5. CO₂ keeps the aggregate species — and explains itself

The proposal splits dissolved CO₂ into explicit H₂CO₃ with three reactions.
The physics does not allow that split with the tabulated constants:

```
K_hyd = [H2CO3]/[CO2(aq)] ~ 1.3e-3        (0.13 % of dissolved CO2)
pKa(true H2CO3)           ~ 3.45
pK1(aggregate CO2*)        = 3.45 + 2.89 = 6.34   (measured 6.352)
```

Every tabulated pK₁ = 6.35 — including the catalogue's — belongs to the
**aggregate** CO₂* = CO₂(aq) + H₂CO₃, because no analytical method separates
them.  Declaring explicit H₂CO₃ while keeping 6.35 is wrong physics; declaring
it correctly needs both K_hyd and pKa(H₂CO₃) curated from primaries plus a
re-curation of the whole carbonate ladder (the proposal's own `H2CO3.dat`
says `status curationRequired`, which would block the case indefinitely).

The merge keeps the aggregate, **names it honestly**, and prints the box
above in `CO2.dat`: the student gets the textbook picture *and* the convention
the numbers actually obey.  That is more glass-box than either alternative.
The explicit variant is named as legitimate future work, not drafted.

---

## The evidence that settled auto-assembly

Seeded with this case's master species and fed gases, the reachability
closure over the curated network activates **15 equilibria** and brings in
**10 species nobody wrote**:

```
aqueous:  CO2aq  CO3  CaCO3aq  CaHCO3  CaOH  H2Saq  HAc  NH3aq  OH
gas-liquid: CO2  NH3  H2S  N2  aceticAcid  water
```

The first hand-written draft of this case — written by someone who knew the
chemistry — declared **6** aqueous reactions.  The closure finds **9**.  The
three missed were the calcium ion pairs above, which sequester free Ca²⁺ and
therefore change how much calcite dissolves.

Hand declaration is not more rigorous than assembly; it is less.  What
assembly lacks is not correctness but **visibility** — which is what the
`[chemistry]` block is for, and it is output, not architecture.

## Catalogue defect found while drafting

`data/standards/chemistry/CaHCO3-formation.dat` holds `logK25 −4.059;
dH 158117.5` where its own cited source (phreeqc.dat) holds `log_k 1.106,
delta_h 2.69 kcal`.  The siblings confirm it is out of family:

| pair | log K₂₅ | dH [J/mol] |
|---|---|---|
| MgHCO₃⁺ | +1.07 | 3 305 |
| SrHCO₃⁺ | +1.18 | 25 313 |
| BaHCO₃⁺ | +0.98 | 23 263 |
| **CaHCO₃⁺** | **−4.06** | **158 118** |

Consequence: the pair effectively never forms → free Ca²⁺ overestimated →
calcite saturation overestimated; and the absurd dH swings log K by +4.6
units between 298 and 358 K.  **The standards record is not edited by this
draft** — correcting it re-seals ~34 cases and belongs to its own reviewed
wave.  `complexes/CaHCO3-formation.dat` uses the corrected value and carries
the full evidence in its header.

This class of error is mechanically detectable (a value that is orders of
magnitude away from its chemical family) and is proposed as a curation gate.

---

## Still open

- **Q1** phase tags: kept fully explicit on every stoichiometric term.
- **Q2** settled: `members` + `approximation { excludes … reason … }`.
- **Q3** settled by `componentDiscovery`.
- **Q4** settled: the Raoult legs carry no K, so they stay with the phase
  models — but each component now *says so* in a `vapourLiquidEquilibrium`
  block, so the student never wonders where the water vapour came from.
- **Q5** settled: the constant is declared inside `standardGibbs` with its
  authority; there is no separate "declare and verify" ceremony.
- **Q6** settled: no new unit type; `isothermalFlash` stays.
- **Open**: the projection of the converged aqueous state back onto stream
  components (non-unique by (c−1)(a−1) degrees of freedom for c cations and
  a anions) needs a declared convention plus a loud refusal when the declared
  component set cannot span the ion totals.  Physics is unaffected — elements
  and charge are what cross the boundary — but the *labels* are a choice, and
  a choice must be declared.
