# C480 -- every props case answers its question in a figure (2026-11-23)

Findings 1 and 2 of `docs/reviews/2026-11-23-c266-student-walk/README.md`: the
Studies page of every props case sampled said "No figure published";
psychro01's chart and binary01's LLE map existed only as a CSV; steam01 showed
61 keys with "unit not published" and no comparison with the IAPWS tables.

Screenshots at 1440x900, WebGL off, the dev GUI over a `make wasm-steady-props`
build of this branch (Emscripten 3.1.6), Playwright.  The three `before-*` are
the walk's own.

| case | before | after |
|---|---|---|
| psychro01_n2_water | before-psychro01 | after-psychro01: the chart, eleven curves, in the Studies page |
| binary01_lle_water_nbutanol | before-binary01 | after-binary01: g_mix, the two coexisting liquids and the common tangent |
| steam01_if97_verification | before-steam01 | after-steam01-figures (the verification states on the saturation line, psat and enthalpy of the saturation line) and after-steam01-tables (Table 5 as IAPWS, Choupo, relative difference; Tables 15, 35, 36 below it) |
| psat01_antoine_recovery | (raw keys, readiness first) | after-psat01: data against the fitted Antoine curve, parity, residuals; constants with units below |
| landscape02_water_gas_shift | (none) | after-landscape02: yield against T, one curve per pressure |

Where the steam01 reference values come from: its own `expected` file, whose
header says every value was copied digit for digit from IAPWS R7-97(2012)
Tables 5, 15, 35, 36.  `constant/reference/iapws_if97_verification.csv` is
WRITTEN from that file by a script (nothing retyped).  The release document
itself was NOT re-read in this slice.
