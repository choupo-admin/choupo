# Review: the aqueous speciation solver and its equilibrium constants

Tree: `/home/user/choupo/.claude/worktrees/t3` at `72ddf86960` (read only). Every case was run from a copy in this directory with the tree's own `choupoProps`. Every check below was recomputed in Python (`python3 -I`) from the case's own inputs and records, and from the state the engine published: the per-op CSV (9 significant figures) plus `aw`, `I`, `pH` and `n_<mineral>` from the result JSON.

Scripts in this directory:
- `check.py`: mass balance, charge, I, a_w, and the mass-action law with the logK the log printed.
- `check2.py`: the mass-action law with log K(T) recomputed from the records, the "source vs engine" K(T) gap, and the Davies gamma recomputed.
- `ana.py`: an audit of every record's `logK25` against its own analytic expression.
- `calc.py`: calcite and aragonite against the Plummer & Busenberg form.
- `indep.py`: an independent carbonate speciation solver (Davies, phi = 1).

## 1. Summary of what was checked

### 1a. Every `speciate` operation in the corpus: 26 cases, 150 operations, all exit 0

How each quantity was checked:
- **Mass balance:** sum of nu times m over every species carrying each declared master, plus the precipitated amount for `equilibrate` ops, against the declared total. mg/L totals were converted the way the engine does: divided by the species MW, at rho = 1 kg/L.
- **Mass-action residual:** log10 a_species − sum nu log10 a_master − nuWater log10 a_w − log K(T). log K(T) is MY evaluation of the record, not the printed value.

| case | speciate ops (of which pH given) | worst mass balance, rel | worst charge, pH solved | net charge, pH given (by design, announced) | worst mass-action residual, log10 | worst I mismatch, rel |
|---|---|---|---|---|---|---|
| aminoBuffers01_tris_glycine | 6 (0) | 1.8e-09 | 1.4e-09 | - | 1.6e-09 | 1.7e-09 |
| bjerrum01_carbonate_pH | 44 (0) | 4.5e-09 | 2.5e-09 | - | 2.4e-09 | 2.3e-09 |
| borate01_felmyWeare | 2 (1) | 8.0e-10 | 4.7e-10 | 7e-05 | 1.2e-09 | 4.5e-10 |
| citricAcid01_speciation | 8 (0) | 4.2e-10 | 4.8e-10 | - | 3.4e-09 | 5.4e-10 |
| composition01_nacl | 1 (0) | 0.0e+00 | 4.8e-10 | - | 6.3e-10 | 4.8e-10 |
| davies01_band_edge | 16 (0) | 0.0e+00 | 7.5e-10 | - | 3.4e-09 | 7.5e-10 |
| edwards01_sour_water_activity | 2 (2) | 3.2e-09 | - | 0.11 | 1.1e-09 | 1.7e-09 |
| edwards02_table7_vle | 4 (0) | 1.7e-09 | 1.6e-09 | - | 2.2e-09 | 1.8e-09 |
| edwards03_table8_vle | 3 (0) | 1.2e-09 | 5.3e-10 | - | 1.5e-09 | 1.1e-09 |
| farelo_licl_range | 5 (0) | 0.0e+00 | 1.7e-09 | - | 2.0e-09 | 1.6e-09 |
| farelo_nacl_nh4cl | 5 (0) | 2.6e-09 | 4.6e-10 | - | 2.8e-09 | 6.6e-10 |
| goodsBuffers01_hepes_mes | 4 (0) | 1.0e-09 | 6.6e-10 | - | 1.2e-09 | 6.5e-10 |
| inorganicLadders01_goldberg | 7 (0) | 1.6e-09 | 6.1e-10 | - | 2.6e-09 | 1.5e-09 |
| ksp_temperature | 5 (5) | 9.8e-10 | - | 0.27 | 2.8e-09 | 4.7e-10 |
| model4_speciation_scaling | 1 (1) | 8.6e-10 | - | 2.3e-08 | 1.2e-09 | 1.3e-10 |
| overlay01_nacl_ksp | 1 (0) | 9.5e-10 | 4.8e-10 | - | 6.3e-10 | 4.8e-10 |
| pb82_calcite_open_co2 | 1 (0) | 2.4e-10 | 4.1e-10 | - | 1.9e-09 | 3.2e-11 |
| pitzer_calcite_brine | 2 (2) | 4.3e-09 | - | 0.00048 | 3.4e-09 | 5.1e-11 |
| pitzer_hmw_hot_agreement | 1 (1) | 9.2e-10 | - | 1.2e-06 | 9.0e-10 | 4.6e-10 |
| pitzer_seawater_verify | 2 (2) | 0.0e+00 | - | 0.0024 | 1.2e-09 | 4.3e-12 |
| precipitation_ro_brackish | 3 (1) | 3.4e-09 | 1.8e-09 | 1.2e-06 | 3.1e-09 | 2.3e-09 |
| rainwater_air | 2 (0) | 0.0e+00 | 4.0e-10 | - | 9.7e-10 | 1.1e-09 |
| scaling_ro_brackish | 4 (2) | 3.4e-09 | 1.8e-09 | 1.2e-06 | 3.1e-09 | 4.5e-09 |
| tartaricAcid_acidulation | 5 (2) | 2.7e-09 | 9.2e-10 | 0.061 | 3.0e-09 | 1.2e-09 |
| volatileAcids01_acetic_formic | 6 (0) | 3.6e-10 | 7.6e-10 | - | 1.4e-09 | 4.0e-10 |
| wineAcids01_tartaric_malic | 10 (0) | 2.2e-09 | 1.0e-09 | - | 3.0e-09 | 1.0e-09 |

Notes on the table:
- **Floor of the comparison.** Every residual is at the 1e-9 level, which is what 9 significant figures in the CSV allow.
- **Net charge where pH is given.** Wherever pH is given, the net charge is printed and goes into the caveat block, as designed. The same holds for:
  - `a_w`: equals exp(−M_w/1000 · sum m) to 1e-7 or better on every Davies op.
  - Davies gamma: recomputed from the printed A and the published I, it matches to ≤ 4e-9 at 25 C. Off 25 C it matches to ≤ 9e-5, which is limited only by A being printed to 4 decimals.
- **Mineral ops.** The 4 `equilibrate` ops close their master balances with the precipitate counted, to ≤ 2e-9: pb82, `pin_gypsum_amount`, `feed_eq`, `gypsum_ceiling`. Calcite and aragonite SI in the `feed` op of `scaling_ro_brackish` were recomputed from the published activities and reproduce the engine to 1e-9.
- **Henry pins.** For pb82 and rainwater, log a(CO2aq) = log K_H + log p is reproduced exactly.
- **Independent solve.** `indep.py` solves the carbonate/NaCl network from the declared totals and agrees with the engine's pH and I to 1e-6. The cases checked: `base_1p0`, `acid_5p0`, and robustness points from 1e-6 m up to 5 m.

### 1b. The K(T) evaluation (src/thermo/electrolyte/SpeciationSolver.cpp:728-756)

The form read in the code is the PHREEQC analytic: A1 + A2·T + A3/T + A4·log10 T + A5/T² + A6·T². It is base-10, T is in kelvin, and the validity range is in Celsius.

The engine applies it as an anchored correction, `logK25 + [ana(T) − ana(298.15)]`. If there is no analytic, it uses van 't Hoff, log K25 + dH/(R ln10)·(1/298.15 − 1/T), with dH in J/mol. If there is neither, the constant is flat.

My evaluation of every record, on every off-25 C operation (10, 37, 40, 60, 80, 90, 100 C), reproduces the engine's log K to 1e-9. Sign conventions, units, and ln vs log10 are consistent. The water dH is 56 400 J/mol, against 56 359 from its own analytic.

### 1c. Constants against their own transcribed sources

Each record's `source` string transcribes the pK and dH values; I re-derived logK25 and dH from them:

- **Goldberg, Kishore & Lennen 2002 records** (citric, tartaric, arsenate, sulfite, pyrophosphate, hydrazine, HEPES, MES, glycine, Tris, TEOA, acetic): every logK25 and dH re-derived exactly, including the sign flips for formation direction.
- **Malic and lactic** (Eden & Bates; Nims & Smith): re-derived exactly.
- **Formic acid:** re-derived from the Wagman ΔfG to 3.7316.
- **Borate:** matches the pitzer.dat values the record names as its cross-check.
- **Carbonate** (records CO2aq, CO3, CO2-dissolution, CaHCO3, CaCO3aq): log K1 6.352, log K2 10.329, K_H −1.468. The analytic expressions reproduce logK25 to ≤ 2e-4. These match the textbook anchors.
- **Aragonite:** the record's analytic minus the HCO3 formation term is −171.9773 −0.077993 2903.293 71.595, which is the Plummer & Busenberg form. It agrees with it to 1e-4 from 0 to 90 C.

### 1d. Known-answer claims in the case headers, all reproduced by the engine

**bjerrum01:**
- Crossovers interpolated at pH 6.3409 and 10.2616. The header says 6.341 and 10.262.
- Theory check: 6.352 + log10(0.975) = 6.341, and 10.329 + log10(0.813/0.949) = 10.261.
- Minimum of the three carbonate fractions: 0.999656 (header: 0.99966).
- gamma_CO3 runs from 0.674 to 0.979 (header: 0.67 to 0.98).

**citricAcid01:** pH 2.083, 3.019, 4.379, 5.765, as in the header. My hand quadratic, with and without Davies, gives 2.083 to 2.085.

**inorganicLadders01:** all reproduced: arsenate 6.728, sulfite 6.850, hydrazine 8.086, phosphate 6.826, pyrophosphate 2.230 / 6.068 / 8.510.

**goodsBuffers01:**
- HEPES 7.498 and MES 6.204 at 25 C.
- Shift from 25 to 37 C: 0.1396 and 0.1017 in pH.
- The van 't Hoff shift in pK, recomputed: 0.1383 and 0.1003.

**aminoBuffers01:** 8.138, 7.828, 6.075, 2.504, 9.693, 11.278.

**volatileAcids01:** 2.881, 2.376, 4.671, 3.651, 8.772, 8.260.

**wineAcids01:** 2.210, 3.528, 4.163, 5.220, 8.587, 12.348.

**rainwater_air:**
- pH 5.598 at 420 ppm CO2: aCO2 = 10^(−1.468 − 3.377), so aH ≈ sqrt(K1·aCO2) = 10^−5.598.
- DO 8.47 mg/L at 25 C and 11.34 mg/L at 10 C. See SP-07 on what these numbers mean.

**pitzer_seawater_verify:** gamma±(NaCl, 1 m) = 0.6572. Recalled, not verified: the Robinson–Stokes value is about 0.657.

**Davies A(T)** is 0.4909 at 0 C, 0.4980 at 10 C, 0.5453 at 60 C and 0.6002 at 100 C. Recalled, not verified: the textbook values are about 0.492, 0.499, 0.544 and 0.600.

### 1e. Robustness (copies of bjerrum01 and scaling_ro_brackish with new operations)

All of these converged, and the published states satisfy mass balance, charge and mass action to ≤ 4e-9:
- **Dilute:** 1e-6, 1e-9 and 1e-12 m. The pH goes to 7.000, as it should.
- **Concentrated, all announced as "Davies ... INDICATIVE":** NaHCO3 at 1 m, Na2CO3 at 2.5 m, NaCl at 10 m, Na 20 m with HCO3 10 m. For the 20 m case, the oscillation guard was engaged and announced.
- **Strong acid or base, 1 to 5 m:** pH −0.44 to 15.19.
- **Given pH of 0 and 14:** the 100 % net charge is announced.
- **Temperature:** 0 C and 100 C. Extrapolation is announced for HClaq at 100 C and for anhydrite at 0 C, but not for anhydrite at 60 to 160 C; see SP-02.
- **Precipitation:** strongly supersaturated calcite + gypsum (2 phases admitted), and a strongly undersaturated dilute feed.

CaSO4 at 2 m under Davies does NOT converge. It stops loudly ("ionic-strength fixed point did not converge in 60 passes") and takes every other operation of the run down with it. Noted as SP-08.

No silent fallback was seen. The one silent assumption found is SP-04.

## 2. Findings

### SP-01 (S3): the calcite constant is not Plummer & Busenberg's, but the PB82 witness says it is and blames the whole pH offset on the activity model

**Where.** `data/standards/components/CaCO3.dat:68`, the same line mirrored in every sealed case, including `tutorials/props/electrolyte/pb82_calcite_open_co2/constant/components/CaCO3.dat:69`. The record reads:

`logK25 1.879; ... analytic ( 40.0171 -0.01928451 -5151.79 -8.66815 563713.9 ); ... lit: ... Plummer and Busenberg, 1982`

**What the record implies.** With the tree's own HCO3 formation (log K 10.329), the implied log Ksp of calcite is 1.879 − 10.329 = **−8.450** at 25 C. Plummer & Busenberg's equation gives **−8.4798**. That is the anchor in the brief, and my evaluation of the PB82 expression gives −8.4798. The T-shape also differs:

| T (°C) | Δ log Ksp (record − PB82) |
|---|---|
| 0 | +0.076 |
| 25 | +0.030 |
| 40 | −0.003 |
| 80 | −0.086 |
| 90 | −0.105 |

`calc.py` reproduces this. **Aragonite in the same file agrees with PB82 to 1e-4 at every temperature**, which shows the comparison is sound.

**Probable origin.** `bin/curate/parse_speciation.py:606-622` pins calcite to "−8.45 + 10.329" and prints the note "db master revised vs classic −8.48". The value is probably a faithful transcription of a revised phreeqc.dat. I could not confirm this: `bin/curate/refs/phreeqc.dat` is gitignored and absent.

**Why this is a finding.** The record's `lit` field and the pb82 case both present the value as PB82's. The case header (`pb82_calcite_open_co2/system/propsDict`, the paragraphs "LINEAGE" and "WHAT IT ACTUALLY LANDS AT") claims two things:
1. The constants are "lineage consistency" with the paper's Table 3.
2. The engine's 0.025 pH excess over the measured 6.004 is an activity-model difference (Davies vs Truesdell–Jones). That claim also justifies the `anchor` band in `expected`.

**Reproduction.** Copy the case, change `logK25 1.879` to `1.849` in `constant/components/CaCO3.dat`, and run `choupoProps`. The seal announces the edit and the run continues.

| quantity | as shipped | with PB82's −8.48 |
|---|---|---|
| pH | 6.02946 | 6.01859 |
| n_calcite | 5.4328e-3 | 5.6941e-3 |

**What this means.** About 0.011 of the 0.025 offset to the electrode, and 0.011 of the 0.018 offset to the authors' own model (6.011), is the calcite constant, not the activity model. Every calcite SI in the corpus shifts −0.030 at 25 C: scaling_ro_brackish, precipitation_ro_brackish, ksp_temperature, pitzer_calcite_brine, the RO/membrane units, and 15 solids/optimisation cases carry the same record. With PB82's constant, the `feed` SI_calcite would be +0.255 instead of +0.225.

**Remedy (Vítor's call, since goldens move):** either
- (a) carry PB82's calcite (log Ksp −8.48, the PB82 analytic) where the record cites PB82; or
- (b) keep the revised value, rewrite `lit` and `source` to name the revised database release, and correct the pb82 header to split the offset: about 0.011 from the constant, the rest from the activity model. Then re-justify the anchor band.

### SP-02 (S2): anchoring the analytic K(T) on logK25 departs from the cited database where the two disagree, including inside a fit's own validity range, and nothing is announced

**Where.** `src/thermo/electrolyte/SpeciationSolver.cpp:743-756` (`logK_T`), and the range test at :806-813. The design is documented in `SpeciationSolver.H:92-100`.

**The disagreement.** `ana.py` lists 13 records whose logK25 differs from their own analytic at 298.15 K by more than 0.01:

| record | logK25 | analytic(298.15) | gap |
|---|---|---|---|
| KFaq | −0.82 | −0.605 | +0.215 |
| bischofite | 4.455 | 4.593 | +0.138 |
| goergeyite | −29.50 | −29.37 | +0.132 |
| NaHCO3aq | −0.433 | −0.306 | +0.127 |
| K2SO4 (arcanite) | −1.776 | −1.880 | −0.104 |
| carnallite | | | +0.074 |
| anhydrite (CaSO4) | −4.25 | −4.314 | −0.064 |
| huntite | | | −0.058 |
| glauberite | | | −0.040 |
| celestite | | | −0.028 |
| N2(g) | | | +0.011 |
| water (Kw) | −14.000 | −13.9948 | see SP-03 |

**What PHREEQC does (rule recalled, not verified).** When `-analytical_expression` is defined, PHREEQC evaluates it and ignores `log_k`. So with the same database it would use analytic(T) at every T. The engine uses logK25 + [ana(T) − ana(298.15)]: a constant offset of the gap at every temperature, silently.

**The sharpest case is anhydrite.** Its record declares `validC ( 50 160 )`. The anchor point, 25 C, lies outside the fit's range, so inside the range (50 to 160 C) the engine sits +0.0642 above the fit at every T. No extrapolation is announced there, because the range test checks only the run T.

**Reproduction.** `ksp_temperature`, ops T60 and T80:
- The run announces extrapolation only for HClaq.
- SI_anhydrite is −0.283 at 60 C and −0.071 at 80 C. The cited fit gives −0.219 and −0.007, so the scaling verdict at 80 C goes from "undersaturated by 0.07" to "at saturation".
- `check2.py`'s "src-eng" column shows the same offset on every off-25 C op that carries NaHCO3aq (+0.127) or OH (+0.0052).

**Remedy.**
1. Where a record carries both values and they disagree by more than a stated tolerance, refuse or announce at load, by record name: which of the two the engine uses, and by how much they disagree. Today it does neither.
2. When `validC` excludes 25 C, do not anchor on 25 C: use the analytic expression as is.
3. Decide (Vítor) whether "byte-stable at 25 C" is worth departing from the database semantics; the gaps above are what it costs.

### SP-03 (S3): Kw at 25 C is −14.000, not −13.995; the record's own analytic, and the textbook, give −13.995

**Where.** `data/standards/chemistry/water-dissociation.dat`: `logK25 -14; analytic ( 293.29227 0.1360833 -10576.913 -123.73158 0 -6.996455e-05 )`. Its analytic gives −13.9948 at 298.15 K, against the textbook anchor of −13.995.

The engine uses −14.000 at 25 C and carries the +0.0052 offset to every T (SP-02 mechanism):
- pKw at 37 C is printed as 13.626; analytic alone gives 13.621.
- At 10 C, −14.537.

**Effect.** The neutral pH of pure water is 7.000 instead of 6.997. Every alkaline pH is 0.005 high.

**Doc side.** bjerrum01's header says "Kw = 1e-14 at 25 C, from the USGS PHREEQC database". That is true of the `log_k` line, not of what that database computes.

**Remedy.** Set logK25 to −13.995 (with the analytic, the source's own value), or let SP-02's remedy settle it. The goldens at 25 C will move by up to 0.005 pH. List the moved rows for Vítor before any re-record.

### SP-04 (S2): the `atmosphere {}` Henry pin treats p as fugacity at any pressure, with no bound and no announcement, while the `vapour {}` path refuses without a declared `fugacity ideal`

**Where.** `src/thermo/electrolyte/SpeciationSolver.cpp:1204-1300`: the pin is accepted for any p > 0 and the line is printed as `log10 a = log10 K_H + log10 p`. Compare `src/propertyOps/Speciate.cpp:510-530`, where `vapour {}` refuses unless the case declares `fugacity ideal;`.

**Reproduction.** In a copy, run `atmosphere { pCO2 100 atm; }` on Ca 0.01 / HCO3 0.02 at 25 C. The result:
- Exit 0, with no advisory about pressure.
- m_CO2aq = 10^(−1.468 + 2) = 3.40 mol/kg, and a_w = 0.940 under phi = 1.

At 100 atm and 25 C, CO2 is above its own saturation pressure (about 64 atm), its fugacity coefficient is well below 1, and the dissolved CO2 cannot reach 3.4 m. The magnitudes are recalled, not verified, but the absence of any announcement is the defect.

**Remedy.** Mirror the `vapour {}` rule. Announce "p taken as fugacity (ideal gas), no Poynting term" on every pin. Refuse above a stated pressure, or above the gas's saturation pressure where the catalogue knows it, unless the case declares the approximation.

### SP-05 (S3): the inner Newton has no convergence verdict of its own; a pass is accepted on I / a_w self-consistency alone

**Where.** `src/thermo/electrolyte/SpeciationSolver.cpp:1730-1864`: `for (; it < maxNewton; ++it) { ... if (worst < 1.0e-12) break; ... }`, with maxNewton = 50 (:1600). When the loop runs out, nothing is recorded. Convergence at :2001-2002 tests only |I_new − I| and |a_w_new − a_w|.

**The risk.** A Newton that stalls at a non-solution changes neither I nor a_w between passes, so the solve would be reported converged with mass-balance residuals far from zero.

**Status.** I could not trigger it. Every case and perturbation above ended with worst < 1e-12, as the 1e-9 table shows. CLAUDE.md's NORMALIZED RESIDUAL section already says this Newton is not wired to `Convergence.H`. The finding is the missing verdict, not a measured failure.

**Remedy.** Record whether the last pass's Newton met its tolerance. Refuse, or announce, when it did not. Publish the final max|R|/total in the diagnostics, so the claim is checkable from the result JSON.

### SP-06 (S3): ksp_temperature header misdescribes the calcite enthalpy and points at directories that do not exist

**Where.** `tutorials/props/electrolyte/ksp_temperature/system/propsDict`, header.

**The enthalpy.** The header says "calcite dissolution is EXOTHERMIC (dH = −28.1 kJ/mol)". −28.1 kJ/mol is the dH of CaCO3 + H+ = Ca2+ + HCO3−, which includes −14.9 kJ of the HCO3 formation. The dissolution CaCO3 = Ca2+ + CO3^2− has −13.2 kJ/mol in this record, and about −9.6 kJ/mol from the PB82 expression (my derivative). The retrograde conclusion stands.

**The paths.** The header says "case-local constant/electrolyte/ ... ECLIPSE data/standards/electrolyte/". Neither directory exists; the records are in `constant/chemistry` and `constant/components`.

**Remedy.** Name the reaction the −28.1 belongs to, give the Ksp dH beside it, and fix the paths.

### SP-07 (S3): rainwater_air's DO figures are dry-air partial pressures, not saturation in humid air at 1 atm

**Where.** `tutorials/props/electrolyte/rainwater_air/system/propsDict`. The header gives "DO 8.5 -> 11 mg/L" and "N2 ... near 14 mg/L".

**The numbers.** The engine gives 8.47 and 11.34 mg/L O2, which correspond to pO2 = 0.2095 atm. That is a total pressure of 1 atm plus water vapour. With p_H2O from Antoine (0.0312 atm at 25 C, 0.0121 atm at 10 C), humid air at 1 atm gives 8.21 and 11.20 mg/L. Standard saturation tables give about 8.26 and 11.29 (recalled, not verified).

**Remedy.** Either declare pO2 = 0.2095·(1 − p_w) or say in the header that the figures are for dry partial pressures. Same for N2.

### SP-08 (S4): one non-converging speciate operation aborts every other operation in the run

**Reproduction.** Run CaSO4 at 2 m (Davies) as the third of ten operations. The run prints "choupoProps fatal error: ... did not converge in 60 passes (I = 1.075 mol/kg)" and exits 1. The seven later operations never run.

**Assessment.** It is loud, so it is not silent, but a student loses the whole scan.

**Remedy.** Optional: catch per operation, publish the refusal for that op, and carry on.

### SP-09 (S4): cosmetic

- **Printed precision.** The `[chemistry] ... log K(T) =` line prints 5 significant figures (`std::setprecision(5)`, SpeciationSolver.cpp:1081), so off-25 C constants show 3 decimals: −14.537, −10.488. Residuals computed from the printed value reach 5e-4. Printing 4 decimals would let a student check mass action from the log.
- **Two tests of "off 25 C".** `offT` uses |T − 298.15| > 0.01 (:784), while `logK_T` uses exact `T == 298.15` (:730, :749). For 298.15 < T ≤ 298.16 the constant is moved but the form is not classified or announced. Negligible.
- **Dead dH fields.** Several records carry a `dH` that disagrees with their own analytic slope: dolomite −69.3 vs −59.4 kJ; H2S(g) 9.1 vs 3.3 kJ; celestite −16.9 vs −9.2 kJ; carnallite, glauberite, huntite and bischofite carry dH 0 against non-zero slopes. These are dead values while the analytic has priority, but they are a second, disagreeing home for the same fact.

## 3. What I could NOT check, and why

- **Which phreeqc.dat release the records came from.** `bin/curate/refs/phreeqc.dat` is gitignored and absent. So I could not confirm that −8.45 (calcite) or −4.55 (gypsum) is that release's value, or that the 13 logK25-vs-analytic gaps of SP-02 are in the database itself rather than in the transcription. PHREEQC's "analytic overrides log_k" rule is recalled, not verified.
- **Pitzer (HMW), Edwards–Pitzer and eNRTL gammas** were taken as published and not recomputed: pitzer_*, borate01, davies01's hmw ops, farelo_*, edwards*, tartaric *_pitzer. The mass-action, mass-balance and charge checks on those ops hold. Whether the gammas themselves are right is outside this review.
- **edwards02/03 VLE comparisons** against the paper's tables, and **farelo** against its measured solubilities: not re-verified. Only the speciation consistency was checked.
- **Literature values** other than the brief's anchors (Kw, K1, K2, calcite) and the transcriptions inside the records are marked "recalled, not verified" and no finding rests on them alone. For SP-01, the PB82 expression I evaluated reproduces both the brief's −8.48 anchor and the record's own aragonite to 1e-4.
- **Speciation reached from steady units** (membrane, crystalliser) was not examined.

All case copies used for this review have been deleted. Only the scripts and this report remain in `/tmp/claude-0/-home-user-choupo/00fe5640-94e2-5280-8336-43196ebbb987/scratchpad/rev-solver/`.
