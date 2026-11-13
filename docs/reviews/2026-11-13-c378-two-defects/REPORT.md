# Review by measurement: `c378-two-defects`

Date: 2026-11-13.  Reviewed: the working branch `c378-two-defects` at
06f0c44749 (six commits on main), before it landed.  Findings:
`findings.tsv` (TD-01 .. TD-14).  Every number below was produced by a run
on a build of that commit; the scripts in this folder reproduce them.

## 1. What was reviewed

- The branch as pushed, built with `make all -j2` (exit 0).
- `bin/runTests` was used only in its scoped tier, on a temporary local
  branch at the same commit.
- A "main-equivalent" build: the branch with its three pure-fluid changes
  undone (the density at P, the phase overloads at P, the stream pressure
  equal to P).  It reproduces main's pure-fluid pricing only.  It is NOT a
  build of main; no second full build was made.

## 2. The four claims

| claim | verdict | measured |
|---|---|---|
| (a) `condenser01_film_nusselt` read the liquid density as its vapour density | holds | A Nusselt recomputation from the properties the tree's own IF97 kernel gives (`nusselt_condenser01.py`) returns h = 9693.15 W/m2K against the engine's 9693.14598788 (relative difference 1e-10); the duty is 928.0013 kW; the wall balance closes at the engine's wall temperature to 5e-11. |
| (b) the `cstr` priced a vapour feed on liquid volumes, 186 times off | holds | The ORIGINAL case files of main, run on this build, give tau 0.72163 s and X 0.81557; the old golden held tau 134.4036 s; the ratio is 186.2.  The engine fix alone repairs the original case.  The change of V_R (1e-3 to 1e-2) only restores what the header says the case shows (X 0.83862, approaching the equilibrium conversion).  Every moved golden row is listed with old and new values in commits c431931308 and 59a58aa6a8. |
| (c) one step below p_sat the pump heats by 125 K instead of 1.17 K | holds for the pump | With the pump's phase argument removed (sabotage S3a): dT 125.46 K at e = -1e-6, -1e-9, -1e-12 and 1.172 K at e = 0 and above, where P = p_sat (1 + e).  On the main-equivalent build at 550 K: 35.76 K one representable step below p_sat and 1.01 K one step above.  The branch's pump does not move inside the band.  NOT reproduced: the second fixed point of `rankine02` on another platform (its golden passes here under S3a). |
| (d) the stream functions had the same shape | partly | Mixer, splitter, storageTank and isothermalFlash are steady inside the band on the branch.  Beyond the band the units and the stream functions apply two different rules (TD-04), and the units that price an authored inlet through their own flash were left as they were (TD-01, TD-02, TD-03). |

Densities used for (a), each taken from two runs of the props bench on the
IF97 kernel: saturated vapour at 1 bar 0.590311 kg/m3; saturated liquid
958.63689 kg/m3; liquid at the film temperature 967.3752 kg/m3 with
k = 0.671138 W/m K and mu = 3.25628e-4 Pa s.  The liquid heat capacity
(75.5 J/mol K) is read from the case's own component record; the wall
temperature and the film temperature difference from the run's KPIs.

## 3. The rest of the family

**What the commits enumerate.**  cc60a01cb7 lists the callers of the
real-fluid enthalpy and entropy in `src/unitOperations` and
`src/postProcessing` and says discharge states are left.  4836ff3f3e lists
the stream functions.  Neither names the units that price an AUTHORED
inlet through their own flash (`PhaseChanger.cpp:241-242`,
`HeatExchanger.cpp:842` with `pinned = false`, `Pipe.cpp:141`), nor the
props-bench operations that call the three-argument forms
(`Exergy.cpp:88-91`, `ExplainProperty.cpp:140`,
`PropertyEvaluator.cpp:275-276`).

**By reading.**  Every density call in the units and in the sizing code
passes a phase, so the first fix reaches all of them.

**By probe** (`probe_saturation_line.py`, `family_probe_summary.tsv`).
IF97 water declared `phase liquid;` or `phase gas;` at 373.15,
446.5158944 and 550 K, at P = p_sat (1 + e) for e = one representable step
down, 0, one step up, +-1e-12, +-1e-9, +-5e-7 (inside the 1e-6 band) and
+-2e-6 (outside).

| unit | branch: a jump inside the band? | main-equivalent build |
|---|---|---|
| heater, mixer, splitter, isothermalFlash | no | yes |
| storageTank | no | not run |
| pump | no; a gas inlet is refused at acceptance | yes |
| compressor | no; a liquid inlet is refused at acceptance | yes at 446.5 and 550 K |
| cooler (`phaseChanger`, duty declared) | YES, in all six (T, phase) cases | yes |
| heatExchanger | YES, in all six cases | yes |
| valve, adiabaticFlash | a saturated-liquid inlet never converges | not run |
| pipe | refuses everywhere; WHICH refusal depends on the last bits of P | not run |
| turbine | liquid refused; saturated steam at -1 kW fails its inner Newton | not run |

The cooler and heat-exchanger rows were reproduced twice byte-identically
(264 rows), and a third time at 446.5158944 K by the reviewing session
itself (`second_reproduction_446K.tsv`): a cooler taking 1 kW from 1 mol/s
of water declared `phase gas;` at e = 0 publishes a fully condensed outlet
at 433.78 K and a plant residual of +36.70 kW at exit 0; at e = -5e-7 it
publishes a vapour fraction of 0.9728 and a zero residual.

**Wrong-phase inlets** (`probe_wrong_phase_inlets.py`, two identical
runs).  A produced vapour into the pump, or a produced liquid into the
compressor or the turbine, is refused by name at the unit's solve.  An
authored inlet of the wrong phase is refused at acceptance, before any
unit runs.  A stream pinned at 0 < vf < 1 is priced as the saturated split
at p_sat(T) whatever its pressure, and nothing is said (TD-12).

## 4. The new gate and the sabotages

`check_pure_fluid_phase_asked.py` holds seven runs to AGREE across the
band.  It does not hold them to agree on the right branch.  Each sabotage
was applied alone, built, run and restored (`sabotage.sh`,
`sabotage_table.tsv`).

| sabotage | the new gate | goldens (condenser01, cstr02, rankine02) and the scoped conservation gates |
|---|---|---|
| S1 the density ignores the phase | passes (not its subject) | condenser01 fails |
| S2 the cstr never takes the vapour basis | passes (not its subject) | cstr02 fails |
| S3a the pump drops the phase | fails | all pass |
| S3b the compressor drops the phase | fails | all pass |
| S3c the turbine drops the phase | passes | all pass: SURVIVES everything run |
| S3d the phase overloads ignore the phase | fails | all pass |
| S4 the stream pressure is P | fails (its report arm) | all pass |
| S5 the saturated vapour evaluated on the liquid side | PASSES, printing T_out 446.74 K for steam compressed to 20 bar | condenser01 fails |

## 5. What else moved

`bin/runTests --scope` over 64 cases (the rotating, heat, reactor and
power directories, and the pure-fluid cases found by `grep -rl pureFluids`
over the thermophysical dictionaries: sprayDryer01, steam02, flashSpec01,
heavyWater01, economics04): 68 PASS (64 cases and four conservation gates;
two gates had no subject), 0 FAIL.  Left out to stay near sixty cases:
sprayDryer03 to sprayDryer07.

## 6. The prose

- TD-08: three texts say the cstr's feed phase is resolved and "never read
  from a `phase` word"; for a pinned feed the pin decides (cstr02 with
  `phase liquid;` returns to the liquid basis, tau 1344.04 s, at exit 0).
- TD-09: the catalogue says condenser01 runs at a film Reynolds number of
  about 32, laminar; the run prints a laminar-wavy film and warns that the
  laminar bound of 30 binds; a comment in its flowsheet dictionary still
  gives the outlet vapour fraction as about 0.53 (it is 0.1785).
- The Theory Guide's two pure-fluid sections and
  `docs/ai/thermophysical-properties.md` match the code on the band, the
  saturated branches, the IF97 window and the fact that the phase is
  ignored on other routes.  "The run says so once" is true of the console
  only (TD-07).

## 7. What was NOT reviewed

- The second fixed point of `rankine02` on another compiler.
- main itself (no second build): "main-equivalent" means section 1's build.
- The Helmholtz pure fluids in the unit probes (IF97 water only).
- The route bench and the other gates the commits list.
- Whether the valve, adiabaticFlash and turbine failures of section 3 also
  occur on main.

## 8. Method

Each finding states whether it was reproduced twice.  Statements that
could not be measured are in section 7, not in the findings.  One
hypothesis of the brief was NOT supported and is recorded as such: "one
representable step below p_sat", taken relative to the saturation pressure
as evaluated outside the engine, flips the result at 550 K and not at
446.5 K; the pump flip was reproduced with e = -1e-12.  The "56 changed
golden lines" of condenser01 are 28 lines rewritten each way; 16 rows
moved, all listed with reasons in the commit.

## 9. After the fix branch (`fix/pure-inlet-pins` at f99b751c9f)

The three units of TD-01, TD-02 and TD-03 were then changed on a branch
stacked on the coordinator's corrections, and the probe of section 3 was run
again on that build by the reviewing session (`after_fix_446K.tsv`, IF97
water at 446.5158944 K, e = -5e-7, 0, +1e-9).

- Cooler, declared `phase gas;`, 1 kW removed: vapour fraction 0.97275 at
  the inlet temperature and a zero plant residual at all three pressures
  (it was fully condensed at 433.78 K with +36.70 kW at two of them).
- Cooler, declared `phase liquid;`: liquid at 433.783 K, zero residual, at
  all three (it left 97 % vapour with -36.70 kW at e = -5e-7).
- Heat exchanger, declared liquid: its closure gap is below 1e-9 kW at all
  three (it was -36.82 kW at e = -5e-7).
- Heat exchanger, declared `phase gas;` (saturated steam against a cold
  liquid): NOT fixed, and not a jump: the unit's own `H_closure_gap_kW` is
  -42.86 kW and the plant residual +42.86 kW at EVERY pressure, at exit 0.
  The builder traced it to the outlet search (its bracket walks below the
  IF97 triple point and the unit falls back, announced, to its sensible
  temperature).  It is older than both branches and is recorded as TD-15.
