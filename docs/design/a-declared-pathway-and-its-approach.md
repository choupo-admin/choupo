# A declared pathway and its approach

*2026-09-27.  Commission C11 (DEV.md §4c).  Gate:
`check_reaction_subset_approach`.  Witness:
`tutorials/steady/reactors/equil02_methanol_declared_pathways`.  EduTool:
`declared-pathways`.*

## 1. What was asked

Vítor, 2026-09-27, in two steps.  First, while C10 was in flight: beyond
declaring the species list, force a reactor to reach equilibrium only
through a declared subset of reactions, so that empirical knowledge ("this
reaction is kinetically irrelevant here") can enter an equilibrium
calculation.  Measured the same day, that level already existed:
`equilibriumReactor` (alias `REquil`) drives a DECLARED `reactions ( ... )`
list to simultaneous equilibrium.  What it lacked was an approach
temperature.  Second, mid-build, the pedagogy: not a third page on the
`equilibrium-landscapes` tool but a NEW EduTool whose lesson is, in his
words, *"assume equilibrium, but now declare which reaction pathways are the
ONLY ones possible"* — experiential heuristics combined with thermodynamics —
contrasting full Gibbs minimisation with a declared subset, the approach
temperature as the second knob, one cross-link from `equilibrium-landscapes`.

## 2. What was measured first, and what it decided

* `equilibriumReactor` (src/unitOperations/reactor/EquilibriumReactor.cpp at
  the parent commit 38dd46a2d): isothermal, `T` from `operation.T` defaulting
  to the feed T (:55); each Kp from `Reaction::equilibrium(thermo, nu[j], T)`
  (:88), on the ideal-gas rung (`g_pure_ig`, Reaction.cpp:136-149); residual
  `g_j = ln Q_j − ln Kp_j` (:142); KPIs `Kp_<name>` (:344).  No approach key.
* `gibbsReactor`'s approach (GibbsReactor.cpp:270-289): a MAGNITUDE, the
  direction from `GibbsReactor::approachDirection` (:67), applied as
  `g_pure_ig(T + dT)/(R(T + dT))` in every Gibbs method
  (ElementPotential.cpp:47-48 and the two others).  That is exactly
  `Kp(T + dT)` for any reaction the species admit — so the per-reaction
  version shifts `Reaction::equilibrium`'s T and nothing else.
* The sign rule existed in one function but was not reusable: it lived
  inline in `approachDirection`.
* **No solid-carbon record exists.**  `data/standards/components/C.dat` is
  ATOMIC carbon GAS (dHf_298 716.7 kJ/mol, the sublimation of graphite),
  and no Gibbs method carries a pure-solid phase.  The brief's carbon-forming
  reformer witness (Boudouard and CH4 cracking excluded) is therefore NOT
  buildable without new thermochemistry and new physics, and the brief said
  to stop and report rather than invent.  It was not built.
  **Superseded in part 2026-09-27 (commission C14, slice 1):**
  `components/graphite.dat` now exists (NASA TM-4513, public domain,
  `referenceState pureSolid;`) and the `gibbsReactor` carries a pure-solid
  phase (`GibbsMethod::solve`, witness `gibbs11_carbon_deposition`).  The
  `equilibriumReactor` still has none -- that is C14 slice 2.
* The Ostwald candidate (4 NH3 + 5 O2 → 4 NO + 6 H2O declared; 4 NH3 + 3 O2
  → 2 N2 + 6 H2O excluded; both balanced N/H/O by atom count) runs under
  `gibbsReactor` at 1100 K, 1 bar, 10 % NH3 in air: N2 as expected, NO
  6.8e-5 of the outlet.  `reactionGibbs` prices the declared route at
  ln K = 121.5 at 1100 K.  Under `equilibriumReactor` it STALLS ("Newton
  stalled at residual 17.94"): at that ln K the unconverted NH3 is ~1e-14 of
  the feed, below the interior floor of 1e-12 of the feed every logged
  species is held above (EquilibriumReactor.cpp:172) and below what extents
  subtracted from a feed resolve in double precision.  NOT buildable on this
  engine; recorded, not forced.  **BUILT THE SAME DAY (2026-09-27), and this
  bullet is kept as the record of why it was not built first:** the reactor
  now solves on ln n instead of on the extents, and the witness is
  `equil03_ammonia_oxidation_declared_pathways` (record
  [`an-equilibrium-that-runs-to-completion.md`](an-equilibrium-that-runs-to-completion.md)).
* The methanol candidate (CO + 2 H2 ⇌ CH3OH and the shift declared,
  methanation CO + 3 H2 ⇌ CH4 + H2O excluded) IS buildable: every species
  carries a formation datum and an ideal-gas Cp, and all three reactors
  converge at 525-625 K, 50 bar.  It became the witness.

## 3. What was built

### 3.1 The rule, in one home

`src/unitOperations/reactor/TemperatureApproach.H`,
`temperatureApproach::fromThermicity(dH_asItRuns, determinable)`: exothermic
→ +1 (T + |dT|), endothermic → −1, undetermined → +1 announced.
`GibbsReactor::approachDirection` calls it for the one thermicity a
stoichiometry-free reactor has; `equilibriumReactor` calls it per reaction.
GibbsReactor.cpp keeps its line numbering (the EduTool lessons cite it by
line), so the header include went to GibbsReactor.H.

### 3.2 The approach on `equilibriumReactor`

* `operation.temperatureApproach <dT>;` — a global MAGNITUDE.  A reaction's
  own entry in constant/reactions may carry `temperatureApproach <dT>;`,
  overriding it for that reaction (0 exempts it).  The per-reaction home is
  the reaction library because an approach is catalyst kinetics, which
  axiom 3 files in the case's `constant/`; a fractal unit folder may carry
  its own library.
* THE SIGN, PER REACTION, AS IT RUNS.  A probe solve at the physical T gives
  each extent ξ_j⁰; the argument handed to the rule is sign(ξ_j⁰)·ΔH_j.  ΔH_j
  is on the ideal-gas rung, the rung Kp_j is priced on, so by van 't Hoff
  the shift always moves Kp_j against the direction the reaction runs.  **A
  deviation from the brief, stated:** the brief read the sign from "that
  reaction's dH_rxn at T" (as written).  That reading and this one agree on
  every reaction that runs forward; on a reaction running BACKWARD the
  as-written reading moves Kp WITH the reaction and reports an outcome past
  equilibrium — the case `approachDirection` already guards against for the
  Gibbs reactor ("as it runs from this feed").  The witness's own shift runs
  backward (the feed carries CO2 and no water), so the difference is live
  on the page, and the gate's arm (c) is the one that tells the two rules
  apart.
* The reactor stays ISOTHERMAL at T: outlet T, duty and dH_rxn at T.
* Announced per reaction (direction it runs, its extent, dH, the evaluation
  T, Kp before → after) on the console and as an `AdvisoryLog` entry, so it
  reaches the end-of-run caveat block; an exempt reaction beside shifted
  ones is said to be unshifted.
* KPIs: `T_Kp_<name>` for every reaction when an approach is active;
  `temperatureApproach_K` = the declared GLOBAL magnitude, unsigned, only
  when declared (gibbsReactor's KPI of the same name is signed — one
  transformation, one sign; here the signed shift per reaction is
  `T_Kp_<name> − T`).  `Kp_<name>` is the Kp actually solved.
* Refused by name: a negative magnitude, global or per reaction; an
  approach larger than T.  Absent the key or at 0, nothing runs.
* Cosmetic, corpus-neutral: the verbosity-2 summary sets fixed/4 instead of
  inheriting a format a previous unit left on std::cout.

### 3.3 The witness, `equil02_methanol_declared_pathways`

One syngas (70 H2 : 25 CO : 5 CO2 kmol/h, 525 K, 50 bar, ideal gas) split
0.5/0.25/0.25 to three reactors; every comparison is on mole fractions, so
the split is bookkeeping.  Measured with the native build:

| reactor | declared | outcome at 525 K |
|---|---|---|
| `gibbs` | every species | y_CH4 0.451305381529, y_methanol 1.76e-10 |
| `complete` | all three independent reactions | the Gibbs outlet, every species to ten significant figures |
| `declared` | methanation excluded | methanol conversion 0.609773723464, y_CH4 0 |

With `temperatureApproach 20;` on `declared`: methanol synthesis runs
forward, exothermic → Kp at 545 K; the shift runs backward, endothermic as it
runs → Kp at 505 K; conversion 0.442082369415.  At 625 K the declared
conversion is 0.0565.  At 500 K the COMPLETE reactor's Newton stalls
(residual 20.7), although the Gibbs trace species there sit above the
interior floor — MEASURED, NOT DIAGNOSED, and the page's slider stops at
525 K.  **Diagnosed the same day:** it was the extent formulation (its
subtraction and its floor), and the ln n solver converges from 350 to 1200 K
at 1, 50 and 200 bar
([`an-equilibrium-that-runs-to-completion.md`](an-equilibrium-that-runs-to-completion.md) §5);
the slider stays at 525 K because the Gibbs reactor condenses water below
about 450 K at 50 bar.  Sealed (Choupo-2608, 14 records).  The case declares
`fugacityModel idealGas` so both reactors answer the same question at 50 bar.

The exclusion is the student's premise.  Nothing in the tree cites the
selectivity of a methanol catalyst (the theory guide names Cu/ZnO/Al2O3 for
the shift only, theoryGuide.tex:16389), so no catalyst claim is made.

### 3.4 The EduTool `declared-pathways`

`gui/src/ui/methods/DeclaredPathwaysTool.tsx` + `declaredPathwaysLesson.ts`,
registry entry, lazy mount, one cross-link from `equilibrium-landscapes`
(and one back).  Five steps: species versus reactions; R = N − rank A, and
the complete set IS the Gibbs reactor; close one pathway (the premise is
yours, the consequence the engine's; the declared answer is a CONSTRAINED
minimum of the same G, the Gibbs answer its bound); the approach per
reaction; what a declared list can and cannot tell you.  One run of the
witness in the browser on WASM gives the three columns; the sliders write
the three reactor temperatures, the feed's and the declared reactor's
`temperatureApproach` (declared at 0 so methodRun can replace it).  Zero
physics in TypeScript beyond one subtraction (which side of T each K was
taken on).  Limits name the two unbuildable witnesses with their reasons.

## 4. Byte-identical absence, measured

The parent commit and this tree were built side by side and every case that
runs `equilibriumReactor`, `gibbsReactor` or `gibbsMap` was run under both —
23 choupoSolve cases (including the fractal `greenAmmoniaIndustrialN2` and
`lithiumBrinePlant`, and `ammoniaStaged03_approach`, which declares a Gibbs
approach and so exercises the extracted rule) and 6 choupoProps maps: full
stdout including the result JSON, and `converged/` trees, identical in 29 of
29.  No golden row moves.

## 5. Rejected

* A third page on `equilibrium-landscapes` (the original scope) — Vítor's
  change of scope: a separate tool.
* The per-reaction sign "as written" — see §3.2.
* The per-reaction override inside `operation{}` as a keyed sub-dict — the
  brief put it in the reaction's entry, and that is where catalyst kinetics
  live.
* Inventing a graphite record, or citing a catalyst's selectivity — each
  would convert unsourced into falsely sourced.
* Forcing the Ostwald witness by loosening the interior floor — the floor is
  what makes the reactor refuse rather than publish a wrong equilibrium.
  (The witness was then built by changing the unknowns, not the floor; the
  floor is gone with the formulation that needed it.)

## 6. Gate and sabotages

`bin/curate/check_reaction_subset_approach.py`, wired into `bin/runTests`
beside the pellet gate.  Arms (a)-(i) in its docstring.  Seven by-hand
sabotages, each restored by copy and followed by `make all`; observed:

| sabotage | caught by |
|---|---|
| S1 sign read AS WRITTEN (extent direction dropped) | (c) both reactions on the backward feed, T_Kp and extent growth |
| S2 approach KPIs published with no approach | (a) KPIs leaked, declared-0 output differs |
| S3 per-reaction negative refusal removed | (f) |
| S4 GibbsReactor writes `? +1 : -1` itself again | (g) |
| S5 advisory dropped (site only) | (i) caveat block |
| S6 Kp re-evaluated at the physical T | (c) extents unchanged, (e) Kp_smr ≠ Kp at 1090 K |
| S7 methanation put back into the declared list (gate input) | (h) CH4 present, no methanol |

S1 passes arm (b) — the forward case cannot tell the two rules apart, which
is why arm (c) exists.

## 7. NOT done

An adiabatic `equilibriumReactor`; any Kp beyond the ideal-gas rung
(fugacity coefficients at 50 bar); carbon deposition (§2 -- in the
`gibbsReactor` since 2026-09-27, C14; in this reactor, C14 slice 2); the Ostwald
witness (§2) and a diagnosis of the complete set's stall at 500 K -- BOTH
DONE the same day, see
[`an-equilibrium-that-runs-to-completion.md`](an-equilibrium-that-runs-to-completion.md); the duty of
`equilibriumReactor`, which still sums `h_pure_ig` while its outlet is priced
by the package — the 2026-09-25 surface family, NOT enumerated when
`conversionReactor` was taken off it, harmless on every ideal-gas case in
the corpus and left for its own slice; goldens for `equil02` (no
`--record` authority; the rows a record would add are in the general's
report).
