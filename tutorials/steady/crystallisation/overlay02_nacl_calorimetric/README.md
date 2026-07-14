# overlay02 — partial overlay reaches the crystalliser duty

A NaCl crystalliser (cloned from crystalliser05) whose case-local
`constant/components/NaCl.dat` declares `overlayOf NaCl;` and recalibrates ONLY
`solidPhases.halite.calorimetric.dissolutionEnthalpy` (3880 -> 5880 J/mol).

The `ThermoPackageBuilder` deep-merges this delta over the standard record, so the
crystalliser duty reflects it: `Q_removed` = 3690.997 W here vs 2435.556 in
crystalliser05 (ratio 1.515 = 5880/3880). Every other KPI (Ksp_activity, m_sat,
c_sat, crystal_mol, gamma) is byte-identical to crystalliser05 -- logK25, dH, the
dissolution reaction and the crystal block all still come from the standard.

This is the second half of the roadmap Phase A acceptance test: the SINGLE unified
reader applies the overlay at ALL three component-loading sites (SpeciationSolver,
Database, ThermoPackageBuilder), not just the SI path.
