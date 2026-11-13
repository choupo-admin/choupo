# The density pilot: methods, resolution, records and the two units (C378)

Kind: PLAN.  Status: BUILT on branch `c378-pilot` (2026-11-13, steps 1-9),
reviewed by measurement (docs/reviews/2026-11-13-c378-pilot/) and corrected
in a second round (PA-01..05, PB-01 and the S3 rows); NOT yet on `main`.
What was built is described by the Theory Guide's
`sec:liquid-density-methods` and the settled contract; this plan stays the
record of the decisions as they were taken, and its `file:line` references
are to the planning tree named below, not to the built one.  Bound by
[`thermophysical-property-routes.md`](thermophysical-property-routes.md) (first
section, amendment blocks, TR-01..21), [`density-pilot-thresholds.md`](density-pilot-thresholds.md)
(baseline, thresholds, the seven corrections of its section 4) and
[`thermophysical-slice0-plan.md`](thermophysical-slice0-plan.md).  Tree: branch
`c378-pilot-plan` = `origin/c378-slice0` (dc57ccf9b) + `origin/main` (4719b4f1c);
every `file:line` is on it.  Runs: the primary checkout's `choupoSolve` and
`choupoProps` (commit c6b3ccbcf, main, WITHOUT the door) on scratch copies of
the 32 shipped cases with a pump or a CSTR and on property cases built by
`data/curation/batches/density_pilot/scripts/engine_rho.py`; the door is read,
not run.  Disagreements with rulings: section 13.

## 1. The methods as code objects

One base, `DensityMethod`, in a new folder `src/thermo/liquidProperty/`, with
the explicit factory of every base (`registerType`, `New`, `registerBuiltins`
called from each binary's main; CLAUDE.md section 5).  A method answers ONE
request (liquid, T, P, the phase's mole fractions over package components)
with the slice-0 `Result` (LiquidPropertyDoor.H:85-93) or throws the typed
error (PropertyDomainError.H:44-64).  It declares: `returns`, the facts it
needs, its domain and its evidence.  `<cs>` = the constituent set (components
with x > 0, the same test as ThermoPackage.cpp:2346-2351).

| id | kind | returns | needs | domain | evidence | file | today's behaviour, and what the pilot does to it |
|---|---|---|---|---|---|---|---|
| `recordVolume.anchoredRackett` | leaf | v_i(T) | `Vliq`, Tc, Pc, omega | hard T < Tc (ThermoPackage.cpp:2505); P not taken (announced once per method and site) | "not quantified" (the record's `Vliq` provenance) | `RecordVolumeLeaf.{H,cpp}` | KEPT bit for bit: calls `liquidMolarVolumeOf` (:2427-2521), route chosen by `liquidVolumeRouteOf` (:2539-2546); renamed from `liquidVolume.anchoredRackett` (LiquidPropertyDoor.cpp:37) |
| `recordVolume.flatVliq` | leaf | v_i, constant | `Vliq`, no Tc | none declared; "no temperature effect" announced | as above | same | KEPT bit for bit (:2460-2470) |
| `recordVolume.bareRackett` | leaf, tier 4 | v_i(T) | Tc, Pc, omega | hard T < Tc | origin `estimated` | same | KEPT bit for bit (:2472-2482); a composite with this leaf takes tier 4 |
| `pureFluid.<IF97 or Helmholtz>` | direct (set {i}) and leaf | rho or v_i at (T, P) | the case's `pureFluids` selection (ThermoPackageBuilder.cpp:2755-2771) | hard: liquid branch only (below) | the record's / the release's | `PureFluidLeaf.{H,cpp}` | CHANGED: today the package returns the STABLE phase at (T, P) whatever phase was asked (ThermoPackage.cpp:2286-2302, `v_molar` has no phase argument, PureFluidModel.H:118); the pilot evaluates the LIQUID branch (rule below).  Today a selected pure fluid in any mixture throws (:1402-1412); as a leaf it no longer does (density only) |
| `referenceEquation` | direct and leaf, tier 2b | rho or v_i at (T, P) | a Helmholtz record whose `fluid` is the component (IAPWS95.dat:43, SpanWagner1996.dat:20), found as `ReferenceFluid::load` finds one (case-local, then standards, ReferenceFluid.cpp:79-86) | as `pureFluid` | the record's `uncertainty` (IAPWS95.dat:66) | same file | NEW (consequence (a), section 3) |
| `idealMixing` | composite | rho = sum(x_i M_i) / sum(x_i v_i) | one leaf per constituent, or a hypothesis for it | intersection of the leaves' | "not quantified"; weakest leaf's tier | `IdealMixing.{H,cpp}` | RENAMED from `liquidVolume.idealMix[...]` (LiquidPropertyDoor.cpp:123-150); same arithmetic as ThermoPackage.cpp:2346-2355 |
| `solutionLaw` | direct, tier 2b | per the record's `returns` (pilot: `solutionDensity`) | a solution record whose constituent set equals `<cs>` | the record's, HARD | the record's `uncertainty` | `SolutionLaw.{H,cpp}` + `forms/` | NEW (section 4) |
| `measured` | direct, tier 1 | the measured value, constant in its box | a case experiment marked as a method | the box, HARD | the file's uncertainty and provenance | `Measured.{H,cpp}` | NEW (section 5) |
| hypothesis `massWithoutVolume` | leaf rule | v_i = 0, mass kept | `approximations { massWithoutVolume }` | `maxMassFraction`, HARD | "not quantified"; the bound of AqueousVolumetric.H:39-44 quoted | `MassWithoutVolume.{H,cpp}` | NAMES what the pump does to an ion (Pump.cpp:100-134, :316-322): declared, bounded, reported (section 6) |
| -- | -- | -- | -- | -- | -- | -- | REMOVED in the two units: the pump's 1000 kg/m3 when no component has a volume (Pump.cpp:316-325, `liquidSource::pumpHeadDensityFallback`) becomes a refusal; the CSTR's test of EVERY package component (CSTR.cpp:244-249, :660-664; slice-0 finding 5) becomes the present constituents only |

**The liquid branch of a pure-fluid method** (run here): at
rankine02's pump inlet (446.515894355 K, 858590.397228 Pa, the condenser's
saturated liquid) IF97 at (T, P) returns 4.45 kg/m3, a vapour; at P(1 + 1e-6)
893.99, at P(1 - 1e-6) 4.45.  Rule: a SET {i} asked for a liquid is priced
at (T, max(P, p_sat(T))) when T <= T_sat(P) + 1 mK, and is an
`outsideHardDomain` error otherwise ("pure water at 373.15 K and 1 bar is a
vapour": the thresholds' D1 FAIL condition); a LEAF in a mixture below its own
p_sat is the saturated liquid at T (the hypothetical-liquid convention the
Rackett leaves already follow), announced once per method and site; T >= Tc
of the record is hard for both.

**Where the kernel is reached.**  Slice 0's `liquidProperty::evaluate` already
serves seven consumer files as a wrapper (Valve.cpp:301, PhaseChanger.cpp:866-869,
PhaseDensity.cpp:126, GasStoreSize.cpp:659, ShellTubeHX.cpp:232-236,
PipeHeaderSize.cpp:200, SpiralWoundModule.cpp:410); changing it moves them
all.  So the pilot adds `liquidProperty::density(const Request&)` beside it
and only the pump and the CSTR call it.  A valve and a pump on one liquid then
carry two densities, printed by PropertySourceLog's "same liquid, two numbers"
line: the per-consumer convergence the third amendment block asks for.

## 2. Resolution

**Facts read**, all positive, none a class or a component name:

| fact | read from |
|---|---|
| the constituent set and its basis | the request's x (mole, package components); `analytical` = those components as written; a speciated stream is a different set |
| the case's pure-fluid selection | `pureFluids` (ThermoPackageBuilder.cpp:2755-2771; gammaPhi only, :2104) |
| a reference record for a component | `parameters/Helmholtz/*.dat` with `fluid <name>` |
| a component's volume data | `Vliq`, Tc, Pc (`liquidVolumeRouteOf`, ThermoPackage.cpp:2539-2546) |
| a solution record for the set | `parameters/solution/<set>.dat` (section 4) |
| a declared solute role | the diluteSolution `solutes` group (ThermoPackageBuilder.cpp:2582-2583) |
| a measurement marked for use; a hypothesis | the case's `thermoPhysPropDict` (sections 5, 6) |

**Precedence as it will be implemented** (routes record 3.3 and rule 4):
(1) a `measured` method marked for use whose set equals `<cs>`; (2b) a record
law for exactly `<cs>`: the case's `pureFluids` (an explicit act, it pins:
TR-07), else `referenceEquation`, for a one-constituent set; `solutionLaw`
for a set of two or more; (3) `idealMixing`, each leaf by
`pureFluid` > `referenceEquation` > `anchoredRackett` > `flatVliq` >
`bareRackett` (tier 4) > `massWithoutVolume` (only if declared); (5) refusal
naming every method passed over and why.  A constituent declared a Henry
solute has no pure-liquid leaf (its volume is a partial molar volume): its
leaf is `v_inf` (not in the pilot) or the hypothesis, else refusal.

**When.**  At assembly the set of every authored inlet (`0/`) is resolved and
printed; a set first met during the solve is resolved at its first request
and FROZEN for the run.  The choice is a function of the set only, never of
T, P or the amounts: the state switch at x >= 0.999 (ThermoPackage.cpp:1369-1373,
:1400, the threshold ThermoPackage.H:773-774) disappears from the kernel; with
the reference leaf (section 3a) idealMixing at x_water -> 1 tends to the
pure-set value, so the two sets are continuous.

**Ties.**  Today water has two routes and the STATE picks: with `pureFluids`
the pure-fluid formulation when x >= 0.999, a refusal in any mixture; without,
the record's `Vliq`.  Pilot: the case's `pureFluids` pins water's method in
every set (leaf included); without it `referenceEquation` applies by fact; two
reference records naming one `fluid` in one tier refuse at assembly naming both
(TR-07).  The method pinned by the case prints the one it passed over and,
both being valid, the deviation (amendment 2).

**The printed table** gains, per (consumer, set): `method`, `leaves` (component,
leaf method, share, the temperature its datum is stated at), `passed over`
(method: reason), `domain` (inside / soft, announced / which hard limit),
`pressure` (applied / not applied, reference P), `evidence`.  As it would print
for D3b (section 8):

    [properties] liquid density, resolved per constituent set
      set {NaOH, water}  pump P1, cstr R1   measured NaOH20_303K (box T 301.65-304.65 K, w[NaOH] 0.199-0.201)
        value 1213.8 kg/m3; replaces solutionLaw NaOH-water (1212.70 there, -0.09 %, inside its stated 0.23 %)
        passed over: idealMixing (NaOH has no liquid volume and no hypothesis covers it)

| binary | resolution |
|---|---|
| choupoSolve | one per package; a unit's `thermo {}` override has its own (none reaches a pump or CSTR, slice-0 finding 8) |
| choupoBatch, choupoCtrl, choupoSemiContinuous | the same resolver at assembly; no shipped time-integrated case has either unit (grep), nothing moves; instants aggregate as in slice 0 |
| choupoProps | must load the solution records (today only choupoSolve main.cpp:609, choupoBatch main.cpp:261, DynamicDriver.cpp:429 do) |
| outer driver | passes share it; a pass resolving the SAME stream's set to another method is refused (TR-15); amounts never change it (pumpSystem01, 13 passes; sugarPlantEconomicsSweep varies a mole fraction, set unchanged) |

## 3. The three consequences of the baseline, with their cost

Reach, measured (`grep -rlE '\btype\s+(pump|cstr)\s*;' tutorials`, the case
folder above each hit, each case run on a scratch copy): **32 cases** (9 with a
pump, 23 with a CSTR), **37 units** (13 pumps, 24 CSTRs).  Inlet states and
today's versus the door's idealMixing density (anchored leaves at the inlet T,
the case's own component records):

| case | unit | inlet T (K), P (bar) | inlet | today kg/m3 | pilot, anchored leaves | note |
|---|---|---|---|---|---|---|
| pump01_water, pump02_pressure_spec | pump | 298.15, 1 | water | 996.96 | 996.96 | bit for bit |
| pumpSystem01_operating_point | pump | 298.15, 3 | water | 996.96 | 996.96 | outer driver |
| rankine02_water | feedPump | 446.52, 8.59 (sat.) | water, IF97 | 996.96 | 893.99 (IF97 liquid) | -10.3 % |
| aceticAcid02_plant | methanolPump | 300.00, 1.01 | methanol | 787.27 | 785.12 | -0.27 % |
| membrane21 / membrane22 | Booster | 293.15, 1.3 | water + ions (x 4.5e-4 / 2.6e-4) | 997.60 | 1002.20 | +0.46 % |
| membrane27_swro_energy_recovery | HPpump, Booster | 298.15, 2 / 53.4 | water + NaCl (x 0.0104 / 0.0107) | 1030.94 / 1031.94 | same | ions |
| swro01_campoDalias | 4 pumps | 298.15, 1-56.1 | water + NaCl (x to 0.0111) + boron | 996.96-1033.26 | same | ions |
| 13 CSTR cases on ethanol + acetic acid (cstr07: methanol) | reactor | 333.15-360 | molecular | 914.68 (937.63) | 836.34-912.47 | -0.24 % (300 K) to -8.56 % (360 K) |
| process03_recycle, recycle_autoinit_tear | reactor | 355.96 | + 0.21 water | 919.46 | 847.28 | -7.85 % |
| process05, recycle02_dominant_eigenvalue | reactor | 324.53, 5 | pentanes | 594.93 | 563.20 | -5.33 % |
| cstr03_series_selectivity | reactor | 350 | compA | 375.00 | 346.34 | -7.64 % |
| cstr08_furusawa_bistable | reactor | 284.30 | 0.87 water + methanol + PO | 939.05 | 953.25 | +1.51 % |
| ChemicalPlantTutorial, sugarPlantEconomicsSweep | Fermentor | 314.9 | water, sucrose, ethanol, CO2 2.5e-4 | flat | REFUSED: CO2 above Tc | needs a hypothesis |
| cstr02_reversible_wgs | wgs | 600, 10, vapour | CO + water | 859.16 | REFUSED: CO above Tc | gas fed to a liquid basis (Q6) |
| userOp03_case_rate_law | 2 reactors | 350 | isomers | -- | moves by Rackett | needs its `code/` built; not run |

So: away from 25 C, **27 cases** (all 23 CSTR cases; pumps in aceticAcid02,
membrane21, membrane22, rankine02); dissolved ions, **4 cases / 8 pump units,
no CSTR**; water in a mixture at a pump or CSTR, **10 cases** (the 4 ion cases;
cstr02, cstr08, process03, recycle_autoinit_tear and the two Fermentors).

| consequence | proposal | cost in moved cases |
|---|---|---|
| (a) the water leaf inside a mixture is the generic route (-2.6 % at 348 K; anchored Rackett on water: -0.99 % at 284.3 K, +1.04 % at 314.9 K, +2.99 % at 356 K against IAPWS-95, run) | YES: `referenceEquation` by fact for any constituent with a Helmholtz record (water, CO2, N2, CH4 today), as a leaf and as a one-constituent set | ZERO beyond those already moving: every case where it changes a number above the goldens' reltol (1e-4) is away from 25 C and moves anyway (membrane21/22, cstr08, process03, recycle_autoinit_tear, the Fermentors); at 298.15 K, 1 bar it changes water by +0.0088 % (997.0470 vs 996.96), under reltol.  It removes the x >= 0.999 switch.  Self-contained cases need the record copied into `constant/parameters/Helmholtz/` by the seal (Q1) |
| (b) pressure on that leaf (D4 needs it: water -2 % at 20 MPa on the generic route) | YES, it comes with (a): the reference method takes P; the Rackett leaves stay without it, announced once per method and site | THREE more cases, all at 25 C: membrane27 (HPpump +0.013 % at 2 bar, Booster +0.245 % at 53.4 bar), swro01 (HPpump +0.013 %, Booster +0.257 % at 56.1 bar), pumpSystem01 (+0.018 % at 3 bar); values run on IAPWS-95: 997.092 / 999.398 / 999.518 / 997.137 kg/m3 |
| (c) the pump stops answering for a salt it cannot price | YES, as ruled: an ion without a volume and without a declared hypothesis is refused | the 4 ion cases and the 2 Fermentor cases (CO2) must declare `massWithoutVolume` (section 6); with it each prints the same number as today at 298.15 K except for (b) |

What each ion case prints today, and needs:

| case | today (log, run) | needs |
|---|---|---|
| membrane21_two_stage_nf_array | `[pump] dissolved ion(s) (Na Cl NO3 NH4) carry no liquid molar volume ... ion mole fraction 0.000454 neglected` | `massWithoutVolume { components ( Na Cl NO3 NH4 ); maxMassFraction 0.005; }`, w about 9e-4 |
| membrane22_two_stage_nf_array_dspmde | same words, (NaCl CaCl2 MgSO4), 0.000256 | the same with its three salts |
| membrane27_swro_energy_recovery | same words, (NaCl), 0.0104 | `components ( NaCl ); maxMassFraction 0.05;` (w 0.034) |
| swro01_campoDalias | same words, 0.0111 / 0.0105 / 0.0107 / 3.38e-05 | as membrane27 (w 0.035); `boron` is a flat-`Vliq` leaf, unchanged |
| ChemicalPlantTutorial, sugarPlantEconomicsSweep | nothing (flat 47 cm3/mol for CO2 at 315 K) | `components ( CO2 ); maxMassFraction 1e-3;` (w 4.2e-4) |

## 4. The solution record

Home `data/standards/parameters/solution/NaOH-water.dat`, overridable in the
case's `constant/parameters/solution/`.  Form copied from `sucrose-water.dat`
(`solute`, `solvent` -- the roles the pair already states -- and one block per
property); `dHsoln` is absent because the paper gives no heat of solution in
this form.

    solute      NaOH;
    solvent     water;
    liquidDensity
    {
        returns       solutionDensity;
        form          polynomialTSqrtX;     // rho = sum_j t^j sum_k c_jk x^(k/2)
        variable      w[water];             // kg water / kg solution (nomenclature pp. 792-793)
        temperatureOrigin 273.15 K;         // t = T - 273.15 K, as the paper writes t in degC
        coefficients                        // Table IV, p. 785; rows j = 0 1 2, columns k = 0..5
        (
            ( 5007.2279636 -25131.164248 74107.692582 -104657.48684 69821.773186 -18145.911810 )
            ( -64.786269079 525.34360564 -1608.4471903 2350.9753235 -1660.9035108 457.64374355 )
            ( 0.24436776978 -1.9737722344 6.04601497138 -8.9090614947 6.37146769397 -1.7816083111 )
        );
        domain                              // Table III, p. 783: x_min per t band, x_max 1
        (
            { T (273.15 283.15) K; w[water] (0.800 1); }
            { T (283.15 293.15) K; w[water] (0.700 1); }
            { T (293.15 333.15) K; w[water] (0.500 1); }
            { T (333.15 343.15) K; w[water] (0.400 1); }
            { T (343.15 423.15) K; w[water] (0.300 1); }
            { T (423.15 473.15) K; w[water] (0.200 1); }
        );
        pressure      notCarried;           // no P in Eqs. (6)-(9); data near atmospheric
        provenance
        {
            origin       literature;
            citation     "J. Olsson, A. Jernqvist and G. Aly, Int. J. Thermophys. 18 (1997) 779-793, Eqs. (6)-(9) p. 785, Table IV p. 785, Table III p. 783";
            uncertainty  "156 points of Krey (1972): mean 0.48 kg/m3 (0.04 %), max 2.41 kg/m3 (0.23 %), pp. 785-786";
            maxDeviation 2.41 kg/m3;        // the number a disagreement is counted against (rule 5)
            read         "page images, 150 and 300 dpi, twice (docs/design/naoh-water-olsson1997.md 1.2)";
        }
    }

Check values a load test reproduces: 997.608 kg/m3 at x = 1, 20 C; 1522.92 at
50 wt %, 20 C; 1212.699 at w[NaOH] 0.20, 303.15 K (evaluated here from the 18
coefficients; the transcription was checked against the page image, thresholds
note 3.3).

| item | decision |
|---|---|
| lookup | by the constituent SET, sorted case-insensitively (`NaOH-water`); for the eleven existing files the set name equals today's key `solute + "-" + solvent` (SolutionRegistry.cpp:43-46), so no file is renamed |
| reader | `SolutionPair::readFromDict` requires `dHsoln` (SolutionPair.cpp:45): it becomes optional when the file carries another property block, and a file with neither is refused; the registry scans `constant/parameters/solution/` before the standards (today standards only, SolutionRegistry.cpp:58); a duplicate set is refused as today (:61, :72) |
| refusals | `returns` outside {solutionDensity} in the pilot; a `form` not in the registry; coefficient matrix not 3 x 6 for this form; a domain band without both limits; a `variable` whose component is not in the set; the set of the request not EQUAL to the record's (a third constituent -> the method is passed over, never applied); a state outside every band -> `outsideHardDomain` naming the band and the record; a speciated stream offered to an analytical record -> passed over naming the basis |
| the other NaOH-water file | `parameters/OlssonNaOH/NaOH-water.dat` is the coefficient record of an ACTIVITY model selected by `model OlssonNaOH` (its header, lines 8-11); the density law applies whatever activity model the case chooses, so it lives with the system's property laws.  Two files for one set, of two kinds: section 13 |
| forms registry | ONE form in the pilot, `polynomialTSqrtX` (returns kinds: `solutionDensity`, kg/m3 coefficients; dimension-checked against `returns`), its labelled Theory Guide section and its witness (D3 a) |

## 5. The measurement

The data stay in the experiments format the tree already reads
(`tutorials/props/compare/*/constant/experiments/*.dat`: `provenance`,
`columns`, `data`); the case marks the file as a method in its
`thermoPhysPropDict`:

    // constant/experiments/NaOH20_303K.dat
    provenance { origin literature; citation "Galindo-Luna et al., J. Chem. Eng. Data 64 (2019) 5302-5311, DOI 10.1021/acs.jced.9b00536"; }
    property     liquidDensity;
    columns      ( { name T; unit K; } { name P; unit kPa; } { name w[NaOH]; unit -; } { name rho; unit kg/m3; } );
    data         ( ( 303.15  100  0.200  1213.8 ) );
    uncertainty  2.0 kg/m3;                 // expanded, 95 %
    box          { T (301.65 304.65) K; P (50 1500) kPa; w[NaOH] (0.199 0.201); }

    // constant/thermoPhysPropDict
    volumetric { liquid { measured
    {
        NaOH20_303K { use method; replaces { method solutionLaw; record NaOH-water; } reason "lab point of our caustic"; }
        NaOH20_333K { use check; }
    } } }

| rule | what the engine does |
|---|---|
| set | the columns' composition variables plus the solvent of their basis: {NaOH, water}; `basis` is not written (it follows from `w[...]`) |
| box | hard (rule 7, TR-01): outside it the method returns `outsideHardDomain` "outside the box the case declared for NaOH20_303K (T 301.65-304.65 K)"; it NEVER hands over |
| box versus uncertainty | when a catalogue law exists for the set, the engine evaluates the law's span over the box's corners; a span above `uncertainty` makes the box a hypothesis: `reason` mandatory, values away from the point printed `origin assumed`.  With no law, `reason` is always mandatory ("box not judged") |
| `use method` | displaces a catalogue method only if `replaces` names one that applies to the set; naming none, or one that does not apply, is refused at assembly; `use method` without `replaces` where a catalogue method applies is refused (amendment 2 of the third block) |
| `use check` | the value is never used; inside its box the run prints measured beside computed and the deviation; outside it, "not at its conditions" and the distance |
| table | `measured NaOH20_303K`, its box, the method it replaced with that method's value and the deviation, counted when above `maxDeviation` |

**D3b by hand** (thresholds note 3.4; flowsheet in section 8; the units see
1 kg/s at 303.15 K, w[NaOH] 0.20; pump dP 2 bar, eta 0.7; V_R 1 m3):

| quantity | value |
|---|---|
| Q = m / rho; tau = V rho / m | 8.2386e-4 m3/s; 1213.8 s |
| W_shaft = Q dP / eta; head = dP / (rho g) | 235.39 W; 16.802 m |
| the law at the point | 1212.70 kg/m3, -0.09 %: inside its 0.23 %, printed, not counted |
| the box | dRho/dT = -0.517 kg/m3/K, dRho/dw[NaOH] = 1084 kg/m3 (from the 18 coefficients): +-1.5 K and +-0.001 span +-1.86 <= U 2.0; the thresholds note's +-3 K with +-0.002 spans +-3.7, a hypothesis |
| at 333.15 K | marked: REFUSED (domain error); check-only: "not at its conditions (30 K)", the law 1196.16 (measured 1196.1) |

## 6. `massWithoutVolume`

    approximations
    {
        massWithoutVolume
        {
            components      ( NaCl );
            maxMassFraction 0.05;
            reason          "seawater RO feed: the salt's volume neglected (engine bound about +1.8 % on rho at 1 mol/kg, AqueousVolumetric.H:39-44)";
        }
    }

| item | rule |
|---|---|
| equation | rho = sum over all i of x_i M_i / sum over unlisted i of x_i v_i; binary: rho_solvent / (1 - w_solute) |
| limit | the SUM of the listed components' mass fractions in the phase; above it `outsideHardDomain`, naming the limit and that the case declared it |
| parser | a fourth word of the one parser (ApproximationAuthorisation.H:115, word list :130): unknown word and missing `reason` refused as today; `components`, `maxMassFraction` mandatory |
| scope | a leaf of `idealMixing` only; never in front of a solution record that applies (tier 2b wins) |
| report | result's hypotheses block and log, per word and site: used / unused, largest fraction covered, stream and unit |
| the pump today | ions with an aqueous bridge out of the volume, mass kept (Pump.cpp:100-119, :316-322) IS this hypothesis, undeclared; the pilot makes the declaration mandatory; the Cp share (Pump.cpp:236-242, enthalpy, outside the pilot) reads the word's list instead of `Vliq() <= 0` |

## 7. The domain error and the solvers

| solver in the pilot's flowsheets | can it reject a trial today? |
|---|---|
| pump | no iteration: closed form (Pump.cpp:136-180) |
| CSTR extent Newton | never sees a density: the volume is taken once at the feed state before it (CSTR.cpp:244-253, :657-669) |
| Wegstein / direct substitution on tears | yes: a sweep throwing `InfeasibleTrial` is a rejected extrapolation, direct substitution from the last image (Flowsheet.cpp:3523-3549); fatal for the seed (:3525-3536) |
| Newton on tears | yes, line search (NewtonND.cpp:933, :947); last iterate (Flowsheet.cpp:3629) |
| 1-D safeguarded Newton | yes (NewtonRaphson.cpp:118-124) |
| designSpec | turns an unconverged pass into `InfeasibleTrial` (DesignSpec.cpp:264-273); a thrown error inside a pass is fatal |

Proposal: the new entry throws `PropertyDomainTrial`, deriving from
`InfeasibleTrial`, for `outsideHardDomain` and `invalidState` (slice 0's
`PropertyDomainError` stays as it is for the wrapper's callers); `missingDatum`
is a resolution failure and is reported at assembly, never per state.  Where
no solver rejects (a once-through flowsheet, a seed, the final sweep) the
error reaches main's handler and the run fails with the remedy, as today's
refusals do.

## 8. The demonstration cases

New family `tutorials/steady/thermo/` (exists; `tutorials/FASTSET` gains one
row, `check_fastset`).  Each: feed -> pump P1 (dP 2 bar, eta 0.7) -> CSTR R1
(V_R 1 m3, isothermal at its feed T) -> product.  A CSTR needs a reaction
(CSTR.cpp:108-190): each declares one whose reactant is absent from the feed
(rate zero, said in the header; Q4).  Data from
`data/curation/batches/density_pilot/` regenerated by its scripts.

| demo, case | held to | PASS (proposed; the architect writes the final) | FAIL | negative control |
|---|---|---|---|---|
| D1 `liquidDensity01_water` (1 bar 273.16-372 K; 298.15 K at 1 and 500 bar; no `pureFluids`) | Wagner & Pruss Tables 13.1-13.2 (`d1_anchors.tsv`, the 187-state file) | the thresholds note's four, unchanged: units equal the kernel to 1e-9; kernel within 0.001 % (Helmholtz); maximum between 275 and 280 K; 500 bar differs and lies within 0.005 % of 1018.4 | 996.96 at 500 bar; 373.15 K at 1 bar answered (it must be a domain error: vapour) | today's binary: 3.5 % at 1 bar, 5.8 % at 50 MPa |
| D2 `liquidDensity02_waterEthanol` (x_ethanol 0.25, three isotherms) | Pecar & Dolecek 2005; Rehman & Ansari 2008 | AAD and max of the thresholds note SCORED AT 298.15 AND 323.15 K; 348.15 K reported (Q7); printed evidence equals the harness within 0.05 percentage points; each leaf prints its datum temperature | a leaf datum at the wrong temperature; 0.1 MPa evidence printed for 40 MPa | ethanol leaf alone at 348 K: -1.9 % (thresholds 3.2) |
| D3 `liquidDensity03_NaOH` (law) | Olsson record vs a harness copy of the 18 constants; Galindo-Luna (A); Hnedkovsky (B) | the thresholds note's (a)-(c): 1e-6; A AAD <= 0.10 %, max <= 0.30 %; B <= 2 MPa AAD <= 0.20 %, max <= 0.30 %; B at 10 MPa reported with "law carries no pressure term" | a state outside Table III answered; the law where a marked point applies | today: NaN on the bench, the pump 14.95 % AAD |
| D3b `liquidDensity04_NaOHpoint` (feed 0.5 kg/s + recycle, splitter 0.5: units see 1 kg/s; Wegstein) | `d3b_point.tsv` | Q, tau, W_shaft, head equal section 5's numbers to 1e-6; the table names the point and what it replaced | the law used at 303.15 K; the point used at 333.15 K | the 333.15 K run: marked -> refused; check-only -> law 1196.16 |
| D4 `liquidDensity05_CO2water` (diluteSolution, x_CO2 0.02, 293.15 and 313.15 K, 20 MPa) | none scored (no `v_inf` is entered: amendment 7) | the SAME refusal at both temperatures, naming the CO2-water Henry record's missing `v_inf` and `massWithoutVolume`; with the hypothesis at `maxMassFraction 0.01` refused by its limit (w 0.047) | a method change at 304 K; CO2's volume silently zero | the gammaPhi variant: idealMixing on the reference CO2 liquid answers at 293.15 K, -0.35 % below pure water where Hebach measures +1.55 to +1.71 %, and refuses at 313.15 K (T > Tc): the cliff the diluteSolution form avoids |
| D5 `liquidDensity06_NaClwaterEthanol` (298.15 and 313.15 K) | Galleguillos 2003 (evidence the remedy exists) | pump, CSTR AND bench refuse with a text naming {ethanol, NaCl, water}, "no solution record for this set", `ethanol-NaCl-water.dat` and the article; no number | any number; a refusal for another reason (asserted on the text) | with `massWithoutVolume { components ( NaCl ); maxMassFraction 0.30; }` it answers (1.8-4.1 % off, the baseline) |

Thresholds the slice could tune: none is fitted (the pilot fits nothing); the
D2 change (score 298/323 K, report 348 K) and the D3b box are proposed here
BEFORE any run and flagged as such.

## 9. Migrating the pump and the CSTR

| site | today | pilot |
|---|---|---|
| Pump.cpp:100-134 | flat `Vliq` sum, ions out, announcement | `liquidProperty::density({T_in, P_in, x})`; v_mix = MW_mix / rho |
| Pump.cpp:316-330 | rho = MW_mix / v_mix, 1000 fallback, `useHere(... bypass ...)` | rho from the kernel; the kernel records the use; no fallback |
| Pump.cpp:236-242 | ion test `Vliq() <= 0` for the Cp share | the hypothesis' list (no number moves) |
| CSTR.cpp:244-253, :657-669 | flat `Vliq` over every package component | the kernel at the FEED state (T :111, P read as :441 reads it, z_in), present constituents only (Q2) |
| CSTR.cpp:530 | `concentrationBasis` text names `Vliq` | names the resolved method |
| PropertySourceDeclarations.cpp:35, :37 | bypass | kernel |
| `bin/curate/liquid_property_ratchet_debt.tsv` | Pump.cpp 2, CSTR.cpp 4 | 0 and 0 (rows removed) |

**Re-record prediction** (a list, checked by a run before re-recording): with
(a) and (b), 30 of the 32 cases move -- all 23 CSTR cases (cstr02 refuses
unless Q6 says otherwise; the Fermentors after their declaration), and the
pumps of aceticAcid02_plant, membrane21, membrane22, rankine02_water (-10.3 %
on rho: head and W_shaft +11.5 %), membrane27, swro01_campoDalias,
pumpSystem01_operating_point.  Unmoved: pump01_water, pump02_pressure_spec.
Six cases gain an `approximations` block (section 3).  Downstream of a CSTR
the conversion, the outlet, the duty, the sizing and the economics move
(rows of every kind in those `expected` files).

## 10. The behavioural witness

A gate (`check_density_witness`) runs one scratch copy of the D3b flowsheet
twice with the measured point replaced by an artificial value, 1000 and 1500
kg/m3 (box wide, `reason` "witness", origin `assumed`).  It asserts, to 1e-9
relative: W_shaft x rho, head x rho and tau / rho unchanged between the two
runs, and the table naming `measured` for both units.  No test hook in the
engine.  Negative control, run once and recorded in the pilot's report: the
same pair on the origin/main binary, where the pump and the CSTR bypass the
kernel and all three products change by the factor 1.5.

## 11. The code plan

| step | content | check |
|---|---|---|
| 0 | land `VliqT` first (liquid-volume-datum-temperature.md section 0, rule 6), so the bench and the cases re-record once | its own |
| 1 | `DensityMethod` base, factory, the three record leaves, `pureFluid` and `idealMixing` as wrappers of today's code; `liquidProperty::density` entry; resolver | bench: every existing hash bit for bit (the wrapper is untouched); NEW rows only |
| 2 | the liquid branch of `pureFluid`, `referenceEquation` leaf | bench adds rows; rankine02's state gives 893.99 |
| 3 | solution record reader, `polynomialTSqrtX`, `NaOH-water.dat`; choupoProps loads solution records | load test check values; D3 (a) |
| 4 | `measured`, box, `use`, `replaces` | D3b on a scratch case |
| 5 | `massWithoutVolume` in the one parser | the 7 shipped `approximations` blocks unchanged; the gate arm |
| 6 | `PropertyDomainTrial` | a scratch recycle whose seed is outside a box: rejected, then converged |
| 7 | pump and CSTR on the entry; declarations; table columns | `--scope` over the 32 cases, re-record from the section 9 list with the moved rows written in the commit; `--fast`; `--gui` (CSTR.cpp and Pump.cpp lines cited by lessons) |
| 8 | the five demonstrations and the witness | each PASS / FAIL as written by the architect |
| 9 | documentation | the gates below |

The bench re-records ONLY added rows; any changed existing hash stops the
step.  No full sweep: the new paths are reached only by the two units, the
wrapper and `ThermoPackage::density` are untouched, and the result block gains
fields only on rows that use the new entry (a field written for every row would
reach every case and need the sweep, with that reason).

**Owed (rule 4d, C381):**

| where | what |
|---|---|
| Theory Guide, under `sec:liquid-property-sources` (theoryGuide.tex:2481) | labelled subsections: resolution and precedence; the liquid branch and the reference leaf; `polynomialTSqrtX` with Olsson's equations, window and both evidence statements (Krey in sample, Galindo-Luna out of sample); `measured` and its box; `massWithoutVolume` and its bound; the domain error |
| `check_feature_documented` | every registered method name has its section |
| Theory links | `gui/src/case/modelDocs.ts` `pump` (:168) and `cstr` (:97) keep their chapters, which point to the new section |
| Tutorials Guide, `docs/tutorials-catalogue.md` | the five demonstrations |
| `docs/ai/thermophysical-properties.md`; `unit-ops.md`; `capabilities.md` | grammar of sections 4-6, the table's columns, refusals with remedies; the pump and cstr entries |
| settled contract, beside settled-contracts.md:3734 | "A LIQUID DENSITY IS RESOLVED PER CONSTITUENT SET, ONCE, AND NEVER HANDED OVER" |
| PDFs | rebuilt |

**Tempting, and not in the pilot:** moving the valve, pressure exchanger, PFR
or any wrapper consumer; a `v_inf` for CO2-water; a pressure term for the
Rackett leaves or the NaOH law; an excess volume for water + ethanol; the
gas-phase CSTR fix (Q6); local values per unit; `acceptedEstimate`; tables;
the declared correlation; `neglectedIn`; viscosity; Laliberte's rule.

## 12. Open questions for the architect

| # | question | recommendation |
|---|---|---|
| Q1 | (a) and (b): the reference water leaf, with pressure, by the fact that a record names the fluid? | YES; zero extra re-records for (a), three for (b); the seal copies the Helmholtz record into each case that resolves it, so cases stay self-contained |
| Q2 | the CSTR's density state | the FEED state (space time, V over the feed's volumetric flow), which keeps the unit's meaning and keeps every density out of its extent Newton |
| Q3 | a constituent set first met in a later pass | resolve and freeze it; refuse only a stream whose set resolves to a different method than in pass 1 |
| Q4 | demonstration CSTRs need a reaction | a declared reaction whose reactant is absent, said in the header; no engine change |
| Q5 | a marked point outside its box | refuse (amendment 3); the thresholds note's "uses the law 30 K away" becomes the check-only variant |
| Q6 | cstr02: a vapour feed priced on liquid volumes (Q ~186 times too small at 600 K, 10 bar) | refuse by name in the pilot (CO above Tc already refuses it) and fix it in its own commit right after, through the equation of state (ThermoPackage.cpp:2306-2318), with its moved rows |
| Q7 | D2 at 348.15 K with an ethanol leaf the catalogue cannot improve | score 298.15 and 323.15 K, report 348.15 K: the floor assumed correct leaves, and the pilot adds no correlation |

## 13. Where a ruling does not hold as written

| ruling | why it does not hold as written | this plan |
|---|---|---|
| resolved once at assembly | a set first met during the solve cannot be | per set, at first request, frozen (slice 0 said the same) |
| thresholds note D3b: 30 K away "uses the law" | contradicts the third amendment block (a marked measurement never hands over) | follows the amendment; the law appears in the check-only variant |
| D4 with no new correlation | cannot be scored; and routes record 3.2's idealMixing on CO2's pure liquid gives the wrong SIGN (-0.35 % against +1.6 % measured) | D4 on the diluteSolution form, where the declared solute role passes idealMixing over |
| one file per constituent set | NaOH-water already has an activity-model record; a density law there would hang on an activity-model choice | two files of two kinds; the solution record is the property home |
| the pilot moves only the pump and the CSTR | the slice-0 `evaluate` already serves seven consumer files | a second entry; one liquid carries two printed densities until S2 |

## 14. As built: where the build departed from this plan

Recorded here so the settled contract's record says what was built (review
row PA-16, 2026-11-13); each was also stated in its commit.

| planned | built | why |
|---|---|---|
| leaf names with dots (`recordVolume.anchoredRackett` registered per route) | one registered `recordVolume`; the route is a fact of the record and only the leaf's id names it | a registered name with a dot cannot be documented or refused by name like the others |
| the pump and the CSTR the only callers of the entry | a third caller, the props bench key `rho_liquid_kernel`, and the route bench's checks; `check_liquid_density_entry_callers` counts every one | the kernel has to be probed at states no shipped case reaches (ruling 1 at hand-back A) |
| a pure set below p_sat(T) is a vapour, refused | below the reference equation's line but above the package's, the reference's saturated liquid, announced; the other side announced too | the package is the authority on a stream's phase (ruling 3 at hand-back A, PB-05) |
| the seal copies the records a case names | the importer also copies every Helmholtz record whose `fluid` names a component | a sealed case could not otherwise find the reference equation that applies "by the fact" |
| caustic demonstrations through a pump and a CSTR | CSTR only | the electrolyte formulation has no liquid heat capacity for NaOH, which the pump's temperature rise needs |
| "pressure not applied" announced on every use | announced only above 2 MPa (`pressureAnnouncedAbove`); the table column always says it, per leaf where leaves differ | ruling 2 at hand-back B: an advisory on every pump was noise |
| the decision keyed on the package's address | cached on the package's serial; the "resolves differently" refusal keyed on the world (PA-03) | an address is reused by the allocator (ruling 6); a serial is not a world |
| `massWithoutVolume` the last leaf, after any volume the catalogue holds | honoured for every listed component, and read by the density only (PA-04) | one reading of a declaration; the pump's heat capacity is not a volume question |
