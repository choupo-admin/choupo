# A saturation curve with two homes

*2026-10-06.  DEV.md §4c C39 (the finding filed under C37 item 6).  Gate:
`check_inlet_resolution` arm (l).*

## 1. The defect

A case may declare, in `constant/thermoPhysPropDict`,

    pureFluids { water { method IF97; } }

and the package then prices pure water's ENTHALPY, entropy, volume and
transport on the IAPWS-IF97 fundamental equation (`ThermoPackage::Hliquid`,
`Hvapour`, `H_real`, `H_stream_formation`, ... through `pureFluidRoute`).
Every SATURATION PRESSURE the package handed out, however, still read the
component record's Antoine fit: `ThermoPackage::K`, the Raoult/gamma-phi
branch of `Kvec`, `Kvec_Raoult`, and the Henry Poynting anchor of a solvent
all called `components_[i].vp().Psat_Pa(T)`.

Water's record Antoine (5.40221, 1838.675, -31.737) boils at **372.09 K** at
1 bar; IF97's region 4 at **372.76 K**.  A stream of pure water at 1 bar
between the two was a VAPOUR to the flash (K > 1 on the record's curve) and
a LIQUID to the enthalpy surface the same package priced it on.  This is the
CLAUDE.md §6 family THE STATE A UNIT COMPUTES WITH IS NOT THE STATE ITS
STREAMS CARRY, and its second home was a correlation nobody switched off when
the method was declared.

The run header said the opposite.  The v2 builder announces, on every IF97
case, that "the declared surface REPLACES the component-correlation routes it
covers -- saturation dome (Psat), caloric (h/s/Cp), volumetric (v/rho) and
transport".  The dome was the one route it did not replace: the 2026-08-04
banner trap (a sentence describing a model that is not running).

Found by the general working C37 item 6 on `condenser01_film_nusselt`, whose
steam the C36 measurement had recorded as "0.67 K superheated" -- superheated
against the record's curve, and 0.004 K above IF97's boiling point, the curve
the case declares.

## 2. The rule

**A declared pure-fluid method OWNS its component's saturation curve wherever
the package is asked for it.**

ONE home: `saturationPressure(const Component&, const PureFluidModel*, T)`
(`src/thermo/pureFluid/SaturationCurve.{H,cpp}`).

* Inside the method's own window -- `PureFluidModel::saturationWindow()`, a
  new pure virtual; IF97 returns region 4, 273.15 .. 647.096 K -- the answer
  is the method's `p_sat(T)`.
* Outside it the method HAS no saturation curve: above the critical point
  there is none at all, and below the triple point the liquid line it draws
  does not exist (IF97's `psat` throws there, by design).  The record's own
  correlation answers, extrapolated exactly as it is for every other
  component, and the substitution is ANNOUNCED once per component and side
  (`AdvisoryLog::addAnnouncedOnce`, a `[pure-fluid]` line, the caveat block).
  A flagged component whose record carries no correlation refuses by name
  there.
* A component with no declared method reads its record exactly as before, so
  **a package with no `pureFluids {}` is byte-identical** (measured, §5).

Two doors reach the one home, and neither carries a copy of the rule:

* `ThermoPackage::Psat(i, T)` (+ `hasSaturationCurve(i)`), for every caller
  that holds the package;
* the phase layer (`LiquidPhase::fEffective`, `SolidPhase::fEffective`), which
  sits BELOW the package and cannot include it.  The package hands every
  phase a pointer to its method map (`Phase::rebindPureFluids`, beside the
  existing `rebindComponents`, re-pointed when the package moves), so a
  liquid's reference fugacity and a crystal's read the same curve as `Kvec`
  -- otherwise `Kvec` and `Kvec_phases` would boil water at two temperatures.

Why not a `ThermoPackage` member alone, as the brief proposed: the phases
compute fugacities from the record directly and are owned by the package, so
a member the phases cannot call would leave them a second home.  The member is
the package's door; the free function is the rule.

## 3. The sites, enumerated (the 2026-09-25 rule)

Every record saturation read in `src/` at `a99e59370`: 32 lines of
`vp().Psat_Pa` (outside comments) and 3 of `vp.Psat_Pa` through a local
reference -- 35 in all.  (The brief that commissioned this counted 24.)

**Routed through the one home (28 lines):**

| Site | Through |
|---|---|
| `ThermoPackage.cpp` `K`, `Kvec` (Raoult and the Henry solvent's Poynting anchor), `Kvec_Raoult` | `Psat(i, T)` |
| `LiquidPhase.cpp` `fEffective`; `SolidPhase.cpp` `fEffective` | `saturationPressure` with the bound method |
| `IsothermalFlash.cpp` VLLE Gibbs objective; the flash header's `Psat =` print | `thermo.Psat` / `hasSaturationCurve` |
| `gibbsMethod/ElementPotential.cpp`, `DirectMin.cpp`, `ReactiveFlash.cpp` (condensed-phase tests and `ln(Psat/P0)`) | `thermo.Psat` |
| `SprayDryer.cpp` (wet bulb's `Ysat`, the exhaust a_w), `SolidDryer.cpp` (the air's a_w), `EvaporativeDryer.cpp` (exhaust a_w), `Evaporator.cpp` (both `P_op`), `CoolingTower.cpp` (which inlet is the liquid) | `thermo.Psat` |
| `Psychrometry.H` `Ysat`, `airWaterActivity`, `wetBulb` (5 lines) -- the helpers now take `(thermo, iMoist)` instead of a `Component`, so `CoolingTower`, `ConvectiveDryer`, `BatchDryer` and `SolidDryer` reach the package through them | `thermo.Psat` |
| props ops holding a package: `VleConsistency.cpp` (gamma from data), `PropertyEvaluator.cpp` (the `Psat` property of a scan), `PurePhaseDiagram.cpp`, `PsychrometricChart.cpp` | `thermo.Psat` |

**Left, each with its reason (7 lines in 6 files, plus the one home itself;
`check_inlet_resolution` arm (l1) lists the 7 files in `SAT_READ_ALLOWED`
and fails on a record saturation read in any other):**

| Site | Why it is not routed |
|---|---|
| `SaturationCurve.cpp` | the one home itself: the record answers where no method is declared and outside the method's window |
| `Component.cpp:1240` | the record's own formation-entropy leg at 298.15 K, inside `Component`, below the package; a flagged component's entropy is priced by the method when pure |
| `ThermoPackageBuilder.cpp:1270` | the reactive electrolyte builder (`electrolyteGammaPhi`); that formulation REFUSES a `pureFluids {}` block (`ThermoPackageBuilder.cpp`, "transport/pureFluids on formulation ... is not wired natively"), so no flagged component reaches it |
| `Speciate.cpp:584` | a props op reading a BARE record (`database()->loadComponent("water")`): no package, so no declared method |
| `FreezingPoint.cpp:87` | a props op building its own `SolidPhase` from a bare record: its liquid leg and its crystal read the same record, consistent by construction |
| `Heater.cpp:385,391`, `PhaseChanger.cpp:81` | the dome bisection (150 .. 1200 K) for a dominant component that is NOT effectively pure.  A flagged component that IS pure already takes `pureFluid(dom).T_sat` on the line above; a flagged component in a mixed phase is refused by the enthalpy route (`pureFluidRoute`, "IF97 is a pure-water method") before the bisection is reached.  Routing it would only make every bracket trial outside 273.15 .. 647.096 K announce a substitution about a temperature no answer sits at |

## 4. What this does NOT do, said plainly

* **The pure-fluid route is still pure-only.**  IF97 water in a MIXED phase
  (humid air, a brine) is refused by the enthalpy route, as before; the
  saturation pressure is now IF97's in a mixture too (a pure-component
  property is a pure-component property), but no corpus case puts a flagged
  component in a mixture, because the enthalpy refuses it.
* **The six spray-dryer cases do not declare IF97.**  The brief listed them
  among the IF97 cases; their `thermoPhysPropDict` names `pureFluids` only in
  a header COMMENT ("flag water IF97 in a pureFluids block and the accessor
  routes to IAPWS R1-76 instead").  The corpus has SEVEN IF97 packages:
  `rankine02_water`, `reboiler_water_copper`, `condenser01_film_nusselt`,
  `hxWorkflow1_design_from_duty`, `hxWorkflow2_rate_designed`,
  `heatExchanger02_geometry_U`, `steam02_water_transport`.
* **Latent heats and boiling points other than through Psat** (`Hvap_latent`,
  `Tb`, Watson) are not part of this rule; they are separate record reads,
  and a flagged component's enthalpies already come from the method.
* **The critical temperature** a unit reads (`Component::Tc()`, e.g. the
  psychrometric wet bulb's ceiling) is the record's, not the method's.  Water's
  record and IF97 agree to the second decimal there; the window edge is
  announced where they disagree.

## 5. Measured

* Build clean (`check_compile_clean`); `check_layering` green (the new file
  sits inside `thermo`, the phases include it from below the package).
* The seven IF97 cases PASS their goldens; `bin/runTests --fast` PASS 68 /
  FAIL 0 / EXPECTED-FAIL 5.
* Byte-identity, against a build of `a99e59370` in a separate tree, every
  output file compared after stripping the two tree roots, the banner's
  commit tag and timestamps: 151 cases -- the `tutorials/FASTSET`, every case
  of `steady/drying`, `steady/evaporation`, `batch/drying`, `steady/gibbs`
  and `steady/flash`, `coolingTower01_merkel`, the props witnesses of the
  routed ops (`compare_vle_etoh_water`, `phase01_water_full`,
  `psychro02_air_water`), the flagship and the seven IF97 cases.  **150 are
  byte-identical, among them six of the seven IF97 cases**: no state they
  carry sits between the two curves in a way that changes a phase.
* The one that moved, `rankine02_water`, moved NO NUMBER (its `converged/`,
  its KPIs and every report are identical).  What changed is what it SAYS:
    - GONE: `[phase] stream 'condensate' is priced as LIQUID (vf = 0) at
      T = 446.516 K, P = 8.5859 bar, but its own Rachford-Rice residual
      there is g(V=0) = 0.0852256, i.e. it is ABOVE its bubble point`.
      446.516 K IS IF97's boiling point at 8.5859 bar -- the condenser
      leaves a saturated liquid, by declaration -- and the accusation was
      the record's Antoine, extrapolated 73 K past its window, disagreeing
      with the curve the case declares.  The defect's own symptom, visible
      at exit 0 in the caveat block of the IF97 reference case, and nobody
      had read it as such.
    - GONE: the two record-Antoine extrapolation warnings at 446.516 and
      571.979 K (those temperatures are inside IF97's window now).
    - NEW: `[pure-fluid] water: ... asked at T = 773.15 K (ABOVE its
      critical point ...), the component record's own vapour-pressure
      correlation answers there instead`, and with it the record's own
      `[psat] ... ABOVE its critical temperature` line -- the superheated
      boiler outlet.  The base build asked the record at 773.15 K too; its
      warning was latched by the first out-of-window call (the record's
      `announcedOutside_` is once per instance), so it never printed.

## 6. Moved rows

**None.**  No golden row moves on any of the 151 cases compared; nothing to
re-record.
