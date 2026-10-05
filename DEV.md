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

> **RESUMED 2026-10-03 under a standing mandate (Vítor, verbatim: "Assume a
> responsabilidade e avança sempre da forma mais razoável!  À medida que eu
> for revendo logo se corrige depois").**  Read as: the commander decides
> and acts on the open items below on its own judgement -- including the
> golden re-records whose lists were already shown (27/28-09) and the full
> regressions those integrations require under CLAUDE.md §0.4 -- and Vítor
> reviews afterwards; a decision he reverses is undone by `git revert`, so
> every integration is one revertable merge.  Architecture, pedagogy and the
> RESERVED items stay his.  The paragraph below is kept as the record of
> where the pause left things.
>
> **INTEGRATED 2026-10-03 on `claude/integrate-det2-wanghenke`, under
> Vítor's standing mandate of that day: both branches below were merged onto
> `main` 9b2f8bb67 (one merge commit each, revertable), both re-records were
> done on exactly the cases named here and MEASURED first -- D-ET2 moved 162
> rows beyond tolerance in its 10 cases (one of the 163 now sits inside
> tolerance on this base), every plant residual falling; Wang-Henke moved
> the 6 keys of its two cases and left the other 28 column cases passing
> unchanged.  Full regression on the combined branch with `main` 3d8f8f8d2
> merged in first: PASS 670 / FAIL 4 / EXPECTED-FAIL 6, the four FAILs all
> pre-existing on `main` and none reachable by either branch --
> `check_internal_states` arm (q) on 13 batch `0/internalStates` files,
> `check_sealed_corpus` on membrane19/unsteady04 (no propertyManifest),
> `check_decision_index` (two records on `main` not in the index), and
> `energy-T2:plant`, red since 2026-09-08 and now 1.0298 % against the
> 3.17 % it read before D-ET2.  Two witnesses the integrations themselves
> moved were fixed on the branch (the cp-range LOUD case, the column09
> datasheet fixture) and the derived artefacts regenerated by their tools.
> The paragraph that follows is kept as the record of the pause.**
>
> **PAUSED 2026-09-28, at Vítor's request (his weekly budget).**
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
     "os alunos precisam urgentemente disso"; DONE 2026-09-26 on the kinetic
     case, see the end of this entry; RE-MEASURED 2026-10-05).**
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
     **RE-MEASURED 2026-10-05 (C34 wave): what of C2 is still open, and
     whose.**  (1) `ammoniaStaged04_kinetic` sizes and costs its bed today
     (`check_design_sheet` arm (n) green).  (2) `ammonia03_quench_converter`
     still REFUSES `bed1 bed2 bed3` by name on every run -- verified by
     running it -- and that refusal is the case's DECLARED LESSON, not a
     defect: its three beds are `gibbsReactor`s at full equilibrium, which
     have no length scale, and its postDict argues that dividing a volume
     across them needs a rule nobody has.  Nothing of it is achievable
     without either (a) typing a volume or a space velocity per bed --
     the "invented volume" the case refuses in its own words -- or (b)
     rebuilding the converter as three kinetic `pfr` beds with three
     designSpecs on the per-bed approach (stage D's method), which is a
     new case design, not a sizer: both change what the case teaches, so
     both are VITOR's (pedagogical scope), and neither was started.  The
     tray/catalyst Guthrie wall is not on the path either way (a pfr bed
     costs its shell on the existing `vessel` set and its charge at a
     declared price).  (3) The space-velocity BASIS trap C8 recorded is
     closed under C8 the same day (`spaceVelocityBasis`), so a per-bed
     GHSV, if Vitor chooses (a), can now be declared on the basis the
     literature quotes.

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
     taken in C34 wave 2, 2026-10-05: the CLOSEST HONEST CASE is built; the
     multi-ion split ruled in C35 then unblocked the FULL wine,
     `ed09_wine_multiionic`, the same day -- see (a) below).**  He asked whether a typical wine
     electrodialysis case had been made.  Measured then: nine ED cases
     (`ed01`-`ed07`, `edbatch01`, `edbatch02`), none wine;
     `tutorials/plant/tartaricAcid` carries the chemistry and no ED.

     **WHAT ALREADY EXISTED, and the brief did not know it.**  A full wine
     case was written on 2026-09-19 and PARKED on `claude/ed08-wine-wip`
     (commit `5d274abc1`, "the wine case runs and its ion split is not
     physical"; thirteen ions, six case-local species with estimated D0).
     Its engine half shipped on main (`targetConductivityRemoval`, the D0
     provenance announcement).  RE-MEASURED on main `ff9c4b52c` by running
     that case unchanged: I = 1.4583 A, K+ demineralised 6.38 %, and H+,
     Cl-, HMal- and Mal2- removed ENTIRELY (the cap binds) -- the steady
     stack gives every counter-ion xi I N/(|z|F)
     (`ElectrodialysisStack.cpp`, the `faradaySplit` lambda), so the
     verdict of 2026-09-19 stands.  Ethanol re-measured too: declaring it
     REFUSES (`aqueousMapping: component 'ethanol' declares no aqueous
     mapping`).

     **BUILT: `tutorials/steady/electrodialysis/ed08_wine_kht_model_solution`**
     (branch `claude/c34-c4-wine-ed`, witness tier, sealed, golden of 50
     new rows, no existing row moved).  The wine REDUCED to its
     stability-determining salt, KHT in water at 15 mol/m3, on
     `EurodiaED-100P-50` + `CMX_AMX` at 3000 L/h, operated by
     `targetConductivityRemoval 0.20`.  On ONE 1:1 salt the equal Faraday
     share is exact and charge-conserving, which is why this is the closest
     composition the engine carries without the reserved defect.  Answer:
     I = 2.680 A (checkable by hand), kappa 0.1530 -> 0.1224 S/m,
     i_lim 65.7 A/m2 set by the ANION membrane (slow bitartrate),
     i/i_lim 0.082, U 7.98 V, 0.0071 kWh/m3.  Its header states what it
     ignores (ethanol -- refused, measured; every other wine ion and organic
     acid; pH and acid-base; KHT solubility and stability; water transport)
     and the provenance of every number: the stack and membrane records,
     K+ D0 from the catalogue, HTart- D0 a case-local ESTIMATE (`origin
     estimated; reviewStatus unverified;`, announced each run, no measured
     conductance read so none cited), and every operating number an
     AUTHOR-SET ASSUMPTION in those words.  T = 298.15 K on purpose: the
     conductivity divides the 25 C D0 by R T at the run temperature with no
     Stokes-Einstein correction while the limiting current applies one --
     at 25 C both read the same diffusivities.

     **WHAT A FAITHFUL WINE CASE STILL NEEDS, each Vitor's or curation:**
     (a) the MULTI-ION CURRENT SPLIT -- DONE 2026-10-05 (C35 item 1): the
     counter-ions of each membrane share its current by z D c, in the steady
     stack and the batch rig alike, and `ed09_wine_multiionic` carries
     thirteen ions (an AUTHOR-SET composition closed on sulfate; the parked
     WIP's Siren-derived numbers were not reused, because that source is not
     in the tree); (b) a NEUTRAL CO-SOLVENT
     carried through the stack's mass balance and priced into the
     solvent's viscosity/dielectric constant (ethanol refuses today);
     (c) curated, primary-cited D0 for HTart-, Tart2-, H2PO4- and species
     records for malate and lactate (curation); (d) speciation inside the
     stack, so H+/pH respond to the treatment; (e) a KHT saturation in a
     hydroalcoholic medium, so the run can say whether the removal is
     enough; (f) the kappa/D0 temperature inconsistency above (moves every
     ED golden).  Two notes: the parked WIP still uses the name `ed08` and
     must take another number if revived (it was: `ed09`); and the WIP's
     composition cites a primary (Siren et al. 2015) this session did not
     read, so neither ed08 nor ed09 uses any of its numbers.

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
     (CORRECTED 2026-10-05: "applied to this flowsheet's own throughput" was
     not measured -- 80 m3 at ammonia02's own converter inlet is 11 360
     Nm3/(m3 h), not the ~20 000 its comment said; the comment now says so
     and the number is left for Vitor, see C8.)  (RULED 2026-10-05, C35
     item 9: the case now declares `spaceVelocity 20000; spaceVelocityBasis
     normal; flowKey N_in_mol_s;` and its converter is 45.44 m3.)

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

     **BUILT 2026-09-27, and ON MAIN (equil03/equil04 are in the tree; this sentence said "not yet merged" until 2026-10-03).**  Engine:
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

**C25 (CANDIDATE, not commissioned). AN AQUEOUS PHASE IN THE GIBBS
     MINIMISER (raised 2026-09-29, Vitor: "da para por sacarose dissolvida
     em agua?").**  Measured: the element-potential minimiser prices a gas
     (ideal), an ideal Raoult liquid of the species with a vapour pressure,
     and pure solids (GibbsMethod.H:39-54, GibbsSolidPhase.cpp) -- no
     solution with dissolved solutes on a molality standard state, so a
     sugar (no vapour pressure) cannot be dissolved, and `reactionGibbs`
     accepts only idealGas | pureLiquid | pureSolid (ReactionGibbs.cpp:55).
     The aqueous machinery exists (SpeciationSolver, Davies/Pitzer, species
     records such as NH4) but is a separate solver not joined to the element
     minimisation.  Biological nitrogen fixation happens in the aqueous
     cytoplasm (NH4+, dissolved N2, CO2/HCO3-), so the gas + pure-solid
     treatment of landscape06/07 is an approximation.  ARCHITECTURE:
     Vitor's decision before any build.  Related, also unscheduled: a solid
     that must REMAIN for the atoms to close (DEV.md section 5, 2026-09-29).

**C27. ULTRAFILTRATION / MEMBRANE IN FEED-AND-BLEED (asked 2026-09-29,
     Vitor: "Podes ver se ha uma ultrafiltracao a operar em modo feed and
     bleed nos tutoriais?" -- then "Avanca").**  MEASURED before any build:
     NO ultrafiltration anywhere (no case, no `kind membrane` record, no
     schema, no flux law: the EduTools Guide itself says the engine has no
     gel-polarised law); the only feed-and-bleed in the corpus is
     `ed07_feed_and_bleed` (an ED stack, steady recycle); the membrane cases
     (`membrane01`-`17`, `diafilter01/02`) have no recycle around the module.
     Two separate gaps, in the order taken: (1) SLICE 1, a STEADY
     feed-and-bleed around a pressure-driven module (NF270, whose physics
     exists), the analogue of ed07 -- the module sees the LOOP concentration,
     not the feed's; (2) the DYNAMIC feed-and-bleed around a steady unit is
     the quasi-steady seam (#185, a-class-a-student-can-name.md section 8),
     not started; (3) a real UF needs a gel-polarisation flux law, a
     size-exclusion (MWCO) rejection and a cited `kind membrane` record --
     new physics, and data nobody may invent (a made-up citation turns
     unsourced into falsely sourced).  Vitor's to scope before (2)/(3).
     **SLICE 1 BUILT 2026-09-29:** `tutorials/steady/membranes/
     membrane18_nf_feed_and_bleed` (mixer -> NF270 module -> splitter,
     `Recycle` torn; 15 m2, 95 % recycle / 5 % bleed).  MEASURED: the module
     works at 1.81x the fresh-feed concentration, so its average flux is
     165 LMH against 213 LMH at the feed concentration (a module sized from
     the feed analysis is short of area by 1.29x); the module's R_obs
     (68.5 %, against what it is fed) is not the plant's (43.7 % against the
     fresh feed); and the loop recovers less than one pass of the same area
     (68.2 % against 75.2 % by mass) -- PHYSICS, the loop runs near the bleed
     concentration.  What the model cannot show is why a loop is used: the
     loop drives 7x the flow through the module and loses a tenth of it,
     while the single pass ends at a quarter of its inlet flow; with `k_film`
     DECLARED the single pass pays nothing for that, so the comparison
     flatters it.  CORRECTED 2026-09-29 (Opus review of the first slice): the
     first header said the 182 LMH single-pass AVERAGE was "the flux the feed
     analysis gives" and read "10 % undersized" off it (it is 1.29x), and
     blamed the whole loop penalty on the declared k_film (the penalty is
     real; the flattery of the comparator is the model's).  The single-pass
     column is the same case with `fractions ( 0.0  1.0 )`.  Two limits, both
     honest and both named in the case: (a) NO PUMP and `dP_feed_total 0` --
     the mixer takes the lowest inlet pressure, so a loop that loses a bar per
     pass has no steady state without one, and the `pump` unit refuses
     (first for want of glucose's `Vliq`, since 2026-09-29 for want of its
     `liquidHeatCapacity` -- see below); (b) the energy balance is
     UNAVAILABLE, like every glucose case (only the solid formation datum is
     on the record).  **GLUCOSE Vliq CURATED 2026-09-29 (Vitor supplied the
     paper):** `components/glucose.dat` now carries `Vliq 1.111e-4` m3/mol,
     the partial molar volume at infinite dilution, with a `provenance`
     block: Seitz, Schulte, Hall & Rhett, J. Chem. Thermodyn. 128 (2019)
     372-382, doi:10.1016/j.jct.2018.08.020, Table 3 at 0.10 MPa (110.4
     cm3/mol at 293.15 K, 113.1 at 313.15 K, u = 1.0), LINEARLY INTERPOLATED
     to 298.15 K because the paper measured no such isotherm; its Eq. (3)
     (115.2 at 298.15 K) is NOT used, the paper itself saying the data fall
     below that line under 300 K at ~0.1 MPa; cross-checked against the
     paper's own Table 4/5 (111.2-112.7 from other authors).  No golden
     moved (membrane02, landscape06 unchanged; no other case reads glucose).
     THE PUMP STILL REFUSES, one datum later: it prices the liquid enthalpy
     of the mixture for the outlet temperature, and glucose has no
     `liquidHeatCapacity` (a nonvolatile's enthalpy may not route through
     the ideal-gas reference).  MEASURED 2026-09-29 on a scratch copy with a
     placeholder Cp (never committed): with a glucose liquid Cp the pump
     RUNS (1.17 kW shaft at 9 -> 10 bar, the loop suction then sits at 9
     bar), the 1 bar pressure drop comes back, and the energy balance
     becomes AVAILABLE -- and it then shows a NEW plant first-law residual
     of 1.13 kW, 96 % of the energy exchanged: the liquid enthalpy surface
     has no v dP term (the engine announces it: only the dissipated part of
     the pump work reaches the stream), and the declared-isothermal mixer
     throws away the 0.013 K the pump adds.  So the Cp alone would put a
     fresh pinned debt into check_energy_closure; closing it needs the
     mixer's energy balance (a liquid Cp makes the adiabatic mixer possible)
     and the pump's v dP on the surface.  **THE Cp SOURCE IS LOCATED, NOT
     READ:** Kishore, Goldberg & Tewari, J. Chem. Thermodyn. 25 (1993)
     847-859, doi:10.1006/jcht.1993.1082 (apparent molar heat capacities and
     volumes of aqueous glucose, 298.15-327.01 K; the Seitz paper's ref.
     [12]); paywalled, and the open APIs elide the abstract -- a search
     engine's summary quotes a number, which is second-hand and was not
     entered.  **NEXT, Vitor's to order:** that paper (its C_p,2 at infinite
     dilution and its dC_p/dT); then the pump, the adiabatic mixer and the
     spacer-hydraulics `k_film` of membrane04 for this loop.  **Cp CURATED
     2026-09-29 (Vitor supplied Kishore 1993):** `liquidHeatCapacity` is the
     paper's Taylor series (345 +/- 4 J/(K mol) at 298.15 K, measured window
     298.15-327.01 K) and `Vliq` moved to its direct 111.99 +/- 0.10 cm3/mol.
     Re-imports HELD: the new Cp makes the glucose cases' energy balance
     available, and that exposed a defect -- **THE SPIRAL-WOUND MODULE DOES
     NOT CONSERVE ITS SOLUTE.**  The engine's own elementBalance closes C at
     99.9357 % on membrane02; every spiral-wound case loses 0.03-0.4 % of a
     solute element (measured over membrane01-18 and optim04); the module's
     `mass_closure_rel` reads 0 because the water is closed by mass and
     absorbs the loss.  nNodes 100 -> 400 -> 1600 divides it by 4 each time:
     SpiralWoundModule.cpp advances c_b and Q_b separately
     (`c_b += (J_w c_b - J_s) W dz / Q_b`), which does not conserve Q_b c_b
     to O(dz^2) per step, while the permeate accumulates W J_s dz exactly.
     Fix: advance the solute FLOW (N_s -= W J_s dz; c_b = N_s / Q_b).  It
     moves every spiral-wound golden, so the list goes to Vitor before any
     --record.  Also found, not acted on: the ADIABATIC mixer refuses glucose
     (it prices through h_pure_ig, not the formation surface the report
     uses), and the ISOTHERMAL mixer publishes no duty -- together they keep
     the pump out of membrane18 (a scratch run with the pump shows a 96 %
     first-law debt).  Engine, Vitor's.  **THE SOLUTE MARCH REPAIRED
     2026-09-29, MERGED 2026-09-30 (05c7548d8, list shown first):** the march advances
     N_s (c_b = N_s/Q_b), the module publishes `solute_closure_rel` and
     REFUSES a solute that does not close to 1e-9 beside its mass guard; every
     spiral-wound case now closes every element to round-off, and
     check_element_closure loses THIRTEEN membrane pins (the softener
     membrane08 stays, not a leak; extract01/02 stay, undiagnosed).
     membrane18 was pinned NOWHERE and had turned check_element_closure red
     on main (C 0.0896 pp) the day it landed -- the gate was not run on it.
     Moves 147 golden rows in 16 cases, all one direction and small (the
     retentate is no longer diluted by the lost solute: recovery and flux
     down 0.01-0.2 %, scaling indices up to 0.6 %), re-recorded after Vitor
     saw the list; membrane05's "known issue" note (an open material
     balance) was this defect and is rewritten.  **The curated glucose is
     RE-IMPORTED into membrane02 and membrane18 (2026-09-30)**, so both now
     publish a first law: membrane02 closes at 0.0000 kW (its -0.057 kW
     was the solute leak), membrane18 at -0.039 kW, all of it on the
     isothermal MIX, which publishes no duty (so its pricing is not audited
     against a declared heat); boundary rows appended, none moved.  STILL
     OPEN, engine, Vitor's: the two mixer gaps above.  And the sucrose record's own
     `Vliq` (2.115e-4) still carries no citation.  Also open and separate:
     the quasi-steady seam for a DYNAMIC loop (#185); a real UF (flux law,
     MWCO rejection, a cited record).
     **COMMISSIONED 2026-09-30 (Vitor: "Eu queria mesmo era fazer isto" --
     the UF and the dynamic feed-and-bleed; the commander had read "termina
     isto tudo" as the pending approvals only).  His three rulings, taken
     by question the same turn:** (a) #185 is a GENERIC ADAPTER --
     `type quasiSteady;` in choupoSemiContinuous wraps any steady unit
     declared inside it, solved at each accepted step on that instant's
     inlets, with NO inventory of its own (the accumulation is the tank's),
     announced on the run; (b) the UF flux law is GEL POLARISATION
     (Michaels/Blatt, J = k ln(c_g/c_b), declared c_g, the pressure-
     independent plateau); (c) the UF rejection is a DECLARED sieving
     coefficient for now, no MWCO model, the case saying it is a
     hypothesis.  Order: the adapter (with NF270, whose physics exists),
     then the UF law, then a UF feed-and-bleed transient witness.
     **SLICE 1 BUILT 2026-09-30 -- the quasi-steady seam (#185):**
     `QuasiSteadyUnit` (src/unitOperations/dynamic/) wraps any steady unit
     and re-solves it on its inlets at every accepted state; the steady
     injection moved VERBATIM out of Flowsheet.cpp's anonymous namespace
     into `flowsheet/UnitInputs.{H,cpp}` (the second caller arrived), so a
     unit reads the same dict in both binaries; the dynamic driver routes
     PORTS, solves the algebraic units in topological order within the
     instant, and REFUSES a loop with no vessel on it; the dynamic binaries
     now register the steady factories and the asset catalogues.  Witness
     `tutorials/unsteady/unsteady03_nf_feed_and_bleed_startup` (the start-up
     of membrane18's loop, 1 m3 tank): it ENDS on membrane18's steady
     answer to 3e-6 (flux, rejection, permeate, bleed), e-folding ~1340 s.
     Gate `check_quasi_steady` (anchor, step convergence, four refusals;
     one by-hand sabotage -- the no-vessel refusal disabled -- caught: the
     loop then ran to exit 0 in silence).  MEASURED, against the
     expectation written into the gate's first draft: the mass residual is
     SECOND order in deltaT (ratio 0.257), not the first-order route lag the
     driver's NOTE names -- recorded, not tuned.  Not done: the first law
     across a quasiSteady unit (withheld by the run), a pump in the loop,
     drawing the wrapped unit's own symbol on the canvas (a QS box today).
     Found and NOT fixed (pre-existing on main): check_decision_index is
     red on two design records it does not index
     (binary-pairs-from-open-measurements.md, the-44-tool-review-triage.md).
     **SLICE 2 BUILT 2026-09-30 -- UF by gel polarisation:** `transport
     gelPolarisation` (membrane/transport/GelPolarisation.{H,cpp}; its
     parameters in `transportParameters { gel {} }`, the block the batch
     diafilter already hands its law); `kind UF` accepted.  Witness
     `membrane19_uf_gel_polarisation` (BSA from its UniProt sequence; the
     membrane, c_g, S and k HYPOTHETICAL and labelled); gate
     `check_uf_gel` (closed form per node, plateau, pressure regime,
     Michaels at S = 0, four refusals; one by-hand sabotage caught).  The
     batch-membrane EduTool's two absence claims (the gel law; no
     feed-and-bleed loop, which slice 1 had already falsified and missed)
     corrected.  **SLICE 2b, the tank:** `dynamicCSTR` may declare
     `energy isothermal;` (5b05131e5) -- BSA has no heat capacity, so the
     UF loop's tank needs it.  **SLICE 3 BUILT 2026-09-30, after C28 so it
     was born in the ratified layout:** `unsteady04_uf_feed_and_bleed_
     startup` -- membrane19's module in a feed-and-bleed loop under
     choupoSemiContinuous (isothermal 0.5 m3 tank, 20 % bleed): the mean
     flux falls 12.7 % from start-up (119 -> 104 LMH) as the tank goes from
     10 to 15.3 kg/m3, e-folding ~2500 s, and at 6 h the protein leaving
     (read from the <t>/ stream files) equals the protein fed to 7e-5;
     check_uf_gel arm (g) holds all three.  C27 is COMPLETE: the steady
     loop (membrane18), the dynamic loop (unsteady03), the UF law
     (membrane19) and the UF loop in time (unsteady04).

**C38. THE RESERVED ITEMS, TAKEN (Vítor, 2026-10-05, verbatim: "Não quero que
deixes comigo!!!! Faz tu!", answering the commander's list of what stayed
reserved for him).**  The commander takes them, each one revertable merge:
  1. TRAY COST: a published tray correlation (Turton's sieve/valve tray set
     and its quantity factor) is added to the costing model ONLY with every
     coefficient transcribed from a source the general actually reads and
     cites; if no such source is readable, the refusal stays and the reason
     is recorded -- an invented set is never shipped.
  2. THE COSTING MODEL'S NAME: registered `Guthrie` while every coefficient is
     Turton's.  Renamed to what it is (`Turton`), the corpus migrated in one
     pass, the old word REFUSED by name naming the new one (no dual reader).
  3. Vítor's deck `docs/slides/farelo_choupo.tex` (C7 class B): its three
     product names replaced by neutral descriptions like the other records,
     its pin dropped from `check_doctrine`.  **DONE 2026-10-05:** the 1976
     MIT project, the 1981 company and the products of the proprietary era
     are described by what they were (dates, the DOE funding, the 2002
     consolidation and the talk's argument unchanged; the acquired rival's
     name and the other vendors' names went with them, since the ban list is
     eight words and the ruling is not); the PDF rebuilt with
     `pdflatex` (no Makefile rule builds the deck; its header names the
     command); the pin ledger went from 5 sites in 2 files to 2 in 1, only
     class C left.
  4. Catalyst beds: the bed shell is costed on the vessel set and the charge
     on its declared price since C2; no further reserved decision remains.
Status: dispatched 2026-10-05.

**C37. THE C35/C36 LOOSE ENDS (Vítor, 2026-10-05, verbatim: "Trata tu disso
o melhor que souberes", answering the commander's list of six).**  Each lands
as one revertable merge with its moved rows listed:
  1. `flashState::resolvedInletVaporFraction` honours a pinned pure two-phase
     inlet for EVERY caller (today only heatExchanger/heater/phaseChanger read
     the pin first).
  2. `bin/choupo-import` re-seals heatExchanger01 and heatExchanger03 (its
     agreement check drops the `utility <hx> heating.-.carried` row).
  3. `solidDryer` gets an exhaust-saturation limit (a fog is no longer
     published as vf = 1); the stale Theory Guide sentence on its X_final.
  4. A `phaseSet VLLE` feed PRODUCED by another unit: report and producer read
     it the same way.
  5. The C36 #1 saturation refusal reaches a unit's own `thermo {}` world and
     the time-integrated binaries' authored inlets.
  6. Stale file:line citations (what-water-dat-does-not-say.md, the C33
     table), condenser01's "saturated vapour" header, `gateManifest` claims.
Status: dispatched 2026-10-05.

**C36. "AVANÇA COMO ACHARES MELHOR" (Vítor, 2026-10-05, verbatim, answering
the C35 close-out report and its open list).**  The commander takes the open
items of that list on its stated recommendations, each one revertable merge
with its moved golden rows listed:
  1. A PURE undeclared stream within a narrow band of its own saturation
     temperature is REFUSED by name, asking for `phase liquid;`/`phase gas;`
     (the C35 #4 finding: such a stream was classified by the last digits of
     T).  The band is measured on the corpus first; a corpus stream inside it
     is fixed by declaring what its case means, never by widening the band
     silently.
     [BUILT 2026-10-05 on branch `claude/c36-saturation-band` (not merged;
     the full regression it needs is NOT yet authorised).  The rule:
     `flashState::undeterminedSaturationRefusal` (StreamEquilibrium.H,
     beside `equilibriumAt`), applied ONCE in `Flowsheet::solve` where the
     authored inlets are stamped (the stamp moved above the lint seam, so
     `choupo-lint` raises it).  THE BAND is the numerics: |ln K| <= the
     flash's own tolerance (`FlashOptions::tolerance`, 1e-8) -- inside it
     |RR(V)| <= ~|ln K| for every V, so every vapour fraction meets the
     resolving flash's own convergence criterion; ~3e-7 K for water at
     392 K.  MEASURED on the corpus first (an instrumented build over the
     262 choupoSolve cases): 46 authored, unpinned, pure streams; the
     nearest is `reboiler_water_copper`'s feed at |ln K| = 3.4e-3 (0.093 K
     subcooled), then `condenser01_film_nusselt`'s steam at 2.4e-2 (0.67 K
     superheated, its header says "saturated vapour"); NONE inside the band,
     no case edited, no golden moved.  So any band up to ~1e-3 in |ln K|
     (~0.03 K for water) would also reach no corpus case -- a wider band is a
     modelling judgement, not taken.  The C35 fixture value itself,
     392.1781136 K, sits at |ln K| = 9.18e-9 against the package's own
     Tsat(200 kPa) = 392.1781133 K: inside, but at 0.92 of the band -- a
     seven-decimal Tsat typed by hand is only just caught.  Gate:
     `check_overspecified_stream` arm (g) (bisects a pure feed on the
     engine's own vf until a run refuses; (g2) declared runs; (g3) a mixture
     at its bubble point untouched).  NOT covered, said: a unit's own
     `thermo {}` world (checked in the global one) and the time-integrated
     binaries (their driver stamps no authored inlet).  Record:
     docs/design/a-stream-is-fixed-by-two-variables.md §9.]
     FULL REGRESSION AUTHORISED by Vítor 2026-10-05 ("Avança", answering the
     commander's request with its §0.4 reason): the rule runs in
     `Flowsheet::solve` on every choupoSolve case and asks the global
     package for K on every pure authored inlet, a side effect only the
     full sweep can rule out.
  2. ED counter-ion share stays z_i D_i c_i (Eqs. 12/13, already built).
  3. heatExchanger publishes a single-component two-phase outlet at Tsat with
     its vapour fraction pinned (the pure-component exception of the
     two-variables rule); heater and phaseChanger checked for the same shape.
     [BUILT 2026-10-05 on `claude/c36-pure-twophase-outlet`: the exchanger
     and the heater (which had the shape, and failed to converge on it);
     phaseChanger pins too and had a different defect (§5, same day), fixed
     in a separate commit whose 16 moved rows await Vitor.  §5, 2026-10-05, HEAT
     EXCHANGER -- CLOSED.]
  4. The steady ED stack's Nernst term uses each ion's own |z| (ed04's Mg2+).
     [BUILT 2026-10-05 on `claude/c36-nernst-fastarm`.  ONE home,
     `edCell::membranePotential` (EDCell.cpp): one counter-ion in the
     diluate -> `electrochem::nernst` at its own |z| (the single-salt
     arithmetic, bit for bit); several -> `meanNernstPotential`.  The stack
     (ElectrodialysisStack.cpp, the `E_cem`/`E_aem` lines) and the batch rig
     both ask it; neither calls the Nernst equation itself.  MEASURED: NO
     corpus row moves -- every ED log and result JSON is byte-identical
     except ed04's console `AEM -0.00000` -> `0.00000` (a signed zero, no
     golden reads it).  The premise "ed04 moves" was false: ed04's
     concentrate inlets carry the diluate's own composition, so E_mem = 0
     at any |z| (its README says so); ed09's concentrate holds only K+ and
     HTart-, so every ion present in both channels is monovalent.  Gate
     `check_ed_stack` arm (i) therefore BUILDS a divalent twin of ed04
     (ED1's concentrate at 3x) where the old arithmetic gives 0.04438 V
     against 0.02870 V, and recomputes E_mem_pair on 15 units;
     `check_ed_batch` (g) holds the one home on the source.]
  5. `--fast`'s mass-closure atom arm judges only in-scope witnesses (it read
     leftover run outputs).
     [BUILT 2026-10-05 on `claude/c36-nernst-fastarm`, BOTH remedies, and
     why both: `check_mass_closure`'s atom arm now reads only the plants RUN
     IN THIS PASS, and only through report files that pass's stdout names
     (`[report] elementBalance -> <path>`, or `-> UNAVAILABLE`, which writes
     the header-only table); a file on disk the run did not name is a
     leftover, set aside and COUNTED in the claim; under the fast scope with
     nothing to judge the claim says NOT JUDGED IN THIS SCOPE.  That is the
     fix -- even with a witness in FASTSET, the old glob would still have
     judged other plants' leftovers.  And `ammonia02_full_plant` is back in
     FASTSET: its exclusion said it EXPIRED the day its goldens were
     re-recorded, which happened 2026-09-14 (b9a61948a); it passes and runs
     in 0.1-0.2 s, so the fast tier JUDGES the arm instead of only saying it
     did not.  MEASURED on a worktree with every tutorials/ run output
     removed: `--fast` PASS 68 / FAIL 0, the arm "judged on 1 plant";
     standalone full scope: 240 steady cases, the arm judged on 2 plants
     (ammonia02, ammonia03).  Sabotages S8/S9 in the gate's docstring.]
Vítor's own deck stays his.  Status: dispatched 2026-10-05.

**C35. THE SIXTEEN DECISIONS (Vítor, 2026-10-05, verbatim: "Decide as 16
como recomendaste e autorizo a regressão completa do #4.").**  The commander
had listed 16 open decisions with a recommendation each; Vítor ruled that
each recommendation stands, and authorised the full regression item 4 needs.
Each lands as ONE revertable merge with its moved golden rows listed.
  1. ED multi-ion split: the counter-ion current is shared by conductivity
     share z_i D_i c_i (no new parameter); the full wine case follows.
  2. D1: the column reads its feed by the feed's own equilibrium; column03
     and acetone07 are corrected to declare what they mean.  [BUILT
     2026-10-05 on branch `claude/c35-d1-column-feed`; see §4d D1, now
     CLOSED, and the C33 table's column row.]
  3. Evaporator latent: the duty's latent heat is the enthalpy difference
     the energy report prices, not the Watson correlation.  DONE 2026-10-05
     on `claude/c35-evaporator-latent` (not merged): every evaporator row
     closes against the report, eight `check_energy_closure` pins removed,
     `energy-T2:plant` green; the evaporator-chest half of 4d D1 taken (see
     there: still refused on corpus packages, for a flash cause named --
     that cause, the phase test's 0/0 on a zero nonvolatile, was removed on
     `claude/c35-shared-path` with item 4's regression, and a superheated
     chest now runs on every package).
  4. An unpinned feed to a `phaseSet VLLE` unit means its three-phase
     equilibrium, in the unit AND the energy report (full regression
     AUTHORISED by Vítor for this item).
     [BUILT 2026-10-05 on branch `claude/c35-shared-path`.  ONE search, one
     parse: `IsothermalFlash::readOptions` is the unit's option parse
     (extracted verbatim from `solve()`), and
     `IsothermalFlash::inletEquilibriumOptions` returns the search the unit
     resolves its feed with when it is richer than vapour-liquid (phase set
     VLLE, or `auto` resolving to it), nothing otherwise.  The flowsheet
     stamps every stream such a unit consumes with that unit's dict
     (`ProcessStream::equilibriumConsumer`, after the solve, because a
     produced stream is replaced on every pass), and every reader that
     resolves the stream goes through `flashState::consumerRecipe`, i.e.
     the unit's own call: the energy report (`reporting::streamSplit`), the
     surface pass that sets the stream table's vf and H (`Flowsheet.cpp`),
     and the unit's duty (`priceState`'s new `recipe` argument).  A
     three-phase or two-liquid answer is priced port by port through the
     one unpacking (`vllePorts`, moved to `IsothermalFlash.H`) inside
     `flashState::hOfState`, and `isSplit` / `vapourFractionOf` read a
     resolved state of any kind (`V_over_F` is the alpha LIQUID fraction of
     a three-phase answer).  MEASURED, vlle03's datum fixture
     (check_vlle_fallback arm (e2)): duty 186.481786 kW -> 0, plant residual
     1e-13 kW both before and after (they agreed on the wrong state), the
     feed's published vf 0 -> 0.185797 = the unit's beta_vapor.  Gate:
     `check_vlle_fallback` arm (e3).  Moved rows: listed in the commit.
     NOT covered, said: a VLLE feed that ANOTHER unit produced is resolved
     with the consumer's search by the report while its producer priced it
     vapour-liquid (no corpus case has one).]
     THE FULL REGRESSION (CLAUDE.md §0.4 reason, written before launch,
     2026-10-05): WHAT CHANGED since the last validation of `main`
     (2a403aac0) is three edits on shared paths, run ONCE on their
     combination: (1) item 4 -- `flashState::equilibriumAt` /
     `twoPhaseSplit` / `hOfState` / `priceState`, `reporting::streamSplit`
     and the flowsheet's post-solve surface pass, which EVERY steady case's
     stream table and energy report go through; (2) 4d D1 multi-feed --
     `EnergyBalanceReport`'s internal-exchanger test, which every case with
     an energy report goes through; (3) 4d D1 chest -- `IsothermalFlash`'s
     Rachford-Rice and phase test (and `DewPoint`'s sum), which every
     vapour-liquid flash in every unit goes through.  WHY TARGETED CHECKS ARE
     NOT ENOUGH: each edit claims "identical where defined" for every case
     but its witnesses, and only the whole corpus can test that claim; the
     targeted runs (vlle03/04, column01/04/05/08, coolingTower01, mheatx01,
     the chest fixtures) cover the witnesses alone.  Authorised by Vítor
     (C35, verbatim above).
     RESULT (one run, on the combination of this branch's three item commits):
     PASS 674 / FAIL 15 / KNOWN-BROKEN 0 / EXPECTED-FAIL 6.  The 15:
     SIX goldens -- column04/05/08 (the internal-exchanger fix), vlle04
     (this item: its feed now priced on the unit's own two-liquid state,
     H_feeds -5627.62926632 -> -5627.61678644 kW, residual -0.0124798850247
     -> 0; the 0.0125 kW was the LL fallback's material imbalance priced
     between a VL-resolved feed and the outlets, and stays in the mass
     balance), utility01 (recorded) and utility02 (re-specified at 48 bar,
     every row then reproduced; see §4d D1); FOUR gates this slice moved and fixed -- code-map (regenerated),
     gui-tests (two lesson citations into Flowsheet.cpp shifted +46 lines
     and re-pointed by measurement), cp-range and convective-dryer (witness
     and probe, see §4d D1); FIVE gates RED ON 2a403aac0 TOO, each re-run
     on an untouched build of that commit and failing identically --
     problem-divergence (A1/A4), time-state-layout (c), theory-bibliography,
     origin-census, props-ops-reference -- not this slice's.  After the
     fixes: the six cases' rows, the four gates and `bin/runTests --gui`
     (27/0) pass; rows that moved only at round-off (column04's T profile at
     ~1e-10) were NOT re-recorded.
  5. A pair used outside its validity span is ANNOUNCED, as vapour pressure is.
     [DONE 2026-10-05, branch `claude/c35-pairs-pipe`.  `PairSpanGuard`
     (`src/thermo/PairAudit.H`, beside the ONE parser that reads the span):
     NRTL, UNIQUAC and Wilson copy each pair RECORD's declared temperature
     span at construction and check it at `gamma(T, x)`; a pair whose two
     components are both present, evaluated outside its span, raises ONE
     `validity` advisory through `addAnnouncedOnce` (key per pair, so once
     per pair per run; the console line `[pair-span] NRTL pair i-j: used at
     T = ... K, BELOW|ABOVE its declared validity span (lo hi K) by ... K`),
     reaching the end-of-run caveat block.  Mirrors the Henry pair's Trange
     (`HenrysLaw.cpp:136`) and the vapour-pressure window
     (`VaporPressureModel.cpp:161`).  No number moved: the 54 cases that
     declare NRTL/UNIQUAC/Wilson (or carry their pair files) PASS 54/0, no
     golden row moved.  Twelve of them now announce: flash21 (ethanol-water
     at 258 K), crystalliser09 (278 K), vlle04 (cyclohexane-ethanol at
     365 K) and the nine curation cases (their held-out bubble scans walk
     0.4-11.6 K above the FIT span -- true, and now said).  NOT guarded:
     INLINE pairs (no provenance, so no span), and an infinite-dilution
     gamma of an absent component.  Gate: `check_regressed_pairs` arm (g)
     (the three water pairs below their spans announce once, into the
     advisories, say nothing inside, and publish the same gammas as a
     span-less inline twin); sabotages by hand, each restored with git +
     `make all`: S1 (the `gamma()` check removed) caught on all three pairs
     -- no line, no advisory; S2 (the once-per-run latch dropped, the line
     printed on every raise) caught on all three -- two lines each.]
  6. Ethanol + cyclohexane: re-regressed against LLE data if the archive has
     them; otherwise it stays case-local, recorded.
     [DONE 2026-10-05, branch `claude/c35-pairs-pipe`: the archive has
     none.  19 binary ethanol + cyclohexane blocks in ThermoML.v2020-09-30
     (joined by InChIKey), all of ONE liquid; the only two-liquid blocks
     naming both are ternaries whose second liquid is the third
     component's.  The pair stays case-local in curate12, unpromoted; no
     constraint invented, no case or golden touched.  Detail in C16.]
  7. Dryer solid floor: the gas wet-bulb temperature, not the feed T.
     [DONE 2026-10-05, branch `claude/c35-dryer-floor`.  MEASURED first:
     the units that floored their solid at its feed T were exactly two,
     `evaporativeDryer` (EvaporativeDryer.cpp, the old `Tout_for` returned
     `T_w` and `water_pay` was read at `T_w`) and `solidDryer`
     (SolidDryer.cpp, `energyLimited` judged and the bisection run at
     `T_w`, the Newton's `o.lower = T_w`); `sprayDryer` already floors at
     its droplet's wet bulb and `convectiveDryer` and `batchDryer` hold the
     solid at the local wet bulb.  Both now read
     `psychrometry::gasWetBulb` (Psychrometry.H, NEW: the dry carrier's
     molar mass and humid heat at the gas's own T, then the shared
     `wetBulb`; a carrier with no ideal-gas Cp refuses by name), publish it
     as KPI `T_wetbulb`, name it in the energy WARNING, and REFUSE by name a
     gas that cannot bring a cold solid up to it even evaporating nothing.
     `wetBulb` itself no longer asks a vapour pressure above the moisture's
     Tc (a 950 K flue gas): the 0.95 P search starts just below Tc --
     every answer below Tc unchanged.  RIDING WITH IT, item 11's engine
     finding: the evaporative dryer's outlet is now the FIRST root above the
     floor (a 400-step scan, then bisection to 1e-9 K), bracketed below
     water's Tc; no root there refuses by name.  The two COULD NOT ship
     apart: with the floor at the 346.30 K wet bulb the old bisection's
     first midpoint on the lithium plant's 950.58 K gas is 648 K, so even
     the DESIGNED dryer (5 % margin) landed on the spurious root (652.68 K,
     sabotage S2).  The +20 % margin now returns 446.56 K (was 672.28 K).
     `priceState` was NOT taken: C26 recorded the corpus would refuse, and
     the scan is the smaller change.  GOLDENS: evapDryer02 moved 10 rows,
     ONE reason -- its wet solid is fed at 298.15 K, BELOW the gas's
     311.68 K wet bulb, and its old answer (T_out 310.73 K) left the solid
     below that wet bulb; at the floor the gas pays for 36.75 kg/h, less
     than the 37.6 kg/h the cap allowed, so it is now HEAT-bound:
     drySolid.F 0.00914216942312 -> 0.00915552191059, humidExhaust.F
     0.0118300527991 -> 0.0118167003116, T_out / drySolid.T /
     humidExhaust.T 310.725305009 -> 311.677565845, X_final 0.199012881389
     -> 0.199753779936, drySolid_flow 0.389279515491 -> 0.389520060553,
     exhaust_humidity 0.949998302456 -> 0.886447295542, moisture_pct_wb
     16.5980603276 -> 16.6495645421, water_removed 0.0104496511758 ->
     0.0102091061141.  Appended (no row moved): `T_wetbulb` on
     evapDryer02 (311.677565845), evapDryer01 (308.892481017) and
     solidDryer01 (315.705897235).  Every other dryer golden passes
     unmoved: evapDryer01 and the lithium plant move inside tolerance only
     (T_out 360.675490975 -> 360.675531553 and 385.328291845 ->
     385.328309993 K, the old 1e-4 K bisection against the new 1e-9 K
     one); solidDryer01, convDryer01, sprayDryer01-07 and the flagship are
     byte-identical but for the new KPI (their dryers reach their answer
     above the floor).  `sugarPlantEconomicsSweep` (no golden): its BD was
     energy-limited at the feed T on every sweep point and now reaches its
     isotherm at ~321 K, between the air's wet bulb and the feed T.
     **OPEN, VITOR'S:** evapDryer02 was renamed `_saturation_limited` this
     morning (item 12) for a wall the new floor removes; its header and
     description now say so.  Rename it back, or feed its wet solid warm
     (at 330 K it meets the cap again: 314.5 K, 49.0 kg/h carried, 51.6
     payable -- gate arm (a') runs exactly that), is his.  A reading that
     would have kept it unmoved -- floor = min(T_w, T_wb), a cold solid
     allowed to stay cold -- was NOT taken: the ruling says the wet bulb.
     **FOUND, NOT FIXED:** the solid dryer has NO exhaust-saturation limit
     and prices an exhaust its evaporation supersaturates at its
     condensed equilibrium (a fog published as vf = 1) -- e.g.
     solidDryer01 with its air cut to 100 kmol/h still reaches the
     isotherm at 318.6 K; that is what lets its warm-fed cases stay above
     the new floor.  Gate `check_evaporative_dryer` extended: (a) the
     corpus limits, (a') the saturation fixture, (b) the evaporation affine
     in the gas at the floor (second difference to 1e-9), (c) the default,
     (d) the floor recomputed from each case's own records (Antoine,
     Watson, the Cp polynomials) to 1e-6 K and independent of the feed T,
     (e) the +20 % lithium gas below its inlet T and Tc, (f) the solid
     dryer's floor on a cold, starved fixture; three by-hand sabotages, all
     caught (S1 feed floor -> (a), S2 old bisection -> (a), S3 solid feed
     floor -> (f)).]
  8. Pipe with a vapour inlet: REFUSED by name until a compressible model exists.
     [DONE 2026-10-05, branch `claude/c35-pairs-pipe`.  MEASURED first: the
     corpus has three pipes and none carries vapour -- pipe01_water_line and
     pumpSystem01_operating_point resolve liquid (they take the
     single-phase path, `regime` KPI), pipe02_airwater_twophase resolves
     V/F = 0.0114 (the two-phase path).  `Pipe.cpp`, right after the
     inlet-regime flash: an inlet whose flash resolves V/F >= 1 - 1e-6 (an
     RR answer of 1, or a supercritical root discarded to the single fluid
     phase) REFUSES, naming the unit, the inlet stream (`feed.streamName`),
     its resolved V/F, (T, P) and regime, and both remedies (a liquid line
     mis-declared -> correct T, P or composition; a gas line has no model
     until a compressible pipe exists).  **A TWO-PHASE inlet is NOT
     refused**, although the brief said "(or two-phase)": the ruling's own
     words are "a vapour inlet", the pipe carries four two-phase
     correlations (homogeneous, Lockhart-Martinelli, Friedel, Beggs-Brill)
     and a witness, pipe02, which a two-phase refusal would break -- the
     brief's stop rule; if Vitor wants the two-phase line refused too (its
     correlations take both densities at the INLET, so they are
     incompressible as well), that is his to say and pipe02 goes with it.
     No golden row moved (the three pipe cases PASS 3/0).  Gate:
     `check_friction_correlations` arm (g) (pipe01 heated to 450 K at its
     5 bar must exit non-zero naming unit, inlet, V/F, REFUSED and both
     remedies; source arm: the refusal is gated on V/F reaching 1).
     Sabotages by hand, each restored with git + `make all`: S1 (the throw
     removed) -> "RAN to exit 0 -- the incompressible liquid path priced a
     gas line"; S2 (the gate widened to `VF > 1e-6`, which would refuse
     pipe02) -> caught by the source arm.]
  9. ammonia02 declares `spaceVelocity 20000; spaceVelocityBasis normal;`.
     [DONE 2026-10-05, branch `claude/c35-cases`, with `flowKey N_in_mol_s`
     (GHSV on the inlet gas, as ammoniaStaged03 declares): V_R 80 -> 45.4386
     m3, verified.  17 rows moved, each because the converter volume moved:
     the basis WORD; D 2.5701 -> 2.1284, H 15.421 -> 12.771, t_wall 0.2305
     -> 0.1916, weight 229 625 -> 130 893 (the smaller vessel at L/D 6);
     Q_gas 3.595 -> 3.931 m3/s (the flow KPI is now the inlet, 22 % more
     moles than the outlet); purchased 104 405 -> 65 253, bareModule
     21.26 M -> 11.06 M, totalModule 25.09 M -> 13.05 M EUR; and the
     appraisal through FCI: FCI 67.39 M -> 55.27 M, TCI 77.50 M -> 63.56 M,
     WC 10.11 M -> 8.29 M, COM_d 215.10 M -> 212.92 M (its FCI-proportional
     terms), NPV 78.60 M -> 103.57 M, IRR 0.2561 -> 0.3416, paybackYears
     4.958 -> 3.584.]
 10. ammonia03's beds keep refusing (their lesson); no change.
 11. lithiumBrinePlant's dryer: air raised until the product leaves dry.
     [DONE 2026-10-05, branch `claude/c35-cases`.  The burner feed
     `0/MAIN/fuelAir` (its flue gas is the drying medium) is sized by the
     dryer's own floor balance, written in that file: 8.6644 kg of water
     per kmol of gas at the floor -> minimum 206.88 kmol/h for 1792.49 kg/h
     of free water, + 5 % margin -> 217.22 kmol/h, same CH4 : O2 : N2 ratio
     (x 5.5585), so the flame T is unchanged.  Result: [complete-limited],
     X_final 0, T_out 385.33 K, a_w 0.22.  9 rows moved, all one reason
     (the gas now pays for all the water): fuelAir.F and hotAir.F 0.0108556
     -> 0.0603403 kmol/s; humidExhaust.F and cleanAir.F 0.0160766 ->
     0.0879791; product.F 0.0225568 -> 0.000138889 (the Li2CO3 alone);
     product/humidExhaust/cleanAir/fines T 363.15 -> 385.328 K (off the
     floor).  hotAir.T drifted 1.7e-6 relative and was NOT re-pinned.
     **ENGINE FINDING, FIXED with item 7 (branch
     `claude/c35-dryer-floor`; the +20 % gas now returns 446.56 K):** a 20 %
     margin was tried first and the unit returned T_out = 672.28 K, ABOVE
     water's critical point -- its hand balance (Watson latent -> 0 at
     647 K, the free water warmed as a liquid at a constant cp) has a
     second, spurious root there, and the bisection's first midpoint
     (~657 K) sends it into that half whenever the gas is large enough.
     `check_evaporative_dryer` (a) now refuses a lithium T_out at or above
     647.096 K (sabotage at 20 %: caught).  Whose fix: the unit's.]
 12. evapDryer02 renamed for what binds it (exhaust saturation).  [DONE
     2026-10-05, branch `claude/c35-cases`:
     a "saturation-limited" name (that day only); FASTSET,
     check_evaporative_dryer, caseManifest and the Tutorials Guide follow;
     no GUI test or doc outside DEV.md named it; no golden row moved.
     RENAMED BACK the same day to `evapDryer02_energy_limited`: item 7's
     wet-bulb floor made the case heat-bound at its floor again, and it is
     the corpus's only energy-limited dryer case.]
 13. convDryer01's two round-off residual rows removed.  [DONE 2026-10-05,
     branch `claude/c35-cases`: `kpi co energyResidual_kW 1.08e-7` and
     `kpi counter energyResidual_kW -4.87e-10` deleted by hand, the reason
     left as a comment in `expected`; `check_convective_dryer` (a) still
     holds |r| <= 1e-3 kW absolutely.]
 14. The published git history is NOT rewritten; DEV.md C7 aligned with the
     ruling record.  [DONE 2026-10-05, branch `claude/c35-cases`: C7's two
     "his to take" sentences now record the rejection.]
 15. The two archive stubs are deleted.  [DONE 2026-10-05, branch
     `claude/c35-cases`: no in-tree link reached them; check_doctrine reads
     content, not names, so its ledger is unchanged.]
 16. Vítor's own deck stays his.
Status: dispatched 2026-10-05.
(item 1) DONE 2026-10-05 on `claude/c35-ed-split`, not merged: the split has
ONE home, `edCell::counterIonRates` (instantaneous, the batch rig) and
`edCell::counterIonPassTransfer` (the same rule integrated in closed form
along a pass, the steady stack); each membrane moves xi I N / F equivalents;
a membrane with one counter-ion keeps the old expression bit for bit (every
single-salt result JSON byte-identical against a build of the parent).  The
batch rig's multi-ionic refusal is lifted.  Moved: ed04's 12 outlet-flow rows
(2.5e-6 to 3.9e-6 relative, inside their 1e-4 band; re-recorded, listed in
the commit) + 48 new split KPI rows.  New witnesses `edbatch03_multiionic_split`
and `ed09_wine_multiionic` (the full wine, author-set composition, ethanol
still refuses).  Gates: `check_ed_stack` (h), `check_ed_batch` (j).  FLAGGED
for Vitor: the ruling's WORDS say "conductivity share", its FORMULA z D c;
the formula was built (= the paper's Eqs. 12/13); the conductivity share
proper is z^2 D c and differs only between counter-ions of different
valence on one membrane (ed04 ED1: Cl 4.52 % / SO4 2.39 % removed under
z D c, 3.38 % / 3.53 % under z^2 D c).  Found, not fixed: the steady stack's
Nernst term takes |z| = 1 for every ion (wrong for ed04's Mg2+; moves ed04's
voltage, not this rule).  [CLOSED by C36 item 4, 2026-10-05 -- and the
"moves ed04's voltage" half was wrong: ed04's E_mem is zero at any |z|,
and no corpus row moved.]

**C34. "AVANÇA COM TUDO" (Vítor, 2026-10-04, after the month summary).**
Every open item that is NOT his to decide, taken in two waves of generals in
separate worktrees on non-overlapping files, each integrated as one
revertable merge.  Wave 1: (A) the inlet-vf family -- the dozen units C33
enumerated, the supercritical discard in pipe/valve/adiabaticFlash, a
witness and a gate arm for both; (B) the pre-existing red gates
(check_internal_states arm (q), check_sealed_corpus on membrane19/unsteady04)
and the tutorials-guide stray `)`; (C) C22's remaining text errors and C3's
per-equation citation audit.  Wave 2: C4, C8, C16 slice 2, C26 slice 2, the
unreserved parts of C2 and C7.  NOT taken, his: the tray cost set (C2), any
history rewrite (C7), the evaporator latent, acetone07/column03, §4b.
Status: wave 1 INTEGRATED 2026-10-05 -- B 88a1c6a2a (three red gates
green for the right reason), C 6187d7b16 (C22 remaining text errors; C3 +15
citations, 35 equations left unsourced for Vítor), A ff9c4b52c (12 more
units read an authored inlet; supercritical discard in pipe/valve/
adiabaticFlash/flash; witness inletState01; four gate arms); no existing
golden row moved.  Wave 2 part 1 dispatched: C16 slice 2, C26 slice 2, C4.
Part 2 after: C8 with C2's unreserved part (both in sizing), C7's
remainder.  Open for Vítor from wave 1: the 35 unsourced equations and the
cited-at-model-introduction convention (C3); the mixer's two-phase authored
inlet (cavett01), a gas route for the pipe, a discarded split on an
undeclared inlet (C33).
(A) DONE 2026-10-04 on `claude/c34a-inlet-vf-family`, not merged: the
per-site verdicts are the table in C33; the supercritical discard is in §5's
2026-09-26 entry; witness `inletState01_undeclared_vapour`, gate
`check_inlet_resolution` arms (i)-(j), five hand sabotages, no golden row
moved.  Two defaults taken and FLAGGED there (the mixer's two-phase authored
inlet; the column left whole with D1).
Wave 2, C16 slice 2: INTEGRATED 2026-10-05 (merge e53d9de6c) -- four more regressed NRTL pairs, three promoted, one validated and
held back for predicting a second liquid; see C16.
(C4) INTEGRATED 2026-10-05: the closest
honest case (`ed08_wine_kht_model_solution`, a KHT model solution) is built;
the faithful wine case stays blocked on the reserved multi-ion split -- C4
lists the six missing pieces.
(C26 slice 2) INTEGRATED 2026-10-05 (merge 7336edefc): the evaporative
dryer evaporates only what its air pays for (3 lithiumBrinePlant rows moved,
listed in the merge), the cooling tower on the shared psychrometry, gate
`check_evaporative_dryer`; proposals P1-P7 in C26 are Vitor's.
(C7 class A) INTEGRATED 2026-10-05 (merge 47431c796): 20 archived records
redacted, 2 renamed with stubs, competitor pins 65 -> 5 (B and C remain).
(VLLE fallback, DEV 5) INTEGRATED 2026-10-05 (merge 168926510): the flash's
liquid-liquid kind is a typed field; witness `vlle04_two_liquids_decanter`,
gate `check_vlle_fallback`; found, not fixed: vlle03's three-phase duty and
KPIs mis-report (golden moves).
(C8 + C2 remainder) INTEGRATED 2026-10-05 (merge 6d1270c78): `spaceVelocity`
requires `spaceVelocityBasis normal|actual`; one row (a basis word) moved
by hand; ammonia02's 80 m3 and ammonia03's beds are Vitor's.
Combined validation on adcc885d6: targeted 66 PASS / 0 FAIL, `--fast` 67 / 0,
eight touched gates OK.  The reactorLadderLesson citation was re-pointed.
Wave 2 is COMPLETE.

**C33. THE FOUR UNITS THAT STILL READ AN UNPINNED INLET'S DEFAULT `vf`
(Vítor, 2026-10-04: "Podes avançar, mas com calma, porque o preço dos tokens
aumentou e o crédito já não chega para 5h").**  The flash01 slice left valve,
adiabaticFlash, heatExchanger and storageTank reading their inlet's `vf` bare
during the solve (§5, 2026-10-01 entry).  Taken by the commander alone, no
general, validation sized to the cases these units reach; a full regression
only if the measurement shows a path every case goes through.  Status: DONE
2026-10-04, no golden moved.
RULE: an AUTHORED inlet (no unit produces it) is resolved at its own
(T, P, z) in the consuming unit's own thermo world, single phase included
(`flashState::resolvedInletVaporFraction`); a PRODUCED stream keeps its
producer's answer.  The first cut resolved every inlet and broke
`column12_stage_is_a_flash` at exit 2: its mixer writes the right vf at a
deliberately fictitious T, and re-resolving it there is wrong -- the rule the
flowsheet's surface pass already applied.  A unit cannot tell the two apart
from its dict, so `Flowsheet::solve` stamps `ProcessStream::authoredInlet`
once before the first unit runs and `UnitInputs` carries it as a dict key
(false wherever nobody stamps it -- the dynamic driver -- so nothing changes
there).  `resolveStreamThermalState` was NOT reused: on a converged single
phase it keeps the carried value, so an all-vapour inlet still read liquid.
MEASURED: the 16 corpus cases using the four units PASS with zero golden
rows moved (no corpus case feeds them an unpinned non-liquid inlet); a probe
(adiabaticFlash01 with the feed at 450 K) reads vf = 1.0000 where the
default read 0.  Validation: build clean; those 16 cases; `--fast` PASS 67 /
FAIL 0; check_overspecified_stream, check_inlet_resolution,
check_feed_thermal_state, check_layering OK; the four lesson tests holding
`Flowsheet.cpp`/`HeatExchanger.cpp` citations, re-pointed by the measured
shift, 113/113.  No full regression: the only executable change on the
shared path is a flag no other unit reads.  NOT GATED: no corpus witness
reaches the change, so nothing pins it; a witness is the next step if wanted.
[GATED 2026-10-04, C34: witness `inletState01_undeclared_vapour` (the
valve among its three units) and `check_inlet_resolution` arm (i).]
ENUMERATED, NOT AUDITED (grep for a bare `vf` read, 2026-10-04): mixer,
splitter, cstr, pfr, conversionReactor, shortcutColumn, the multi-feed
column branch, electrodialysisStack, sprayDryer, solidDryer, convectiveDryer,
heater, phaseChanger, multiStreamHX and the isothermal flash's feed read.
**AUDITED 2026-10-04 (C34 wave 1, item A, branch
`claude/c34a-inlet-vf-family`).**  `file:line` as read on `origin/main`
296df2d9c; "what it decides" is read off the code, not the comment above it
(two of those comments -- CSTR.cpp:100, PFR.cpp:302 -- said "the flowsheet
has already inferred the feed phase", which for an authored inlet it had
not).  `priceState` keeps the CARRIED vf on a single-phase answer
(StreamEquilibrium.H:461-465), so a unit that prices through it with a bare
read still prices an undeclared vapour as a liquid.

| Site | What the value decides | Verdict |
|---|---|---|
| Mixer.cpp:126 | inlet enthalpy (H_stream_formation at vf, :116) and the outlet's dominant-phase vote (:166-201) | CONVERTED for a single-phase resolution.  A TWO-PHASE authored inlet keeps its carried vf, ANNOUNCED -- a stated default: on cavett01 (a 322 K, 18.6 bar two-phase feed) the resolved fraction flips M2's vote to vapour and the one-phase adiabatic Newton then finds no T_out in [150, 2500] K (exit 2).  **For Vítor.** |
| Splitter.cpp:49 | copied into every branch's vf (:117); the branches are PRODUCED and nobody re-resolves them | CONVERTED |
| CSTR.cpp:106 | the outlet's inherited phase (:409, :851), the duty through priceState (:73), the multi-reaction T-solve basis (:575-718) | CONVERTED |
| PFR.cpp:308 | the outlet's phase (:620, :1083), the reaction-heat phase (:645), the energy ODE's pricing (:948, :1032, :1244) | CONVERTED, line-neutral (EduTool citations PFR.cpp:373/647/804 unmoved) |
| ConversionReactor.cpp:173 (default 1.0) and :249 | the outlet's carried phase (:287) and both duty terms through priceState | CONVERTED, one read for both paths; the 1.0 default is dead in a flowsheet (UnitInputs.cpp:257 always inserts `vf`) and is kept for a dict without the key.  Line-neutral above :230 |
| DistillationColumn.cpp:1504 (multi-feed) | each feed's q (the MESH) and its blend pricing | LEFT -- the column's feed reading is ONE decision for both branches, and the single-feed branch's is §4d D1, RESERVED.  Measured: re-doing D1 refuses `column03_azeotrope_mesh` and `acetone07_luyben_column_C2` at exit 2, exactly as D1 records.  **Vítor's, with D1.**  **CONVERTED 2026-10-05 (C35 item 2):** both branches read every stream feed through `resolveFeedThermalState`, which ends in `resolvedInletVaporFraction` for a single-phase answer; the multi-feed branch also prices a stage's one resolved feed at (x, y).  See §4d D1. |
| ShortcutColumn.cpp:77 | q, hence Underwood's R_min (:159) | CONVERTED |
| ElectrodialysisStack.cpp:97 | forwarded unchanged to both outlets (:725-726), never priced | LEFT: a pass-through label on a brine the unit's physics requires liquid; resolving it would run the electrolyte package's flash for no information |
| SprayDryer.cpp:677, :679 | both inlet enthalpies through priceState (:680-684) | CONVERTED (air keeps its 1.0 default when the key is absent) -- the solidDryer01 gap of 2026-09-27 (undeclared hot air priced as a liquid), one unit over |
| SolidDryer.cpp:174, :176 | both inlet enthalpies through priceState (:177-182) | CONVERTED, same reason |
| ConvectiveDryer.cpp:126, :127 | a REFUSAL (the air must be vapour, the moisture liquid) read off the carried value | CONVERTED: undeclared hot air whose own equilibrium is a vapour no longer refuses; the refusal stands for a stream that resolves (or was produced, or declared) otherwise, and its message says so |
| Heater.cpp:116 | `useGas`: the sensible rung, the Newton's upper bracket (700 vs 3000 K, :239), the leg the datum probe asks for (:154).  H_in itself was already resolved (`Hresolved`, :178) | CONVERTED |
| PhaseChanger.cpp:224 | the latent/sensible SPLIT only (:442); H_in is resolved at :228 | CONVERTED |
| MultiStreamHX.cpp:104 | h_in (:120) and the outlet's default phase | CONVERTED |
| MultiStreamHX.cpp:118 | the DECLARED outlet vf in `operation.outlet` | LEFT: not an inlet read |
| IsothermalFlash.cpp:1563 | the duty's carried fallback; an unpinned feed is re-flashed and priced on its resolution since 2026-08-09 (:1589-1683) | LEFT: already resolved (R-E1) |

MEASURED: the 159 corpus cases that use any touched unit -- 155 PASS, 1
EXPECTED-FAIL, 3 FAIL on the first build (column03, acetone07: D1 re-done;
cavett01: the mixer) and all three PASS after the column was reverted and
the mixer's two-phase default taken.  **No golden row moved.**  Witness
`tutorials/steady/flowsheets/inletState01_undeclared_vapour`; gate
`check_inlet_resolution` arms (i1) source and (i2) output (sabotages S1, S4).
STILL READING AN AUTHORED INLET'S CARRIED vf, named: the distillation column
(both branches, D1 -- CONVERTED 2026-10-05, C35 item 2) and the evaporator chest (through
`resolveStreamThermalState`, whose single-phase reading is D1's subject; a
superheated chest is REFUSED there, falsely, not mispriced).  [The chest
CONVERTED 2026-10-05, C35 item 3: it reads `resolvedInletVaporFraction`; on
corpus packages the flash's own dew test still cannot resolve it -- 4d D1.]

**C32. AN EDUTOOL ON WHAT THE DEGREE SIGN MEANS: ENTHALPY, THE STANDARD
     STATE AND EQUILIBRIUM (asked 2026-10-03, Vítor, forwarding a brief
     ChatGPT wrote after a long conversation that began on the
     `reaction-enthalpy` page: "Quero que cries um EduTools … sobre
     'Entalpia, estado padrão e equilíbrio: o que significa realmente o
     °?'").**  The brief's pedagogical order is kept -- physical behaviour
     first (how much h of real hydrogen moves with T against P, 300-1000 K,
     1-1000 bar), then the reference curve and its correction, only then the
     degree sign; the zero of enthalpy as a separate choice; the process at
     150 bar; equilibrium and the three 1/T relations; six questions with
     feedback.  Three of its instructions are NOT followed, each by a
     settled rule: the page is in ENGLISH (the repository language, §5 of
     CLAUDE.md -- the brief asked for Portuguese); its "what does <a named
     commercial simulator> do" screen names a competitor, which
     `check_doctrine` refuses in user-facing content, so it becomes "what
     Choupo does, and what any simulator's convention must declare"; and
     the hydrogen curves are NOT
     a pasted CoolProp table -- the ENGINE prices them (41 `propertyPoint`
     ops on SRK in the new witness
     `tutorials/props/thermo/standardState01_hydrogen_enthalpy_TP`, zero
     physics in the panel), and the Leachman-2009 reference values are
     RE-COMPUTED here with CoolProp 8.0.0 by
     `bin/curate/reference_h2_enthalpy.py` into the witness's
     `constant/experimental/` (the one CSV location the bundle admits), cited, drawn beside the engine's points with the
     deviation stated (measured first: SRK is within 6 % of the reference
     residual at 300 K / 1000 bar and 0.2 % at 1000 K; PR under-predicts it
     by a third and gets the sign wrong at 300 K / 100 bar, so SRK it is).
     Ten steps, six questions with feedback (`lessonQuiz.tsx`, the first
     shared quiz component), four stated limits.  DONE 2026-10-03 (registry
     id `standard-state`).

**C31. AN EDUTOOL ON THE REACTION ENTHALPY AND TEMPERATURE (asked
     2026-10-02, Vítor: "Ha outra coisa que eu confundo sempre que é o
     DeltaH0 da reacção! Aquilo é 25 graus, mas depois depende da
     temperatura" -- and, after the online search, "Então faz esse EduTool
     porque isso é realmente importante!").**  What the degree sign fixes
     (the standard state, not the temperature -- IUPAC 1982 via Wikipedia),
     Kirchhoff's law, ammonia priced by the engine from 25 C to 527 C (new
     witness tutorials/props/gibbs/reactionEnthalpy01_haber_kirchhoff), what
     the 25 C value gets wrong in a converter design, and the elements-datum
     energy balance that never needs a reaction enthalpy.  The online search
     found NO study measuring this confusion on its own; the page says so.
     DONE 2026-10-02 (registry id `reaction-enthalpy`).

**C30. AN EDUTOOL ON THE LIMITING REACTANT AND THE FEED RATIO IN A RECYCLE
     LOOP (asked 2026-10-02, Vítor: "Faz o EduTools que recomendaste!  É muito
     interessante!", after asking which heuristics fix the limiting reactant
     and the molar ratio in a gas-phase reactor, "porque isso introduz muitas
     variáveis").**  The page separates the fresh-feed ratio (forced to the
     stoichiometry plus losses by the steady-state plant balance) from the
     reactor-inlet ratio (set by the loop), derives the inlet ratio of a
     purge loop in closed form, lists the heuristics for which reactant to
     make limiting WITH sources read online, and uses the green-ammonia loop
     as its measured witness.  DONE 2026-10-02 (registry id
     `limiting-reactant`).

**C29. THE APPROACH-TO-EQUILIBRIUM EDUTOOL SAYS WHY THREE GIBBS BEDS ARE
     ONE, AND GIVES THE PUBLISHED HEURISTICS FOR THE APPROACH (asked
     2026-10-02, Vítor, after the green-ammonia converter had been built as
     three adiabatic Gibbs beds: "No Edutool tens de esclarecer isto para
     que os alunos não cometam o mesmo erro!  E na temperatura de
     aproximação tens de ir online e ver quais é que são as
     heurísticas!").**  Two additions to `approach-to-equilibrium`
     (`gui/src/ui/methods/approachToEquilibriumLesson.ts`): (1) a Gibbs
     reactor has no volume and no path, so N Gibbs beds in series with
     coolers between them return the outlet of ONE Gibbs reactor at the
     last bed's temperature; the intermediate temperatures they print are
     artefacts, and the number of beds is a question for a kinetic plug
     flow reactor; (2) the approach values practice actually uses, per
     process, each from a source read online and cited -- never a number
     without one.  Variables in mathematical form (the standing rule).
     DONE 2026-10-02 in `439200dbb` (steps 7 and 8; no methanol value,
     because no readable source was found).

**C28. THE TIME-INTEGRATED CASES ADOPT THE RATIFIED STATE LAYOUT (#186)
     (asked 2026-09-30, Vitor, on seeing unsteady03 in the browser: "Nao
     usaste internalState nem ... gravar o estado do sistema em folder com
     os tempos, como faz o OpenFOAM!").**  Measured: the dynamic and batch
     binaries still read and write the OLD shape (one `0/internalState`
     for every unit, one `0/streamFaces` for every face), 59 cases carry it
     (22 ctrl/unsteady, 37 batch), and `<t>/` directories are written only
     under `solutionControl { write true; }` (6 cases), in the old shape
     too.  His rulings, taken by question the same turn: BOTH families
     migrate to the ratified layout (`<view>/<stream>` one file per stream,
     `<view>/internalStates/<unit>`), NO dual reader (the old shape refused
     naming the migrator), and `<t>/` directories written BY DEFAULT at
     every writeInterval, as OpenFOAM does (`write false;` opts out).
     Dispatched to a general with a written brief.  **BUILT 2026-09-30 and INTEGRATED into `main` the same
     day (CLAUDE.md §3 and §10 record the landed shape; this sentence said
     "awaiting integration" for three days after it landed -- corrected
     2026-10-03):** both drivers read and
     write the ratified layout (a `holdup {}` kind in
     `InternalStateIO`), the 59 cases migrated byte-identically by
     `bin/curate/migrate_state_layout.py`, the old shape refused by name,
     `<t>/` written by default and restartable where the holdup is the
     unit's whole state (`notRestored` + a refusal elsewhere); gate
     `check_time_state_layout`; record
     `docs/design/a-state-directory-is-a-restartable-snapshot.md` §11.

**C26. DRYING, REVIEWED FOR TEACHING -- slice 1: THE CHARACTERISTIC
     DRYING CURVE (asked 2026-09-29, Vitor: "quero rever a secagem.
     Podemos comecar por implementar a curva generica de secagem?").**  The
     generic curve he named is the characteristic (normalised) drying curve
     of van Meel (Chem. Eng. Sci. 9 (1958) 36-44; Keey 1992): f = R/R_c as
     one function of Phi = (X - X_eq)/(X_c - X_eq).  Built from the primary
     source, no simulator's equation copied (C7).  Measured before: the
     `batchDryer` already had the constant-rate period (k_Y, wet bulb), a
     measured X_c and a GAB X_eq, with the falling period hard-wired LINEAR;
     the steady `solidDryer` has NO kinetics (dries to equilibrium).
     **SLICE 1 BUILT 2026-09-29:** `DryingCurve` (src/unitOperations/
     heatTransfer/DryingCurve.{H,cpp}) is the one home of f(Phi) -- shape
     linear | power (f = Phi^n) | table (measured points, (0,0) to (1,1),
     f non-decreasing), `source` required for power and table, six named
     refusals; `batchDryer` reads `operation.dryingCurve {}`, absent =
     linear, byte-identical (dryer01 unmoved).  Witness
     `tutorials/batch/drying/dryer02_characteristic_curves` (one tray, four
     curves, all declared hypothetical); gate `check_drying_curve` (the
     linear, Phi^2 and Phi^0.5 closed forms from each tray's own KPIs; one
     sabotage, flux ignoring the curve, caught).  Named, not fixed: with
     n < 1 the curve reaches X_eq in finite time and RK4 lands 2.4e-6
     relative BELOW it (non-Lipschitz f at Phi = 0; no clamp by rule).
     **SLICE 2 BUILT 2026-09-29 (Vitor: "Avanca"):** `convectiveDryer`
     (src/unitOperations/heatTransfer/ConvectiveDryer.{H,cpp}), steady,
     co- or counter-current over a declared contact area on the curve, the
     air's Y and T ALGEBRAIC in X (water and enthalpy balances on the
     package's formation surface, so the first law closes by construction:
     energyResidual_kW 1e-7 / 5e-10, plant report 1e-7 kW), counter-current
     by shooting on X_out.  Witness `tutorials/steady/drying/
     convDryer01_sugar_curve` (solidDryer01's feed split to both
     arrangements, 300 m2: X_out 0.0234 co against 0.0047 counter); gate
     `check_convective_dryer` (two sabotages: one stops the run, one -- the
     outlet 5 K off the unit's own balance -- caught by the plant-report
     arm at -6.19 kW).  Riding with it: `Psychrometry.H`, ONE home for
     Ysat / a_w / GAB / wet bulb (BatchDryer and SolidDryer migrated,
     goldens unmoved; SolidDryer's silent X_eq = 0 on an out-of-domain
     isotherm is now a refusal; CoolingTower's own wet-bulb lambda is NOT
     migrated, named in the header); the wet-bulb bracket capped where
     p_sat = 0.95 P, so air above the moisture's boiling point has a wet
     bulb (it threw before -- no case had met it); and **THE SPLITTER
     DROPPED A STREAM'S SOLID PHASE**: it read `solids {}` inside `feed {}`
     while the flowsheet injects it beside `feed`, so a split wet solid
     lost its crystals in silence -- fixed; the 23 splitter cases are
     unmoved (none split a solid before).  `solidDryer01_sugar`'s hot air
     declared no phase, so it was priced as a liquid; it DECLARES `phase
     gas;` now (2026-09-30, the two moved rows shown to Vitor first) and
     its check_energy_closure pin falls from 372.6562 to -6.8764 kW.  What
     remains is the SolidDryer's own cp-based balance against the
     formation surface, OPEN (the ConvectiveDryer route closes by
     construction and is the remedy's shape).  **SLICE 3 BUILT 2026-09-29 (Vitor chose the
     small option: "Botao n na tool batch"):** the `drying` EduTool gains
     the knob n of f = Phi^n.  The knob writes a NUMBER, so the witness
     `dryer01` now DECLARES its falling rate as `dryingCurve { shape
     power; exponent 1.0; source "... hypothetical teaching curve"; }` --
     n = 1 is the linear law, and its golden is unmoved; the engine's hand
     check line gained the n = 1 closed form (the exponential tail).  The
     honesty chip quotes whichever falling-rate sentence the run printed
     (MODELLING CHOICE undeclared, CHARACTERISTIC DRYING CURVE declared);
     step 4 of the lesson prints R = R_c f(Phi), f = Phi^n with Phi, f and
     n glossed.  Same day (Vitor, on the plain "X_c" in the knob labels:
     "Tu tens know how para fazer isso!"): a knob label, its tooltip and a
     panel note may now name variables as inline math, `\( ... \)`, drawn
     by KaTeX through ONE shared `TexText` (lessonStep.tsx) that every
     `KnobSlider` uses -- a label with no delimiter renders unchanged, so
     the other tools convert as each is reviewed; `\(` and not `$`, because
     a label may carry a currency sign.  The drying tool is converted.
     Considered and NOT taken: a tool for the continuous dryer
     (Vitor's option 2, deferred).  The solid's falling-rate warm-up (a
     solid energy balance) stays the named physics gap in both dryers.
     **SLICE 4 BUILT 2026-10-05 (C34 wave 2's "C26 slice 2", branch
     `claude/c34-c26-slice2`, off ff9c4b52c; every claim below measured
     there first).**  Taken because it is the open, unreserved remainder:
     no EduTool text, no new refusal, no new physics.
     (1) **THE "OPEN" SENTENCE IN SLICE 2 WAS ALREADY STALE.**  The
     SolidDryer's cp-based balance was moved onto `flashState::priceState`
     by D-ET2 (9f7917a46, merged ac06effef on 2026-10-03;
     SolidDryer.cpp:186-216), and `solidDryer01_sugar` closes its plant at
     0.0000 kW (run, not read); `check_energy_closure` U2 holds it.  Closed.
     (2) **THE EVAPORATIVE DRYER DECIDED ITS LIMIT ON A HYPOTHETICAL.**  At
     ff9c4b52c it asked only whether removing ALL the free water hit the
     T_w floor (EvaporativeDryer.cpp:166 `Tout_full = Tout_for(water_in)`)
     and then overrode any answer with that verdict (:185 `limit =
     "energy"; // the floor dominates`).  Two defects, measured: on
     `lithiumBrinePlant`'s FINISHING.dryer T_out sat AT the 363.15 K floor
     WITH the exhaust at the 0.95 cap -- 0.3827 kg/s evaporated where the
     air pays for 0.0941 kg/s there, so **0.2887 kg/s (1039 kg/h) of water
     left with no heat behind it**, about 0.66 MW at water's ~2.28 MJ/kg
     latent heat, invisible because that plant's energy balance is
     UNAVAILABLE (NaCl and Li2CO3 carry no formation datum); and
     `evapDryer02` was labelled energy-limited with a WARNING "T_out floored
     at the feed T" beside a T_out of 310.7 K.  Now the heat the air can pay
     for at the floor is closed-form, `water_pay = F_air cp_air (T_air -
     T_w) / lambda(T_w)` (EvaporativeDryer.cpp:222), the exhaust cap is
     solved INSIDE it (:225), the limit announced is the one the answer
     satisfies (:232), the energy WARNING rides `AdvisoryLog` into the
     caveat block (:307) and the saturation NOTE names what the heat could
     have paid for.  Riding with it, each a silence and none moving a
     number: the DEFAULT zero solid heat capacity (NaCl has no
     `solidHeatCapacity`) and the 75.4 J/(mol K) liquid default are
     announced (:156, :164); `dry.s` carries every crystal, not the first
     (:273).  **THE UNIT STAYS ON ITS OWN HAND SURFACE, said in its header**:
     moving it to `priceState` makes all three corpus cases refuse for want
     of a salt formation datum -- a change to what the engine refuses.
     (3) `CoolingTower` calls `psychrometry::Ysat` and `wetBulb`
     (CoolingTower.cpp:175, :194), the copy Psychrometry.H named; the
     tower's console and result JSON are BYTE-IDENTICAL on
     `coolingTower01_merkel`; its Merkel h* stays its own (the classical
     datum the method is taught on).  (4) `check_energy_closure`'s unit arm
     now judges `convectiveDryer` (+ witnesses `convDryer01` co/counter):
     slice 2's "closes by construction" had been held at PLANT level only.
     GOLDENS MOVED, three rows, all `lithiumBrinePlant`, one reason (the
     heat-from-nowhere water no longer evaporates): `stream.cleanAir.F` and
     `stream.humidExhaust.F` 0.0320991487231 -> 0.0160765700214 kmol/s,
     `stream.product.F` 0.00653418461064 -> 0.0225567633123 kmol/s (the
     0.01602 kmol/s of water stays on the cake; T rows unmoved at the
     floor).  `evapDryer02` moves inside its tolerance only (the bisection
     interval shrank: T_out 310.725305 -> 310.725208 K).  Its header and
     description said energy-limited and now say what binds; the
     tutorials guide was regenerated and rebuilt (it also gained
     `inletState01_undeclared_vapour`, which C34-A had not regenerated).
     Gate `check_evaporative_dryer` (arms (a) each corpus case's announced
     limit against its own answer, (b) doubling the gas at the floor
     doubles the water to 2e-9, (c) the default announced; four by-hand
     sabotages, each caught: S1 the cap ignoring the heat -> (a) lithium;
     S2 all the water evaporated below the cap -> (b); S3 the label
     override restored -> (a) evapDryer02; S4 the default silenced -> (c)).
     **LEFT FOR VITOR, each a proposal, none taken:** (P1) `evapDryer02` is
     NAMED energy_limited and is saturation-bound; rename it, or redesign
     its inputs so heat binds (heat can bind before the cap only when the
     wet solid is warm, because the cap is read at the floor T_w) -- the
     only heat-bound case today is the lithium plant, whose dryer receives
     a slurry at X = 79 kg/kg and now leaves it at 64 (98.5 wt% water):
     the plant's dryer is under-aired, a case-design question.  (P2) The
     T_w floor itself, in this unit and the solid dryer: a real solid cools
     toward the gas's wet bulb; allowing it changes the model's domain.
     (P3) This unit on the formation surface, which needs its salts priced
     outside an electrolyte package or the cases moved into one.  (P4) The
     falling-rate warm-up (unchanged).  (P5) The n < 1 RK4 landing 2.4e-6
     below X_eq (unchanged, named in slice 1).  (P6) `convDryer01` pins
     `energyResidual_kW` at 1.08e-7 and -4.87e-10 kW with reltol 1e-4 --
     round-off pinned, the column13 shape; dropping the two rows is a row
     that MOVES, so it is his.  (P7) The continuous-dryer EduTool (option
     2), still deferred.
     **RULED 2026-10-05 (C35):** P1 -> items 12 and 11 (the case renamed
     `evapDryer02_energy_limited`; the lithium plant's gas DESIGNED for
     a dry product, so NO corpus case is heat-bound now and arm (b)'s warm
     fixture is the heat-bound witness, its caveat-block replay checked
     there); P6 -> item 13 (the two rows dropped); P2 -> item 7 (the floor
     is the gas's wet bulb in both dryers; DONE on branch
     `claude/c35-dryer-floor` -- and it makes evapDryer02 heat-bound again,
     see item 7).  P3-P5 and P7 stay his.

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

     **SLICE 2 DONE 2026-10-05 (C34 wave 2; branch `claude/c34-c16-slice2`,
     not merged; record section 6).**  The WIDENING half: four systems chosen
     by teaching value before fitting -- 1-propanol + water (completes the
     C1-C3 water + alcohol series), acetonitrile + water (pressure-swing
     distillation), acetone + ethanol (positive deviation, no azeotrope),
     ethanol + cyclohexane (the entrainer binary of ethanol dehydration) --
     declared (datasets, partition, band) in a commit of their own BEFORE
     the first fit.  Partition: fit on the study with the most interior
     points, hold out the next largest sharing no author.  Cases
     `curate09`..`curate12`.  All four VALIDATED on held-out data (0.057 %,
     0.137 %, 0.028 %, 0.094 % against bands of 0.26, 0.72, 0.14, 0.41 %);
     THREE promoted (public NRTL pairs 6 -> 9).  **Ethanol + cyclohexane was
     validated and NOT promoted:** its pair predicts a liquid-liquid split up
     to 358.8 K, across its whole validity span (337.7-353.5 K), where both
     studies report one liquid -- the engine's VLLE flash splits a 43/57 feed
     at 340 K.  A bubble-T scan solves for one liquid by construction, so the
     verdict cannot see a second: `validated` is necessary, not sufficient.
     New `check_regressed_pairs` arm (f): a catalogue pair must predict ONE
     liquid across its validity span (record's NRTL recomputed; 3 sabotages,
     S1 caught by arm (f) ALONE).  Also measured: 1-propanol + water,
     acetonitrile + water and slice 1's isopropanol + water split BELOW their
     validity spans (355.5, 323.6, 330.4 K) although all three are miscible
     at room temperature -- each new record says so; whether the engine
     should announce a PAIR used outside its validity span (it does for a
     vapour-pressure Trange) was for Vitor -- RULED 2026-10-05, C35 item 5:
     it does now (`[pair-span]`).  Passed over, measured: methanol +
     benzene (its two studies report x of different components and
     `extract-vle` cannot reorient -- the aromatic waits on a `--x-of`
     option), ethanol + p-xylene (ethanol's Antoine ends at 369 K), acetone +
     water / acetone + chloroform / THF + water (no low-P bubble-T block).
     curate09 fits at `tolerance 1e-6` (at 1e-8 the LM sat on the same
     minimum rejecting steps until lambda diverged -- no step-size stop, a
     tool gap).  Found, not fixed: the VLLE port defect (section 5,
     2026-10-05).  No corpus golden moved (no unsealed NRTL case holds the
     three new pairs' components).  **REMAINING:** read the eighteen series
     back (`checked`); acetone-methanol; `P_bubble`; UNIQUAC/Wilson;
     `--x-of`; a stability-constrained fit (alpha or a_ij freed under a
     phase-count constraint) for alcohol + hydrocarbon pairs; then the next
     pairs by the same rule.
     **ETHANOL + CYCLOHEXANE AGAINST LLE DATA (C35 item 6, 2026-10-05):
     the archive has NONE, so the pair stays case-local.**  Searched in
     ThermoML.v2020-09-30 (the same tarball, sha256 231161b5... verified by `sync` on
     2026-09-28 and re-hashed today; data.nist.gov answered 503 on 2026-10-05, so the unpacked
     copy a C16 worktree had made was READ, not re-downloaded), joined BY
     INCHIKEY (cyclohexane XDTMQSROBMDMFD-UHFFFAOYSA-N, ethanol
     LFQSCWFLJHTTHZ-UHFFFAOYSA-N): 1190 files carry cyclohexane, 456 carry
     both, and they hold 19 BINARY ethanol + cyclohexane blocks -- VLE
     (x-y, boiling T, azeotrope, Psat), density, refractive index,
     permittivity, viscosity, speed of sound, Cp, H^E, diffusion -- and NOT
     ONE with two liquid phases (`Liquid mixture 1/2`), a consolute
     temperature or a mutual solubility.  Two ternary sources do carry two
     liquids (j.fluid.2005.07.015, water + ethanol + cyclohexane VLLE;
     je700741x, 2,2,2-trifluoroethanol + ethanol + cyclohexane LLE at
     288-308 K), but their second liquid is made by the third component;
     they are not mutual-solubility data on this pair and were not used.
     Every binary block the archive holds is of ONE liquid.  Per the
     ruling, no constraint was invented: the record stays in curate12 (and
     its copy in vlle04), unpromoted, with the reason in its header.
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
        (STALE since 2026-10-01, re-measured 2026-10-05: the flagship's
        `Converter/system/flowsheetDict` now declares `temperatureApproach
        5;`, and the flagship carries no postDict at all since 2026-10-02 --
        so the flagship has taken stage C's correction and costs nothing.)
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
     building C exposed the two-key defect (section 5) and a BASIS trap:
     `VesselSize` computed Q on ACTUAL gas volume while every published GHSV
     is on a normal basis -- at 700 K / 200 bar the ratio is 77, so an
     industrial GHSV typed straight into `designRules` under-sized the bed
     77x at exit 0.  Also measured from the flagship's own golden: its
     comment says 20 000 Nm3/(m3 h) and the number is ~10 200 -- the
     comment overstates by 1.8x, which is the whole argument for the rule
     being engine-visible.
     **THE BASIS TRAP IS CLOSED (2026-10-05, C34 wave, branch
     `claude/c34-c8-c2-remainder`).**  A `spaceVelocity` now REQUIRES
     `spaceVelocityBasis normal;` (Nm3 at 273.15 K / 101325 Pa, ideal gas)
     or `spaceVelocityBasis actual;` (the unit's own T and P) in the same
     `designRules {}`; absent, the item is REFUSED by name with the
     normal/actual ratio at the unit's own conditions quoted, and any other
     word (`standard` included -- 15/20/25 degC at 1 bar or 1 atm by source)
     is refused through `registryRefusal::message` naming the two accepted
     words.  The engine does not GUESS.  The normal reference has ONE home
     (`core/Constants.H`, `T_normal`/`P_normal`), read by both the sizer and
     the PFR's `GHSV_normal_h` KPI.  Blast radius MEASURED first: ONE corpus
     case sizes by space velocity (`ammoniaStaged03_approach`); it now
     declares the literature's `spaceVelocity 20000; spaceVelocityBasis
     normal;` instead of the hand-converted 259.665, the run prints the
     conversion (`[basis] ... 259.665 1/h on ACTUAL gas (normal/actual =
     77.02)`), and ONE golden row moved -- its `equipment converter basis`
     WORD, because the sheet now says which basis in words; every numeric
     row stays within 1e-4 (V_R moves by 7.4e-8 relative: the hand-rounded
     259.665 against the exact 259.6651...).  Gate: `check_design_sheet`
     arm (o), 4 by-hand sabotages, all caught.  The "flagship" comment is
     STALE for `greenAmmoniaIndustrialN2` (its postDict left the base case
     on 2026-10-02) and LIVE for `ammonia02_full_plant`, whose 80 m3 is
     11 360 Nm3/(m3 h) on its own inlet (10 388 on the outlet), not the
     ~20 000 its comment claimed: the COMMENT is corrected; the NUMBER is
     not, because declaring the rule (`spaceVelocity 20000; spaceVelocityBasis
     normal;` -> 45.4 m3) moves ammonia02's converter size and cost golden
     -- WAITING ON VITOR (4b): keep the typed 80 m3, or let the case declare
     the rule.  **RULED 2026-10-05 (C35 item 9): the case declares the rule
     (inlet gas, `flowKey N_in_mol_s`), V_R = 45.4386 m3, 17 golden rows
     moved (listed in C35).**

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
           **DONE 2026-10-05 (branch `claude/c34-c7-archive`), and measuring
           first corrected this entry twice.**  Only TWO file names carried
           the word, not four, and the class held 20 records (60 sites), not
           19; the inbound links were five, in four files (three archive
           siblings and `final-property-architecture.md`, whose link was
           already broken -- it pointed beside itself rather than into
           `archive/`), not CLAUDE.md, `decision-records.md` or a dozen
           design records.  Renamed:
           `docs/architecture/archive/conceptual-data-architecture.md` and
           `docs/architecture/archive/conceptual-migration-map.md`, each with a zero-site stub
           at its old path for links from outside the tree.  All 20 records
           redacted in place -- every product name replaced by what it is
           ("the commercial simulators", "a commercial process simulator"),
           one quotation from a published paper ELIDED with the elision
           marked, no decision, date or argument changed -- and each carries
           a dated note that the original wording is in git history.  The
           pin ledger went from 65 sites in 22 files to 5 in 2 (B and C
           below), class A retired.  Sabotage: a name put back into a
           cleaned file fails the gate as a NEW site.  What the stubs leave:
           the two old FILE NAMES are still in the tree (as stubs), which is
           the price of not breaking an outside link; deleting them is a
           one-line act whenever Vítor prefers broken links to the names.
           **DELETED 2026-10-05 (C35 item 15, Vítor's ruling):** both stubs
           are gone; no in-tree link reached them.  `check_doctrine` scans
           file CONTENT, never file names, so its ledger did not change --
           the names were outside the gate's sight, which is why the stubs
           were never pinned.
       (B) `docs/slides/farelo_choupo.tex`, 3 sites: the HISTORY OF THE FIELD
           (the 1976 project at MIT, the 1981 company, the proprietary era).
           That is history, not comparison, and it is **Vítor's own deck** —
           RESERVED for him.  **DONE 2026-10-05 (C38 item 3, Vítor: "Faz
           tu!"):** each product name replaced by a neutral description of
           what it was, the history and the argument intact, the pin
           dropped; a name put back fails the gate as a NEW site.
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
     **RULED 2026-10-05 (C35 item 14): the published history is NOT
     rewritten.**  That is the posture `no-competitor-is-named-here.md` §6
     already recorded: the ruling binds what the tree carries from here on,
     and the history keeps what was lawful when it was written.

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
     **STALE, measured 2026-10-05:** that sequence had already happened.
     None of the four referrers names the removed studies or their paths:
     `SolidPhase.H` and `check_ice_freezing.py` carry the LESSON as "an
     open-source peer" with no subject, `solid-equilibrium-spike.md` points
     to the ruling record, and `decision-records.md` names only the ruling.
     The category-2 allowlist is `COMPETITOR_EXEMPT`.  Nothing to fix.

     **WHAT REMAINS (2026-10-05):** (B) is CLOSED (C38 item 3); (C) is
     permanent and is the only pin left.  The
     PUBLISHED git history is NOT rewritten -- REJECTED, ruled by Vítor
     2026-10-05 (C35 item 14), in agreement with
     `no-competitor-is-named-here.md` §6 and its index row; it is no longer
     an open question.

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
   **DECIDED 2026-10-05 (Vítor, C35 item 2) and CLOSED for the COLUMN on
   branch `claude/c35-d1-column-feed`; the EVAPORATOR-chest half is a
   separate C35 slice.**  See "CLOSED, the column half" at the end of this
   entry.
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
   RE-MEASURED 2026-10-04 (C34 wave 1, item A), for the COLUMN half only:
   giving the column's single-feed branch the single-phase reading
   (`resolvedInletVaporFraction` after `resolveStreamThermalState`) refuses
   exactly two of the 21 cases under `tutorials/steady/distillation/` --
   `column03_azeotrope_mesh` and `acetone07_luyben_column_C2`, both on
   `feedQuality 1` against a feed that resolves single-phase VAPOUR -- and
   no other column case among the 159 run (`acetonePlant` and both strippers
   pass).  Reverted again; the multi-feed branch was
   left with it, so the column reads its feeds by ONE rule until this is
   decided.  The other units' readers were converted (DEV.md C33 table).
   CLOSED, the column half (2026-10-05, C35 item 2, Vítor: "the column
   reads its feed by the feed's own equilibrium; column03 and acetone07 are
   corrected to declare what they mean").  WHAT WAS DONE:
     * `resolveFeedThermalState` (DistillationColumn.cpp, the column's one
       resolver, called by the Wang-Henke branch, the recovery banner and
       both `simultaneous` branches) now follows a converged SINGLE-phase
       answer with `flashState::resolvedInletVaporFraction`: an unpinned
       AUTHORED feed means its own equilibrium, a pinned or produced one
       keeps what it carries.  Origin printed:
       "resolved single phase at its own (T, P, z)".
     * The multi-feed `feeds ( ... )` branch read each stream's CARRIED
       `vf` (`sd->lookupScalarOrDefault("vf", 0.0)`); it now calls the same
       resolver, and its `quality` refusal names the resolved state.  The
       duty block prices a stage's ONE resolved feed at (x, y) in BOTH
       branches (`stageFeedState`); a stage with an inline feed or more than
       one feed keeps the blend, as the single-feed branch's inline-merge
       guard already did.
     * THE TWO CASES, decided from their own text.  Both were written
       around a SATURATED LIQUID (column03's header: "feedQuality = 1.0
       (saturated liquid)"; acetone07's: "B1 leaves C1's reboiler as a
       saturated liquid and enters here as one"), and both starve with the
       vapour their stated T actually is (re-measured: deleting
       `feedQuality` alone gives "a stage vapour/liquid flow went
       non-positive", exit 2, on each).  So each feed now declares
       `phase liquid;` at its own bubble point under the case's own model,
       ASKED OF THE ENGINE (`bubbleT` on the very stream: 354.4248 K for
       column03's 30/70 ethanol/water under NRTL, 357.4681 K for B1 under
       UNIFAC; the engine's own flash finds both feeds all vapour at their
       old 363 K and 370 K), rounded DOWN to 0.01 K so the
       stream's own equilibrium agrees with the pin, and the `feedQuality`
       key is deleted (one home).  Luyben's 370 K stays in acetone07's
       header and the programme record.
     * GOLDENS, 8 rows each, every one the feed's sensible heat or the
       closed first law (compositions, T profile and condenser duty are
       unmoved -- the MESH is CMO, so the stages depend on q, which stayed
       1): column03 -- feed T 363 -> 354.42; Q_reboiler and steamLP duty
       935.614596 -> 956.239963 kW (+20.63 kW, 100 kmol/h of liquid
       8.58 K colder); steamLP kg_s and eur_h with it; H_feeds -6579.159
       -> -7749.475 kW (the report had priced the 363 K VAPOUR); Q_boundary
       -17.360 -> +3.265 kW; residual 1149.690 -> 0 kW.  acetone07 -- B1 T
       370 -> 357.46; Q_reboiler and steamLP duty 114.890216 -> 127.025517
       kW (+12.14 kW); kg_s, eur_h with it; H_feeds -2714.770 -> -3191.008
       kW; Q_boundary -6.046 -> +6.090 kW; residual 464.103 -> 0 kW.  Rows
       that moved only at round-off (~1e-11 relative, the MESH re-converged
       from a seed anchored on the new feed T) were NOT re-recorded.
     * Both cases LEFT `check_energy_closure.KNOWN_OPEN` (196.80 % and
       60.88 % -> 0.0000 %).  No other column case moved a number: 28 of
       the 30 cases using `distillationColumn` are identical except that
       column04's psat advisories are now raised first by the feed
       resolution (an ordering change in its caveat block).
   FOUND, NOT FIXED (a shared report path, so outside a sized slice):
   column04's -78.693876 kW and column08's -891.980060 kW, the two
   "undiagnosed" multi-feed residuals of CLAUDE.md §6, are EXACTLY
   -(Q_reboiler + Q_condenser) of each column.  `EnergyBalanceReport.cpp`
   classifies a unit with >= 2 process inlets and >= 2 process outlets and
   no utility stream as an internal process-to-process exchanger
   (`internalExchanger`) and drops its duty KPIs from the plant boundary,
   so a multi-feed column's condenser and reboiler never reach the first
   law.  The column's own balance closes on the report's enthalpies to
   1e-9 kW (check_feed_thermal_state arm (i2)).  Unchanged by D1 (both
   multi-feed cases' feeds resolve liquid).  Fixing it is a report change
   every case goes through.
   **CLOSED 2026-10-05 (C35, branch `claude/c35-shared-path`, under the full
   regression Vítor authorised for item 4):** internal-exchanger status is
   read off what the unit IS -- `reporting::isProcessToProcessExchanger`
   (`BalanceMath.H`, ONE home: `heatExchanger`, `multiStreamHX`,
   `coolingTower`, the types whose energy-item KPI is heat passed between
   their own process streams) -- with the port count kept as a NECESSARY
   condition (an exchanger with a both-ends-tagged utility side still sends
   its heat through `qBoundary`).  MEASURED: column04 -78.693876 -> 0 kW,
   column08 -891.980060 -> ~-2e-12 kW, and a third member nobody had named,
   `column05_reactive_methylacetate`, +0.163790 -> 0 kW (its reboiler
   0.626731 and condenser -0.790521 kW were dropped the same way; under the
   1 kW band, so never pinned).  Every other unit type the corpus runs with
   >= 2 inlets and outlets (absorber, stripper, extractor, the three dryers,
   electrodialysisStack, evaporator) publishes no boundary energy item, so
   its status changes nothing; the antisolvent crystallisers (Q_kW, 2 in /
   2 out) would have dropped their cooling duty the same way but publish no
   energy boundary (no datum).  Both column pins left
   `check_energy_closure.KNOWN_OPEN_KW`; its unit arm now holds every
   `distillationColumn` row to 1e-4 kW (witnesses column04, column08,
   column01).
   THE EVAPORATOR-CHEST HALF, DONE 2026-10-05 (C35 item 3, branch
   claude/c35-evaporator-latent), and measuring it found a second cause.
   `Evaporator.cpp` now reads an unpinned chest with no split through
   `flashState::resolvedInletVaporFraction` (single phase included), so a
   superheated chest is READ AS VAPOUR AND PRICED -- the fixture
   `check_evaporator_chest_phase` arm (c1) builds (water-only package, 37.8 K
   superheat) runs, publishes the chest at vf = 1 and closes to 8e-10 kW.
   BUT on every corpus evaporator package it is STILL refused: the chest
   carries zero of the liquor's nonvolatile (sucrose, a salt) whose K is 0,
   so `IsothermalFlash.cpp`'s phase test sums `z/K` = 0/0 = NaN in `g_at_1`,
   never classes the stream "superheated vapor" and returns an unconverged
   "two-phase" answer; `equilibriumAt` discards it and the carried default 0
   stands -- in the unit AND in the report, so refusing is the consistent
   answer.  The refusal now NAMES that cause ("could not resolve"); arm (c2)
   pins it as a STALE PIN.  The remedy is one guard in that phase test (skip
   `z_i = 0`), on a path every flash in the corpus goes through: it needs
   a full regression, so it is NOT taken here -- for the commander/Vítor.
   **TAKEN 2026-10-05 (C35, branch `claude/c35-shared-path`, under the full
   regression Vítor authorised for item 4):** every sum over z_i in
   `IsothermalFlash.cpp` skips z_i = 0 (`RR`, `dRR_dV`, the g(V=0)/g(V=1)
   phase test, the substitution step), and so do the siblings of the same
   shape: `DewPoint.cpp`'s sum y/K and x = y/K, and the energy report's
   incipient-phase test (which ABANDONED the whole test on a zero
   nonvolatile's K = 0).  The dropped term is exactly zero wherever it is
   defined, so a state that was finite sums the same numbers bit for bit.
   `check_evaporator_chest_phase` arm (c2) flipped from the stale pin to a
   second (c1): the donor's water + sucrose superheated chest RUNS, vf = 1,
   its row closes to 3e-11 kW.  FOUND, recorded rather than ruled: with the
   flash answering, an undeclared chest ON the saturation curve is read by
   the last digits of its T -- the gate's fixture at Tsat(200 kPa) =
   392.1781136 K now reads as vapour and RUNS (it was refused only because
   the flash returned NaN), 392.17 K reads as liquid and is refused.  Arm
   (a) moved to 392.17 K, and the refusal's text says the side is set by
   rounding.  Whether a pure-component stream within some band of its
   saturation curve should count as UNDETERMINED (refused unless pinned)
   is a rule nobody has written, and is Vítor's.
   **RULED and BUILT 2026-10-05 (C36 item 1, branch
   `claude/c36-saturation-band`):** inside a band set by the flash's own
   tolerance (|ln K| <= 1e-8, ~3e-7 K for water) such a stream is REFUSED
   as UNDETERMINED before any unit runs, naming `phase liquid;`/`phase
   gas;`; the fixture's 392.1781136 K is inside it (|ln K| = 9.18e-9) and
   now refuses there.  OUTSIDE the band the flash decides cleanly and the
   side is still the one the author's rounding chose -- 392.17 K (0.008 K
   below, ~2.6e4 band-widths away) reads liquid and reaches the evaporator's own
   refusal, as arm (a) requires.  The corpus has no stream inside the band
   (nearest |ln K| = 3.4e-3).
   WHAT THE REGRESSION SHOWED IT MOVED (the full sweep of C35 item 4):
     * `utility01_dowtherm_preheat` -- its heater outlet carries ZERO
       dowthermA (K = 0); the exchanger's Q -> T inversion priced every
       trial state above saturation through a NaN flash, fell back to the
       carried LIQUID and published nHexane + C8H18 as a liquid at 617.51 K,
       above both components' Tc.  It now resolves the stream: the outlet
       VAPORISES and lands at 526.36 K, vf = 1, the target enthalpy met to
       7e-9.  Three rows re-recorded (processOut T and the preheater's
       T_cold_out 617.514294852 -> 526.359227681, LMTD 64.7267220716 ->
       162.011885097), and the tutorials guide's two goldrows with them.
       `check_cp_range_announced`'s SPAN arm lost its witness for the same
       reason (no liquid Cp is integrated past a window any more) and reads
       column01_benzene_toluene now; its POINT arm keeps utility01.
     * `utility02_hitec_csp_heater` -- **RE-SPECIFIED, not re-recorded
       (commander's decision under C35, 2026-10-05): the water side is now at
       48 bar**, where the engine's own `bubbleT` on this package gives
       T_sat = 525.8758 K, so the 517.4009 K outlet is subcooled by 8.5 K, as
       the case header always meant (stated there with both Tsat values).
       Every golden row reproduces unchanged (no row pins P; the liquid
       outlet, the duty and the salt side do not depend on it); the
       description line and the tutorials guide moved with it.  The
       pure-component two-phase outlet the 40 bar case exposed is a named
       debt in §5 (2026-10-05, HEAT EXCHANGER).  What follows is the
       40 bar diagnosis that led there.  40 bar water with zero hitecSalt.  The case's
       water Antoine (Trange 273-373 K, extrapolated) gives Tsat(40 bar) =
       515.5797 K, and the old answer, 517.4009 K, was a liquid 1.82 K ABOVE
       its own saturation temperature, reached only because the flash
       returned NaN there.  The flash now answers, the target enthalpy lies
       INSIDE pure water's latent jump (about 0.5 % of the feed would boil),
       and the exchanger's bisection, which cannot represent a pure-component
       two-phase state, lands ON the jump at 515.5797 K labelled liquid --
       137.5 J/mol (3.06 kW, 1.5 % of the 208.47 kW duty) short of the target
       (boilerOut T 517.400926398 -> 515.579741933, boilerHX T_cold_out the
       same, LMTD 306.566828203 -> 307.593136063).  The reason is stated,
       and the new number is still wrong, so it is not pinned; the case's
       energy report is UNAVAILABLE (hitecSalt has no datum), so no gate sees
       the 3.06 kW.  Remedies, not taken: the inversion returning the
       two-phase outlet at Tsat with q = (H - H_L)/(H_V - H_L) (which then
       needs a carried vf a re-flash of a pure component cannot reproduce --
       the CLAUDE.md §3 pure-component pin), or the case declaring a feed
       that stays below its own Tsat.
     * `check_convective_dryer` arm (f)'s "air with no declared phase" probe
       was refused only because the air's flash returned NaN on the absent
       sucrose; undeclared 420 K air now resolves as vapour and RUNS (new
       arm (f0)), and the refusal is probed with air DECLARED liquid.
   Also named, not changed: a superheated chest's condensate is published at
   T_steam (the model's statement), not Tsat(P_chest); a multi-effect
   train's vapour chests are superheated by their BPE in the same way, so
   moving it moves every multi-effect golden.

## 5. Known debts (severity-ish)

**2026-10-05 -- `--fast` IS RED ON A CLEAN CHECKOUT THROUGH `check_mass_closure`'S
ATOM-SCOPE ARM.  FOUND (C35); CLOSED THE SAME DAY by C36 item 5 (see §4c):
the arm judges only plants run in this pass, through the files that pass
says it wrote, and ammonia02 is back in FASTSET.**  The arm looks through every
`tutorials/plant/*` run output for a plant publishing a process atom scope;
the only two that declare `utilities` (ammonia02, ammonia03) are outside
`tutorials/FASTSET`, so a fresh worktree has no such output and the arm
fails "found NO plant publishing a process atom scope", while a checkout
holding stale run outputs passes -- a verdict that depends on leftovers.
Remedy (a gate change, not yet taken): under `--fast` the arm judges only
in-scope witnesses, or FASTSET carries one utility-declaring plant.

**2026-10-05 -- A HEAT EXCHANGER CANNOT PUBLISH A PURE-COMPONENT TWO-PHASE
OUTLET.  NAMED (C35, found by the full regression of item 4); CLOSED
2026-10-05 on branch `claude/c36-pure-twophase-outlet` (C36 item 3), see the
closing paragraph below.**
`HeatExchanger.cpp`'s Q -> outlet-state inversion bisects on H(T) at fixed
P.  For a stream with ONE present component, H(T) jumps by the whole latent
heat at Tsat(P) (the flash classes a pure component single-phase on either
side), so a target enthalpy INSIDE the jump has no root: the bisection
converges onto Tsat and publishes the outlet single-phase, short of its duty
by the unboiled (or uncondensed) fraction's latent heat -- at exit 0.
MEASURED on `utility02_hitec_csp_heater` as shipped before C35 (40 bar): its
target lay ~0.5 % of the feed inside water's jump, and the outlet landed at
515.5797 K labelled liquid, 137.5 J/mol (3.06 kW, 1.5 % of a 208.47 kW duty)
short; no gate saw it, because that case's energy report is UNAVAILABLE
(hitecSalt has no enthalpy datum).  Until C35 it was MASKED: the flash
returned NaN on the zero-hitecSalt component above saturation and the
inversion priced a superheated liquid instead.  The case was re-specified
(48 bar) so it no longer reaches the jump; the unit was not changed.
Remedy, not taken: when the bracket's two ends straddle a single-component
jump, publish the two-phase outlet at Tsat with q = (H - H_L)/(H_V - H_L) --
which then needs the stream to CARRY that q as a pin, because a re-flash of
a pure component on its curve cannot reproduce it (CLAUDE.md §3, the
pure-component exception), and every reader that re-resolves produced
streams must honour it.  The same shape applies to any unit that inverts
H(T) on a pure stream (`heater`, `phaseChanger`): not enumerated yet.
CLOSED (C36 item 3, Vitor's ruling: the remedy above, taken).  ONE home,
`src/unitOperations/flash/PureSaturationPlateau.H`: `soleComponent` (z_i > 0
for exactly one i -- the flash's own presence test, deliberately narrower
than `isEffectivelyPure`), `pureSaturationLegs` / `plateauQuality` (the
plateau's ends read off the package's own two-phase blend, which is linear
in q, so a published q prices back to the target to round-off),
`bisectIncreasing` + `qualityAtJump` (the exchanger's bisection, verbatim,
now keeping BOTH bracket residuals: a continuous root leaves them micro-J/mol
apart, a jump a latent heat apart) and `pinnedPureQuality` (a pinned,
0 < vf < 1, one-component stream dict: its pin is its state).  ENUMERATED:
  * `heatExchanger` (`HeatExchanger.cpp:873-887`): a side whose bisection
    closes on a single-component jump publishes T = Tsat with its quality,
    `phasePinned` (`:924`, `:927`); its inlet reads a pure pin (`:91`) and
    its H-gap measures both through the pin (`Hinlet`/`Houtlet`, `:806`,
    `:889`).  `utility02` at its ORIGINAL 40 bar, run on this build: the
    outlet leaves at 515.5797 K with vf = 0.003854, and the water side's
    published dH is 208.465443 kW against Q = 208.465443 kW.
  * `heater` -- THE SAME SHAPE, refused rather than short: its Newton on T
    cannot meet its tolerance on a jump, so the unit returned unconverged and
    the run stopped (measured on the witness with the new path disabled:
    `Flowsheet: unit 'trimCooler' failed to converge`, exit 2, its outlet
    labelled vf = 1 at Tsat -- a refusal of a physical state).  Where the
    Newton fails on a single-component stream it now brackets, bisects and
    reads the plateau through the same calls (`Heater.cpp:284-336`), and
    publishes the outlet pinned (`:462`); its inlet reads a pure pin (`:127`).
  * `phaseChanger` -- NOT the shape: it tests the plateau BEFORE any search,
    in every mode that has one, so it never lands on the jump.  It now pins a
    pure plateau outlet (`PhaseChanger.cpp:537`, `:977`, `:1456`) and reads a
    pure inlet pin in all three modes (`:171`).  FOUND on the way: its three
    copies of the extrapolation to the plateau's ends scale about ZERO
    instead of translating, so on any non-zero datum the plateau quality and
    the published duty are off -- the next paragraph.
  * NOT changed, named: `flashState::resolvedInletVaporFraction` (in
    `StreamEquilibrium.H`, another general's file) returns one side of the
    curve for an AUTHORED pinned pure two-phase inlet; the three units above
    read the pin before calling it, every other caller does not.
Witness `tutorials/steady/heat/heatExchanger03_pure_water_plateau` (100 bar
steam partly condensing and 40 bar feedwater partly boiling in one
exchanger, then a `heater` on the wet steam whose target lands on the plateau
again).  Gate: `check_duty_inversion` arms (f)-(h) (Tsat recomputed from the
case's own Antoine record; each side, the heater and the energy report to
1e-4 kW); 3 by-hand sabotages recorded in its docstring, one of which (the
exchanger's pin dropped) passes every exchanger arm and is caught only by
the heater and the report -- a pin is for the READER.  Corpus: every case
using `heatExchanger`, `heater` or `phaseChanger` (34) is byte-identical on
every published number (compared at 1e-12 relative) under the first commit.

**2026-10-05 -- `phaseChanger`'S PLATEAU ENDS WERE SCALED, NOT TRANSLATED.
FOUND (C36 item 3); FIXED on branch `claude/c36-pure-twophase-outlet` in its
own commit, the two goldens NOT RE-RECORDED -- the moved rows are Vitor's
(CLAUDE.md §10), listed in that commit; until he rules,
`reboiler_water_copper` and `condenser01_film_nusselt` FAIL their goldens
on that commit, for this stated reason.**  Three sites (`PhaseChanger.cpp`, the duty mode and both
geometry modes) extrapolated the saturated legs from two interior qualities
as h_f = (h_lo - eps h_hi)/(1 - 2 eps), h_g = (h_hi - eps h_lo)/(1 - 2 eps).
With h_lo = h_L + eps L, h_hi = h_L + (1 - eps) L that is h_L (1 - eps) /
(1 - 2 eps) + O(eps^2 L): exact only for h_L = 0.  The published quality and
duty moved with it, so a geometry-mode unit published a duty that was NOT
its own transfer model's.  MEASURED, both corpus cases that land on the
plateau, both IF97: `reboiler_water_copper` published 111.804645 kW against
its own q_nucleate x A = 111.836571 kW; `condenser01_film_nusselt` published
-506.700517 kW beside its own printed cross-check U A dT = 506.617312 kW.
The fix routes all three sites through `pureSaturationLegs`; measured on a
build of it, each case then publishes exactly its model's duty.  Rows it
moves (8 each, 16): Q, Q_kW, vf_out, the utility's duty_kW / kg_s / eur_h,
boundary Q_boundary_kW and H_products_kW.

**2026-10-05 -- A VLLE FLASH THAT FINDS TWO LIQUIDS PUBLISHES THE SECOND AS A
GAS.  FOUND (C16 slice 2); CLOSED 2026-10-05 on branch
`claude/c34-vlle-ll-fallback` (commit d749d670f + its docs commit).**  What
was done: the split's KIND is a typed field, `FlashSolution::liquidLiquid`
(`IsothermalFlash.H`), set at the two sites that produce a liquid-liquid split
(`IsothermalFlash.cpp:724`, the LL Gibbs minimisation, and `:1002`, the VLLE
search that finds no vapour); the regime strings are unchanged.  Readers
converted, ENUMERATED (the 2026-09-25 rule): the VLLE port assignment
(`:1870`), `printFlashResult`'s LL vocabulary (`:2055`), the duty's
beta-phase vapour fraction and the no-Gibbs-data LL enthalpy branch (both
decided on `phaseSet`, so the VLLE LL fallback also priced its beta liquid as
a vapour in the UNIT's duty), the KPI block (an LL answer now publishes
`betaFraction`, no `V_over_F`, no `K_` ratios, no duty -- the `phaseSet LL`
posture), and in `propertyOps/` PropertyScanBinary, PropertyScanTernary's LL
arm and PropertyEvaluator's three tests (equivalent there: only the two LL
sites ever wrote "two-phase liquid" / "(LL").  Left on the string, named:
PropertyScanTernary's VL / one-phase arm.  MEASURED: witness
`tutorials/steady/flash/vlle04_two_liquids_decanter` (this decanter, the
curate12 record copied unchanged, a STRUCTURAL witness) -- vapour port
F = 0, liquidAlpha 51.80 / liquidBeta 48.20 kmol/h, plant residual
-0.0125 kW where the defect booked -498.04 kW (reproduced to the kW by
sabotage S1); no existing golden row moved.  Gate `check_vlle_fallback`
(4 by-hand sabotages in its docstring).  FOUND ON THE WAY, NOT FIXED: (1) the
-0.0125 kW is the fallback's own MATERIAL imbalance -- it drops a beta_V < 1 %
vapour, keeps the two liquid compositions and renormalises their fractions, so
1.0e-7 kmol/s of ethanol is traded for cyclohexane (element closure off by
0.0008 %); the `phaseSet LL` path conserves exactly.  (2) A genuine
THREE-PHASE answer (`vlle03`) is priced in the unit's duty as
`(1 - beta_alpha) H(x_alpha, liquid) + beta_alpha H(x_beta, VAPOUR)`, ignoring
the vapour, and publishes `F_alpha = F (1 - beta_alpha)` = 0.01647 kmol/s
against its own liquidA port's 0.01131 (and `V_over_F` = beta_alpha, and
liquid-liquid ratios as `K_`); all of it is pinned by vlle03's golden, so
moving it is a list for Vitor.  **(2) CLOSED 2026-10-05 on branch
`claude/c34-vlle03-three-phase` (commit ef0bd4dfc):** `vllePorts` is the one
home for which phase goes on which port; the duty prices a three-phase outlet
port by port (and the feed) through `flashState::priceState` on the datum
route and as vapour + two liquids on the sensible route; F_alpha / F_beta /
F_vapor equal their ports, `V_over_F` is the vapour's share, `K_` became
`K_vapor_alpha_` / `K_vapor_beta_`; vlle03's rows re-recorded with the list in
the commit; gate `check_vlle_fallback` arm (e).  FOUND, NOT FIXED: the energy
report resolves an UNPINNED stream with a VAPOUR-LIQUID flash only, so on a
datum fixture of vlle03 it prices the feed (at the drum's own T and P) as one
liquid where the VLLE search finds three phases -- the unit's duty agrees with
the report (186.48 kW, the vapour's latent heat), while the sensible route,
resolving its feed with the unit's VLLE options, reads Q = 0.  Which reading
an unpinned VLLE feed MEANS is Vitor's.  **RULED AND CLOSED 2026-10-05 (C35
item 4, branch `claude/c35-shared-path`): it means its THREE-phase
equilibrium, in the unit AND the report** -- see C35 item 4 for how.  The
original entry follows.
`IsothermalFlash.cpp:1857` (now `:1870`) picked the
two-phase fallback of a `phaseSet VLLE` flash by `sol.regime.find("VL")`, and
the LL regime's own string (line 1000, now 1001) is "two-phase liquid (LL, VLLE attempt
found V beta ~ 0)" -- "VLLE" contains "VL".  So the beta LIQUID leaves on the
vapour port with `vf = 1` (`phase gas;` in `converged/`), the second liquid
port carries zero, and the energy report books the latent heat that never
happened: 498.03 kW on a 100 kmol/h ethanol + cyclohexane decanter at 340 K
and 3 bar (scratch case, the curate12 pair; record
`docs/design/binary-pairs-from-open-measurements.md` 6.5).  No corpus case
reaches it today -- `vlle03` is the only `phaseSet VLLE` case and it solves
three phases.  The remedy is a test on the regime's KIND rather than a
substring of its prose (the 2026-09-06 lesson: a string meant for a human is
not a channel the engine should parse); a witness should pin it.

**2026-10-01 -- A FEED DECLARED WITH T, P AND `vaporFraction` IS OVER-SPECIFIED,
AND THE ENGINE NEITHER REFUSES IT NOR SHOWS WHAT IT USES.  CLOSED 2026-10-03
on the standing mandate (branch `claude/flash01-overspecified-feed`): the
reader REFUSES a mixture's third value naming the rule and both remedies, the
writer emits `vaporFraction` for a pure two-phase stream only, the surface
(table, JSON, report label and pricing) draws the state an unpinned inlet
MEANS, 133 corpus lines deleted and 7 rewritten as `phase` by
`bin/curate/migrate_overspecified_vf.py`, flash01 declares T and P only.
MEASURED: the 52 affected cases pass with ZERO golden rows moved (the flash
and the column resolve their feeds themselves; init0 seeds are overwritten;
`phase liquid;` builds the same stream as `vaporFraction 0`).  The corpus
count below was wrong by a third: 142 tracked files, 140 mixtures, 52 cases.
Gate `check_overspecified_stream` (5 sabotages); record
`docs/design/a-stream-is-fixed-by-two-variables.md`.  NOT done, named: units
that read their inlet's `vf` bare during the solve (valve, adiabaticFlash,
heatExchanger, storageTank) still see the default there.  [CLOSED for those
four 2026-10-04, C33; a dozen more readers are ENUMERATED there.]
MERGED ONTO `main` 9370451c4 (the D-ET2 + Wang-Henke integration) on
2026-10-04 and fully regressed there.  §0.4 reason for the full sweep: the
slice changes how every unpinned inlet stream is resolved (the energy
report, the flash, the column feed), a path most steady cases go through,
and the merge combines it with an engine change that moved 12 goldens.
Found on the merge and fixed: the resolution pass re-resolved a sectored
plant's bare boundary LABEL (`vapor` -> `SEPARATION.vapor`) in the global
world, pricing esterification2sector's NRTL flash vapour as a liquid -- the
whole of its claimed 170.979 % -> 44.927 % improvement; a label now takes
its source's answer and that case is back at 170.979 %, golden unmoved.
Seven goldens re-recorded, one mechanism (the report prices an unpinned
inlet on its own equilibrium, not the vf = 0 default): acetone05,
acetone07, column03, coolingTower01, tsa01, perUnitThermo01 and userOp01
(the last NOT on the list shown to Vítor -- a `code/` case the standalone
seed cannot run; same mechanism).  Full `bin/runTests` on the final
branch: **PASS 673 / FAIL 5 / EXPECTED-FAIL 6**.  Four FAILs are pre-existing
on `main` and unreachable by this slice (`check_internal_states` arm (q),
`check_sealed_corpus` on membrane19/unsteady04, `check_decision_index`'s
three unindexed records, `energy-T2:plant` at 1.0298 %); the fifth,
`gen_tutorials_guide`, was the guide's golden tables trailing the
re-record and is regenerated in the commit that carries this sentence
(`--check` OK).  `bin/runTests --gui`: 4682 tests and the typecheck pass,
the one FAIL being the same arm (q).  The entry as written on 2026-10-01
follows.**  Seen by Vitor on the landing case
`flash01_benzene_toluene`, whose `0/feed` declares T 370 K, P 1 bar AND
`vaporFraction 0.3039835731` for a 40/60 benzene/toluene mixture.  By Duhem's
theorem a stream of known component flows is fixed by TWO intensive
variables; for a mixture T and P already fix the split, so the third is
either redundant or a contradiction.  Three defects, measured on a scratch
copy:
(1) the WRITER emits `vaporFraction` beside T and P for every 0 < vf < 1
(`StreamStateIO.cpp:396-409`, whose comment "T,P alone do not fix the split"
holds for a pure component on its saturation curve, not for a mixture);
(2) the READER accepts all three silently (`StreamStateIO.cpp:3096-3113`)
although the header promises "THREE top-level state vars over-specify ...
-> FATAL" (`StreamStateIO.H:42`) -- with `vaporFraction 0.9` the run exits 0,
the stream table and the GUI print vf = 0.900, and the energy report prices
the feed at its resolved 0.304 and closes, so the number shown is not the
number used;
(3) the STREAM TABLE prints the carried vf, not the resolved state: with the
line removed (the correct declaration) the feed shows vf = 0.000 and
H = 37 807 J/mol (1050 kW, a liquid) while the first law uses 1325.78 kW, a
275 kW disagreement about one stream between two surfaces of one run.
Remedy proposed to Vitor, not built: the table/JSON draw the resolved state
of an unpinned stream; the reader refuses `vaporFraction` beside T and P on a
mixture, naming the two-variable rule (a pure saturated stream keeps
`phase gas|liquid`); the writer stops emitting it for mixtures; flash01
declares T and P only.  (1)-(3) reach every case, so a full regression and
Vitor's authorisation are required; 156 tracked `0/` files declare
`vaporFraction` and how many are mixtures has NOT been measured.

**2026-10-01 -- AN ADIABATIC `temperatureApproach` CAN TAKE THE WRONG SIGN
FROM ITS SEED, AND THE BED THEN ENDS ABOVE ITS OWN EQUILIBRIUM.  CLOSED
2026-10-03 (branch `claude/adiabatic-approach-direction`, under the 4c
standing mandate; record
`docs/design/the-approach-direction-is-read-from-the-answer.md`).**  Found
while checking a design-project group's report ("with a 10 K approach the
conversion comes out very high").  In `mode adiabatic`
`GibbsReactor::approachDirection` read the thermicity of feed -> equilibrium
at the SEED `operation.T` (announced as such).  A downstream bed whose feed
already carries ammonia, seeded HOTTER than the temperature at which that
feed is itself at equilibrium, read the transformation as DECOMPOSITION
(endothermic), assigned `T - dT`, and landed MORE converted than equilibrium
at its own outlet.  Measured by the commander (scratch copy of
ammoniaStaged03's constant/, 150 bar, the PEQ 2026-27 converter inlet gas,
beds entering 380/420/415 C, dT = 10 K): bed 3 seeded at 495 C ended at
473.6 C with y_NH3 19.73 % (sign "-"); seeded at 435 C at 460.4 C with
18.74 % (sign "+", correct; equilibrium at 470.4 C ~18.8 %).  Reproduced by
the general on an authored third-bed feed (16 % NH3, 8 % Ar, 415 C, 150 bar,
dT = 10 K) against a build of the parent commit: seed 768 K -> 734.235 K /
19.322 % (sign "-"); seed 708 K -> 721.052 K / 18.355 % (sign "+"); the
dT = 0 outlet 727.625 K / 18.836 % from either seed.  **Fix:** in adiabatic
mode the bed is solved ONCE with no approach, the direction is read from the
thermicity of feed -> THAT dT = 0 outlet T0 (the probe equilibrium at T0 IS
that outlet), announced with T0, the seed and the probe's iteration count,
and the bed is re-solved from T0 with the signed magnitude
(`GibbsReactor.H` `AdiabaticProbe`, the adiabatic branch of `solve()`); the
probe's cost is the KPI `approachProbeOuterIterations` (one extra outer
Newton: 5 + 4 iterations on the witness against 5 before).  Both seeds now
end at 721.052 K / 18.355 %, below the dT = 0 outlet in NH3 and in T.
Isothermal mode byte-identical (ammoniaStaged03 diffed between the two
builds).  Two premises of the brief measured false: the seed is
`operation.T`, NOT the `0/<outlet>` file (`UnitInputs.cpp:248-254` hands
the unit only its feed); and `ClausGibbsTool.tsx` cited the adiabatic energy
residual at `GibbsReactor.cpp:188-214`, which was the `approachTemperature`
refusal -- stale before this slice, re-pointed with the other eleven
citations the line shift moved.  Witness
`tutorials/steady/gibbs/gibbs13_adiabatic_approach_direction` (sealed,
golden recorded -- a NEW witness); gate `check_adiabatic_approach_direction`
(3 by-hand sabotages, all caught; S2 -- the announcement dropped -- is
caught by its arm (c) ALONE).  Corpus reach verified: no corpus case
declares an approach on an adiabatic gibbsReactor (the five that declare one
are isothermal or `equilibriumReactor`), and all 31 gibbsReactor cases hold
their goldens.  NOT done: an unconverged dT = 0 probe is announced and read
at its last iterate (no case reaches it).  (`greenAmmoniaIndustrialN2`
declared a 5 K approach on three adiabatic beds for a few hours on
2026-10-01 and no longer does: three Gibbs beds in series give the outlet of
ONE Gibbs reactor at the last bed's temperature, so its converter is one
isothermal gibbsReactor with the approach.)

**2026-09-29 -- THE GIBBS MAP BYPASSED THE PURE-SOLID PATH.  CLOSED the
same day (Vitor: "faz"), with one limit NAMED.**  Found by Vitor in the
`equilibrium-landscapes` EduTool: a map over sucrose, CO2, N2, NH3, H2 and
H2O refused with `sucrose: h_pure_ig(T) evaluates the IDEAL-GAS rung`.
`GibbsMethod::solve` is the ONE home for an equilibrium that may meet a
pure solid ("every caller that may meet a solid calls this"), and
`GibbsMapOp.cpp` called the fluid-only `equilibrium()` at both grid sites.
**Fix:** both sites call `solve`; the CSV gains an `s_<solid>` column (the
deposit, feed mole basis) for each declared pure solid and for no other
species; `elementYield` counts a solid product's deposit; a `moleFraction`
metric on a solid REFUSES by name (it has none in the fluid); the first
unconverged cell's cause is printed beside the count (it had been a bare
number).  GUI: `gibbsMapCsv.ts` reads `s_` apart from `x_`, the drill-down
shows the solid as an amount.  Measured: the seven existing gibbsMap goldens
unchanged, two no-solid map CSVs byte-identical against the previous
binary.  Witness
`tutorials/props/gibbs/landscape07_sugar_nitrogen_all_pathways`: the sucrose nitrogen-fixation REACTANTS with every pathway open
end as CH4 = CO2 = 0.29 and N2 0.39, NH3 1.3e-6 at 25 C / 1 atm and no
sucrose left (the route is permitted, dG -355 kJ on `reactionGibbs`, and is
not where the atoms go); Boudouard deposits 49.6 % of the carbon at 700 K,
1.8 % at 1200 K.  **NAMED, NOT FIXED -- a solid that must REMAIN for the
atoms to close.**  Vitor's exact six species (no methane) leave carbon one
fluid carrier (CO2) with too little oxygen, so the solid-free equilibrium
the solid test starts from does not exist: every cell is unconverged and
now says why (the element-potential Newton's singular matrix).  That is
`GibbsMethod::solve`'s algorithm (solve without the solid, then test it),
the same in the gibbsReactor; a remedy would start from the solid PRESENT
where the fluid alone cannot hold the atoms (a feasibility LP), and is
unscheduled.  Also found and fixed on the way: the Tutorials Guide `.tex`
had not been regenerated after C23/C24 added two cases, which
`gen_tutorials_guide --check` in the FULL suite would have failed on; the
`--gui` validation those slices ran does not include that gate.

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
`solveCore` DIRECTLY and NOT guarded, named not fixed: `pipe`'s inlet regime
detection (`Pipe.cpp` ~129), and every OUTLET search (`valve`,
`adiabaticFlash`, and `IsothermalFlash`'s
own operating resolution -- a flash OPERATED above every Tc would publish a
liquid product).  `Flowsheet.cpp`'s stream-H re-flash runs only on a
CARRIED vf strictly inside (0, 1), so it cannot reach a vf = 1 stream.  No
corpus case reaches any of those with a supercritical feed today, measured
by the suite (only stage D moved).  **`phaseChanger` CLOSED 2026-10-01**
(H_in and `flashAt(T)`, all three entry points, through one local
`resolveAt` that calls the one home): the rewritten green-ammonia case
reached it -- its first inter-bed cooler, fed at 813 K, closed its own
balance 331.8 kW short, and closes now.
**THE REST CLOSED 2026-10-04 (C34 wave 1, item A).**  Each claim above was
verified against the code first and all four were real: `Pipe.cpp:129`
(inlet regime), `Valve.cpp:119` and `AdiabaticFlash.cpp:144` (the outlet
searches) called `IsothermalFlash::solveCore` bare, and
`IsothermalFlash.cpp:1543` (the drum's own operating answer) took
`solveCore`'s answer unguarded.  phaseChanger's local rule -- a discarded
root is replaced by the single fluid phase (V/F = 1, x = y = z), said once --
moved to `StreamEquilibrium.H` as `takeSupercriticalAsSinglePhase` /
`flashDiscardingSupercriticalSplit` / `reportSupercriticalDiscard`, and all
five call it (the flash not for an LL phase set, whose fraction is not a
vapour fraction, and none on a three-phase answer).  The valve and the
adiabatic flash say it only when the CONVERGED answer was discarded.
MEASURED: a one-drum fixture built from stage D's converged `reacted`
(844.86 K, 200 bar) published 7.685 of 10.077 kmol/s as LIQUID and now
publishes none; the 159 corpus cases using a touched unit moved no golden.
NOT reached by any output arm, said plainly: the valve's and the adiabatic
flash's outlet searches (their Newton bracket stops at 700 K and no corpus
state below it resolves a supercritical root) and the pipe -- those ride the
source arm (j1) alone.  Gate `check_inlet_resolution` (j1)/(j2), sabotages
S2, S3, S5.  FOUND, NOT FIXED, for Vítor: (a) the pipe has no gas route at
all -- an all-vapour feed (RR V/F = 1, or a discarded root) falls through to
the incompressible-LIQUID path (`Pipe.cpp`, after the two-phase block);
refusing it changes what the engine refuses (§4b); (b) an UNPINNED AUTHORED
stream whose split is discarded keeps its carried vf (0, the liquid rung) in
both `resolvedInletVaporFraction` and the flowsheet's surface pass, while an
outlet search takes the single gas phase -- unit and report agree, both on
the liquid rung for a gas above every Tc; the remedy is in the surface pass,
a path every case goes through; (c) the one home's sentence ends "priced on
the state it carries", which an outlet search does not do (it takes the gas
phase) -- wording, phaseChanger's since 2026-10-01.

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

     **SETTLED AND ACTED ON 2026-09-27 (branch
     claude/det2-flagship-first-law; goldens PENDING Vítor).**  The
     "inconsistency" above is the report's deliberate shape, not a defect:
     `EnergyBalanceReport.cpp`'s `declares` branch gives a unit that declares
     no energy item `items = dH` (its implied duty), no closure, and
     `raw_imbalance_kW = dH`; the crystalliser declares `Q_kW` and so gets
     `raw = dH - Q`.  For an ADIABATIC unit that declares nothing the whole
     dH is unattributed, which is what the balance forbids.  Three of the
     four terms were one family (the state a unit computes with is not the
     state its streams carry) and are CLOSED, each to 0.0000 kW:
       DRYING.SD   a hand balance (constant-Cp air, Watson latent) that
                   charged the latent heat of water the powder kept, and
                   omitted the solid, the superheat and the crystallisation;
       DRYING.BD   the same, plus a T_out floor that evaporated water no heat
                   paid for;
       Fermentor   the CSTR priced its duty on a quality blend where the
                   report resolves the CO2 split.
     All three now price through `flashState::priceState` (moved from
     ConversionReactor, one home).  The plant reads **+10.7949 kW, 1.0298 %**
     -- `energy-T2:plant` STAYS RED by 0.03 pp.  The remainder is
     CONCENTRATION.Evap1 (-10.4180) + Evap2 (-0.3773): the evaporator's
     Watson latent against `H_stream_formation`, which CLAUDE.md 6 already
     RESERVES for Vítor.  So D-ET2 is now a Vítor decision, not a diagnosis:
     the evaporator surface is the whole of what keeps the flagship red.
     Record: docs/design/three-units-and-the-flagship-first-law.md.

     **CLOSED 2026-10-05 (C35 item 3, Vítor's ruling; branch
     claude/c35-evaporator-latent).**  The evaporator's duty is
     `F_chest [h(chest) - h(condensate)]` on the package's own surface
     (`flashState::priceState`), and its process side is priced on the same
     surface -- the unit's row needs both.  Measured: the flagship's plant
     residual +10.7949 kW (1.0298 %) -> -0.0003 kW (0.0000 %), Evap1/Evap2
     remaining -10.4180 / -0.3773 -> 2e-10 / 5e-12 kW; `energy-T2:plant`
     PASSES (the runTests block, reproduced verbatim).  The 3.4e-4 kW that
     is left is FERMENTATION.Mixer's, unchanged by this slice.


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
     (5) ~~**FOUND, NOT FIXED: Wang-Henke closes its component balances
     only to its step tolerance.**~~ **FIXED IN THE ENGINE 2026-09-28; THE
     GOLDENS ARE NOT RE-RECORDED -- the moved-row list goes to Vitor first
     (CLAUDE.md §10, a re-record is a claim).**  Reproduced first, from the
     result JSON over each column's own ports: column15 6.286e-8, column14
     4.215e-8, column11 3.691e-8, column01/09/10 and heatlink01 2.513e-8,
     column16 1.392e-8, heatlink02 1.056e-9, and on the representative
     passes optim01 4.842e-7, optim06 6.012e-7, pareto01 8.595e-7,
     sensitivity01/02 7.436e-7 -- all as filed.  The filed list MISSED ONE:
     `process05_isomerization_recycle` runs a Wang-Henke column inside a
     Wegstein recycle (4.403e-11, under 1e-9 by luck of a fast
     contraction) -- 15 Wang-Henke cases, not 14.  THE RULE IT HAD
     (`DistillationColumn.cpp`, the outer loop's step 5 on the parent
     commit, line 799): `if (maxDx < tolX) { converged = true; ... }` --
     the largest change of any liquid mole fraction between two passes,
     against `compositionTol` (1e-6, 1e-7 declared on most cases).  That is
     a statement about the STEP of a successive substitution that contracts
     by a constant factor per pass (0.64 on column01, near 1 on the
     Klemola splitters), so the distance to the fixed point, and with it
     the open balance, is the step divided by (1 - rate).  TAKEN: the
     `solver/Convergence.H` rule by hand, the MESH's own number -- a pass
     is accepted only when, on the state it will PUBLISH, every stage's
     component balance (with y = Keff x, the published profile) and the
     column's balance over its ports close to 1e-9 of the feed, every
     bubble point |Sum K x - 1| to 1e-9, and the declared `compositionTol`
     step still holds (a declared control is honoured, now as one
     condition of four).  The inner bubble-point Newton is solved to
     1e-12, not 1e-8: it returns without a step once its SEED meets the
     tolerance, so at 1e-8 T stopped moving as soon as the per-pass change
     in x was small and the balances stalled at ~4e-9 on column01 (that
     was the first measurement of the closure stop, and it failed).
     ALTERNATIVES MEASURED on the 15 cases (passes; closure of the ports):
     the closure stop -- column01 41 (was 33), column14 396 (349), column15
     531 (426), optim01 169 (103), optim06 142 (86), pareto01 542 (305),
     sensitivity01 225 (132), every closure 7.4e-10 .. 9.9e-10; a step
     tolerance of 1e-8 with the same bubble points -- 38 / 382 / 485 /
     152 / 126 / 466 / 197 passes and closures still 2.4e-9 .. 8.7e-9 on
     9 of the 11 cases measured, so 1e-8 is not enough; a step tolerance
     of 1e-9 -- 43 / 412 / 544 / 176 / 146 / 547 / 229 passes, every
     closure under 1e-9 (up to 8.6e-10): it works on today's corpus,
     costs MORE passes than the closure stop everywhere, and guarantees
     nothing -- the ratio of closure to step is the column's own (0.3 on
     column01, at least 0.86 on pareto01's representative pass) and a
     slower column breaks it; a final correction pass closing the bottoms
     by difference (xB = (F z - D xD)/B) -- REJECTED without building it,
     from the trace: it makes the PORT balance zero by construction while
     the stage balances stay at the old level (6.9e-9 on column01) and the
     published bottoms stops being the reboiler's liquid, which is a plug
     and a second home for one composition.  Not measured: accelerating
     the substitution (Wegstein / dominant-eigenvalue extrapolation),
     which would cut the passes but changes the method a student reads.
     COST: the Klemola splitters are the whole of it -- column14 58.5 s ->
     78.2 s, column15 67.8 s -> 99.1 s (a bubble tolerance of 1e-10 buys
     back 10 s of that and leaves column15 at 9.97e-10, 3e-12 under the
     tolerance, so 1e-12 was kept); every other Wang-Henke case stays
     under 0.3 s.  ANNOUNCED: `[solver] Wang-Henke: the stop is decided by
     the BALANCES, not the step ...` at verbosity >= 2 (the MESH's
     posture), the iteration table carries `balance/F` beside `max|Δx|`,
     the report prints the stage, port and bubble residuals at every
     verbosity, and the per-pass convergence trace in the result JSON is
     the feed-normalised balance, like the MESH's.  MOVED: the 15 MESH
     cases are bit-identical in every numeric leaf of their result JSON;
     the 15 Wang-Henke cases move 332 golden rows, 326 of them within
     their own tolerance (single-pass cases by at most 2.0e-7 relative,
     apart from two plant first-law residuals of ~1e-9 kW that are
     round-off),
     and 6 exceed it -- 5 in pareto01 (the reboiler duty, V_strip and the
     three steam rows priced from it, 1.1e-4; R itself moved 9.9e-5, just
     inside its 1e-4) because its epsilon constraint
     x_D_LK >= 0.994 is now evaluated on a closed column: at the OLD
     optimum R the old column under-reported x_D by 9.9e-7 (both engines
     run without the driver at both R values), so the converged column
     meets the constraint at a lower reflux; optim06 moves the same way
     (1.96e-5, within tolerance); and 1 in process05, its plant first-law
     residual of -1.2e-9 kW, which is cancellation round-off pinned at
     1e-4 relative (the column13 lesson).  The list, every row with its
     reason, is `MOVED_ROWS_wanghenke.txt` beside the commit that made it
     (not committed).  Gate: `check_degenerate_limits` A7 now derives the
     Wang-Henke columns from the flowsheets as well (15 today) and holds
     each to 1e-9 of its feed over its ports (+1e-11 for the JSON's 12
     figures: a linear method stops just under its tolerance) and every
     STAGE balance recomputed from the published profile and CMO traffic;
     sabotages S10-S13 in its docstring -- S10 (the step stop restored)
     fires on 14 of 15 and process05 ONLY through the stage arm, S12 (the
     ports dropped from the stop) fires on 13 and two survive, which is
     why the stop takes both.

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
