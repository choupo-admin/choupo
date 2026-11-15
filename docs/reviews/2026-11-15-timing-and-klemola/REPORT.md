# Column timings against an open-source simulator, and the Klemola minors

Date: 2026-11-15.  Asked by the owner after an outside assistant reported
Choupo faster than the reference simulator on two columns (2.4x and 7.9x, Choupo in
WebAssembly against the reference natively) and named the Klemola C4 splitter as
the first gap to close.  Measured in the cloud container on main at
0cddb183cb.  No tracked file outside this folder was changed; every run
was on a copy of a case outside the tree.  Scripts in `scripts/` (machine
paths written `<scratch>` and `<repo>`).

## 1. Timings, same machine, same specification

THE REFERENCE SIMULATOR: an open-source (GPL-3.0) sequential-modular
process simulator, version 9.0.5 for Linux, driven headless through its
automation API (pythonnet on a private .NET 8 runtime).  It is the one
the outside report compared against; it is not named here because this
project names no other simulator in its tree
(`docs/design/no-competitor-is-named-here.md`), and its drivers are kept
outside the tree for the same reason (their imports name it).  `scripts/`
holds the Choupo side.  Each column built in the reference to
the Choupo case's specification: `column02_simultaneous` (benzene /
toluene, ideal liquid, 14 trays + reboiler, feed on tray 8, R = 2,
D = 50 kmol/h, 1 atm, feed 100 kmol/h at 365 K) and
`column03_azeotrope_mesh` (ethanol / water, NRTL, 15 trays + reboiler,
feed on tray 8, R = 2.5, D = 25 kmol/h, 1 atm, feed 100 kmol/h liquid at
354.42 K).  The reference's stage count adds the condenser (16 and 17); its
specifications are the reflux ratio and the BOTTOMS molar flow (the
complement of D); its column method `Napthali-Sandholm (Simultaneous
Correction)`; the reference's own NRTL parameters for ethanol / water (Choupo's
inline pair was NOT transferred: see 1.2).

26 timed runs per case and engine after one untimed first run; 4 cores,
nothing else running.

| case | Choupo native: the whole process (start, read, solve, write outputs and reports), fresh copy each run | the reference simulator: the flowsheet calculation only, process loaded, flowsheet rebuilt before each run |
|---|---|---|
| benzene / toluene | median 0.019 s, p95 0.027, min 0.018 (first 0.028) | median 0.227 s, p95 0.351, min 0.099 (first 0.685) |
| ethanol / water | median 0.021 s, p95 0.027, min 0.019 (first 0.031) | median 29.3 s, p95 33.4, min 26.5 (first 29.6) |

### 1.1 What may and may not be concluded

* Benzene / toluene: Choupo native about 12x faster than the reference here,
  with the comparison tilted AGAINST Choupo (its time includes process
  start and file output, the reference's does not).  The outside report's 2.4x
  compared Choupo in WebAssembly; the factor between the two is the
  WebAssembly cost, which was not measured here (no Emscripten in the
  container).
* Ethanol / water: the 29 s are NOT a fair the reference number.  The outside
  report measured 1.73 s on its own machine with a the reference it calls "Core
  10.2.16" (an edition not identified here).  This build loads its NRTL
  package on Linux through .NET 8 and uses all four cores (load average 4
  during the runs); the cause was not isolated.  The number is recorded,
  not claimed.
* A wider benchmark (several initial estimates, a 74-tray column, a
  flowsheet with recycles) is the outside report's point 5 and is not
  done.

### 1.2 Results agree on separation, differ on the reboiler

| | Choupo | the reference |
|---|---|---|
| benzene in distillate (mole fraction) | 0.9812 | 0.9784 |
| ethanol in distillate | 0.8046 | 0.8003 |
| reboiler duty, benzene / toluene | 1324.6 kW | 1308.0 kW (-1.3 %) |
| reboiler duty, ethanol / water | 1000.2 kW | 954.1 kW (-4.6 %) |

The ethanol / water pair differs because the reference ran its own NRTL
parameters; the benzene / toluene difference (ideal liquid on both sides)
is an enthalpy-model difference (Cp laws, latent heat, reference) that
was not decomposed.  The outside report's "up to 4 % on the reboiler" is
reproduced.

## 2. Klemola: what the n-butane impurity in the distillate depends on

`column14_klemola_c4_splitter` (74 trays, Wang-Henke, E_MV = 1.191
measured, subcooled reflux at 18.5 C) gives 0.0082 wt % n-butane in the
distillate against 0.20 wt % in the paper's Table 2.  One assumption
changed at a time (copies of the case; `klemola_runs.txt`):

| run | n-butane in D (wt %) | i-butane in B (wt %) |
|---|---|---|
| base | 0.0082 | 0.411 |
| P = 685 kPa (uniform, not the paper's) | 0.0095 | 0.413 |
| P = 710 kPa (uniform) | 0.0107 | 0.415 |
| feed on tray 38 (assumption A0 the other way) | 0.0067 | 0.411 |
| E_MV 1.10 | 0.0231 | 0.419 |
| E_MV 1.00 | 0.0755 | 0.444 |
| ideal liquid instead of UNIFAC | 0.0204 | 0.166 |
| **saturated reflux**, E_MV 1.191 | **0.1115** | 0.461 |
| saturated reflux, E_MV 1.10 | 0.3184 | 0.553 |
| saturated reflux, E_MV 1.00 | 0.7278 | 0.734 |
| Table 2 (printed) | 0.20 | 0.30 (its own balance gives 0.69: case header 14) |

The impurity hardly moves with the column pressure or the feed tray; it
moves by an order of magnitude with the reflux's thermal treatment and
with the efficiency.  With saturated reflux the printed 0.20 lies between
E_MV 1.10 and 1.191, and the bottoms impurity between the printed 0.30
and the balance's 0.69.  With subcooled reflux AND the paper's 119 % the
column is far too clean.  HYPOTHESIS, to be checked in the paper (a
source read, not done here): the 119.1 % was back-calculated by the
authors with their own model; if that model did not raise the internal
reflux for the subcooling, adding Choupo's subcooled internal reflux to
their efficiency counts the same separating power twice.

So the outside report's first priority ("Klemola in full MESH") would not
by itself close this gap: what decides it is how E_MV and the reflux
subcooling were combined, and the case header already shows that two of
the four printed minors are not usable targets below about 1 %.

## 2b. Follow-up the same day: the fair column model, the reference's NRTL cost, and the energy gap

**Choupo's `simultaneous` is not the counterpart of the reference's
Naphtali-Sandholm.**  It carries constant molar overflow and closes the
reboiler as the remainder of the column balance (its own report prints
`Q_reboiler_ownEnvelope_kW` 1445.7 beside the plug's 1324.6 on
benzene / toluene: the C174 finding).  The counterpart, with an energy
balance on every stage, is `model fullMESH;`.  Both cases re-run with
`fullMESH` (copies; 26 timed runs; whole process):

| case | Choupo fullMESH | the reference Naphtali-Sandholm |
|---|---|---|
| benzene / toluene, time | median 0.023 s, p95 0.028 | median 0.227 s, p95 0.351 |
| benzene / toluene, x_D benzene | 0.9776 | 0.9784 |
| benzene / toluene, Q_reboiler / Q_condenser | 1325.3 / 1308.1 kW | 1308.0 / 1286.7 kW |
| ethanol / water, time | median 0.022 s, p95 0.025 | median 29.3 s (not comparable, below) |
| ethanol / water, x_D ethanol | 0.8044 | 0.8003 (the reference's NRTL pair); 0.8028 with Choupo's pair |
| ethanol / water, Q_reboiler / Q_condenser | 1000.2 / 996.9 kW | 954.1 / 957.5 kW; 953.5 kW with Choupo's pair |

**The reference ethanol / water time.**  Same column, same build: with an
ideal liquid (Raoult) it solves in 0.10 s; with NRTL, 28-34 s, at a
similar iteration count.  Parallel processing on or off, automatic
estimation of missing NRTL parameters on or off, and the initialisation
scheme change nothing.  So the cost is in this build's NRTL evaluation
(version 9.0.5 on Linux, .NET 8, 894 pairs in the package's table), not in
the column method; the outside report's 1.73 s on its machine is
plausible and the 29 s here is not a statement about the reference.  With
Choupo's NRTL pair transferred (the reference's form is tau = (A + B T)/(1.98721
T), so A = b R and B = a R with R = 1.98721 cal/(mol K)), the reference's
distillate moves to 0.8028 against Choupo's 0.8044, and its reboiler
does not move: the energy gap is not the activity model.

**The energy gap is on Choupo's side, and it is the known one.**  the reference's
latent heats at the normal boiling points equal Choupo's records within
0.13 % (benzene 30759 against `HvapTb 30720` J/mol, toluene 33212
against 33180).  Per mole of top vapour (total condenser, V1 = (R + 1) D
= 150 kmol/h on benzene / toluene), the reference condenses 30881 J/mol, which is
its correlation at the top composition (0.978 benzene, 353.8 K: 0.978 x
30759 + 0.022 x about 34900 = 30851); Choupo condenses 31394 J/mol,
which implies about 31300 J/mol for benzene at that temperature, +1.9 %
above its own record's `HvapTb`.  Choupo's liquid enthalpy reaches the
latent heat by its 298.15 K bridge and the two heat-capacity laws, not
by the record's boiling-point datum: the "two latent heats" already
named in `docs/design/what-water-dat-does-not-say.md`.  On ethanol /
water the same arithmetic gives +4.1 % (41016 against 39394 J/mol of top
vapour).  These are derived from published duties and records, not from
a call of Choupo's latent heat; a props operation printing the surface's
implied latent heat beside `HvapTb` would settle it.

## 2c. A large column in both engines: the Klemola splitter, 74 trays, 9 components

To time a problem of industrial size, the same specification was built in
both engines: `column14_klemola_c4_splitter`'s feed (nine components,
452.71 kmol/h at 329.5214 K, 658.6 kPa), 74 trays plus reboiler and a
total condenser (the reference: 76 stages), feed on tray 37, reflux ratio
11.440296, distillate 142.023556 kmol/h (the reference: bottoms 310.687401
kmol/h), 658.6 kPa throughout, Murphree efficiency 1 and saturated
reflux (the measured 1.191 and the subcooling dropped, because full
MESH takes neither), and the SAME thermodynamics on both sides: ideal
liquid and ideal gas (the case's UNIFAC and SRK replaced, so that no
activity-model implementation is timed).  Choupo `model fullMESH;` on a
copy of the case; the reference Naphtali-Sandholm.  Machine otherwise idle.

| | Choupo fullMESH (whole process) | the reference Naphtali-Sandholm (calculation only) |
|---|---|---|
| time | median 3.374 s, p95 3.527, n 10 (first 3.593) | median 42.6 s, p95 43.6, n 5 (first 45.4; an earlier single run 44.5) |
| reboiler / condenser | 8385.0 / 8906.8 kW | 7947.2 / 8628.6 kW |
| n-butane in D (mole fraction) | 0.000352 | 0.001366 |
| i-butane in D | 0.92954 | 0.92571 |
| i-butane in B | 0.001771 | 0.003524 |

Choupo is about 12.6x faster on this column, the comparison again tilted
against it (process start and file output counted on its side only).

The two engines do NOT reach the same column here, and that matters
before anyone quotes the speed: the trace impurities differ by a factor
2 to 4 and the duties by 3 to 5.5 %.  With an ideal liquid the
difference can only be the pure-component data (each engine's own
vapour-pressure correlations for two isomers whose relative volatility
is about 1.3, where a small change in the ratio moves an impurity by a
large factor, and their heat capacities and latent heats), plus the
latent-heat difference of section 2b.  Not decomposed.

## 2d. Proposals for the laptop, filtered by Gall's law (nothing built)

The owner's filter, stated when these were reviewed: **only suggestions
that follow Gall's law go to the laptop** -- a complex system that works
has evolved from a simple system that worked; a complex system designed
from scratch never works.  So each proposal below grows from a piece of
Choupo that already works, is small, and answers a need that exists
today.  The ones that did not pass are listed at the end with the reason,
so they are not re-proposed by accident.

Measured context.  Choupo's Jacobians are finite differences almost
everywhere (`DistillationColumn.cpp:2120`; the simultaneous MESH colours
them by Curtis-Powell-Reid, `NewtonND.H:121`; `ReactiveVLE.cpp` and the
rate-based segment by central differences), with ONE analytic Jacobian,
the DSPM-DE pore (`PoreNernstPlanck.H:36`), and `NewtonND` already accepts
a caller's analytic Jacobian and audits it on the first iteration
(`NewtonND.H:139-143`).  OpenFOAM (read 2026-11-14,
`../2026-11-14-openfoam-property-architecture/`) assembles its matrices
from the discretisation and, where it uses Newton, uses analytic
derivatives; it has ONE energy-to-temperature Newton with Cp as the
derivative (`thermoI.H:238-299`).

**Passed:**

1. **One temperature-from-enthalpy inversion.**  Grows from two working
   homes (`reactorOutlet::temperatureOfEnthalpy`, `ReactorOutlet.cpp:189`;
   `VariableVolumeHoldup::temperatureFromEnthalpy`,
   `VariableVolumeHoldup.cpp:203`) and, by a rough count not verified file
   by file, eighteen unit files that loop on a temperature against an
   enthalpy.  It REMOVES complexity rather than adding it: one home that
   asks the package for H and the Cp of the same law.  Start by moving the
   two named homes into one and pointing their callers at it; take the
   other units one at a time, each with its cases unchanged.
2. **The enthalpy carried by diffusion in the film's energy balance.**
   Not new machinery: a check on the working slice B1 before the ternary
   slice builds on it.  OpenFOAM adds sum_i j_i h_s,i to the heat flux; a
   rate-based interface must carry sum_i N_i h_i.  NOT checked whether B1
   does; a question for the ternary slice's review.
3. **Property-law information for the agents that write cases.**  Grows
   from the working `choupoSolve --describe-units`: the same output for
   the property laws (form, the units and logarithm base of the
   coefficients -- C398's U3 -- the window rule, an example block), read
   from each law's registration.  The need is now: several laws per
   property are arriving and an agent must write a record or a pin
   correctly.  **Audience (the owner's words): the AI agents that author
   cases, with the STUDENT AS THE MAN IN THE MIDDLE** -- the agent writes,
   the student reads, questions and approves; the output is exact for the
   agent and readable by the student, one text for both, and is what the
   agent quotes to the student when it explains a choice.  Belongs beside
   `bin/llmctx` and `docs/ai/`.
4. **Set one dictionary entry by path from the command line, for the
   same agents.**  Grows from the working `Dictionary::setScalarAtPath`:
   a thin command that edits ONE entry through the engine's own parser
   and unit check, so the student sees a one-line change instead of a
   text edit.  Build it only when an agent's text edit has broken a case
   (no such failure was measured here).

On an equation-oriented flowsheet mode the roadmap already names the only
Gall-compatible form (`docs/engine-capabilities.md`, the "big" row:
opt-in `solver eo;` beside the sequential solver, each unit gaining an
optional `residuals()`, started small): the simple working system is the
per-unit full MESH; any step grows from it, opt-in, two or three units
first, on a concrete need (product specifications without a `designSpec`,
recycles that do not converge today), never for speed -- section 2c shows
speed is not today's problem.

5. **Stiff kinetics: measure, then make the rate evaluation cheaper,
   before any analytic Jacobian.**  The owner's point: a Jacobian for the
   kinetics, so as not to depend on RK4.  MEASURED that the simple
   working system already exists: `choupoBatch` and the dynamic driver
   carry an L-stable, error-controlled Rosenbrock23 (and Rodas4, EulerSI;
   `src/solver/ODE/`), opt-in, selected by 23 cases; its Jacobian is
   finite-difference (dense, or coloured when a structure is declared,
   audited on the first step, `Rosenbrock23.H:42-52`).  On
   `ignition01_h2o2` (O Conaire 2004 H2/O2, 1100 K, 5 bar) it runs in
   1.53 s wall and reaches ignition; the sibling `ignition01_h2o2_rk4`
   (explicit RK4, same deltaT) clips negative amounts and stops with
   T = nan after 0.02 s -- the stiffness lesson, as the case says.
   Profiled with callgrind (one run, instruction counts, the whole
   process = 100 %):

   | where | share |
   |---|---|
   | `BatchReactor::derivatives_` (the right-hand side, all calls) | 97.0 % |
   | `rateOfReaction_` | 91.1 % |
   | `fdJacobianODE` (the finite-difference Jacobian, inclusive) | 68.9 % |
   | `Component::h_pure_ig` | 35.4 % |
   | NASA-9 `H` + `S` (`DomainBoundCp`) | 42.0 % |
   | `modifiedArrheniusRate` | 1.6 % |

   So the Jacobian IS most of the time, but what makes it expensive is not
   the Arrhenius arithmetic: it is the species enthalpies and entropies
   that `Reaction::equilibriumKc` recomputes for every reversible reaction
   at every call (`BatchReactor.cpp:537`), and the finite-difference
   columns that perturb a species amount do not change T, so they
   recompute the same Kc again.  Gall's order, each step measured before
   the next:
   (a) evaluate each species' standard Gibbs energy ONCE per state and
       share it across the reactions, and reuse Kc across the Jacobian
       columns that leave T unchanged -- no new algorithm, same numbers
       to round-off, and by the profile above it should remove most of
       the thermochemistry's ~55 %;
   (b) re-profile; only if the Jacobian still dominates, an analytic
       Jacobian for the commonest form (mass-action Arrhenius rates, whose
       derivative in the amounts is closed-form), audited against the
       finite-difference one by the audit that already exists;
   (c) the case-written formulas of `core/Formula` (differentiating their
       expression tree) only if (b) pays.
   The need today is modest -- the stiff case takes 1.5 s -- and grows
   with the mechanism: the finite-difference Jacobian costs one
   right-hand side per species, each of which costs one Kc per reaction.

**Did not pass, and why** (kept here so they are not re-proposed):
* A mixed analytic / finite-difference Jacobian in the column MESH: no
  measured need (speed is not a problem; no failing Newton was shown);
  justified only by a future system, which is designing ahead of need.
  (The analytic Jacobian of the KINETICS is item 5, with its measurement.)
* Frozen-property inner loops (the inside-out method): speed only.
* Models attachable to ANY unit (a generic heat loss): a general
  framework with no case asking for it; if a unit ever needs a loss to
  ambient, it starts in that unit and is generalised only when a second
  one does.
* A deferred correction for a hard Newton: a remedy for a failure that
  has not happened.

Observation, not a proposal: the reference simulator's flash settings
include `PVFlash_TryIdealCalcOnFailure = True` and a fail-safe mode, i.e.
a failed calculation silently retried as ideal.  Choupo's
no-silent-crutch rule forbids exactly that; a contrast worth showing a
student.

## 3. Not done

The WebAssembly timing; the deeper cause inside the reference's NRTL; a props
operation that prints Choupo's implied latent heat; the wider benchmark
(Klemola in both engines, a recycle flowsheet, several initial
estimates); the paper read for the efficiency's derivation.
