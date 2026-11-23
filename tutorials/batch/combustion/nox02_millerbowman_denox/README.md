# nox02_millerbowman_denox -- the Thermal DeNOx window, the paper's own comparison

**The question.**  NH3 is injected into hot gas that carries NO and some O2.  Between about
1100 and 1400 K it removes NO; below the window nothing reacts, above it the ammonia burns to
NO.  Where is the window, and how deep?  Miller & Bowman (Prog. Energy Combust. Sci. 15 (1989)
287-338, doi:10.1016/0360-1285(89)90017-8) answer in **Fig. 57 (p. 313)** against the flow-reactor
data of Lyon & Hardy.  This case runs that figure.

**Setup (the paper's data set 1).**  NO 225 ppm, NH3 450 ppm, O2 1.23 %, balance He, 1.1 atm,
isothermal, reaction time 0.1 s, temperature 900-1500 K.  A flow reactor held at a wall
temperature is a plug-flow element, and a plug-flow element is a batch vessel in its own
travel time, so the case is **17 isothermal `batchReactor` units, one per temperature**
(`energy gasConstantP`, `mode isothermal`), integrated to 0.1 s in one run.  The temperature
sweep is therefore a list of vessels, not an `outerDict`: `choupoBatch` has no outer driver.

**Mechanism.**  Appendix B of the paper, 73 reactions, 19 species plus He, A in cm3-mol-s and E in
cal/mol as printed (`constant/reactions`; the paper's numbers name the reactions, B1...B73, each
with its page).  The paper computed this figure with Appendix B.  Reverse rates come from
equilibrium, as the paper does.  Thermochemistry: one set per run, the NASA/TP-2002-211556
NASA-9 data (stable species as case-local overrides, radicals from the NASA table); N2H2 and NNH
are read from the NASA table and the RRHO-computed table respectively (Theory Guide
`sec:rrho-thermo`; NNH has no NASA entry).

## What it shows

NOx = NO + NO2 at 0.1 s, in ppm:

| T / K | 1100 | 1150 | 1175 | 1200 | 1225 | 1250 | 1275 | 1300 | 1350 | 1400 | 1450 | 1500 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| this case | 225.0 | 190.5 | 127.8 | 60.2 | **16.7** | 25.0 | 40.6 | 60.1 | 125.2 | 204.2 | 270.2 | 319.0 |
| the paper's model curve, read from the figure | 224 | 191 | 132 | 68 | 17 | 22 | 40 | 64 | 126 | 202 | -- | -- |

The window opens at 1100 K, reaches 17 ppm (92 % removal) near 1225 K, and closes by 1400 K, where
the ammonia has all burned and NOx is back at 204 ppm.  Below 1050 K nothing happens in 0.1 s.
The curve is the paper's: root-mean-square difference 2.9 ppm over the model curve's 14 read
points, largest 7.8 ppm on the steep flank at 1200 K.  **The readings are digitised from the page
image (thresholded, the axis frame found by pixel, +-3 ppm, more on the steep flank): information,
not a pin.**  Against the Lyon & Hardy data themselves the model (the paper's and this case's alike)
runs about 25-30 K cold on the flank and 25 ppm high above the minimum -- that is the paper's own
remaining disagreement with the experiment, not a difference between the two models
(`docs/reviews/2026-11-22-miller-bowman/compare_paper.py`).

**N2O is the intermediate to watch**: it peaks at 13.0 ppm near 1325 K and is gone (0.2 ppm) by 1500 K; the ammonia is exhausted from 1275 K up, and from there on the NO that remains is what the ammonia burned to.

## Checked against Cantera

Same transcription, same thermodynamics (the NASA-9 coefficients Choupo reads, written into the
Cantera input), Cantera 3.2.0, CVODES at rtol 1e-10: the end values of NOx agree to 5 significant
digits in all 17 vessels, every species at every write time to **5.7e-4 relative** at worst (rtol
1e-6, atol 1e-19 kmol as shipped), temperatures identical.
`docs/reviews/2026-11-22-miller-bowman/compare_cantera.py denox`.

**Why `atol` is 1e-19 kmol.**  The 17 vessels are independent, so each is integrated on its own step
(Theory Guide `sec:batch-vessels-separate`): a cold vessel no longer rides the small steps of the hot
ones.  Its trace species (N2O, NO2, HNO at 1e-16 to 1e-13 kmol) start at zero and are error-controlled
only where `rtol` times the value exceeds `atol`; below that the integrator accepts an absolute error
near `atol`, which is large in relative terms.  With the former `atol` of 1e-17 the worst deviation from
Cantera was 2.0e-3 (1.7e-3 when the vessels shared one step), with 1e-19 it is 5.7e-4, at about the cost
the shared step had.  Tightening `rtol` instead is the wrong lever: it buys accuracy on the species that
were already accurate.

## Known differences from the authors' runs (read before quoting a number)

* **Species thermochemistry.**  The paper used the CHEMKIN thermodynamic data base of its time; this
  case uses NASA/TP-2002-211556 and, for the nine species without a table entry, RRHO-computed
  records anchored to ATcT.  The paper's Table 1 (p. 289) prints heats of formation that differ
  from ATcT for five species (paper minus ATcT, kJ/mol): 1CH2 -4.6, NNH -4.5, H2CN +8.7,
  HOCN +5.5, HCNO -8.6.  Appendix B contains NNH, which takes part in 14 reactions (B38, B43-B49, B64, B65, B67,
  B68, B70, B71); the case does not switch to the paper's values.
* **Interpretation: B10.**  Reaction 10 (2H + M = H2 + M) prints no efficiencies in Appendix B although
  B11 and B12 supply the H2 and H2O colliders as in Appendix A reaction 139, where H2 and H2O have
  efficiency 0; the case applies the same two zeros.
* **N2O + M** has A = 1.62e+14 in B25 and 1.60e+14 in A205: both are as printed.

## Files

`constant/reactions` (generated, with the page of each reaction), `constant/components/` (stable
species, NASA-9), `0/internalStates/T<K>` (initial charge of each vessel), `expected` (golden).
Regenerate everything from the table with `docs/reviews/2026-11-22-miller-bowman/build_cases.py`.

## The figure (C477)

`system/postDict` declares ONE view, `denoxWindow`, answering "in which temperature window does NH3 remove NO?":
the final NOx = NO + NO2 [ppm] of each of the 17 vessels against its temperature, over the paper's model curve and
the Lyon & Hardy points (Fig. 57, digitised).  The series reads two published diagnostics of every vessel,
`T_final` and `ppm_NOx_final`; the minimum of the Choupo curve is 16.7 ppm at 1225 K (the paper's curve: 17 ppm).
Declared and resolved by `choupoBatch` (`postProcessing/case/denoxWindow.csv`); not looked at on a screen by its author.

## Jacobian

`jacobian analytic` on every vessel; the per-run audit against the dense finite difference passes
(worst column 3e-6 of the column's scale, tolerance 1e-4).
