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
