# No closure by construction counts as evidence

*Kind: ADR + enumeration.  Status: SHIPPED 2026-10-26 (DEV.md 4c C174),
slices (1)-(3) and the cheap half of (4); the rest of (4) proposed below.*

---

## 1. The defect

The CMO distillation column computes its reboiler duty as

    Q_reboiler_kW = dH(streams) - Q_condenser_kW

(`src/unitOperations/distillation/DistillationColumn.cpp:1874` on the
Wang-Henke branch, `:3427` on the simultaneous / full-MESH branch).  The
column's first law over its own boundary is then zero for ANY condenser
duty, and the energy report's per-unit row, `check_energy_closure`'s unit
arm and the plant arm all read that zero as a closure.  The condenser was
wrong on all 34 columns of the corpus (C169) and every one of those gates
was green.

**A balance used to COMPUTE a term cannot then be the evidence that the term
is right.**  It verifies only the SUM of the terms it contains; the split
between them is invisible to it.

## 2. Where the line is drawn

Not every term a unit computes from a balance is a plug.  The criterion this
record applies, and `src/result/ClosureVariable.H` states for the engine:

* **A DEFINITION** -- the unit's ONLY balance defines the term, and its model
  says nothing else about it: an isothermal reactor's or a heater's duty,
  `Q = H_out - H_in`; an adiabatic outlet solved from `H_out = H_in`.  There
  is no other term for the remainder to absorb.  The report re-prices the
  PUBLISHED states on its own surface, so the closure fails whenever the unit
  computed on a state or a surface its streams do not carry -- the
  2026-09-12 family (CLAUDE.md 6), caught again and again by the unit arm's
  sabotages U1-U10.  That is exactly what such a closure is evidence of, and
  it is classified (A) below, with the check named.
* **A CLOSURE VARIABLE** -- the unit's model ALSO says what the term is by
  another equation (a condenser and a reboiler envelope; an adiabatic
  reactor's zero; a jacket's `U A dT`; a bed's regeneration heat), or a
  component of a sum is filled by difference (a membrane's water), and the
  published number is the remainder instead.  Its closure is zero by
  construction and is evidence of nothing about the split.  Classified (B).
  It becomes evidence again only through a SECOND ROUTE: the unit's other
  equation evaluated on the answer, which must agree.

The commission's own example sits on the line: the heater's `Q = H_out -
H_in` is a definition, not a plug, because a heater's model has no other
statement about its heat.  If the same heater carried a `UA dT` rating and
published the enthalpy difference instead of it, it would be a plug.

## 3. Enumeration

Every term in `src/` (steady binaries in full; the time-integrated ones
named, not acted on -- see 5) that a unit computes FROM its own material,
element or energy balance and that a report or gate then presents as a
closure.  `file:line` at the commit that lands this record.

Classes: **(A)** closure verified independently, check named; **(B)** closure
by construction, not evidence -- "verified" only where a second route agrees;
**(C)** no closure claimed.

### 3.1 Energy

| # | unit / term | file:line | computed from | presented as closed by | class | independent check |
|---|---|---|---|---|---|---|
| E1 | `distillationColumn` (Wang-Henke, CMO) `Q_reboiler_kW` | `DistillationColumn.cpp:1874` | `dH(streams) - Q_condenser` | per-unit row, unit arm (until C174), plant arm | **B, not verified** | `Q_condenser_kW` by `check_column_thermo_consistency` (a).  The reboiler's own envelope on the CMO traffic is published (`Q_reboiler_ownEnvelope_kW`) and is NOT a route that can agree: CMO solves no stage energy balance, so the gap is the approximation's energy defect (column01: plug 679.5 kW, envelope 772.7 kW) |
| E2 | `distillationColumn` (simultaneous, CMO) `Q_reboiler_kW` | `DistillationColumn.cpp:3427` | same | same | **B, not verified** | same as E1 (column02: -121.1 kW; column14/15, SRK: -557.6 / -564.3 kW of 8815) |
| E3 | `distillationColumn` (full MESH) `Q_reboiler_kW` | `DistillationColumn.cpp:3427` | same | same | **B, verified** | the reboiler's own envelope on the full MESH's traffic (engine, `mustAgree`; column06/07/08 agree to 1e-10 kW), and `check_column_thermo_consistency` (a2) |
| E4 | `distillationColumn` `Q_condenser_kW` | `DistillationColumn.cpp:1873`, `:3426` | its own envelope (`condenserDuty`) | (it is a model term, not a remainder) | **A** | `check_column_thermo_consistency` (a), every column |
| E5 | `cstr` adiabatic / `heatExchange` `Q_kW` | `CSTR.cpp:1124` | `H(out) - H(in)` on the published streams | unit arm, plant arm | **B, verified** | the model's own heat, 0 or `U A (T_c - T_out)`, engine (`mustAgree`; was only an announcement, `announceUnmatchedEnthalpy`) |
| E6 | `pfr` adiabatic / cooled `Q_kW` | `PFR.cpp:1421` | `H(out) - H(in)` | plant arm | **B, verified** | the wall heat the march integrated into the bed's enthalpy flow `y[n]`, engine (`mustAgree`) |
| E7 | `tsaTwinBed` `Q_adsorption_cooling_kW` | `TSATwinBed.cpp:189` | `-Q_regeneration_kW` (the bed's cyclic balance) | per-unit row (the two items cancel), plant arm (and both inflate the plant's exchanged-energy scale) | **B, not verified** | none: nothing else in the model carries the regeneration heat (the purge leaves at the adsorption temperature).  Proposed in 4 |
| E8 | `cstr` isothermal (`:483`, `:1124`), `conversionReactor` (`:322`, `:515`), `gibbsReactor` isothermal (`:732`), `equilibriumReactor` (`:1058`) `Q_kW` | as listed | `H(out) - H(in)` | unit arm | **A** (definition) | the report's re-pricing at the published states, judged per unit by the unit arm |
| E9 | `mixer` at a declared T `Q_kW` (`Mixer.cpp:347`, `:776`); adiabatic mixer outlet (inversion) | `Mixer.cpp` | definition / inversion | unit arm | **A** | unit arm |
| E10 | adiabatic `sprayDryer` / `solidDryer` / `convectiveDryer` outlet T | `SprayDryer.cpp`, `SolidDryer.cpp`, `ConvectiveDryer.cpp` | inversion of `H_out = H_in` through `flashState::priceState` | unit arm | **A** | unit arm (U1, U2) |
| E11 | `evaporator` process side (vapour from the chest duty) | `Evaporator.cpp` | inversion against `h(chest) - h(condensate)` | unit arm | **A** | unit arm (U5) |
| E12 | `valve` outlet | `Valve` | inversion of `H_out = H_in` | unit arm | **A** | unit arm |
| E13 | `heater` `Q_kW` | `Heater.cpp:467` | definition (declared T) or inversion (declared Q) | plant arm only | **A** (plant sum) | the report's re-pricing, judged only inside the plant sum.  Corpus: one row at -0.0002 kW |
| E14 | `isothermalFlash` `Q_kW` | `IsothermalFlash.cpp:2214`, `:2425` | `F (H_out - H_in)` on the flash's own phases | plant arm only | **A** (plant sum) | the report's re-pricing.  **Finding**: 16 rows of 84 leave up to 0.87 kW (greenAmmonia02_feasibility50bar's Separator -0.8708 kW; flash13 +0.2506 kW): the definition is not evaluated on the report's surface everywhere.  Inside every plant's band, so nothing fails today.  Proposed in 4 |
| E15 | `heatExchanger` outlets | `HeatExchanger.cpp:1036` | rating Q, each side by inversion | plant arm only (an internal exchanger declares no item) | **A** (plant sum) | the report's re-pricing; `H_closure_gap_kW` published.  Corpus: ammonia02 FEHE -0.1018 kW |
| E16 | `coolingTower` air outlet `h2` | `CoolingTower.cpp:356`, `:372` | the water side under constant L | plant arm (pinned, KNOWN_OPEN_KW +1.5666 kW) | **A** | NOT tautological: the unit's balance (constant L) is not its published streams', and the report sees the difference (`H_closure_gap_kW`) |
| E17 | `phaseChanger` `Q_kW` | `PhaseChanger.cpp:581`, `:1021`, `:1500` | film / spec model; outlet by inversion | plant arm | **A** (plant sum) | report re-pricing; `Q_UAdT_kW` cross-check published |
| E18 | `crystalliser` `Q_kW` | `Crystalliser.cpp:308`, `:590`, `:904` | sensible + crystallisation heat | plant arm | **A** (plant sum) | report re-pricing (all six corpus rows 0.0000 kW) |
| E19 | `pump` / `compressor` / `turbine` outlet T | `Pump.cpp:346`, `Compressor.cpp:246`, `Turbine.cpp:156` | the unit's own work balance | plant arm (pump01/02 pinned 65 %) | **A** (plant sum) | report re-pricing: the open residuals are real, not by construction |
| E20 | `multiStreamHX` | `MultiStreamHX.cpp:264` | each stream's own dH; `imbalance_kW` published | plant arm | **A** | `imbalance_kW` / `balanceCloses` |
| E21 | `shortcutColumn`, `absorber`, `stripper`, `bubbleT`, `dewT` | | no duty published | plant arm sees the implied duty as residual | **C** | the plant pins (shortcut01 +1.08, absorber01 -27.98, stripper01 -19.87 kW) |
| E22 | splitter, storage tank, cyclone, bag filter, gas-solid splitter, PSA, pneumatic conveyor, pipe | | pass-through | per-unit raw imbalance (implied duty), no closure field | **C** | plant sum |
| E23 | utility allocation `kg_s` | `UtilityAllocationReport.cpp` | duty / (utility's own dH) | not a closure | **C** | -- |

### 3.2 Material

| # | unit / term | file:line | computed from | presented as closed by | class | independent check |
|---|---|---|---|---|---|---|
| M1 | `spiralWoundModule` water in each outlet | `SpiralWoundModule.cpp:1449`, `:1474`; feed volume `BulkConversion.H:91` | `c_water = (rho - SUM c_s MW_s) / MW_water`, `Q = m_in / rho`: total mass closes for any solute flows | massBalance per-unit row, `check_mass_closure` (TOTAL mass), the unit's own `mass_closure_rel` KPI (whose comment called it "a permanent, visible witness" -- corrected) | **B, verified** | every solute balanced on its own, `solute_closure_rel`, refused above 1e-9 (since 2026-09-29) -- engine, `mustAgree` |
| M2 | `isothermalFlash` `L = F - V`; splitter branches; crystalliser liquor; PSA / TSA product; column `B = F - D` (total) | | the unit's only material envelope | massBalance per-unit row, `check_mass_closure` | **A** (definition) | what such a closure checks is a clamp, a negative stream or a publication defect (the 2026-09-04 spray dryer) -- the SPLIT is an equilibrium / transport statement, not a mass one.  The column's component compositions come from its stage solve, so its component closure has bite |
| M3 | `extractor` `massClosure` | `Extractor.cpp:719` | the cascade's outlets | its own KPI | **A** | the cascade's outlets are independent of the KPI's arithmetic (closes to 1e-8 since C123) |
| M4 | declared utility circuits | `streams/UtilityCircuit` | supply / return pair | process scope of the mass report | **A** | component-wise conservation refusal (`check_mass_closure` refusal arm) |

### 3.3 Element

| # | unit / term | class | why |
|---|---|---|---|
| X1 | `gibbsReactor` / `equilibriumReactor` outlet | **A** | element conservation is the minimiser's CONSTRAINT, solved with the outlet, not a remainder filled after it; the element report checks the published outlet against it |
| X2 | `conversionReactor` / `cstr` / `pfr` outlet `= in + nu xi` | **A** | the element report checks that the declared stoichiometry is atom-balanced against the records' formulas -- an independent pair of facts |

No unit computes an element term as the balance's remainder today.
`check_element_balance` now FAILS on any element record in the runs it
judges, so the day one appears the verdict is taught to set it apart.

## 4. Independent checks

**Built** (the engine's second route, published as the record's `check`,
`checkValue`, `gap`, `tolerance`, `mustAgree`; a `mustAgree` record that
disagrees FAILS `check_energy_closure` / `check_mass_closure`):

* E3, the full MESH reboiler: its own envelope on the solver's traffic,
  tolerance `1e-5 kW + 1e-9 SUM|terms|`.  Sabotage S8 below: the condenser
  mis-priced by 1 % leaves the column's and the plant's first law at
  0.0000 kW, and the second route reads 13.08 kW.
* E1/E2, the CMO reboiler: the same envelope on the CMO traffic, published as
  `Q_reboiler_ownEnvelope_kW`; NOT a verification (see E1).  Measured over
  the 31 CMO column runs of the corpus: 28 plugs sit BELOW their own
  envelope, 1.7-23 % (benzene/toluene 12.1 %: toluene's larger latent heat,
  which constant molal overflow cannot see), plus the reactive column05 at
  49 %; two sit within 2 % above; and one is a **finding** --
  `aceticAcid02_plant`'s `lightsColumn` reads a plug of 118.3 kW against an
  envelope of 38.6 kW (+206 %).  Its feed is 24 K subcooled (380 K against a
  404 K bottoms), whose sensible heat is ~80 kW -- the gap -- and its
  envelope (~V_rect lambda) says the CMO traffic did not carry the enthalpic
  q of C169 item 4 on that column.  Not diagnosed here (C169's ground); the
  second route is what made it visible.
* E5/E6, the non-isothermal reactors: the model's own heat against the
  published duty -- an announcement until now, a verdict now.
* M1, the membrane's water: the per-solute balance, already asserted by the
  unit, now carried on the result as the route that verifies the water.

**Proposed, not built:**

* E7, the TSA bed: a regeneration-gas energy balance -- the purge leaving at
  `T_regen` and the bed's heat carried out by it -- would give the
  regeneration duty a second home.  It changes the model (the purge's outlet
  temperature), so it is Vitor's.
* E13-E15, E17: add `heater`, `isothermalFlash`, `heatExchanger` and
  `phaseChanger` to the unit arm, so a definition is judged per unit and not
  only inside a plant sum.  `isothermalFlash` would FAIL today on 16 rows
  (E14) and needs either a fix (price `Q_W` through `flashState::priceState`
  on the published phases) or pins; `heatExchanger` on 3.  A slice of its
  own, after this one.
* E1/E2 as a teaching surface: the CMO energy defect beside the McCabe-Thiele
  diagram (`V' lambda_B` against the plug).  A pedagogical scope, so Vitor's.

## 5. Not acted on, named

The time-integrated binaries carry closures of the same class, outside the
three gates this slice changed:

* `DynamicCSTR`, mixture-H route (`DynamicCSTR.cpp:922`): the stored H is
  integrated as a STATE and the faces are priced on the same mixture
  surface, so the ctrl ledger's energy closure (ctrl10, 7.9e-11) is the same
  equation integrated twice -- (B).  The canonical route recomputes `H(n, T)`
  from the state and checks that the temperature ODE is its derivative --
  (A).  `check_ctrl_balance` does not tell them apart.
* `FixedBedAdsorber` carrier by difference (`FixedBedAdsorber.cpp:1804`) and
  `BatchAdsorber`'s "component closure holds BY CONSTRUCTION"
  (`BatchAdsorber.H:49`) -- (B), material.
* `BatchElectrodialysis` (`BatchElectrodialysis.H:179`) REFUSED to plug the
  electrical work and publishes the campaign first law as UNAVAILABLE -- the
  posture this record asks of everyone, already taken.

## 6. What changed

* `result/ClosureVariable.H`: the record.  `UnitOperation::closureVariables()`
  (default none); the column, `cstr`, `pfr`, `tsaTwinBed` and
  `spiralWoundModule` declare theirs.  The flowsheet collects them
  (`recordClosureVariables`, zero net lines in `Flowsheet.cpp`, whose lines
  the EduTools cite), the result carries `closuresByConstruction`, and each
  `energyClosures` row of such a unit says `byConstruction: verified |
  notVerified` with its `closureVariable`.
* `reporting/ClosureByConstruction.H`: ONE home for how the three balance
  reports speak -- a `byConstruction` column at the END of
  `energyBalance_byUnit.csv` and `massBalance_byUnit.csv`, one console line
  per term plus a count, and a `validity` advisory for each `notVerified`
  one, so it reaches the end-of-run caveat block.
* `check_energy_closure`: its own table of the (B) energy rows, two-way
  against the engine; the unit arm no longer counts a (B) unit among the
  units that close (and checks the two counts are disjoint); a `mustAgree`
  route that disagrees, or a status word that disagrees with its own gap,
  FAILS; the claim line counts them.  `check_mass_closure`: the same for M1.
  `check_element_balance`: the count, and a refusal of any element record.
* The GUI's Streams band draws the engine's word (`case/closureByConstruction.ts`)
  under the mass and energy closures and beside each column's reboiler duty;
  a not-verified energy closure by construction withholds the green check.

No golden row moved: every steady case's KPIs (the new
`Q_reboiler_ownEnvelope_kW` aside), streams, boundaries, closure ledger,
utility rows and report lines were compared before and after, 281 cases, 0
differing.

## 7. Sabotages (by hand, 2026-10-26)

On a scoped copy of the corpus cache unless stated; each restored.

| | sabotage | caught by |
|---|---|---|
| S1 | column01's `byConstruction` stripped from its output | energy arm: "published no `byConstruction` status" |
| S2 | column06's record flipped to `notVerified` | energy arm: the word disagrees with its own numbers, and the `mustAgree` route |
| S3 | `tsaTwinBed` removed from the gate's table | the two-way check, and the witness |
| S4 | the unit arm counts a (B) unit among those that close | the disjoint-count self-audit (this one would have survived as a claim-only change without it) |
| S5 | cstr04's record flipped to `notVerified` | the `mustAgree` route |
| S6 | membrane18's material record removed | mass arm: "published no material closure variable" |
| S7 | `spiralWoundModule` removed from the mass gate's table | the two-way check, and the witness |
| S8 | ENGINE: the full-MESH condenser priced 1 % high (`DistillationColumn.cpp`, rebuilt) | column06's plant first law stays at 0.0000 kW -- by construction -- and the energy arm FAILS on the reboiler envelope's 13.08 kW gap.  Restored byte-identical and rebuilt |

And the fail-first measurement: the new arms run against the corpus output
of the tree BEFORE the engine change fail on 38 units (energy) and 33
(material), each "published no ... status".
