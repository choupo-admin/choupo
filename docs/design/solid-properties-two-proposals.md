# Proposal — two solid-property gaps: polymer data the runtime never reads, and a salt crystal the stream cannot price

**2026-11-13.  Kind: PROPOSAL.  Status: NOTHING IMPLEMENTED.  No file under
`data/` or `src/` changes with this document.**  Both items come from the
solid-properties review of 2026-11-12
(`docs/reviews/2026-11-12-solid-properties/findings.tsv`, rows SP-08 and
SP-10); each was re-measured on the build of this branch before it was
written down here.  What needs a source, or a decision, is said as such.

---

## 1. SP-08 — six polymer records declare data the runtime does not read

### 1.1 What the records declare, and what the runtime sees

`Component` reads a particle density in exactly two homes
(`src/thermo/Component.cpp:604-632`): the first `solidPhases.<phase>.crystal {
rho_p; }` block, else a flat `solid { rho_p; }` block.  A solid heat capacity
is read only from a `solidHeatCapacity {}` block (`Component.cpp:749-750`);
absent, the solid leg of `h_formation` falls back to the liquid Cp, and that
needs a `liquidHeatCapacity` (`Component.cpp:1165-1171` and below).  The six polymer
records put their numbers somewhere else: `rho_p` at the TOP LEVEL of the
record, and `Tm`, `Cp_solid` and `crystallinity` inside a `polymer {}` block
that no runtime reader opens (`polymer` is read only by
`src/propertyOps/EstimateComponent.cpp:835`, a curation op, and as a REACTION
keyword by `PFR.cpp:504`).

| record | declared (`data/standards/components/<name>.dat`) | what the runtime sees |
|---|---|---|
| `PET` | `rho_p 1335` (top level, comment "bulk density"); `polymer { Tm 528; Cp_solid 1130; crystallinity 0.00-0.40; }` | no particle density, no solid Cp, no Tm |
| `PMMA` | `rho_p 1170` (top level, "bulk density"); `polymer { Cp_solid 1450; crystallinity 0.00; }` (amorphous, no Tm) | no particle density, no solid Cp |
| `PVC` | `rho_p 1385` (top level, "bulk density"); `polymer { Cp_solid 900; crystallinity 0.00-0.10; }` | no particle density, no solid Cp |
| `polyethylene` | `rho_p 950` (top level, "bulk density"); `polymer { Tm 410; Cp_solid 1900; crystallinity 0.60-0.80; }` | no particle density, no solid Cp, no Tm |
| `polypropylene` | `rho_p 905` (top level, "bulk density"); `polymer { Tm 440; Cp_solid 1800; crystallinity 0.50-0.65; }` | no particle density, no solid Cp, no Tm |
| `polystyrene` | `rho_p 1050` (top level, "bulk density"); `polymer { Cp_solid 1220; crystallinity 0.00; }` (amorphous, no Tm) | no particle density, no solid Cp |

None of the six carries `solid {}`, `solidPhases {}`, `solidHeatCapacity {}`,
`liquidHeatCapacity {}` or `standardThermochemistry {}` (measured by grep on
the six files).

**Re-measured probe.**  `tutorials/steady/gas-solid/cyclone02_leith_licht`,
unsealed, its solid renamed from `silica` to `polyethylene` throughout: exit
2, `cyclone 'cyclone': solid 'polyethylene' has no particle density ... No
default density is assumed`.  The refusal is right; the record holds a number
the refusal says is missing.

### 1.2 Which shipped cases use them as solids

Measured by grep over every `constant/thermoPhysPropDict` in `tutorials/`:

* `polystyrene` appears in `tutorials/steady/flash/flash_polymer_devolatilisation`
  (a dissolved NONVOLATILE in a toluene melt, carried in the liquid, never a
  solid) and in `tutorials/props/solvents/solvent03_polystyrene_observed` (a
  Hansen-parameter props case; no stream).
* `PET`, `PMMA`, `PVC`, `polyethylene`, `polypropylene`: no case.  (The three
  tablet plants under `tutorials/batch/plant/` match the text `polyethylene`
  only through `polyethyleneGlycol`, a case-local record.)

So **no shipped case uses any of the six as a solid**, and the edit below moves
no golden.

### 1.3 The minimal record edit that would make the density reach the runtime

Move the number into the flat solid slot the runtime reads, with its
provenance entry beside it:

```
solid
{
    rho_p   <kg/m3>;
}
```

(or, if a record is ever given a solid phase with its own equilibrium, the
`solidPhases.<phase>.crystal { rho_p; }` form).  Nothing in `src/` changes.
A solid Cp would need a `solidHeatCapacity {}` block in a form the
`HeatCapacityModel` factory reads; a single number at 298 K is a constant-Cp
model at best, and whether that is fit to write is a curation decision, not
an engine one.  `Tm` has no runtime reader for a polymer at all and is out of
this edit.

### 1.4 What cannot be decided without a source

**Every one of the six comments calls its `rho_p` a "bulk density".**  A
particle density (the mass of one particle per its own volume, what the
cyclone, the conveyor and the classifier divide by) and a bulk density (a
powder bed's mass per bed volume, voids included) differ by the bed's voidage
-- for a pellet bed often a factor near 0.6.  The numbers themselves (950 for
a high-density polyethylene, 1335 for amorphous PET, 905 for isotactic
polypropylene) read like MATERIAL densities, the provenance line names the
amorphous value of a polymer properties book PLUS "handbook bulk value for
the named grade", and the PET record's own grade note gives 1335 as the
amorphous (quenched) density and about 1400 as the semicrystalline one.  So
the word, the number and the provenance do not agree, and moving the value
into `solid { rho_p; }` as it stands would turn a mislabelled datum into a
used one.  The remedy is a curation act: read the cited primary for each
grade, decide whether the value is the material (particle) density, write it
under `solid { rho_p; }` with its grade, and drop or correct the word
"bulk".  If a bulk density is wanted too, it is a different quantity with
its own key, not this one.

---

## 2. SP-10 — a salt crystal on a stream cannot be priced, although its formation enthalpy is derivable

### 2.1 The two code paths

The settled rule (CLAUDE.md §5, "Salt formation — ION-DERIVED"): a salt's
solid formation enthalpy is a DERIVATIVE, `Hf_solid = Σ ν_i hfAq_i −
dH_soln`, from the aqueous ions plus the component's `electrolyte {
dissolutionEnthalpy }`, and it is NEVER stored as a component-level
`standardThermochemistry` block.

* **Path A — the crystalliser's heat of crystallisation honours it.**
  `src/unitOperations/crystallisation/CrystallisationHeat.cpp:51-64`
  (`crystallisationHeatPerMol`) reads `thermo.electrolyte().
  dissolutionEnthalpy()` directly; the heat of crystallisation is `+dH_soln`
  at infinite dilution, with a finite-concentration correction where the
  Pitzer slots are fitted.  It never needs `Hf_solid` itself, because it
  prices the TRANSFORMATION, not the state.
* **Path B — the pricing of a crystal on a STREAM does not.**  Both the
  unit-side pricing, `flashState::priceSolids`
  (`src/unitOperations/flash/StreamEquilibrium.H:885-891`), and the report-
  side pricing, `reporting::solidH_elements` (`src/reporting/BalanceMath.H:
  260-267`), call `Component::h_formation(T, "solid")`, which throws on its
  first line when the record has no `standardThermochemistry`
  (`src/thermo/Component.cpp:1148-1150`).  For a salt that is ALWAYS the case,
  by the rule above.  The throw is caught and ANNOUNCED by name (`[report]
  energyBalance gap: unit '...' has no elements-datum enthalpy -- Component
  'NaCl': h_formation needs standardThermochemistry block in .dat`), so it is
  never silent -- but its remedy text ("curate the standardThermochemistry
  block") is the one the settled rule forbids for a salt.

### 2.2 The shipped cases whose energy balance is unavailable for that reason

Measured on this branch: every case under `tutorials/` holding a
`crystalliser`, `evaporativeDryer` or `evaporator` unit (33 cases) run on a
scratch copy, the console grepped for the energy-balance gap line.  The cases
whose gap names a SALT CRYSTAL with an ion-derived formation (a
`dissolutionEnthalpy`, no `standardThermochemistry`):

| case | unit | component named |
|---|---|---|
| `tutorials/plant/lithiumBrinePlant` | `BRINE.crystNaCl` | NaCl |
| `tutorials/steady/crystallisation/crystalliser05_nacl_pitzer` | `cryst` | NaCl |
| `tutorials/steady/crystallisation/crystalliser06_nacl_antisolvent` | `cryst` | NaCl |
| `tutorials/steady/crystallisation/crystalliser07_nacl_antisolvent_cooled` | `cryst` | NaCl |
| `tutorials/steady/crystallisation/crystalliser08_nacl_antisolvent_msmpr` | `cryst` | NaCl |
| `tutorials/steady/crystallisation/crystalliser09_KHT_KCl_series` | `cryst1` (and the KCl stage) | potassiumBitartrate, KCl |
| `tutorials/steady/crystallisation/crystalliser10_naoh_antisolvent` | `cryst` | NaOH |
| `tutorials/steady/crystallisation/crystalliser11_kcl_antisolvent_ethanol` | `cryst` | KCl |
| `tutorials/steady/crystallisation/overlay02_nacl_calorimetric` | `cryst` | NaCl |
| `tutorials/steady/drying/evapDryer01_nacl` | `dryer` | NaCl |
| `tutorials/steady/drying/evapDryer02_energy_limited` | `dryer` | NaCl |
| `tutorials/steady/thermoTest/model3_enrtl_antisolvent_crystalliser` | `cryst` | NaCl |

Three remarks, so the table is not read as more than it is:

* `potassiumBitartrate` carries no `dissolutionEnthalpy` (its record states
  that its formation datum is deliberately absent and its saturation is an
  SLE curve), so the ion-derived remedy would NOT price it;
  `crystalliser09` would stay partly unavailable.  `lithiumBrinePlant` also
  names a petroleum cut (`kerosene_C12cut`), an unrelated gap.
* Other gaps found by the same sweep are NOT this finding:
  `evaporator01_brine` and `thermoTest/model1_lumped_evaporator` (a DISSOLVED
  NaCl with no liquid heat capacity, declared nonvolatile), and
  `evaporator03/04/05` (a case-local pseudo-component `agua` with no
  formation datum).
* The sweep read the console of one run per case; it did not open the
  energy report files.

### 2.3 The one-home remedy (described, not implemented)

Give the derivation ONE home on the component -- `Component::h_formation(T,
"solid")` (or a function it calls) -- so that a record carrying an
`electrolyte { dissolutionEnthalpy }` and a `dissociatesTo` bridge, and NO
`standardThermochemistry`, returns `Σ ν_i hfAq_i(298.15) − dH_soln` plus the
solid sensible heat `∫ Cp_solid dT` (its `solidHeatCapacity {}`, else the
announced fallback), computed from the ion records the bridge already names.
Both stream pricers (Path B) then price a salt crystal without a line of
their own, and the crystalliser's Path A keeps reading `dissolutionEnthalpy`
directly -- the same datum, so the two can never disagree.  The tree still
stores no derivative (`check_ion_pins` keeps refusing a salt that carries
both blocks); what changes is that the derivation the rule NAMES is
performed where every pricer asks.  Before it is built, three things are
decided, not assumed: whether the ions' `hfAq` are on the same datum as the
molecular formation enthalpies the stream already sums (the mixed-basis
question the electrolyte records answer for the liquid); which `dH_soln` is
meant (the infinite-dilution value is what the records carry); and the list
of goldens that move -- every case in the table above would gain a priced
energy balance, so their energy rows are a re-record to show before it is
made.
