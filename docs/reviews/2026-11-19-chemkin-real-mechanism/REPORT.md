# The first real CHEMKIN mechanism through Choupo, against Cantera (2026-11-19)

Measurement slice of the CHEMKIN line (C458).  Measured by a general on branch
`chemkin-real` (12bc171db); the standard-state fix and its re-measurement by
the commander (this commit).  The mechanism files are a LOCAL measurement copy
under `thirdParty/` (gitignored); nothing of the mechanism is in this tree.

## 1. Mechanism and terms

- LLNL "Archived Mechanisms / Hydrogen",
  https://combustion.llnl.gov/archived-mechanisms/hydrogen: `h2_v1b_mech.txt`
  (Dec 3 2004), `h2_v1a_therm.txt` (May 19 2004).  10 species, 21 reaction
  lines: 19 with an explicit REV, 2 Troe `(+m)` fall-offs, 4 `+m` third bodies,
  3 DUPLICATE pairs.
- Citation as printed on that page: O'Connaire, M., H. J. Curran, J. M.
  Simmie, W. J. Pitz, and C. K. Westbrook, "A Comprehensive Modeling Study of
  Hydrogen Oxidation," Int. J. Chem. Kinet., 36:603-622, 2004 (UCRL-JC-152569).
- Terms: the page states no licence and no redistribution grant; the site's
  disclaimer (https://www.llnl.gov/disclaimer) disclaims liability and
  endorsement.  Used as a local measurement copy only; whether a record could be
  made from it is an open licence question, not answered here.
- Reference: Cantera 3.2.0 (`pip install cantera`), `ck2yaml` on the same two
  files, `IdealGasReactor` at constant volume, CVODES rtol 1e-9, atol 1e-15.

## 2. Import (bin/curate/chemkin_to_choupo.py)

Before any fix the real file gave 1/10 species and 0/21 reactions.  Fixed in
the tool (each with its reason, commit 12bc171db):

| failure | count | fix |
|---|---|---|
| NASA-7 records start at 300 K, 1.85 K above 298.15 | 9 of 10 species | the low polynomial is read at 298.15 K when Tlow is within 5 K (what CHEMKIN and Cantera do); a wider gap is still refused |
| `+m` / `(+m)` in lower case | 6 reactions | accepted in any case unless a species has that name |
| explicit REV refused (engine limit) | 19 reactions | opt-in `--rev-from-thermo`: REV lines ignored, said in the report -- a declared VARIANT, not the published mechanism |

As printed: 10/10 species, 2/21 reactions (the two fall-offs; every REV is
refused because `batchReactor` reads `A_rev`/`Ea_rev` only on `type Arrhenius`,
in SI, without `b` -- BatchReactor.cpp ~185-209).  With `--rev-from-thermo`:
10/10 and 21/21.

## 3. Comparison (stoichiometric H2/air, 1100 K, 1 atm, adiabatic, constant V)

tau = time of maximum dT/dt on a 0.1 us grid.  Like for like: Choupo with
`--rev-from-thermo`, Cantera on the same file with the REV lines deleted.

After the standard-state fix (section 4), against Cantera with the file AS
PUBLISHED (its default 1 atm reference), Rosenbrock23 at 0.1 us:

| quantity | Choupo | Cantera | difference |
|---|---|---|---|
| tau | 79.30 us | 79.30 us | 0.00 |
| T_final | 2927.795 K | 2927.796 K | -0.001 K |
| P_final (nRT/V) | 2.41460 bar | 2.41461 bar | -6.1e-7 rel |
| final mole fractions (H, H2, O, O2, OH, H2O, N2, HO2, H2O2) | | | 7e-8 to 7.7e-6 rel |
| T at 0.9 / 1.0 / 1.1 tau | 1134.18 / 1702.58 / 2635.86 K | 1134.17 / 1702.29 / 2635.82 K | +0.01 / +0.29 / +0.05 K |
| max abs T difference over the trajectory | | | 0.29 K (rms 0.02 K) |

Before the fix (general's measurement): against Cantera with a 1 bar
reference everything agreed to 1e-6; against the published 1 atm, T_final was
+1.264 K and the radicals -0.07 to -0.9 %.  At 1000 K and 1200 K (1 bar
reference): tau 202.70 / 42.70 us and T_final 2909.351 / 2948.328 K in both
codes, max |dT| 0.23 / 0.43 K.

What the refusals and the variant cost (Cantera): the 2 reactions imported as
printed do not ignite (neither code); deleting the published REV moves tau by
0.1 us (0.14 %) and T_final by 5.3 K -- the paper's reverse fits are not
exactly consistent with its own thermochemistry.

## 4. Findings and what was done

1. **Standard-state pressure (silent error) -- FIXED in the importer.**  The
   engine's K_c uses P0 = 1 bar (`constant::Pref`); a CHEMKIN-II NASA-7 file is
   referenced to 1 atm.  The importer now re-references each record exactly,
   S(1 bar) = S(1 atm) + R ln(1.01325), i.e. a7 + ln(1.01325) on both ranges
   (H and Cp unchanged), so K_c = K_p,atm (P_atm/RT)^sum(nu) as in CHEMKIN and
   Cantera; the printed a7 is kept in each record's provenance;
   `--standard-pressure bar` declares a file already on 1 bar.  Held by a
   self-test arm and by the comparison above (+1.264 K -> -0.001 K).
2. **REV with a temperature exponent cannot be expressed** by the engine
   (open; the first engine item of the next slice).
3. **`bomb.P_final` is stale**: it reports the initial 101325 Pa while nRT/V
   at the end is 2.415 bar (open; it is a KPI that goldens pin -- a defect to
   fix with the moved rows listed).
4. **Speed**: about 150-250 us per Rosenbrock23 step on 10 species against
   about 15 us in Cantera (dense finite-difference Jacobian, n+1 right-hand
   sides per step, K_c rebuilt from Gibbs energies at every evaluation).  An
   extrapolation, not a measurement: 50 species / 300 reactions would be about
   10 ms per step.
5. **Integrators** (1100 K, to 200 us): Rosenbrock23 and Rodas4 accurate (0.32
   and 0.02 K max vs Cantera at 0.1 us; Rodas4 the faster); RK4 needs 1e-9 s
   and is ~1000x slower; EulerSI is first order (239 K off at the front).
6. The printed stiffness ratio (~5e8, |lambda|max ~1e15 1/s) is inconsistent
   with RK4 surviving at 1e-9 s -- not investigated.

## 5. Not verified

One mechanism (H2/O2, 10 species); no CO/C1, no PLOG/SRI/MOLECULES in a real
file; only constant-volume adiabatic ignition; no seeded ignition; the cost
scaling is an extrapolation.

## 6. Reproduce

Scripts in `scripts/` (no mechanism data).  Cantera side:

```
pip install cantera
# delete the `rev` lines of h2_v1b_mech.txt -> mech_norev.txt
ck2yaml --input=mech_norev.txt --thermo=h2_v1a_therm.txt --output=norev.yaml --permissive
python3 scripts/ct_ignite.py norev.yaml ct_norev.csv 1100 1 1e-3 1e-7
```

Choupo side: import with
`bin/curate/chemkin_to_choupo.py h2_v1b_mech.txt --thermo h2_v1a_therm.txt --case <dir> --licence "..." --rev-from-thermo`,
put the import's `constant/` into a copy of
`tutorials/batch/combustion/ignition01_h2o2` (components `h h2 o o2 oh h2o n2
ho2 h2o2 ar`, reactions r001..r021, holdup 1100 K, 1 L, 1.107872e-05 kmol of
H2 0.295858 / O2 0.147929 / N2 0.556213), then
`scripts/runch.py <case> r23 Rosenbrock23 1e-7 1e-7 1e-3` and
`scripts/cmp.py r23/trajectory.csv ct_norev.csv 1e-7`.

## 7. Speed after caching g

Change: the detailed-balance `K_c` of every reversible reaction used to rebuild
its Gibbs energies, so a species' `g(T)` was evaluated once per reaction it
appears in, on every right-hand-side evaluation (a callgrind profile put 57 %
of the instructions of a batch ignition in `Reaction::equilibriumKc` ->
`Component::g_pure_ig`).  Now `g_i(T)` is evaluated once per species per
evaluation (`Reaction::gibbsVector`, for the species of the reversible reactions
only), handed down as an argument (`RateState::gibbs`, a `const sVector*` on the
batch paths), and `K_c` does the same arithmetic in the same order on it:
bit-identical.  The per-factor error-message strings of `rateOfReaction_` are
built on the refusal path only.  Commit 2385fc7c3 against its parent 4496ae010,
both built `-O2` on the same machine (shared with other jobs: take the instruction
count as the measurement, the wall time as the min of 5 repeats).

| case (choupoBatch unless noted) | instructions before | after | ratio | wall min before | after |
|---|---|---|---|---|---|
| ignition01_h2o2 (O Conaire, 21 reactions) | 5.239 G | 1.673 G | 3.13x | 0.347 s | 0.141 s |
| ignition01_h2o2_jac (analytic Jacobian) | 2.160 G | 0.893 G | 2.42x | 0.164 s | 0.087 s |
| LLNL H2 (O Conaire 2004, 1 ms, Rosenbrock23, 1e-7) | 29.47 G | 10.89 G | 2.70x | 2.631 s | 1.402 s |
| LLNL H2, `jacobian analytic` | 12.93 G | 6.25 G | 2.07x | 1.507 s | 1.088 s |
| pfr02_reversible_wgs (choupoSolve) | 274.2 M | 270.7 M | 1.01x | 0.036 s | 0.035 s |
| elementary03a_falloff_chemkin (choupoSolve) | 225.7 M | 223.6 M | 1.01x | 0.031 s | 0.031 s |

The steady `cstr`/`pfr` cases have one or two reactions and run in tens of
milliseconds dominated by property set-up, so they gain nothing measurable; the
caching matters where many reversible reactions share species and the right-hand
side is called thousands of times (a mechanism).  Every output file of the 180
cases compared (tutorials/batch, ctrl, unsteady and the steady/plant cases with a
reactor) is byte-identical to the parent's, 16 of them with reversible reactions.
After the change the remaining cost of the LLNL run is the rest of the
right-hand side and the integrator, not `g(T)`.

## 8. The same mechanism at constant pressure (`energy gasConstantP`, 2026-11-20)

New adiabatic basis of `batchReactor` (Theory Guide `sec:batch-gas-constp`):
closed ideal gas at the holdup's fixed P, dH = 0,
`dT/dt = -sum h_i ndot_i / sum n_i Cp_i`, `V = n R T / P` at every state, h_i =
`h_pure_ig` (the datum `gasConstantV` takes u_i = h_i - RT from).  The point of
the measurement is the independent witness: Cantera's
`IdealGasConstPressureReactor` on `ck2yaml` of the SAME two files (as published,
default 1 atm reference), against Choupo's import of the same files as published
(`--licence "local measurement copy"`, no `--rev-from-thermo`), stoichiometric
H2/air, 1100 K, 1 atm, 1 L initial, Rosenbrock23 at 0.1 us.

| quantity | Choupo | Cantera | difference |
|---|---|---|---|
| tau (max dT/dt, 0.1 us grid) | 81.40 us | 81.40 us | 0.00 |
| T_final (1 ms) | 2726.875 K | 2726.875 K | < 1 mK |
| V_final (n R T / P for Choupo) | 2.194515 L | 2.194516 L | -3.4e-7 rel |
| final mole fractions (h2, o2, h, o, oh, ho2, h2o, n2) | | | 2e-8 to 4e-7 rel |
| final mole fraction h2o2 | 3.811626e-07 | 3.811676e-07 | -1.3e-5 rel |
| T at 0.9 / 1.0 / 1.1 tau | 1141.60 / 1542.14 / 2063.77 K | 1141.59 / 1542.00 / 2063.72 K | +0.01 / +0.14 / +0.05 K |
| max abs T difference over the trajectory | | | 0.14 K (rms 0.01 K) |

Against the constant-V run of section 3 (same start): tau 81.4 us against 79.3 us,
T_final 2727 K against 2928 K, the volume 2.19 times the initial litre.  The
agreement is that of section 3 (the 0.14 K at tau is the steepest point's phase
shift on a 0.1 us grid), so the new basis carries no error of its own beyond
the shared rate/thermo path.  Reproduce: `ck2yaml` of the published files,
`scripts/ct_ignite_constp.py h2.yaml ct_p.csv 1100 1 1e-3 1e-7` with
`/usr/bin/python3` (Cantera 3.2.0), the import's `constant/` in a copy of
`tutorials/batch/combustion/ignition03_h2air_constp` with `P 1.01325 bar` and no
`V`, `scripts/runch.py <case> h2p Rosenbrock23 1e-7 1e-7 1e-3`, then
`scripts/cmp_constp.py h2p/trajectory.csv ct_p.csv 1e-7 101325`.

## 9. PLOG (2026-11-20): a numerical fixture against Cantera, and the conventions

`type plog` (CHEMKIN-II PLOG; Theory Guide `sec:plog-rate`) is read by the
ReactionRate factory (`ElementaryRate`), so `cstr`, `pfr` and `batchReactor`
share one reader.  Conventions, each checked against Cantera 3.2.0
(`scripts/ct_plog_conventions.py`, a four-line table 0.1 atm 1e10, 1 atm 2e10 and
3e10, 10 atm 1e12 at 1000 K):

| question | Cantera 3.2.0 | Choupo |
|---|---|---|
| below the lowest / above the highest P | k of that end (1.0e10 at 0.01 atm, 1.0e12 at 100 atm) | the same: no extrapolation |
| two lines at one P | summed: 5.0e10 at 1 atm | summed before the interpolation |
| between two P | ln k linear in ln P (the geometric mean, below) | the same |
| the reaction line's own A b Ea | not used for the rate | ignored |

(Cantera at P = sqrt(0.1) atm gives 2.2361e10 = sqrt(1e10 x 5e10); at sqrt(10) atm
2.2361e11 = sqrt(5e10 x 1e12): the geometric mean, i.e. ln k linear in ln P.)

**The fixture is NOT chemistry.**  One reaction of the real LLNL H2 mechanism
(O'Connaire 2004, local files under `thirdParty/`, never committed; section 1)
is rewritten as a PLOG, `h+o2 = o+oh`, whose three pressure lines are the
published A multiplied by 0.6 at 0.5 atm, 1.0 at 1.5 atm and 1.6 at 3.0 atm
(b and Ea unchanged); the 20 other reactions and all REV lines are as in section 3
(REV lines deleted for BOTH codes, reverse by detailed balance).  The
pressure of the closed vessel rises 1.0 -> 2.41 atm through the ignition, so the
interpolation is exercised between all three lines.  Same case as section 3
(stoichiometric H2/air, 1100 K, 1 atm, 1 L, adiabatic, constant V), Choupo
`choupoBatch` `energy gasConstantV` Rosenbrock23 at 0.1 us, Cantera `IdealGasReactor`
rtol 1e-9; `scripts/plog_fixture.py` builds both mechanism files.

| quantity | control (no PLOG) Choupo / Cantera | PLOG fixture Choupo | PLOG fixture Cantera |
|---|---|---|---|
| tau (max dT/dt, 0.1 us grid) | 79.30 / 79.30 us | 93.20 us | 93.20 us |
| T_final | 2927.795 / 2927.796 K | 2927.795 K | 2927.796 K |
| P_final | 2.41460 / 2.41461 bar | 2.41460 bar | 2.41461 bar |
| final mole fractions (9 species) | 1e-7 to 7.8e-6 rel | 1e-7 to 7.8e-6 rel | |
| T at 0.9 / 1.0 / 1.1 tau, Choupo - Cantera | +0.01 / +0.29 / +0.05 K | +0.01 / +0.25 / +0.03 K | |
| max abs T difference over the trajectory | 0.29 K (rms 0.02 K) | 0.25 K (rms 0.01 K) | |

The PLOG lengthens tau by 17.5 % in both codes (the 1 atm rate of the branching
reaction is 0.84 of the published value), and the two codes agree on it to the
same 0.1 us grid cell and the same 0.25 K at the steepest point as without PLOG:
the PLOG law adds no measurable difference beyond the one already in the
control.  The analytic Jacobian (`jacobian analytic;`) runs the fixture with its
audit passing at Jacobians 1, 2, 4, 8, ... (worst column 1.1e-6 of the column's scale,
tolerance 1e-4) and the same T_final.  A liquid batch vessel refuses the reaction by
name (`energy liquidDH`: "reads a pressure only for an ideal gas (`energy
gasConstantV;` or `gasConstantP;`, P = n R T / V)").

At constant pressure (added by the commander at the merge with section 8): R1 of
`ignition03_h2air_constp` (5 bar) written as a PLOG at 2.5 bar with A/2 and
10 bar with 2A (geometric mean exactly A at 5 bar) reproduces the case's every
printed digit: tau 8.000 us, T_final 2828.1824545 K, all 201 printed rows.  The
same table at 0.5 and 2 atm is clamped at 2 atm (k = 2A) and ignites at 5 us
with the same final equilibrium, as clamping predicts.

Not verified: a real PLOG mechanism (the fixture is a rewritten reaction of an
H2 file), PLOG in a pyrolysis network, a reversible PLOG whose forward rate changes
steeply with P, PLOG in `dynamicCSTR` (refused by name), Cantera's behaviour for a
negative summed k (Choupo falls back to linear interpolation in ln P of k itself).


## 10. Ignition-delay sensitivity: brute force, against Cantera (2026-11-20)

`sensitivity { response tauIgnition; factor 1.1; reactions all; }` on a `batchReactor`
(Theory Guide `sec:ignition-sensitivity`; case `ignition04_h2air_sensitivity`).  N+1
integrations; `S_j = (ln tau_j - ln tau_0) / ln 1.1` with every reaction's NET rate
multiplied (forward and reverse together).  tau = the time T first exceeds T0 + 400 K,
linearly interpolated between the two accepted integrator states that bracket it.

Setup, identical on both sides: stoichiometric H2/air (H2 : O2 : N2 = 2 : 1 : 3.76),
1100 K, 2 atm, constant volume, adiabatic, the section 3 mechanism (LLNL files, REV
lines ignored in both codes: `norev.yaml` for Cantera, `chemkin_to_choupo.py
--rev-from-thermo` for Choupo, the file's NASA-7 records re-referenced as in section 4).
Choupo: Rosenbrock23, analytic Jacobian, rtol 1e-9, species atol 1e-18 kmol, step
capped at 2e-4 of the 3e-4 s window.  Cantera 3.2.0: CVODES, rtol 1e-10, atol 1e-18,
`max_time_step` the same cap, `gas.set_multiplier(1.1, j)`.

tau_0: Choupo 44.958570 us, Cantera 44.958848 us (relative -6.2e-6).  The ten largest
|S| (reaction index = Choupo `r<index+1>`):

| # | reaction | S Choupo | S Cantera | difference |
|---|---|---|---|---|
| 1 | H + O2 = O + OH | -1.0221 | -1.0221 | -0.00002 |
| 2 | H + O2 (+M) = HO2 (+M) | +0.3613 | +0.3613 | +0.00000 |
| 3 | H2 + O = H + OH | -0.1494 | -0.1494 | -0.00000 |
| 4 | H2 + OH = H + H2O | -0.0492 | -0.0492 | -0.00000 |
| 5 | H + HO2 = H2 + O2 | -0.0489 | -0.0489 | -0.00000 |
| 6 | H + HO2 = 2 OH | -0.0341 | -0.0341 | -0.00000 |
| 7 | HO2 + O = O2 + OH | +0.0034 | +0.0034 | -0.00000 |
| 8 | HO2 + OH = H2O + O2 | +0.0034 | +0.0034 | +0.00000 |
| 9 | H + H2O2 = H2 + HO2 | -0.0017 | -0.0017 | -0.00000 |
| 10 | H2O + M = H + OH + M | -0.0013 | -0.0013 | -0.00000 |

Acceptance: the top five are the same five in the same order; the worst
|S(Choupo) - S(Cantera)| over all 21 reactions is 2e-5 (reaction 1; 3 reactions have
|S| > 0.05, the same value).  Final T of a multiplied run equals the base run's in both
codes (Cantera 2993.9456 K for the base and for R1 x 1.1; Choupo's 21 runs agree to 7.6e-12
relative on the shipped case).

The shipped case uses the O Conaire Table I as printed in `constant/reactions` and the
catalogue's NASA-7 thermo, not the LLNL files, so its numbers differ slightly: tau_0
45.121 us and S(R1) -1.0246, S(R9) +0.3665, S(R2) -0.1496, S(R3) -0.0500, S(R10) -0.0489,
S(R11) -0.0347 (at most 0.006 from the table above; its final T is 3028.7 K against 2993.9 K
with the LLNL thermo, a catalogue-thermo difference that this slice did not examine).

**Sabotage (by hand).**  The multiplier removed from the reverse leg, `k_rev = (k/m)/K_c`,
in the rate and in the Jacobian so the audit does not refuse first: `check_ignition_sensitivity`
FAILED, (a) the run with R8 multiplied ends 2.45e-3 relative away from the base T_end,
(b) S(R1) -1.028568 against the hand recomputation -1.024601 (3.97e-3).  Restored: OK,
max T_end difference 7.6e-12, S(R1) difference 5.1e-13.

**Reproduce.**
```
# norev.yaml as in section 6
python3 scripts/ct_sensitivity.py norev.yaml ct_sens.csv 1100 2 3e-4 1.1 400 1e-10 1e-18
# Choupo: the section 6 import, in a copy of tutorials/batch/combustion/ignition04_h2air_sensitivity
# (components h h2 o o2 oh h2o n2 ho2 h2o2 ar, reactions r001..r021, 2.2157448e-5 kmol in 1 L
# at 1100 K, H2/O2/N2 0.295858/0.147929/0.556213); choupoBatch writes sensitivity.csv
python3 scripts/cmp_sens.py sensitivity.csv ct_sens.csv
```
Not verified: a constant-pressure vessel, a response other than the temperature-rise
delay, another mechanism, the finite-difference error of the factor 1.1 against a smaller
factor (S at 1.01 was not run).
