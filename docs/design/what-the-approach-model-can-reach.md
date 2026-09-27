# What the equilibrium model with an approach temperature can reach — and what it cannot price

*Commission C10 (DEV.md 4c), asked by Vítor 2026-09-27, corrected by him the
same day ("no H₂ on the biological route"), shipped the same day on branch
`claude/c10-equilibrium-landscapes`.  Level 3 under the C9 record in
[`how-a-process-design-is-staged.md`](how-a-process-design-is-staged.md) §3.1
and the forum record
[`gibbs-map-forum-2026-07-02.md`](gibbs-map-forum-2026-07-02.md).  The
companion tool is `approach-to-equilibrium`; this one is registered
`equilibrium-landscapes`.*

## 1. What was asked

A survey, not a second page on the Gibbs reactor: for a small set of
reaction systems the corpus already solves under `gibbsReactor`, the
equilibrium landscape (conversion or key mole fraction against T at a few
P), what a declared approach magnitude does to it (the sign the engine takes
from the system's own thermicity, where |ΔT| matters and where it is
indifferent), and, as the closing page, biological nitrogen fixation as the
contrast to Haber–Bosch.  Every number from the engine; no golden recorded
by the general; every claim about the engine read in the source.

The correction that arrived mid-build is load-bearing: the biological route
has NO hydrogen.  Nitrogenase reduces N₂ with protons and electrons that
come from the organism's substrate, so "N₂ + 3 H₂ at 298 K" is Haber–Bosch
chemistry at ambient conditions, and the thermodynamics the engine can attack
is the OVERALL reaction with the real electron donor, balanced by electron
count.

## 2. What was measured before anything was written

1. **C9's data path** is a browser-side WASM run of a bundled witness
   through `useMethodRun` (`gui/src/case/methodRun.ts`), reading `kpis`;
   there is no generated JSON behind it.  The override channel replaces the
   NUMBER of a declared scalar and cannot add a key (its own header), so a
   witness that a slider is to move must DECLARE `temperatureApproach`.
2. **`gibbsMap`** (`src/propertyOps/GibbsMapOp.cpp`) sweeps the
   element-potential kernel over a `from/to/n[/log]` T × P grid, writes
   `T_K,P_Pa,deltaT_K,converged,metric,x_<species>` per cell (lines 185 and
   201–203), refuses a negative approach (109–118), assigns the sign PER
   CELL through the one home `GibbsReactor::approachDirection` (133–139;
   GibbsReactor.cpp:67–151, the sign at 106–107) and publishes a tally
   (268–292).  Its kernel is ideal gas: `g_pure_ig(T + dT)/RT` with no
   fugacity coefficient (ElementPotential.cpp:47–48).  It handles ONE
   supersaturated condensable (54–65, the two-phase branch below) and
   returns the gas-only solution unchanged when more than one is
   supersaturated (71) — a silent limit, named on the page.  The GUI
   already parsed that CSV (`parseGibbsMapCsv`).
3. **Native timing**: `nh3_equilibrium_map`'s 625 solves in 1.4 s wall
   including startup; a landscape of 93–138 solves in well under 0.1 s.  A
   pre-generated JSON with a `--check` gate would have added a second home
   for numbers the engine already publishes and bought nothing.
4. **The corpus's Gibbs reactors**: 22 units.  Five systems can be drawn at
   fixed T; the adiabatic ones (Claus furnace and boiler, the H₂ flame
   radicals, the adiabatic flame, the two Brayton–Rankine burners) have T as
   the ANSWER of an energy balance, so a fixed-T landscape is not their
   question; the ammonia plants share gibbs10's chemistry.  Claus was ALSO
   tried and failed for a second reason: its species set depends on
   case-local records (`S8.dat` is not in the catalogue; the catalogue's
   `carbonylSulfide.dat` carries no `standardThermochemistry`), measured by
   running a trial map and reading the refusals.
5. **Every reactor's route to a reaction's Gibbs energy** is
   `Reaction::equilibrium` (`src/thermo/reaction/Reaction.cpp:136–149`),
   which prices every species with `g_pure_ig(T)`; that rung refuses a
   record tabulated on the solid or liquid standard state by name
   (`Component::requireIdealGasRung`, Component.cpp:1413–1425).  Reproduced
   on a gibbsMap with glucose beside gases:

       Component 'glucose': h_pure_ig(T) evaluates the IDEAL-GAS rung, but
       this record declares standardThermochemistry.referenceState pureSolid
       -- dHf_298 and s_298 are tabulated on the solid standard state, so
       reading them here would be wrong by a heat of sublimation.

   `equilibriumReactor` and `gibbsReactor` take the same route.  No property
   operation summed a declared reaction over the phase-aware
   `Component::h_formation` / `s_formation` / `g_formation` surface
   (Component.cpp:1071, 1206, 1280), which DOES exist and reaches liquid
   water from its ideal-gas datum by the vaporisation crossing (the header
   of `s_formation` records G closing to +2 J/mol at 298.15 K on water).
6. **The records**: `glucose.dat` carries `referenceState pureSolid` with a
   primary-cited datum and NO heat-capacity block on any rung ("FLAGGED, NOT
   FABRICATED", its own words); `water.dat` carries only the ideal-gas datum
   plus Hvap, Psat and a liquid Cp; N₂, H₂, NH₃, CO₂, O₂ carry gas data.
   Nothing in the tree mentions nitrogenase, ATP or biological fixation
   (grep over `.md .tex .ts .tsx .dat *Dict README*`: only DEV.md's own C10
   entry).
7. **The only ammonia rate law** in the tree, Dyson & Simon (1968),
   declares "150 to 300 atm" and refuses outside it
   (`AmmoniaSynthesisRate.cpp:111–117`), so the kinetic side of the ambient
   point is shown by no engine number.

## 3. What was built

### 3.1 Five landscape witnesses, `tutorials/props/gibbs/landscape01…05`

Each a sealed `gibbsMap` case carrying the species list and feed of the
steady case it comes from, T linear, P = 1, 10, 100 bar (`n 3; log true;`
from 1e5 to 1e7 Pa — the op reads no list form), `temperatureApproach 0;`
DECLARED so the page can move it.  Measured natively on the sealed cases:

| witness | source | metric | cells | unconverged | dT = 50: direction tally |
|---|---|---|---|---|---|
| `landscape01_ammonia_synthesis` | gibbs10's feed | y_NH3 | 108 | 0 | 111 exothermic |
| `landscape02_water_gas_shift` | gibbs01 | elementYield C → CO₂ (= CO conversion) | 138 | 0 | 139 exothermic |
| `landscape03_steam_reforming` | gibbs02 (S/C 3) | elementYield C → CH₄ (= 1 − X) | 108 | 0 | 109 endothermic |
| `landscape04_methane_combustion` | gibbs03 | elementYield C → CO₂ | 117 | 0 | 123 exothermic + 1 undetermined |
| `landscape05_thermal_no` | gibbs06_thermal_nox | y_NO (log axis) | 93 | 0 | 94 exothermic |

Three findings from the runs, each written into the witness header rather
than left in a session:

* **The shift's three pressure columns are identical to every printed
  digit** at all 46 temperatures — Δν = 0 — which is also the proof that no
  cell condenses there (had water left the gas anywhere the columns would
  disagree).  The header's first draft said the kernel condenses water "in
  the cold, high-P corner"; that was an estimate, the run said otherwise,
  and the sentence was replaced by the measurement.
* **The ammonia 100 bar curve RISES with T from 300 to 380 K** — 0.1047 at
  300 K, 0.9311 at 400 K: that leg is Psat(T)/P of a saturated gas, the
  one-condensable branch at work, not chemistry.  The page says so where
  the curve is introduced; a reader who takes it for a conversion is
  reading a vapour pressure.
* **Combustion did not converge at 300–350 K (every P), 400 K / 10 bar and
  500 K / 100 bar** on a 300 K start, so the grid begins at 600 K; the
  plateau there is 0.99996 at 600 K and 0.9987 at 1500 K and 1 bar — flat
  on any axis, which is the "indifferent" lesson.
* **On the thermal-NO witness every shifted cell carries MORE NO than the
  equilibrium at the physical T**: the feed's overall transformation is
  combustion, the engine takes T + |ΔT| at every cell, and NO formation is
  endothermic.  The GLOBAL caveat the engine prints
  (GibbsReactor.cpp:351–354) as a curve.

### 3.2 `reactionGibbs`, a property operation, and its witness `landscape06_nitrogen_fixation_routes`

`src/propertyOps/ReactionGibbs.{H,cpp}`, registered in
`PropertyOperation.cpp`, schema `gui/schemas/operations/reactionGibbs.schema.json`.
It prices declared reactions (names in `constant/reactions`, the corpus's one
multi-reaction grammar) on the elements/formation datum at 298.15 K with
EVERY species on a DECLARED standard state (`phases { <species> idealGas |
pureLiquid | pureSolid; }` — required, never guessed, because the choice
fixes the reaction quotient's convention).  Two routes to a potential, each
named in the CSV and the log:

* at the datum temperature on a rung the record DECLARES: the rung's own
  pair, nothing integrated (`datum`) — what lets a record with a datum and
  no Cp answer at 298.15 K and nowhere else;
* otherwise `h_formation`/`s_formation` (`integrated` on its own rung,
  `crossing` to another phase, the crossing raised as an advisory whatever
  the verbosity), which refuse by name where the record lacks the leg.

It solves no equilibrium and knows nothing about a rate.  Measured, kJ/mol
as written:

| route | T | ΔH° | ΔS° J/(mol·K) | ΔG° | ln K |
|---|---|---|---|---|---|
| heterotrophic `C6H12O6(s) + 4 N2 + 6 H2O(l) -> 6 CO2 + 8 NH3` | 298.15 | 264.370 | 1441.07 | **−165.285** | 66.68 |
| phototrophic `N2 + 3 H2O(l) -> 2 NH3 + 3/2 O2` | 298.15 | 767.325 | 297.56 | **+678.608** | −273.75 |
| haberBosch `N2 + 3 H2 -> 2 NH3` | 298.15 | −91.880 | −198.11 | **−32.814** | 13.24 |
| phototrophic | 310.15 | 765.646 | 292.04 | +675.070 | −261.78 |
| haberBosch | 310.15 | −92.411 | −199.86 | −30.426 | 11.80 |
| haberBosch | 700 | −105.351 | −228.05 | **+54.285** | −9.33 |

The expected signs held: respiration pays for fixation inside the sugar
route, light must pay on the water route, and the industrial route loses
its sign between the datum and the converter temperature — which is the
reason the converter needs its pressure, and the ammonia landscape beside it
draws exactly that (y_NH3 0.9379 at 298.15 K / 1 bar, 0.0030 at 700 K /
1 bar, 0.3001 at 700 K / 200 bar ideal gas; gibbs10's SRK golden at the
same point 0.3239).  Two rows are deliberately NOT in the witness and are
quoted as refusals on the page: the sugar route at 310.15 K —

    Component 'glucose': h_formation liquid leg needs liquidHeatCapacity

(the solid leg falls back to the liquid Cp and finds none; measured on a
copy of the witness with `heterotrophic` added to the 310 K op) — and
liquid water at 700 K, not asked because a pure-liquid standard state above
the critical temperature is a number with no state behind it.

### 3.3 The page, `gui/src/ui/methods/EquilibriumLandscapesTool.tsx`

C9's shape: steps 1–2 above the interactive, 3–5 read off it, 6 closes on
the route table and the industrial contrast, the limits close the page.
One magnitude slider floored at zero.  The page runs the selected witness
as declared and, above zero, once more with the magnitude written into its
declared key; draws every converged cell and joins neighbours only; reads
the sign off the CSV's `deltaT_K` column and the run's tally diagnostics;
and performs one comparison — per pressure, the T at which the shifted curve
is farthest from the equilibrium one, which is where the local slope is
steepest (step 4's exchange rate between a horizontal and a vertical
approach).  The route table and the ammonia anchors are read live from
their runs; no number from any run is typed into the lesson prose.

The one refactor: `parseGibbsMapCsv` left `GibbsMapPlot.tsx` (which reaches
Plotly at module scope) for a pure `gibbsMapCsv.ts`, re-exported from where
it was — importing the parser into a node test runner died on `self is not
defined`, the registry.ts lesson one band down.

## 4. What the lesson says that a student is not otherwise told

* The shape of an ideal-gas landscape is two signs read off the reaction —
  thermicity and mole change — and the five witnesses cover that table,
  with the shift's identical columns as the pressure-indifference proof.
* The sign is assigned PER CELL from the feed's OVERALL thermicity, so a
  minor product whose thermicity opposes the feed's is moved BEYOND its
  equilibrium by construction (thermal NO); the reformer's shift is the
  same shape with the signs reversed.
* An approach is a horizontal move; its effect is the local slope; the same
  magnitude is a large shortfall on ammonia and nothing on a combustion
  plateau; and this is why the temperature and fractional definitions are
  not interchangeable.
* There is no hydrogen on the biological route; the three overall routes
  price on one surface; the equilibrium limit and the extent bookkeeping
  transfer to an enzyme and the temperature approach does not; a bioreactor
  here is a `batchReactor`/`dynamicCSTR` with declared kinetics, never a
  Gibbs reactor.

## 5. Citations, and the facts left uncited

Used, each already in the tree and read there: Larson & Dodge, J. Am.
Chem. Soc. 45 (1923) 2918 (`nh3_equilibrium_map` header; named as where the
measured pins live, not repeated); Dyson & Simon, Ind. Eng. Chem. Fundam.
7 (1968) 605–610 (`AmmoniaSynthesisRate.cpp:99–105`, for the validity window
only); the two record citations glucose.dat carries (Ponomarev &
Migarskaya 1960; Boerio-Goates 1991) are the datum's own and are not
re-quoted on the page.  Left uncited, said so on the page: nitrogenase, its
ATP stoichiometry, and the electron-count balancing of the two overall
routes (Vítor's correction, recorded in DEV.md 4c; no reference in the
tree).  "The BASF account of Haber–Bosch" in `ammonia03`'s README is not a
citation and was not used.

## 6. What was NOT done, and why

* **No golden recorded** for the six witnesses (the brief forbids
  `--record`); the rows a `--record` would add are listed in the general's
  report.  Until then the six cases pass the sweep on the NaN guard and
  exit code only.
* **Claus and the adiabatic flames** are not landscapes (§2.4).
* **`equilibriumReactor` beside `gibbsReactor`** on the reforming system
  is named on the page (step 1's note, `equil01_reforming`) and not run:
  that is C11's third page, after C10 lands.
* **The sugar route off the datum temperature** waits for a solid Cp on
  `glucose.dat` — a curation act (Boerio-Goates 1991 Table, its own
  header says), not a number to invent.
* **No measurement** anywhere on the page compares a landscape or a route
  with a datum; the validation subset is untouched.
* **The ideal-gas kernel** stays: the 100 bar curves are shape; the one
  SRK number beside the ideal one at 200 bar is the size of what is
  missing on one system.
* **Not rendered in a browser** here (no reachable Chromium, the
  `drive-app` precedent); vitest, typecheck and the gates are the
  evidence, and the general's report says so.

## 7. Gates and verdicts

`check_lesson_symbols` (27 of 27 modules), `check_edutool_form` (42 live
ids), `check_method_tools`, `check_schema_coverage` (92 operations),
`check_type_coverage`, `check_doctrine`, `check_process_prose`,
`check_guide_paths`, the four generated-artefact checks and the two guide
PDFs rebuilt — all OK at the time of writing; the suite verdicts are in the
commit message and the general's report.
