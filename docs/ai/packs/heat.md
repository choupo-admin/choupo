# Pack: heat transfer (heaters, exchangers, boilers and condensers, utilities, pinch)

budget: 1200 words (~1920 tokens)

Read after the brief (`docs/ai/brief.md`). Binary: `choupoSolve`. Units here: `heater` · `heatExchanger` · `phaseChanger` (`boiler`, `condenser`) · `multiStreamHX` · `evaporator`. Fuller keys: `docs/ai/unit-ops.md` section "Heat transfer"; the duty/utility model: `docs/ai/energy.md`.

## 1. Which unit

| You have | Use |
|---|---|
| a duty is given (kW), T_out unknown | `heater` (`Q` signed: + heats, - cools) |
| a target T_out, vapour fraction, superheat or subcool, duty unknown | `phaseChanger` (one target; Q is the result) |
| two process streams, area and U known, outlets unknown | `heatExchanger` (eps-NTU rating) |
| a tube bundle to rate or size from geometry | `heatExchanger` `model geometry;` / `design;` / `BellDelaware;` |
| three or more streams in one cold box | `multiStreamHX` |
| concentrate a solution with steam | `evaporator` |

The credo: a unit that takes hardware (area, U, a duty) returns states; a duty that is a SPECIFICATION of a target is a `designSpec` on the hardware (`docs/ai/unit-ops.md` section `designSpec`), never a second input. Enthalpy is the elements-datum enthalpy, so a stream heated past its bubble point leaves two-phase; a PURE stream whose target lies inside its latent jump leaves AT Tsat(P) with its vapour fraction pinned.

## 2. heater: a furnished duty

```
{ name heater01; type heater; in feed; outputs ( hotStream );
  operation { Q 100.0 kW; } }              // T_out is a RESULT
```
Taken from `tutorials/steady/heat/hx01_heater`. "I need 360 K out" = a `designSpec` on `$Q`. A flash GIVES a duty, a heater TAKES one: "impose Q, then separate" is `heater` then `isothermalFlash`.

## 3. heatExchanger: area and U, outlets are results

Verbatim from `tutorials/steady/heat/heatExchanger01_water_water`:
```
{ name hx; type heatExchanger;
  inputs  ( hot cold );                    // ORDER: hot first, then cold
  outputs ( hotOut coldOut );
  operation { area 10.0 m2; U 500.0 W/m2/K; flow counter; } }   // counter | co
```
Streams in `0/` (hot: `componentMolarFlows { water 100 kmol/h; }  T 360 K;  P 200000 Pa;`; cold likewise; the outlets `0/hotOut`, `0/coldOut` are materialised by `bin/choupo-init0`). Results: `Q`, both outlet T, effectiveness, NTU, LMTD cross-check.
- Every component of both streams needs a liquid or gas heat capacity; a component that has none is REFUSED (a silent Cp = 0 once hid half a duty: header of `tutorials/steady/utilities/utility01_dowtherm_preheat`).
- A side that changes phase is announced; the DUTY stays the sensible eps-NTU one, so a condenser duty from this unit is not a latent one. Use `phaseChanger` for that (witness `tutorials/steady/heat/hx02_condensing_steam`, `tutorials/steady/heat/heatExchanger03_pure_water_plateau`).
- Declare `phase gas;` on a saturated steam supply, or the last digits of P decide which side of the curve it is on.
- Models: `model geometry;` rates a declared bundle (`operation.geometry { tubeID tubeOD tubeLength nTubes passes shellID baffleSpacing tubePitch tubePattern wallMaterial }`, optional `foulingTubeSide`, `foulingShellSide` in m2.K/W): witnesses `tutorials/steady/heat/heatExchanger02_geometry_U`, `tutorials/steady/heat/hxWorkflow1_design_from_duty` (`model design;`), `tutorials/steady/heat/hxWorkflow2_rate_designed`. `model BellDelaware;` needs `tubeStream` and a `bellDelaware { baffleCutPercent bundleShellClearance tubeBaffleClearance shellBaffleClearance sealingStripRatio baffleThickness idealBank JL JB }`; each of JL, JB (RL, RB) is a chart number or the word `auto`, never defaulted: `tutorials/steady/heat/heatExchanger04_bell_delaware_rating`, `tutorials/steady/heat/heatExchanger05_bell_delaware_auto`.

## 4. phaseChanger (aliases boiler, condenser): pick exactly ONE target

```
{ name condenser; type condenser; in feedVapour; outputs ( wetOut );
  operation { outletQuality 0.4; } }       // 40 % vapour; Q is the result
```
From `tutorials/steady/heat/phasechange01_partial_condenser`. Exactly one of `Q`, `outletT`, `outletQuality`, `outletState` (`saturatedVapour` | `saturatedLiquid`), `superheat`, `subcool` (K); zero or two is refused. `P` is held from the inlet unless `P` is given. Direction (boiler or condenser) is read from the result, not chosen. Film-condensation duty from geometry: `model geometry;` with `geometry{}` and `coolant{}`: `tutorials/steady/heat/condenser01_film_nusselt`. Boiling from a surface (Rohsenow, a CHF ceiling that hard-refuses a design above it): `tutorials/steady/heat/reboiler_water_copper`.

## 5. multiStreamHX and evaporator

- `multiStreamHX` (alias `MHeatX`): list every hot and cold inlet in `inputs`; declare the outlet T of all but one in `operation { outlet { hot1 { T 330.0 K; } } }`; the enthalpy balance closes the last. Witness `tutorials/steady/heat/mheatx01_two_hot_one_cold`.
- `evaporator`: `inputs ( feed steam ); outputs ( concentrated vapour condensate );` `operation { area <m2>; U <W/m2/K>; }`. One volatile solvent only; the rest are non-volatile solutes that raise the boiling point. T_boil, V/F and P are RESULTS. Witnesses under `tutorials/steady/evaporation/`; keys: `docs/ai/unit-ops.md` section `evaporator`.

## 6. Utilities: allocate by default, carry when wired

Add to `controlDict`: `reports { utilityAllocation { dTmin 10; } }`. Each unit's duty is matched to the lowest-grade catalogue utility that works (steamLP/MP/HP, coolingWater, chilledWater, dowthermA, hitecSalt, refrigerationPG, electricity; `data/standards/utilities/`) and turned into a flow, a load and EUR/h. A utility as a STREAM into an exchanger is carried, not allocated. A condenser duty can drive another unit with `energyInputs ( { from column01.condenser; kind heat; target Q; } )` on the consumer: `tutorials/steady/heat/heatlink01_condenser_to_heater`; feeding the column's own feed is an energy tear, handled with no `tearStreams`: `tutorials/steady/heat/heatlink02_condenser_feed_preheat`. A hot-oil utility stream (`category dowthermA;` in its `0/` file) and the `utilities {}` report: `tutorials/steady/utilities/utility01_dowtherm_preheat`; more: `utility02_hitec_csp_heater`, `utility03_glycol_brine_chiller`.

## 7. Pinch targets

A post-processing pass, in `system/postDict`; it only TARGETS and never rewrites the network. Every duty-carrying unit becomes a stream segment (a `heater` with a signed `Q` is the cheapest population):
```
pinchPass { dTmin 20 K; }
```
From `tutorials/steady/heat/pinch01_four_stream_classic` (hand-checkable: Q_H,min 107.5 kW, Q_C,min 40 kW, pinch at 90/70 C). Output: the problem-table cascade, `reports/pinch/compositeCurves.csv`, the targets as KPIs, and a candidate-match table. The case uses a constant-cp teaching fluid so the targets are exact; a real fluid gives sensible-heat segments from its own cp. User Guide: `docs/userGuide.tex` label `sec:pinch`; EduTool `docs/eduToolsGuide.tex` label `sec:edu-pinch`.

## 8. Pitfalls

- Port order: `heatExchanger` is `( hot cold )` in and `( hotOut coldOut )` out; swap them and the "hot" side is heated.
- Do not write `T_out` on a `heater`: it is a result. Do not give a `phaseChanger` two targets.
- A fixed-T design target on an exchanger is a `designSpec` on `$area`, not a key.
- Outlet streams still need a `0/` file (run `bin/choupo-init0 <case>`); first-law check: the `energyBalance` report must close.
- Geometry and Bell-Delaware keys are refused by name when missing: read the refusal, do not guess a chart factor.
- Guides: Theory Guide `ch:phase-changer` (boiler/condenser/evaporator), `sec:hx-design` (HX workflow); User Guide `sec:heat-family`.

<!-- RUN: heatExchanger01 / hx01 / phasechange01 / pinch01 run by their `expected` goldens (bin/runTests).
     SOURCES: docs/ai/unit-ops.md lines 773-1010 and 4385-4393; docs/ai/energy.md sections 3-5; the cases named above.
-->
