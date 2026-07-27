# flashComplex — design decisions

*Draft opened 2026-07-27. This document tracks the case's design, including
the parts of it that were reversed. Nothing here is engine code; the case
still does not run, and the reasons it does not are the deliverable.*

---

## 1. What the case is

One `isothermalFlash` at 308.15 K and 2 atm, with **two outlets** — a vapour
line and a bottoms line — resolving **five phases** inside the vessel:

| phase | contents |
|---|---|
| vapour | N₂ (inert, guarantees V > 0) + CO₂ + NH₃ + H₂S + H₂O + ethanol + benzene + acetic acid (with its dimer) |
| aqueous liquid | water solvent; full carbonate, ammonia, sulfide and acetate networks; Ca²⁺; dissolved ethanol and N₂ |
| organic liquid | benzene solvent; by declared admission, only ethanol may join it |
| solid | calcite CaCO₃ — fed as a suspension, may dissolve or grow |
| solid | NH₄HCO₃ — never fed; appears if the NH₃ + CO₂ loading crosses saturation |

The two solids share the carbonate ladder: one pH couples both saturation
indices, the gas-phase CO₂ moves them, and the ammonia buffers the pH.
Nothing in this case is decorative.

**Two outlets, not five.** An earlier draft declared one outlet per phase.
That confused what the *solver* resolves with what the *equipment* has: a
flash drum has a vapour nozzle and a bottoms nozzle, and the aqueous liquid,
the organic liquid and both solids leave together through the second one.
Separating them needs a decanter and a filter — units with their own records.
The internal phase split is a **result**, reported in the bottoms stream's own
file. It is not topology.

---

## 2. The rewrite of 2026-07-27, and what it reversed

The first draft of these dictionaries was written from the *shape* of an
external proposal rather than from the corpus. It parsed, it read well, and
it was wrong in a way no gate caught — because the 25 `check_*` gates guard
`data/standards/` and `tutorials/`, and this draft lives in `docs/design/`,
the one directory with no net. The rewrite translates the design **into** the
corpus form. Six things changed.

### 2.1 Chemistry left the component records

The first draft put each component's equilibria inside its own `.dat`, in an
invented `aqueousChemistry { reactions ( … ) }` block. It reads beautifully —
`CO2.dat` became a textbook page about CO₂ — and it is the wrong home.

A reaction coupling two families belongs to neither of them. `Ca²⁺ + HCO₃⁻ =
CaHCO₃⁺` is not a fact about calcium carbonate and not a fact about carbon
dioxide; putting it in one makes that component claim the other's family, and
putting it in both gives one value two homes. This is the same axiom that
keeps NRTL and Henry parameters in pair tables rather than inside substances,
applied to reactions instead of parameters.

So chemistry lives in `constant/chemistry/`, **one file per reaction**, named
by the reaction. The component record keeps only the two lines that say which
network it joins and how it maps onto that network's masters:

```
aqueousSpeciation  carbonate;
aqueousMapping ( { species HCO3; nu 1; } { species H; nu 1; } );
```

The payoff is visible in the count: of the fifteen reaction records this case
reaches, **thirteen are byte-for-byte mirrors of the curated catalogue**. Only
two are new. Under the first draft all fifteen would have been re-authored
inside component files, and every one of them would have been a fresh chance
to drift from the catalogue.

The rewrite proved the point immediately: mirroring instead of re-authoring
caught six pure-component constants the first draft had **invented** — H₂S's
critical temperature, acentric factor, boiling point, liquid molar volume and
its entire Antoine set, plus acetic acid's latent heat. Every one of them was
plausible and every one was wrong.

### 2.2 `chemistry/aqueousComplexes/` was flattened

The first draft gave the cross-family ion pairs their own subfolder. The
argument against it is one of its own contents: is `CaOH-formation.dat` an
acid-base reaction or a complexation? Both readings are defensible, so every
author filing it has to guess and every reader has to guess the same way.

This repeats a mistake the project already corrected once — `components/` was
kept physically flat (settled 2026-06-07) because a record can belong to
several categories at once and the kind already lives inside the file. The
subfolder is gone; `chemistry/` is flat, and the physics that groups reactions
is a query, not a directory.

### 2.3 Six ceremony fields were deleted

`equilibriumCondition zeroAffinity`, `componentDiscovery
fromFeedAndDeclaredPhases`, `crossCheck`, `introduces`, `reporting { … }` and
`formulation`-as-written each had exactly one possible value. Vítor's test:
*a hi-fi amplifier has one volume knob* — **a field with only one possible
value is not a setting, it is doctrine written in the wrong place.** Say it
once in the docs and delete the field.

`introduces` was worse than redundant. It listed the species a component
brings, which is derivable from its reactions' stoichiometry — so the day the
two disagreed, nothing said which one wins.

One of the six was reinstated on inspection: **`formulation` is a real knob**,
carrying six distinct values across the corpus (`gammaPhi`, `gammaGamma`,
`phiPhi`, `electrolyteGammaPhi`, `diluteSolution`, `consistent`). It had been
listed as ceremony in `check_record_form.py`, which would have failed the
first design draft that used the actual manifest form. Fixed in the gate, with
the corpus counts recorded beside it.

### 2.4 `role` came off the components — and the engine noticed

Vítor's ruling: **role is a property of the (component, phase) pair, not of
the substance.** Water is the solvent of the aqueous phase and would be a
solute in an organic one; storing that on the substance is a category error.

Removing it produced a concrete engine finding within seconds of the first
lint. `src/thermo/Component.cpp:198` defaults `role_` to `volatile` and then
refuses any volatile component with no `vaporPressure` block:

```
ERROR: Component 'NH4HCO3': no 'vaporPressure' block.
```

The refusal is correct in form — named component, named field, remedy stated —
and it asks the *substance* a question only the (component, phase) pair can
answer. The case already answers it: `constant/thermoPhysPropDict` declares

```
volatiles ( CO2  H2S  N2  NH3  aceticAcid  benzene  ethanol  water );
```

and NH₄HCO₃ and CaCO₃ are correctly absent. The datum the engine needs exists
in the right home, one layer above where it is being read.

This is the design driver working as intended: a ruling made in conversation
now has a running counter-example. **No engine change is made here** — the
retirement of `role` is a named roadmap item (property-architecture 6b.3) and
91 records still carry it. The finding is recorded, not acted on.

### 2.5 Derived species lost their files

Identity has one home. A derived neutral or complex declares its charge and
formula **inline** in the record that forms it (`ion "H2CO3"; z 0;`); it gets a
file under `constant/species/` only if it carries independent standard-state
data. The first draft wrote eighteen species files where nine were warranted —
`CO2aq`, `H2CO3`, `NH3aq`, `HAc`, `H2Saq`, `CaHCO3`, `CaCO3aq` and `CaOH` are
each defined completely by their formation reaction.

### 2.6 The components list came back

The first draft deleted `components ( … )` on the grounds that a list which is
not written cannot be forgotten. But the manifest is the case's *declaration*
of its property system, and the sealed-case contract rests on it. The corpus
form has it; the draft now has it.

---

## 3. Decisions that survived the rewrite

### 3.1 Equilibrium constants stay storable as primary data

There is one equilibrium condition, Σνᵢμᵢ = 0. The standard part Σνᵢμᵢ° can be
parameterised either by a measured K or by species standard-state data,
because **`Σνμ° = −RT ln K` is an identity, not an approximation** — the two
are measurements of one quantity, not rival theories.

The case for keeping measured K is precision. With RT = 2.48 kJ/mol at 298 K,
small errors in ΔGf are large errors in K:

| route to calcite pKsp | value |
|---|---|
| from ΔGf: (−553.58) + (−527.81) − (−1129.1) = +47.71 kJ/mol | **8.36** |
| measured | **8.45** |

A 0.7 kJ/mol accumulation across three ΔGf values — entirely typical — is a
32 % error in the solubility product. Matching the measured precision (±0.02)
would need each ΔGf to ±0.06 kJ/mol, which does not exist for aqueous ions.
Worse, the evidence often runs the other way: ΔGf(acetate, aq) was itself
obtained *from* the measured pKa, so deriving the pKa back from it is a circle
with added noise. And single-ion standard properties are not measurable at all
— they exist only relative to a declared convention.

This matches doctrine already settled here: the salt-formation decision
(2026-06-29) derives a solid's formation enthalpy *from* the measured heat of
solution, because the reaction quantity is the better-measured one.

### 3.2 Authority is declared per reaction, never by reaction type

The authority is a property of the **data available for that reaction**, not
of its category. A badly measured acid-base constant with well-reconciled
species should follow the species.

Both industrial simulators do exactly this — Aspen's Chemistry lets each
reaction choose K-vs-Gibbs, DWSIM's reaction sets the same — two independent
implementations arriving at it without contact.

Where the rewrite differs from the first draft is in **how often the field is
written**. The first draft put `authority measuredK` on every reaction. A
record carrying its own measured `logK25` got that number from a measurement
of its own reaction; there is nothing to declare, and writing it fifteen times
is fourteen copies of the same word. The field now appears on exactly the two
records whose number came from somewhere else:

* `chemistry/H2CO3-formation.dat` — `derivedFromReactions`, the ladder split;
* `chemistry/H2S-dissolution.dat` — `derivedFromReactions`, the fused-record
  decomposition.

The third value, `speciesData`, has no instance in this case. `NH4HCO3.dat`
would have been it, and instead it refuses (§3.4) — which is the more honest
outcome, since declaring an authority whose data does not exist is a promise
the record cannot keep.

### 3.3 The CO₂ ladder is split — Vítor's ruling, 2026-07-27

The first draft kept the aggregate CO₂\* and explained it in a box. Vítor
overruled: *"pode ficar CO₂ dissolvido e H₂CO₃; o CO₂ dissolvido calcula-se com
a constante de Henry."* The split shipped.

Four rungs, one record each:

```
CO2(g)        = CO2(aq)        CO2-dissolution.dat    Henry
CO2(aq) + H2O = H+ + HCO3-     CO2aq-formation.dat    aggregate, MEASURED
H+ + HCO3-    = H2CO3          H2CO3-formation.dat    DERIVED
HCO3-         = H+ + CO3-2     CO3-formation.dat      pK2
```

Two facts the aggregate cannot show, and which the split buys for one record:

1. true carbonic acid is **0.13 %** of dissolved carbon (K_hyd ≈ 1.3 × 10⁻³)
   but is a **moderately strong acid, pKa 3.47** — the famous 6.35 is weak
   only because almost none of the CO₂ has hydrated;
2. that hydration is the **kinetic bottleneck** of CO₂ absorption
   (k ≈ 0.04 s⁻¹ at 25 °C) — the reason carbonic anhydrase exists in blood and
   the reason capture plants use amine promoters rather than plain water.

**Arity.** K_hyd · Ka(H₂CO₃) = K₁\*, so only **two of the three** may be
primary. The aggregate is what every experiment measures — no analytical
method separates CO₂(aq) from H₂CO₃ — so it and K_hyd are the primaries and
pKa(H₂CO₃) = −6.352 + 2.886 = **3.466** derives.

**How exactly the split reproduces the aggregate** (corrected 2026-07-27; the
first version of this section claimed *exact by construction*, which is
false and read as a theorem). The catalogue's 6.352 was measured for the
*sum* CO₂(aq) + H₂CO₃. Assigning it to CO₂(aq) alone and then adding H₂CO₃
on top makes the split network reproduce an aggregate of

```
log(10^6.352 + 10^3.466) = 6.352564      →  +0.000564 log units
```

against a stated uncertainty on pK₁\* of **±0.002**. So the split sits at
about a quarter of the measurement's own uncertainty, and no number a student
cites moves. It is *inside the noise*, not exact.

Making it exact needs one subtraction — CO₂(aq) re-baselined to
`6.352 − log(1+10^−2.886) = 6.351436`, H₂CO₃ to `3.465436`. **Deliberately
not done.** That would fork a curated catalogue value inside a case, for a
correction four times smaller than the uncertainty of the value being
forked: a second home for a number, bought with nothing measurable. The
thirteen byte-exact mirrors are worth more than 0.0006 log units.

If the hydration constant is ever curated from a primary — it is INTERIM
today — the re-baselining is done **there**, once, in the catalogue, and
every case inherits it. That is where a correction of this size belongs.

The split therefore changes what the student *sees*, and moves what the
experiment *says* by less than the experiment can tell.

The derivation rides in the record's `source` string, which is the corpus's
own idiom for a re-baselined value (`CaHCO3-formation.dat` documents its
`11.435 − 10.329 = 1.106` the same way). One home, auditable.

### 3.4 Missing data is a named refusal

`NH4HCO3.dat` is the exemplar and it is the reason the case cannot run even
once the second-liquid slot exists. Both its species are already in the
network, so one number would close it — and neither route to that number is
available:

* the **solid formation datum** is not in the catalogue;
* the **measured solubility product** exists only as an order of magnitude
  read off the ~220 g/L (25 °C) solubility, logK₂₅ ≈ 0.25 — a full log unit of
  uncertainty on a solid whose *presence or absence* changes the phase set.

So the record stores neither and refuses, naming both remedies. It does not
quietly run on the weak number and it does not silently drop the solid.
Compare `CaCO3.dat`, where every constant is measured to 0.01 log units.

The same discipline applied to the pair tables: `constant/parameters/`
contains no `.dat` files at all, and its README names the four missing pairs
(`benzene-ethanol`, `aceticAcid-water`, `benzene-water`, against the one
curated `ethanol-water`) rather than letting a γ = 1 fallback price a strongly
non-ideal backbone as ideal.

### 3.5 The cross-check already finds a defect

Comparing the van 't Hoff `dH` in each K record against Σν·hfAq from the
species records:

| reaction | dH stored | Σν·hf | diff | error in log K at 358 K |
|---|---|---|---|---|
| CO3-formation | 14 899 | 14 850 | 49 | 0.001 ✓ |
| water-dissociation | 56 400 | 55 840 | 560 | 0.016 ✓ |
| **HSO4-formation** | 16 108 | **21 930** | **−5 822** | **0.171** ⚠ |

Only **3 of 59** reactions are checkable, because the neutral secondary
species carry no formation datum. That is the quantified curation debt.

The fatal cut stays **unset** in the first pass, deliberately. A threshold set
before the distribution of real disagreements is known would let the gate
choose which cases die — HSO4 at 5.8 kJ/mol would take the sulfate cases with
it. Measure first, then set fatal.

### 3.6 No new unit type

A flash holds T and P and splits into whatever phases the declared thermo
world admits. A `multiphaseReactiveFlash` would force gatekeeping
classifications — which components *may* enter which flash — and give the
student two flashes to learn. The phase repertoire grows in the formulation,
never in the unit.

### 3.7 Identifiers stay `H`, `HCO3`, `Ca`

The mangled form (`H_p1`, `HCO3_m1`) was removed by the F2 campaign
(2026-07-26). The problem it solves is already solved more strongly by strong
typing — `ComponentId` / `SpeciesId` / `SolidId` with no implicit conversion,
so the confusion is a compile error. The readability it wants is delivered by
the `formula` field every record carries. Renaming would cost 41 species
records, 59 chemistry records and every sealed case.

New hard rule, kept: **no human-facing output shows a bare internal
identifier** — every equation, table and message uses the presentation formula
with its phase, `H+(aq)`, `CO3-2(aq)`.

---

## 4. Findings this case has produced

| # | finding | status |
|---|---|---|
| 1 | `CaHCO3-formation.dat` held `logK25 −4.059; dH 158117.5` against its own cited source's `1.106 / 2.69 kcal`, and sat 51 and 12 MADs from its Mg/Sr/Ba siblings | **CORRECTED** in standards; the family-outlier gate now catches the class |
| 2 | Davies warns at I > 0.7 while its own message claims a ~0.5 domain — a silence band where the corpus's own seawater case (I = 0.682714) lives | confirmed in `SpeciationSolver.cpp`; one-line fix, **not yet made** |
| 3 | pH is printed with no scale declared; at I = 0.68 the free/total/NBS scales differ by 0.1–0.3 units | confirmed; **not yet fixed** |
| 4 | `role` is read at substance level (`Component.cpp:198`) where the phase membership in `volatiles ( … )` already answers it | **new, this rewrite** (§2.4) |
| 5 | `formulation` was listed as a single-valued ceremony field in `check_record_form.py`; it has six values | **fixed in the gate** |
| 6 | constants FLAT in T are used far from 25 °C (`ksp_temperature` sweeps to 80 °C) with no refusal boundary | confirmed; **named, not fixed** |
| 7 | hand-declared chemistry is *less* rigorous than assembly — the first hand-written draft declared 6 aqueous reactions where the reachability closure finds 9, missing exactly the three calcium ion pairs that sequester Ca²⁺ and change how much calcite dissolves | settled: assembly, with an activation trace for visibility |

Finding 7 is the one that changed the architecture. What assembly lacks is not
correctness but **visibility** — and visibility is output, not architecture.
Hence the `[chemistry]` activation trace, which prints every equilibrium the
closure switched on and every one it left unreachable.

---

## 5. Still open

**The first named gap: general salt reconstruction.** Ordered ahead of the
second liquid phase by the second forum (`FORUM_2.md`), and the reason is
that the engine already refuses, by name, on both of this case's solids:

```
apparent component 'CaCO3' carries TWO candidate marker elements (C, Ca)
  -- the spike's collapse contract needs exactly one; generalised salt
  reconstruction is a later, deliberate slice.
```
(`ThermoPackageBuilder.cpp:690`)

CaCO₃ carries Ca and C; NH₄HCO₃ carries N and C. Declaring the typed bridge
on each does not rescue them either — `markersSeen` (line 709) refuses two
components that share a marker element, and CO₂, CaCO₃ and NH₄HCO₃ all
compete for C.

This is not a defect. It is the (c−1)(a−1) degrees of freedom appearing as
an error message instead of as an equation: dissolved CaCO₃ *is* calcium and
carbonate at once, and no single-element collapse represents it.

It is ordered **first** because it is deeper. A second liquid phase extends
the grammar of phases; salt reconstruction extends the relation between the
component basis and the species basis — the same seam the basis-reconciliation
roadmap item names, carrying the instruction *build a vertical spike
end-to-end through all layers before any mass migration*.

**The second named gap: a second liquid phase — and the earlier wording of it
was wrong.** This section used to say there was "no slot in the grammar" for
a second liquid. Reading the code says otherwise: `IsothermalFlash` carries a
`PhaseSet` with a working `VLLE` (vapour + two liquids by direct Gibbs
minimisation, with a passing tutorial). What exists is a **fork**, not a
hole — `IsothermalFlash::solve` returns early for a reactive package, so the
whole `phaseSet` machinery belongs to the molecular path alone. The engine
offers chemistry with one liquid, or two liquids with no chemistry, and this
case needs both. Proposal:
[`../reactive-second-liquid-proposal.md`](../reactive-second-liquid-proposal.md).

**The original wording, kept because it is still right about the physics:** `equilibrium { … }` declares one
liquid surface plus a vapour. There is no slot for a benzene-rich organic
liquid, and designing that slot is what this case exists to drive. Until it
exists the case cannot run, and `constant/thermoPhysPropDict` says so in place
of a placeholder — a placeholder that quietly folded the organic phase into
the aqueous one would be the exact failure the grammar was rebuilt to prevent.

When the slot is designed, the approximation must be declared **honestly**.
The first draft announced the exclusion of ~0.2 mol% of water from the organic
phase. That is the small one. The large one is that water–benzene
immiscibility — *the thing that causes the split* — is declared rather than
computed, leaving ethanol's partition to two independent binaries with no
ternary term. A tie-line from that is an arithmetic coincidence between two
pairs, not a tie-line of the ternary. And ethanol is a co-solvent: above
~40 mol% it closes the miscibility gap altogether. At this feed's ~9 mol% two
phases still exist, but the model does not know why.

**The apparent projection.** Projecting the converged aqueous state back onto
stream components is non-unique — exactly (c−1)(a−1) degrees of freedom for c
cations and a anions. The physics is unaffected, since elements and charge are
what cross the boundary, but the *labels* are a choice and a choice must be
declared. Needs a declared convention plus a loud refusal when the declared
component set cannot span the ion totals.

**The stream's three levels** (`EXPECTED_OUTPUT.md` §5) remain
**constitutional, not local**: putting species into a stream file contradicts
the ratified contract that no ion reaches a `0/` or `converged/` file. That is
the roadmap item carrying the instruction *build a vertical spike end-to-end
before any mass migration*. It must not travel in the same wave as the cheap
local items, or an argument about where the HSO₄ enthalpy lives becomes
hostage to a change in the constitution of streams.

Reassurance for it: the 300+ molecular tutorials do not move. For a
non-reactive case the three levels coincide, so the new form is additive.

**Two solids sharing an ion.** Calcite and NH₄HCO₃ share the carbonate. Near
the point where both are saturated the active set can oscillate and the matrix
conditions badly. With one solid this is trivial; with two coupled ones it is
not, and there is no anti-cycling rule or smooth reformulation in the design
yet. Named for when the implementation reaches it.
