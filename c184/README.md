# C184 working material -- NOT for main

Vitor's dimethyl-ether plant (uploaded 2026-10-27), the case that exposed the
fullMESH / NewtonND robustness defects recorded in DEV.md 4c C184.  It is kept
on this branch only, as the reproduction input for Saturday's work; whether
any of it becomes a witness case is Vitor's decision.

`reproduction_main_b3b25db47.log`: the native run on main b3b25db47
(CHOUPO_HOME set), exit 2 -- the same messages and numbers as the GUI:
block-Thomas singular at row 2 (iteration 5, |F| = 2.05218), Cp of methanol
and water integrated down to 82.641689 K, dense solve singular at row 87
(iteration 0, |F| = 10.7111), `Flowsheet: unit 'C1' failed to converge`.
