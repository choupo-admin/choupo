# measured01 -- the viscosity of methanol + ethylene glycol from a measured grid

A liquid MIXTURE property given as a TABLE of measured rows (DEV.md 4c C421
slice (8), form 1 of `docs/design/measured-facts-materials-and-flow-curves.md`).

* The record, `constant/experiments/royMethanolEthaneDiolViscosity.dat`: 12
  rows, three temperatures (293.15, 298.15, 303.15 K) by four glycol mass
  fractions (0, 0.25, 0.50, 0.75), at 101 kPa.  `kind measured`.  Source:
  Roy, Pradhan & Dewan, Fluid Phase Equilib. 282 (2009) 51-57,
  doi:10.1016/j.fluid.2009.03.002, transcribed exactly as the NIST ThermoML
  Archive gives it.
* The entry in `constant/thermoPhysPropDict` says how to read it:
  `interpolation ( logReciprocal monotoneCubic )` (T, then w[ethyleneGlycol],
  one axis at a time).
* Three domains: the SUPPORT (the rows' span), the AUTHORISED box (T 290-306 K,
  w 0-0.80) and refusal outside it.  Between support and box the nearest edge's
  value is held and the largest excursion announced once, at the end of the run.

Run: `runCase tutorials/props/transport/measured01_methanol_glycol_viscosity_grid`.
Gate: `check_table_laws` (arm `measured_mixture_tables`).  Theory Guide
`sec:record-law-table-mixture`.
