# Explorer: every model choice against every catalogue component (2026-11-25)

Defect that started it: picking tertButylbenzene with UNIFAC ended in "choupoProps fatal error: UNIFAC:
component(s) tertButylbenzene have no group decomposition, so UNIFAC cannot price them." -- the engine right,
the screen a dead end.

## What was measured

* Generators (the Explorer's own code, called headless and serialised exactly as the WASM adapter does):
  `gui/src/case/exploreSynth.ts` `synthesizeExploreCase` (scan, phase diagram), `gui/src/case/methodFeeds.ts`
  `binaryVleSpec` (T-x-y, y-x, gamma) and `binaryPxySpec` (P-x-y), `gui/src/case/phaseEnvelopeLens.ts`
  `envelopePlan`, `gui/src/case/phaseSplitScan.ts` `phaseSplitPlan`, binary LLE.  Harness: `harness/`.
* Components: all 656 catalogue records, single-component scans: Psat, Cp_liquid, Z, v_molar, H_real, S_real
  (each with idealGas/SRK/PR), Cp_ig, liquid viscosity (Andrade, Vogel; chemsepEq101 after the fix), gas
  viscosity (Chung), liquid conductivity (SatoRiedel, Latini before / chemsepEq16 after), gas conductivity
  (Eucken), and the pure P-T phase diagram.
* Binaries: 2000 pairs of VLE-able components, every component at least 3 times (1972 fell in the classes
  for which the screen offers the binary-VLE lenses).  T-x-y over every model choice (4 activity x 3 EoS) on
  all 1972; gamma, P-x-y, envelope (PR, SRK), phase split and binary LLE on 392 of them.  n = 5 points
  (model applicability does not depend on n).
* Engine: native `choupoProps` (the build of 2026-11-25 07:45), the data of this tree, 4 runs at a time.
* "Before" = the screen as it stood.  "After" = the screen with the fixes below, where a model the record
  cannot feed is DISABLED (listed with its reason, not run).  An enabled model that still refuses is a finding.
* Classes: ok / refused by name (the engine's sentence kept) / crash / no reason.  Crashes: 0 in 45 966 runs
  before and 25 717 after.  Empty reasons: 0 after.  Before, 1 171 liquid-viscosity refusals carried the
  misleading engine sentence "no `liquidViscosity` block" for a record that has one, of another form.

## Table: operation x model

| op | model | runs before | ok before | refused before | enabled after | ok after | refused after | disabled with reason after |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| binaryLle | UNIFAC | 143 | 143 | 0 | 270 | 270 | 0 | -127 |
| envelope | NRTL+PR | 392 | 1 | 391 | 1 | 1 | 0 | 391 |
| envelope | NRTL+SRK | 392 | 1 | 391 | 1 | 1 | 0 | 391 |
| envelope | UNIFAC+PR | 392 | 143 | 249 | 270 | 270 | 0 | 122 |
| envelope | UNIFAC+SRK | 392 | 143 | 249 | 270 | 270 | 0 | 122 |
| envelope | Wilson+PR | 392 | 1 | 391 | 1 | 1 | 0 | 391 |
| envelope | Wilson+SRK | 392 | 1 | 391 | 1 | 1 | 0 | 391 |
| envelope | ideal+PR | 392 | 392 | 0 | 392 | 392 | 0 | 0 |
| envelope | ideal+SRK | 392 | 392 | 0 | 392 | 392 | 0 | 0 |
| gamma | NRTL | 392 | 1 | 391 | 1 | 1 | 0 | 391 |
| gamma | UNIFAC | 392 | 143 | 249 | 270 | 270 | 0 | 122 |
| gamma | Wilson | 392 | 1 | 391 | 1 | 1 | 0 | 391 |
| gamma | ideal | 392 | 392 | 0 | 392 | 392 | 0 | 0 |
| phaseDiagram | AmbroseWalton | 656 | 0 | 656 | 656 | 544 | 112 | 0 |
| phaseSplit | NRTL | 392 | 1 | 391 | 1 | 1 | 0 | 391 |
| phaseSplit | UNIFAC | 392 | 143 | 249 | 270 | 270 | 0 | 122 |
| phaseSplit | Wilson | 392 | 1 | 391 | 1 | 1 | 0 | 391 |
| phaseSplit | ideal | 392 | 392 | 0 | 392 | 392 | 0 | 0 |
| pxy | NRTL+PR | 392 | 1 | 391 | 1 | 1 | 0 | 391 |
| pxy | UNIFAC+PR | 392 | 141 | 251 | 270 | 261 | 9 | 122 |
| pxy | Wilson+PR | 392 | 1 | 391 | 1 | 1 | 0 | 391 |
| pxy | ideal+PR | 392 | 369 | 23 | 392 | 369 | 23 | 0 |
| scan:Cp_ig | - | 656 | 551 | 105 | 656 | 551 | 105 | 0 |
| scan:Cp_liquid | - | 656 | 513 | 143 | 656 | 513 | 143 | 0 |
| scan:H_real | PR | 656 | 524 | 132 | 544 | 524 | 20 | 112 |
| scan:H_real | SRK | 656 | 524 | 132 | 544 | 524 | 20 | 112 |
| scan:H_real | idealGas | 656 | 533 | 123 | 656 | 533 | 123 | 0 |
| scan:Psat | - | 543 | 523 | 20 | 543 | 523 | 20 | 0 |
| scan:S_real | PR | 656 | 524 | 132 | 544 | 524 | 20 | 112 |
| scan:S_real | SRK | 656 | 524 | 132 | 544 | 524 | 20 | 112 |
| scan:S_real | idealGas | 656 | 533 | 123 | 656 | 533 | 123 | 0 |
| scan:Z | PR | 656 | 543 | 113 | 544 | 543 | 1 | 112 |
| scan:Z | SRK | 656 | 543 | 113 | 544 | 543 | 1 | 112 |
| scan:Z | idealGas | 656 | 591 | 65 | 656 | 591 | 65 | 0 |
| scan:thermal_conductivity | (Eucken) | 656 | 551 | 105 | 656 | 551 | 105 | 0 |
| scan:thermal_conductivity_liquid | (Latini) | 656 | 0 | 656 | - | 0 | 0 | 656 |
| scan:thermal_conductivity_liquid | (SatoRiedel) | 656 | 458 | 198 | 478 | 458 | 20 | 178 |
| scan:thermal_conductivity_liquid | (chemsepEq16) | - | 0 | 0 | 381 | 380 | 1 | - |
| scan:v_molar | PR | 656 | 543 | 113 | 544 | 543 | 1 | 112 |
| scan:v_molar | SRK | 656 | 543 | 113 | 544 | 543 | 1 | 112 |
| scan:v_molar | idealGas | 656 | 591 | 65 | 656 | 591 | 65 | 0 |
| scan:viscosity_gas | (Chung) | 656 | 591 | 65 | 656 | 591 | 65 | 0 |
| scan:viscosity_liquid | (Andrade) | 656 | 6 | 650 | 6 | 6 | 0 | 650 |
| scan:viscosity_liquid | (Vogel) | 656 | 5 | 651 | 5 | 5 | 0 | 651 |
| scan:viscosity_liquid | (chemsepEq101) | - | 0 | 0 | 396 | 395 | 1 | - |
| txy | NRTL+PR | 1972 | 16 | 1956 | 16 | 16 | 0 | 1956 |
| txy | NRTL+SRK | 1972 | 16 | 1956 | 16 | 16 | 0 | 1956 |
| txy | NRTL+idealGas | 1972 | 16 | 1956 | 16 | 16 | 0 | 1956 |
| txy | UNIFAC+PR | 1972 | 636 | 1336 | 1350 | 1350 | 0 | 622 |
| txy | UNIFAC+SRK | 1972 | 636 | 1336 | 1350 | 1350 | 0 | 622 |
| txy | UNIFAC+idealGas | 1972 | 636 | 1336 | 1350 | 1350 | 0 | 622 |
| txy | Wilson+PR | 1972 | 16 | 1956 | 16 | 16 | 0 | 1956 |
| txy | Wilson+SRK | 1972 | 16 | 1956 | 16 | 16 | 0 | 1956 |
| txy | Wilson+idealGas | 1972 | 16 | 1956 | 16 | 16 | 0 | 1956 |
| txy | ideal+PR | 1972 | 1970 | 2 | 1972 | 1970 | 2 | 0 |
| txy | ideal+SRK | 1972 | 1970 | 2 | 1972 | 1970 | 2 | 0 |
| txy | ideal+idealGas | 1972 | 1970 | 2 | 1972 | 1970 | 2 | 0 |

"disabled with reason after" = runs the picker no longer offers because the record cannot feed the model
(decided from the record, before any run).  The UNIFAC rows grew in "enabled" because 136 components gained
UNIFAC groups; `phaseDiagram` is not gated by a model (it is offered only for VLE-able components on screen;
the 112 refusals are non-VLE-able records of the 656).

## Reasons behind the refusals, and how many components

| refusal / caveat | runs before | components before | runs after | components after |
|---|---:|---:|---:|---:|
| NRTL: no curated pair (would run ideal) | 7823 | 539 | 0 | 0 |
| Wilson: no curated pair (would run ideal) | 7300 | 521 | 0 | 0 |
| UNIFAC: no group decomposition | 5253 | 530 | 0 | 0 |
| record has no MW | 1020 | 51 | 459 | 51 |
| ADVISORY: property 'viscosity_liquid' produced NO value at any of the 5 points -- this is  | 791 | 396 | 0 | 0 |
| answered, with nan points | 759 | 309 | 897 | 310 |
| case record shadows the catalogue without overlayOf/variationOf | 677 | 656 | 20 | 1 |
| unknown (unregistered) transport model | 591 | 591 | 0 | 0 |
| Wilson: no Vliq | 523 | 136 | 0 | 0 |
| viscosity: record holds another form (engine says 'no block') | 380 | 190 | 0 | 0 |
| SRK: missing Tc or Pc | 192 | 48 | 0 | 0 |
| PR: missing Tc or Pc | 192 | 48 | 0 | 0 |
| record has no s_298 | 180 | 9 | 72 | 9 |
| H/S need standardThermochemistry | 160 | 42 | 160 | 42 |
| ADVISORY: property 'thermal_conductivity_liquid' produced NO value at any of the 5 points  | 133 | 133 | 19 | 19 |
| no vapour-pressure law | 80 | 4 | 32 | 4 |
| no ideal-gas Cp law | 80 | 40 | 80 | 40 |
| P-x-y: no bubble pressure above the 0.01 bar floor | 22 | 35 | 29 | 35 |
| ADVISORY: property 'S_real' produced NO value at any of the 5 points -- this is not a curv | 16 | 16 | 16 | 16 |
| ADVISORY: property 'H_real' produced NO value at any of the 5 points -- this is not a curv | 16 | 16 | 16 | 16 |
| T_bubble Newton did not converge | 6 | 4 | 6 | 4 |
| figure: null on log axis | 3 | 6 | 3 | 6 |
| AmbroseWalton needs Tc, Pc, omega | 0 | 0 | 61 | 61 |

(97 one-run rows omitted: Cp_liquid / Psat of one component whose record has no such law.)

## What was fixed

1. Model pickers (gamma, EoS, liquid viscosity and conductivity, envelope, phase split) list a model that cannot
   price the set DISABLED with its reason in one line; the default falls to the nearest that can, with a blue
   note saying which (`gui/src/case/modelApplicability.ts`).
2. A refusal the engine still makes is shown in plain words, with what to do next, one button for the nearest
   model that works, and the raw text in a fold (`gui/src/ui/explore/EngineRefusal.tsx`).
3. Four dead ends in the generators: Latini offered and not registered (591 refusals); Andrade/Vogel offered
   while 396 records hold chemsepEq101 (chemsepEq101 and chemsepEq16 are now offered); the pure phase diagram
   shipped a case record that shadows the catalogue without `overlayOf` (656 of 656 refused); `air` shipped
   without `variationOf` (every scan of air; re-checked by hand, not re-run in the table).
4. 136 components gained UNIFAC groups (`bin/curate/unifac_groups.py`) and UNIQUAC r, q: 311 -> 447 of 656.

## Still refused, and why (after)

* Records without MW (51 components: minerals and solids), s_298 (9), a vapour-pressure law (4), an ideal-gas Cp
  law (40), formation data for H and S (42): the record lacks what the property reads.  A data task.
* 209 records still without UNIFAC groups: no structure in the ChemSep listing (115), ions and salts (17), N, O or S
  bonded to a hetero atom, lactones, epoxides, and the other cases `unifac_groups.py --list` names one by one.
* P-x-y at a temperature where the liquid does not boil above the solver's 0.01 bar floor (35 components): physical.
