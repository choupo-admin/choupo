# DEV.md — where the project is, and how to move it forward

The starting point for any development session on Choupo.  Read this + `CLAUDE.md`
(the always-loaded brief) and you know the state, the settled contracts, and the
next work — no need to reconstruct it from scattered notes.  Companion to
[`RELEASING.md`](RELEASING.md) (how to cut a release) — this file is *where we
are and what to do next*.

*Last synced 2026-08-04.  Verify any number against the tree before relying on it —
and prefer `generated/releaseInventory.json` to any number written in prose.*

---

> **Development style (Vítor, 2026-08-23):** real problem -> fix the cause ->
> smallest useful test -> stop.  No new gate, framework, manifest, tier or
> policy without a real observed failure that demands it; remove machinery
> whose purpose has ended; every piece of work explainable in plain language
> (what was wrong, what changed, how we know it is better).  The verification
> layer serves the simulator, never the reverse -- and no meta-mechanism to
> enforce this rule: it is applied by judgement, which is the point.

## 1. Current state (facts, not history)

- **Branches (revised 2026-07-29):** `main` **is** `Choupo-dev` — the default
  branch carries the continuously-updated development line, no pre-announced
  target version.  **Work happens on `main`.**  A release is an immutable tag
  `vYYMM`; a `release-YYMM` branch is cut from that tag only on the day a patch
  actually ships.  `dev` is retired.  Rationale and procedure: `RELEASING.md`.
- **Latest release:** `Choupo-2608` — immutable git tag `v2608`, patched as
  `v2608.1` (packaging only: the frozen app's engine paths; the engine, the
  citation and the public name are unchanged).  Its frozen browser copy at
  `choupo.org/v2608/app/` IS published, built from `v2608.1` by
  `freeze-app.yml`, and was driven in a browser: every engine request stays
  inside its prefix and the answer reproduces the release's own golden.
  (`Choupo-2607` was withdrawn on 2026-09-02.)  `main` is tagged as the next
  `Choupo-YYMM` when the project has something worth freezing (decided at cut
  time, never pre-committed — 2607 to 2608 was seven weeks, so no cadence is
  promised anywhere).  This paragraph said the frozen copy was NOT published
  for most of 2026-09-02, and went on saying so after it was — corrected the
  same night.
- **Site:** served by a SECOND repository, `choupo-admin/choupo-admin.github.io`
  — it holds the `CNAME` and any frozen `/vYYMM/app/`.  This repo only BUILDS
  it: `publish-site.yml` builds AND publishes on every push to `main` (the
  top-bar badge reflected `09343fb0` minutes after that push on
  2026-09-02, which is the measurement); `freeze-app.yml`, `release-tag.yml`,
  `release-notes.yml` and `withdraw-release.yml` are `workflow_dispatch` and
  cover the release chores — `RELEASING.md` has the table.  This paragraph
  used to say the workflow "publishes nothing" and that publishing was a hand
  act; that was true once and had been false for weeks.  **The top-bar
  badge (`Choupo-dev · <commit>`) is the staleness check** — if it is not the
  commit you pushed, the deploy did not land.
- **Health:** run `bin/runTests` — it prints the verdict, and a verdict copied
  into prose is a verdict that drifts.  This line used to read "299 / 0" and
  the suite had been at 344 / 0 for a while.
- **Scale:** **do not read a count from here.**  The single source of truth is
  `bin/curate/release_inventory.py` → `generated/releaseInventory.json`
  (components, species, pair catalogues, unit-op models, runnable cases), and a
  `runTests` gate fails when it goes stale.  CLAUDE.md §6 already says the
  tally must not be hand-maintained "and that includes HERE" — this file was
  carrying its own copy anyway (288 tutorials against 306 in the generated
  inventory), which is the arity sin in the very document that warns about it.

## 2. The architecture in one page (pointers, not a re-derivation)

The authority is [`docs/architecture/CHOUPO-CONSTITUTION.md`](docs/architecture/CHOUPO-CONSTITUTION.md)
(level 1) + [`docs/architecture/property-architecture.md`](docs/architecture/property-architecture.md)
(level 2); the authority map is `docs/architecture/README.md`.  **These were
synchronised with the v2-native engine on 2026-07-23** — they no longer describe
the retired v1 grammar (that catch-up was the point of the last work session).

- **Files on disk are the single source of truth.**  Topology, state, numerics
  and thermodynamics each live in their OWN file; every role is INFERRED, never
  re-declared.  No backward-compatibility shims.
- **A case:** `system/` (controlDict, flowsheetDict = TOPOLOGY only, solverDict,
  outerDict, postDict) · `constant/` (thermoPhysPropDict + propertyManifest +
  records) · `0/` (complete initial stream state, one file per stream).
- **Thermo (v2, NATIVE):** `constant/thermoPhysPropDict`
  (`recordType thermophysicalPropertySystem; schemaVersion 2;`).  The builder
  assembles each `equilibrium.formulation` natively — `gammaPhi`, `gammaGamma`
  (LLE/VLLE), `diluteSolution` (Henry), `phiPhi` (one cubic both roots),
  `electrolyteGammaPhi`.  v1 (`propertyDict`/`thermoPackage`) is REFUSED.
  Author-facing detail: `docs/ai/thermo.md`.
- **Sealing:** `bin/choupo-import` copies a case's dependency closure into its
  own `constant/` under a sha256 `propertyManifest` (`sealed true;` = runs with
  `data/standards/` hidden — the thesis-archive test).
- **Conservation is the curriculum** (the 2607 signature): every converged
  steady run emits a plant-boundary ELEMENT balance by default; batch carries
  material+energy ledgers as exact state differences on the elements datum;
  ctrl integrates an accepted-state ledger.  Claims are tri-state
  (FULL/PARTIAL/UNAVAILABLE) with named reasons, never silent zeros.
- **Engine:** 3 layers (OuterDriver / simulator core / PostProcessor), 4
  binaries by problem class.  UnitOperation base: override `type()` + `solve()`,
  optionally `kpis()`/`producedStreams()`/`profile()`; explicit factory, no
  auto-registration.  All solvers hand-written (Newton-on-tears recycle,
  Wegstein, Nelder-Mead/SQP, RK4/Rosenbrock, Michelsen TPD).  C++17, no external
  libs, Make.

## 3. Settled — do NOT reopen

The standing list is `CLAUDE.md` §5/§10 + the Constitution §7.  The load-bearing
ones for day-to-day work:

- v1 property grammar is DEAD (refusal only); `components/` FLAT; pair catalogues
  under `parameters/<MODEL>/`; assets flat with a `kind` field; `streamFaces`/
  `faces{}` naming closed; `streams{}`/`boundary{}` GONE (role inferred).
- One Gibbs surface per phase.  Elements-at-25 °C datum for all formation/reaction
  enthalpy.  No silent crutch (declare → verify → refuse).  H conserved, T the
  model-dependent readout at model boundaries.
- Element-balance seal requires EVERY element to close (anti-cancellation);
  ONE "Element balance" GUI view; ctrl toys are mass-conserving isomerisations.
- No CMake, no external deps, no auto-registration, no Python rewrite.
  GPL-3.0-or-later; *Choupo* is a TalentGround trademark, separate from the code.
- No competitor names in user-facing manuals.  Choupo is an independent,
  self-funded personal project (not an institutional product) — never frame it
  otherwise in any prose.

## 4. Roadmap for the development line (candidate work, priority-ish)

**DEFERRED BY VITOR 2026-09-26 -- a hand-rolled SQP with finite-difference
gradients ("vamos deixar isso para mais tarde").**  A candidate, not a
commission.  The shape is settled enough to write down so it is not re-argued:
BFGS-damped SQP, l1 merit line search, the QP subproblem on the EXISTING
`solver/ActiveSetQP` (the weighted-least-squares reconciler already is a
constrained QP solver), no external library, glass-box announcements for an
infeasible QP, a rejected step, and a finite-difference step below the inner
solver's tolerance -- the last being the noise that makes SQP over a recycled
flowsheet stall, which is the reason it is not offered lightly anywhere.
FIRST STEP when it is taken up: Hock-Schittkowski witnesses (public, known
optima) run on `ActiveSetQP` before any SQP line is written; a gate sabotaged
by hand; students breaking it.  Nothing built.

**SEPTEMBER 2026 — THE ENGINE IS FROZEN, BY DEFAULT (architect, 2026-09-02;
DELEGATE-WITH-DEFAULT under philosophy §4, reversible by one line here).**
Students adopt this month.  Measured before deciding: in the 30 days to
2026-09-02, 848 commits — 369 to `docs/`, 256 to gates, 217 to `src/` — the
apparatus grew faster than the engine it guards; `CLAUDE.md` gained 1678
lines in August; 73 of 97 design records were born that month; the full
suite takes 37 minutes and the ladder (§6a) was broken four times in one
day by the architect himself.  And of 393 runnable cases, FIVE declare
`tier tutorial;` while the four cases the app offers a student as "your
first clicks" declare no tier at all — the learning surface the app
presents and the one the inventory declares are different things.
Gall: a system that works evolved from a simple one that worked; the
working system is the engine and the corpus, and what does not yet work is
what the student MEETS.  So, for September:

1. **No new unit operations.**  Models only on Vítor's order (Chapman-Enskog
   and modified Eucken, 2026-09-06, were).  **Gates are NOT frozen** — this
   line used to say they were, and it was false within four days: measured
   2026-09-06, fifteen gates landed between 09-02 and 09-06, and each one
   saw a defect no case could see (a crystalliser volume in kilomoles, a
   first law the GUI computed for itself, a dryer that made water).  The
   2026-09-04 ruling *never trade a gate for speed* had already settled it,
   and a freeze line that contradicts a ruling is the stale copy.  What IS
   frozen is the apparatus's SHAPE: no new tier, manifest or framework.
   Engine debts (A2 `identity()`, #34, #35, #13) only if a student case
   trips one.
2. **Cure the memory** — this file's §1 (done 2026-09-02), a home for the
   student-walkthrough programme (legs 4–5 have records, 6 is a task
   title, 1–3 are session memory: reconstruct from `git log`, and where
   that fails say so), and a `CLAUDE.md` DIET by demotion: each §6 slice
   narrative already has a design record; the file keeps the invariant
   and the pointer.
3. **Declare the first path** — `tier tutorial;` on the cases a student
   should meet first, chosen by reading `docs/tutorials-catalogue.md`,
   each one driven in the frozen app in a browser and read as the student
   reads it.  The choice is recorded in the controlDicts, which is the
   deliberate act the tier doctrine asks for.
4. **The delivered artefact under the instrument that found everything on
   2026-09-02** — a TOOL, `bin/drive-app` (built the same day; never a gate: it needs a
   browser and a served copy, the Poling precedent), run from
   `RELEASING.md`'s freeze step, reporting requests outside the prefix,
   views that error, hints that lie.
5. **The last week is empty**, reserved for what students send back.
   The mode of failure of a complex system is not predictable from its
   structure.

Reserved to Vítor, untouched: the catalogue reseal (`Choupo-2607` in the
sealed manifests), `paper/README.md`, the Guthrie/Turton attribution, the
Burcat citation ruling, P-swing, speciation aliases, the basis mass
migration.


0. ~~**A column over a chemistry (sour-water programme S1 + S2 first
   piece)**~~ — **DONE 2026-08-04.**  `ThermoPackage::stageK` is the one
   entry a tray asks for equilibrium: forwards to `Kvec` for a molecular
   package (all 12 column tutorials byte-identical), runs the reactive
   flash for a reacting one.  A four-stage sour-water column converges in
   7 Newton iterations to |F| 8e-10.  **Two definition errors paid for
   once and worth remembering**: a K-value is an INCIPIENT quantity (y/x
   off the flash returns a column of zeros on a subsaturated trial state →
   singular Jacobian → `Newton iters: 0`; the subsaturated branch now uses
   the equilibrium partial pressures, `pEqAtm`); and a trial composition
   can leave the simplex (CO2 at −8.5e-4 against a feed of 8e-3) → an
   ANNOUNCED projection, negatives clamped, exact zeros left alone.
   Witnesses `column12_stage_is_a_flash` (molecular control, adiabatic
   re-flash) + `column13_sour_water_stage_identity` (identity closing at
   1e-9 **on the ions too**).  Per-tray chemistry (pH, ionic strength,
   every molality) now rides in `profile.csv`.  Gates
   `check_stage_identity` + `check_tray_chemistry`, both
   sabotage-verified.  Fixed on the way: `adiabaticFlash` priced EVERY
   inlet as a sub-cooled liquid regardless of its vapour fraction.
   **NAMED GAPS**, neither of them papered over:
   * ~~the reactive adiabatic flash~~ — **CLOSED 2026-08-23**: the
     adiabatic flash's outer Newton survives a trial T the package cannot
     answer (announced, treated as the high side, re-seeded by bisection
     from the feed), so column13 re-flashes ADIABATICALLY and claims BOTH
     halves of the identity;
   * ~~S2 proper~~ — **BUILT 2026-08-23**: `stripper01_sour_water`, eight
     reactive trays, the mechanism strict across an order of magnitude of
     carbonate loading, plus the pinned free-ammonia SURGE below the feed
     (check_tray_chemistry T5).  Building it closed two engine holes: the
     MESH initial ramp vs the two-phase band (stageK's incipient fallback
     on the typed NonConvergence) and the per-tray chemistry report
     flashing a liquid pinned to its own bubble point (now speciated as a
     liquid).  Record: `docs/design/sour-water-stripper-scope.md` §6d.
     ~~S3~~ — the model
     addition S3 waited on shipped 2026-08-04 (`edwardsPitzer`), and **S3
     itself shipped 2026-08-23**: `edwards02_table7_vle` reproduces the
     paper's Table 7 predictions (18 anchors, bands sized to the measured
     residual, the carbamate curated case-locally, the vapour side as the
     speciate op's `vapour {}` block).  Record:
     `docs/design/sour-water-stripper-scope.md` §6c.

1. ~~**Ctrl physical energy**~~ — **DONE 2026-08-01.**  `dynamicCSTR` is
   reformulated on a stored `H(n,T)` (elements datum): the inlet term is the
   exact enthalpy difference `Σ ṅ_in,ᵢ[hᵢ(T_in) − hᵢ(T)]` and `ΔH_r` is
   evaluated at the CURRENT T, both from `speciesPhaseEnthalpy` — the surface
   whose `dh/dT` IS the declared liquid Cp, which is what makes the ODE the
   exact derivative rather than a resemblance.  The ledger now CLAIMS: stored
   H, per-face enthalpy flows, jacket heat, `energy_*` KPIs, five trajectory
   columns and `energy_available,1` in the sidecar.  A model that cannot reach
   the datum keeps the old equation and the old refusal — the ctrl toy species
   carry no heat of formation on purpose — and the route taken is ANNOUNCED,
   never chosen in silence.  Witness `ctrl11_esterification_jacket` (closure
   1.4e-7, second-order in deltaT: the residual is the ledger's trapezoid, not
   the physics).  Gate: `check_ctrl_balance` gained the claim, the refusal, the
   step-refinement order and a T-dependent-Cp fixture (all sabotage-verified).
2. ~~**Ctrl electrolyte energy — the mixture-H state formulation.**~~ —
   **BOTH HALVES SHIPPED 2026-08-01.**  The dynamicCSTR now carries THREE
   probed, announced energy routes: canonical per-species; MIXTURE-H (the
   vessel stores TOTAL H as a state and integrates dH/dt = Hin − Hout + Q
   on `H_liquid_formation` — partial-molar terms implicit in the state,
   reactions inside the datum, T a Newton readout from the same surface);
   and Cp/convective (toys, refusing as ever).  `ctrl10` RUNS and CLAIMS
   at 7.9e-11; its `.expect-nonconvergence` is deleted per its own
   instruction.  Gate: check_ctrl_balance §6d.  Originally: half
   of the original slice SHIPPED 2026-08-01: the vessel Cp is route-aware
   (`cpSurface_`: declared liquid Cp, else the numerical T-derivative of
   the component's own stored-H leg — one surface, one derivative), and
   the canonical-route decision now PROBES the per-species surface and
   quotes its own error instead of trusting `hasEnthalpyDatum` alone.
   That probe is what keeps `ctrl10_brine_concentration` honestly
   refused: an electrolyte salt's enthalpy is MIXTURE-level
   (`aqueousSaltEnthalpy(m, T)`, molality-dependent) and the per-species
   API refuses to pretend otherwise (forum #103).  The REMAINING half —
   what actually runs ctrl10 — is the mixture-H state formulation for
   dynamic vessels: store H(n, T) through `H_liquid_formation`, step it
   with the partial-molar terms done right.  The `cpSurface_` numerical
   fallback additionally awaits its first honest witness (a
   solution-tier solute WITHOUT a declared liquid Cp — sucrose declares
   one, glucose has no solution pair; do not fabricate a record for it).
   Was misattributed to roadmap #1 until 2026-08-01.
3. ~~**Williams-Otto reference case**~~ — **ALL FOUR ANCHORS SHIPPED
   2026-08-01** (x* to all digits; Fig.-2 step; Fig.-4 PI; §5.3 optimum
   J = 546.8/551.8 = 99.1 % via the first `outerDict` over choupoCtrl —
   the campaign is now a pure functor, so every OuterDriver works on the
   dynamic path; §5.2's path constraint = SQP-over-noisy-functor,
   deferred, named).  Originally: first slice shipped the `williamsOttoPlant` unit (eqs. 3.6–3.11 verbatim, klb/h/°R internal, SI boundary, three conversions announced) + `ctrl12_williams_otto` landing on the published x* to all printed digits.  Remaining anchors (step responses, the four PI channels with the paper's tunings, the OuterDriver pairing on the §5 optima) stay banked in the design doc as the follow-on cases.  Originally: UNBLOCKED 2026-08-01 when Vítor
   supplied the primary PDF (arXiv:2004.07614v1) and the full spec is
   BANKED in `docs/design/williams-otto-reference-case.md` — the verbatim
   ODEs (3.6–3.11), kinetics (a_i, b_i, ρ in the klb/h/°R convention,
   noting the paper's "Réaumur" lapse for Rankine), and four validation
   anchors, headed by the published steady state x* = (3.27, 7.47, 1.12,
   9.81, 1.69, 0.22) klb at u* = (10, 20, 580, 129.5, 0.2).  Build plan
   in the same document: a `williamsOttoPlant` dynamic unit (verbatim
   equations, SI at the dict boundary), then ctrl12 pinned on x*, then
   the step/PI/OuterDriver cases.  The earlier search-snippet fragments
   (k20 7.2117e8 vs 7.2177e8) belong to the DIFFERENT Forbes-Marlin RTO
   lineage — never blend the two parameterisations.
4. **PC-SAFT association term** — **BUILT 2026-08-03** (2B+4C Wertheim with
   the three ratified amendments; witness `pcsaft03_association_pure`, gate
   `check_pcsaft_association`).  The mixture witness (flash20,
   2026-08-03) closed the validation battery AND caught the water-scheme
   mis-curation (4C → 2B, the paper's own site count) plus an importer
   gap (per-unit `thermo{}` overrides now ride the seal closure).
5. **New unit operations / catalogue expansion** — the strength area; add with
   KPIs + a golden-master tutorial + the theory-guide section (a feature is
   incomplete without its manual).
6. ~~**solverDict consolidation**~~ — **OPTION A DECIDED + SHIPPED
   2026-08-04** (lint 08-01, docs 08-04:
   [`docs/ai/case-layout.md`](docs/ai/case-layout.md) "Where a numerical
   option lives").  The four homes are INTENTIONAL, organised by *whose*
   number it is; B and C were scoped with file:line evidence and not
   taken.  **`speciation aliases` remains OPEN and unapproved** — it
   touches the settled `pitzer` ≠ `pitzerHMW` contract, so it is Vítor's
   call, and approving A was not approving it.  Original scope: SCOPED
   2026-08-01, decision now in §4b: the four solver-option homes are
   mapped with file:line evidence and three options posed
   (recommendation: document + lint the silently-ignored solverDict, no
   grammar move) in
   [`docs/design/solverdict-consolidation-scope.md`](docs/design/solverdict-consolidation-scope.md).
7. ~~**Reports default-on beyond elementBalance**~~ — **DONE 2026-08-02.**
   Corpus impact measured as the entry demanded: the full suite ran with the
   three defaults live across the 120 steady cases that declare no
   `reports {}`, 384 PASS / 0 FAIL, goldens untouched (KPI-based, and the
   reports write artefacts, not KPIs).  massBalance and energyBalance joined
   elementBalance as default diagnostics of every converged steady run.  The
   design point worth keeping: **refusal posture follows provenance.**  A
   DECLARED `energyBalance {}` on a missing enthalpy datum keeps its hard
   ERROR — the author asked for a verdict and cannot have one — while the
   DEFAULT instance reports the SAME facts (curation remedy included, the
   machine-readable `status,REFUSED` artefact still written) as
   `energyBalance UNAVAILABLE` on stdout, because absence of curated data is
   not an error of a case that never claimed an energy closure.  The per-unit
   gap line follows the same register.  `enabled false;` opts out per report,
   independently.  Gate: `check_default_reports` (defaults + both postures +
   the REFUSED artefact + independent opt-out; sabotage-verified).
8. **Pinch full programme** (real match sizing beyond the heuristic screen).
9. **Adsorption A5-A6** — A4's energy ledger SHIPPED 2026-08-01 (duty =
   exact state difference; ergun campaign claims at machine level —
   2.6e-15 on batch18 since the A5 exact-commitment form, was 6.7e-14; A3
   keeps its named gap).  **A5 first step SHIPPED 2026-08-01: the
   ISOTHERMAL FEED SWITCH** (`setParameter feed.<component>`,
   concentration-swing regeneration) — the commitment jump is ledgered as
   `feedAmendment` records (the new DatumAmendment hook), the breakthrough
   sampler freezes its pre-switch claims, and batch19_feed_switch_purge
   witnesses load-then-purge with the duty handing −413.6 → −23.7 kJ
   back; gate `check_feed_switch` fires 6 named refusals
   (sabotage-verified both ways).  **A5-T1 SHIPPED 2026-08-01: the
   ADIABATIC bed** (`energyBalance adiabatic;`, ergun-only — the A3
   closure pins c_tot by declaration and refuses) — one T per cell, the
   van't Hoff isotherm fed the LOCAL T, equilibrium-theory anchors
   (u_th, the ΔT_ad bound) announced pre-run, the campaign energy
   balance CLAIMED adiabatically on per-cell vessel enthalpy (closes
   5.7e-5 on batch20_thermal_breakthrough; t_50 806 s vs batch18's
   3042 — the warm bed holds less).  Design:
   docs/design/fixed-bed-thermal-a5.md; gate check_thermal_bed
   (6 refusals, sabotage-verified).  **T1.5 SHIPPED 2026-08-01: feed.T
   is the TSA hot-purge control** (thermal mode only; the isothermal
   refusal now points at the declaration that unlocks it) — a feed at a
   new T re-declares the WHOLE remaining commitment (retire OUT at
   T_old + declare IN at T_new, both ledgered; the molar ratio is the
   pinned-P ideal-gas scaling and the enthalpy repricing rides in the
   packages' own T).  Witness batch21_tsa_hot_purge: load → 400 K clean
   purge in one campaign, ~97 % regenerated, energy CLAIMED across the
   swing (1.6e-4 on 14300 kJ); sabotage: dropping the retire package
   makes the campaign itself report the leak.  **T2 SHIPPED 2026-08-01:
   the WALL-COOLED bed** (`energyBalance wallCooled;` +
   wallHeatTransfer{h;T_wall;dBed} — declared, one-knob-guarded) — the
   removed heat integrates as a STATE ROW of the same ODE (the
   M_in/M_out pattern), the `wallHeat` record reads that state, and
   batch22_wall_cooled pins the containment bracketing (t_50 856 s
   between the adiabatic 806 and isothermal 3036; T_max 312.3 K between
   T_wall and 336) with energy claimed at 2.7e-4; the desync sabotage
   is caught by the witness golden.  **batch23_tsa_cycles (2026-08-01)**
   runs THREE full TSA cycles with today's grammar (fifteen ledgered
   amendments, energy claimed across ten switches) and MEASURES the CSS
   approach: end-of-cycle qbar 0.3151 → 0.2415 → 0.1748, ratio ~0.9,
   not converged — the A6 question made visible.  A6 is COMPLETE: items 1-3 (declared cycles, per-cycle snapshots,
   tri-state verdict) shipped 2026-08-02, item 4 (`repeat untilCSS;`)
   2026-08-14 with witness `batch24_tsa_until_css` — declares 6 cycles,
   uses 2, announces why, and refuses without a tolerance or a cap.  It
   also MEASURED that the CSS norm and the loading are different
   quantities (norm flat at ~2.1e-2 while qbar marches at ratio ~0.9),
   so a tolerance chosen without looking can certify a drifting bed —
   evidence for the rule that the engine never invents that number.  STILL
   REFUSING, named: pressure swing / blowdown (transient c_tot), flow
   transients (transient Ergun), flow reversal.  Close those + A6 to
   complete the programme.

**AUTHORISED 2026-09-08 (Vitor: "Sim.  Faz no sabado") -- WHAT MAKES A FOLDER
A LEVEL OF A CASE HAS TWO ANSWERS, AND ONLY ONE OF THEM IS DECLARED.**  The
engine reads `sectors ( ... )` / `units ( ... )` from the parent's
flowsheetDict; the GUI indexes a sub-node ONLY when the folder carries its own
`.cho` (`subNodesFor`: `if (!rel.endsWith(".cho")) continue`), and
`drillableSub` then asks `tutorialByName` for it.  A case can therefore be
CORRECT for the engine and MUTE for the GUI, with nothing anywhere saying so:
`greenAmmoniaIndustrialN2` shipped with the root marker alone, and its 4
sectors and 19 unit folders were unreachable by double click while
`bin/runTests`, `--fast` and `--gui` were all green (fixed 2026-09-08 by adding
the 23 markers -- the symptom, not the cause).

Vitor's instinct was "create the `.cho` automatically".  MEASURED, that is the
weak form of the right idea, for two reasons: the marker is no longer empty (it
carries the canvas LAYOUT snapshot, `FlowCanvas.tsx` -- and a drilled sector
becomes its own case, so its marker acquires its own layout), so it cannot
simply be dropped; and whichever TOOL creates it, a case authored by hand and
never passed through that tool stays mute -- the same defect moved, and still
two readers with two answers.

THE SHAPE TO BUILD: the GUI index stops REQUIRING the file to consider a folder
drillable -- it derives membership from the parent's DECLARATION, which is the
one home -- and the `.cho` is written when there is a layout to store, which is
the only thing it stores.  Then the file cannot be missing, because it is no
longer the condition of existence, and a student never has to know it exists.
Plus the gate nothing asserts today: a folder the engine flattens as a member
is openable in the GUI.  Cost, stated: `subNodesFor` gets its list free from
the file map today; deriving means reading each level's `sectors`/`units`
recursively (the GUI has the parser).  The 23 markers already committed stay
correct under either design.

## 4b. Waiting on Vítor (not blocked — each CHANGES WHAT THE ENGINE REFUSES)

> **2026-09-07 — EIGHT ITEMS ARE OPEN, and this list is the ONLY durable home
> for them.**  They accumulated across the September audit campaign in a
> session task list, which is a SESSION artefact: it dies with the container,
> and every finding in it would have to be rediscovered from scratch.  A
> finding nobody wrote down is a finding nobody made.  Each of the eight
> below CHANGES WHAT THE ENGINE REFUSES, PRICES OR PUBLISHES, which is why
> none of them is the assistant's to take under the 2026-08-08 delegation
> ruling.  Nothing here blocks anything: the engine runs, the corpus passes,
> and each item is a decision about which of two defensible behaviours is
> the right one.
>
> * **R1 — NF270's water permeability is ~3x above published measurement.**
>   Not the header (that was fixed 2026-08-05 by REMOVING a false kind of
>   claim); this is the MODEL's own input.  Vítor delegated the primary-source
>   search 2026-09-07.  Choosing a number is curation and is his.
> * **R2 — a sweep writes no `converged/`, and therefore no design sheets.**
>   `sugarPlantEconomicsSweep` is the case it costs: the flagship economics
>   case ships no specification sheets at all, and `check_equipment_pinned`
>   carries a standing excuse naming it.  THE QUESTION: should a driver with
>   a representative pass write that pass's state view?  (The console banner
>   and caveat block already report ONE NAMED PASS since 2026-09-07; the FILE
>   is the half deliberately left to him.)
> * **R3 — is the GUI download the CASE, or the CASE + the RUN?**
>   Recommendation on file: two downloads, not one folder — a case a student
>   hands in and a run they were graded on are different artefacts, and
>   merging them makes the second unfalsifiable.
> * **R4 — drawing the first law without a sign convention.**  Proposed
>   2026-09-05: (B) a per-unit enthalpy waterfall straight off the engine's
>   ledger, then (A) a control-volume Sankey with `h = u + P*v` drawn as two
>   layers on each boundary stream.  (B) is safe and small; (A) commits the
>   project to a drawn sign convention a student will read as doctrine.
> * **R5 — an LVPP-native COSMO-SAC variant (CS25 or GMHB1808)** as a NEW
>   `ActivityModel` with atom-typed profiles, validated against measured VLE.
>   Authorise or park.  It is licence-clean (MIT) — the blocker is scope, not
>   rights, and the 2026-09-06 sigma-profile record explains why an LVPP
>   profile may NEVER wear a `variant "2002"` label.
> * **R6 — should an UNREAD key inside a record REFUSE or ANNOUNCE?**  Blocks
>   the `thermoPhysPropDict` audit, which was measured CLEAN — so the cost of
>   refusing is zero today and unbounded tomorrow.
> * ~~**R7 — the costing banner names a source the coefficients do not come
>   from.**~~  **CLOSED 2026-09-08**, and HALF OF IT WAS ALREADY CLOSED WHEN
>   THIS ENTRY WAS WRITTEN — which is the entry's own lesson.  The factory had
>   registered `Turton` as the proper name with `Guthrie` accepted as an
>   ANNOUNCED alias, and the comment at that site argued the case in the same
>   words this entry used, as though it were new: *a document that records a
>   limitation must be verified against the engine before it is written down,*
>   not only before it is repeated (CLAUDE.md §10).  What was REAL: the banner
>   did not read the registered name at all — `Guthrie::type()` returned a
>   hard-coded class literal, one reader (`CostingPass.cpp`), pinned by NO
>   golden — so a case declaring `Turton` was answered `Guthrie` on screen.
>   The class keeps its name (the bare-module FORM is Guthrie's, 1969); the
>   METHOD it reports is `Turton` (whose coefficients these are, App. A), and
>   the two are different questions.  No number moved.
> * **R8 — should a plant PRODUCT sit at the domain level, and does the
>   plant's label become the file's name?**  The 2026-09-07 lowest-common-
>   ancestor rule settled inlets and internal streams; a plant OUTLET is
>   deliberately asymmetric (declared vs merely labelled) and this is the
>   remaining question it leaves.


> **2026-08-08 — THE QUEUE WAS CLEARED IN ONE PASS**
> ([`queue-ruling-2026-08-08.md`](docs/design/queue-ruling-2026-08-08.md)):
> C1 delegation mechanism ratified (amended: immediate ship, no silence
> mechanism, reserved list), C2 one solid-equilibrium architecture with
> class-appropriate solid models + mandatory 3-case spike — **built,
> reviewed and PASSED the same day; target RATIFIED, migration AUTHORISED
> under [`solid-equilibrium-spike.md`](docs/design/solid-equilibrium-spike.md)
> §7's four boundaries**, C3 uniform
> `phases ( … )` direction approved (no mass migration), D2–D4 defaults
> approved, N1–N5 closed as deferred with named triggers.  **Open for Vítor: NONE**
> (same-day addendum: the escalated D1 resolved into the standing curation
> ledger — a cited Wilson standards pair is explicitly owed until a primary
> source is verified, blocking nothing; the withdrawal as first ruled would
> have broken three passing tutorials carrying inline pairs, and the record
> says whose error the premise was).  Items below are kept as history;
> none is awaiting a ruling unless marked.

> **2026-08-14 — ONE ITEM IS OPEN.  V1: the lumped-Cp column energy model.**
>
> `Absorber` and `Stripper` share the textbook stage energy balance -- liquid
> Cp is the SOLVENT's alone, vapour Cp is the FEED gas at feed composition,
> both constant across the column, source = heat of absorption.  It does not
> conserve the canonical (formation-datum, full-mixture, T-dependent) enthalpy
> the energy report prices, so every non-isothermal column leaves a first-law
> residual on its own streams: **+82.93 kW** on `absorber01_NH3_water`,
> **-19.87 kW** on `stripper01_NH3_water`, **-11.25 kW** on the acetone
> plant's absorber.
>
> All three were invisible until 2026-08-14, reading `n/a` in the
> model-boundary ledger because the audit only ran on units declaring a duty
> and all three are adiabatic.  The units now ANNOUNCE the approximation (the
> `dynamicCSTR` posture) and the size stays where the report publishes it.
> **Nothing is broken and nothing is waiting on this to keep working.**
>
> THE QUESTION: should the balance be reformulated onto canonical enthalpy?
> It is a PHYSICS change, not a reporting one -- it moves the temperature
> profile, hence the K-values, hence every product composition in every
> absorber and stripper case, including the acetone plant's offgas loss.
>
> **V2 (found the same day, NOT fixed): the energy report prices an UNPINNED
> stream on `vf == 0`, which the constitution bans by name.**
>
> `StreamStateIO`'s reader says it outright: the `vaporFraction` default of
> 0.0 is "a starting value", "reading it as liquid is precisely the implicit
> pin the constitution bans and the flash19 duty was paying for", and
> **"consumers that price energy ask `phasePinned`, never `vf == 0`"**.
> `BalanceMath::streamH_elements` asks `s.vf`: when a stream resolves
> SINGLE-PHASE, `streamSplit` returns nothing and the fallback prices on the
> carried default, so an unpinned vapour is priced as a LIQUID.
>
> Measured on `absorber01_NH3_water`: its gas feed moves from -6572 to
> -4594 J/mol (-182.56 to -127.61 kW) and the column's imbalance from
> +82.93 kW to +27.98 kW.  **That is the ONE confirmed instance.**
>
> `evapDryer01_nacl` was recorded here as a second and is NOT one: its energy
> row is `gap` -- the unit has no elements-datum route, so the report never
> prices its streams and the mispricing cannot occur.  Its `vf 0` is the
> carried default being DISPLAYED, which says nothing about any computation.
>
> A scan finds 27 boundary inlets carrying the signature (unpinned, permanent
> gas plus a sub-critical species), but it cannot separate them, and the two
> examined most closely turned out NOT to be instances.
>
> **THE SCOPE IS NARROWER THAN THE SCAN, and the three cases separate
> cleanly** (checked 2026-08-14, one representative each):
>
> * **SINGLE-PHASE VAPOUR, unpinned, holding a sub-critical species -- the
>   defect.**  `streamSplit` returns nothing (a single-phase resolution is
>   not a split), the fallback prices on `vf == 0`, and a vapour becomes a
>   liquid.  absorber01, evapDryer01.
> * **TWO-PHASE -- not affected.**  `streamSplit` resolves it and prices on
>   the split; only the DISPLAYED `vf` is the carried default.  `flash10`'s
>   feed is genuinely 64 % vapour (the flash runs at the feed's own T and
>   returns V/F 0.6408) and displays `vf 0`, yet its node closes at
>   -2.4e-5 kW with or without a quality pin: the pin shifts every stream's
>   enthalpy together, so it perturbs a correct reading rather than repairing
>   a wrong one.  Cosmetic -- worth knowing before anyone "fixes" 27 files.
> * **ALL components above their Tc -- not affected.**  The Tc screen recovers
>   `vf 1`; the gas-solid feeds (N2 + silica, the solid on its own block)
>   price as vapour correctly.
>
> So the ones that MATTER are those resolving single-phase vapour with a
> sub-critical component present.  ONE is confirmed; the rest are
> unclassified, and the scan cannot separate them without resolving each.
>
> **A DETECTOR WAS BUILT AND WITHDRAWN, and its false positives are worth
> more than its true one.**  An advisory in `streamH_elements` -- fire when an
> UNPINNED stream is about to be priced on `vf == 0` while its own
> equilibrium resolves all-vapour -- was written, built, run over 80 steady
> cases, and REVERTED unshipped.  It cannot make the distinction the
> constitution makes: `phasePinned` is set BY THE FILE READER ONLY, so a
> liquid a UNIT computed is indistinguishable from a file's untouched
> default, and `ProcessStream` says exactly that ("a vf a producing unit
> wrote is not a constraint: it is that unit's answer").
>
> What it flagged was almost entirely COLUMN DISTILLATES -- `column01`, `03`,
> `04`, `05`, `09`, `10`, `12`, `shortcut01`, `acetone05/06/07`, `dewT01`.  A
> total condenser sets `vf = 0` ("already condensed") and the package, handed
> that stream's own (T, P, z), answers ALL VAPOUR.  Either those distillates
> are reported at a state that is not a liquid, or the package and the column
> disagree about the same point -- the column/thermo version of the
> absorber's lumped-Cp gap.  ONE CASE SETTLED IT -- see V3.

> **V3 (2026-08-14): the distillate is reported at the overhead's DEW point
> while labelled a fully condensed liquid.**
>
> `column01_benzene_toluene`, measured with the engine's own saturation units
> on the distillate's own composition (98.12 % benzene / 1.88 % toluene,
> 1 atm):
>
> | | K |
> |---|---|
> | `T_bubble` (`bubbleT` unit) | 353.6310 |
> | `T_dew` (`dewT` unit) | **354.2132** |
> | what the column reports for `distillate` | **354.211**, `vf = 0` |
>
> The reported temperature coincides with the DEW point to 0.002 K and sits
> 0.58 K above the bubble point.  `DistillationColumn.cpp` sets
> `dStream.T = T[0]` with `dStream.vf = 0.0; // already condensed`, and the
> condenser duty is a latent heat evaluated isothermally at that same `T[0]`.
> A total condenser's saturated liquid product is at the BUBBLE point of
> `xD`; the dew point is where condensation BEGINS.
>
> WHAT IS MEASURED: the three temperatures above, and that the same shape
> appears on every column the withdrawn detector reached (`column01`, `03`,
> `04`, `05`, `09`, `10`, `12`, `shortcut01`, `acetone05/06/07`, `dewT01`).
> WHAT IS **NOT** ESTABLISHED, and I am not asserting it: whether `T[0]`
> being the dew point is a deliberate isothermal-condenser convention that
> the duty term is consistent with, or an error in the stage-0 temperature.
> The two have different fixes and I have run out of evidence, not out of
> arithmetic.
>
> THE STAKE: 0.58 K on this narrow-boiling binary, and the gap widens with
> the boiling range.  Any fix moves ~12 column goldens and the acetone plant,
> so it is yours.  It also decides whether the withdrawn V2 detector was
> reporting a defect or a convention when it flagged those distillates.
>
> **V4 (2026-08-15, found by the fleet sweep): the fractal cascade hands a
> child the DICT but not the DATA HOME the dict's model needs.**
> `twoSectorDemo`'s dignified children (SECTOR_R/S) inherit the parent's
> `thermoPhysPropDict` (NRTL) through the cascade, but parameter-catalogue
> resolution stays relative to the CHILD's case dir, which has no
> `constant/parameters/NRTL/` -- so the child refuses with all 45 pairs
> missing, including the 10 that exist one level up.  The parent passes
> because its streams only ever cross the 10 curated chain pairs.  The
> refusal itself is correct doctrine (no silent model substitution); the
> question is whether case-local parameter precedence should read "nearest
> ancestor along the cascade" for a dignified child -- property-architecture
> territory, level 2, so it is yours.  Until then the two children FAIL
> honestly at the refusal instead of dying mute at compile (their case-local
> code was missing `#include "thermo/ThermoPackage.H"`, stranded by the
> header-hygiene campaign -- that half is fixed).  NOTE the second stratum:
> the compile failure had been HIDING the refusal, one defect masking
> another, which is the strongest argument the sweep has made for itself.
>
> Both cases tested are REPORTING-only: their unit models carry their own Cp
> / psychrometric energy balances, so their KPIs and goldens do not move.
> That is NOT established for the other 25.
>
> THE QUESTION: should `streamH_elements` price an unpinned single-phase
> stream on its RESOLVED phase instead of the carried default?  The reader's
> own contract says yes; the risk is that every mispriced stream's reported
> enthalpy moves with it, and any golden pinning an energy KPI moves too.
> Adding a pin per case -- as done for absorber01, where the pin is true on
> its own merits and its golden did not move -- treats the symptom, and the
> next hand-authored file misses it again.  Record: the correction section of
> `docs/design/model-boundary-energy-ledger.md`.  The
> architect will not make that change quietly, and it is not urgent: the
> approximation is now declared, which is what the doctrine asks of it.
> Record: `docs/design/model-boundary-energy-ledger.md` (final section) and
> `tutorials/plant/acetonePlant/CLAUDE.md` (final section).

**DECISIONS 2026-08-02 (Vítor, after an external second opinion).**  The
rulings, verbatim in spirit; each item below is annotated where it lives:

1. **PC-SAFT association: APPROVED**, 2B+4C for the first phase, with
   three amendments: (i) the internal site representation must NOT be
   structurally locked to 2B/4C (extensible without a rewrite); (ii)
   watch the nested iteration (density solver × association fixed point)
   — consistent tolerances, no numerically noisy derivatives; (iii)
   WIDEN the validation: intermediate quantities too (site fractions
   X^A, the association contribution itself), plus an explicit proof
   that with no association block the behaviour is byte-identical to
   the current core.
2. **Pinch: APPROVED, P1 ONLY for now** ("recomendar, nunca reescrever"
   ratified).  Document the method's hypotheses explicitly (constant
   CP segments, phase-change treatment) so students don't over-trust it.
3. **solverDict: the SILENT ignoring must disappear NOW** (incompatible
   with the philosophy).  Consolidation later ONLY if the four homes
   are truly redundant; if they are different configuration LEVELS,
   keep them but make the levels explicit in the grammar — so the next
   step is the characterization, then the lint/refusal.
4. **Seal drift: NO mass reseal.**  Seals preserve case history;
   reseal a case only when that case is genuinely revised.  Debt #1 is
   thereby CLOSED as policy.  **Executed under that policy 2026-08-03:
   the sealing-SCHEMA migration** — `sealSchema computational;` across
   the corpus (328/0, fail-closed, legacy byte hashes preserved as
   provenance): the claim is now the PARSED content
   (`core/DictCanonical`), cosmetic drift is announced-not-diverged,
   and the drift report classifies origin evolution
   cosmetic-vs-computational.  Record:
   [`docs/design/computational-seal-migration.md`](docs/design/computational-seal-migration.md).
5. **Curation:** (a) definition-category errors are correctable by the
   assistant WITH a logged review trail — fluorine F2 = 0 EXECUTED
   2026-08-02 (this commit); (b) neopentane measured value PROMOTED
   (same commit; the process05 overlay stays — its nPentane twin
   carries sample-specific values, axiom 4); (c) ring-strain compounds
   are HIGH priority and the WHOLE CLASS should be surveyed, not just
   two — **survey EXECUTED 2026-08-03**: the class section in
   [`docs/design/curation-backlog-estimated-records.md`](docs/design/curation-backlog-estimated-records.md)
   covers every saturated-ring record in standards (cyclopropane,
   ethyleneOxide, RC318, cyclopentane + the cyclohexane control) with
   deviations following the strain ladder (65 / 71 / ~85 / 11 kJ),
   zero corpus consumers (no golden moves on promotion), and the
   ≈3,589 ring-name estimates in the lake flagged at tier level.
   Promotions are Vítor's; RC318 needs primary confirmation first.
6. **P-swing (PSA): DO NOT ship** until the energy balance carries the
   expansion-work term (eps·dP/dt).  Explicit refusal over an
   incomplete model.  P1/P2 stay parked behind the term.
7. **Restricted speciation: APPROVED** with two conditions: the reduced
   network must still pass the mathematical consistency checks (mass,
   charge, stoichiometry), and every result from a reduced model must
   be clearly LABELLED as such.

These are decisions, not tasks.  Work continues around them; none should be
taken by a helper, because each one makes the engine refuse something it
accepts today, and that is a policy call.

1. ~~**Unread dict keys.**~~  **DECIDED AND BUILT 2026-07-31 — announcing, and
   staying that way.**  A key written and never read is reported by name, with
   the key the model actually looked for offered as the correction.  It does
   NOT refuse, and that is the MEASURED answer, not timidity: the corpus's only
   dead keys are the two cyclones that short-circuit on a solids-free feed and
   never reach their geometry — lawful behaviour a refusal would break.  Gate:
   `bin/curate/check_unread_keys.py` (fires, states the cost, does not cry
   wolf, and pins the explained set).  It found the fermenter in
   `ChemicalPlantTutorial` declaring `T 310 K;` while running at 315.
   (The proposal doc this line used to point at never existed — the pointer was
   written from memory and was wrong.)
2. ~~**`role` vocabulary migration.**~~  **DECIDED AND BUILT 2026-08-02 —
   the split, without the fifth word.**  Vítor asked for an MIT-level
   thermodynamics panel and for evidence on the two reference process
   simulators; the evidence settled it.  Neither carries a word meaning
   "this liquid cannot evaporate" — one has a participation Type beside a
   case-scoped Henry list, the other orthogonal boolean facts beside the
   stored boiling point — so in both, volatility is a CONSEQUENCE of data
   × declared model, never a declaration.  Both also fabricate where a
   correlation is missing (1e-10 by hand; Lee-Kesler automatically), which
   is the crutch this project forbids: **structure adopted, remedy
   refused.**  `role` narrows to the case's modelling class (four words,
   no migration); `volatility { class; provenance }` states the substance's
   physics WITHOUT restating `Tb` (one datum, one home — the record already
   carried a cited 530.15 K that influenced nothing); the engine ANNOUNCES
   the contradiction and continues.  Absence stays UNKNOWN, so the
   247-record migration is demand-driven.  The gap document's proposed
   fifth word is DROPPED: "volatile, correlation missing" is a fact about
   our curation backlog, not about the substance.  Forum:
   [`docs/design/role-vocabulary-forum-2026-08-02.md`](docs/design/role-vocabulary-forum-2026-08-02.md);
   gate `check_volatility_declaration` (sabotage-verified); fixture
   `utility01_dowtherm_preheat` — a fluid sold for vapour-phase heat
   transfer, modelled K = 0, and now saying so out loud.
3. ~~**flashComplex's 10 divergent component records.**~~  **DECIDED AND
   BUILT 2026-08-02 — and the premise was false.**  Vítor ruled "mete no
   catálogo curado"; measuring before acting is what stopped that from
   IMPOVERISHING it.  With block comments stripped and whitespace
   normalised, the ten mirrors added **2 lines** and *lost* **93**: every
   physical constant byte-identical, the copies missing `liquidViscosity`,
   `uniquac`, `ebulioscopic`, `associationFactor`, `diffusionVolume`, the
   `cosmo` sets and `aliases`.  One of the two additions merely restates
   the catalogue's own uniquac values inline.  The ONE real fact was
   `water: aqueousSpeciation none;` — required of every component in an
   electrolyte system by the SystemClassifier contract and simply missing
   from the curated water record, which is *why* the case mirrored water
   at all.  PROMOTED to the catalogue; the nine impoverished mirrors
   DELETED (the case's `converged/` is byte-identical after — the
   definition of duplicate).  `NH4HCO3.dat` STAYS: it is a declared
   REFUSAL with an order-of-magnitude logK, and promoting that into the
   frozen tier is the fabrication the project forbids.  The provenance
   blocker on moving the case into `tutorials/` is therefore GONE.
4. ~~**Seal divergence: announce or refuse?**~~  **DECIDED AND BUILT
   2026-08-02 — and the binary was the wrong question.**  Vítor sent it to
   a professors-AND-students forum; seating the students first dissolved
   it.  The first-year edits a record on purpose (that is how he learns
   what it does) and a refusal teaches him only that Choupo is fragile;
   the masters student writes "runs on Choupo-2607" in her thesis and
   needs to not quote the tool wrongly; the doctoral student names the
   answer — those are different situations, and the engine must not guess
   which one she is in.  The MEASUREMENT settled the rest: `verifySeal()`
   returned a divergence count that ALL THREE binaries discarded, so the
   divergence lived on stderr and a golden from a diverged run was
   byte-indistinguishable from one from a verified run.  So: the verdict
   is now TRI-STATE and reaches the RESULT (`seal.verdict` =
   verified | diverged+named records | unsealed, and **unsealed is never
   verified** — sealing nothing is not passing); `announce` stays the
   DEFAULT; and the refusal exists as the CASE's declaration
   (`onDivergence refuse;` inside `propertyManifest{}`, the archival
   posture).  Auto-resealing is rejected outright — silently rewriting the
   manifest to match edited files destroys the only evidence anything
   moved.  Forum:
   [`docs/design/seal-divergence-forum-2026-08-02.md`](docs/design/seal-divergence-forum-2026-08-02.md);
   gate `check_seal_verdict` (sabotage-verified: forcing the verdict to
   "verified" fails it on the diverged AND unsealed probes).
5. **solverDict consolidation + speciation aliases (roadmap #6)** —
   scoped 2026-08-01,
   [`docs/design/solverdict-consolidation-scope.md`](docs/design/solverdict-consolidation-scope.md):
   pick option A/B/C for the four solver-option homes (recommendation A —
   document + lint, no grammar move), and say whether speciation aliases
   are wanted at all given the settled `pitzer` ≠ `pitzerHMW` key
   contract.  The TEMPORAL half of phase (f) is **BUILT 2026-08-03**
   (form B ratified with amendments) —
   [`docs/design/batch-temporal-utilities-proposal.md`](docs/design/batch-temporal-utilities-proposal.md)
   §8: the demand staircase on the accepted-driver-step grid closes
   against the exact ledger records (REFUSED otherwise, the record
   stands), peaks from the canonical profile only, impulses excluded
   with a warning, gate `check_temporal_utilities` with the three
   mandated sabotages.  The reconciliation caught two REAL ledger bugs
   on day one (transfer jumps priced as duty; hand-off routed after the
   clock-note) — both fixed, recipe goldens re-recorded with the
   attribution reason.
7. **PC-SAFT association term (roadmap #4)** — approved 2026-08-02 and
   **BUILT 2026-08-03** per
   [`docs/design/pcsaft-association-proposal.md`](docs/design/pcsaft-association-proposal.md)
   (status block there records the three amendments and how each is
   honoured).  Water 2B / ethanol 2B records curated (water FIRST
   mis-curated 4C — the mixture witness caught it; **the scheme is part
   of the fit**); water density −7.5 % = the 2-site fit's published
   trade-off, Psat −0.2 % at 358 K; oracle at machine zero;
   non-associating corpus untouched at 1e-10.  Battery closed by
   `flash20_ethanol_water_pcsaft` (predictive vs fitted NRTL side by
   side: K's within ~2 %/~11 %, V/F 0.65 vs 0.51); theory-guide chapter
   ch:pcsaft written (c4e35974).
8. **Pinch full programme (roadmap #8)** — P1 targets BUILT 2026-08-03;
   **P2 BUILT 2026-08-03** as the ratified ANALYSIS table
   (candidateMatches.csv, exhaustive per-region pairs, independent-bound
   duties, CP rule at the pinch only, "thermodynamically admissible
   candidate" and never "optimal" — gate `check_pinch_p2`,
   sabotage-verified; violations sum == current − target on the classic).
   [`docs/design/pinch-programme-scope.md`](docs/design/pinch-programme-scope.md).
   **P3 (area/cost via ShellTubeHX + Guthrie) stays UNAUTHORISED** —
   propose again before building.
9. **Curation backlog: estimated dHf records** — survey 2026-08-02,
   [`docs/design/curation-backlog-estimated-records.md`](docs/design/curation-backlog-estimated-records.md):
   all 45 Joback dHf_298 records vs known primaries.  Headline:
   `fluorine.dat` (elemental F2) carries dHf = −435,550 by Joback — an
   element is 0 BY DEFINITION (s_298 derived from the wrong number too);
   ring-strain outliers cyclopropane (~65 kJ, wrong sign) and
   ethyleneOxide (~71 kJ); the isomer-blind xylene/butene sets; the
   neopentane 13 kJ the process05 overlay already works around.
   Promotion is a curation act — the list only ranks it.
10. **Basis reconciliation — the SPIKE is BUILT (2026-08-03), the MASS
    MIGRATION is NOT authorised.**
    [`docs/design/basis-reconciliation-spike.md`](docs/design/basis-reconciliation-spike.md)
    §8.  The two-unit chain carries the species basis across a model
    boundary as matter (`origin` + `solvedAtT`), the reader STORES a
    verified block, rows are canonically ordered, a block with no
    `network`/`basis` REFUSES, gate `check_basis_spike` sabotage-verified
    twice.  Three finds beyond the ratified list: a carried equilibrium
    must state the T it was solved at; `aqueousSpeciation none` is about
    CHARGE not presence (ethanol no row, N2 a neutral one); and
    **`bin/choupo-import` could not re-seal flash19 from scratch** —
    mineral-bearing components declare their ion bridge in
    `solidPhases.*.dissolutionReaction.masters`, where the runtime looks
    and the importer did not (fixed).  **Vítor's call before any
    generalisation**: is carrying the right default for non-preserving
    units (a splitter must divide the block), should the post-solve pass
    stamp its own origin, and should R1/R3 be named rather than caught by
    the collapse net.  **Those three, plus the seal-drift curation call,
    are written up with cost, risk and a measured recommendation in
    [`docs/design/open-decisions-2026-08-03.md`](docs/design/open-decisions-2026-08-03.md)
    -- four one-line answers close them.**
6. ~~**A6 cyclic steady state (adsorption)**~~ — **BUILT 2026-08-02** on
   Vítor's "faz como achares melhor / Avança!".  `cycle { period; repeat;
   steps ( … ); cssTolerance }` expands to the SAME event stream the
   hand-unrolled recipe produced — proven on all 51 KPIs of batch23's
   golden, which is what let its hand-written list be retired.  The trap
   the design had missed and the build caught: a unit's packed state also
   holds MONOTONE ACCUMULATORS (the bed's M_in/M_out and Q_wall rows),
   which grow every cycle by construction — comparing the whole vector
   would report a perfectly cyclic bed as never settling, so
   `cycleState()` is a virtual each unit overrides to return only what
   repeats (the bed cuts at `inOffset_()`, the layout's own boundary).
   The verdict is tri-state — CONVERGED / NOT-YET with the measured
   change / UNAVAILABLE, with two distinct named reasons for the last
   (fewer than two boundaries, or no declared tolerance) — and the
   engine NEVER invents the tolerance: whether a bed has converged is a
   modelling judgement.  Gate `check_cycle_css` (equivalence + 4
   refusals), sabotage-verified: dropping the k·period offset breaks
   equivalence by 7e-1.  Stop-at-CSS (`repeat untilCSS;`) stays the
   named next step.  Originally designed 2026-08-01,
   [`docs/design/fixed-bed-thermal-a5.md`](docs/design/fixed-bed-thermal-a5.md) §7:
   a `cycle { period; steps (…); repeat N; }` recipe grammar +
   per-cycle state snapshots + a tri-state CSS verdict against a
   tolerance the CASE declares.  It touches the recipe grammar EVERY
   batch case reads, which is why it is yours.  `batch23_tsa_cycles`
   already MEASURES the approach it cannot claim (qbar 0.315 → 0.242 →
   0.175 over three cycles).
7. **P-swing P1/P2 (adsorption)** — designed 2026-08-01, same note §8;
   **the expansion-work WIDENING is BUILT 2026-08-03** (§9's own-slice
   prescription, ratified with second-opinion review: cv accumulation +
   explicit `eps R T dc_tot/dt` source; golden change class
   model-generalization — no physical KPI above 1e-4, four thermal
   goldens re-recorded for machine-noise residuals, batch20 energy
   residual −0.015 % i.e. marginally better).  The pressure-swing
   CAPABILITY stays gated until the three dedicated witnesses pass
   (§9's amended battery: A inert-isothermal inventory ratio; B thermal
   blowdown cooling shown, sabotage = old cp accumulation must fail;
   C constant-P limit).  P1 (outlet-pressure switch) and P2 (feed-valve
   closure) land as their own slices on top.  Countercurrent steps (P3)
   stay refused — that boundary changes KIND.

> **2026-08-25 — EVIDENCE ARRIVED UNDER TWO STANDING QUESTIONS.  Neither is
> ruled; both are now askable with numbers instead of impressions.**
>
> **(a) The two ThermoML datasets are CHECKED.**  Vítor supplied the Voutsas
> 2011 and Kamihama 2012 articles, and every value in
> `fitNRTL02_thermoml_isobars` was read back against them: 45 fit points
> against Table 1 and 21 held-out points against Table 3, digit for digit,
> per-isobar counts included, DOIs confirmed off the articles' own pages.
> Both datasets now declare `reviewStatus checked`; no number moved and the
> golden is unchanged.  Method, counts and the two rules the flip produced
> (`checked` must announce; the unchecked branch needs a built probe once no
> live case exercises it):
> [`held-out-pressure.md`](docs/design/held-out-pressure.md) §5a.
>
> **(b) The CoolProp-provenance question has data under it — and is STILL
> VÍTOR'S.**  `bin/curate/verify_against_poling.py` reads a curator's own copy
> of Poling App. A and compares the catalogue against it.  Of 158 CAS-bearing
> records the appendix lists 75; across them **238 values reproduce it to its
> printed precision**, 105 differ by under 1 %, and 37 by more.  So the
> CoolProp-sourced constants are a faithful transcription of the same lineage
> — which is a fact, not yet a ruling on whether that constitutes provenance.
> **Nothing was changed and no `reviewStatus` was flipped**, deliberately: the
> notable disagreements are mostly ours being NEWER (helium's Tb 4.22 K
> against the book's 4.30, where 4.222 is modern; neon's ω −0.03549 against
> −0.016), so editing toward the appendix would have aged the catalogue.  The
> tool is NOT a gate and must not become one — the book cannot live in this
> repository, so a `check_*` would be permanently green in CI, which is the
> retired `check_true_ions` shape.  Record:
> [`verifying-the-catalogue-against-a-book.md`](docs/design/verifying-the-catalogue-against-a-book.md).

## 4c. Commissioned by Vítor (he ASKED for this; it is not a candidate)

> **PAUSED 2026-09-28, at Vítor's request (his weekly budget).  RESUME HERE.**
> `main` holds everything validated.  Two finished branches wait ONLY on a
> golden re-record that the session's permission classifier refused to the
> assistant; each was rebased onto `main` a157bfabb and revalidated, and
> each is pushed to origin as a backup:
>   1. `claude/det2-flagship-first-law` (D-ET2, the flagship first law):
>      163 rows move in 10 cases, list shown to Vítor 2026-09-27;
>      `bin/runTests --record tutorials/plant/ChemicalPlantTutorial
>      tutorials/steady/drying/solidDryer01_sugar
>      tutorials/steady/drying/sprayDryer01_sugar ... sprayDryer07_design (all
>      seven spray dryers)
>      tutorials/steady/reactors/cstr07_lhhw_methylAcetate`.
>   2. `claude/wanghenke-balance-stop` (§5 A7 item (5), Wang-Henke stops on
>      its balances): 332 rows move in 15 cases, 6 beyond tolerance, list
>      shown to Vítor 2026-09-28; `bin/runTests --record
>      tutorials/steady/optimisation/pareto01_purity_energy
>      tutorials/steady/flowsheets/process05_isomerization_recycle`.
> After the record: commit the goldens on the branch, rebase on `main`,
> rerun the branch's cases, fast-forward `main`.  (No manual `make wasm`:
> `publish-site.yml` builds the WASM and publishes on EVERY push to `main`
> -- corrected 2026-09-28, the belief that it waited on a hand build had
> been carried into three reports that day.)  Then: C16 slice 2 (named in its entry); the named-not-
> fixed items of 2026-09-27/28 in §5.


> **2026-09-24 — THIS SECTION EXISTS BECAUSE A REQUEST WAS LOST.**  Vítor
> asked, the week of 2026-09-15, for an EduTool on the least-squares
> minimisation used in property estimation.  It was not built and it was not
> written down, and when he raised it again nothing in the tree remembered
> it.  His words: *"Devias ter um caderno de gestão das tarefas de
> arquitetura do Choupo!  Estas coisas não se guardam de memória."*
>
> He is right, and the tree already said so twice: §4b and §5 both open by
> recording that findings which lived in a session task list "lived nowhere",
> because a session artefact dies with its container.  The rule was written
> for FINDINGS and for DECISIONS.  It had no home for the third kind — WORK
> VÍTOR COMMISSIONS — so a request was neither a debt (nobody had found a
> defect) nor a decision (nothing was waiting on him), and it fell between
> the two sections that exist.
>
> **THE RULE: a request from Vítor is written HERE in the same turn it is
> made, before the work starts.**  Not after, not when it is finished.  A
> commission differs from §4's roadmap in exactly one way that matters: a
> candidate may be dropped on judgement, and this may not.  Entries leave
> only when the work ships or when Vítor withdraws them.

**C1. An EduTool on least-squares parameter estimation (asked ~2026-09-15;
     asked again 2026-09-24 and a THIRD time 2026-09-25; DONE 2026-09-25,
     registry id `least-squares`, on main in `680faf6d0`).**  The witness
     question this entry left open was settled by measurement and the answer
     was NOT the obvious case: `fitNRTL01` uses the legacy single-dataset form
     (no partition, `verdict notClaimed`) and cannot teach the half the page
     exists for, so the lesson drives `curate02_vle_heldout_ethanol_water`
     (8 fitted, 3 withheld, band with origin, `verdict validated`).  The
     teaching move is measured: at `maxAAD 0.1 %` the held-out AAD is
     0.0737 % and the word is `validated`; at `0.05 %` the AAD is 0.0737 %
     and the word is `notValidated`.  NOT established: no browser rendered
     it (no emscripten here); the page fails loudly rather than substituting.
     What the entry said before it was built, kept for the record -- the
     subject is already in the engine and no lesson cited it: `src/propertyOps/FitParameters.cpp:232` solves
     `(JᵀJ + λ·diag(JᵀJ))·dp = −Jᵀr` by Gauss-Jordan — **Levenberg-Marquardt**,
     with `lambda0` declarable in the op's dict (`FitParameters.cpp:565`).
     Measured 2026-09-24: the registry carries 39 tools and NONE is this.
     The two that touch least squares answer different questions —
     `active-set-qp` is the CONSTRAINED problem (reconciling a laboratory
     water analysis, witness `analysis02_weighted_least_squares`) and `bode`
     fits a sinusoid to a response trace.  Neither shows a student how a
     property parameter set is fitted to measured data.
     What makes it worth building HERE rather than anywhere else: the engine
     already carries the honest apparatus around the optimiser — evidence
     partitioned into fitted and held-out BEFORE the fit, an acceptance band
     declared before the fit, and a verdict published as a word
     (`check_fit_verdict_channel`).  So the lesson is not "here is a
     minimiser" but "here is what a fitted parameter is worth", which is the
     project's own differentiator.  `choupoProps` runs in the browser, so the
     tool can drive the real optimiser rather than a re-implementation.
     NOT DECIDED: which witness case it drives (`fitNRTL01_ethanol_water` is
     the obvious candidate but is the one case flagged
     `UNSUPPORTED_PATHS_IN_BROWSER`, so it cannot run in the app as it
     stands — that has to be settled first, and it is the reason this entry
     names no witness).

**C2. The ammonia converter: a DESIGN module and a COST (asked 2026-09-21,
     "os alunos precisam urgentemente disso"; PARTIALLY DONE).**
     `tutorials/plant/ammonia03_quench_converter` exists and carries a
     `system/postDict` with a `sizing` block, so the ASK was half met.  The
     half that was not is the reactor itself, and the case's own header says
     so: *"3 unit(s) could not be SIZED and are therefore absent from
     `sizings` (and so from costing): bed1 bed2 bed3"*, and *"THERE IS NO
     `costing` AND NO `economics` BLOCK HERE."*  The catalyst beds are the
     equipment he asked to be able to size and price, and they are the three
     that cannot be.  Closing it needs a sizer for a multi-bed quench
     converter and a Guthrie set that covers it — and `Guthrie`'s eight sets
     are all Turton's, which is the same wall the distillation TRAYS hit
     (they refuse by name rather than invent a correlation).  Whether an
     invented set is acceptable here is Vitor's, not the assistant's.
     **DECIDED 2026-09-26 by the commander (Vitor: "a decisao e tua"):
     CLOSE IT ON THE KINETIC CASE, WITHOUT INVENTING A SET.**  The blocker
     above dissolved on 2026-09-26: `ammoniaStaged04_kinetic` runs a `pfr`
     on Dyson-Simon kinetics whose `V_R` is SOLVED by a designSpec, so the
     bed volume is a kinetic result, which is exactly what ammonia03's
     postDict said a bed's size must be.  Slice: a `pfr` sizer that READS
     the unit's own `V_R` (the crystalliser pass-through precedent, basis
     stating whether it was solved or author-set), builds the SHELL with
     `VesselMechanics` at a declared `pressureDesign`, costs the shell on
     the EXISTING `vessel` Guthrie set, and prices the catalyst charge only
     from a DECLARED bulk density and price -- absent, the catalyst line
     refuses by name and the total says INCOMPLETE (the tray precedent).
     No Guthrie set is invented; that question stays Vitor's and is no
     longer on the path.  Dispatched as a general's brief the same turn.
     **DONE 2026-09-26, on branch `claude/c2-converter-sizer`, and ONE
     DEFAULT WAS TAKEN ON THE WAY -- TAKEN ON A STATED DEFAULT, 2026-09-26
     (philosophy 4, DELEGATE-WITH-DEFAULT), and Vitor can reverse it.**  The
     general measured first and stopped: the post-processing chain did NOT
     run on a `designSpec`'s representative pass (the driver stored the
     postDict and never read it; `main.cpp` built the chain only in the
     single-pass branch) while the run header printed `post-processing
     active` -- so a sizer for stage D would have run on nothing.  The
     default: a declared file the run header announces as active must be
     honoured or refused, never silently ignored, so the chain now runs on
     the replay at the design point (`DesignSpec.cpp`, mirroring the
     optimisation driver's replay at its optimum, in the DRIVER so the
     optimisation driver does not run it twice).  Measured blast radius:
     ZERO corpus cases carry both a `designSpec` and a `postDict`, so no
     golden moves.  Same commit: `OuterDriver::postDictPolicy()` (pure
     virtual; the run header's `postDict:` line now states what the LOADED
     driver does with the file -- `gridSweep` says NOT applied), and the
     postDict `dictAudit` runs under an outer driver too.  The slice itself:
     `CatalystBedSize` registered `pfr` (shell as `vessel` on the existing
     Guthrie set + `catalystCharge` at a DECLARED bulk density and unit
     price, `declared-unit-price` -- no index, no F_BM, refused by name and
     INCOMPLETE through the one existing home when either is absent);
     witness `ammoniaStaged04_kinetic/system/postDict` (the two catalyst
     numbers are author-set assumptions, said in those words); gate
     `check_design_sheet` arm (n).  The 41 new `equipment` golden rows were
     APPENDED by the commander on the integrated main (`--record-append`,
     adds only): every one is a row of a NEW witness, no existing row moved,
     and 15 of 15 corpus postDict cases were byte-identical against the
     parent build -- an addition with nothing moved is within the
     commander's authority; a MOVED row still goes to Vitor first.  Record:
     `docs/design/a-catalyst-bed-is-sized-by-its-kinetics.md`.

**C3. Per-EQUATION citation audit of the Theory Guide (asked 2026-09-22;
     NOT DONE at the granularity asked).**  He asked which of the guide's
     equations carry no source, listing and never inventing.  What exists is
     `check_theory_citations`, which is CHAPTER-granular and ratcheting: 43 of
     81 chapters with numbered equations carry a citation, 38 pinned as owing
     one.  Its own blind-spot line states the gap in its own words — *"NOT
     CHECKED: ... the 534 numbered equation environments individually"*.  So
     the campaign he authorised ran one level coarser than he asked.  The
     per-equation list is a READING job, not a code job, and the rule that
     makes it safe is already written: list, never invent a citation, because
     inventing one converts *unsourced* into *falsely sourced*, which no
     reader and no gate can detect.
     **DECIDED 2026-09-26 by the commander: RUN THE READING JOB, in a
     worktree, read-only.**  A general lists every numbered equation of
     the Theory Guide with one of four verdicts -- cited at the equation,
     derived in-text from a cited one, a standard identity (named as such,
     no citation invented), or UNSOURCED -- and writes the list as a
     design record.  Nothing in `docs/*.tex` is edited; the list is the
     deliverable and Vitor decides what each unsourced equation gets.
     **DONE 2026-09-26.**  `bin/curate/theory_equation_inventory.py` (a
     tool, wired nowhere; its chapter keys equal `check_theory_citations`'s)
     enumerates the numbered environments, and
     `docs/design/theory-guide-equation-citations-2026-09-26.md` gives every
     one a verdict, the UNSOURCED list first.  Read the record for the
     counts; the durable finding is that most unsourced rows are a MOVE,
     not a search -- the guide names the author in prose (Ambrose-Walton,
     Rackett, Merkel, Molokanov, Murphree, Lapple, Chisholm, Flory, ...) and
     lacks only the `\cite`/`\bibitem`; a few are forms-with-constants
     attributed to nobody; two bib keys are TRAPS (`Hansen1991` is the
     UNIFAC Hansen, `Wilson` is the 1964 activity model).  No `.tex` was
     edited.  WAITING ON VITOR (4b): source, mark as identity, or delete,
     per row.

**C4. An electrodialysis case for WINE (asked 2026-09-21 as a question;
     NOT DONE).**  He asked whether a typical wine electrodialysis case had
     been made.  Measured: the corpus carries nine ED cases
     (`ed01`-`ed07`, `edbatch01`, `edbatch02`) and NONE is wine.
     `tutorials/plant/tartaricAcid` carries the right chemistry — tartaric
     acid, potassium bitartrate, calcium hydroxide — and uses **no
     electrodialysis at all**.  Tartrate stabilisation by ED is the standard
     industrial application and the two halves already exist separately.
     Recorded as a question he asked, not as a commission he placed; it
     becomes one the day he says so.

**C6-R1. DESIGN REVIEW of the green ammonia plant (2026-09-24, read-only
     survey; every claim below re-verified by the commander against the
     named file).**

     **COVERAGE: 7 of 11 units sized** on `ammonia02_full_plant`
     (compressors x2, exchangers x2, converter, separator, let-down).
     UNSIZED: `T101`, `T201`, `mixer`, `purgeSplit`.
     On `ammonia03_quench_converter`: 6 of 16 sized, 3 refused, 7 never
     declared.

     **THE STRUCTURAL FINDING, and it is worse than any missing sizer.**
     `SizingPass.cpp:70` reads an AUTHOR-DECLARED list in `postDict`'s
     `sizing { units (...) }`, with the equipment type typed by the author.
     There is no dispatch from a unit's TYPE to a sizer, and **a unit absent
     from that list produces no refusal at all** — only a missing sheet.
     Only declared-then-failed units are reported.  So "the plant is sized"
     and "the author remembered to list every unit" are the same sentence,
     which is the silent-absence shape this project refuses everywhere else.
     `EquipmentSize::registerBuiltins()` registers exactly NINE kinds
     (`stirredTank shellTubeHX evaporator crystalliser sprayDryer cyclone
     compressor vessel distillationColumn`): no reactor, no tank, no pump,
     no valve, no fired heater.

     **NO DESIGN TEMPERATURE EXISTS IN THE ENGINE.**  `Material::maxT` is
     parsed (`MaterialRegistry.cpp:58`, declared `Material.H:56`) and has
     **no reader anywhere in `src/`** — verified independently.
     `VesselMechanics.cpp:30` uses a flat `material.sigma_y`, so every wall
     in the corpus is computed at a temperature-INDEPENDENT yield stress.
     Consequence on this plant: the converter's shell is designed at 839.6 K
     using cold-metal strength (`t_wall 0.2305 m`, `weight 229 625 kg`).
     `SS316.dat` also declares `maxP 100` bar against this plant's 220 bar
     design, and `VesselSize.cpp:130-140` WARNS and continues.  For a
     published case study this is the most dangerous number in the plant.

     **TWO HOMES FOR ONE QUANTITY, and it is material.**  The exchanger
     PUBLISHES `area` and `LMTD` as KPIs (`HeatExchanger.cpp:926,930`) and
     `ShellTubeHX::size` reads NEITHER — it costs from a hand-declared
     `LMTD` in the dict.  On `waterCooler`: declared `LMTD 60` against the
     run's own port temperatures giving **64.777 K**; the sheet's area is
     8.0 % high, and 2.9x away from the `area 4000 m2` the same case declares
     in `flowsheetDict`.  Three numbers for one exchanger.

     **THE CATALYST BEDS: both ends are missing, not one.**  There is no
     catalytic-reactor sizer at all, AND `GibbsReactor` publishes no volume,
     no catalyst mass and no rate — an equilibrium reactor has no length
     scale by construction.  So `ammonia02`'s converter volume is a LITERAL
     typed into `postDict`, and it is the plant's largest single cost
     (C_TM 25 085 881 EUR).  Sizing the reactor is NEW PHYSICS, not a sizer.

     **`StorageTank` already computes its own answer and nobody reads it** —
     it publishes `holdupVolume_m3`, `holdupMass_kg`, `vesselVolume_m3`
     (`StorageTank.cpp:265-267`) and no sizer consumes any of them; there is
     no `storageTank` sizer.  T201's ~4830 m3 ammonia tank exists only in a
     prose comment.

     **`VesselSize.cpp:73` computes volumetric flow with the IDEAL GAS LAW**
     (its own comment says so) inside the plant whose entire thermo argument
     is that 200 bar needs SRK — live on the separator at 250 K / 200 bar.

     **THE SHEETS ARE NOT DATASHEETS.**  `DesignSheetWriter.cpp:139-146`
     writes per port exactly `T`, `P`, `F`, `mdot`, `vapourFraction` — no
     composition and no properties, all of which the engine holds.  Absent
     entirely: nozzle schedule, heads/supports/internals (hoop formula only;
     the heads' ~+15 % is explicitly ignored), insulation, TEMA/tube
     geometry, compressor stages/head/driver, demister sizing.

     **THE CONTRADICTION IN `ammonia02/system/postDict` — FIXED 2026-09-25,
     and the review's third site did NOT exist.**  The file said the converter
     and drums are "NOT sized here" and, eleven lines later, that "EVERY unit
     in this loop is now sized": **both false, in opposite directions** (the
     `design/` tree settles that they ARE sized; four other units are not).
     Rewritten, prose only, golden unmoved.  The review also claimed
     `flowsheetDict` strategy point 4 repeated it — **measured false**: the
     word `sized` appears in exactly ONE tracked file of that case, the
     postDict.  A review's finding is a measurement and this one was not
     taken; it is corrected here rather than left to be inherited.

     **AND THE CORPUS ALREADY CARRIED THE RIGHT ANSWER, one case along.**
     `ammonia03_quench_converter`'s postDict declares NO converter volume, has
     no `costing` and no `economics` block, and says why in its own words: *"An
     invented vessel volume converts `unsized` into `falsely sized`; a CAPEX
     that quietly drops the reactor converts `uncosted` into `falsely costed`.
     Neither a reader nor a gate can detect either."*  It then points the
     reader at ammonia02 *"knowing where it came from"*.  So the two postures
     are deliberate and coherent, and what was missing was ammonia02 SAYING
     which one it takes.  It does now: the 80 m3 is named as AACE Class-4
     method — a SPACE VELOCITY applied to this flowsheet's own throughput,
     the first of the three volumes a converter gets in a real project
     (space velocity at feasibility -> integrated rate law with an
     effectiveness factor at FEED -> a licensor's guaranteed charge at
     detailed design; `docs/design/how-a-process-design-is-staged.md` §6).
     Enough to cost a vessel, not enough to build one, and the case says so.

**C6-R2. BALANCES REVIEW (2026-09-24, read-only).  Vitor's instinct about
     the utility water was RIGHT, and it is right about the report he did not
     name.**

     **THE MASS BALANCE IS ALREADY CLEAN** -- confirmed verbatim:
     `massBalance.csv` publishes `TOTAL 9078136.6200` and `PROCESS_TOTAL
     70636.6200` at `process_closure_pct 99.9975`, and the golden pins the
     PROCESS scope.  The cooling water is 99.222 % of the total and is
     already set aside.  The GUI draws that scope.

     **A MOLAR BALANCE DOES NOT EXIST, AND MUST NOT.**  Twelve report kinds
     are registered and none is molar.  Measured from the converged boundary:
     the process goes 8000 -> 4532 kmol/h (56.65 %), because N2 + 3H2 -> 2NH3
     DESTROYS 43 % of the moles -- moles are not conserved and a molar
     "closure" is not a law.  Adding the cooling water drags the same ratio to
     99.3174 %, which LOOKS like a balance and is not one.  That is the
     argument for never publishing it.  The conserved molar quantity is ATOMS.

     **AND THE ATOM BALANCE IS THE ONE THAT IS DILUTED.**  `elementBalance.csv`
     counts the declared circuit: `converged/cw` carries 500 000 kmol/h of
     water = 1 000 000 kmol of atomic H, which is **98.826 % of the H row**
     (the process H is 11 880, cross-checked against makeup H2 x 2).  The
     **O row is 100 % cooling water** -- this process contains no oxygen at
     all, and it closes perfectly because a conserving circuit always will.
     THE CONSEQUENCE, and it is the finding: **a 1 % leak of process hydrogen
     reads 0.0118 pp against `check_element_closure`'s 0.01 pp band -- a
     margin of 1.18x, and below about 0.85 % it is INVISIBLE.**  Undiluted the
     same leak reads 1.0000 pp.  So the gate built on 2026-09-24 is, on this
     plant, roughly a hundred times less sensitive than its band claims.

     **BY DESIGN, NOT A BUG, and the invariant does not forbid the fix.**
     `utilityCircuits::read`/`excludedStreams` appear in exactly three places
     in `src/` -- the mass report, the utility allocation and the flowsheet --
     and ZERO times in `ElementBalanceReport.cpp`, `EnergyBalanceReport.cpp`
     or `BalanceMath.H`.  `UtilityCircuit.H:37-45` states *"ONLY the
     plant-level material SUMMARY gains a second scope"*, written for the
     VALIDATION reading (every law keeps counting every stream).  Vitor's
     objection is the PRESENTATION reading.  The invariant forbids REPLACING
     the total scope, which the mass report does not do either, so it does not
     block a second ATOM scope beside the total one.

     **THE ENERGY BALANCE SOLVED DILUTION A DIFFERENT WAY -- by the
     DENOMINATOR.**  `globalEnergyBoundary.csv` carries
     `residual_denom_kW 65666.0890` on the basis "energy exchanged", so the
     verdict (-1.528221 kW, -0.0023 %) is protected.  But the DISPLAYED
     `H_feeds -39 777 909.9` and `H_products -39 787 541.5` that a student
     reads are about 99.8 % cooling water.

     **THE GUI DRAWS A SCOPED MASS CHART AND AN UNSCOPED ATOM CHART BESIDE
     IT.**  `gui/src/case/elementBalanceSurface.ts` parses the CSV verbatim and
     knows nothing of `utilityCircuit`.

     **EVERY LAW ON THIS PLANT, and the gate verdicts:** mass 99.9975 %
     (in band, not pinned), element all rows 100.0000 % (in band BECAUSE
     diluted, not pinned), energy -0.0023 % (in band, not pinned), charge NOT
     PUBLISHED and correctly so (a `diluteSolution` formulation with no
     `aqueous {}`; it is not in `check_charge_balance`'s 8-case list and
     should not be).  **ammonia02 is in NO `KNOWN_OPEN` list of any gate.**

     **CHECKED BY NOTHING, on this plant:** any process-scope atom number (it
     does not exist); that the `O` row is vacuous; PER-UNIT energy closure
     (`check_energy_closure` names this blind spot and names ammonia02 in it);
     the element balance has **ZERO golden rows**; and the utility allocation
     writes no CSV here, so no per-utility cost figure can be quoted from any
     file.

     NOT DONE: nothing was changed.  A second atom scope is a decision about
     what a report PRESENTS, and it moves what a gate can see -- Vitor's.

**C9. AN EDUTOOL ON THE GIBBS REACTOR, AND ON THE APPROACH TO EQUILIBRIUM
     (commissioned 2026-09-25; DONE the same day, registry id
     `approach-to-equilibrium`, on main in `680faf6d0`).**  Building it found
     the two-key defect and the false citation rule recorded in section 5;
     the schemas were repaired on main in `dd8da3656`.  The three rulings the
     defect needs (which model survives, the sign floor, announce-or-refuse)
     are still Vitor's and still open.  Vitor asked what the temperature approach
     is FOR and whether it may be negative; the answer was explained in
     conversation and his reply was *"E a primeira vez que percebo isso!"*
     He then commissioned an EduTool covering it.  Written down here in the
     turn it was asked, before any work.

     **WHY IT MATTERS MORE THAN ITS SIZE SUGGESTS.**  The architect of this
     project met this concept for the first time today.  A student will meet
     it never, because nothing teaches it: measured 2026-09-25, no flowsheet
     case in the corpus declares an approach of any kind, and the flagship
     green ammonia converter runs at true equilibrium.  The engine reads the
     key, announces it in three sentences that are each worth a paragraph of
     teaching, and no surface anywhere carries that teaching.

     WHAT THE LESSON MUST COVER, in this order:

     1. What a Gibbs reactor IS: minimise G subject to the ELEMENT balances.
        The student declares no reactions and no stoichiometry -- that is the
        whole point and it is also the trap, because a reactor that needs no
        mechanism also cannot be told one it should respect.
     2. Why it sits early in a design, and the correction that matters: the
        driver is DATA AVAILABILITY, not project stage
        (`how-a-process-design-is-staged.md` section 6).  A licensor holding
        its own kinetics may run a kinetic model from the first screening
        flowsheet.
     3. The approach to equilibrium: a real reactor falls short, and early in
        a project nobody has the kinetics to say why, so the equilibrium is
        DETUNED by one calibrated number.  The separation the engine keeps
        is the teaching point -- **the chemistry goes to T+dT, the physical
        state stays at T** (the `[gibbs] temperatureApproach` announcement in `GibbsReactor.cpp`); enthalpy, Psat and
        the energy balance never move.
     4. **THE SIGN, which is what he had never been told.**  As built on
        2026-09-25 the lesson taught both signs as the author's; **ruled
        2026-09-26 (section 5): the author declares a MAGNITUDE and the ENGINE
        assigns the sign** from the thermicity of the overall transformation
        at the physical T, announcing it -- exothermic (ammonia)
        under-predicts at a HIGHER evaluation temperature, so T + dT;
        endothermic (reforming) at a LOWER one, so T - dT; a negative
        declaration is refused.  Positive is conservative only for an
        exothermic reaction, which is exactly why the sign is the engine's.
        The page and its test were rewritten to teach that the same day.
     5. The three caveats the engine prints itself
        (the same announcement's caveat lines) and each is a lesson: it is EMPIRICAL
        (calibrated, never predicted); it is GLOBAL (one number, no
        per-reaction approach); and **at high pressure it absorbs missing
        fugacity corrections** -- which on a 200 bar ammonia converter means
        the parameter can silently become a correction for a poor equation of
        state instead of the closeness-to-equilibrium it claims to be.
     6. What the engine does NOT have, said rather than implied: the
        FRACTIONAL / extent approach, which is a different definition and is
        not interchangeable with the temperature one (research section 3.1;
        absent from both reactors per section 7.3); and the pellet
        effectiveness factor, announced as 1 and judged by nothing.

     FORM, measured 2026-09-25 rather than assumed: an EduTool is a page a
     student SCROLLS, in `gui/src/ui/methods/`, registered in
     `methods/registry.ts` and dispatched in `MethodsWorkspace.tsx`; the
     equations are LaTeX in a lesson module, every symbol glossed in a
     `where` list of {sym, means, unit} -- MEASURED in
     `vanHeerdenLesson.ts:56`, which carries no citation field, so the
     `file:line`-citation rule of CLAUDE.md section 6 binds some OTHER
     surface and must be read off `check_lesson_symbols` itself rather than
     assumed onto this one.  **It is
     NOT an instrument panel** -- a panel shows a reader who already knows
     the method what it does, and teaches a reader who does not exactly
     nothing (`check_edutool_form`, Vitor's ruling 2026-08-28).

     RELATION TO C8: this is the teaching surface for the rung C8's stage C
     builds.  The two are separate deliverables and neither blocks the other,
     but a claim made in one must not contradict the other.

**C10. AN EDUTOOL ON WHAT THE EQUILIBRIUM MODEL WITH AN APPROACH CAN REACH
     (asked 2026-09-27, in Vitor's words: "seria bom pesquisar mais
     possibilidades usando o modelo de equilibrio com delta T de aproximacao
     ... podes fazer um EduTool sobre este tema?").**  Context he gave: the
     C9 tool gave him, for the first time, the insight of the Gibbs reactor
     under an approach temperature; and he saw that biological ammonia
     production can be attacked thermodynamically too.  MEASURED before
     anything was promised: the corpus carries 22 `gibbsReactor` units
     (ammonia loop x6, water-gas shift x6, steam reforming, methane
     combustion, Claus, thermal NOx, H2 flame radicals, adiabatic flame, two
     Brayton-Rankine burners, a proxy gas loop), and NOTHING in the tree
     mentions nitrogenase or biological nitrogen fixation -- that angle is
     new and is his.  Scope, as the commander reads it: not a second tool on
     the Gibbs reactor (C9 is that), but a SURVEY tool over reaction systems
     the same engine already solves -- the equilibrium landscape of each
     (conversion against T and P, the sign the approach takes from the
     system's own thermicity, where the approach matters and where it does
     not) -- with the biological fixation as the lesson's contrast case:
     N2 + 3 H2 -> 2 NH3 is thermodynamically favourable at ambient
     conditions and kinetically forbidden, which is what the enzyme pays for
     with ATP and what Haber-Bosch pays for with temperature, losing
     equilibrium to gain rate; the approach temperature is the empirical
     bridge between the two.  Every number in the tool must come from the
     engine (`gibbsMap` / `gibbsReactor` runs), never typed.  DISPATCHED
     after the C2 integration lands (one general owns the tree at a time).

     **CORRECTED BY VITOR 2026-09-27, while the general was building: NO H2
     ON THE BIOLOGICAL ROUTE.**  Nitrogenase reduces N2 with protons and
     electrons, and the electrons come from the organism's substrate, so
     "N2 + 3 H2 at 298 K" is Haber-Bosch chemistry at ambient conditions --
     a different and weaker lesson -- and the page must not show it as the
     biological reaction.  The thermodynamics the engine can attack is the
     OVERALL reaction with the real electron donor, balanced by electron
     count: heterotrophic `C6H12O6(s) + 4 N2 + 6 H2O(l) -> 6 CO2 + 8 NH3`
     (24 e- per glucose, 6 per N2; expected exergonic, respiration pays) and
     phototrophic `N2 + 3 H2O(l) -> 2 NH3 + 3/2 O2` (expected endergonic,
     light pays).  The approach temperature does NOT transfer to an enzyme;
     what transfers is the equilibrium limit and the extent bookkeeping; a
     bioreactor here is a `batchReactor`/`dynamicCSTR` with declared
     kinetics, never a Gibbs reactor.

     **DONE 2026-09-27, registry id `equilibrium-landscapes`, branch
     `claude/c10-equilibrium-landscapes`.**  What was MEASURED first, and
     what it decided: every reactor's route to a reaction's Gibbs energy
     (`Reaction::equilibrium`, Reaction.cpp:136-149) prices the ideal-gas
     rung and REFUSES glucose's `referenceState pureSolid` by name
     (reproduced on a gibbsMap: "wrong by a heat of sublimation"); no props
     op summed a declared reaction over the phase-aware
     `h_formation`/`s_formation` surface the Component already carried.  So
     ONE small op was built, `reactionGibbs` (src/propertyOps/ReactionGibbs),
     every species on a DECLARED standard state, each datum's rung named,
     the vaporisation crossing for liquid water announced; the three routes
     price on one surface at 298.15 K (sugar route -165.3 kJ/mol as
     written, water route +678.6, industrial -32.8; at 700 K the industrial
     route is +54.3 -- numbers here are the run's, pinned in the witness
     header and the tool's, NOT typed into the lesson).  The sugar route
     at 310 K REFUSES ("Component 'glucose': h_formation liquid leg needs
     liquidHeatCapacity" -- glucose.dat carries no Cp on any rung, its own
     "FLAGGED, NOT FABRICATED"), and the page quotes the refusal instead of
     inventing a heat capacity.  Five `gibbsMap` witnesses under
     tutorials/props/gibbs/ (ammonia, shift, reforming, combustion, thermal
     NO; Claus and the adiabatic flames EXCLUDED -- T is their answer, and
     Claus needs case-local records) carry the survey, read live in the
     browser on C9's data path, no generated JSON.  Goldens NOT recorded
     (none of the six ships an `expected`; the proposed rows are in the
     general's report).  Record:
     docs/design/what-the-approach-model-can-reach.md.

**C11. THE THIRD LEVEL OF TINKERING WITH GIBBS: EQUILIBRIUM RESTRICTED TO A
     DECLARED REACTION SUBSET (asked by Vitor 2026-09-27, while C10 was in
     flight; in his words: beyond declaring the species list, force the
     reaction to occur only through a subset of reactions, so empirical
     information that some reactions are kinetically irrelevant can be
     included).**  RECORDED first, BUILT 2026-09-27 (below); not part of C10.

     **The commander recorded C11 as a missing engine feature before
     measuring; the unit existed -- a claim about the engine is measured
     before it is written, even in a notebook** (Vitor caught it the same
     day).  The reaction-subset level ALREADY EXISTS: `equilibriumReactor`
     (alias `REquil`, src/unitOperations/reactor/EquilibriumReactor.{H,cpp},
     registered in UnitOperation.cpp:154-155) -- stoichiometric, R declared
     reactions from constant/reactions driven to simultaneous equilibrium
     via Kp_j(T) from the Gibbs-of-formation data, witness
     tutorials/steady/reactors/equil01_reforming (`reactions ( smr wgs )`).
     The `gibbsReactor` is the non-stoichiometric level (elements + species
     atom matrix, element-potential minimisation; a listed species is always
     reachable).

     WHAT IS MISSING THERE, measured from its keys
     (EquilibriumReactor.cpp:52-86): NO approach temperature, neither global
     nor per reaction; isothermal ONLY (`operation.T`, defaulting to the feed
     T; no adiabatic mode); ideal-gas Kp only (`Reaction::equilibrium` prices
     `g_pure_ig`).  So C11 is NOT a new restriction feature.  It is (a)
     `temperatureApproach` on `equilibriumReactor`, PER REACTION with the C9
     sign rule applied per reaction from that reaction's own thermicity,
     plus a global form; possibly (b) an adiabatic mode; and (c) the third
     page of the C10 tool using `equilibriumReactor` beside `gibbsReactor`
     on the same system, so the student sees the species-list level and the
     reaction-subset level side by side, with the empirical exclusion (e.g.
     Boudouard left out of the reforming list, said why) as the lesson.  An
     ENGINE change on a frozen engine, Vitor's authorisation by this
     request; AFTER C10 lands, one general at a time.  C10's page names the
     unit and its witness in prose (zero cost) and runs nothing of it.

     **DISPATCHED 2026-09-27, and (c) became its OWN EduTool the same day.**
     Vitor, having looked for it on the live site: *assume equilibrium, but
     now declare which reaction pathways are the only ones possible -- an
     engineer knows that certain reactions are kinetically limited in the
     operating region and can be excluded, which combines experiential
     heuristics with thermodynamics*; "eventually a new EduTool, if you think
     it convenient".  The commander decided it is: a separate tool (working
     id `declared-pathways`, one cross-link from `equilibrium-landscapes`),
     Gibbs over every species beside `equilibriumReactor` over a declared
     subset, the approach temperature as the second knob.  Candidate
     witnesses, each built only if the catalogue carries its species with
     formation data: steam reforming without carbon formation; ammonia
     oxidation (4 NH3 + 5 O2 -> 4 NO + 6 H2O declared, the N2-forming route
     excluded -- full Gibbs goes to N2); methanol synthesis without
     methanation (full Gibbs goes to CH4).  The witness choice was the
     commander's on a stated default; Vitor may reverse it.

     **BUILT 2026-09-27 (general's branch, not yet merged).**  Engine:
     `operation.temperatureApproach` on `equilibriumReactor` as a MAGNITUDE,
     per-reaction override in the reaction's constant/reactions entry (0
     exempts), the sign PER REACTION from the thermicity AS IT RUNS (probe
     solve at T; sign(extent) x dH as written -- the brief said "dH as
     written"; the two differ only on a reaction running BACKWARD, where the
     as-written reading moves the answer past equilibrium, and the witness's
     own shift runs backward), ONE home for the rule
     (`src/unitOperations/reactor/TemperatureApproach.H`) that `GibbsReactor::approachDirection`
     now calls; isothermal, only Kp moves; KPIs `T_Kp_<name>` and
     `temperatureApproach_K` (global magnitude); negative refused by name.
     Absent the key, 29 of 29 gibbs/REquil/gibbsMap cases byte-identical
     against the parent build.  Witness (c) built,
     `equil02_methanol_declared_pathways`: Gibbs makes methane (y_CH4
     0.4513), the complete set reproduces it, the declared list makes
     methanol (conversion 0.610; 0.442 with a 20 K approach).  (a) NOT
     buildable: no solid-carbon record (`C.dat` is atomic carbon gas) and no
     pure-solid phase -- **BUILT the same day by C14 (both slices), witness
     `equil04_reforming_carbon_declared_pathways`, see C14 below.**  (b) NOT buildable: Gibbs solves it, but the declared
     NO route (ln K 121.5 at 1100 K) leaves NH3 below the extent formulation's
     resolution and `equilibriumReactor` stalls.  **(b) BUILT the same day by a
     follow-up general:** the reactor solves on ln n with the invariants of the
     declared set, witness `equil03_ammonia_oxidation_declared_pathways`
     (declared NO route: NH3 1.68e-14; complete set = Gibbs down to NH3
     5.7e-18); the 500 K stall below was the same formulation, now gone.
     Record: docs/design/an-equilibrium-that-runs-to-completion.md.  One
     golden row moves (equil01 `newtonIterations` 10 -> 12), NOT re-recorded:
     it waits for Vitor.  Gate
     `check_reaction_subset_approach` (7 sabotages).  Record:
     docs/design/a-declared-pathway-and-its-approach.md.  NOT done: an
     adiabatic mode, non-ideal Kp, the `equilibriumReactor` duty still on
     `h_pure_ig` (the 2026-09-25 surface family, not enumerated then),
     goldens for equil02 (and now equil03).

**C12. WATER IS A RECORD A STUDENT CAN TRUST OVER THE WHOLE RANGE THE CORPUS
     USES IT IN (asked 2026-09-27; Vitor: "a gap in water's properties is
     unacceptable -- water is very important").**  DISPATCHED the same turn,
     one general in its own worktree.  MEASURED by the commander at
     741b759aa, before dispatch: `vaporPressure` is Antoine with
     `Trange (273 373)` (water.dat:52-57) against Tc 647.14 K, so every
     steam / evaporator / boiler case above 373 K extrapolates;
     `liquidHeatCapacity` is a constant 75.5 J/(mol K) on 273-373 K
     (:66-71); `standardThermochemistry` carries only the ideal-gas datum
     (:45-51), the missing second datum CLAUDE.md 6 names; no
     `liquidThermalConductivity` although 345 component records carry one;
     no gas transport and no `lennardJones`; K_b/K_f "primary re-citation
     pending".  The tree already holds an IAPWS-IF97 kernel
     (src/thermo/iapws/IF97.{H,cpp}).  Order: an inventory record with each
     gap's readers, primary source, licence and MEASURED blast radius; then
     fill what moves no golden; then build the golden-moving fills behind a
     choice or on the branch, with the moved-row list for Vitor.

     **DONE 2026-09-27 for everything that moves no golden** (record
     docs/design/what-water-dat-does-not-say.md, which carries the full
     measured table).  Two premises of this entry were FALSE, measured by the
     general: the liquid datum is not "missing" -- ONE formation datum per
     component is the rule (`check_record_form`), and the 0.57 kJ/mol error is
     the Watson crossing, not a stored value; and the catalogue record reaches
     ONE case (`overlay01_nacl_ksp`) -- the other 270 water cases read a sealed
     or adopted mirror (re-measured by the commander), so a catalogue fix moves
     goldens only on re-import.  BUILT: an IAPWS R15-11-derived liquid thermal
     conductivity (0.14 % RMS on 273-573 K) and an opt-in `Wagner`
     vapour-pressure model reproducing SR1-86 Table 1.  MEASURED, NOT TAKEN:
     flipping water's Psat to IAPWS moves 268 rows in 37 of 102 staged cases
     and stops `column05_reactive_methylacetate` converging.  RESERVED for
     Vitor: that flip, an Hvap(T) grammar (it also settles the two latent
     heats behind the evaporator residual), a T-dependent liquid Cp, Tc
     647.14 -> 647.096, BrockBird -> IAPWS R1-76 surface tension on seven
     cases, promoting the Svehla Lennard-Jones pair, and the second home of
     Vliq in `SolventProperties.H:78`.

**C17. THE TEMPERATURE PAGE TEACHES THE QUANTITY BEFORE THE INSTRUMENT
     (asked 2026-09-28; Vitor brought an external pedagogical review of
     `what-is-temperature` and asked for it to be acted on).**  The review's
     verdict, adopted as his decision: keep the content, reorganise the
     entry, correct the absolute statements, make the depth a later choice.
     DONE the same day on one page (`WhatIsTemperatureTool.tsx`): three
     layers -- A, the quantity without calculus (a cup at 80 C and a tank at
     30 C, the direction of heat, temperature is not internal energy,
     thermal equilibrium stated with its condition and the adiabatic
     counterexample, three checks with answers); B, measurement (measurand
     vs signal, the Pt100 bridge with sensor lag named, 50.012 C on a
     display); C, optional (the entropy definition framed for a simple
     system in equilibrium, K vs T90, the pyrometer with |dT| and the sign
     stated, traceability).  The absolute tone ("violently", "no way
     whatsoever", "owns the number", "no instrument observes temperature")
     is gone and a test keeps it gone.  NOT done, the review's option left
     for later: moving ITS-90 and pyrometry wholly to the thermometry deep
     dive (`thermometer-trust`) -- part C keeps them on this page as the
     optional layer.
     **STANDING INSTRUCTION (Vitor, the same day): in EVERY EduTool reviewed
     from now on, check that the variables are set as mathematics** --
     KaTeX through `Tex` (exported from `lessonStep.tsx`, the lessons' one
     renderer), never plain or monospace letters.  This page now does it
     (`M` for inline, `Tex mode="display"` for the two equations) and its
     test parses every math literal under the lessons' strict settings.
     Also his: "tu e que mandas, nao quero yes man" -- an external review is
     judged, not transcribed; here ITS-90 and pyrometry stayed on the page
     as part C against the review's suggestion to move them.

**C18. THE ENTROPY PAGE TEACHES THE BALANCE BEFORE THE LEDGER (asked
     2026-09-28; Vitor brought an external pedagogical review of
     `what-is-entropy`).**  The review's blocking finding was right and was
     a real error: the opening said a local decrease of entropy "must be
     paid for by generating more elsewhere, usually with work", which
     confuses VARIATION, TRANSFER and GENERATION (a system's entropy falls
     because it LEAVES with heat or matter; generation is never negative;
     work carries none).  Also right: "Machines spend it" (they GENERATE
     entropy and destroy exergy), the reboiler set beside a WORK floor, the
     floor stated without its conditions, s vs S, dS = dQ_rev/T without its
     conditions, the self-check read as a validation.  DONE the same day
     (`WhatIsEntropyTool.tsx`): part A, the balance -- the three terms, two
     blocks of C = 1 kJ/K at 400 and 300 K (-0.1335, +0.1542, generation
     +0.0206 kJ/K, and the reversible limit where transfer happens without
     generation), the balance for a closed system and for a steady unit,
     the definition with its conditions and the irreversible-path trap, the
     third law with a unique ground state and residual entropy as a note,
     four checks with answers; part B, the live ledger (the gap row now
     labelled an internal arithmetic check, not a validation; the floor
     with its conditions; machines generate); part C, how Choupo computes
     it (the five cited lines, `s_formation` named as the ABSOLUTE entropy,
     the seven names).  Every variable is KaTeX, including the ledger notes
     and the interrogation (`$...$` in the data, parsed by the test).
     DECLINED, and why: making the ledger an afterthought -- it is the
     ratified 2026-08-30 spine and answers the question a simulator user
     has, so it stays whole as part B, after the balance rather than
     instead of it.  Found here, not in the review: two hand-carried
     catalogue counts ("517 of 604", "a further twelve"), a derived number
     with a second home; removed, the fact kept, and a test keeps them out.

**C19. THE EXERGY PAGE TEACHES THE IDEA BEFORE THE PROGRAM (asked
     2026-09-28; Vitor forwarded an external review of `what-is-exergy`
     "only for you to reflect -- the responsibility is yours").**  Judged,
     not transcribed.  TAKEN: the opening "same energy, different worth"
     compared two air states that do NOT hold the same energy, so it is now
     the same 100 kJ from reservoirs at 600 K and 350 K against T0 = 300 K
     (50 and 14.3 kJ), derived from the entropy balance and stated as the
     exergy of heat from a constant-temperature reservoir, not a stream's;
     the first control moves the SOURCE with the environment fixed and the
     T0 slider comes second; the entropy leg is SIGNED ("heat that must be
     dumped" is gone) with the compressed ideal gas at T0 as the case where
     it is negative and carries the whole exergy, b = R T0 ln(P/P0); the
     dead-state zero is an algebraic identity, necessary and not a
     validation; "distance" is gone; the engine surfaces and refusals moved
     to a final traceability part (C), kept whole; four checks with
     answers; every variable KaTeX.  Found here, not in the review: the
     knob was titled "what ONE UNIT of dS_gen costs" over a compressor's
     4.2262 J/(mol K).  NOT taken: removing the program's surfaces from the
     page -- they are the glass-box half and stay, at the end.

**C20. THE THERMOMETER DEEP DIVE: FOUR ABSOLUTES CORRECTED, THE
     RE-LAYERING DECLINED (asked 2026-09-28; Vitor forwarded an external
     review of `thermometer-trust`).**  TAKEN, because each was an error in
     the text whoever found it: platinum's melting point "cannot be said to
     a tenth of a degree" contradicted the same page's "the digits may be
     earned" -- not being a defining fixed point is not an uncertainty, so
     the page asks for the source and the budget; "above silver nothing can
     be touched / there is no resistor" confused how the scale is DEFINED
     with which sensors EXIST (Pt-Rh thermocouples work above it); "Z leaves
     1 the moment the pressure is real" (Z can equal 1 at a finite pressure
     by compensation, which is not ideality); T_reading = Z T is stated as
     the IDEALISED thermometer.  Also: Chang's synthesis labelled as his
     reading, the review's common-standard exercise added where it belongs
     (comparability cannot catch an error every instrument shares), math in
     KaTeX, and the same absolute corrected in two comments of
     `WhatIsTemperatureTool.tsx`.
     DECLINED, after a first draft had taken it (Vitor, the same day: an
     external tip is not an order): re-layering the page into instrument
     basics / scale / history, and replacing its opening.  The 2026-08-29
     ruling split this page out precisely to hold the epistemology whole;
     repeatability, calibration and traceability already live on the MAIN
     page (part B, section 8), and a part A here would have been a second
     home for them.  The Sommerfeld epigraph also STAYS: it is marked as an
     unverified attribution, and this page's reader chose to go deeper.
     The lesson for the next review: separate what is an ERROR in our text
     (fix it) from what is the reviewer's TASTE in organisation (judge it
     against the rulings already made -- and the pedagogy is Vitor's).

**C23. EDUTOOL: THE REACTOR LADDER -- stoichiometry, then the
     thermodynamic limit, then kinetics (asked 2026-09-28, Vitor, after
     seeing that industrial practice and the commercial simulator's reactor
     models go in that order while Fogler and MIT 10.37 go the other way).**
     One reaction solved on the three rungs the engine already has --
     `conversionReactor` (stoichiometry), `equilibriumReactor` /
     `gibbsReactor` (the limit, with the temperature approach), `pfr` /
     `cstr` (kinetics) -- showing what each rung adds and what it needs.
     Measured: the water-gas shift already runs on the Gibbs rung
     (`gibbs01`, `gibbs04`) and the kinetic rung (`cstr02`, `pfr02`), in
     separate cases with their own feeds; a single witness running the same
     feed through all rungs does not exist yet.  Scope put to Vitor
     2026-09-28 and taken on his "Podes continuar?".  BUILT the same day:
     witness `tutorials/steady/reactors/ladder01_wgs_three_rungs` (one feed
     split five ways: conversionReactor X = 0.90 DECLARED above the limit,
     equilibriumReactor at dT 0 and 25 K, gibbsReactor over the four
     species, pfr with its axial profile) and the EduTool `reactor-ladder`
     (gui/src/ui/methods/ReactorLadderTool.tsx + reactorLadderLesson.ts,
     KaTeX throughout).  Measured: 600 K limit 0.8414 (= sqrt K/(1+sqrt K)
     by hand), approach 0.8196, Gibbs identical, PFR reaches the limit; at
     550 K the limit is 0.884 and the same bed delivers 0.866 -- the rate
     binds, which is the two-bed shift in one knob.  Stated on the page, not
     fixed: the PFR prices concentrations on a LIQUID molar volume
     (PFR.cpp:804), so its V axis is a shape, not a size; and nothing in the
     engine compares a declared conversion with the equilibrium one (a
     candidate, not commissioned).  DONE.

**C24. EDUTOOL: HEURISTICS FOR SCREENING REACTION PATHWAYS to a given
     product (asked 2026-09-28, Vitor, same conversation).**  The industrial
     funnel: known routes; paper screening by stoichiometric gross margin,
     the equilibrium limit (Delta G at the catalyst's temperature window),
     the heat of reaction, atom economy; then safety / environment / legal
     filters (Butters et al., Chem. Rev. 106 (2006) 3002, SELECT); lab
     screening of selectivity; kinetics last.  The gross margin needs
     PRICES, which the tree does not curate -- the scope must say where
     they come from (declared by the case, never invented).  Scope put to
     Vitor; "Faz a C24" 2026-09-29.  BUILT: witness
     `tutorials/steady/reactors/screen01_methanol_routes` (three routes to
     methanol -- syngas, CO2 hydrogenation, direct oxidation of methane --
     each at its stoichiometric ratio through a conversionReactor at X = 1
     for dH and an equilibriumReactor over its own reaction; route C also
     through a gibbsReactor over every species) and the EduTool
     `route-screening` (RouteScreeningTool.tsx + routeScreeningLesson.ts).
     Measured at 525 K, 50 bar: X_eq A 0.529, B 0.212, C ~1 (K 9.3e19);
     dH per mol methanol -98.4 / -58.7 / -127.4 kJ; route C under Gibbs
     leaves methanol at 1.8e-10 (half the methane burns) -- the route that
     wins on paper fails on selectivity.  PRICES: the tree curates none, so
     the page carries them as student knobs with PLACEHOLDER starting values
     said to be placeholders, and NO price is declared in the case (the
     `EconomicsPass` `rawMaterials` grammar exists for a costed flowsheet;
     a paper screen needs none).  MW and stoichiometry are transcribed in
     the page and held by its test to the catalogue records and the case's
     reactions.  Corrected before commit, by the author: a draft said route
     C's 2:1 CH4/O2 feed is "inside the flammable range"; at 67 % methane
     that is at best unverified (the room-temperature upper limit in O2 is
     near 60 %), so the page asks it as the safety filter's question.
     DONE.

**C22. A 44-TOOL EXTERNAL PEDAGOGICAL REVIEW, TO BE ANALYSED CRITICALLY
     (asked 2026-09-28; Vitor: "nao quero que sejas cao rafeiro -- tu es o
     arquiteto responsavel").**  An archive of 44 per-tool analyses plus a
     synthesis (not committed; it is the reviewer's text).  Method, as the
     architect's: (1) every claim that our TEXT or CODE is wrong is VERIFIED
     against the lesson source and the engine before anything moves --
     confirmed errors are fixed, reviewer errors are recorded as such;
     (2) organisation and progression proposals are weighed against the
     rulings already made, and a uniform restructure of all 44 tools is NOT
     taken on the reviewer's say-so: the review itself admits no student
     was observed, and its own proposal -- test three tools with students
     first -- is the one to follow.  Pedagogy is Vitor's.  01-04 and 11
     were acted on the same day (C17-C21).  VERIFIED the same day, all 39
     remaining analyses: the triage is
     `docs/design/the-44-tool-review-triage.md` -- about seventy confirmed
     text errors (several stating physics backwards), five engine findings
     the reviewer MISSED (a silent R_min clamp, two ActiveSetQP gaps, the
     Wegstein q_max clamp, Herington's |D - J|) plus a glycerol record
     inconsistency, and some fifteen points where the REVIEWER was wrong.
     Next: the text errors page by page, then the engine items one slice
     each, measured first.

**C21. PC-SAFT, DERIVED: THREE FALSE CLAIMS OUT, THE DERIVATION CLOSED
     (asked 2026-09-28; Vitor forwarded an external review of
     `pcsaft-theory`).**  Every claim checked against `PCSAFT.cpp` and the
     flash20 golden before anything moved.  ERRORS fixed: "a gamma-model
     cannot even express a supercritical component" (gamma-phi with a Henry
     standard state does -- Choupo ships Henry pairs); "the UNIFAC fallback
     leaves an ideal mixture" (Psi = 1 makes ONE group pair athermal; the
     combinatorial term and every other pair stay -- the UNIFAC page's own
     heading said the same and is corrected with it); "flash20 loses to NRTL
     by only a few per cent" (its golden: K_ethanol 11.47 vs 3.896, V/F
     0.649 vs 0.512, and the reference is a fitted model, not a
     measurement).  Found here, NOT in the review: the page said the engine
     refuses a scheme that does not match its parameter set -- it refuses an
     unknown scheme and a partial trio only; a mismatched known scheme is
     caught by the mixture witness's golden alone.  GAPS closed (the review
     was right that a derivation stopping before the property is not one):
     reduced A_res/(NkT) and NUMBER density defined; both dispersion
     averages written out with epsilon/kT; the association closure X ->
     a_assoc; a new step 6 from the surface to Z, P and ln phi, with the
     root scan and why two roots are candidate phases, not an equilibrium.
     Every equation KaTeX; four checks (the review's three + the roots).
     The page had NO test; it has one now.  `check_edutool_form` matches the
     KaTeX display as an element (attribute order is the author's).
     DECLINED: re-sequencing (spheres -> chains -> attraction -> sites is
     already the order) and a live P(rho) curve -- no propsDict op scans
     density, so it is a new engine feature, not a page edit; candidate
     below, not faked in TypeScript.
     CANDIDATE (not commissioned): a density-scan op or witness so the
     PC-SAFT page can draw P(rho) at fixed T with the unstable middle
     branch visible.

**C13. "oxygen" FOUND NOTHING IN THE PROPERTY EXPLORER (reported 2026-09-27).**
     The ENGINE resolves it: `O2.dat:53` declares `aliases ( oxygen );`,
     `data/standards/components/ALIASES:26` maps it, and
     `ThermoPackage.cpp:267` canonicalises every case token through
     `Database::canonicalName`, announced `[alias]`.  The GUI did not: its
     catalogue search read name + formula only (`catalogue.ts`
     `searchCatalogue`) and the component tab said aliases were not
     resolved.  Fixed by the commander in the same turn: the aliases are
     read from the record's own line (the home the engine's index is
     generated from), searched, and resolved by `rawRecordFor`.

**C14. SOLID CARBON IS A COMPONENT, AND A REFORMER CAN FORM IT (commissioned
     2026-09-27).**  Vítor, reading the declared-pathways EduTool's closing
     note that carbon formation "cannot be shown here yet": *"Não dá para
     criar o componente de Carbono sólido? É muito importante para não estar
     nos componentes!"*  Measured before dispatch: the only carbon record is
     `components/C.dat`, atomic carbon GAS (dHf 716.7 kJ/mol, NASA-7 via the
     pinned Burcat route, and it carries graphite's element CAS 7440-44-0);
     16 curated `referenceState pureSolid;` records exist (`CaO.dat:37`) and
     `Component.cpp:707` and `ReactionGibbs.cpp:55` read the word, so the
     RECORD grammar exists; `GibbsReactor.cpp` and `EquilibriumReactor.cpp`
     carry no pure condensed phase at all (no `solid` anywhere in either),
     so the PHYSICS does not.  The lesson note is
     `gui/src/ui/methods/declaredPathwaysLesson.ts` `carbon-not-buildable`.
     Two slices, in order: (1) the graphite record from a public-domain or
     open primary, plus a pure-solid phase (activity 1, amount >= 0) in the
     `gibbsReactor`, with a steam-reforming witness that forms carbon at low
     steam-to-carbon and not at high; (2) the same phase in
     `equilibriumReactor`, the declared-pathways witness (Boudouard and
     methane cracking declared or left out), and the lesson note BURIED --
     slice 2 waits for the equilibriumReactor floor general (A-Ostwald)
     because both edit `EquilibriumReactor.cpp`.

     **SLICE 1 CLOSED 2026-09-27.**  (a) `components/graphite.dat`, C(gr),
     CAS 7782-42-5, `referenceState pureSolid;`, dHf_298 = 0 by definition,
     s_298 = 5.734 and a NASA-7 solid Cp 200-1000-5000 K, all from ONE
     primary: NASA TM-4513 (McBride, Gordon & Reno 1993) Table II, public
     domain, read from the PAGE IMAGE because the PDF's OCR layer had five
     of sixteen numbers wrong (the record's header names them and the two
     self-checks -- H(298.15) = 0 and continuity at 1000 K -- that catch
     them).  Aliases `carbon` and `solidCarbon` resolve to it; the exact
     name `C` still reaches the atomic gas.  `reviewStatus interim;` (no
     curator has read it back).  No `volatility{}` block: no vapour-pressure
     source was read, so the engine announces the class as unknown.
     (b) `GibbsMethod::solve`
     (`src/unitOperations/reactor/gibbsMethod/GibbsSolidPhase.cpp`): a
     `pureSolid` species is removed from the fluid problem, tested on the
     solid-free equilibrium by its activity `exp(sum pi_k A_ks - g_s/RT)`
     (at T + dTapproach, the chemistry temperature), deposited only where
     that exceeds 1, then n_s is found by BISECTION on the monotone residual
     (d pi/d b is PSD, so ln a_s falls as n_s rises) with the proven fluid
     Newton inside each trial.  Refused by name: `directMin` (no element
     potentials), an element carried only by solids, two solids
     supersaturated at once.  The reactor announces APPEARS/ABSENT with the
     deciding activity, carries the deposit in the outlet's `s[]`, prices it
     on the solid rung in Q_kW AND in `stateEnthalpy_W` (adiabatic + the
     approach direction), and publishes `n_solid_<s>_mol_s`,
     `activity_<s>`, `F_solid_kmol_h`.  With no pureSolid species the path
     is the old call: all 24 existing gibbsReactor cases and the 7 gibbsMap
     props cases print byte-identical output against a build of aa0ee750c
     (only the banner's commit hash differs).  (c) Witness
     `gibbs11_carbon_deposition`: 1000 K, 1 bar, S/C 0.8 deposits
     0.0690 mol/s of graphite (carbon activity 2.33 in the solid-free gas),
     S/C 3.0 deposits none (a_C 0.081) and reproduces gibbs02 to 1e-10;
     mass, C/H/O and the plant first law close at 0.0000.  (d) Gate
     `check_gibbs_solid_phase`: a REACTION-based recomputation (three K's,
     nested bisections) agrees to 1e-6, element and first-law closure, the
     absent-solid identity with gibbs02, the directMin refusal, and an
     adiabatic probe; 6 by-hand sabotages, all caught (in its docstring).
     NOT done, named: two solids at once; the `gibbsMap` op (calls the
     fluid-only `equilibrium`, so a pureSolid species refuses there on the
     reference rung); real-gas fugacity with a solid is untested.  LEFT
     STALE BY INSTRUCTION: `gui/src/ui/methods/declaredPathwaysLesson.ts`
     `carbon-not-buildable` still says the catalogue has no solid-carbon
     record -- half false since this slice; slice 2 buries it.  FINDING,
     not fixed: `C.dat`'s CAS 7440-44-0 is the registry number of carbon
     THE ELEMENT (PubChem files charcoal and carbon black under it too), not
     of the monatomic gas and not graphite's (7782-42-5); nothing reads it
     as identity today, so it was left, and this entry's own opening
     sentence ("graphite's element CAS") was half right.

     **SLICE 2 PLAN (after A-Ostwald lands).**  `equilibriumReactor` gets
     the same phase through the same seam: a declared reaction whose
     product or reactant is `pureSolid` (Boudouard, methane cracking) takes
     `a = 1` for that species in its `ln Q` (it has no mixing term), the
     solid's amount is an extent-carried unknown bounded below by zero, and
     the phase set is decided by the SAME test (a reaction set that would
     need a negative deposit drops the solid and re-solves, announced).
     The Gibbs route and the declared route must agree when the declared
     list spans the same space -- the declared-pathways witness gains a
     carbon row (Boudouard/cracking declared vs left out), a gate arm holds
     the two reactors to each other on gibbs11's feed, and the lesson's
     `carbon-not-buildable` note is REPLACED by what the witness shows.
     Pedagogical scope of that lesson row is Vítor's before dispatch.

     **SLICE 2 CLOSED 2026-09-27, and with it C14** (record
     docs/design/a-solid-in-a-declared-reaction-set.md).  Built on the ln-n
     solver (43c0238bc), not on extents as the plan above assumed: a solid
     participant leaves ln Q and enters ln K through its pure-solid standard
     potential (`pureSolidPhase::reactionEquilibrium`, which IS
     `Reaction::equilibrium` for a reaction with no solid), and its column
     of nu and of the invariants carries ln a_s while ABSENT and n_s/F while
     PRESENT -- one unknown either way, the Newton square, no floor.  The
     phase set is slice 1's test: solid-free solve, activity read, APPEARS
     above one (re-solve with it present, n_s > 0 checked), two at once
     refused.  A pureSolid component NO declared reaction touches publishes
     its activity from the outlet's element potentials (the observer), and
     is refused by name where the fluid has none (a species present that no
     reaction equilibrates).  ONE HOME for both reactors:
     `src/unitOperations/reactor/PureSolidPhase.{H,cpp}` (the record word,
     the threshold, the rung, the verdict sentence, the KPI names); slice
     1's code was moved onto it and all 33 gibbs/REquil/gibbsMap cases are
     byte-identical against 43c0238bc.  Witness
     `equil04_reforming_carbon_declared_pathways` (NOT gibbs11's feed, as the
     plan said: a new three-reactor case in the equil02/03 shape, CH4/steam
     S/C 1.0, 900 K, 1 bar; golden created, 72 rows): Gibbs and the complete
     set (reforming, shift, cracking) deposit 0.2168 mol graphite / mol CH4
     and agree within 1e-9; the list without Boudouard and cracking forms
     none and publishes a_C 1.580, recomputed by hand by either excluded
     route.  **The brief asked for a complete set of FOUR (reforming, shift,
     Boudouard, cracking); that set is linearly dependent (Boudouard =
     cracking - reforming + shift) and the reactor refuses it, naming
     boudouard** -- the case uses three, and Boudouard in cracking's place
     gives the same outlet.  Gate `check_reaction_subset_approach` arms
     (m)-(t) against slice 1's reaction-route recomputation (7 by-hand
     sabotages, all caught).  EduTool: `carbon-not-buildable` BURIED,
     `carbon-formation` example added (the premise read honestly: the list
     does not say carbon cannot form, it says the catalyst is assumed not to
     form it).  The pedagogical scope of that row was set in the commander's
     brief, not put to Vítor first -- his to revise.  NOT done: two solids
     at once, a solid in the feed (both refused by name), the fluid duty
     still on `h_pure_ig` (the C11 item), `gibbsMap` with a solid.

**C15. AN EDUTOOL FOR THE ELEMENT-POTENTIAL METHOD -- how the Gibbs reactor
     SOLVES, not what it is (commissioned 2026-09-27).**  Vítor asked which
     minimisation the Gibbs reactor uses (answered from the source: three
     methods registered in `GibbsMethod::registerBuiltins`,
     `src/unitOperations/reactor/gibbsMethod/GibbsMethod.cpp`, selected by
     `model` at `GibbsReactor.cpp:206`, default `elementPotential`, the
     Lagrangian RAND / Brinkley-White method of `ElementPotential.H`), then
     whether an EduTool for it would be good, and on the proposed scope:
     *"Avança como achares melhor."*  NOT a second home for `claus-gibbs`,
     which already teaches what a Gibbs reactor is and the collapse to one
     potential per element.  Scope proposed and accepted: (1) the change of
     variables, N amounts -> M+1 unknowns (pi_k, ln N); (2) the Newton,
     iteration by iteration, and why an amount can never go negative;
     (3) what the pi_k MEAN at the answer (g_i/RT = sum_k pi_k A_ki for every
     species present, checkable by hand); (4) a new phase -- the liquid
     (M+2 system when y_i P > Psat_i) and the solid (C14's activity test and
     bisection); (5) where the method fails, from the diagnosis of the
     gibbsReactor's non-convergence below 900 K on equil03's feed (in
     flight).  To measure first: whether the per-iteration pi history
     reaches the result on a structured channel (today it is printed at
     verbosity 3); if not, the engine publishes it and the page draws it --
     the page recomputes nothing.  Dispatch waits for the 900 K diagnosis,
     because step 5 and any engine channel both touch `ElementPotential.cpp`.

     **BUILT 2026-09-27, on the re-seed fix of 1cc31688a.**  The channel
     did not exist: the reactor's Newton hook carried `(iter, |F|, alpha)`
     to the console and to the unit's residual history, and nothing else.
     Now `newtonLog <file>;` (opt-in, `gibbsReactor` operation) writes the
     method's structured log -- a long-form CSV, one number per row, every
     iterate's pi_k, ln N, residuals, |F|, ln n_i and step, the seed route,
     the standard-state terms, the liquid and solid tests and searches
     (`GibbsMethod.H` `GibbsLogRecord`, `GibbsLog.cpp`).  An observer: all
     34 Gibbs-family case roots byte-identical (files and console) against
     a build of 1cc31688a.  Witness `gibbs12_element_potential_newton`
     (new, golden recorded, no existing row moved) + `newtonLog` declared on
     `gibbs07_wgs_cooled` for the liquid.  EduTool `element-potential`
     (numerics shelf), every quoted number recomputed from the logs by
     `gui/tests/elementPotentialLesson.test.ts`.  THREE PREMISES OF THE
     SCOPE ABOVE WERE WRONG, measured: (4)'s liquid is NOT an M+2 system --
     the code bisects the liquid amount around the gas Newton, and
     `ElementPotential.H` said otherwise (corrected); (3) holds for the
     chemical potential mu_i/RT, not g_i/RT (the standard state is only
     part of it); (5) on this feed the primal re-seed ALREADY meets the
     Newton's 1e-8, so the re-seeded Newton takes zero iterations -- the
     primal is the solver there.  FOUND, not fixed: with two condensables
     supersaturated the element-potential method returns the gas-only
     answer and says nothing (`ElementPotential.cpp:71`).  The browser
     gets the new WASM from `publish-site.yml` on the next push to `main`;
     no hand build is needed.

**C16. MORE MIXTURES WITH TRACEABLE BINARY DATA: import what is cleanly
     reusable, FIT the rest to ThermoML (commissioned 2026-09-27).**  Vítor
     pasted a request (drafted with another assistant) and asked for it to be
     done after the pending integrations: widen Choupo's binary-parameter
     coverage from free, open sources while keeping provenance, commercial
     use and redistribution.  Two routes: (1) import parameters already
     published (ChemSep's tables, the `thermo` package's ChemSep NRTL/PR
     tables by CAS), converting only after checking both equations -- units,
     sign, i->j order, T dependence, the NRTL alpha -- and never turning an
     absent value into zero; (2) FIT new parameters to NIST ThermoML
     experimental data with a reproducible chain (download -> identify by
     CAS/InChI, never by name -> select -> fit with the existing regression
     -> verify -> export to native records), Python for preparation only,
     the engine and the shipped cases independent of it and of the network;
     start with ~5 low-pressure binary VLE systems useful to the tutorials;
     NRTL first, UNIQUAC/Wilson where apt (Wilson cannot represent LLE);
     fit/validation split by publication; an honest verdict when there is no
     independent data; every accepted set carrying source, DOI, version,
     reuse terms, equation, conventions, validity, method and errors.
     Deliverable: a working end-to-end path, a few useful pairs integrated,
     graphical comparison with experiment, runnable cases, coverage before
     and after.  Measured before dispatch: the public tree carries 2 NRTL
     pairs (`parameters/NRTL/`: benzene-toluene, ethanol-water) and 3
     UNIQUAC pairs; `bin/choupo-thermoml` (sync/index/search/extract/
     extract-vle, cache in `thirdParty/thermoml/`), `bin/curate/
     chemsep_to_choupo.py` and the `fitParameters` op (`src/propertyOps/
     FitParameters.cpp`, promotable record with a held-out verdict) already
     exist; `check_source_licence` accepts ChemSep's PURE-COMPONENT database
     (Artistic-2.0) and nothing else from it; and
     `docs/design/state-of-the-art-property-study-2026-07-17.md:41` records
     that ChemSep's interaction-parameter tables are DECHEMA-derived -- the
     reason the bulk of the NRTL/UNIQUAC pairs went to `data/local/` in the
     legal scrub.  So route (1) may end as a LOCAL import only (CLAUDE.md §10
     "provenance laundering"), and route (2) is the one that can grow the
     public tree.

     **SLICE 1 CLOSED 2026-09-28** (record
     `docs/design/binary-pairs-from-open-measurements.md`).  ROUTE 1,
     licences READ, not remembered: ChemSep LITE 8.50's own `chemsep.lic`
     grants Artistic-2.0 to "the ChemSep Pure Component Property Databank
     (and ONLY [it])" and forbids sublicensing, and the `.ipd` headers say
     "DECHEMA NRTL at P=1atm" -> the pair tables are LOCAL ONLY.  The `thermo`
     package's `nrtl.ipd` is byte-identical to ChemSep's; MIT on Bell's code
     does not relicense it -> EXCLUDED, and its API returns bij 0 / alpha 0.3
     for a missing pair.  Both are now a CONTRACT in `check_source_licence`
     (`EXCLUDED_TABLES`, run before the accepted-databank arm, which would
     otherwise have accepted "ChemSep NRTL" under the pure-component licence;
     cards `thirdParty/chemsep/`, new `thirdParty/thermo-ipdb/`).  The local
     route itself was BROKEN -- the importer wrote `data/local/binaryPairs/`,
     which no loader reads since Migration 2 -- and is fixed and verified
     (758 pairs staged from the user's own install, audit 758/758, resolved
     `[local]` at run time).  ROUTE 2: ThermoML.v2020-09-30 is the latest
     (record v1.2.6; the API has no publication after 2019); the archive
     carries NO CAS, so `choupo-thermoml identity` bridges CAS -> InChIKey
     through two resolvers that must agree (477 resolved); `vle-index` /
     `vle-search` index 12 993 binary VLE blocks (617 catalogue pairs have
     low-pressure bubble-T data); `extract-vle` joins by InChIKey, keeps
     per-point U, sets pure endpoints aside, refuses duplicated rows.  Five
     systems, each fitted on one article and held out on another, NRTL with
     two parameters (a four-parameter fit on six isobars was measured NOT
     identifiable and predicts worse), weighted by 1/U (new opt-in
     `weighting uncertainty;`), band declared before the fit by one rule:
     methanol-water, isopropanol-water, ethanol-ethylAcetate,
     methanol-methylAcetate VALIDATED and promoted to
     `data/standards/parameters/NRTL/` as `reviewStatus interim` (public NRTL
     pairs 2 -> 6); acetone-methanol NOT validated (the two studies disagree
     by ~0.3 K) and kept in its own case.  Cases `curate04`..`curate08`,
     overlay against both studies beside ideal and UNIFAC, AADs pinned.
     Engine: fit reads the bench's column names, writes the fit span as
     `validity`; `PairAudit` voices a pair's `reviewStatus interim`
     (`[unreviewed] pair`); `choupo-import` traces per-op pair overrides.
     Gate `check_regressed_pairs` (re-runs each record's case; 6 sabotages,
     2 survived the first draft).  FINDINGS for Vítor: `water.dat`'s Antoine
     boils 0.70 K low at 101.32 kPa; on methanol-water UNIFAC beats the
     validated pair on the held-out set; the UNIFAC tables' "Artistic-2.0"
     attribution does not match the LITE licence (values are Hansen 1991, a
     primary -- RESERVED); `Cl`/`HOCl` records write `CL`/`HOCL`.
     **NEXT (slice 2):** read the ten transcribed series back against their
     articles (`checked`); settle acetone-methanol; a `P_bubble` residual so
     isothermal P-x data count; UNIQUAC/Wilson where apt; then widen pair by
     pair by the same rule.
**C8. THE STAGED DESIGN SEQUENCE, as industry actually does it — and an
     EduTool that teaches it on the green ammonia plant (commissioned
     2026-09-24).**  Vítor: build the case as best industrial practice builds
     it, *"se for o caso, cria as várias simulações por sequência de maior
     detalhe"*, and then an EduTool that walks that sequence with green
     ammonia as the case study.  **His explicit instruction on method:
     "perde o tempo que for necessário a esclarecer tudo primeiro, vê até
     online como é feito."**  So this entry is opened BEFORE any research,
     and the research is the first deliverable — not a design, not code.

     WHY IT ARRIVED: the discussion about `gibbsReactor` publishing no volume.
     That is not a defect — an equilibrium reactor has no length scale by
     construction — but the case then types a literal volume into `postDict`
     and costs 25 M EUR from it, which presents a later-stage answer when only
     the early stage was done.  Vítor has never worked in industry and asked
     how the staging is really done rather than accepting an answer from
     memory.

     WHAT THE TREE ALREADY CARRIES, measured before proposing anything:
     `reports/economics/cashFlow.csv` already stamps `AACE_class 4` with an
     `accuracyBand_pct -30,50`, so the corpus ALREADY declares a design stage
     — it simply never says so anywhere a student reads, and nothing connects
     that stamp to which reactor model the case used.  `pinchPass` exists, so
     the heat-integration step of the sequence is present.  `pfr` and
     `catalystLoading` exist, so a kinetic converter is buildable from parts
     that exist; what is missing for ammonia is the RATE EXPRESSION and the
     catalyst data, which is curation and physics, not a sizer.

     RESEARCH DELIVERED 2026-09-24:
     `docs/design/how-a-process-design-is-staged.md` (9 sections, sources
     separated into five tiers by how far each was actually read).  It
     answers the three questions as asked and corrects the framing of two.

     **THE SHAPE IS DECIDED 2026-09-25, on a stated default, and the decision
     rests on three facts MEASURED in the tree rather than recalled.**

     1. The flagship's converter runs at TRUE equilibrium.
        `greenAmmoniaIndustrialN2/LOOP/Converter/system/flowsheetDict` declares
        `mode adiabatic; P 200 bar; T 720 K;` and no approach of any kind, so
        every unit downstream of it is sized against a conversion no real
        converter reaches -- the fiction section 6 of the research names.
     2. `temperatureApproach` is read by `GibbsReactor.cpp:141` and ANNOUNCED
        there in a comment that names the accident it guards against, and it
        is used by ZERO flowsheet cases in the corpus -- only by a README and
        one props op.  **The rung the research calls the missing middle step,
        the one that "matters more than either end", is the one rung nothing
        exercises.**  A capability that exists, announces itself and is used
        by nothing is a capability no gate can see.
     3. `AmmoniaSynthesisRate.{H,cpp}` sits under
        `src/unitOperations/reactor/kinetics/` and WAS included by exactly two
        files: its own `.cpp` and `AmmoniaRateBench.cpp`, a PROPS op -- no
        reactor included it when this was measured.  The kinetic rung could
        not be built without wiring, and the wiring was a decision, not a
        task (see the RESERVED paragraph below, and the paragraph after it
        that records the decision and the wiring).

     **SEPARATE CASES, NOT A STAGED `postDict` CHAIN.**  A stage is a
     different FLOWSHEET, not a different post-processing chain: the reactor
     MODEL changes between stages, and no `postDict` can change a reactor.
     The pedagogical test decides it -- a student must be able to diff two
     stages and see exactly one thing move.

     **FOUR RUNGS, AND THE SEQUENCE STOPS WHERE THE ENGINE STOPS.**  What
     each stage may claim is the load-bearing half, and it is stated as a
     PROHIBITION because that is the checkable direction:

     A. Stoichiometric / yield (`conversionReactor`, registered at
        `UnitOperation.cpp:151`).  Claims a mass balance.  **May NOT claim a
        reactor size, and may NOT carry an equipment-factored cost** -- Class
        5's own methodology is capacity-factored, which `CostingPass` does
        not do.
     B. Gibbs at true equilibrium.  Claims the THERMODYNAMIC CEILING, and
        must say in those words that the conversion is a ceiling no converter
        reaches.  **May NOT hand its outlet to a downstream sizer** without
        that sentence travelling with it.
     C. Gibbs detuned by an approach to equilibrium.  Claims a realistic
        outlet; downstream units may be sized against it; the converter is
        costed from a SPACE VELOCITY whose provenance is DECLARED, not typed
        into a comment.  **This is where the flagship already is, minus the
        approach** -- so stage C is also the flagship's own correction.
     D. Kinetic PFR on Dyson & Simon.  Claims a bed volume the ENGINE
        computed, comparable against C's space-velocity volume.  That
        comparison is the whole pedagogical payoff, and it was the one number
        in the sequence the engine could not produce until 2026-09-26 (built;
        see the D paragraph at the end of this entry).

     The rung beyond D -- packed bed with a pellet effectiveness factor -- is
     NOT built and the sequence SAYS so rather than implying it: `eta` is
     announced as 1 and judged by nothing (CLAUDE.md section 6, 2026-08-18).
     A visible gap beats an invisible falsehood.

     **THE INVARIANT, and it is what a gate can hold: A STAGE MAY NOT COST
     WHAT IT DID NOT SIZE.**  The flagship costs a 28 m3 vessel from a volume
     typed into `postDict` whose provenance lives in a `//` comment -- the
     fifth time this project has found a fact living in a comment that a
     reader must act on.  A declared volume is legitimate at stage C and is
     the WRONG answer at stage A; what makes it legitimate is that the
     declaration says where it came from in a form the engine reads.

     **SPLIT OF WORK, and the reason for the split.**  A, B and C need NO
     engine change and are built first.  D needs the rate law wired into
     `pfr`, which is not a new unit operation but IS new physics reaching a
     reactor, and the engine has been frozen since 2026-09-02.
     **AUTHORISED BY VITOR 2026-09-26 ("2: faz"): the wiring is inside the
     freeze's exception.**  Stage D is `ammoniaStaged04_kinetic`: the same
     loop with the converter as an adiabatic `pfr` on the Dyson & Simon
     (1968) rate law already curated in
     `src/unitOperations/reactor/kinetics/AmmoniaSynthesisRate.{H,cpp}` --
     until today reachable only from the props bench.  The PFR is a RATING
     model, so the bed volume the ENGINE computes comes from a `DesignSpec`
     on `operation.volume` hitting stage C's outlet conversion: that is the
     number to set beside C's space-velocity volume, and the comparison is
     the whole pedagogical payoff.  eta stays 1 and announced (the pellet is
     the rung beyond D, still not built).  Dispatched in an isolated worktree
     because the approach-key retirement owns the main tree.

     **A, B AND C ARE BUILT AND ON MAIN (2026-09-25).**
     `tutorials/plant/ammoniaStaged01_yield` / `02_equilibrium` /
     `03_approach`, one skeleton, one feed, one package; with comments
     stripped the B-to-C flowsheetDict diff is ONE line.  The ladder as
     numbers: converter y(NH3) 0.149843 / 0.310807 / 0.300194; per-pass N2
     conversion 25.0 (declared) / 47.93 / 46.60 %; recycle-to-makeup 2.565 /
     1.026 / 1.078.  Stage C is the first flowsheet case in the corpus to
     declare an approach and the first to use `designRules { spaceVelocity }`.
     Two assumptions are DECLARED as such with their sourced bands: A's 25 %
     per-pass conversion and C's 20 000 Nm3/(m3 h).  Building A exposed the
     `ConversionReactor` duty-surface defect (section 5, now fixed on main);
     building C exposed the two-key defect (section 5) and a BASIS trap that
     is still open: `VesselSize` computes Q on ACTUAL gas volume while every
     published GHSV is on a normal basis -- at 700 K / 200 bar the ratio is
     77, so an industrial GHSV typed straight into `designRules` under-sizes
     the bed 77x at exit 0.  Also measured from the flagship's own golden:
     its comment says 20 000 Nm3/(m3 h) and the number is ~10 200 -- the
     comment overstates by 1.8x, which is the whole argument for the rule
     being engine-visible.

     **D IS BUILT (2026-09-26, in an isolated worktree, under Vitor's
     authorisation of the same day).**  `tutorials/plant/ammoniaStaged04_kinetic`:
     the same loop, the converter an ADIABATIC `pfr` on the Dyson & Simon
     (1968) law, wired into the PFR's multi-reaction path as the third word
     of `kinetics.type` (`Arrhenius | LHHW | dysonSimon1968`, refused by name
     otherwise), with `roles {}` naming which components play N2/H2/NH3 and
     `effectivenessFactor intrinsic | dysonSimonEq39` a declared word with no
     default; `catalystLoading`, `order` and `reversible` REFUSE under it
     because Eq 19 is already per m3 of bed with its own reverse term.  The
     bed volume is a `designSpec` on the PFR's new `approach_K` KPI (the
     effluent's temperature approach to the LAW's own equilibrium, the patent's
     per-bed definition): **6.9898 m3 at a 5 K approach against C's 18.6290 m3
     space-velocity vessel** -- and the second gap is the larger lesson:
     **a single adiabatic bed converts 16.60 % per pass against C's isothermal
     46.60 %**, capped at 16.91 % where its adiabatic line meets the
     equilibrium curve (measured by a 0.5-200 m3 sweep), so the loop
     recirculates 3.9x the makeup and makes 16 % less ammonia through its
     purge.  TWO blocks differ from C, not one: C's `T 700 K` hid the preheat
     inside the Gibbs duty, and a kinetic bed cannot impose a temperature, so
     a `phaseChanger { outletT 700 K; }` stands in front of it -- a fixed-duty
     `heater` there was MEASURED to make the recycle open-loop unstable (both
     solvers ran away to extinction), which is the real reason loops preheat
     through a controlled feed-effluent exchanger.  eta stays 1 and is
     announced as UNPRICED; switched to Eq 40 with an 8 mm particle the same
     target needs 15.04 m3 (xi 0.32-0.49), the rung beyond D, measured in the
     README and not shipped.  FOUND, not fixed (out of the slice's scope,
     `IsothermalFlash.cpp`): the separator's duty re-resolves its 845 K feed
     and ACCEPTS a two-phase root above every component's Tc while the energy
     report discards that same root and says so -- the plant first law is
     open by -22 274.7 kW (5.918 %), all of it on that unit, pinned in
     `check_energy_closure.KNOWN_OPEN` from the engine's own printed line.
     Also found: under an outer driver the postDict chain did not run, so D
     shipped no vessel sheet and no cost, said in its outerDict -- CLOSED
     2026-09-26 under C2 (the chain runs on the designSpec's representative
     pass; D now sizes and costs its bed).

**C7. NO COMPETITOR IS NAMED IN THIS REPOSITORY (ruled 2026-09-24;
     PARTLY DONE, and the hardest part is not the scrub).**  Vítor:
     *"A comparação com [os outros] sou eu depois que a vou fazer no artigo!
     Aqui não se menciona nada, por uma questão de boa educação e evitar
     problemas legais!"*  This TIGHTENS the 2026-07-03 rule, which banned a
     competitor only in the USER-FACING MANUALS and tolerated a
     developer-facing exception.  The exception is closed.

     **DONE:** C6 above was written naming two products and was rewritten the
     same turn; DEV.md now names none in anything authored from here on.

     **THE INVENTORY, measured 2026-09-24, and it has THREE categories that
     must not be treated alike.**

     1. STUDIES OF A COMPETITOR — the sharp exposure, and what he means.
        **REMOVED 2026-09-24**: the two studies of a named product (a
        304-line "developer's manual" and a 130-line solids study), both
        commissioned 2026-08-07 and both entered on 2026-09-14 in
        `0b4cbcac8`, are out of the tree and retrievable from git history;
        the findings they carried were restated as Choupo's own architecture
        facts in the four places that act on them.  Three further design
        records carried comparison prose and were REDACTED in place
        (`where-a-finding-record-lives.md`, `role-vocabulary-forum-
        2026-08-02.md`, `theory-in-class-structure-study.md`), two of them
        containing verbatim quotations of Vítor's own instructions, where the
        elision is MARKED rather than silently reworded.  Record:
        `docs/design/no-competitor-is-named-here.md`.

     2. PROVENANCE AND CURATION FINDINGS — **these must NOT be scrubbed.**
        `data/standards/species/K.dat` records that a named external database
        "appears to carry [the value] sign-flipped"; that is a curation
        finding about a NUMBER and deleting it destroys evidence.
        `bin/curate/chemsep_to_choupo.py` and the electrolyte PROVENANCE.md /
        VALIDATION.md name where values came from, which is a licence and
        citation duty this project states in CLAUDE.md §10.  Removing a
        citation converts *sourced* into *unsourced*, which is the mirror of
        the error the project already refuses to make in the other direction.
        What can change is PHRASING (name the source, never compare).

     3. THE GATE ITSELF.  `bin/curate/check_doctrine.py` must name the banned
        words in order to ban them.  Any repo-wide rule has to exempt it, or
        the gate fails on its own ban list.

     **WHY THEY SURVIVED: the gate never looked there.**  `check_doctrine`'s
     `SCAN_ROOTS` cover the named manuals, `docs/ai/`, the tutorials and the
     site — **not `docs/design/`**.  So the rule was true of every surface it
     scanned and silent about the place the studies live.  A rule not enforced
     is a sentence.

     **EXECUTED 2026-09-24, and the inventory was WRONG ABOUT ITS OWN SIZE.**
     It counted one product's name and never counted the other family, so
     what it called 33 files was 44 files and 93 sites the moment the gate
     could see the whole tree.  *An inventory taken with one grep is a
     measurement of the grep.*  The gate now runs the competitor rule over
     every TRACKED file, keyed on `git ls-files` rather than a hand-kept root
     list (a root list here is a second home for "what is in this
     repository"), and it lands at 40 493 files in 5.6 s.

     **WHAT WAS DONE:** the two studies REMOVED (git history keeps them);
     ~20 files redacted in place with the finding restated and the product
     described by what it is; two verbatim quotations of Vítor's own words
     REDACTED with the elision MARKED, never silently reworded; four narrow
     exemptions where the name IS the evidence (the gate's own ban list, a
     licence statement attributable to whoever made it, one private ignored
     path, the ruling record).  The value-provenance cautions did NOT qualify
     and were rephrased: the name added nothing a curator could act on and
     read as an accusation.  Record:
     `docs/design/no-competitor-is-named-here.md`.

     **WHAT IS PINNED, and it is the scheduled remainder — 65 sites in 22
     files, MEASURED, ratcheting two-sided, class per file:**

       (A) 19 ARCHIVED or SUPERSEDED architecture records, four of whose
           FILENAMES carry the word (the four superseded conceptual-architecture
           records under `docs/architecture/archive/`).  Renaming
           them breaks every cross-link in the tree, and rewriting superseded
           history is not redaction but a forgery of the record of how this
           project decided things.  **NEXT STEP, concrete:** a
           rename-with-redirect migration — measure the inbound links first
           (they reach CLAUDE.md, `decision-records.md` and a dozen design
           records), rename, leave a stub at the old path, rewrite the prose
           inside.  One slice, no engine change.
       (B) `docs/slides/farelo_choupo.tex`, 3 sites: the HISTORY OF THE FIELD
           (the 1976 project at MIT, the 1981 company, the proprietary era).
           That is history, not comparison, and it is **Vítor's own deck** —
           RESERVED for him.
       (C) `chemsep_to_choupo.py`'s `EXCLUDED` list, 2 sites: FUNCTIONAL CODE,
           the source words the importer refuses to import from.  Permanent.

     The live claim is therefore **NO NEW SITE**, which is what the ruling
     binds — it governs what the tree carries from here on.  An unpinned file
     may carry zero; a pinned one that GROWS fails, and one that SHRINKS fails
     asking for its pin back.  **Six sabotages, all caught, and the sixth is
     worth keeping:** disarming the ban list itself makes the gate FAIL rather
     than go green, because every pin then measures zero and the SHRANK arm
     fires.  A one-sided pin ledger would have gone quietly green with its
     claim still printing — the `check_wasm_dialect` S2 shape, closed here by
     construction rather than by vigilance.

     **THE THING A SCRUB DOES NOT FIX, and it must be said plainly.**  Those
     files have been in a PUBLIC repository since 2026-09-14.  Removing them
     from the tree stops future exposure; it does NOT remove them from the
     published git history, where anyone can still read them.  Making history
     match would mean rewriting a pushed public branch — a different act, with
     its own costs (every clone diverges, every existing tag and link is
     affected), and it is Vítor's decision, not the assistant's.  A scrub
     presented as closing the legal question would be false comfort.

     **NOT DONE, and why it was not fired off unattended:** the two studies
     are referenced from FOUR places, two of which are not prose —
     `bin/curate/check_ice_freezing.py` (a gate) and
     `src/thermo/phase/SolidPhase.H` (engine source), plus
     `docs/architecture/decision-records.md` and
     `docs/design/solid-equilibrium-spike.md`.  Removing or renaming them
     edits an engine header and a gate, which needs a full suite behind it,
     and one was running.  The sequence is: rewrite the two studies so they
     record the LESSON without the subject, update the four referrers, widen
     `check_doctrine` with the category-2 allowlist, sabotage it, full suite.

**C6. THE GREEN AMMONIA CASE STUDY (commissioned 2026-09-24; the largest
     thing in this file).**  Vitor: put the generals to review the green
     ammonia process from several angles; Choupo with every tool enabled must
     DESIGN every unit operation, produce the specification sheets a chemical
     engineering project expects, and carry a detailed economic analysis
     (annual profit-and-loss statements, an investment plan).  It must match the
     capability of the established flowsheeting tools his students use.
     Target: a case study for a paper in *Computers & Chemical Engineering*.
     Motive: three student groups work in those tools and he wants to know
     Choupo holds its own.  **THE TOOLS ARE NOT NAMED IN THIS REPOSITORY**,
     ruled 2026-09-24 — the comparison is HIS to publish, and his reasons are
     courtesy and legal exposure.

     **ALREADY DONE, measured before any work was started on it** (the
     CLAUDE.md rule: verify a claimed limitation against the engine before
     repeating it).  He asked for utilities to be separated from the
     calculated streams and for utility water to stop cluttering the global
     mass balance.  That shipped 2026-09-08 and `ammonia02_full_plant`
     already uses it: its `system/flowsheetDict` declares the `CW1`
     cooling-water circuit, and `reports/balances/massBalance.csv` publishes
     `PROCESS_TOTAL 70636.6200 kg/h` with `process_closure_pct 99.9975` --
     the cooling water is already OUT of the process scope, while the TOTAL
     scope keeps every stream for validation.  The three other utilities
     (steamLP, electricity, refrigerationNH3) are ALLOCATED duties and were
     never in that balance.  What may still be open is the MOLAR balance and
     whether the GUI draws both scopes for this plant; that is a measurement,
     not an assumption.

     **RULED BY VITOR, 2026-09-24, SAME DAY: PARITY IS THE GOAL.**  The
     concern below was raised and he reaffirmed the ask, on the ground that the
     capacity to close the gap now exists.  That is his decision and it
     stands; the paragraph after it is KEPT as the record of
     what was argued and answered, not as an open question.  Do NOT
     relitigate it.  Two things the ruling does NOT change, because they are
     separate rules rather than the same argument:
       * **NO COMPETITOR IS NAMED ANYWHERE IN THIS REPOSITORY.**  Tightened
         by Vitor on 2026-09-24 from the 2026-07-03 rule, which banned it in
         the USER-FACING MANUALS only and tolerated a developer-facing
         exception.  A capability survey is therefore a WORKING NOTE OUTSIDE
         the tree; what the tree may carry is the gap in its own terms ("no
         annual P&L artefact exists"), never a named rival.  This does NOT
         reach PROVENANCE: a record that cites where a VALUE or a format came
         from is a licence and citation duty, and removing it would be the
         worse error.
       * The PAPER's framing is a separate decision from the SOFTWARE's
         scope.  Building parity does not oblige the case study to be
         *about* parity, and the journal question stays open until Vitor
         settles it.

     **THE ARGUMENT THAT WAS RAISED AND OVERRULED, kept as the record.**
     Feature parity with an existing tool contradicts this project's own constitution.  `CLAUDE.md` §1:
     *"What it is not: not aiming for breadth or thermo-curation parity ...
     The differentiator is transparency + customisation."*  A level-4 file
     cannot overrule the philosophy, and a feature-parity campaign is the
     opposite of the stated identity.  It also weakens the PAPER: "we
     reimplemented an existing tool" is not a contribution to
     *Computers & Chemical Engineering*, whereas "every number in this plant
     has an address, and the disagreements with the reference have been
     measured unit by unit in advance" is one -- and it is what the acetone
     plant already demonstrates.  The recommendation on record is therefore:
     take the CAPABILITY list (design sheets, P&L, investment plan) which is
     real and largely missing, and DROP parity as the goal.  Vitor's call.

     **KNOWN GAPS against the ask, measured 2026-09-24:** the ammonia quench
     converter's three catalyst beds cannot be sized and are not costed (C2);
     `EconomicsPass` carries 14 undeclared defaults whose announcement is a
     stopped campaign (`docs/design/a-default-nobody-declared.md`); and the
     `design` and `economics` REPORT KINDS still do not run by default, which
     is reserved for Vitor (§4b).

     **CORRECTED THE SAME DAY, and the correction is the useful half: THE
     ANNUAL P&L AND THE INVESTMENT PLAN ALREADY EXIST.**  This entry said
     "there is no annual P&L or investment-plan artefact anywhere in the
     tree".  That was written from ASSUMPTION, not measurement, hours after
     the rule about exactly that was added to this file.  MEASURED:
     `reports/economics/cashFlow.csv` carries, per year, `investment_EUR`,
     `revenue_EUR`, `operatingCost_EUR`, `depreciation_EUR`,
     `taxableIncome_EUR`, `tax_EUR`, `afterTaxProfit_EUR`, `cashFlow_EUR`,
     `discountFactor`, `discountedCF_EUR` and `cumulativeDCF_EUR`, headed
     "Discounted-cash-flow appraisal (Perry / Turton Ch.10)" and stamped
     `AACE_class 4` with an `accuracyBand_pct -30,50`.  On
     `ammonia02_full_plant`: investment 77 495 037 EUR at year 0, revenue
     239 167 295 EUR/yr, operating cost 215 099 839 EUR/yr, depreciation
     7 487 443, tax at 21 %, cumulative DCF crossing zero in year 5.  SEVEN
     corpus cases produce one.

     **SO THE REAL GAP IS NARROWER AND SHARPER.**  What the appraisal is NOT
     is a P&L that VARIES: revenue and operating cost are the same figure
     every year, so there is no ramp-up, no escalation and no working
     capital; and the investment is a single lump at year 0 rather than a
     construction schedule — which is the `constructionPeriod 2;` finding
     already on record in `the-key-nobody-read-in-the-postdict.md`, where
     this same plant publishes an NPV discounted over a one-year
     construction while declaring two.  Those are the things to build, and
     they are a different and much smaller job than building an appraisal.

**C5. What this file CANNOT recover.**  The assistant recovered C2-C4 by
     reading this session's own transcript on disk, which is why they are
     stated with measurements rather than from memory.  That transcript
     covers 2026-09-21 onward only: a session that ended before it is gone
     from the container, so C1 — asked the week of 2026-09-15 — survived
     only because Vítor repeated it.  This entry is NOT a placeholder to fill
     by guessing: an invented commission is worse than a forgotten one,
     because it cannot be told from a real one.

**A REQUEST REPEATED IS A REQUEST THAT WAS DROPPED.**  The evidence is in
this session: Vítor asked on 2026-09-21 whether the Explorer could search his
local NIST mirror, and asked the SAME question again on 2026-09-24.  Nothing
was done between the two and nothing was written down, so the second asking
had to start from nothing.  When he repeats himself, the first asking is the
defect — look for what else went with it.

## 4d. DIAGNOSED AND REVERTED, ready to be redone from this record

> **2026-09-24.**  The change below was written, compiled, RUN, and then
> REVERTED deliberately — not abandoned.  It is correct and it is not
> finished: it makes the engine refuse a real contradiction, and the refusal
> then leaves one corpus case unable to converge, which needs a decision that
> had not been taken.  Leaving it half-applied in the tree would hand the
> next session a tree it cannot explain; deleting it without this entry would
> lose a diagnosis that cost a morning.  So the tree is clean and the finding
> is here, with enough detail to redo it in one sitting.  This entry IS the
> §4c discipline applied to the assistant's own work.

**D1. `resolveStreamThermalState` asks the EQUILIBRIUM, not the SPLIT.**
   `src/unitOperations/flash/StreamEquilibrium.H`.  `twoPhaseSplit` discards
   a converged SINGLE-PHASE answer, correctly for what it is asked; the
   resolver read it anyway and fell back to the CARRIED vapour fraction,
   whose default is zero.  So an unpinned stream that resolves single-phase
   VAPOUR was labelled a liquid by a default — the opposite of R-E2, and the
   shape CLAUDE.md §6 calls hardest to see: not two homes disagreeing, but no
   home at all with a default answering.
   MEASURED, on `column03_azeotrope_mesh`: its 30/70 ethanol/water feed at
   363 K and 1.01325 bar is **single-phase VAPOUR, V/F = 1.0** — not the
   "slightly superheated" liquid the case header claimed, and q = 0 against
   the `feedQuality 1.0` it declared.  The energy report had been announcing
   the contradiction on EVERY run (`g(V=0) = 0.393227 ... cannot hold that
   label`) while nothing refused it.  With the fix the refusal fires by name.
   THE COST, and it is the substantive half: removing the contradicting key
   leaves the column with a vapour feed, and its declared specification
   (16 stages, feed at 8, R = 2.5, D = 25 kmol/h) then **fails to converge** —
   "a stage vapour/liquid flow went non-positive".  So the case's published
   answer depended on the feed being priced as the wrong phase.
   NOT YET DECIDED: whether the case's feed T moves to its true bubble point
   (preserving the author's declared intent of a saturated liquid and the
   column's specification) or the case keeps 363 K and is re-specified for a
   vapour feed.  The first looks right — the author wrote `feedQuality 1.0`
   and designed the column around a liquid — but the bubble point must be
   ASKED OF THE ENGINE, not arithmetic in a head, and that had not been done
   when this entry was written.
   NOT YET MEASURED: the corpus-wide blast radius.  Any case whose stream
   declares no `vaporFraction` and resolves single-phase VAPOUR is currently
   priced as a liquid and will move.  `phasechange01_partial_condenser` is
   named in CLAUDE.md §6 as exactly this shape, fixed once for the evaporator
   alone.  **No golden has been re-recorded**, per Vítor's standing rule that
   the list of what moves is shown to him first.

## 5. Known debts (severity-ish)

**2026-09-27 -- THE GIBBS REACTOR REFUSED A FEED FAR FROM ITS EQUILIBRIUM.
CLOSED, with four things named.**  Reported by the general who built
`equil03_ammonia_oxidation_declared_pathways`, then MEASURED: its feed (10 %
NH3 in air) through the `gibbsReactor` alone refused ("unit 'gibbs' failed to
converge") at EVERY T from 300 to 750 K, at 1, 5 and 50 bar alike, and
converged from 800 K up.  Not the condensing nest (400-750 K condenses
nothing and still failed), not the outer loop (isothermal), not the e^+-50
clamp (nothing bound at the failure), not a tolerance (the Newton stopped at
ITERATION 0).  The cause is the SEED: `gibbsGasSolve` fits the element
potentials by least squares AT THE FEED COMPOSITION, and a feed this far from
its equilibrium hands the seed the whole affinity of the reaction that makes
the products -- water, absent from the feed, seeded at e^17.5 mol/s at
700 K, e^25 at 500 K, e^44.9 at 300 K, against 4.17 at the answer.  Two
species then carry every atom and the (M+1) Jacobian is singular in double
precision: `luFactor` singular at iteration 0.  An exact analytic Jacobian
was tried and moved the boundary only to 700 K (600 K at 50 bar): the defect
is the POINT, not the derivative.  **Fix** (`GibbsMethod.cpp`,
`gibbsPrimalSeed`): when the least-squares route stops, the SAME Newton is
re-seeded from a primal Gibbs iteration on ln n from equal amounts (the
reduced equations of Gordon & McBride, NASA RP-1311, with a step limit that
is load-bearing -- without it the primal diverges at all six gate points),
and it is ANNOUNCED (console + caveat block), the first route's stop filed as
a TRIAL.  The answer is still the Newton's, on the same residual, to the same
1e-8.  A run the least-squares route converges is byte-identical: all 36
`gibbsReactor` / `equilibriumReactor` / `gibbsMap` case roots, output files
and logs, against a build of b0150c9aa; the one log difference is
`landscape01`'s caveat block, whose single `newtonND` stop -- one the map's
answer never used (0 unconverged cells, `map.csv` byte-identical) -- is now
filed under THE SOLVER'S PATH instead of MODEL ASSUMPTIONS.  No golden row moved.  A refusal that no
route can avoid now names BOTH stops on the unit's line.  Gate
`check_reaction_subset_approach` arms (u)-(w), 7 by-hand sabotages.
NAMED, NOT DONE:
  (1) A declared T <= 0 K is not refused: `T -100 K` runs into the solver
      and dies on a non-finite amount.  And the adiabatic outer Newton's
      trials go BELOW 0 K: `nro.lower = 250` binds only the seed because
      `bracket = false` -- gibbs05 given `Q -2.0e5;` walks to T = -100 K.
  (2) An adiabatic outer Newton that does not converge still EXITS 0 when
      the equilibrium at its last trial T converges: gibbs05 given
      `Q 2.0e5;` publishes a state 990 kW off its own energy balance.  It is
      ANNOUNCED now (section A3 below); whether it should REFUSE is RESERVED
      for Vitor -- it would change what a recycle pass that strays there does.
  (3) The residual history the unit publishes (`convergence`) is the FIRST
      route's: at 700 K / 5 bar it is [9.47e7] while the certifying Newton
      converged in 0 iterations from the primal seed.  The count of primal
      iterations is in the announcement, not in the history.
  (4) The primal seed runs only as a SECOND route.  Making it the first
      route everywhere would be simpler and moves every Gibbs trace (not
      measured on the goldens); the least invasive fix was taken.

**2026-09-26 -- A FLASH THAT ACCEPTS A TWO-PHASE ROOT ABOVE EVERY COMPONENT'S
Tc, AND THE REPORT THAT REFUSES THE SAME ROOT.**  Found by stage D of the
staged ammonia sequence, whose adiabatic bed hands the separator an 845 K
effluent -- the first corpus case to put a supercritical stream through
`IsothermalFlash` on the duty path.  The unit's own duty re-resolves that
feed (R-E2, an unpinned state means its own equilibrium), the Rachford-Rice
returns a two-phase root above every component's critical temperature, and
the unit ACCEPTS it and blends a liquid that cannot exist into its duty.  The
energy report resolves the same state, DISCARDS that root and says so in the
caveat block.  Two readers of one state, two answers: the entire plant
residual of `ammoniaStaged04_kinetic`, -22 274.7 kW (5.918 %), sits on that
one unit -- its preheater and converter close at 0.0000 kW, mass at 99.998 %
and every element at 0.0000 %.  Pinned in `check_energy_closure.KNOWN_OPEN`
from the engine's printed line; stage C never reached the seam because its
separator feed was 700 K.  THE SHAPE is the 2026-09-12 family -- THE STATE A
UNIT COMPUTES WITH IS NOT THE STATE ITS STREAMS CARRY -- with the twist that
here the two homes are two READERS of the same resolution disagreeing about
what counts as a phase.  NOT FIXED: the remedy is in `IsothermalFlash.cpp`
(refuse or discard a two-phase root whose T exceeds every Tc, the way the
report does), it moves this case's golden and possibly others, and it was
out of the slice's scope.  Record of the finding: the case's README, section 7.
**TAKEN ON A STATED DEFAULT, 2026-09-26 (section 10's 2026-08-08 rule),
the same afternoon:** the unit adopts the report's own rule -- a resolution
that returns two phases at a temperature above every present component's
critical temperature is not a phase split and is DISCARDED, announced, the
state priced single-phase.  Same family as the two fixes Vitor authorised
today, same one-home remedy, blast radius measured before the golden list is
shown: no re-record without the list.
**DONE, the same day, on that default.**  ONE home:
`flashState::supercriticalSplitDiscarded` (StreamEquilibrium.H) now holds
the two-phase test, the pure-Tc bound (`aboveEveryCriticalT`, unchanged:
present = z > 1e-12, an undeclared Tc does not vote) and the sentence;
`equilibriumAt` calls it where its inline block used to be, and
`IsothermalFlash.cpp`'s duty calls it on the feed re-flash it runs through
`solveCore` -- discard, price the CARRIED state, announce at the site and
once on `AdvisoryLog` under `feed '<stream>' of an isothermalFlash` (the
first build filed 18 copies, one per trial T; the unit's advisory therefore
names the stream and not the temperature, the site line carries T).
Measured on stage D: separator 90.32 -> 100.00 %, plant -22 274.7 kW
(5.918 %) -> +0.0141 kW (0.000 %); remaining: mixer -0.0087 kW, separator
-0.0054 kW.  Gate: `check_inlet_resolution` arm (h), four parts, the arity
part source-checked.  **Golden NOT re-recorded and `KNOWN_OPEN` NOT edited**
(the list is in the general's report for Vitor): what moves is stage D's
separator `Q`/`Q_kW` and its three `refrigerationNH3` utility rows;
`check_energy_closure` asks for the 5.9180 pin back.  ENUMERATED, per the
2026-09-25 rule -- other units that re-resolve an INLET and could accept the
same root: through the one home (already discarding since 2026-09-08) the
report, the model-boundary ledger, `heater`, `heatExchanger`,
`conversionReactor`, the column's feed, the evaporator's chest; through
`solveCore` DIRECTLY and NOT guarded, named not fixed: `phaseChanger`'s
H_in (three sites, `PhaseChanger.cpp` ~188/790/1275), `pipe`'s inlet regime
detection (`Pipe.cpp` ~129), and every OUTLET search (`valve`,
`adiabaticFlash`, `phaseChanger`'s `flashAt(T)`, and `IsothermalFlash`'s
own operating resolution -- a flash OPERATED above every Tc would publish a
liquid product).  `Flowsheet.cpp`'s stream-H re-flash runs only on a
CARRIED vf strictly inside (0, 1), so it cannot reach a vf = 1 stream.  No
corpus case reaches any of those with a supercritical feed today, measured
by the suite (only stage D moved).

**2026-09-25 -- ONE CONCEPT, TWO KEYS, IN ONE FUNCTION, AND THE DOCUMENTED
ONE IS THE SILENT ONE.**  Found while building the C9 EduTool; every line
below was verified twice, by the general that found it and again before it
was written here.  **Nothing was changed: the engine is frozen and the
remedy turns on a question that is Vitor's.**

`GibbsReactor::solve` reads an approach to equilibrium TWICE, 76 lines apart,
under two different names, with two different models, and they ADD.

* `GibbsReactor.cpp:65` reads **`approachTemperature`** through
  `lookupScalarOrDefault`.  It shifts the WHOLE `method->equilibrium(prob,
  T + dT, ...)` argument, so Psat and the fugacity coefficients move with the
  chemistry.  It prints NOTHING and publishes NO KPI.
* `GibbsReactor.cpp:141` reads **`temperatureApproach`** through
  `found`/`lookupScalar`.  It shifts only `g_pure_ig`
  (`ElementPotential.cpp:47-48`), keeping Psat and phi at the physical T --
  the separation the announcement describes.  It is announced at 143-149 and
  publishes `kpis_["temperatureApproach_K"]` at 333.
* **They compose silently.**  Measured on `gibbs01` at 800 K with 25 K
  declared in BOTH keys: `y_CO2 = 0.317590043863`, which is the 850 K value,
  while the banner reports only "T + 25.0000 K".
* Measured on `gibbs10` at 200 bar under SRK, the two models part:
  `approachTemperature 20` gives `y_NH3 = 0.280059287932` (byte-equal to
  running the case at 720 K); `temperatureApproach 20` gives
  `0.281595717361`.

**THE SILENT KEY IS THE ACCIDENT THE LOUD KEY'S COMMENT EXISTS TO PREVENT.**
`GibbsReactor.cpp:139-140` says the announcement is there because of the
*"dT=50 survived in a copied dict for months"* accident.  The key that
survives a copied dict unannounced is sitting 76 lines above it.

**AND THE MACHINE-READABLE CONTRACT IS FALSE IN THREE WAYS AT ONCE.**
`gui/schemas/operations/gibbsReactor.schema.json:75-81` declares
`approachTemperature` and says:

1. *"Solve the equilibrium at (T - this)"* -- **the sign is backwards.**  The
   engine's own comment at `GibbsReactor.cpp:59` says `(T + approachTemperature)`.
2. `"minimum": 0` -- **it forbids the negative approach an ENDOTHERMIC
   reaction requires.**  A reformer under-predicts at a LOWER evaluation
   temperature; the schema makes that undeclarable.
3. *"is ANNOUNCED when non-zero"* -- **false.**  That key announces nothing.

And `temperatureApproach`, the key that IS announced and DOES publish a KPI,
is absent from the schema entirely.  `gibbsMap.schema.json:137-142` carries
the same three errors.

**WHY THIS IS WORSE THAN AN INTERNAL DEFECT: it is what we hand to an
author.**  `docs/ai/schemas-reference.md` is GENERATED from these schemas and
is what `bin/llmctx` ships to an assistant authoring a Choupo case;
`docs/ai/unit-ops.md:301` documents only the silent key.  So an LLM writing a
case for a student is told the wrong sign, told the sign a reformer needs is
disallowed, and pointed at the variant that will never announce itself.

**WHY NO GATE SAW IT.**  `check_schema_coverage`'s domain is the corpus --
the corpus is the arbiter -- and **no case in the corpus declares either
key**, so the gate cannot see that `temperatureApproach` is missing from the
schema.  This is the 2026-08-18 shape again: a guard whose only case
satisfies it is a guard nothing tests.  Here there is not even one case.

**(i) TAKEN ON A STATED DEFAULT, 2026-09-26 (section 10's 2026-08-08 rule;
reversible by Vitor with one word).**  `temperatureApproach` is the model
Choupo means -- an approach to equilibrium is about the REACTION's extent,
not the phase behaviour, and shifting Psat and phi with it changes the flash,
which is not what the word means.  `approachTemperature` is RETIRED the way
`fitBinaryPair` and the heater's `Tout` were: read only to REFUSE by name,
naming the surviving key.  Blast radius measured before deciding: zero corpus
cases declare either key.  What stays reserved is below.
**(ii) AND (iii) RULED BY VITOR, 2026-09-26, in one sentence: "O delta T e
dado sempre positivo e tu e que vais atribuir sinal dependendo da reacao
quimica."**  The case declares the MAGNITUDE, always positive; the ENGINE
assigns the direction from the reaction's thermochemistry -- an exothermic
overall reaction evaluates the equilibrium at T + dT, an endothermic one at
T - dT -- and ANNOUNCES which it chose and why.  Consequences: `minimum: 0`
goes BACK into both Gibbs schemas with the right description (it left them on
2026-09-25 under the reading that the sign was the author's); a negative
declaration is not a sign to be judged but an invalid magnitude, REFUSED by
name; the sign question of (iii) is therefore moot as posed.  The thermicity
is read off the isothermal reaction enthalpy at the physical T, never off the
published `Q_kW` (whose sign carries the feed's sensible heat when feed and
reactor differ in T -- measured 2026-09-25).  Announced, never decided by
the engine: the quench case, where a feed already past the hot equilibrium
approaches from the other side; the parameter is GLOBAL and the engine says
so.  The EduTool `approach-to-equilibrium` and `docs/ai/unit-ops.md` teach
the sign as the ENGINE's act, not the author's.
**EXECUTED 2026-09-26, both (i) and the ruling, in one change.**
`approachTemperature` is read only to REFUSE by name (naming
`temperatureApproach`, the two models and the rule; the `Heater` `Tout`
shape) and the three `method->equilibrium(prob, T + dT, ...)` call sites
pass the physical T.  `temperatureApproach` < 0 REFUSES by name; > 0 is a
magnitude whose direction `GibbsReactor::approachDirection` assigns -- ONE
home, called by the reactor and by `gibbsMap` at every cell -- from the
isothermal enthalpy change between the feed and its TRUE equilibrium at the
physical T (one extra dT = 0 solve, on the package surface via the new
`stateEnthalpy_W`, which the adiabatic Newton now also calls), announced on
the console and on `AdvisoryLog`, the SIGNED value published as
`temperatureApproach_K` (the map publishes the tally
`approachDirection_*Solves` beside it).  Measured: `gibbs01` at 800 K reads
-12385.40 kJ/kmol feed and goes to T + 25; `gibbs02` at 1000 K reads
+52003.08 and goes to T - 25 with no sign in its dict; the Haber map at 25 K
tallies 629/629 exothermic.  `ammoniaStaged03_approach` (+5, exothermic)
and the other five Gibbs goldens PASS unchanged.  **ONE DEVIATION FROM THE
RULING TEXT, stated rather than hidden:** the thermicity is read from the
transformation AS IT RUNS from THIS feed (the only extent a
stoichiometry-free reactor has), so a quench feed already past the
equilibrium at T reads as the reverse transformation and the approach lands
on the feed's side BY CONSTRUCTION -- the engine does detect that case; what
it does not do is JUDGE it, and the announcement says so.  The undetermined
case (no conversion, dH = 0, probe unconverged) takes + and is logged as a
`warning`.  Also corrected: `how-a-process-design-is-staged.md` section 7.3
claimed `equilibriumReactor` reads `operation.approachTemperature` at
`EquilibriumReactor.cpp:65`; that file reads no approach key.  Two schema
descriptions, `docs/ai/unit-ops.md`, `docs/userGuide.tex`, the two plant
READMEs, `ammoniaStaged03`'s dict comment and the EduTool page teach the
magnitude rule; the sentence above saying "zero corpus cases declare either
key" was stale when written (`ammoniaStaged03` declares the surviving one)
and no golden moved.  (iii) is moot as the ruling says.
**RESERVED for Vitor (as it stood before the ruling; kept for the record):**
(i, as it stood) which of the two models is the one Choupo means -- they are different
physics, not two spellings, and the answer decides which key survives;
(ii) whether `minimum: 0` goes, which is the sign question itself;
(iii) whether a wrong-signed approach should be ANNOUNCED.  The general's
recommendation is announce-never-refuse, the `CatalystPellet` posture, and it
found the argument against refusing that nobody here had stated: **"beyond
equilibrium is impossible" holds only for a feed on the REACTANT side of
equilibrium at the physical T.**  Feed an exothermic bed a gas equilibrated
colder and it arrives past the hot equilibrium, the reaction runs backward,
and the wanted sign flips -- which is a fact about the FLOWSHEET (quench
stages, reheat between shift beds), not about the reaction.  A sign test
needs two facts and the engine has easy access to one.

Also measured, and it blocks the cheap version of (iii): the published
`Q_kW` (`GibbsReactor.cpp:323`) is `H_out - H_in`, whose SIGN is the
thermicity only when feed and reactor share a temperature -- the shift
reactor at 1200 K with an 800 K feed reports +2.04 kW and is exothermic.  The
usable input is the isothermal reaction enthalpy, and in ADIABATIC mode the
engine emits no duty at all (`mode == "isothermal"` guard, line 313), so
there a sign check has no input.

**2026-09-25 -- THE GUI-TEST NOTE ABOVE WAS NARROWER THAN THE FAILURE, AND
THE NOTE IS MINE.**  It says *"the four tests fail"* over `hunterNash` and
`ternary.csv`.  Measured: **four test FILES** fail and only ONE of them reads
`ternary.csv`.  `batchStaircase.test.ts` and `flashOperatingLineTool.test.ts`
read `tutorials/props/molecular/flash01_operating_line/txy.csv`;
`pumpSystemLesson.test.ts` reads `sweep_pumpSystem.csv`.  Same root cause
(`.gitignore:116`, `tutorials/**/*.csv`, a declared run output never
committed), same remedy shape two lines below it
(`!tutorials/**/constant/experimental/*.csv`) -- but **three more files than
the note named**.  A note that under-counts a defect is the same failure as a
count taken once and remembered; it was written from one general's report
instead of from a measurement.

**2026-09-25 -- THE THEORY GUIDE AND THE ENGINE DISAGREE ABOUT chi-squared,
BY A FACTOR OF TWO.**  `docs/theoryGuide.tex:9473` boxes
`chi^2 = (1/2) sum r_i^2` as `eq:chi2`; the engine computes
`chi2 = sum residual_i^2` (`FitParameters.cpp:128` states it, `:154` does
it).  The MINIMISER is unaffected -- a constant factor moves no argmin -- but
the NUMBER a student reads off a run is twice the number the guide's equation
predicts, and the guide is where they go to check.  Verified by reading both,
not reported.

**2026-09-25 -- AND `ch:fittable` SENDS A READER TO A RETIRED DRIVER.**  It
says binary parameters are refitted *"by the Levenberg-Marquardt OUTER DRIVER
of Chapter ch:lm"*.  `fitBinaryPair` is retired engine-wide and its factory
throws (CLAUDE.md section 5); the live path is the `fitParameters` props op.
A shipped guide naming a driver that refuses to construct.  Both of these are
C3's territory (the per-equation citation audit) and neither is fixed here.

**2026-09-25 -- A BROWSER-SUPPORT PIN WHOSE STATED REASON IS FALSE IN BOTH
HALVES.**  `gui/src/cases/tutorials.ts:137` carries
`UNSUPPORTED_PATHS_IN_BROWSER`, a one-member set holding
`steady/optimisation/fitNRTL01_ethanol_water`, with the comment: *"its
outerDict fitBinaryPair requires INLINE pairs ... and it ships
constant/experiments/ -- a genuine browser gap."*  Measured: **that case has
no `outerDict` at all** (its `system/` holds `controlDict` and `propsDict`;
`application choupoProps`), and the "subdirectories are not bundled" half is
stale -- the same comment block already says so about a neighbour, the
worker mkdir-p's nested paths into MEMFS
(`gui/public/workers/solverWorker.js:150-175`) and the Vite glob does not
exclude `constant/experiments/`.  **THE PIN WAS NOT REMOVED**, and that is
the right call: the stated REASON was disproved, the CONCLUSION was not, and
this container has no emscripten with which to prove it.  Removing a pin
without proof is the invisible falsehood this project refuses.  Remove it in
the same change as someone who can open the app.

**2026-09-25 -- THE PATTERN BEHIND THE DAY: A CLAIM ABOUT THE ENGINE, MADE
WHERE THE ENGINE CANNOT READ IT, GOES FALSE AND NOTHING CAN TELL.**  Written
after reflecting across the day's findings rather than from any one of them.
Six of them are one shape:

  * `gibbsReactor.schema.json` describes the engine; the engine never reads
    the schema.  False three ways.
  * CLAUDE.md section 6 describes `check_lesson_symbols`; the gate never
    reads CLAUDE.md.  False.
  * `check_theory_citations`'s own docstring repeats that false claim.
  * `how-a-process-design-is-staged.md` section 7.3 describes
    `EquilibriumReactor`; it reads no approach key.  False.
  * `gui/tests/hunterNash.test.ts`'s header says the witness ships its own
    CSV; it does not.  False.
  * the flagship's `postDict` comment carries the provenance of a 28 m3
    volume where no reader can act on it.

This project has many gates over the engine's BEHAVIOUR, several over data
PROVENANCE, several over doctrine WORDS -- and close to nothing over a
DESCRIPTION of the engine.  That is the uncovered class.

**MEASURED, and narrowed three times until the claim survived.**  Two
hypotheses died on the way and both deaths are worth keeping:

  1. *"The schemas are full of ghost keys."*  **FALSE.  Zero.**  Every key
     any operation schema declares appears as a string literal somewhere in
     `src/`.
  2. *"Count the keys the engine reads that the schema omits."*  **318 --
     and the number is worthless**, because the sweep caught every dict read
     in the file (kinetics `A`/`Ea`, stream `T`/`P`/`F`, solver keys) while
     an operation schema describes only the `operation` block.  A count taken
     at the wrong resolution is not evidence, and this project has paid four
     times for a hand-compiled count.

The measurement that survives reads keys off the OPERATION DICTIONARY
specifically (`operDict->lookup*`/`found`/`subDict`) and compares them with
that unit's own schema: **6 undeclared keys across 4 of the operation
schemas**, of which

  * 3 are the legacy `model` fallback, a slot that lives one level ABOVE
    `operation` (CLAUDE.md section 5) -- not a defect;
  * 1 is `cyclone.geometry`, an optional sub-dict CONTAINER, not a value;
  * 1 is `heater.Tout`, read ONLY in order to REFUSE it
    (`Heater.cpp:69-76`) -- the schema is right not to declare it;
  * **1 is `gibbsReactor.temperatureApproach`, the confirmed defect above.**

So a check costing four lines finds, unaided, the defect that cost a general
half an hour by hand -- at 1 signal in 6 raw, and at 1 in 1 with three narrow
exemptions (the `model` slot, a refusal-only key, a sub-dict container).
Whether that is worth a gate is a judgement; the exemptions are the whole
question, because **a gate that accuses the innocent teaches the reader to
ignore it** (2026-09-04).

**THE PRECEDENT IS ALREADY IN THE TREE, AND IT NAMES THE VICTIM.**
`Heater.cpp:83` explains why it refuses a dead key rather than ignoring it:
the stale reading is *"actively harmful to an LLM-assisted author, who reads
'T_out is a spec'"*.  That is EXACTLY the reader the `gibbsReactor` schema
misleads -- `docs/ai/schemas-reference.md` is generated from these schemas
and `bin/llmctx` ships it to precisely that author.  **The project diagnosed
this reader once, built the protection in one unit, and never generalised
it.**

NOT PROPOSED as a task, because the exemption list is a judgement Vitor
owns.  What is offered is the measurement and its uncertainty.

**2026-09-25 -- A CITATION RULE THIS PROJECT BELIEVES IT ENFORCES AND DOES
NOT.**  CLAUDE.md section 6 states that every EduTool lesson symbol carries a
`file:line` citation into the engine, *"verified mechanically (waiver dict
kept EMPTY)"*.  Read in full, `check_lesson_symbols` checks ONE thing: that
every symbol a `formula` or a `derivation[].eq` uses appears in a `where:
[{sym, means, unit}]` list.  It has no citation field and no way to see one.
The waiver dict is real and is empty; **the citation half is enforced
nowhere.**  The origin is
`docs/design/what-a-citation-requirement-found.md` section 1: the citation
was an AUTHORING constraint on the eleven drafting agents, verified by the
parent at authoring time, once, in the past tense.  CLAUDE.md welded a
one-off protocol to a gate that enforces a different rule, and
`check_theory_citations`'s own docstring repeats the same sentence -- a
second home for a false claim.  **This is exactly the corrupted-memory
failure section 10 warns about, found in the paragraph that warns about it.**
NOT fixed here: correcting CLAUDE.md is a one-line act and is held only until
the tree is free of the general currently working in it.

**2026-09-25 -- A GUI TEST THAT PASSES ONLY ON A MACHINE THAT HAS RUN THE
CORPUS.**  `gui/tests/hunterNash.test.ts` reads
`tutorials/props/scan/ternary03_lle_water_ethanol_benzene/ternary.csv`, a
declared run output matched by `.gitignore:116` (`tutorials/**/*.csv`) and
never committed on any branch.  The main tree has it because the case was run
there; a fresh clone or worktree does not, and the four tests fail.  **The
test's own header asserts the opposite** -- *"the witness ships its own
`ternary.csv`"*.  So the suite is green here and red for a new contributor,
which is the class of defect a green suite cannot report.  The remedy shape
already exists two lines below in the same ignore rule
(`!tutorials/**/constant/experimental/*.csv`).

**2026-09-27 -- CLOSED, and NOT by that remedy.**  The four files are still
run outputs and are still never committed: a committed run output is a second
golden with no tolerance that every run of its case rewrites, and the GUI
bundle's eager glob inlines every tutorial file present at build time.  What
changed is who produces them.  The vitest globalSetup
(`gui/tests/witnessSetup.ts`) RUNS the four witnesses with this tree's native
binaries before any test loads, after asking `check_build_fresh` whether the
build is a build of this tree; a test reads a run output only through
`witnessOutput()`, which refuses a path not declared in the one list
(`gui/tests/witnessOutputs.ts`) and throws `WITNESS OUTPUT REFUSED`, with
`make all` as the remedy, when the setup could not generate it.  It never
skips.  `bin/runTests` reports a run whose every failure is such a refusal as
REFUSED rather than FAIL, still counted against the tally.  (`--gui` already
aborted without a fresh build -- `check_build_fresh` is gate zero on every
path -- so the four failures were only ever seen in a worktree that HAD a
build and had not run the four cases.)  The same fix reached
`check_doc_references`, which went red in every fresh worktree on this
section's two mentions of `txy.csv` and `ternary.csv`: a path git ignores
whose producing case exists is now accepted as a RUN OUTPUT (a rule, like the
private tier, not two allow-list entries -- the mentions stay, because a
record of a defect must name what it was about), and the gate's stale-entry
arm no longer fires on an entry git ignores -- it had been red in every
checkout that ran `make wasm-gui`, over `gui/public/wasm/`, the same
machine-dependent verdict one directory over.


**2026-09-07 — THE OPEN QUEUE, written down.**  Thirty-one actionable
findings from the September audit campaign, every one of them MEASURED
against the tree and none of them fixed.  They lived in a session task list
until today, which is to say they lived nowhere: a session artefact dies with
its container, and `CLAUDE.md` §10's rule that this tree is the next
session's memory applies to WORK as much as to facts.  Eight further items
are decisions and sit in §4b, not here.

**D-ET2. `energy-T2:plant` HAS BEEN RED SINCE 2026-09-08, AND CLAUDE.md SAYS
     SO (measured 2026-09-24: 3.1709 %).**  `bin/runTests` runs the T2 rule
     over `tutorials/plant/ChemicalPlantTutorial` and requires the global
     boundary |in-out|/in below 1 %; it reads 3.1709 % today.  That is not a
     new defect and not a physics regression -- CLAUDE.md 6 records it in its
     own words, as one of three defects the 2026-09-08 energy-closure fix
     introduced: *"a basis changed without finding who reads it (moving the
     denominator took the flagship from 0.163 % to 3.17 % on an unchanged
     residual and turned `energy-T2:plant` red unnoticed)"*.

     THE RESIDUAL DID NOT MOVE.  The DENOMINATOR did.  So the engine's
     arithmetic is not under suspicion here; what is under suspicion is that
     one gate's threshold was calibrated against one basis and the basis was
     replaced underneath it.

     WHY IT MATTERS MORE THAN ITS SIZE.  CLAUDE.md 10 states that an absence
     which is NAMED AND NOT SCHEDULED is an absence, and 6 states that when
     you fix a thing this file calls broken you fix the sentence in the same
     commit.  This is the mirror case and nobody had a rule for it: a thing
     the file calls BROKEN, correctly, that then stays broken for sixteen days
     while every suite run reports it and every reader steps over it.  A red
     that is expected stops being read, which is how `check_true_ions` went
     permanently green in the other direction.

     WHAT MUST BE DECIDED BEFORE IT IS TOUCHED, and it is not obvious which
     way it goes:
       * if the NEW denominator is the right basis, the 1 % threshold is
         calibrated against the OLD one and must be re-derived -- from what
         the basis now measures, never from what makes the flagship pass;
       * if the OLD denominator was right, the 2026-09-08 change moved a basis
         nobody had found the readers of, and the readers are the thing to fix;
       * either way the gate must not be widened to admit today's number.
     Re-deriving a threshold so that the current answer clears it is the exact
     shape this project refuses everywhere else.

     **DIAGNOSED 2026-09-25, AND THE BASIS QUESTION IS ANSWERED: THE NEW ONE
     IS RIGHT AND THE RED IS TRUE.**  Measured on the failing run:

       plant boundary residual        +34.412646 kW
       sum of per-unit `remaining_kW` -34.4127 kW

     They are the same number.  **The boundary gap is the per-unit gaps
     added up**, so it is real, localised and additive -- not a
     normalisation artefact.  The four contributors:

       DRYING.SD               -70.85 kW   (the spray dryer, the largest)
       FERMENTATION.Fermentor  +37.00 kW   (partly cancels it)
       CONCENTRATION.Evap1     -10.42 kW
       DRYING.BD               +10.24 kW

     WHY THE DENOMINATOR CHANGE WAS THE FIX WORKING, NOT A DEFECT.  The old
     basis divided 34.41 kW by ~21 132 kW of enthalpy THROUGHPUT and got
     0.163 %; the new one divides by 1 085 kW of energy EXCHANGED and gets
     3.17 %.  Most of that throughput is the formation datum passing through
     the plant, not energy the plant does anything with -- so normalising by
     it hides the error exactly as the cooling water hid the atom balance
     (the same defect, closed for mass and atoms on 2026-09-25).  It is also
     `solver/Convergence.H`'s own rule: normalise by THE TERMS THE EQUATION
     BALANCES.  So CLAUDE.md 6, which files this among "three defects
     introduced the same day by the fix itself", **reverses cause and
     effect** -- and that sentence must be corrected there, not here.

     WHAT IS ACTUALLY OPEN, then, is the SPRAY DRYER: the report shows it
     with an EMPTY `energy_closure_pct`, which is the shape of a unit that
     declares no energy item at all, so its whole enthalpy change is
     unattributed.  NOT YET CONFIRMED -- read `EnergyBalanceReport`'s writer
     before asserting it, because `energy_items_kW` reads equal to `dH_kW` on
     that row while `raw_imbalance_kW` equals `dH_kW` too, which the
     crystalliser row (items == dH, raw == 0) says should not happen
     together.  Settle that inconsistency first: it is either the reporting
     of a unit with no declared item, or a defect in the report itself.

     NOT the remedy, whichever it turns out to be: widening the 1 % gate to
     admit 3.17 %.  Re-deriving a threshold so today's answer clears it is
     the shape this project refuses everywhere else.  NOT reserved: that the suite
     currently carries a red nobody is acting on, which is recorded here so
     the next session inherits it as a task rather than as scenery.


Each line states the DEFECT, not the feature.  Where a general owns the area
(§5b), the name is given.  Ordered by damage to a student, not by area.

*Wrong answers or wrong prices, at exit 0:*

 A1. **The active salt is chosen by the ORDER of `components ( … )`.**
     `ThermoPackageBuilder` resolves its disambiguator through
     `data/standards/chemistry/salts/<name>.dat` — a path that DOES NOT
     EXIST (`chemistry/` has been flat since 2026-07-01), so
     `activeSaltFormula` is always empty and the first component carrying
     `dissociatesTo` wins.  Diagnosed to the line 2026-09-07.  MEASURED the
     same day: only 7 catalogue components declare `dissociatesTo` (CaCl2,
     KCl, LiCl, NaCl, NaOH, calciumTartrate, dolomite) and only THREE corpus
     cases name two or more of them -- so the ambiguity is narrow, but the
     one that matters is the flagship: `lithiumBrinePlant/sectors/BRINE`
     declares `components ( water NaCl LiCl )` under a Pitzer electrolyte
     package, so the engine takes NaCl as the active salt in the sector whose
     whole subject is lithium.  The other two are `flash15` (a refusal case)
     and `membrane10_dspmde_divalent` (declares `gammaPhi`, not the
     electrolyte formulation).  AND THE ENGINE NEVER SAYS WHICH IT PICKED --
     `saltName` reaches the console only inside a solid-phase line and an ion
     Cp line, never as the decision itself.  So the fix has two halves and the
     second is the durable one: resolve the disambiguator against a path that
     exists, and ANNOUNCE the choice.  [THERMO]
     **CLOSED 2026-09-27, and the flagship half of this entry measured
     FALSE.**  The BRINE sector's subject is HALITE (`crystNaCl`, outlets
     `halite`/`liquor`, `solidPhases ( halite )`): NaCl is its correct
     active salt.  And it was not chosen by order there -- the sealed plant
     still ships the retired snapshot `constant/chemistry/salts/halite.dat`,
     which the resolver found case-locally; nor is the sector's own list the
     one that reaches the builder (`thermoFor` substitutes the plant's
     global list).  The defect was live for every case WITHOUT the
     snapshot: `components ( water LiCl NaCl )` against `( water NaCl LiCl )`
     gave gamma_pm(1 m) 0.7897 against 0.6572, both at exit 0.  The active
     salt is now the only candidate, else the one whose own `solidPhases {}`
     OWNS the declared chemistryDict phase, else a `[legacy]` snapshot's
     formula (announced; refused if it disagrees), else a REFUSAL naming
     every candidate and the key -- and every choice is announced
     (`[electrolyte] active salt: ...`).  42 electrolyte case roots
     byte-identical against the parent build; no golden moved.  Gate:
     `check_v2_refusals` (active-salt arm).  Record:
     [`docs/design/the-salt-chosen-by-its-position.md`](docs/design/the-salt-chosen-by-its-position.md).
     NOT done, named there: a sector's `components ( ... )` line is
     discarded in favour of the global list (a declaration nobody reads),
     and no key can make a salt that owns no phase the active one.
 A2. **The spray dryer invents a particle density of 1500 kg/m3** where the
     crystalliser REFUSES by name on the identical absence.  Two answers to
     one question, and the silent one prices a sizing.  [UNITS]
 A3. **Solver aids with no announcement path at all** — a 1e30 penalty inside
     a Newton residual, silent clamps, a swallowed block-Thomas failure, and
     a backtracking factor two printers drop.  Each is the 2026-05-30
     no-silent-crutch rule broken in a different place.  [UNITS]
     **ANNOUNCED 2026-09-27; no published number moved.**  Each site, what
     happens there now:
     - `GibbsReactor.cpp` adiabatic outer Newton on T: every trial T at which
       the inner equilibrium did not converge is COUNTED, and after the solve
       the run says how many and over which T range the residual was the
       1e30 penalty (console + `AdvisoryLog`, `solver`/warning).  The penalty
       VALUE is unchanged -- replacing it moves any answer that ever touched
       it.  No corpus case reaches it today; `gibbs05_adiabatic_flame` with
       its T seed set to 100 K did, and fired FOUR of this entry's
       announcements in one run (90 penalised trials in [249.5, 250.5] K, the
       seed clamp, a singular dense `newtonND` Jacobian, the RAND e^50 cap)
       before refusing.  **No longer (2026-09-27):** the inner equilibrium at
       250 K was the least-squares-seed failure closed at the top of this
       section, and with the primal re-seed that probe now CONVERGES, to
       1491.58 K -- gibbs05's own golden T.  The probe that still reaches the
       penalty is gibbs05 with `Q -2.0e5;` (66 penalised trials, all at
       T in [-100.5, -99.5] K -- see the negative-T item there).  The seed clamp into
       [250, 5000] K and the 200 K step cap are announced at verbosity >= 2
       from the new `NRResult` counters (below).
     - `DirectMin.cpp` Nelder-Mead objective: the 1e30 wall is counted and
       announced once (`solver`/info) -- a barrier in a derivative-free
       minimiser corrupts no derivative, but it acts on the search.  Fires on
       `gibbs09_wgs_cooled_directmin` (143 evaluations).
     - `NewtonND.cpp` early exits -- a block-Thomas solve that threw, a
       singular DENSE Jacobian (the same shape, one branch over, also
       swallowed), and a line search with no evaluable step -- now carry the
       cause in `NDResult::stopReason` (the exception's own text included)
       and raise it on `AdvisoryLog` (`solver`/warning, locus `newtonND`),
       with a console line when the entry is new.  The advisory omits the
       iteration and |F| so one cause raised on every trial of a search is
       one entry.  No corpus case reaches any of the three today; all three
       fired by a probe program linked against the engine.  The maxIter exit
       also stopped dropping `offBandMax`/`jacobianEvals`.
     - The backtracking factor: `DesignSpec.cpp`'s iteration printer and
       `Flowsheet.cpp`'s recycle-Newton printer both dropped `NDTrace::alpha`
       (`GibbsMethod.cpp` already forwarded it).  Both print it now, and
       `designspec_history.csv` gains a trailing `alpha` column.
     - Clamps, enumerated in `solver/` and `reactor/` (CSTR/ConversionReactor
       excluded -- another branch owns them).  COUNTED now, announced by the
       one caller that owns a console (GibbsReactor): `newton1D`'s seed clamp,
       `maxStep` cap and bracket-midpoint fallback (`NRResult::seedClamped`,
       `stepsLimited`, `bisections`; ~30 callers, most inside other solves,
       so newton1D itself announces nothing).  ANNOUNCED when it binds at the
       answer: `GibbsMethod.cpp`'s `clampArg` UPPER cap (e^50) on the RAND
       residual.  LISTED, not announced: the LOWER cap (e^-50 ~ 2e-22 per
       trace species, under the 1e-8 element tolerance); `Wegstein.cpp` q
       clamp to [qMin, qMax] (`qLast_` exists for logging, nothing prints
       it); `DirectMin.cpp` `max(nt,0)` / f in [0,1] (inside the simplex box);
       `PFR.cpp` `max(y,0)` in the RK stage derivatives (the COMMITTED step
       uses fraction-to-boundary, not a clamp); `EquilibriumReactor.cpp:480`
       sub-round-off snap; the log/division floors in `StabilityTest`,
       `ODE/Jacobian`, `Rosenbrock23`, `ReactiveFlash`, `GibbsMethod` (guards,
       not aids).
     Validation: result JSON, `converged/` and `design/` byte-identical
     against a build of 189b5da73 on 115 case roots (every root running
     `heatExchanger`, `gibbsReactor`, `batchStill`, a `distillationColumn`,
     `cstr`, a declared tear, a `designSpec` or any outerDict, fractal unit
     folders included), the only console differences being the new `alpha`
     column, the directMin wall line, and ctrl16/ctrl20's single block.
     By-hand sabotages, each restored with `cp` and rebuilt: the penalty
     counter, the `newtonND` advisory and the directMin counter removed each
     silenced its witness (gibbs05@100 K, a probe program, gibbs09).
     NOT done, named: `newtonND`'s backtracking loop that EXHAUSTS with every
     trial finite but none reducing |F| still TAKES the last tiny step in
     silence (the comment above it says an exhausted search bails; only the
     infeasible half does) -- fixing it can move numbers, so it is a separate
     slice; and the GibbsReactor outer non-convergence is a bare `cerr` line
     with no `AdvisoryLog` entry -- **ANNOUNCED 2026-09-27**
     (`GibbsReactor::announceOuterNotConverged`: console + `AdvisoryLog`
     warning under the unit's locus, with the last trial T and the energy
     residual still standing there; gate `check_reaction_subset_approach`
     arm (w)).  What it did NOT decide is whether such a run should REFUSE:
     measured, gibbs05 given `Q 2.0e5;` exits 0 publishing a state 990 kW
     off its own energy balance -- the exit code is RESERVED for Vitor, see
     the 2026-09-27 entry at the top of this section.
 A4. **Two more if-chain `model` slots unfixed** (`HeatExchanger` epsNTU,
     `BatchStill` rayleigh) after the 2026-09-07 sweep, and choupoCtrl's
     caveat block never says WHICH pass it describes.  [UNITS]
     **CLOSED 2026-09-27, and one third of it measured FALSE.**
     - `HeatExchanger.cpp` `model`: refuses an unknown word through
       `registryRefusal::message` (Accepted: epsNTU geometry design).
       Measured on the parent build: `heatExchanger01` (U + area) with
       `model geometri;` inserted ran eps-NTU to EXIT 0; the geometry cases
       died asking for an `area` nobody meant to write.
     - `BatchStill` was ALREADY refusing (`BatchStill.cpp`, a hand-written
       sentence) -- the filing was false for it.  It now refuses through the
       one home too (model and `refluxPolicy`).
     - Both joined `check_model_default_registered` arm (d), which now reads
       each case's own `application` so a choupoBatch row can run.
     - The caveat block: MEASURED real, and wider than filed.  Under an outer
       driver choupoCtrl/choupoSemiContinuous printed one block PER PASS
       (ctrl20's Bode sweep printed four), none naming a pass, and each was
       the cumulative log -- a union.  Now ONE block after the driver, headed
       with the pass count, whether the driver reports one as its answer, and
       the word UNION.  A true per-pass partition was built and REVERTED: a
       reset at the top of each pass (choupoSolve's shape) dropped Database's
       once-per-process advisories, so ctrl20's block said "none raised" about
       a run on a synthetic component.  NOT done, named: a partition needs the
       log to know which entries are once-per-process facts; and choupoSolve
       HAS that loss today -- its per-pass clear drops every `announceOnce`
       advisory from any pass after the first.  MEASURED: `cavett01` run
       directly lists `UNVERIFIED DATA (7)` (its interim records); the same
       case under a 2-point `sweep` outerDict announces all seven
       `[unreviewed]` lines at their site and its end-of-run block, "the LAST
       pass only", lists NONE of them.  RESERVED/next slice, not fixed here
       (it is choupoSolve's `runSimulation`, a path every case takes).  Also
       seen, not touched: choupoCtrl + `optimization` emits the result JSON
       TWICE (the driver's own emit and the dynamic driver's), identical.
     - **The partition is CLOSED (2026-09-27, the next slice).**  The log
       now holds both latches: `AdvisoryLog::addAnnouncedOnce(key, ...)`
       records the entry in EVERY pass that raises it and returns true once
       per PROCESS for the console line; `clear()` keeps only the process
       keys.  Six sites had an `add()` behind their own latch (Database
       `[local]`/`[synthetic]`/`[unreviewed]`, the D0 `[estimate]`, the Henry
       Trange extrapolation, the exchanger H gap) and all six call it now.
       `cavett01` under the 2-point sweep lists all seven records again; the
       dynamic driver clears per pass too and names its pass in
       choupoSolve's words (the UNION header is gone), with `ctrl20` keeping
       `compA`.  Gate: `check_caveat_surface` arms (f)-(h).  NAMED, not
       fixed: choupoSolve's representative block reads the LOG after the
       reports, so an integer enumeration's block describes the last replay,
       not the best one (identical on `optim06` today).  Record:
       [`docs/design/a-fact-raised-once-per-process.md`](docs/design/a-fact-raised-once-per-process.md).
 A5. **The composite refusal advises a keyword the engine does not read**,
     and a retired top-level form runs silently at exit 0.  [THERMO]
     **CLOSED 2026-09-27; BOTH halves reproduced, and the filing was
     narrower than the defect.**  The filing gave no site, and the
     composite refusal's text at `ThermoPackageBuilder.cpp:797-830` reads
     correctly on its own -- the defect was in the READER, not the
     sentence.  `model <w>;` and `ionic <w>;` name one slot, and every
     reader took `model` first, so the advice "declare `ionic davies;` with
     the backbone", followed literally on a case written `model pitzerHMW;`
     (flash13 so edited), returned the SAME refusal; and flash09 with
     `{ model davies; ionic pitzerHMW; }` ran DAVIES at exit 0 under a
     pitzerHMW declaration.  Three more of the family, measured the same
     way: the mediator-only-bridge refusal advised `speciation { masters
     (...) }`, a block the dispatch refuses as RETIRED (following it gave a
     second refusal); a single-salt `{ model Pitzer; molecular NRTL; }` ran
     Pitzer alone at exit 0, the backbone dropped; and the resolver refusal
     advised `approximations {}` without saying where, and the block put
     inside `equilibrium {}` was never read.  The retired top-level forms:
     `package <name>;` (whose refusal the v2 purge deleted with the v1
     reader, while `property-architecture.md` went on saying the runtime
     refuses it), `propertyPackage`, `thermoPackage`, `electrolyteModel`,
     a flat top-level `activityModel` / `equationOfState`, and a top-level
     `volatiles` -- which the reactive assembly READ as a fallback, a second
     home no document named, and ignored whenever equilibrium{} carried its
     own -- all ran at exit 0.  Now: ONE reader of the aqueous slot
     (`readAqueousActivity`, used by the reactive assembly, the single-salt
     assembly and the declared chemistry buildV2 attaches), `model`+`ionic`
     together REFUSE naming both words, `ionic <w>;` is read on the
     single-salt route too, a single-salt `molecular` REFUSES naming the
     route that serves it, the advice says IN PLACE OF the rejected word
     and where `approximations {}` goes, the mediator advice names the
     component's `aqueousMapping`, and the seven retired top-level keys
     plus a misplaced `approximations {}` REFUSE by name
     (`refuseRetiredTopLevel`, called first in `build()`).  A NAMED list,
     not a closed key set: the top level has readers outside the builder
     (`acceptUnverified`, `inherits`) and a closed set nobody enumerated
     would refuse a correct case.  No corpus case declared any refused
     form; the 60 case roots on the electrolyte and aqueous-chemistry
     routes and `--fast` pass with no golden moved.  Gate:
     `check_v2_refusals` advice-read arm (6 by-hand sabotages; S16, a second
     reader of the slot, is caught STRUCTURALLY only).  Also corrected:
     `property-architecture.md` still taught the retired masters block.
     NOT done then, named: `aqueous { apparentComponents ( ... ); }`,
     written in 20 electrolyte cases and read by nothing.
     **THAT REMAINDER IS CLOSED 2026-09-27, as a REFUSAL, not a reader.**
     MEASURED first.  No reader anywhere: `src/`, `gui/src` and `bin/` never
     name the key (grep, whole tree); it lived in 20 case
     `thermoPhysPropDict`s (19 SEALED -- the manifests claim only the
     imported records, never the authored dict, so the seal is untouched),
     in `docs/ai/thermo.md` + `docs/ai/patterns.md` (what `bin/llmctx`
     ships to an assistant authoring a case) and in the Developer and Props
     guides' listings; no fractal unit folder, per-unit `thermo {}` or
     sealed mirror elsewhere carried it.  The brief's premise that it
     repeated `components ( ... )` was FALSE: every list named only the
     SALT (NaCl 15, KCl 2, NaOH 3).  So the question was whether it ever
     disagreed with the salt the ENGINE activates -- and on all 20, run with
     the announcement on, the builder's `[electrolyte] active salt:` names
     the same salt, "the only component carrying dissociatesTo".  It agreed
     by coincidence and nothing checked it; the day a case listed the wrong
     salt it would have run the right one in silence.  DECISION: the
     facts it seemed to state each already have ONE home (the apparent
     basis IS `components`; the active salt is decided in
     `buildElectrolyte` b1 from `dissociatesTo` and the declared solid
     phase; the ions from `dissociatesTo`), so reading it would make a
     SECOND home for the active-salt decision.  `refuseUnreadAqueousKeys`
     (called in `ThermoPackageBuilder::build()` beside
     `refuseRetiredTopLevel`, so every binary and the sector/unit override
     route reach it) REFUSES it by name, quoting the list and saying where
     each fact lives; the line is removed from the 20 cases (crystalliser12
     and batch14 keep their "ethanol is the ANTISOLVENT" note, moved to the
     `components` line it describes), from the two `docs/ai` pages and the
     two guides (PDFs rebuilt).  All 20 pass against their goldens, no row
     moved.  Gate: `check_v2_refusals` unread-apparent arm (choupoProps
     against a clean control, choupoSolve on sealed crystalliser05, the
     lithium plant's BRINE sector through `thermoFor`, and no docs/ai page
     or guide .tex teaching it; S17-S19 by hand, and S18's first attempt
     did not land -- recorded in the gate).  FOR VITOR'S AUDIT: the
     2026-09-06 record (`the-errors-a-student-makes.md` §6a) had deferred
     this key, with `root`/`fugacityRoute`, as a thermo-grammar decision of
     his; this slice was dispatched as authorised, on the measurement above
     that the key states nothing the engine does not hold elsewhere.  It is
     one reversible commit; the `root`/`fugacityRoute` siblings are
     untouched and remain his.
 A6. **`bin/choupo-drill` fails on 2 of the flagship's 4 sectors** and blames
     the parent for state it has — an inbound stream looked up by the
     CONSUMING port's name instead of the declared identity.  [HARNESS]
     **CLOSED -- superseded by the 2026-09-07 `choupoSolve --manifest` fix
     (CLAUDE.md 6, "A STREAM BELONGS TO THE GRAPH THAT CONTAINS BOTH ITS
     ENDS"), which made the tool ask the engine where a stream's file lives
     instead of re-deriving it.  MEASURED, not inferred: at d9a906f94 the
     commander ran `bin/choupo-drill tutorials/plant/ChemicalPlantTutorial
     <SECTOR> <out>` for CONCENTRATION, DRYING, FERMENTATION and MAIN and
     each exited 0; re-run on 2026-09-27 on the A5 branch (after running
     the plant to write its `converged/`, which the tool requires and
     refuses without), the same four exit 0.**
 A7. **ASTRA's distillation review: 8 findings** (external second opinion,
     2026-09-07).  Two VERIFIED by reading the source: D06, the reverse-rate
     branch has no mirror for an absent PRODUCT so `ar` stays 1.0 as if it
     had unit activity; D08, `Absorber`/`Stripper` write both feeds into the
     same array slot and at N = 1 the second overwrites the first (LATENT —
     the corpus uses 6, 8 and 9 stages).  Six unread.  [UNITS]
     **D06 AND D08 CLOSED 2026-09-27; the other six are still not in the
     repository and were not guessed.**  BOTH WERE LATENT, and D06 more so
     than filed: `rateAt` is reached only by a `reaction { kinetics {} }`
     column, and the corpus's one reactive column (`column05`) is
     EQUILIBRIUM mode -- no corpus case evaluates the kinetic rate at all.
     *D06* (`DistillationColumn.cpp`, the kinetic `rateAt`): the loop
     multiplied an activity into a leg only when it was positive and then
     patched the FORWARD leg alone (`else if (nu < 0) af = 0`), so an absent
     product left `ar` at 1.0.  Reachable two ways: a Newton trial clamping a
     product's x to 0 (the residual jumped by `kr * PROD(others)` across that
     boundary -- a discontinuity, not a kink) and an adsorption law whose
     product declares no K.  The first route is REACHED, measured: column05
     turned kinetic (pseudo-homogeneous, 1 g, its own product-free feeds)
     takes a different Newton path before and after the fix (Sum xi 6.854e-3
     against 6.843e-3 kmol/h after 80 iterations), though neither build
     converged then -- see (1) below, closed the same day.  Fixed at the root by the rule every other rate
     in the engine already uses (`RateLaw::netRate`, CSTR, PFR,
     BatchReactor, DynamicCSTR -- all raise with `std::pow` and no special
     case): a^p with p > 0 is 0 at a = 0 on BOTH legs.  ONE home was not
     available -- the column's `forward {}`/`reverse {}`/`K_i a_i / M_i`
     grammar is not RateLaw's, and migrating it is a grammar decision -- so
     the loop now has RateLaw's shape rather than calling it.  **Enumerated,
     per the 2026-09-25 rule: no other rate in the tree has the defect.**
     Found beside it and fixed in the same lambda: the column was a SIXTH
     reader of the forward order, raising every reactant to |nu| without
     reading `order` -- it calls `Reaction::forwardOrder` now (a kinetic
     reactant with no `order` refuses); an `adsorption` law whose reacting
     species declares no K refuses by name (it made a whole rate leg vanish
     on a number nobody declared; an explicit `K 0;` is honoured); and the
     kinetics `model` word refuses an unknown word instead of running
     pseudo-homogeneous (the 2026-09-07 rule).  `docs/ai/unit-ops.md`
     shows `order` in the kinetic example.
     *D08* (`Absorber.cpp`, `Stripper.cpp`): `d[0] = L x_in` then
     `d[N-1] = V y_in` -- at N = 1 one slot, the second write erased the
     first.  Now `+=` on both rows of both units.  Measured on the parent
     commit at N = 1: the stripper (clean stripping gas) published NO NH3 in
     either outlet, 5 kmol/h vanished; the absorber with a semi-lean solvent
     lost exactly the solvent's 2 kmol/h.  The `Extractor` (N >= 1 allowed)
     sums its two inlets with `addMol` and never had the shape; the
     Wang-Henke column's first/last rows cannot coincide (its guard keeps
     N >= 2).  **Zero golden rows moved**: the six corpus cases that reach
     these units (column05, absorber01, acetone05, stripper01, acetonePlant,
     greenAmmoniaIndustrialN2) publish a result JSON IDENTICAL to the parent
     build's, measured.  Gate: `check_degenerate_limits` (one-stage flash of
     the combined feeds by hand, both units, the branch proved reached; the
     `K 0` product against the no-reverse column, EXACT; the three
     refusals).  Sabotaged by hand (S1 absorber `=`, S2 stripper `=`, S3 the
     positive-only multiply): each fired its own arm and only its own, and
     the parent build fails all five arms.
     **FOUND, NOT FIXED, each measured:** (1) ~~the KINETIC reactive column
     does not converge on column05's system at any catalyst charge >= 0.01
     g~~ **CLOSED 2026-09-27, diagnosis below.**  ROOT CAUSE: the
     simultaneous MESH residual mixes the component balances, in kmol/s,
     with the Sum(y) - 1 rows, pure numbers, and `newtonND` judges both with
     ONE absolute tolerance (1e-9) and ONE line-search merit (||F||_2).  On
     column05's system the feeds are ~1.9e-5 kmol/s, so a balance row
     weighs ~1e-5 of a Sum(y) row, and a kinetic rate enters ONLY through
     the balances (the extent is computed, not an unknown).  Two failures
     follow, both measured on the 0.01 g probe: (a) the first two
     continuation steps (0.01 and 0.05 of the charge) put a reaction
     imbalance of 5.9e-11 and 3.0e-10 on the rows -- under the tolerance --
     and returned after ZERO Newton iterations, the profile untouched;
     (b) from 0.2 on, the Newton step that removes a ~1e-10 kmol/s
     imbalance moves x by ~2e-4 and T by ~7e-3 K at stages 24-25, whose
     SECOND-order error on the end stages' Sum(y) rows exceeds the whole
     starting norm, so the line search cut alpha to 1/16-1/64 and the run
     crawled -- the residual floor proportional to the charge (5.1e-9,
     2.7e-8, 1.1e-7, 2.9e-7, 5.8e-7 across the 1 g ramp) on the Sum(y) rows
     of stages 1, 2, 24, 25, exactly as filed.  (The filed "phase 1 lands at
     |F| 7.9e-10" did not reproduce on the gate's probe: phase 1 lands at
     7.7e-15 in 9 iterations.)  THE SAME DEFECT AT EXIT 0: the old engine
     on the gate's 0.001 g probe "converged" with every component balance
     off by 5.44e-5 of the feed -- exactly reactionExtent/F, the whole
     reaction -- so the D06 A4 identity was being checked on a profile the
     reaction had never shaped.  HYPOTHESES, each measured:
     *balance/Sum(y) scaling* -- CONFIRMED: dividing the balances by the
     total feed (so every row is a fraction), with nothing else changed,
     converges 0.01 g in 2 iterations per continuation step, and 0.1, 1, 10
     and 100 g in 2-13 (conversion of acid 1.2, 11.7, 58.1, 80.4 %, every
     balance closed to ~1e-12 of the feed); *FD step too coarse for the
     rate* -- RULED OUT: fdStep 1e-5, 1e-7, 1e-9 give the same stall to
     three digits (|F| 2.80e-9, 2.80e-9, 2.94e-9 after 80 iterations);
     *continuation re-entering with a stale state* -- RULED OUT: each step
     starts from the previous converged x (checked), and jumping straight
     to the full charge stalls the same unscaled (5.1e-9) and converges
     scaled (2 iterations); *a row whose normalisation ignores the catalyst
     term* -- there is NO normalisation in the MESH at all (`Convergence.H`
     is not wired there, §5 of CLAUDE.md), which is the scaling finding
     under another name.  THE FIX (`DistillationColumn.cpp`, `balanceScale`
     beside `nU`): in KINETIC mode each component balance is divided by the
     total feed, announced at verbosity >= 2; the Newton direction is
     unchanged (a constant row scale), only what the tolerance and the line
     search count as progress.  **Deliberately NOT applied to the
     equilibrium and non-reactive columns, measured:** the same scale on
     every column made column05's EQUILIBRIUM phase 2 diverge (exit 2 --
     its homotopy starts at |F| = 2.2e3, the ln Q - ln K_a rows evaluated on
     a phase-1 profile that carries no product, and runs through alpha 1/8
     and dT = 134 K steps even unscaled) and moved column12's boundary residual
     (-5.66e-6 against a pinned -8.38e-6 kW, cancellation round-off); the
     other 28 column cases passed.  Gate (first slice):
     `check_degenerate_limits` -- A4 now at 1 g, new arm A6 (convergence at
     1 g and 10 g, the scaling announced, every component balance closed to
     1e-9 of the feed, conversion rising with the charge); sabotages S4 (the
     scale reverted: A4 exit 2) and S5 (the extent 1 ppm off: A6 on all
     four components) in its docstring.  ~~**PROPOSED REMEDY, not taken:**
     dimensionless balances on EVERY MESH~~ **TAKEN 2026-09-27, the same
     day, second slice.**  MEASURED FIRST, and the measurement contradicts
     the premise it was filed on: over all 30 column cases in the corpus
     (every flowsheetDict at any depth), the worst component-balance
     closure of any SIMULTANEOUS or full-MESH column, recomputed from the
     result JSON against its own feed, was 4.4e-11 (stripper01; column05
     4.9e-13).  The absolute tolerance was hiding nothing on the corpus AS
     SHIPPED -- a Newton's direction is scale-free, so from a linear-T seed
     it closes the balances with the bubble points and overshoots the
     tolerance quadratically.  It hides a balance only where the seed
     already satisfies the scale-free rows: the full-MESH's CMO seed, or a
     declared interior -- and there it was demonstrated, not argued (below).
     The open balances the corpus DOES publish are all WANG-HENKE, which is
     not a Newton at all -- see (5).  What was done:
     *(a) every MESH row dimensionless.*  Each component balance over the
     total feed (the `Convergence.H` rule by hand: summed over the stages
     the balances telescope to feed = products, so the terms a column
     balances are its feed); under `fullMESH` the material rows the same
     way and each ENERGY row over the feed times the stage liquids' mean
     latent heat (hV(x) - hL(x) at one composition, so the datum cancels),
     tolerance 1e-7 -> 1e-9 so one number means one fraction on every row.
     A per-row scale (each row over the sum of its own |terms|) was
     measured and REJECTED: 11 of the 15 MESH cases stopped converging.
     *(b) a robust equilibrium phase 2.*  The diagnosis: phase 1 leaves an
     unfed product at x = -4e-15, the ln Q row is CLAMPED at ln 1e-300 and
     so FLAT -- the Jacobian has no column for the product.  Measured on a
     3 x 3 grid (Ka298 5 / 38.7 / 500 x reflux 1.5 / 2.1 / 4): the old
     engine converged 2 of 9, the scale alone 2 of 9, a K_a ramp alone
     (K = s K_a from 1e-6) 6 of 9 (its first step spends 30 iterations
     climbing out of the clamp), a floor seed alone 5 of 9, a local-
     equilibrium seed 50 iterations on column05 with alpha at 1/64.  Taken:
     every species in the quotient floored at 1e-4 on the reactive stages,
     then K_a reached from the SEED'S OWN quotient (s = 0 satisfied by the
     seed), the full step first, halved on failure -- 9 of 9, the same
     conversion wherever an older route also converged, column05 in 16
     iterations (was 29), announced with its steps.  *(c) found on the
     way, stripper02:* with dimensionless balances its Newton sat on the
     same |F| ~ 0.012 plateau (the bottom stages' Sum(y) rows, alpha at
     6e-5 for ten iterations) the old one sat on, probed the same absurd
     full step (T = -98 K, water -1.16) and hit a ReactiveVLE refusal the
     old run had dodged by chance.  Rule taken: once the SEED has been
     priced, a stage refusal on a Newton TRIAL is an InfeasibleTrial (the
     solver shortens the step); a refusal at the seed still propagates and
     the converged profile is re-priced without the catch.  Announced once.
     The plateau itself is NOT fixed and is named: stripper02 converges in
     43 iterations (was 30) and escapes it by an exhausted line search's
     tiny accepted step, both before and after.  **Golden rows moved:
     NONE** -- all 30 column cases PASS their goldens; column12's
     cancellation-level residual reads -8.37907373e-6 against the pinned
     -8.37907351e-6 kW (the -5.66e-6 filed above did not reproduce).
     Measured against a build of the parent on every numeric leaf of the
     30 result JSONs: no stream or KPI moved by more than 1.7e-8 relative
     (column04's bottoms benzene), the Wang-Henke and outer-driver cases
     are bit-identical, and the unpinned `iterations` KPI moved on five
     (column05 29 -> 16, column08 25 -> 20, acetone06 16 -> 15, column04
     6 -> 7, stripper02 30 -> 43; column05's now counts the whole phase-2
     continuation).  Gate:
     `check_degenerate_limits` A7 (every MESH column in the corpus, derived
     from the flowsheets, closes to 1e-9 of its feed) and A8 (SCALE
     INVARIANCE: column06 x1e-8 and x1e4, column05 x1e-8, and column02 seeded
     with its own converged interior at a reflux 1.2x higher, x1e-8, must
     reproduce their full-size answer to 1e-6); sabotages S6 (scale back to
     1: A4 + A8 -- the interior probe returned its seed after zero
     iterations, x_D 0.98125 against 0.98721), S7 (energy rows back in kW:
     survived x1e-8, so x1e4 was added -- exit 2, stalled at |F| 4.9e-8
     kW), S8 (no seed floor: column05 exit 2) and S9 (no trial rule:
     stripper02 exit 2) in its docstring.  The gate moved AFTER the case
     loop in `bin/runTests` so A7 reads the sweep's cached pass: ~23 s
     there, ~70 s standalone, against ~12 s before.  (2) the stripper still
     DELETES solvent that arrives with the stripping gas -- the 2026-08-12
     absorber fix (`liqMol = L x_in + V y_in` for the solvent) was never
     carried to its twin; latent (stripper01's gas is pure N2).  Where
     steam-stripping solvent should go is a physics choice, so it was not
     taken here.  (3) in BOTH units a non-solute, non-solvent component that
     arrives in the LIQUID feed is deleted (the inert branch counts only
     `V y_in`); latent -- every corpus wash liquid is pure water and
     stripper01's liquid carries only NH3 (a solute) and water.  (4) the kinetic column reads no
     `orderRev`, while `forwardOrder`'s shared refusal message names it.
     (5) **FOUND, NOT FIXED: Wang-Henke closes its component balances only
     to its step tolerance.** It stops when max|dx| between passes <
     `compositionTol` (1e-6), not on a residual, and a slowly contracting
     close-boiling column leaves its balances open by far more than the
     step: measured on the base engine, column15 6.3e-8, column14 4.2e-8,
     column11 3.7e-8, column01/09/10 and heatlink01 2.5e-8, column16 1.4e-8
     of the feed, and 4.8e-7 - 8.6e-7 on the representative passes of
     optim01, optim06, pareto01 and sensitivity01/02. Remedy proposed, NOT
     taken: stop on the balance residual (or on max|dx| scaled by the
     contraction rate) -- it moves every Wang-Henke golden and outer-driver
     path, so it is a separate decision.

*The engine publishes something nothing checks:*

 B1. **A published profile COLUMN is pinned by nothing.**  No golden row kind
     can read one, so published-implies-pinned (2026-08-12) has a hole
     exactly where the 2026-09-07 size-axis defect lived.  [HARNESS]
 B2. **written implies read back** — three engine writers emit dict grammar
     and ONE gate opens ONE kind of it with the project's own parser.  The
     proposed sibling rule to published-implies-pinned.  [HARNESS]
 B3. **`RegistryRefusal.H` says "no factory writes this sentence any more"**
     — 10 of 41 sites are routed, and NOT ONE of the 41 is fired by any gate
     or case.  A refusal nothing fires is a sentence, not a contract.
 B4. **The gate the openfoam-study asks for:** FAIL on any unknown-name throw
     that does not go through `registryRefusal` — 6 of 66 sites converted.
 B5. **My own commit left three GUI tests red, and the full suite is
     STRUCTURALLY incapable of seeing it:** `bin/runTests` typechecks the GUI
     and never runs its tests.  [GUI/HARNESS]

*The machinery that audits the machinery:*

 C1. **50 gates mark no claim line**, and until they do `bin/runTests` reads
     its PASS-row text by four different rules at 197 sites.  The 2026-09-06
     `gate_claim.py` home exists; the campaign to adopt it does not.
 C2. **The gate-claim fix landed in the code and never in the artefact** —
     50 of 191 `generated/gateManifest.json` entries still hold the donated
     first line, and its header is the OLD generator's text.
 C3. **`generated/gateManifest.json` holds a stale claim** for
     `check_sector_hierarchy` and `check_drill_in`; regeneration needs a
     dedicated slow run.
 C4. **`check_layering` cannot see a cycle of length >= 3** — its docstring
     claims a DFS that does not exist, and I18 is RECORDED as covered by it.
 C5. **`check_gate_selftest`'s stated LIMITS are false in the safe
     direction** — it says data-level-only while three SOURCE sabotages
     landed 2026-08-14.  A gate that understates its reach still misleads.
 C6. **The tooling plane is joined at LINK time:** `libchoupo.so` exports
     `curation/AqueousGraph` into choupoSolve, choupoBatch, choupoCtrl and
     every user binary — the one rule `check_layering` cannot reach.
 C7. **A second valid include spelling nothing forbids and nothing counts:**
     an include spelled with a leading `src/` (the path as written from the
     repository root, rather than from the include root) drops the layering edge
     silently -- the gate that counts edges never sees it.
 C8. **`check_decision_index` carries hand-written counts** that every new
     record moves; three generals hit it in one day.  Generate the count.
 C9. **`bin/curate/case_manifest.py` has no `--help` and WRITES when asked
     one.**  A tool that mutates the tree in answer to a question.

*Documents that have gone quietly false:*

 D1. **Level-1 documents carry facts the tree moved past**, and
     `project-philosophy.md` §5 claims an enforcement that does not exist for
     five decisions.  [DOCS]
 D2. **The EconomicsPass campaign: 14 silent defaults an appraisal rests on**
     (discount rate, project life, tax rate, stream factor, Lang factor…).
     Measured and STOPPED 2026-09-06: fourteen announcements on one run is
     the wall of text the caveat block exists to prevent, and what an
     appraisal owes an undeclared discount rate is a decision nobody has
     taken.  Related to §4b R7 but not the same item.  [DESIGN]

*The student's screen:*

 E1. **The GUI's `LogWorkspace` recovers a sector by splitting a qualified
     name off the run log** — the LAST name-identity reader, live and
     unfixed, named rather than fixed on 2026-09-06 because it genuinely has
     only a name there.  Where a caller has no unit, say so at the call
     site.  [GUI]
 E2. **A failed run leaves the canvas asserting the previous result is
     current**, and the Run button carries no state at all.  [GUI]
 E3. **The Streams navigator is a live restatement of the PRODUCER ownership
     rule this project REPLACED on 2026-09-07.**  A restatement of a rule
     goes false the day the rule moves — the lesson of that very slice,
     still standing in the GUI.  [GUI]
 E4. **Streams: the sort exists and is invisible**, the pop-out ignores it,
     and the balances band has no height limit.  [GUI]
 E5. **The specification sheet built to be AUDITED per unit is reachable only
     as raw file text**, and Reports is the one workspace with no rail.
     [GUI]
 E6. **Two specification sheets for one exchanger, on two input paths, and
     nothing compares them.**  [DESIGN]
 E7. **The specification sheet's process side, and the mechanical side NAMED
     as the mechanical engineer's** — sourced from three real data sheets.
     A scope, not a defect: what a sheet must carry before an examiner can
     audit a project from it.  [DESIGN]

*The harness itself:*

 F1. **Suite tiers (task #84).**  Slice 1 — the declared fast set with the
     four conservation gates — is IN FLIGHT 2026-09-07.  Slice 2, the
     independent cases in parallel, is NOT started.  Measured: with the
     gates serial the asymptote IS the gate time, and 4 workers already sits
     ~29 % above it, so the second half of the wall clock is the GATE side
     and needs its own decision (`check_gate_selftest` is destructive and
     exclusive; several gates sweep `converged/` trees a parallel case walk
     would be rewriting).

**A NUMBER ABOUT THIS LIST THAT IS WORTH KEEPING, and one that is not.**
Worth keeping: of one builder day measured 2026-09-07, roughly 55 % of the
time was spent WAITING on validation, of which about half was on the wrong
rung of the ladder — the defect F1 exists to close.  Not worth keeping: the
wall-clock minutes.  Two COMPLETE runs of the same 598 items on the same day
measured 42.5 and 31.3 min, a 26 % spread.  The stable quantity is the SPLIT
(cases 54 %, gates 46 %, in both runs); never quote a suite minute as a
constant.


000. ~~**EDITORIAL: the theory guide treats DRYING twice.**~~ — **SETTLED
   2026-09-03 (the assistant's call, under the 2026-09-03 ruling that
   nothing is "reserved"; Vítor's veto stands).**  Read side by side, the
   two are a deliberate PAIR and not a double treatment: `ch:drying-overview`
   sits among the unit-operation walkthroughs (cyclone, dryer, exchanger)
   and is the UNITS — the four coupled pieces, the endpoint split, the
   three tutorials; `ch:drying` sits among the deeper theory (MESH,
   hydraulics, MHeatX) and is the THEORY — dry-basis moisture, the
   drying-rate curve and its time integral, the three atomiser families
   with their correlations and references, the single-droplet and chamber
   balances.  They shared GAB, the Lewis falling rate and Ranz--Marshall
   with no cross-reference, and `ch:drying-overview` was referenced from
   nowhere — which is what made them READ as a duplicate.  Done: each now
   opens by naming the other and its role (a LaTeX comment at the first
   records the decision), and the theory's vague `X_final = max(X_e, …)`
   was replaced by the engine's own rule (`min(X_in, X_e)` for the solid
   dryer, the curve at the residence time for the spray dryer, never below
   `X_e`).  Nothing was deleted or merged.  The original finding follows.
   **EDITORIAL, for Vítor and Pedro: the theory guide treats DRYING twice.**
   `\section{Drying: spray dryer and solid dryer}` (line 18572, 923 words) and
   `\section{Drying of solids and spray drying}` (line 20078, 1914 words) are
   two sections on one subject with **zero shared 8-word phrases** -- a double
   treatment, not a copy-paste.  Whether that is deliberate (a survey entry
   plus a detailed one) or an accident is an editorial call about a work its
   authors curate, so nothing was deleted; the colliding `ch:drying` label
   between them WAS fixed, being mechanical.
   Correction to what the commit that found this said: it named the
   HYDRAULICS pair as duplicates too, and they are not.  Line 17918 is PIPE
   pressure drop (Darcy--Weisbach) and 19675 is TRAY hydraulics in a column --
   different subjects that merely shared a label name, which the titles say
   plainly and I asserted past.


00. **A GUARD ARMED ON ONE OF TWO ROUTES — now a named class, third instance
   2026-08-14.**  `check_true_ions` was permanently green over deleted
   inputs; `check_ebullioscopic` watched `K_f()` while its consumer read
   `subHfus()`; and the model-boundary ledger audited only units DECLARING a
   duty, so every adiabatic model boundary went unwatched — including the
   acetone plant's absorber, the only one it has.  In all three the gate
   passed, the claim was false, and the shape was identical: **two roads to
   the same condition, an arm on one of them.**  When you add an arm, ask
   what the OTHER route into the same state looks like and whether any case
   travels it; when no corpus case does, say so in the gate's own output
   rather than letting a green run imply coverage it lacks.

   **2026-08-15 addendum — the class was measured, and its largest cluster is
   CLOSED.**  A fleet census over all 140 gates bucketed the sabotage
   evidence: 38 record observed output in-file, 6 claim it without showing
   it, 34 have it only in design records or commit messages, 62 have none
   anywhere.  Its systemic
   finding: FOURTEEN tree-scanner gates shared the death shape exactly -- no
   refusal over an empty scan, so one directory rename would have turned all
   fourteen permanently green at once.  All fourteen now refuse an absent
   scan root BY NAME and a collapsed scan count against a floor, with the
   observed count printed in every OK line (template:
   `check_empty_dirs.py`).  The death shape was demonstrated live before
   fixing: a pre-fix copy over a treeless directory printed "cosmo-scrub
   gate: ... 0 restricted values in the public tree" and "check_doctrine: 8
   teaching surfaces clean", exit 0, over nothing.  `check_gate_selftest`
   grew a SOURCE tier (sabotages the ENGINE, rebuilds ~3 s, demands the gate
   fail on the rebuilt binary, restores, and re-runs the covered gates to
   prove the tree came back) plus four census-picked data arms; coverage 11
   of 141, said aloud on every run.  The remaining B/C/D buckets are the
   named backlog.

0b. **An absorber is classified as a heat exchanger, structurally.**  The
   energy report detects a process-to-process exchanger as ">=2 process in
   AND >=2 process out AND no boundary heat", which is also an absorber, an
   extractor and a membrane module.  It changes NO number today (the units
   that trip it declare no external duty either way, so the branch it
   selects is the one they would have taken) and it is left alone
   deliberately: the fix matters only for a 2-in/2-out unit that DOES
   declare a duty, and the corpus has none to test it against.  Recorded in
   `docs/design/model-boundary-energy-ledger.md`; it becomes real the day
   such a case is authored.

0. **THE MANUALS WERE OUTSIDE THE FENCES, and are now inside them.**  A
   coverage sweep on 2026-08-04 found seven shipped capabilities described
   in no guide at all (pinch, the effective stage K, the demand staircase,
   the computational seal, the `speciation {}` block, the ctrl first-law
   routes, the external-reference battery) plus two stale hand-carried
   lists in the developer guide.  All are written now, and two structural
   fixes came with them so the class of defect cannot recur silently:
   * the props guide's 27-operation reference is **generated** from
     `gui/schemas/operations/` (`bin/curate/props_ops_reference.py`), with
     a gate refusing a stale render — a hand-written reference against
     evolving schemas is the arity sin with a deadline;
   * the release-inventory gate now scans **the four manuals** as well as
     the AI-facing docs, and its pattern learned `N tutorials` beside
     `N cases`.  Both changes were needed: the user guide said "about 200
     tutorials" against 330, and the widened pattern immediately caught a
     second stale count on the **public README** (191/243 against 330/295)
     that had been passing the gate the whole time.
   **The remaining debt is that nothing checks COVERAGE.**  A gate can
   refuse a stale number; no gate notices a capability nobody documented.
   That sweep was done by hand and will need doing again.
   **Done again 2026-09-03**, for everything shipped since 2026-08-04: of
   30 user-visible capabilities, 12 had NO manual entry and 13 were only
   LISTED (by the generated props-op reference, a stub list, or the
   AI-facing docs), 7 were covered.  All 25 now have prose in the guide a
   student would open (batchDiafilter had zero documentation of any kind
   — no schema, no catalogue entry, no manual — and `batchDryer` no
   catalogue entry; both written).  Two STRUCTURAL findings, which are the
   half worth keeping: (1) the generated `propsGuide-operations.tex` fixed
   the stale-reference defect and created a new one — every new props op is
   LISTED automatically and EXPLAINED never, six ops sat behind that green
   gate; a generated list is coverage of NAMES, not of lessons.  (2)
   `docs/engine-capabilities.md`, whose own header names engine editors as
   its audience, had absorbed three user-facing capabilities (`rtd`,
   `frequencyResponse`, the carried/unserved semantics) as their only home.
   Also found on the way: the EduTools guide hand-carried "six live tools"
   against a registry several times that size (retired: the registry is the
   authority, no count in prose), and the Explorer guide described
   McCabe-Thiele and the psychrometric chart as Explorer views three weeks
   after they moved to EduTools.  Still no gate for COVERAGE — that sweep
   stays a hand task, and the next one is due when the next capability ships.
   **The RENDER half now has one** (`check_guide_pdf_fresh`, same day).
   Writing the prose exposed the defect under it: every manual gate this
   project owns reads the `.tex` (`check_doctrine`, `check_guide_paths`,
   `check_lesson_symbols`), the tree SHIPS the `.pdf`, and the two are the
   same claim only while the render is fresh — which nothing checked.  Seven
   of the eight committed PDFs were renders of sources that had since moved,
   and `check_guide_pdf_version` was green over all of them, because it reads
   the title page for the version string and a stale render of a
   `Choupo-dev` source says `Choupo-dev`.  Same version, stale content: the
   shape `bin/buildSite` records for the site copy, one artefact inwards.
   The second arm found the sharper case: `docs/theoryGuide-STIFF-METHODS.pdf`,
   a v0.2.0 Theory Guide built 2026-06-18, tracked, referenced by nothing,
   with no source in the tree — and naming two commercial simulators in its
   text and a trademark line, which the manuals doctrine forbids (settled 2026-07-03,
   after that build).  `check_doctrine` was right about every surface it can
   see; a sourceless binary is outside every source gate at once.  Deleted —
   git keeps the record, and a withdrawal is not an erasure.

1. ~~**SEAL DRIFT**~~ — **NOT A DEBT.  RULED 2026-08-04 (Vítor): the sealed
   cases stay PINNED, permanently, and this is a POLICY rather than a
   backlog item.**

   The facts, because the earlier wording of this entry got two of them
   wrong.  There are ~435 records whose sealed copy differs from the live
   catalogue, and **0 sealed cases fail to reproduce** — nothing is broken;
   the catalogue moved on.  The drift is **COMPUTATIONAL, not
   "comment-only"**: this entry claimed comment-only until 2026-08-04, and
   the classifier built on 2026-08-03 had already measured otherwise — the
   catalogue genuinely gained content (pcsaft blocks, ring-campaign
   thermochemistry).  A description nobody re-read after the measurement
   that refuted it.

   **Why pinned is the answer and not a deferral.**  A sealed case is a
   record of what it was validated against.  Resealing wholesale would
   destroy the distinction between "the bytes moved" and "the content
   moved", and it would *look* like re-validation when nothing was
   re-validated — the computational-seal migration record says exactly
   this, and it says it about a much smaller change than 435 records.  The
   goldens would move for reasons no human reviewed.

   **What this means in practice:**
   * `catalogDivergenceCount` is a **curation diagnostic**, not a failure
     count.  It tells a curator which records the catalogue has advanced
     past; it is not a queue to be drained.
   * `sealedReproducibilityFailures` is the number that must stay 0, and
     does.  The two KPIs are deliberately separate and must not be
     conflated (that conflation is what made this look like debt).
   * A case is resealed when someone re-imports it **for a reason of its
     own** — never as bookkeeping.
   * There is no scheduled mass reseal.  Proposing one again needs a new
     argument, not a re-reading of this drift count.
1b. ~~**`pcsaft{}` vs the doctrine's `eosParameters{}` container**~~ —
   **RULED 2026-08-03 (second-opinion review): the flat model-named
   block IS the doctrine.**  data-doctrine §4 amended; the container is
   retired as intent (classification-only containers are not created;
   a container earns existence only with operational semantics).  A
   future parameter-carrying EoS adds its own flat block; model
   SELECTION stays in the case's thermoPhysPropDict.
2. ~~**ctrl physical-energy refusal**~~ — **PAID 2026-08-01** (roadmap #1
   above).  What remains is narrower and named: the claim covers
   `dynamicCSTR`; any future dynamic unit type must fill `storedEnergy_kJ` /
   `enthalpyFlow_kW` / `heatInput_kW` or the whole rung withholds, which is
   the intended default (a unit that says nothing claims nothing).
3. **`constant/electrolyte/` sidecars** — **two legs of three PAID 2026-08-02;
   what remains is ONE named capability, not a migration.**  Measured rather
   than assumed, and the measurement split the debt cleanly:
   - `ions.dat` and `speciationMode extend` each duplicated a canonical home
     (`constant/species/<name>.dat` and `constant/chemistry/` respectively),
     and the duplication was live: `tartaricAcid_acidulation` shipped Tart and
     HTart in the sidecar while `constant/species/Tart.dat` / `HTart.dat` sat
     beside them holding the same four numbers — read FIRST, so the sidecar
     *shadowed* the curated record it copied.  The half-finished migration was
     the cause: the two ions had been promoted to the catalogue on 2026-07-18,
     the neutral master `H2Tart` and the three dissociation reactions had not.
     Promoted them (`species/H2Tart.dat`, `chemistry/{H2Tart,HTart,Tart}-formation.dat`,
     all Kochergina 2006 as the rest of the family already was), re-sealed the
     case, results **byte-identical** (same 9-activated / 1-unreachable
     closure, same log K's, CSVs unchanged).  Both legs now **refuse** with
     their canonical remedy named.
   - `speciationMode replace` **stays**, and stays deliberately.  It declares a
     RESTRICTED network: `pitzer_seawater_verify` must exclude the sulfate ion
     pairs or it double-counts what the HMW ternary terms already carry.
     There is no canonical way to say that — `scanRecordDir` merges, it never
     subtracts — and "just don't mirror the records" does not survive contact
     with `bin/choupo-import`, whose closure is REACHABILITY-based and pulls
     every excluded record straight back.  The leg runs, announces its
     restriction on every run, and waits for a home.
   **The open question, for Vítor:** where does a case DECLARE that its
   speciation network is deliberately reduced?  The natural home is the
   `equilibrium { aqueous { speciation {} } }` block the case already carries
   (the one-knob rule: the case declares, the engine obeys and announces), with
   `choupo-import` reading the same declaration so the closure honours it.
   That is an architecture change, so it is proposed, not built.
   Gate: `check_electrolyte_sidecars` (2 refusals sabotage-verified + the
   corpus scan + the converted case's network + the survivor's announcement).
4. ~~**Docs with partially-superseded "settled" sections**~~ — **both named
   bullets CLOSED (2026-07-28 and 2026-08-02); kept struck, not deleted, for
   the same reason the first bullet gives.**  The original caveat — *needs
   electrolyte-domain care, do it with Vítor, not autonomously* — held for the
   electrolyte bullet and was honoured; the flowsheet-grammar bullet was not
   electrolyte-domain and was closed by measuring the reader.  What remains is
   the standing risk, not a task: a settled-note that lags its own code is
   invisible until someone follows it, which is why both fixes ended in a
   GATE rather than in a correction (`check_doctrine` now covers
   `engine-capabilities.md`; `check_doc_references` covers every path and case
   name the AI docs mention).
   - ~~`CLAUDE.md` §"Electrolyte data tree" says "7 homes"~~ — **CLOSED
     2026-07-28**: it now says 5, names the retired `methods/` and
     `phases/solid/` explicitly, and tells the reader to verify against
     `ls data/standards/` because the count has drifted once.  (A debt list
     that still lists a paid debt is the same drift one level up, which is
     why this line is struck rather than deleted.)
   - ~~`docs/engine-capabilities.md` still narrates the retired
     `children`/`boundary` flowsheet grammar~~ — **CLOSED 2026-08-02**, and
     the debt entry itself was half wrong: `children` is genuinely gone, but
     **`boundary` is LIVE** — `Flowsheet.cpp` reads `boundary { inlets;
     outlets; }` at composite level (ChemicalPlantTutorial and hda both use
     it) and accepts it on a leaf as the legacy spelling of
     `inputs`/`outputs`.  Only the composite word was wrong, and it is fixed
     with the leaf's preferred grammar stated beside it.  Two hand-maintained
     counts went with it (a components tally reading 56 against a tree several
     times that — the count is generated, so the doc now says where to read it
     — and two sections both titled `assets/`, from before Migration 4
     flattened them, now one section keyed by the `kind` field).  The durable
     fix is that `engine-capabilities.md` is now a `check_doctrine` teaching
     surface: it was outside that list, which is how it kept teaching a
     grammar the reader had stopped accepting.
   Content is correct in the CODE; only the settled-note prose lags.
5. ~~**`docs/ai/{consistency,extending,gui-credo}.md`** were not re-read in the
   v2 scrub~~ — **PAID 2026-08-02 for the two that carry executable claims, and
   generalised.**  `consistency.md` and `extending.md` were verified end to end
   against the code — op registered, tutorials present, dict forms and counts
   correct — and each had exactly one defect: `consistency.md` showed a `role`
   key that `vleConsistency` does not read (only `Kinetics1D` does), and its
   dataset example omitted the model-scan column aliases the op accepts.
   Nothing in `extending.md` was wrong; the one suspected phantom
   (`userOp02_component_splitter`) turned out to exist — a truncated `ls`, not
   a doc bug, which is the third time this campaign that measuring changed the
   answer.
   What the pass *did* find is a different failure class, and a mechanical one:
   **reference rot**.  Seven dead paths and case names across the AI docs — an
   archive directory dissolved into the categorised layout, three starter-table
   cases renamed out from under the table, UNIFAC groups at their
   pre-Migration-2 address, a `parameters/eos/` folder never built, the
   materials registry still pointed at a top-level materials folder that
   Migration 4 folded into the flat assets home, and CLAUDE.md crediting
   `generated/indexes/`+`flatCaches/` for machinery that never existed.  All
   fixed; `check_doc_references` now verifies every path and case name in
   `docs/ai/*.md` + CLAUDE.md + DEV.md, with deliberate absences listed *with
   their reason* and a check that fires when one of them quietly comes true.
   Sabotage-verified.
   ~~Still unread: `gui-credo.md`~~ — **READ END-TO-END 2026-08-02** (the
   Fable-5 audit's follow-up), and the "prose rather than checkable claims"
   excuse was wrong: its claims WERE checkable against `gui/src/`, and five
   of them were stale.  The credo — the self-declared single source of truth
   an assistant must read before proposing any GUI change — still described
   a "Thermo" workspace (Thermo is a TAB inside Props; no such workspace key
   exists), called Reports a placeholder (it ships utilities + global
   balances), and carried a fixed workspace list where the real menu is
   CONTEXT-DEPENDENT per case type with Explore/Variables/Control/Pinch.
   Everything else verified: shell components, selection model, pop-out
   mechanics (Blob + 30 s revoke), defensive rendering, explorer guard-rails
   and chrome budget, duty stubs reading utilityAllocation, tab citizenship.
   Fixed per the arity lesson: the credo now states the RULE (context-gated
   workspaces, lit-but-dead never shows) and names `MenuBar.tsx` as the
   authority on the lineup, instead of carrying a copy of the list.
6. ~~**Operation-schema coverage: 32 of 76**~~ — **PAID IN FULL 2026-08-02:
   76 of 76, and the requirement is now STANDING** (`check_schema_coverage`
   fails on any registered op without a schema, so registering an op and
   writing its schema are one act from here on).  Found the same day while paying
   debt #5, and now MEASURED and PUBLISHED rather than latent.
   `docs/ai/schemas-reference.md` called itself *"every shipped operation"*
   while carrying under half of them, so an assistant reading it concluded the
   other 44 do not exist.  Three of the gaps the file itself had flagged
   (`valve`, `electricLoad`, `steamTables`) now have `.schema.json` files and
   are generated like everything else; the remaining 44 are listed by name in
   the file's own header, and the list shrinks only by writing schema files —
   never by editing the sentence.  Two consequences beyond the doc: a
   schema-less operation has no GUI property editor, and it cannot be
   validated.  Worth clearing in batches by family (the props-bench ops are
   the largest cluster, then the reactors, then the heat units).
   **The COUNT is generated — read it from the header of
   `docs/ai/schemas-reference.md`, never from here** (this entry carried
   "41 of 76" for exactly one batch before drifting, which is the §6 lesson
   re-taught).  Batches land a family at a time, each schema written from the
   op's source and a case that runs it.  The Fable-5 audit (2026-08-02) added
   two things worth knowing: the registry derives EIGHT alias groups (two
   names, one class, one operation block — `flash`≡`isothermalFlash`,
   `column`≡`distillationColumn`, `FUG`≡`shortcutColumn`, `REquil`≡
   `equilibriumReactor`, `extract`≡`extractor`, `MHeatX`≡`multiStreamHX`,
   `condenser`/`boiler`≡`phaseChanger`, `membraneSW`≡`spiralWoundModule`),
   and `check_schema_coverage` now REFUSES alias schemas that disagree on
   properties/required — the groups are derived from the `reg(...)` calls,
   never hand-listed, so a new alias joins its group with no edit.  The
   "not documented" list stopped lying by omission the same day: five ops it
   listed as schema-less were aliases of documented ones.
   **And the batch produced the check that matters more than the batch.**
   `check_schema_coverage` holds every schema against the CORPUS: a case in
   `tutorials/` runs, so every key it uses is real and every key it omits is
   optional.  It caught two of my own nine within minutes —
   `conversionReactor` takes a bare `conversion` with the reaction named at
   unit level, and `equilibriumReactor` names its reactions at unit level too,
   where I had invented an inline stoichiometry block that exists nowhere.  A
   schema written from the header comment instead of from a running case is
   fabrication, and this is what catches it.
   It also found **82 disagreements across 18 pre-existing schemas** — each one
   a schema that would REJECT a case the engine runs (`additionalProperties`
   is false everywhere) or that marks required a key a running case omits.
   **All 82 CLEARED the same day** (batches 2 and 3), and the shrinking
   baseline that held them was deleted with the last line, exactly as its own
   header said it would be — the gate now holds the plain contract, and a
   disagreement is a schema to fix rather than a line to record.  What the
   clearing found, over and above wrong types: **schemas documenting a RETIRED
   interface.**  `evaporator` demanded a `P` the unit never reads (it is a
   KPI — the boiling-point elevation sets it, so P is read back from the
   answer); `solidDryer` declared `airTemperature` and `relativeHumidity`,
   both retired when the dryer was rewritten to take a real hot-air stream,
   and its source says so in as many words.  Neither would have run.
   The general rule the clearing settled, worth keeping: **a schema describes
   what an AUTHOR writes.**  A key delivered by an energy wire
   (`energyInputs … target <key>`) is written into the operation block before
   solve and read "exactly as if the author had typed it" — so `W_shaft` on a
   pump or compressor and `Q` on a heater are required by the ENGINE and not
   by the schema.
   One parser bug found and fixed on the way: the checker read words out of
   quoted STRINGS, so `rationale "NRTL captures it"` reported `NRTL` as an
   operation parameter.  Strings are blanked now, and `rationale`/`provenance`
   joined `source` as author annotations no schema claims.
   *Related fix, same slice:* `bin/regen-llm-docs` was reading three
   directories that Migrations 2 and 4 had moved, and its `_list_section`
   answered "(directory not present)" instead of failing — so a blind
   regeneration published a catalogue claiming Choupo ships no Henry pairs, no
   membranes and no materials.  Repointed (205/4/4/4 now render) and absence
   is an ERROR.  Its `--check` drift mode had existed since it was written and
   ran nowhere, which is how `components.md` came to advertise 56 components
   against a tree of 247; it is a `runTests` gate now.
7. ~~**The TS side was never audited this campaign**~~ — **AUDITED
   2026-08-02**: `npm run typecheck` 0 errors; `npm test` 62 files / 1990
   tests green (716 of them the dict round-trip over the corpus).  The audit
   immediately found the campaign's recurring defect one stack over: the
   GUI's schema REGISTRY (`gui/src/case/operationSchemas.ts`) enumerated 20
   hand-written imports, so the 56 schemas written this campaign never
   reached the Property panel — adding a file and adding its import were two
   acts, and only one got done (the llmctx failure, again).  Fixed with an
   `import.meta.glob` (a schema reaches the panel by existing), and the
   flattener now SKIPS structured blocks (`geometry {}`, `hydraulics {}`)
   instead of mis-typing them into text rows that render "[object Object]".
   Held by `tests/operationSchemas.test.ts`: every file on disk must resolve
   through the registry, no structured property may leak into the flat view
   (sabotage-verified — removing the scalar filter fails 2 of 3), and pipe's
   flat view is exactly its one scalar.
8. ~~**Landing mobile**~~ — **PROVEN 2026-09-03.**  The 390 px responsive fix
   (`b9f17421a`, `f7b69592f`: minWidth:0 + clamp + wrap) was measured
   end-to-end: the landing served locally with the two JSONs it fetches,
   Chromium driven through `gui/tools/checkGui/cdp.mjs` at 390×844, mobile
   + touch emulation.  `scrollWidth` 390 = `innerWidth` 390 (no horizontal
   scroll anywhere on a 24 761 px page); exactly ONE element extends past
   the viewport, a `span.dim` line of the flash01 trace block, and that
   block is `overflow: auto` by design — the trace scrolls inside its own
   box, which is the rule the artifact guidance states for wide code.
   Three screenshots (top, middle, bottom) read clean.  What this does NOT
   prove: any width but 390, and the app itself (checkGui's business).  The adsorption debt is roadmap #7 above.
9. **Phase-absence ambiguity in the stream contract** (semantic, raised by
   Vítor 2026-08-08, deliberately NOT patched with the pop-out fix it was
   found beside).  A stream file with no `phases {}` block currently covers
   two different claims: "this stream has one fluid phase" and "this stream
   is physically multiphase but no unit on its path solved the split".  The
   live witness is `lithiumBrinePlant`'s `emulsion` (mixer outlet, brine +
   kerosene/extractant): the mixer merges without phase equilibrium, the
   settler downstream does the split into separate streams, so the emulsion
   is written as one apparent liquid with no decomposition — defensible
   (absence = "no solved decomposition", and inventing an unsolved split
   would be worse), but a student cannot distinguish the two cases from the
   file alone.  Review belongs with the C3 uniform-`phases` grammar work /
   the solid-equilibrium migration, where phase declaration is already on
   the table; do not add a new stream field ad hoc for it.
   **Half closed 2026-08-24 (announcement authorised on the architect's
   ruling):** the Mixer now says it at the site -- a log line whenever
   two or more liquid inlets merge ("no phase split is solved here; if
   immiscible the outlet is an unresolved emulsion until a downstream
   unit owns the split"), log-only deliberately, since it is true of
   every liquid+liquid merge and claims no immiscibility check.  The
   FILE-level ambiguity -- the stream grammar half -- stays exactly
   where this item put it: C3.

10. **A CARRIED duty and an UNSERVED duty wrote the SAME golden row --
    CLOSED 2026-09-03.**  Found 2026-09-02 fixing the exchanger mis-filing:
    the golden writer keyed every `allocated: false` utility entry
    `<tier>.<port>.unserved 1`, so a process-process exchanger whose heat is
    `(carried: its own process streams)` and a condenser no catalogue utility
    can serve pinned identically.  Measured before the fix: of the corpus's
    21 unallocated rows, 15 (in 13 cases) were CARRIED -- exchangers,
    heat-links, utility-stream heaters -- and 6 (in 5 cases) genuinely
    unserved.  Closed by the axis rule "put the word in the KEY": the record
    carries a typed `carried` field (`ResultRecords.H`, emitted beside
    `allocated`), the writer and reader in `bin/runTests` and
    `check_utility_allocation_pinned` all key on it (`<tier>.<port>.carried
    1`), and the 13 goldens were re-recorded with every other row proven
    identical whitespace-aside (one KPI's last printed digit flickered by
    1e-12 relative on re-record).  A carried duty that stops being carried
    now reports MISSING instead of silently passing as unserved.

11. **The model-boundary auditor explained 800 of esterification2sector's
    808 kW and could not credit the rest -- CLOSED 2026-09-03, the same
    day.**  Neither candidate the entry first named was it.  Measured by
    experiment (the root's ethylAcetate-water NRTL record made equal to
    the SEPARATION sector's, remainder 6.7e-5 kW): the flash ran with the
    SECTOR's pair (the fractal constant/ walk-up, "the data lives with the
    sector that owns it") while the auditor assembled the world with the
    ROOT's, because the walk-up rule was the flatten's own loop.  It is
    `MemberFolder.H::nearestPairBase` now, one rule with two readers, and
    the auditor hands its world the same `binaryPairsBase` the flatten
    hands the unit.  The step is credited (`accounted`, remaining 6.7e-5
    kW) and the red ENERGY BALANCE FAILED on the showcase is gone.  Record:
    `docs/design/model-boundary-energy-ledger.md`, last section.

## 5b. If you are working in a HOSTED session, read this first

### RUN THIS FIRST, before believing anything about the workspace

```
bin/curate/check_workspace_truth.py            # prove, or be told what failed
bin/curate/check_workspace_truth.py --remediate  # the safe recovery only
```

Everything below this line about recyclers, rewound trees, stale refs and
the poisoned overlay is now ENFORCED by that gate -- it runs as GATE ZERO of
every `bin/runTests` invocation, fetches origin for real (a stale
remote-tracking ref lies without a fetch), refuses a rewound HEAD with the
remedy printed, refuses the poisoned overlay by sentinel, and LISTS every
dirty tracked file so nothing is mentally filtered away.  Offline it runs
DEGRADED and says exactly what it could not prove.  What it cannot do -- the
recycler itself, the window inside a single action -- is delimited in its
own docstring; git's non-fast-forward refusal is the backstop.  The prose
below is the HISTORY of why it exists, kept as the record; the prose is not
the defence any more.  (Architectural ruling, Vitor 2026-08-15: no more
human procedures accumulated here for a failure class a tool can refuse.)


### The command doctrine (Vítor, 2026-08-15): one commander, seven generals

**THE SEVEN GENERALS ARE NAMED BY THEIR TERRITORY (Vítor, 2026-09-07).**  A
general is a subagent dispatched with a written brief; it owns the tree while
it works and reports to the commander.  The roster:

| general | territory |
|---|---|
| `THERMO`  | the thermophysical package, speciation, electrolytes |
| `UNITS`   | unit operations — reactors, columns, membranes, dryers |
| `DESIGN`  | sizing, costing, the specification sheets |
| `GUI`     | the browser application |
| `DATA`    | the catalogue, curation, licences |
| `DOCS`    | the guides, the tutorials, the design records |
| `HARNESS` | `bin/runTests`, the gates, validation |

**The name IS the territory, and that was the ruling.**  A first draft gave
them personal names from the discipline (GIBBS, DANCKWERTS, GUTHRIE, …) and
Vítor replaced them within the hour — for the reason this project applies to
its own code: a personal name needs a lookup table before anyone knows what it
governs, which is a second home for a fact the name could carry itself.  It
was paid for immediately: he asked *"de quem estás a falar?"* about a general
named DEMING that existed only in one session's memory.  `HARNESS` needs no
table.

Two rules that go with the roster: **resume a general to BUILD, spawn a fresh
one to AUDIT** (a builder that reviews its own work reviews its own
assumptions), and **one general owns the tree at a time**.


The assistant working this repository is the COMMANDER of a fleet of
subagents, and is expected to USE it -- ordered after a session in which the
corpus-wide confirmation was fed to a fragile container one chunk at a time
when it was embarrassingly parallel by directory.  The doctrine:

* **Delegate whenever it makes sense** -- work that is parallel by
  construction (disjoint tutorial chunks, read-only censuses, independent
  forensic investigations) goes to generals; work that is a CHAIN (each
  measurement changing the next question) stays with the commander.  Do not
  spawn agents to perform initiative; do not serialise work to perform
  caution.
* **The tree is a shared resource.**  Generals get written rules: no `make`,
  no git mutation, no edits, disjoint write territories (their own case
  dirs), and a standing order to STOP and report verbatim if
  `check_build_fresh` aborts -- never to "fix" it.
* **NO YES-MEN (the load-bearing clause).**  A general reports OBSERVED
  output -- the `[chunk]` lines, the verdict line, the first error lines of
  any failure -- never a summary of success.  The commander re-verifies any
  surprising claim against primary output before acting on it, exactly as
  with gates: a subordinate's green is testimony, not evidence.  Generals
  are told to report what they saw even when it contradicts what the
  commander expected -- ESPECIALLY then; a fleet that optimises for pleasing
  reports is worse than no fleet, because it manufactures confidence at
  scale.
* The commander stays severe with itself: the session record shows the
  commander's own asserted-before-measured errors were caught by checking
  balances, not magnitudes.  The same standard applies to what the fleet
  brings back.


**THE REVERTER'S SNAPSHOT CARRIES A POISONED OVERLAY (2026-08-15) -- read
this before "recovering" anything.**  This container's revert restores not
only an old HEAD (39305f90) but also five UNCOMMITTED modifications under
`src/propertyOps/` (+74 lines, EvidencePartition R5 and its call sites).
They look like lost work.  **They are a STALE PRE-COMMIT DRAFT of R5, which
SHIPPED on 2026-08-11 in a finished form that deliberately differs from the
draft** -- the shipped header's own note says "what it turned into is not
what the plan said".  A commander who "recovers" the overlay regresses
shipped work to its draft under a false provenance; it was attempted on
2026-08-15 and only a refused non-fast-forward push (plus the reverter
itself sweeping the rewound objects) kept it off origin.  The rule that
survives: **git diff the overlay against ORIGIN'S TIP, not against the
rewound HEAD, before believing it is unshipped** -- the rewound HEAD makes a
draft of shipped work look like new work.  Discard with
`git checkout -- src/propertyOps/`.

**The checkout can silently revert to an older commit.**  It happened five
times in one session on 2026-07-31, always to the same commit, and it is worth
knowing that it is NOT git and NOT this repository misbehaving.

The cause: an ephemeral container (Claude Code on the web, a CI runner) can be
restarted and its disk restored from the snapshot taken when the environment
was created.  The checkout then reverts to whatever was HEAD at snapshot time,
and so do the working tree, `/tmp`, the build directory, and `.git` itself.

It does not look like a git operation because it is not one.  A `git reset`
always leaves a reflog entry; after a restore the **reflog has a gap** where
the lost work used to be.  That, plus a machine uptime shorter than the
working day and every file's mtime equal to the moment of recovery, is the
fingerprint.

    bin/checkWorkspace          # one second: behind? unpushed? uncommitted?

**The remote is the only durable store.**  So the rule is: *commit and push as
soon as a change builds*, not once the whole verification is finished.  A
suite run is worth less than a pushed commit -- it can be repeated, and the
work cannot.  Recovery is one line, and `checkWorkspace` prints it:

    git fetch origin <branch> && git reset --hard origin/<branch>

Nothing in this repository can prevent it; the point of the script is to make
the loss visible in a second instead of surfacing later as a confusing failure
-- a regression suite quietly running against week-old sources, for instance,
which is exactly how it was first noticed (a case count that dropped with
nothing reported as failing).

**AND THE RULE COVERS REPORTING, NOT ONLY CODING.**  Added 2026-08-04, after
the failure it describes.  A reversion happened mid-session while answering a
question about project status; the tree silently went back three days, and the
answer -- a percent-complete table and a "6 to 10 days to finish" estimate --
was computed from it.  Two workstreams that had SHIPPED were reported as half
done, and the largest, least-confident item in the estimate (the PC-SAFT
association term, quoted at 2-4 days) had been built the previous day.  The
error surfaced only because a stop hook flagged two files that did not belong
to the session.

The reversion was not the mistake.  The mistake was answering a question about
the state of the repository without first running the check that exists for
exactly that purpose.  `bin/checkWorkspace` costs a second, and the rule is now
symmetric:

* before you WRITE code -- check, because you may be building on a stale base;
* before you SAY anything about the state of the project -- check, because a
  confident wrong status is worse than a slow one.  Percent complete, days
  remaining, "is X done", "what is left": every one of those reads the tree,
  and a reverted tree answers them all plausibly and wrongly.

## 6. How to work (the short version; full: RELEASING.md)

```bash
git checkout main
# ... work; commit as Vítor Geraldes <talentgroundlda@gmail.com>, no Co-Authored-By ...
# test by the LADDER below -- the full suite is for CLOSURE, not for every edit
bin/runTests                 # 0 FAIL at campaign closure, before main advances
git push origin main         # this also publishes www.choupo.org
```

### 6a. The testing ladder (ruled 2026-08-10 — the full regression is a confirmation, not a discovery tool)

Full statement: `docs/architecture/verification-and-validation.md` §3a.

1. **While editing** — only the directly affected tests: the touched case,
   the relevant `check_*` gates (find them in the ownership index).
2. **A coherent change closed** — the witness of the affected class
   (`bin/runTests <case>`; classes in `tutorials/WITNESSES`).
3. **A bounded slice closed** — `bin/runTests --witnesses` (all 15 classes,
   minutes), and `bin/runTests --fast` (one case per tutorial FAMILY,
   `tutorials/FASTSET`, plus four conservation gates scoped to that pass —
   15.4 s measured 2026-09-07).  The two answer different questions: the
   witnesses ask *does each execution class still traverse the architecture?*,
   the fast set asks *has any FAMILY of the corpus gone dark?*  An adsorber,
   psychrometrics or hydraulics change passes `--witnesses` untouched because
   none of those is an execution class.  `--fast` authorises no commit and
   says so in its own verdict line.
4. **Campaign closure / release TAG / genuinely cross-cutting change** — the
   full `bin/runTests`, ONCE, and IN CHUNKS (`bin/runTests <directory>`).
   `main` advances on rung 3 — see the amendment below.

**AMENDED 2026-08-14 (proposed by the architect, ratified by Vítor): the full
sweep belongs to the TAG, not to `main`.**

Rung 4 used to fire on four triggers, one of which was "`main` advances".  It
was pointing at the wrong target.  **`main` is not a release** -- it is the
development line, `Choupo-dev`; a release is an immutable TAG (CLAUDE.md 2).
Holding the development line behind a 45-minute sweep buys little and costs a
lot, and in a session whose container kills long jobs it costs everything: the
sweep was started six times on 2026-08-14 and finished once.  A run that never
finishes verifies nothing and blocks the work meanwhile.

So:

* **`main` advances on rung 3** -- `--witnesses` plus the cases each
  accumulated slice touches plus its gates.  Every slice was already verified
  at its own rung before it landed on the branch; the advance adds the class
  traversal over all fifteen execution classes.
* **The full sweep is the TAG's**, and is to be run **in chunks** --
  `bin/runTests tutorials/steady/flash` now expands a directory, so a killed
  container costs a chunk and not the hour.

**WHAT IS GIVEN UP, stated rather than glossed.**  Interactions BETWEEN slices,
and cases outside every slice's blast radius, are now caught at the tag instead
of at the advance.  That is not hypothetical: the one full sweep that did
finish, on 2026-08-14, found four real defects before `main` moved (a GUI
schema rejecting a case the engine runs, an incomplete decision index, a stale
generated doc, five dead keys).  Under the amended ladder those would have
been found at the tag.  The judgement is that finding them a few days later is
worth not losing half a session to runs that die -- and the mitigation is that
chunks make the sweep survivable, so it can be run more often, not less.

Accumulate coherent, reviewed changes on the branch between closures.
Editing `bin/runTests` itself, a `src/core/` header half the tree includes,
or the dict grammar IS cross-cutting; a doc fix, an anchor row, a new
diagnostic key is NOT.

### 6b. The impact brief (MANDATORY before a non-trivial source change)

Fill this BEFORE editing, from the operational memory — the point is to
force repository inspection and consequence prediction first, not paperwork.
Sources: `docs/architecture/ownership-index.md` (owner, contracts, gates,
witness) · `generated/codeMap.json` (`includesReverse` = compile-time blast
radius; `factories` = what name mints what type) ·
`generated/caseManifest.json` (`indices` = which cases declare the model /
unit type / op you are touching).

```
INTENDED CHANGE:
CANONICAL OWNER:                  (ownership-index row; why it is the owner)
EXPECTED FILES:
KNOWN PRODUCERS / CONSUMERS:      (index row + codeMap.includesReverse)
INVARIANTS AT RISK:               (row's Never line; global-invariants.md)
PROHIBITED DUPLICATION/FALLBACK:
APPLICABLE ADRS:                  (row's Contract line)
FOCUSED TESTS:                    (row's Gates line + touched cases)
REPRESENTATIVE WITNESS:           (row's Witness class)
POSSIBLE DOWNSTREAM EFFECTS:      (caseManifest.indices candidates)
FULL REGRESSION REQUIRED?         (yes only if cross-cutting — say why)
DEFINITION OF DONE:
```

The brief lives in the slice's design doc, task description or commit body —
wherever the slice is recorded.  **If the edit starts touching owners or
consumers the brief did not predict, STOP and update the brief** — do not
continue experimentally until the changed blast radius is understood.  A row
missing from the ownership index for the feature you are touching means the
index gets its row as part of the slice.

- **Never `git add -A`** — stage explicitly; keep run outputs and the untracked
  root coordination files (`chatGPT.md`, `HANDOFF.md`, …) and the tracked GUI
  `.cho` layout files (Vítor's) OUT of commits.
- **Goldens change only with a traceable PHYSICAL explanation** in the commit;
  structural work keeps them byte-for-byte.
- **A GUI change is only done when it renders** — a screenshot / real run, not
  just green vitest (this session's rendering bugs proved it).
- Before claiming "zero X" / "everything is Y", grep the FULL scope, not just the
  files touched.  Before writing WHY/WHO prose, cross-check standing facts.
- New feature ⇒ also the theory-guide + tutorials-guide + catalogue entry.
- Deploying the dev site / cutting a release: `RELEASING.md`.
