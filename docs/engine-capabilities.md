<!--
  Choupo — Engine capabilities (DEV reference).
  The capabilities narrative that used to live in CLAUDE.md §6/§7/§9: what the
  simulator core can do today, the standard database catalogue, the known
  numerical limitations, and the roadmap ahead.
  Audience: an LLM or human EDITING the engine (same audience as CLAUDE.md),
  NOT a case author (that is docs/ai/). Relocated from CLAUDE.md 2026-06-06 to
  keep CLAUDE.md under its session-load budget; CLAUDE.md §6 now carries the
  one-paragraph summary + pointers here.
-->

# Engine capabilities

## 1. Current state (counts)

* **148 tutorials** under `tutorials/{steady,batch,ctrl,props,plant}/`;
  `bin/runTests` validates **126** of them via golden-master KPI
  comparison + NaN/inf guard (batch/ctrl trajectory cases + the `plant/`
  showcase are run-only, no `expected` file).  KNOWN GAP: the composite
  `plant/esterification2sector` sectors run (choupoProps now cascades
  controlDict/thermoPackage UP the tree, as choupoSolve does) but are not
  yet wired into `runTests` — their canonical dispatch (a sector is both a
  curate/props node and a simulate/flowsheet node) is an open call.
* **56 components** in the standard catalogue (data/standards/components/),
  plus per-case overlays under `<case>/constant/components/` for
  sample-specific data (sorption isotherms, drying kinetics, …).
* **8 Henry's-law pairs** (CO2 / NH3 / O2 / H2S / SO2 / CH4 / Cl2 / HCl
  in water), van't Hoff temperature dependence.
* **4 materials** (carbonSteel / SS304 / SS316 / aluminium) and **2
  membranes** (SW30HR seawater RO, NF270 loose NF) in the catalogue.

### Three-axiom property layout

1. INTRINSIC universal pure-compound properties (MW, Tc, Pc, ω, Tb,
   Hvap, Vliq, dHf, Cp, sorption / GAB, solid ρ_p / k_v) live in
   `data/standards/components/<name>.dat`.
2. PAIR-dependent (NRTL binary, Wilson binary, Henry's law) live in
   `data/standards/<feature>/<pair>.dat`.
3. EQUIPMENT-dependent kinetics (crystallisation k_n / k_g, drying
   curve, …) live in the case under `constant/`.
4. SAMPLE-specific measured data (a particular powder's sorption
   isotherm or critical moisture) lives in the case under
   `constant/components/<name>.dat`, which `Database` overlays
   field-by-field over the standard catalogue entry.

### Four binaries by problem class (see `src/applications/`)

      choupoSolve   --   steady-state simulation,  F(x) = 0
                          (root-finding, Newton-on-tears recycle by
                          default; Wegstein available)
      choupoBatch   --   batch / time-dependent simulation,  dY/dt = f,
                          with a recipe layer (time-triggered + condition-
                          triggered events, partial transfers, accumulators)
      choupoCtrl    --   dynamic continuous + control loops,
                          dY/dt = f(Y, u, t) with controllers writing MVs
      choupoProps   --   property evaluation + the PROPS BENCH
                          (point / 1-D / 2-D scan / LM fit / kinetics1D /
                          vleConsistency / estimateComponent)

---

## 2. Props bench (the thermo-foundation pillar)

`choupoProps` is where the student builds + decides the thermo foundation
BEFORE wiring a flowsheet, the glass-box answer to blind pick-a-method
selection: a single GUI props surface (`gui/src/ui/PropsView.tsx` — a PILL
strip, *Foundation/thermo-readiness* first and default, then Comparison /
Consistency / Estimate / Fit / Points / Scan; the older rail
`PropsNavigatorView`/`ThermoWorkspace` were retired) drives the journey
**CREATE → SEE → TEST → FIT → PROMOTE → USE**:
`estimateComponent` (Joback group contribution + Lee-Kesler ω, **+ Ambrose-Walton
Psat + Rackett/Yamada-Gunn Vliq — both corresponding states from Tc,Pc,ω**) CREATES a
component and SHOWS its error vs a `reference{}`; `experimental{}` overlays model
curves on the MEASURED data (red points) so the model is chosen from evidence;
`vleConsistency` TESTS the data (Herington area `|D−J|<10` + Gibbs-Duhem);
`fitParameters` FITS with identifiability stats.  PROMOTE: an estimate op with
`output { proposal auto; }` writes a glass-box `constant/components/<name>.estimate-<date>.dat`
(active keys ready for EoS + energy **+ VLE/flash: Psat via `vaporPressure { model
AmbroseWalton; }` and `Vliq` are now WRITTEN ACTIVE, so a Joback estimate promotes
to a FLASHABLE component** — only `gibbsFormation.s_298` remains a commented-TODO gap,
since group contribution cannot give third-law absolute entropy; + the `mv` promote
in the header).  The corresponding-states Psat/Vliq are honest ESTIMATES (degrade for
polar/associating species) — overlay vs data before design use (tutorial
`props/compare/compare_psat_ambrose_walton`).  The GUI previews it + offers
a dated download (a `showSaveFilePicker` "Save As" on Chromium; plain download on
Firefox) — it NEVER writes the final `<name>.dat`, and the engine REFUSES to
write any proposal under `data/standards/` (FROZEN, committee-managed + audited).
No silent crutch: loading an estimate logs `[estimate]`; a case-local file
shadowing a standard logs `[overlay]`; a frozen-catalogue value backfilling a
declared gap logs `[backfill]`; and a gap-bearing estimate used where VLE/flash
needs it fails with a component-aware, remedy-bearing message.  User guide:
[`tutorials/props/README.md`](../tutorials/props/README.md).

For the property-model architecture (how the property TREE scales), see
[`docs/property-architecture.md`](property-architecture.md) — the standing
design contract that gates every property-model PR.

---

## 3. Recycle solver

Defaults to **Newton on the tear variables** (residual `r(x) = G(x) - x`,
central-difference Jacobian + Gauss + plain backtracking line search via
`solver::newtonND`); `recycleSolver Wegstein;` keeps the fixed-point
accelerator as an alternative.  Both converge to the same recycle fixed point.

---

## 4. Energy streams (Option C just-wiring)

Direct scalar wires between unit ops --- a producer declares
`energyOutputs ( { name <port>; kind work; expression <expr>; } )`, a consumer
declares `energyInputs ( { from <unit>.<port>; kind work; target <key>; } )`,
and the Flowsheet copies the resolved scalar into the consumer's operation
block before its `solve()`.  Typed ports (`work` vs `heat`), the usual sign
convention, no new ProcessStream variant.  **Shaft node:** several `energyInputs`
to the SAME target SUM (not overwrite) --- a gas-turbine shaft-split where one
generator nets the turbine's gross work (+) against the compressor's load (−);
both publish `expression "-W_shaft"`.  Tutorial `combined02_brayton_rankine_shaft`.

---

## 5. Heat / utility credo (settled)

ONE rule: a heat **duty is carried by a physical stream when one is wired to
it, else it is sized to a plant utility by temperature level** (the
`utilityAllocation` report — lowest steam grade hot enough for a heating duty;
cooling water cold enough for a cooling duty).  W = a scalar wire (no carrier);
Q = a duty (utility-or-process carrier).  No abstract "Q stream" travels the
flowsheet.

- A **distillation column** exposes its **reboiler** (heating, bottoms T)
  and **condenser** (cooling, top T) as intrinsic heat ports → duties
  auto-allocate, or name `operation { condenser { utility X; } }`.
- **Forward heat-links** (heat integration): wire the duty on the CONSUMER
  like any energy link — `energyInputs ( { from col.condenser; kind heat;
  target Q; } )`.  Both ends then read `(carried)` (no double-count → the
  report shows the saving).  FORWARD links (producer before consumer) run in
  one pass; a FEEDBACK link (condenser preheats the column's own feed) is an
  **energy tear** — the Flowsheet detects it (producer listed after consumer),
  forces the recycle loop on even with no material tears, and converges the
  duty by Wegstein successive substitution.  Tutorials: `heatlink01_…`
  (forward), `heatlink02_condenser_feed_preheat` (feedback tear).
- User guide: [`docs/ai/energy.md`](ai/energy.md).

---

## 6. Reports chain

`controlDict.reports {... }` block ships `streamTable` / `massBalance` /
`energyBalance` / `utilities` / `utilityAllocation` / `profiles` / `computed` /
`design` / `economics` / `energyStreams` / `spreadsheet` (consolidated coloured
`.ods`), all selectable per case.  `utilityAllocation` sizes each duty to a
utility by T-level; its result is also emitted in the run JSON (the GUI reads it).

---

## 7. Fractal multi-sector flowsheets

`unit ⊂ sector ⊂ plant`, a recursive `flowsheetDict` shape (leaf: `type` +
`operation` + `boundary`; composite: `children` + `connections` + `boundary`),
`Flowsheet::flattenNode` descends with namespacing, and folder-level
`controlDict` / `thermoPackage` / `constant/components` walk UP the tree so a
sector runs isolated AND the full plant runs.

---

## 8. Standard database catalogue

### `data/standards/components/` (22 in this listing; 56 total in catalogue)

benzene, toluene, water, ethanol, methanol, nHexane, aceticAcid,
ethylAcetate, nButanol, **CO, CO2, H2, CH4, O2, N2, NO** (the seven
added for the Gibbs reactor), plus three synthetic-VLLE audit components
(`compA`, `compB`, `compC`), plus three non-volatile solutes for the membrane
work: **NaCl, glucose, MgSO4**.  Volatile components carry MW, Tc, Pc, ω, Tb,
Hvap_Tb, Vliq, Antoine, idealGasHeatCapacity (polynomial), liquidHeatCapacity
(polynomial when applicable), and **optionally** a
`gibbsFormation { dHf_298; s_298; phase; }` block (the `phase` keyword ---
`gas` / `liquid` / `solid` --- declares in which phase `dHf_298` is tabulated
and is mandatory for any new component; see theoryGuide §"Which rung does the
data file pin?" and ai/thermo.md).  Non-volatile solutes carry MW +
`nonvolatile true;` + `dissociation nu;` (van't Hoff factor for osmotic
pressure); Antoine and Cp blocks are not required on solutes and the VLE
machinery treats them as K_i = 0.

### `data/standards/materials/` (4)

carbonSteel, SS304, SS316, aluminium.  Each carries: ρ, F_M (Guthrie),
σ_y, maxT, maxP.

### `data/standards/membranes/` (2)

SW30HR (canonical seawater-RO archetype), NF270 (loose-NF archetype).  Each
carries: A_w (water permeability, m/(s·bar)) + a
`permeabilities { <solute> <B_s>;... }` sub-dict with the per-solute
solution-diffusion permeability B_s (m/s) + ratings (P_max, T_max, pH range,
nominal MWCO).

### `data/standards/utilities/` (9)

Plant utilities — a curated catalogue of heating + cooling + **power** services.
Each `.dat` entry carries `tier` (heating / cooling / **power**), `mechanism`
(condensation / sensible / evaporation / **electrical**), the loop fluid
(`components` + `state` + `P` + `T_in` + `T_out`), an energy density `dutyPerKg`
(J/kg delivered), a unit cost (`cost` €/GJ at a tagged `costYear`), and an
optional `driveEfficiency` (the power tier's motor/generator efficiency).
Default lineup: **steamLP / steamMP / steamHP** (saturated water vapour at
2.5 / 11 / 41 bar), **coolingWater** (25→35 °C), **chilledWater** (7→12 °C),
**dowthermA** (sensible hot-oil loop 350→270 °C), **hitecSalt** (sensible
molten-salt loop 500→400 °C), **refrigerationPG** (PG-30 brine 0→5 °C), and
**electricity** (grid power, ~0.10 €/kWh).  The `utilityAllocation` report
tallies the power tier too: pump/compressor MOTORS draw grid electricity
(`W_shaft / driveEfficiency`), a turbine GENERATOR (`electricLoad`) feeds it
back (`W_electric`, a credit), and shaft work supplied by a WIRE
(turbine→compressor) is mechanical and skipped — so a combined cycle shows a
net electricity CREDIT.  A case author writes
`PlantSteam { utility steamLP; F 60 kmol/h; }` in a stream block: the parser
pulls every catalogue field as a default (user keys override), marks the
stream's `category` to the utility name, and the `utilities` report aggregates
kg/s, MW and €/h by category.  Three "pseudo-component" entries support the
non-water utilities: **dowthermA**, **hitecSalt**, **propyleneGlycol30** under
`data/standards/components/` — Cp polynomials fitted from Dow TDS data,
Sohal et al. INL/EXT-10-18297 (Janz 1981 correlations), and Mokon's PG
datasheet, respectively.

---

## 9. Known limitations

* **LL flash for symmetric γ-models** would collapse to the K=1
  saddle if attempted via Newton-on-fixed-point or SS (both trapped
  there).  The `IsothermalFlash` LL path uses direct Gibbs-energy
  minimisation on the simplex via Nelder-Mead with multi-start
  instead.  Direct minimisation cannot fall into saddles
  of g (it samples g values, not roots of its gradient).
* **3-phase VLLE flash** verified after a multi-start audit fix.  The objective
  function (vapour ideal-gas Gibbs + γ-φ liquids + pure-liquid reference) was
  audited line by line --- formulas are correct.  The real bug was in the
  multi-start seeding: for ternaries the original component-by-component bias
  produced negative x_β via mass balance and every Nelder-Mead start returned
  the infeasibility penalty (1e8) on the first evaluation, paralysing the
  optimiser.  The fix in `IsothermalFlash.cpp` replaces the binary-style
  `buildStart` with `pushDerivedStart`: for each (β_V, β_α) candidate it derives
  y by mass balance from hand-chosen extreme x_α and x_β, and only adds the
  start to the list if every y_i is feasible.  With this fix the algorithm finds
  3-phase coexistence cleanly when it is the Gibbs-global minimum (verified on
  `vlle03_audit_artificial` --- 3 components with Psat_C ≫ Psat_A, Psat_B and a
  strong A-B LL gap; the result has V rich in C, Lα rich in A, Lβ rich in B,
  all three β > 18 %).  The earlier failures with water/butanol (binary) and
  water/ethanol/n-hexane were *not* solver bugs --- those hand-tuned NRTL
  parameter sets do not exhibit a Gibbs-minimum 3-phase regime at the (T, P)
  values tried.
* **NRTL distillation** with azeotrope is unstable in the bubble-point
  method (Wang-Henke) — it can pass through the ethanol/water azeotrope
  non-physically.  **RESOLVED**: select `method simultaneous;` on the column
  for the rigorous MESH Newton, which converges on azeotropic systems (tutorial
  `column03_azeotrope_mesh`).  Wang-Henke remains the default for ideal systems
  (faster to set up, no Jacobian).
* **Bubble-point distillation is slow** (O(100-500) outer iterations).
  The `simultaneous` method converges in ~5-6 Newton iterations
  (quadratic) — prefer it when speed matters.  Acceptable pedagogically; not
  for industrial-scale columns.

---

## 10. Roadmap ahead

| | |
|---|---|
| next | **Phase-change Rankine bottom cycle**: a real liquid leg --- pump → BOILER (boils water→steam; the HRSG with phase change) → steam turbine → condenser → pump.  Needs a multi-phase `boiler` unit op (the current heater/HX are sensible-only).  The combined-cycle shaft-split + HRSG ship (`combined02_brayton_rankine_shaft`); this closes the bottom cycle's phase change. |
| future | Liquid viscosity by group contribution; electrolyte transport; multi-component Pitzer (mixed-salt brines). |
| future | More solids unit ops: secondary nucleation (j > 0) in the FVM crystalliser; agglomeration and breakage kernels in the population balance. |
| future | Mathias-Copeman α-function refinement for the cubic EoS (CO2 near-critical accuracy). |
| big | **Equation-oriented sparse Newton for full flowsheet.**  Deliberately deferred: full EO conflicts with the glass-box pedagogy + needs hand-rolled sparse algebra + only pays off at industrial scale.  The Pareto step (Newton-on-tears) ships.  If pursued, do EO as an OPT-IN alternative mode (`solver eo;`) alongside SM, to TEACH the SM-vs-EO contrast --- each unit op gaining an optional `residuals()`, started small.  Not an SM replacement. |
| > v1  | Membrane NF/RO unit op refinements (research bridge). |
