# The computational kernel of Choupo against DWSIM's: what "approach" should mean

*2026-11-03, DEV.md 4c C214.  A strategy study, decided by the architect
(rule 00); the measurements were taken by four generals reading the public
sources (`DanWBR/dwsim`, branch `windows`, HEAD 2026-07-17, and this tree at
`9051379af`); their four reports are in the session scratchpad and their
numbers are quoted here with the counting rule each used.  This is a
DEVELOPER record: the competitor ban (CLAUDE.md §10) covers user-facing
surfaces, and this file is not one.  Nothing here was run; no claim about
DWSIM's correctness or speed is made.*

## 1. The question, and the premise under it

Vitor was told by an assistant that DWSIM's kernel is about twice Choupo's,
and asked what would bring Choupo substantially closer in a week.  The
question carries a premise -- that the gap is a size -- and a verb --
"approach" -- that the project's own doctrine constrains: Choupo does not
race on breadth (`project-philosophy.md` §1, `ROADMAP.md` §1 and §5).  So
the study first measures what the "2x" is made of, then asks, area by area,
whether what DWSIM has and Choupo lacks is CAPABILITY a plant-design student
uses, BREADTH Choupo chose not to have, or PLATFORM; and proposes a week only
on the first.

## 2. The size, measured two ways

Two generals counted DWSIM independently: one with `cloc` (code lines, no
blanks or comments, every language) over a clone; one with physical `wc -l`
over the `.vb`/`.cs` files of a tarball of the same branch.  The two agree
once the counting rule is held fixed; the table keeps both where they differ.

| | DWSIM (cloc, code lines) | DWSIM (wc -l, physical) | Choupo (wc -l, physical) |
|---|---|---|---|
| Hand-written calculation kernel | ~187 k VB+C# (thermo, unit ops without their forms, math, solver, shared, interfaces, flowsheet base, dynamics) | ~111 k thermo + ~47 k unit-op logic + ~13 k math + ~4 k solver + ~7 k base = **~182 k** | **252 k** C++ in `src/` (unitOperations 87 k, thermo 49 k, propertyOps 33 k, postProcessing 31 k, core 11 k, reporting 7 k, solver 6 k, ...) |
| GUI | ~212 k VB+C# (+337 k XML form resources) | 135 k main app + ~40 k Eto UI + ~34 k drawing + 66 k unit-op EditingForms + 15 k thermo forms | 194 k TypeScript in `gui/src` |
| Vendored third-party source | ~127 k (DotNumerics 153 k physical: a LAPACK/BLAS translation 111 k, ODE 23 k, optimisation 17 k; ZedGraph 52 k; DockPanel 22 k; SwarmOps; a CPython stdlib 222 k Python) | ~230 k for DotNumerics + ZedGraph + DockPanel alone | 0 (the project ships no third-party source; NanoFiltran is vendored for a gate, not linked) |
| Bundled data | ~433 k lines of XML/JSON compound and BIP databases | 355 k for the compound DBs | `data/standards/` 609 components, 276 pair records; 28 568 group-estimate files |
| Samples / tests | 165 k samples (XML + YAML); tests 1.6 k VB + 47 k XML flowsheets | | 512 runnable cases, 495 golden checks; 59 k lines of GUI tests; 302 gates (142 k Python in `bin/`) |
| Everything | 2.04 M lines | | 647 k (C++ 39 %, GUI 30 %, Python 22 %, GUI tests 9 %) |

Three readings:

1. **Kernel against kernel, Choupo is the larger one** -- 252 k against
   ~185 k.  The "2x" is reached only by counting DWSIM's vendored numerics,
   its GUI forms (65 k of the unit-operations project is forms), or its
   databases as kernel.  An assistant counting a repository by folder does
   exactly that.
2. **Physical lines overstate both.**  DWSIM's VB carries long inline
   Inspector prose; Choupo's C++ carries the header essays this project
   writes on purpose.  Neither ratio is precise; the ORDER is.
3. **What Choupo has that DWSIM has in no form** is not in the kernel column:
   302 gates that refuse a run (conservation, provenance, licence, seal),
   a golden corpus of 495 cases, 142 k lines of curation tooling.  DWSIM has
   no conservation gate and no per-value provenance on output (measured by
   absence: 1.6 k lines of tests, nothing shaped like a closure check).

## 3. Area by area: what each has that the other lacks

Each row is marked by what it would be for Choupo: **C** capability a
plant-design student would use; **B** breadth the doctrine excludes; **P**
platform.

### 3.1 Thermodynamics

| DWSIM has, Choupo lacks | class | note |
|---|---|---|
| PR-SV (Stryjek-Vera), PR78, Lee-Kesler-Plocker, PR+LK hybrid | B | cubic variants; `PR`/`SRK`/`PCSAFT` cover the teaching |
| Chao-Seader, Grayson-Streed | B | petroleum-era K-value charts |
| Modified UNIFAC (Dortmund), NIST-modified UNIFAC, UNIFAC-LL | **C** | a student with no measured pair asks the group method; Choupo has original UNIFAC only.  Dortmund parameters are not freely redistributable (the DDBST tables are no-grant); the NIST-modified set is published in a US-government work |
| GERG-2008 | B | natural-gas custody transfer |
| IAPWS-IF97 complete (3.5 k lines, a port of Spang's) | **C** (partial) | Choupo's `IF97` (`thermo/iapws/IF97.H`, read) implements regions 1, 2 and 4 and the B23 boundary, and REFUSES regions 3 (near-critical) and 5 (> 1073 K) by name.  Steam is every student's utility: region 3 is the one a boiler drum near 22 MPa or a supercritical utility reaches |
| Seawater (TEOS-10, 10.6 k lines) | B | a BSD port; Choupo's seawater is a declared brine on Pitzer |
| Black oil; petroleum characterisation (assay, Riazi, pseudo-compounds, 2.8 k + 6.1 k tool) | B | `ROADMAP.md` §5 |
| CoolProp, Reaktoro, ThermoC, ChEDL bridges | P | wrappers around native DLLs |
| LIQUAC2 | B | one more electrolyte model; Choupo has four engines |
| Henry constants: 17 352 rows from henrys-law.org (Sander's compilation, CC BY) | **C** | Choupo has 206 pair records typed by convention (D2).  The source is the SAME (Sander 2015, CC BY); Choupo chose typed, per-pair records with a convention profile; the gap is coverage, not a model |
| Compounds ~1 100-1 800 (ChemSep 558 under Artistic-2.0; ChEDL 1 053 with no licence stated; CoolProp 90) | B/**C** | Choupo has 609 curated + 28 568 estimates.  The ChemSep databank is the same source Choupo imports; ChEDL's licence is unstated, which this project would refuse |

| Choupo has, DWSIM lacks | |
|---|---|
| eNRTL, Pitzer HMW, Edwards-Pitzer, Davies with a reactive speciation network, the two bases on every stream, a laboratory analysis as an inlet (A1/A2) | DWSIM: an ideal Debye-Huckel electrolyte package and Reaktoro behind a DLL; eNRTL and Extended UNIQUAC are not in its sources (grep) |
| COSMO-SAC (glass-box, user-installed profiles) | absent |
| Vapour association as a property of the vapour model (C201) | absent |
| Transport correlations as objects with window, citation and anchor; Chapman-Enskog from Svehla | DWSIM dispatches on ChemSep equation numbers (39 of them) inside a 14 k-line base class |
| Per-value provenance, review status, licence class, a sealed case | absent |

### 3.2 Flash and equilibrium

| DWSIM has, Choupo lacks | class |
|---|---|
| Boston-Britt inside-out (2-phase, 2.3 k) and Boston-Fournier (3-phase, 2.1 k) | **C** (numerics): inside-out is the industrial standard for speed and robustness on wide-boiling feeds; Choupo's nested Newton is the pedagogical choice (`AdiabaticFlash.H` says so) and is kept; an inside-out OPTION would be a solver aid that reports aloud |
| Universal flash on any specification pair (PT, PH, PS, TV, PV...) on Michelsen routines | **C**: Choupo has PT (`isothermalFlash`), P-Q (`adiabaticFlash`), bubble/dew.  PS is needed for the isentropic reference of compressors and turbines (today inside `IsentropicCore`); TV for a vessel.  A general (T,P,V/F,H,S) specification dispatcher on the existing Michelsen stability test is a one-week numerics slice |
| Solid-liquid nested loops (SLE), SVLLE | partly present: Choupo's solid phase is a Phase (ice, crystals via `solidEquilibrium`), reactive SLE in the speciation |
| Electrolyte SVLE with IPOPT | absent as such; Choupo's reactive VLE is its own Newton |
| True critical point (3.4 k) | B |

Both have Michelsen's stability test and a multiphase Gibbs minimisation.

### 3.3 Unit operations

| DWSIM has, Choupo lacks | class |
|---|---|
| Rigorous column: Naphtali-Sandholm **and** Burningham-Otto sum-rates for absorbers; per-stage efficiency; side draws, pumparounds? (side draws yes); `IExternalColumnSolver` | **C** partly: Choupo has `WangHenke`, `simultaneous` (Naphtali-Sandholm form), `fullMESH`, Murphree per stage, side draws (column04/08).  Sum-rates for absorbers is the one missing algorithm; absorbers run on the column today.  No inside-out column in DWSIM either |
| Heat exchanger: shell-and-tube RATING by Tinker's method, fouling-factor back-calculation, TEMA E/F/G/H/J/K/X, plate-and-frame, double pipe; calc modes by area / UA / outlet T / pinch | **C**: Choupo rates on eps-NTU (sensible) + `ShellTubeHX` sizing (Kern) + `htc/` correlations.  A Bell-Delaware shell-side rating (TEMA-published method, citable from Serth / Kakac) is the one method a design course asks for and Choupo does not have |
| Pipe: Beggs-Brill, Petalas-Aziz, segmented hydraulic + thermal profile | **C** partly: Choupo has Darcy-Weisbach + Lockhart-Martinelli two-phase, elevation, fittings.  Beggs-Brill is the inclined-flow standard; citable (Beggs & Brill 1973) |
| Valve Kv/Cv with opening characteristics; relief valve with choked flow | partly: Choupo's `valve` is a let-down, the relief valve is a SIZED item (API 520).  A Cv-rated valve with an inherent characteristic is the one piece the digital-twin plan (C203/C207) needs |
| Compressor/expander with performance CURVES, head, pressure ratio | **C** small: Choupo's `compressor`/`turbine` are isentropic with an efficiency (`Compressor.H`, read; no polytropic form); a declared curve (head vs flow) is a digital-twin need |
| Orifice plate | B |
| Component separator (declared recoveries) | present as `splitter` with per-component splits? (the `gasSolidSplitter`, `extract`); not a gap |
| Spreadsheet unit, Python-script unit, nested flowsheet, CAPE-OPEN host | P: Choupo's equivalents are `code/` user types (compiled) and `expression` rate laws; a nested flowsheet IS the sectored plant |
| Clean-energy units: PEM fuel cell, electrolyser, wind, solar, hydro | **C** for ONE of them: the water electrolyser (569 lines in DWSIM) -- the green-ammonia plant (greenAmmonia*) declares its H2 as a feed today |
| Equilibrium reactor on IPOPT; Gibbs with Lagrange init | not a gap: Choupo has `REquil`, `gibbsReactor` (three methods), reaction subsets |
| CSTR/PFR heterogeneous-catalytic with Flee/Mages expressions | not a gap: `LHHW`, `expression`, `catalystLoading`, cooled multitubular PFR |

| Choupo has, DWSIM lacks (measured by listing) | |
|---|---|
| Membranes: spiral-wound NF/RO on solution-diffusion, DSPM-DE, SDEM, pore Nernst-Planck; pressure exchanger; batch diafilter with fouling | none |
| Electrodialysis stack and batch ED with a predicted limiting current | none |
| Crystalliser (equilibrium, MSMPR, population balance); batch crystalliser | none |
| Dryers: spray, solid, convective, evaporative; drying curve; cooling tower on Merkel | none |
| Adsorption: PSA, TSA twin bed, fixed bed, batch adsorber; ion exchange | none |
| Cyclone (five models), bag filter, pneumatic conveyor, gas-solid splitter | efficiency splits only |
| Evaporator (multiple effect), phase changer, multi-stream exchanger | DWSIM has an HX only |
| Batch: nine units, a recipe layer, campaign ledgers, a batch plan on the steady balance | none in the kernel |
| Sizing (16 sizers), Turton costing, economics with sensitivity, land, financing, pinch targeting, plant layout in 3D with piping and roads, GMP building, clean utilities, relief as a sized item, equipment list and PFD sheet | costing is a link to a paid service; PSV sizing exists; no pinch targeting, no layout |

### 3.4 Solvers, flowsheet, dynamics

| DWSIM has, Choupo lacks | class |
|---|---|
| Recycle acceleration: Wegstein, dominant eigenvalue, GLOBAL Broyden over all tears; "simultaneous adjust" (Newton on all adjust blocks with FD gradient) | **C** (numerics): Choupo has Wegstein + Newton-on-tears.  Dominant-eigenvalue is 100 lines and is the textbook's next step after Wegstein |
| Optimiser: L-BFGS-B, truncated Newton, IPOPT, Cobyla, DE/PSO | partly: Choupo has Nelder-Mead and its own SQP (805 lines) + active-set QP.  `feedback_optimizer_confined` keeps IPOPT out by decision |
| ODE library: Dopri5, DVODE, Radau5, Gear BDF (DotNumerics port) | partly: Choupo has RK4, Euler semi-implicit, Rosenbrock23.  A stiff BDF would serve the batch reactor; Rosenbrock23 already covers stiffness at low order |
| Parallel solve of same-level units | P |
| Dynamic mode: fixed-step sequential re-solve, explicit per-unit holdups, PID, event scheduler, cause-and-effect matrix, 22 units flagged dynamic | Choupo's `choupoCtrl`/`choupoSemiContinuous` integrate a DAE-shaped system with ledgers; fewer dynamic units (4 + quasiSteady wrapping any steady unit).  DWSIM's event scheduler and cause-and-effect matrix are the one idea worth taking for the digital-twin plan |
| Automatic tear selection | neither has it (DWSIM: user-placed Recycle blocks; Choupo: declared tears, `tearSelection auto` named and deferred) |

### 3.5 Data, interfaces, governance

| | DWSIM | Choupo |
|---|---|---|
| Flowsheet format | zipped XML (`.dwxmz`), 103 k lines for 60 samples | plain-text dicts, one file per stream, diffable, written by an assistant |
| Compound DB | XML/JSON, source per database | one record per component with per-value provenance, review status, licence class; sealed cases |
| Licence of data | ChemSep under Artistic-2.0 (its `.ipd` DECHEMA-derived pair tables are REDISTRIBUTED by DWSIM -- the opposite of this project's reading, which keeps them local); ChEDL JSON with no licence stated | gate-enforced classes |
| Extensibility | IronPython script unit, .NET plugin, CAPE-OPEN host, COM automation, Excel add-in | `code/` user types, `expression` laws, five binaries with `--describe-units`, the assistant documents |
| Checks on output | per-unit balances reported; no gate | 302 gates; conservation refused |
| Governance | 6 213 commits, ~18 people, one author under four aliases with ~90 % of commits; **25 commits in the last 12 months**; last release 2025-10-03; issues disabled on GitHub (SourceForge) | one architect, one curator, daily commits |

## 4. What the measurement says about the premise

The assistant's "2x" is a folder count.  Kernel against kernel Choupo is
the larger and, by the lists above, the deeper in every domain the
philosophy names as its own (electrolytes, membranes, solids, batch,
design, provenance), while DWSIM is wider in cubic-EoS variants, petroleum,
compound count, flash specification pairs, exchanger rating methods and
pipe correlations, and carries a mature desktop platform.

The honest statement for Vitor: **Choupo does not need to approach DWSIM in
size; it is past it.  Where it should approach DWSIM is in a short list of
things a student designing a plant reaches for and finds missing** -- and
each of those is a numerics or a correlation with a citable source, not
breadth.

## 5. The week: what to build, in order

Decision rule: a row enters only if it is **C** above, serves `tutorials/
plant/` or the PIF course, has a citable free source, and fits one general
in one to two days.  Nothing from **B** or **P** enters.

| # | Slice | Why this and not another | Source | Size |
|---|---|---|---|---|
| W1 | **A general flash specification: (P,H), (P,S), (T,V/F), (P,V/F) as first-class, one dispatcher on the existing Michelsen test + nested Newton** | PS is the isentropic reference every compressor and turbine computes privately today; PH is what a valve, a mixer and an adiabatic flash all do under different names; a student should be able to ask the props bench for any pair.  ONE home for a thing that has four | Michelsen & Mollerup (own derivations); the engine's own stability test | 2 days, Opus (numerics) |
| W2 | **Shell-and-tube RATING by Bell-Delaware**, as a `method` of `heatExchanger` beside eps-NTU, publishing shell-side h, dP, the five correction factors | the one design-course method Choupo lacks; the PIF reports size exchangers by hand; DWSIM rates by Tinker | Bell (1963) and the open form in Serth, *Process Heat Transfer*; TEMA geometry declared by the case | 2 days, Sonnet |
| W3 | **Dominant-eigenvalue recycle acceleration** beside Wegstein, announced like every solver aid | the textbook's next step after Wegstein.  **CORRECTED 2026-11-04 by the build:** the study predicted it would make the flagship recycles cheaper; measured, it does NOT -- the method targets a dominant eigenvalue near 1 and this corpus's loops sit near 0.2 (process05: 6 iterations against Wegstein's 9; membrane27 and acetonePlant are WORSE, 7 vs 15 and 4 vs 6; cavett01 defeats both).  It stays as an opt-in aid, a teaching object with its own exact-on-a-linear-map gate, never a default | Orbach & Crowe (1971), read from the paper | 0.5 day, Sonnet |
| W4 | **Beggs-Brill two-phase pipe** as a declared `twoPhase { model BeggsBrill; }` beside Lockhart-Martinelli, with inclination | inclined two-phase lines are what a plant's pipe routes (C80) are; citable primary | Beggs & Brill, JPT 1973 | 1 day, Sonnet |
| W5 | **A Cv-rated control valve with an inherent characteristic (linear / equal-percentage), opening as the manipulated variable** | the digital-twin plan (C203/C207) needs a valve a controller can move; today the valve is a let-down | ISA-75.01 form (public), Fisher's handbook as cross-check | 1 day, Sonnet |
| W6 | **IF97 region 3 (Helmholtz f(rho,T)) and the verification-table gate** over regions 1-4 | the engine refuses region 3 today; a high-pressure boiler or a supercritical steam utility hits it; the IAPWS release carries its own check tables, so the gate is free | IAPWS R7-97(2012), the release's Table 5/15/33 values | 2 days, Opus (numerics) |
| W7 | **Water electrolyser as a unit** (declared cell voltage curve, Faraday efficiency, stack power -> H2, O2, heat) | the green-ammonia plant declares its H2 as a feed; the electrochemistry domain is Choupo's own | Ulleberg (2003) model, open | 1 day, Sonnet |

Not in the week, with the reason: inside-out flash (W1 first; inside-out
after, as an OPTION, if W1 shows the nested form too slow on a wide-boiling
case); modified UNIFAC (the Dortmund tables are no-grant; the NIST set needs
a licence read first -- a curation task, not a build); more compounds (the
ChemSep importer exists; the gap is Vitor's review time, not code); any
cubic variant, petroleum, GERG, seawater (B); CAPE-OPEN, COM, Python unit
(P); a global Broyden (Newton-on-tears is already there); an event scheduler
for the digital twin (C203's own design, later).

## 6. What this study does not say

It does not say DWSIM is worse; it says it is a different kind of project
-- wide, platform-heavy, one maintainer, slowing -- and that the honest
comparison is by domain.  It did not run DWSIM, so it says nothing about
speed or convergence.  The line counts are two rules on two snapshots and
are read for their ORDER.  The licence remark on ChemSep's `.ipd` tables
records a difference in reading, not a judgement on DWSIM's.
