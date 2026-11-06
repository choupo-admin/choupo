# column19 -- MTBE by reactive distillation: a reaction that changes the number of moles

A rigorous (`model fullMESH`) reactive column for

```
methanol + isobutene  <=>  MTBE        (Sum nu = -1)
```

15 equilibrium stages (stage 1 the PARTIAL condenser, the distillate leaves as
vapour; stage 15 the reboiler), P = 7 bar, reactive stages 6-10, both feeds on
stage 10 (methanol 240 kmol/h and a C4 cut of 563.2 kmol/h, both at 50 C and
10 bar).  The column is specified by its **bottoms rate** (240 kmol/h) and
**boil-up ratio** (5); the distillate is whatever the top balance leaves,
`D = F + Sum(nu) Sum(xi) - B`.

## What it demonstrates

The constant-molal-overflow column cannot carry a mole change.  The full MESH
solves the vapour and liquid flows, the stage energy balances and, on each
reactive stage, one equilibrium extent: component rows `-nu_i xi`, total rows
`-Sum(nu) xi`.  There is **no heat-of-reaction term** in the stage energy rows:
they price on the elements datum, which already holds it (a second term would
count it twice).  Atoms close although moles do not -- the element balance reads
0.0000 %.

## Where every number comes from

* **K_a(T)** -- the paper's Eq. 15, written in the case:
  Izquierdo, Cunill, Vila, Tejero & Iborra, *J. Chem. Eng. Data* 37 (1992)
  339-343, doi 10.1021/je00007a019, `ln K = dS/R - dH/(R T)`, dH = -39100 J/mol,
  dS = -85.3 J/(mol K); K in activities, pure-liquid standard state, UNIFAC
  gamma.  Measured over 313-353 K -- the reactive stages run hotter and the run
  announces the extrapolation.  Its 21 measurements are in
  `constant/experimental/izquierdo1992_tableII.csv` (transcribed by hand) and
  `check_reactive_mesh` recomputes the fit's AAD (4.6 %, max 8.5 %).
  **Not** the paper's Eq. 14 or Eq. 16: printed with a rounded constant they sit
  about 7 times below the paper's own Table IV (16 against 118 at 40 C).
* **Isobutene's enthalpy of formation** -- `constant/components/isoButene.dat`
  (a case-local overlay): -17.885 kJ/mol, derived from the measured heat of
  combustion of Prosen, Maron & Rossini, *J. Res. NBS* 46 (1951) 106,
  645.19 +/- 0.25 kcal/mol.  The catalogue's value (-10.25 kJ/mol) is a Joback
  estimate.  `s_298` is still the catalogue's, itself derived from the Joback
  dGf.
* **The other components** -- the catalogue's records, mostly `interim`
  (imported, not read back against primary sources); methanol's and the C4s'
  Antoine and Cp are extrapolated far outside their fitted ranges at the
  column's temperatures (announced).

## Honest limits

**Nothing in this case is validated against a measurement of an MTBE column.**
The vapour is ideal at 7 bar; UNIFAC is predictive; the heat of reaction is the
difference of the formation enthalpies of the records above.  Compare with
`equilibrium { fromRecords true; }`, which derives K_a(T) from the same records
that price the energy rows (and so inherits the Joback isobutene datum, announced):
the gate prints how far that is from Eq. 15.

Gate: `bin/curate/check_reactive_mesh.py`.  Design record:
`docs/design/a-reaction-that-changes-the-number-of-moles.md`.
