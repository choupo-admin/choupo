# userOp03_case_rate_law — a case that carries its own kinetics, two ways

A rate law is a fact about a catalyst, a solvent, an enzyme — about the
EQUIPMENT and its contents — so it belongs in the case (the three-axiom
layout's axiom 3), not compiled into the engine.  Choupo gives a case two
ways to carry one (DEV.md 4c C67, 2026-10-12):

| route | where the law is written | runs on the site? |
|---|---|---|
| `kinetics { type expression; }` | a formula in `constant/reactions`, every number beside it with its unit; the engine compiles it once, checks its dimensions and prints it back as parsed | **yes** |
| `kinetics { type <yourLaw>; }` | C++ in the case's `code/` folder, a class deriving from `ReactionRate`, registered in `code/registerUserTypes.cpp` | **no** — the browser has no compiler; run it locally |

This case writes ONE law — Michaelis–Menten, `r = Vmax c_A / (Km + c_A)` —
both ways, and feeds two identical CSTRs (`reactorCode`, `reactorExpr`) the
same stream.  The reaction is an isomerisation, `isomerA -> isomerB`, between
two synthetic species the case carries itself (see *The species* below).

```
runCase tutorials/steady/userops/userOp03_case_rate_law     # builds code/ first
```

**This case does not run in the browser** (it ships C++ in `code/`); the
GUI says so when it is opened.  Its `reactorExpr` half would, on its own.

## What to look at

* `constant/reactions` — `mm_code` names `type michaelisMenten;` and declares
  `Vmax` and `Km` WITH UNITS, which the C++ reads through the dictionary (so the
  units are checked there, not trusted); `mm_expr` writes the same law as a
  formula over `c[isomerA]`, `Vmax` and `Km`.
* `code/MichaelisMenten.{H,cpp}` — the whole law, thirty lines: read the
  parameters, return the extent rate in the reactor's convention
  (`RateState::amountPerKmol` says whether the reactor works in mol or kmol).
* `code/registerUserTypes.cpp` — one `ReactionRate::registerType` call; the
  same explicit factory the built-in `Arrhenius`, `LHHW` and `expression` use.
* The run log — the `[expression]` law is printed back AS PARSED, with the
  dimensions of every definition; the user law prints its own type name.

## The answer, and the check

`V_R = 0.025 m3`, feed 1 kmol/h of A at 12.5 kmol/m3 (liquid basis), `Vmax =
0.01 kmol/(m3 s)`, `Km = 5 kmol/m3` (both AUTHOR-SET for this witness — the
form is Michaelis & Menten's, the numbers are nobody's measurement).  The CSTR
balance `F_A0 X = V Vmax c_A / (Km + c_A)` with `c_A = c_A0 (1 - X)` is a
quadratic in X, and these numbers put its root at **X = 0.5 exactly**.  Both
reactors publish `xi = 0.138889 mol/s`, i.e. X = 0.5; `bin/curate/
check_rate_expression.py` holds the two reactors to each other and to the
closed form.

## When to choose which route

Write the formula whenever the law IS a formula: it is shorter, it is checked
(an unknown symbol, a dimension mismatch, a non-finite value all refuse by
name), and it runs everywhere.  Write C++ when it is not — an inner solve, a
loop, a property the expression grammar cannot reach.  The C++ route has no
dimension checker but the dictionary's own (`lookupScalar(key, dims)`), and
it is the author's responsibility to refuse what it does not read, as this one
does.

## The species

`isomerA` and `isomerB` are NOT real substances: they live in this case's
`constant/components/`, declare `provenance { source synthetic; }` (the run
says so) and exist only to be the substrate and the product of this witness.
They are isomers — one formula, one molar mass (30 kg/kmol) — so `nu -1/+1`
conserves MASS as well as moles: each reactor takes in 30 kg/h and gives out
30 kg/h.  They also share one molar liquid volume, so the volumetric flow the
CSTR evaluates on its feed is the outlet's too, and `c_A = c_A0 (1 - X)` above
is exact rather than an approximation.

Until 2026-10-25 the witness reacted the catalogue's `compA` (MW 30) into
`compB` (MW 50), two VLLE-audit stand-ins that were never a reactant and its
product: one kmol of 30 kg became one kmol of 50 kg, each reactor turned
30 kg/h into 40 kg/h, and the mass balance reported 133.333 %.  The engine was
right to report it; the case was wrong.  The catalogue records are shared by
other cases, so the fix is a pair of the case's own, not an edit to them.

The element balance is UNAVAILABLE and says so: the formula `X` is
fictitious, and a synthetic species has no atoms to count.  The energy balance
is UNAVAILABLE too (no heat of formation, for the same reason); the reactors
run isothermal.
