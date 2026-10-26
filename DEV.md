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
sealed manifests), `paper/README.md`, the Guthrie/Turton attribution
(decided 2026-10-05, C38 item 2: the model is `Turton`), the
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
>   the two are different questions.  No number moved.  (Superseded 2026-10-05,
>   C38 item 2: the class and its files are `Turton` too, and `Guthrie` is
>   refused by name.)
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

> **SESSION HANDOFF 2026-10-21 (Vitor stopped the session at 92 % of his
> weekly usage; every general checkpointed to its branch).  START HERE.**
> Nothing below is on main and nothing is re-recorded.
> 1. **G30 + G32 (integ branch `integ/g30g32`, local commit `fddac7e8e` in
>    worktree integ-g6; branch pushed to origin -- redo the merge from the two branches
>    if the worktree is gone).**  The authorised full regression ran (719+
>    results seen).  FAIL: extract01/02, extraction01, vlle01, ternary03,
>    lithiumBrinePlant (G30's LL Newton -- golden rows to LIST TO VITOR
>    before any re-record); solid-service-gate arm A9a pins vlle01's split
>    literal (moves with the vlle01 rows); type-coverage (G32's `ppr78Kij`
>    op has no case -- needs a witness); internal-states and mass-closure
>    gates (not yet diagnosed); sealed-corpus (moody02, on main: unsealed);
>    doc-reference (stale DEV.md note on the integ base, fixed on main);
>    liquid-cp-fallback (red on main before).  Owed: one combined
>    moved-rows list for G28 (column, 239 rows, branch
>    `claude/c123-column-findings`), G30 and G32, shown to Vitor first.
> 2. **G34 / C134 bunds (`claude/c134-bunds`, 7ed5fa0c5):** engine, GUI,
>    Design Guide 21.7, witnesses on greenAmmoniaPEQ and ammonia02, arm (p)
>    sabotage-verified.  Owed: `--gui` (one red: re-point the runLog
>    lesson's `WasmAdapter.ts:290` citation to 291); moved rows for Vitor
>    (greenAmmoniaPEQ plot/land 31 436 -> 38 142.6 m2, NPV -408.63 ->
>    -408.92 MEUR; aceticAcid02 findings 3 -> 5; apalutamide01 1 -> 3).
>    Sweep top items: flare radiation distance, drainage / fire-water
>    run-off, bundle-pulling and crane access, toxic reach and refuge.
> 3. **G33 / C128 slice 2 Hansen mixtures (`claude/c128-solvent-mixture`,
>    0447cc0a6 WIP on d0ba7c6c2):** validated before its rebase; redo the
>    build, codeMap, props/tutorials guide PDFs, gate manifest, the three
>    solvent witnesses, `--gui`, `--fast`.  Its own commit `eaf8b6a42`
>    fixes the SAME missing ln-gamma term in `StabilityTest.cpp` as G30 --
>    merge one, drop the other.
> 4. **G35 / C118 stage 2 phase-split lens (`claude/c118-phase-split-lens`,
>    bcf993f6c):** built; `--gui` never finished, page never seen in a
>    browser.  For Vitor: crystal boxes start unticked; the ice phase is
>    named `solid_<component>`.
> 5. **G36 / C126 GUI figures (`claude/c126-gui-figures`, ccc0b4e37 WIP):**
>    the capture script only, never run end to end.  The commander's brief
>    was wrong twice: the main window has no left case tree (it lives in
>    the Case view), and greenAmmoniaPEQ_baseCase has no sectors -- so
>    Figure A on greenAmmonia03_basicDesign zoomed to the synthesis loop,
>    Figure B (3D) on greenAmmoniaPEQ_baseCase.  Also stale:
>    gui-credo.md "Color By ... Not yet" (ColoursMenu.tsx ships it).
> 6. Open for Vitor from G32: the compressor computes a two-phase feed as
>    vapour in silence; the adiabatic mixer on benchmark case A.
> **APPROVED 2026-10-21 (Vitor, after the list was shown: "sim eu dei-te a
> autoridade para assumires responsabilidade!"):** re-record G28's 239
> column rows (25 cases; 204 the total condenser's duty to the
> distillate's bubble point, 35 the declared condenser type / stage-1
> rule) and G30's LL rows (extract01, extract02, extraction01, vlle01,
> ternary03, lithiumBrinePlant; solid-service A9a's vlle01 literal and
> internal-states (v)/(s) move with them) -- each set RE-MEASURED first,
> and any row outside it goes back to him.  Then integrate G28, then
> G30 + G32 (with a `ppr78Kij` witness), the GUI figures, section 6 of the
> paper on main, and the PDF for his review.  userOp03's 133 % mass
> closure is NOT from these branches (none touches the CSTR) -- to
> diagnose separately.
> **END OF SESSION 2026-10-21 (Vitor at 2 % usage).**  On main: G28 (the
> column) and C134 (bunds, 5fdec2479).  G30 + G32: see G37's branch / main
> log -- if main has no benchmark cases for the open reference simulator, redo step 2 from the APPROVED
> paragraph above.  Papers, each on its own branch, all DRAFT:
> `claude/c126-gui-figures` (white paper v2.3, 21 pp, browser figures with
> the bunds, section 6.4 on five cases), `claude/c126-joss-paper`
> (paper/joss/, 1622 words, the open reference simulator named), `claude/c126-cace-paper`
> (paper/cace/, Computers & Chemical Engineering, 29 pp; the guide for
> authors could not be read -- every journal assumption is a TODO at the
> top of main.tex).  Merge the three paper branches onto main after G30 +
> G32 land and the 6.4 numbers are re-read against main.  Still to
> trace: nine apalutamide01 rows drifting within tolerance after G28, and
> aceticAcid02's new unpinned `Q_condensate_m3_s` KPI.  Then the compressor
> refusal and the adiabatic-mixer fix (decided above), then C135.
> **SATURDAY (Vitor, 2026-10-21): revise the second article from the
> external review** kept at `paper/cace/reviews/2026-10-21-external-review.md`
> on branch `claude/c126-cace-paper` (e323f0447): major revision; the
> recommended order is (1) freeze a version and fix the central cases --
> Cavett's 88 % mixer imbalance is the adiabatic-mixer fix decided above,
> and convergence / physical consistency / acceptance told apart; (2) redo
> the benchmark as two controlled exercises (same models vs different
> models), the sample-file audit to a supplement; (3) nanofiltration with
> equations and a data figure, curation's acceptance rule argued
> statistically; (4) rewrite the introduction against the state of the art
> property by property, less internal vocabulary, fix "hand-written C++"
> and the incomplete references.
> **G30 + G32 LANDED (G37, main ff5c40d12; G28 at 6f4faf2c5)**, each step
> validated before push (build clean, `--gui` and `--fast` green, 118
> cases in reach: exactly the six approved LL cases moved, 35 rows).  Left
> unpinned for Vitor: aceticAcid02's new `Q_condensate_m3_s` KPI, and 70
> KPI rows lithiumBrinePlant never carried.  userOp03's 133 % mass
> closure is on the step-1 build too (not from these branches; the gate
> sees it only when the case's `code/` was built).  **THE SITE IS NOT
> PUBLISHING:** publish-site runs 974, 975, 977, 978 failed at the publish
> step with "Disk quota exceeded" (build, verify and the EduTool smoke
> passed) -- first thing next session.  JOSS paper revised from its
> external review (`claude/c126-joss-paper`, cbb354786, 1594 words);
> JOSS eligibility needs more than six months of public development --
> likely not before January 2027, to be confirmed by Vitor.
> **ALSO SATURDAY: the JOSS paper's three-reader review**, kept at
> `paper/joss/reviews/2026-10-21-reader-review.md` (5db97a66a): reorganise
> around three capabilities, each with one demonstrated example -- study a
> process (the green-ammonia design chain), investigate a model (batch
> electrodialysis), teach with AI (the exercise is Vitor's to choose:
> the reviewer's five steps or one of his own).
> **BOTH REVISIONS DONE 2026-10-25 (`claude/c126-papers-revision`), every
> engine number re-read from a run on one commit (supplement S1 lists the
> commands).**  C&CE (23 pp + a supplement): a state-of-the-art table over
> six observables; convergence / physical consistency / acceptance defined
> and answered apart on Cavett (first law +0.0019 kW of 396 325 kW
> exchanged, against -549 319 before the mixer fix); the benchmark as two
> controlled exercises -- same equations (case E with the sample's own rate
> laws written into Choupo: CH4 conversion 0.7578 vs 0.7532; it exposed
> 400 RK4 steps not grid-converged, now 25 600) and different models
> (A/B/D, each conclusion cut to what the runs show; B re-mapped to
> equilibrium stages, D with its knock-out drum); the curation rule argued
> statistically (U95, chi-square); nanofiltration with its equations,
> verification (NanoFiltran 7.9e-7) kept apart from validation, the
> membrane24 fit and its held-out sulfates' transmission error stated;
> two causal claims withdrawn.  `benchmarks/` changed: reforming01 nSteps
> and a `sampleKinetics` variant, distillation01 stage mapping, compare.py.
> JOSS (~2000 words): three capabilities, one example each -- the green-
> ammonia chain, batch electrodialysis, teach with AI on the REVIEWER'S
> five steps as a stated default Vitor may replace.  Response-to-reviewer
> drafts in both `reviews/`.  OWED BY VITOR: authors, affiliations,
> ORCIDs, CRediT, funding; the release tag and Zenodo DOI; whether to cite
> the 2005 CACHE News Cavett article (its title names a commercial
> simulator); the upstream offer of the reference-side findings; JOSS
> timing.  UNVERIFIED, marked TODO: every cell of the state-of-the-art
> table against each tool's current release; several bibliographic
> details Crossref could not confirm; the FLOWTRAN light ends against
> Rosen & Pauls; the journals' AI-declaration wording.
> **THE TWO OPEN DECISIONS, DELEGATED (Vitor, 2026-10-21: "Nao me pecas
> nada e decide tu de forma sensata").  Commander's decisions:**
> (a) **Compressor with liquid in its suction: REFUSE by name**, quoting the
> resolved vapour fraction and two remedies (a knock-out drum upstream, or
> a pump if the stream is a liquid).  Reason: a compressor is a vapour
> machine and liquid in the suction is a design fault in practice;
> computing on the vapour root of the overall composition in silence is
> the "state a unit computes with is not the state its streams carry"
> family; wet compression is new physics nobody asked for.  Case D gets a
> knock-out drum before C5, stated in its README as a departure from the
> sample (whose compressor ignores the phase).
> (b) **The adiabatic mixer: FIX it** -- the outlet is the state of equal
> enthalpy resolved on the surface the report prices (`flashState::
> priceState` with the split resolved, as C77 did for the cstr / pfr),
> published with its vapour fraction; "a mixer does not flash" stays true
> of the DECLARED-T mixer only.  It is an enumerated member of CLAUDE.md
> 6's family, and case A's as-built variant shows it creating 49.97 MW.
> Moved rows are recorded by the commander (delegated) and listed in the
> commit.  Both AFTER G37's integration lands, on the new main.
> **INTEGRATED 2026-10-21, step 1 (G28 on main).**  The 239 approved rows
> re-measured first: exactly that set moved, every new value within 1e-6 of
> the list; the list spans 26 cases, not 25.  Recorded with them: 218 rows
> that moved inside their tolerance in the same cases (largest 8.1e-5,
> column08 T_top) and column18_partial_condenser.  NOT pinned, for Vitor: a
> row `--record` ADDED, aceticAcid02_plant `kpi lightsColumn
> Q_condensate_m3_s` (1.0548e-4 m3/s), which main's golden never carried.
> The operation schemas gained `condenser { type total|partial; }` (column18
> uses it; check_schema_coverage refused it).
> **INTEGRATED 2026-10-21, step 2 (G30 + G32 on main).**  Re-measured over
> 118 cases in reach (LL/VLLE, extractors, activity models, PR, compressor,
> phaseChanger, bubble point, the G28 columns): exactly the six approved
> cases moved, 35 rows, all recorded; `--record` also ADDED 70 kpi rows to
> lithiumBrinePlant that its golden never carried -- taken out, NOT pinned.
> Solid-service A9a's literal is now 0.98297949.  `ppr78Kij` has a witness,
> `tutorials/props/molecular/ppr78Kij01_ch4_co2_h2`.  moody02 and
> reconcile01 (both unsealed on main) sealed with bin/choupo-import, each
> reproducing its golden.  userOp03's 133.333 % closure measured on a build
> of step-1 main too: not from these branches.  check_mass_closure sees it
> only when the case's `code/` has been built (a fresh tree leaves it
> "unrun"), which is why the integ sweep saw it and a gate run alone does
> not.  publish-site has failed at its PUBLISH step since run 974 (before
> this integration): `fatal: unable to write loose object file: Disk quota
> exceeded` -- build, verify and the EduTool smoke all pass.

> **C84. AN EDUTOOL: MATERIALS OF CONSTRUCTION, SEALS AND GASKETS -- THE
> PARETO (Vítor, 2026-10-17: "Temos algum EduTools sobre materiais
> selantes de bombas vedantes etc? ... sem aço carbono não havia engenharia
> química ... uma forma pareto de explicar quais os materiais mais usados
> ... e como se escolhem.  Uma secção de metalurgia seria importante").**
> Measured: no such EduTool (registry grep); the engine already uses
> materials in costing (`F_M`) and in the vessel wall (allowable stress,
> `VesselMechanics.H`), from records `carbonSteel`, `SS304`, `SS316`,
> `aluminium` in data/standards/assets -- whose own headers say their
> numbers are UNSOURCED teaching assertions (AP6).  Outline (stated to
> Vítor the same turn): (1) why materials decide a plant -- corrosion,
> strength at temperature, safety, cost; (2) the Pareto: carbon steel
> first and why, then austenitic stainless (304/316, Mo for chlorides),
> duplex, nickel alloys, titanium, copper alloys for exchangers, aluminium
> for cryogenic service, non-metallics (PTFE/PFA linings, FRP,
> glass-lined), refractories; (3) a metallurgy section -- crystal
> structure, carbon in iron, ductile-brittle transition, creep, welding
> and heat-affected zone, passivity; (4) how to choose -- corrosion rate
> and allowance, temperature window, the failure mechanisms that bite in
> chemical plants (chloride SCC, pitting, hydrogen embrittlement and high
> temperature hydrogen attack, ammonia SCC of carbon steel -- the PEQ
> ammonia project), cost; (5) seals and gaskets -- pump mechanical seals
> (single/double, faces, elastomer compatibility), gaskets (spiral-wound,
> graphite, PTFE), packing; (6) what Choupo does with a material -- F_M in
> the cost, the allowable stress in the wall, and what is still
> unsourced.  No tables from no-grant sources (NACE/ASME/API data are cited,
> never transcribed); no new tutorial case.  MERGED 2026-10-17: EduTool
> `materials` (Process design & economics), 23 steps over the six parts,
> no trade names (UNS numbers), no table transcribed; bench re-runs
> `ammoniaReactor03_equilibriumApproach` swapping one vessel's material
> over the four records and shows the engine's wall, F_M, F_P and C_BM.
> FINDINGS for the engine (C85): `maxT` is read and never compared
> (aluminium on a 700 K converter, record maxT 500 K, no warning); the
> Theory Guide mis-states the vessel rule three ways (theoryGuide.tex
> ~23395 F_S = 4 vs S = sigma_y in VesselMechanics.cpp:30; ~23406 a 1.2
> head factor never applied; ~23413 weight "consumed by Turton" while the
> cost reads V_R); the record field `sigma_y` holds an ALLOWABLE stress;
> the wall reads pressureDesign as gauge while F_P subtracts 1 bar.

> **C85. THE MATERIAL'S LIMITS AND THE VESSEL RULE AS THE ENGINE RUNS IT
> (commander, 2026-10-17, from C84's findings, inside the scope Vitor
> authorised for C84: "what Choupo does with a material").**  (a) compare
> and ANNOUNCE a record's `maxT`; (b) correct the Theory Guide's three
> vessel-rule claims and rebuild the PDF; (c) MEASURE the design-pressure
> convention, change nothing.

> **C85 MERGED 2026-10-18.**  (a) ONE home for both limits,
> `src/postProcessing/sizing/MaterialLimits.{H,cpp}`: the maxP comparison
> had been written out four times (VesselSize, StirredTank,
> CatalystBedSize, ConverterShellSize) and is called from there now, every
> warning naming its remedy; `SizingPass` compares `maxT` once per item whose
> material is a construction-material record against the HOTTEST PORT (the
> item's unit's streams; a storage tank's stream; a sector-realised item's
> every unit) -- a lower bound, Choupo has no design temperature.
> Announced (`[rating]` + AdvisoryLog + caveat block), never refused.  None
> of the 21 shipped sizing cases announces; aluminium copies of three
> ammonia cases do, the sector path included.  No golden row moved (21/21).
> Gate `check_design_sheet` arm (t) (4 sabotages; the source check strips
> comments since S3 survived it).  EduTool `materials` steps 22-23 and its
> test re-buried the "never compared" absence.  (b) Theory Guide: S is the
> record's `sigma_y` as it stands (no F_S), m = rho pi D L t (no 1.2 factor),
> m is published and NOT read by the cost; Developer Guide's materials
> example corrected (path, keys, MPa).  Both PDFs rebuilt.  (c) MEASURED:
> the wall, the relief-valve set pressure and the converter shell read
> `pressureDesign` as GAUGE (as docs/ai/case-layout.md says); Turton F_P
> (`Turton.cpp:647-650`) reads it ABSOLUTE and subtracts 1 bar; the corpus
> mostly writes 1.1 x an ABSOLUTE stream pressure.  Gauge everywhere would
> move 207 rows in 15 of 21 sizing cases (up to +2.1 % / -4.3 %); the
> negative moves come from the F_P polynomial applied below its range,
> non-monotone at low P.  DECISION FOR VITOR (moves goldens).  Not done:
> the column shell, the reflux drum and the exchanger call no rating check.
> Validation on the branch at main 4ed8fb29d: `make all`, 21 sizing cases
> 21/0, `--fast` 73/0 (5 expected-fail), `--gui` 5558/5558 with
> `check_doc_references` fixed and re-run alone, the sizing/cost/doc gates.
> Open, unsourced: one temperature-independent sigma_y per record (SS304/316
> 138 MPa to 870/925 K; carbonSteel "@250 C" to 700 K).

> **C86. THE RATING CHECK ON EVERY SIZED SHELL, AND THE PRESSURE
> CONVENTION PREPARED FOR VITOR'S RULING (commander, 2026-10-18, closing
> C85's two "not done" items inside its scope).**  (1) The column shell, the
> reflux drum and the shell-and-tube exchanger call `materialLimits::
> pressure` like the four vessel sizers (announced, no golden moves).  (2)
> PREPARED ON THE BRANCH, NOT RE-RECORDED: `pressureDesign` read as GAUGE by
> every reader (Turton.cpp:647-650 stops subtracting 1 bar), and the
> polynomial F_P (`pressureFactor_poly`, Turton.cpp:289) returns 1 below its
> correlation's lower pressure bound, IF that bound is readable from a
> source the tree already cites (else stop and report); C85 measured that
> below 1 bar g the polynomial returns F_P > 1 (log P < 0), the source of the
> -4.28 % moves.  Output: the full moved-row list with a reason per row, for
> Vitor.  Nothing re-recorded, nothing merged, until he rules.  Status:
> dispatched 2026-10-18.

> **C86 item (1) MERGED 2026-10-18.**  Every sizer that publishes a
> `pressureDesign` calls `materialLimits::pressure`, naming the item by
> `itemId()`: column shell and reflux drum, every shell-and-tube record
> (`exchangerRecord`, reaching the column's condenser and reboiler), and --
> beyond the brief, because the gate's rule demands it -- the multitubular
> bed, evaporator, crystalliser, spray dryer, cyclone and compressor.
> `check_design_sheet` arm (t) extended (an aluminium column09 at 60 bar
> announces four items; per-sizer call count >= `set("pressureDesign"`
> count; S5-S8 caught, S7 only by the count).  No golden moved (21/21); the
> ammonia cases now also announce their exchangers and compressors against
> the records' maxP.  Item (2) is PREPARED as `2c811e3de` on
> `claude/c86-rating-pressure` and NOT merged: gauge for every reader, and
> F_P = 1 at or below 5 bar g on the exchanger set -- sourced from CAPCOST
> 2017's own VBA (`If sPressure > 5`, module `exchangers`; the data sheet
> carries Pmax 140 bar g and no Pmin).  It moves 245 rows in 15 cases (207
> beyond 1e-4): 108 by the 1-bar subtraction removed, 16 by the low-P bump
> removed (2 bar g exchangers F_P 1.0935 -> 1), 121 economics downstream;
> range -6.18 % ... +2.12 %.  DECISION FOR VITOR.  Findings, open: the
> ammonia loops' exchangers (167-220 bar) sit above CAPCOST's 140 bar g and
> nothing announces it; CAPCOST gives the evaporator a non-zero F_P
> polynomial that Choupo's set carries as zeros; CompressorSize's 1.0 bar
> default is unannounced.

> **C86 item (2) MERGED 2026-10-18 on Vitor's ruling ("Sim, integra").**
> `pressureDesign` is gauge for every reader; the exchanger F_P is 1 at or
> below 5 bar g (CAPCOST 2017's own rule).  The 245 listed rows re-recorded
> by editing exactly those rows (the commit names each); 15 cases 15/0,
> `--gui` green (after `npm ci` restored three.js in the primary checkout's
> node_modules).  The EduTool `materials` step 18 and its limit now teach
> "read as gauge, written as absolute" and name the unchecked 140 bar g
> ceiling.

> **C87. THE ACETIC ACID PLANT GETS ITS TANKS (Vitor, 2026-10-18: "O
> processo do acido acetico nao tem tanques de entrada nem de saida!  E isso
> e importante para a analise economica e para o layout").**  Measured:
> `aceticAcid02_plant` declares no `storageTank`; its postDict is SIZING
> ONLY by design (the README leaves pricing to the students).  Slice, on the
> EXISTING case (standing rule: no new case), with the `storageTank` unit and
> sizer that `ammonia02_full_plant` (T101/T201) already uses: a methanol
> feed tank on `freshMethanol` and an acetic acid product tank on
> `acidProduct` (CO arrives by pipeline -- said, not stored); residence times
> author-set and declared as such; sized in the postDict; placed in
> `layoutDict` as a tank area with the case's own declared separations and
> zones; pipes routed; README says what inventory the students' working
> capital must now carry.  Moved golden rows (layout area, pipe lengths)
> listed for Vitor before re-recording.  Status: dispatched 2026-10-18.

> **C87 first round (branch `claude/c87-acetic-tanks`, a5dae3700), NOT
> merged.**  Methanol tank 14 d (1524 m3, 1077 t) + a feed pump (the
> storage sizer refuses a liquid above 1.5 bar, so the methanol is stored at
> 1 atm and pumped to 30 bar); acid tank 7 d (1211 m3, 992 t); tank area 30 m
> north; plot 3388.5 -> 5617 m2; 16 rows moved, 113 appended.  Found: a
> `storageTank` unit has NO sizer -- a tank is sized only as a postDict
> `storage` item on a stream (C44), so the hold time was declared twice; the
> acid is stored at its 1.5 bar bubble point (404 K).  VITOR'S RULINGS
> (2026-10-18): (1) "Sim, e arrefece o acido" -- add a product cooler before
> the acid tank, then show the new moved-row list; (2) "Sim, um so sitio" --
> the storage sizing entry reads the hold time from the `storageTank` unit it
> names, and declaring it in both places refuses.  Second round dispatched
> 2026-10-18.

> **C87 MERGED 2026-10-18.**  `acidCooler` (phaseChanger, 404.14 ->
> 313.15 K, -306.09 kW to cooling water, shellTubeHX 14.03 m2, placed between
> the column and the tanks); the acid tank 1074 m3 for 992 t cold.  Ruling 2
> as an EXPLICIT link: a postDict `storage` entry declaring `unit <name>;`
> reads the storageTank unit's residence time, fill fraction and inlet
> stream, and declaring any of them beside `unit` refuses (so does an
> unlinked entry named after a storageTank unit); unit-less entries (the four
> ammonia cases) byte-identical.  `check_design_sheet` arm (u).  17 rows
> re-recorded on Vitor's approval (list in the commit), 149 appended.
> `--fast` 73/0, `--gui` vitest 5580/5580.  Open: the pump's v.dP is not in
> the liquid enthalpy (plant residual 6.17 kW, 0.098 %); `0/acidShipped`
> keeps a hot seed.

> **C89. TANKS ON THE AMMONIA PEQ (Vitor, 2026-10-18: "faz o mesmo no PEQ
> do amoniaco").**  Measured before acting: `greenAmmoniaPEQ_baseCase`
> ALREADY stores its product (postDict `storage`, NH3Storage, 21 d,
> refrigerated at 238.15 K / 1 atm, two tanks, sized, costed, in the
> layout).  Its inlets are GASES -- H2 from electrolysis at 30 bar, N2 from an
> on-site unit -- and `StorageTankSize.cpp:84-87` refuses a gas ("needs a
> pressure vessel or a gas holder, which this sizer" does not size).  So
> "the same" has no direct analogue; the real question for GREEN ammonia is
> an H2 BUFFER against renewable intermittency (new sizer: a pressure-vessel
> gas store on a declared hours-of-autonomy basis), which is new capability
> and pedagogy -- put to Vitor, not dispatched.  The C87 one-home hold-time
> rule will reach PEQ only if its storage is ever declared as a unit.
> VITOR 2026-10-18: "Avanca".  Slice: a GAS STORE sizer (pressure
> vessels, a postDict item attached to a stream, the C44 shape) on a
> DECLARED hours-of-autonomy basis between a declared maximum and minimum
> pressure, the working gas from the case's own EoS density at both ends;
> wall by `VesselMechanics`, rating by `MaterialLimits`, cost on the existing
> Turton vessel set, split into vessels of a declared maximum volume; placed
> in the PEQ layout with its own zone; the charging compressor said, not
> invented.  Moved PEQ rows listed for Vitor.  Status: dispatched 2026-10-18.

> **C89 first round (`claude/c89-h2-buffer`, c1e194538), NOT merged.**
> `gasStorage ( ... )` postDict list, `GasStoreSize.{H,cpp}`; PEQ H2Buffer 2 h,
> 100 -> 32 bar, SRK density (Z 1.054 at 100 bar), 17.8 t working, 10
> vessels of 362 m3, wall 201 mm.  Turton's vessel F_P (linear in the wall,
> 31.9 here) prices it at ~302 M EUR -- FCI 41 -> 352 M EUR -- about 10x a
> steel-mass estimate (4260 t at 5-10 EUR/kg): a thin-wall correlation far
> outside its range.  VITOR'S RULING (2026-10-18): "Pelo peso do aco" -- the
> gas store is costed by its vessel steel mass x a DECLARED fabricated-steel
> price (EUR/kg, author-set, the catalyst charge's declared-unit-price
> shape), Turton printed beside it as an announced extrapolation.  Second
> round dispatched; moved PEQ rows to Vitor after it.

> **C89 MERGED 2026-10-18.**  `gasStorage ( ... )`, `GasStoreSize` +
> `costing/SteelMassCost` (routed on `costBasis steelMass`): cost = shell
> weight (rho pi D H t, no heads) x a REQUIRED declared installed price
> (`steelPrice`, `steelPriceReason`; absent -> the cost refuses by name and the
> total reads INCOMPLETE); Turton printed as `[comparison] ... EXTRAPOLATED`
> (F_P, t/R) and kept out of every total.  PEQ: 8 EUR/kg (placeholder), 34.11 M
> EUR for 10 vessels; FCI 41.29 -> 98.60 M EUR (the grassroots factors apply
> on top), NPV -296.0 -> -408.6 M EUR.  18 rows re-recorded on Vitor's
> approval (list in the commit), 433 appended.  `check_design_sheet` arm (v).
> `--fast` 72/1 (PEQ before the re-record), `--gui` vitest 5580/5580.  Open:
> no relief valve on the buffer (C62 could protect it); the charging
> compressor unmodelled (announced); `StorageTankSize`'s gas refusal could
> name `gasStorage` as the remedy.

> **C90. THE EXPORTED LAYOUT IN COLOUR, AND ROADS AND SITE BUILDINGS
> (Vitor, 2026-10-18, with two screenshots: "Esta mesmo fixe!  Mas o layout
> gerado para exportar nao esta a cores!  E achas que se podem por as
> estradas a ligar tudo?  Entrada, pavilhao de armazenamento, refeitorio,
> balanca para pesar camioes quando faz falta?").**  (1) Measured: the
> exported page in his browser draws a near-black scene -- the renderer
> follows `prefers-color-scheme` (`layoutRenderer.ts:198-203`) into a NIGHT
> palette (sky, grass, gravel, lights, :274-305, :397-440); the app showed
> the day palette.  Rule taken: the 3D SCENE is always daylight; only the
> page chrome follows the theme.  (2) Roads and site buildings, on the
> existing layout grammar: declared roads (centre-line waypoints, width,
> with source/reason), checked by the engine (a road through a footprint
> refuses; every declared site building and the gate reached; a process
> item with no road within a declared access distance announced), road
> length and paved area published and inside the plot envelope; site
> buildings as declared non-process items by kind -- gate/guardhouse,
> warehouse, canteen, weighbridge (only where the case says trucks are
> weighed) -- each drawn by its kind in 3D, roads as asphalt.  Witness: the
> existing `ammonia02_full_plant` (no new case); PEQ and acetic acid after
> C87/C89 land.  Status: dispatched 2026-10-18.

> **C91. THE LAYOUT WINDOW SIZED BY ITS READER (Vitor, 2026-10-18, with a
> screenshot of the pop-out tab: "A window dos tubos tambem esta fixa.  Eu
> acho que ha boas praticas como ter uma opcao de ver isso ou nao e
> ajustar.  O que achas?").**  Measured: `LayoutPopOutTab.tsx` stacks the
> explanatory text, the toolbar, a 3D view of fixed height
> (`PlantLayout3D.tsx:114`, default 520 px; the tab shows it as a strip) and
> the plot summary and pipe register below.  Agreed: the 3D view fills the
> window and is resizable (drag handle, a fullscreen button); the
> explanatory text, the plot summary and the pipe register become
> collapsible panels (remembered per browser), the pipe register
> optionally docked beside the view; the same in the exported page.  Handed
> to the C90 general (same files, avoids two generals on one page).

> **C90 + C91 MERGED 2026-10-18.**  (1) The 3D scene is ALWAYS daylight
> (`DAYLIGHT` in `layoutRenderer.ts`, the one renderer app and export
> share); only labels, tooltip and panels follow the theme
> (`tests/layoutDaylight.test.ts`).  The cause: `darkScheme()` fell back to
> `prefers-color-scheme` in the exported page.  (2) Roads and site
> buildings: non-process items may carry source/reason; kinds `gate`
> (entrance) and `weighbridge` (drivable) carry meaning (one list,
> `PlantLayout.cpp`); `roads { headroom; access { distance; }; noTraffic;
> network ( { road; width; reason; waypoints } ) }`, orthogonal at grade.
> REFUSED: a road through a footprint, under a rack or pipe below the
> headroom, a diagonal, a waypoint with z, a duplicate name, no access
> block.  ANNOUNCED: road in a no-traffic zone, disconnected network, no
> entrance, gate off road, building not reached, item beyond the access
> distance, weighbridge off road.  Published: network length and paved area
> (exact union), per-road length, rack crossings, per-item access distance;
> roads inside `plotOf`.  `--draft` proposes no road (a network nobody
> chose meets every distance by construction).  3D: asphalt and markings,
> gate barrier, buildings by kind.  ammonia02: gate, warehouse, canteen,
> 6 roads, 356 m, 2140.75 m2; no weighbridge (product and makeup by pipe,
> said in the case); plot margin 10 -> 5 m (its reason was the perimeter
> road, now declared).  (3) C91: the pop-out view fills the window, tables
> in a foldable bottom panel (`LAYOUT_TABLES_PANEL`, height dragged and
> remembered), each table a remembered section, full screen; the export
> the same with `<details>`.  NOT done: docking the register beside the
> view (no right-edge panel rule).  8 rows re-recorded on Vitor's approval
> (list in the commit), 46 appended.  Gate `check_plant_layout` arm (k).

> **C92. THE FULL PLANT'S TANKS SIZED AND PLACED (Vitor, 2026-10-18: "No
> full plant tambem faltam os tanques de armazenamento").**  Measured:
> `ammonia02_full_plant` DECLARES two `storageTank` units (T101 on `makeup`,
> 0.5 h; T201 on `productNH3`, 48 h) but its postDict sizes neither and its
> layoutDict places neither, so neither is drawn, costed nor counted in the
> plot.  Neither can be sized today: `makeup` is a GAS (300 K, 25 bar) --
> the C89 gas store; `productNH3` is a PRESSURISED liquid (250 K, 20 bar),
> which `StorageTankSize.cpp:84-94` refuses above 1.5 bar.  Plan, after
> C87 (one home for the hold time), C89 (pressure store) and C90 (same
> layoutDict) land: T101 as a pressure gas store; T201 either let down to a
> refrigerated atmospheric tank (the PEQ precedent: a storage flash) or kept
> as a pressurised liquid store (spheres/bullets, the C89 sizer extended to
> a liquid) -- the commander's default is the pressurised store, which
> leaves the process untouched; both placed with zones; moved rows to
> Vitor.  Status: queued 2026-10-18.

> **C92 first round (`claude/c92-ammonia02-tanks`, c920f6596), NOT
> merged.**  `StorageLink` (one home for `unit <name>;`, all three stores);
> `gasStorage` linkable; new `liquefiedGasStorage` (pressurised liquid,
> design pressure >= the package's bubble pressure, new
> `BubblePoint::pressure`).  T201: 7 bullets of 690 m3 at 22 bar, 9.9 M EUR.
> T101: 4 vessels, 13.7 M EUR for 35 t of syngas -- NPV 99.4 -> 14.8 M EUR.
> FINDING (not fixed, every case's path): `flashState::equilibriumAt` reads
> the let-down liquid as single phase down to 16.7 bar against a 20 bar
> bubble pressure (its phase test evaluates K with y = x).
>
> **C93. VITOR'S RULING ON C92 AND A FENCE (2026-10-18: "Sim tira T101, mas
> coloca uma Fence em volta da fabrica e poe a pipeline atravessar a fence
> com uma forma de identificar que a feed vem do parque industrial
> adjacente").**  (1) Remove T101 -- the syngas arrives by pipeline; keep
> T201.  (2) A perimeter FENCE around the plant, declared in layoutDict and
> checked: roads cross it only at a gate, every boundary stream crosses it
> at a declared battery-limit point naming where it comes from / goes to
> (the makeup syngas: a pipeline from the adjacent industrial park), drawn
> in 3D with the pipeline and a label at the crossing.  Handed to the C92
> general on its branch.  Moved rows to Vitor before re-recording.

> **C92 + C93 MERGED 2026-10-18 (Vitor: "Sim, integra e publica").**  T101
> removed (syngas by pipeline from the adjacent industrial park); T201 kept
> (7 bullets, `liquefiedGasStorage` linked by `unit T201;`, design pressure
> >= the package's bubble pressure, new `BubblePoint::pressure`);
> `StorageLink` is the one home of `unit <name>;` for all three stores.
> FENCE: derived from the plot (one home), openings at gates; a road meeting
> it away from a gate and an item across it REFUSE; every boundary stream
> crosses it at a battery limit on the fence carrying a declared from/to
> label (unlabelled -> ANNOUNCED); drawn in 3D with the pipeline and its
> sign.  `notRouted` must be empty on ammonia02 (gate arm); an unrouted
> stream elsewhere is drawn as a dashed stub with its reason.  ammonia02
> declares its pipe rack (the default-rack witness moved to a probe copy).
> FCI 55.42 -> 72.00 M EUR, NPV 99.37 -> 63.81 M EUR, IRR 28.9 -> 20.1 %.
> 31 rows re-recorded and 14 T101 rows removed on Vitor's approval (list in
> the commit); 346 appended.  NEXT, separate: the pipe/footprint clash check
> (written, held back).  Proposed, not done: separate inlet/outlet nozzles
> (moves pipe lengths in every layout case).

> **C93 follow-up MERGED 2026-10-18: the pipe/footprint clash check.**
> `PlantLayout.cpp`, after every route is final: a pipe segment crossing a
> placed item's footprint (disc for a vertical cylinder, rectangle
> otherwise) between its base and top is ANNOUNCED `pipeClash` (stderr,
> caveat block, JSON), never refused; the pipe's own end items skipped.
> `check_plant_layout` arm (m): engine list = gate's recomputation on the
> pipe cases, two clash probes, one corner negative, S36/S37 caught.  Clash
> list over the six corpus layout cases: EMPTY (the warehouse "clash" was a
> perspective illusion; the pipe is 9.5 m clear).  No golden moved.
> `--fast` 73/0, `--gui` 32/0 on the branch.  Open, small, recorded only:
> shared inlet/outlet nozzle at each item's top centre; T201 vessels 2-7
> unpiped (C80 first-item rule); the route simplifier merges doubled-back
> segments (its comment claims the length is unchanged -- unverified); the
> entrance road stops ~5 m short of the fence opening.

> **C96. SITE LOGISTICS ON AMMONIA02: OFFICES, WEIGHBRIDGE, TRUCK
> CIRCULATION, CAR PARK, AND WHAT GOOD PRACTICE STILL MISSES (Vitor,
> 2026-10-18: "No Layout falta os escritorios, bança de camioes ... tem de
> haver forma de a estrada permitir que os camioes possam entrar e sair sem
> fazerem grandes manobras!!!  E e preciso parque de estacionamento para os
> carros (ate podes por varios orientados de forma a poder sair
> rapidamente).  Ve nas boas praticas de layout se faz falta mais alguma
> coisa importante.").**  On the EXISTING case (no new case).  (1) An office
> building near the gate, outside the hazardous zones.  (2) A weighbridge
> on the truck route (trucks still come: catalyst, chemicals, maintenance,
> waste -- C90 had left it out because product and feed move by pipe).  (3)
> TRUCK CIRCULATION checked by the engine: a declared truck route from a
> gate back to a gate through the weighbridge that needs NO reversing -- a
> one-way loop or a turning circle of a declared diameter (source/reason);
> corners at least a declared truck turning radius; a dead end on the route
> ANNOUNCED.  (4) A CAR PARK near the gate, outside the fence or before the
> process area, its bays drawn and oriented for a forward exit (drive-through
> or reverse-in bays), its area in the plot.  (5) The good-practice items
> still missing, chosen and justified by the general from the Design Guide
> §21 and its sources: e.g. a second (emergency) access gate, muster points,
> fire-water storage and pump house, a laydown / maintenance area, a
> windsock.  Design Guide §21 updated for truck circulation, parking and
> those items.  Moved rows to Vitor before re-recording.  Status:
> dispatched 2026-10-18.  MERGED 2026-10-18 (branch
> claude/c96-site-logistics): `truckRoutes`/`designVehicle`/`turningAreas`
> walked by the engine (path, corners, outer edge vs the design vehicle's
> 12.5 m outer radius, Council Directive 96/53/EC Annex I 1.5; reversal,
> sharp corner, missed weighbridge... ANNOUNCED), a `carPark` kind with
> `parking {}` (bays that do not fit REFUSED, reverse exit ANNOUNCED),
> `musterPoint`/`firePumpHouse` with exposure checks, every road extended to
> its fence opening (closes the C93 "5 m short" item).  ammonia02: route
> `deliveries` 256 m CLEAR, 22 reverse-in bays, offices, emergency gate,
> two muster points, fire water, laydown, windsock; the plot grew south.
> Vitor approved the 20 moved rows (land 983 212 -> 1 104 450 EUR, NPV
> -117 675 EUR, IRR 20.12 -> 20.08 %, plot 19 664 -> 22 089 m2, placed 18
> -> 28, roads 434 -> 537 m, fence 596 -> 620 m, gate/warehouse/
> productStored moved with the fence); 131 rows appended.  NOT done, named:
> fire-water ring main and hydrants, bunds, escape routes, swept path, a
> fillet running through an item.

> **C129. A FINAL-DETAIL PHASE OF THE 3D LAYOUT: PUMPS, CONTROL VALVES,
> RELIEF VALVES ON THE LINES, AND MANWAYS AND FLANGED NOZZLES ON THE
> EQUIPMENT THAT MERITS THEM (Vitor, 2026-10-21, before going to bed:
> "deve haver uma fase em que e possivel adicionar bombas e valvulas de
> regulacao de caudal e de pressao e valvulas de alivio de pressao, para
> fazer o layout 3D final ... os equipamentos que merecem tem de ter
> porta de homem e flanges de ligacao apropriadas ... numa opcao de
> detalhe final?  Podes por na amonia verde?").**  Commander's reading,
> to be put to him in the morning: yes, reasonable, as an OPT-IN
> `detail { level final; }` (or a `piping {}` block) in `layoutDict`
> that adds nothing until declared -- every existing layout
> byte-identical.  Measured: the flowsheet already has `pump` and
> `valve` units (`UnitOperation.cpp:178,182`) and a `reliefValve` sized
> item (C62, a psv OF the protected unit, set pressure read from its
> `pressureDesign`); the router already places a nozzle per item end
> (`PlantLayout.H:126-136`) but as a point, not a flanged connection; a
> control valve is NOT a unit today (a `valve` is a letdown with a
> declared outlet P).  The slice, as a proposal: (1) IN-LINE ITEMS on a
> routed pipe -- a pump drawn where the flowsheet's `pump` sits (its own
> footprint, suction and discharge nozzles), a control valve DECLARED on
> a stream with its controlled variable (flow or pressure) and placed at
> a declared or defaulted fraction of the route, a relief valve drawn
> at the protected item's nozzle and its discharge routed to a declared
> header or vent -- each a sized item with a datasheet row, nothing
> invented (a valve with no declared Cv/size is a labelled box); (2)
> NOZZLES AND MANWAYS on the equipment that merits them: a nozzle
> schedule per vessel/column/exchanger (service, nominal size from the
> routed pipe's own size, rating from the item's `pressureDesign` by a
> DECLARED flange-class table -- ASME B16.5 classes are a no-grant
> standard, so the case declares the class or the sheet says "class not
> declared"; orientation and elevation declared or defaulted and
> announced), a manway where the item's diameter admits one (a declared
> minimum, announced), drawn in the 3D view by kind on the C88 envelope;
> (3) the witness is greenAmmonia03 (the green-ammonia basic design),
> gaining the block and a before/after pair of screenshots.  What stays
> out and is named: pipe stress, support design, instrument loops beyond
> the valve's declared variable, any vendor catalogue.  Owed to Vitor
> first (pedagogy and scope): whether the control valve becomes a
> flowsheet UNIT (which would change the steady solve) or stays a
> LAYOUT annotation (which the commander recommends for this slice).
> **(4) NOTHING SITS DIRECTLY ON THE GROUND (Vitor, same night: "e
> estranho no layout 3D da amonia haver equipamento montado diretamente
> no chao").**  Measured: the 3D recipes already draw a skirt or legs
> under a vertical vessel, saddles under a drum or an exchanger and a
> skid under a compressor (`gui/src/case/equipmentModel.ts:263-282,
> 406-468, 527-555`), but every one of them starts AT grade, and every
> item of the green-ammonia layouts declares `z 0 m` -- so there is no
> foundation, plinth, pier or structure anywhere, and no item is
> elevated.  The slice: a declared or defaulted-and-announced support
> per item kind -- a ring foundation under a skirt, concrete piers under
> saddles, a plinth under a pump or a compressor skid, a structure where
> the case declares an elevation (a reflux drum, an air cooler on the
> rack) -- the support's height entering the item's base elevation, so
> the nozzle elevations and the published pipe lengths move: a
> measured list of moved `layout` rows goes to Vitor before any
> re-record.  **ANSWERED by Vitor the same night: "a valvula fica no
> flowsheet final que tem a instrumentacao e controlo!  Alias, isto
> tambem devia de poder ser feito."**  So the control valve is not a
> layout annotation and not a steady unit: it belongs to a FINAL,
> INSTRUMENTED flowsheet -- a P&ID layer over the PFD -- which is C130.
> C129 (pumps, relief valves, nozzles, manways, foundations) is
> dispatched when a slot frees; its control valves are READ from C130's
> declaration once that exists, and until then a `detail { level
> final; }` layout draws what the steady flowsheet and the sizing pass
> already hold.

> **C174. NO CLOSURE BY CONSTRUCTION COUNTS AS EVIDENCE (Vitor,
> 2026-10-26: "Aquilo do balanco de energia bater certo porque fazias
> calculos intermedios com base nisso foi muito mau!!!" -- then "Avanca!").**
> The CMO column computed its reboiler as Q_reb = dH - Q_cond, a PLUG, so
> its first law closed BY CONSTRUCTION and check_energy_closure read green
> while the condenser was wrong on all 34 columns (C169).  A balance used to
> COMPUTE a variable cannot then be the proof that the variable is right.
> Scope: (1) enumerate every CLOSURE VARIABLE in the engine -- a duty, a
> flow, a temperature or a stream computed FROM the balance that a gate or
> a report then checks (reboilers, condensers, adiabatic temperatures,
> purges and streams by difference, plug duties in any unit); (2) classify
> each unit/variable: closure verified independently / closure by
> construction, NOT verified / no closure; (3) check_energy_closure, the
> mass and element balance reports and the GUI's balance surfaces stop
> counting a closure-by-construction as CLOSED -- it is reported "not
> verified", aloud, until an independent check exists (the column's
> stage-by-stage and reboiler arms, C169, are the model); (4) for each
> important closure variable, a check by ANOTHER route.  Status: a general
> enumerates and builds (2)-(3) behind a gate that fails first; (4) per
> variable, the list shown before any golden moves.

> **C173. AN EXTERNAL AUDIT OF THE GIBBS AND PHASE ROUTES (Vitor,
> 2026-10-26, forwarding a review by another model: "Auditoria CHOUPO Gibbs
> Fases").**  Its four claims, as summarised (the full report with
> reproductions and line numbers was not reachable from the shared link):
> (1) the VLLE flash and the gibbsReactor `directMin` route minimise a
> Gibbs function whose vapour is ideal even with SRK declared; (2) phase
> selection can lose a stable liquid, or return one liquid because the
> search went infeasible; (3) PC-SAFT trace-component fugacity
> coefficients disagree with the derivative of the same Helmholtz energy
> (a factor of 3.71 in one trial); (4) the ice-liquid equilibrium can
> refuse a valid solution after an excessive Newton step.  Headline:
> ammonia at 700 K and 200 bar, directMin/SRK 30.01 % NH3 against
> elementPotential/SRK 32.39 %.  Status: a general reproduces each claim
> independently in the engine (never taking the review's numbers), states
> which hold, and fixes those that hold behind a gate that fails first;
> the full report asked of Vitor.
> THE FULL REPORT ARRIVED (pinned at c40318b72): SEVEN claims.  The general
> reproduced each on 39d83a96d with its own probe (bin/curate/
> _gibbsAuditProbe.cpp: the case's package, no unit operation -- ln phi, K,
> Psat, g_res, and one reaction's fugacity condition by bisection).  ALL
> SEVEN HOLD.  (1) VLLE with an absent component: vlle03 z = (0.5, 0.5, 0)
> published one liquid, converged, while LL splits it (0.99889/0.00110);
> also at z_C = 1e-8, and three nodes of ternary01's own scan near the B
> corner.  (2) VLLE objective had no ln phi: SRK and idealGas identical; the
> package's own K was 1.6-3.4 % off y/x.  (3) directMin had no ln phi:
> ammonia 700 K / 200 bar on SRK 30.013 % NH3 = the ideal 30.012 %; the
> fugacity condition solved independently gives 32.387 %, which
> elementPotential and reactiveFlash publish.  (4) mixed-liquid onset:
> benzene + toluene 50/50, 350 K, 0.6 bar (y P/Psat 0.328 and 0.862, sum
> 1.190) published as gas by elementPotential and reactiveFlash; directMin
> 76.06 % liquid (Rachford-Rice 76.057 %).  (5) PC-SAFT trace: nHexane in
> liquid propane (300 K, 1 bar) phi 0.8555 at x = 1e-9 against 0.2309
> (3.70x), 0.1448 at x = 0; ethanol at 1e-12 in water ln phi 6.26 against
> 0.91; vapour root 4.8e-4 off the derivative of the package's own g_res.
> (6) two liquid surfaces: ideal + NRTL answered one liquid on whichever was
> listed first; and phaseSet auto on a liquid-only package went to VL and
> Kvec refused it (exit 2).  (7) SLE: 1 mol% ethanol at 270.15/268.15/
> 258.15 K refused as total freezing; the answer is 67.57 % ice at 270.15 K.
> FIXED on branch claude/c173-gibbs-audit, gate first: directMin's vapour
> term carries ln phi (DirectMin.cpp); the VLLE objective carries ln phi,
> searches the PRESENT components, and a search that finds nothing below
> the feed no longer concludes one liquid -- the TPD and an incipient-vapour
> test decide, the narrower LL or VL solve is taken when only one fires
> (announced), otherwise NOT converged (IsothermalFlash.cpp);
> two liquid surfaces are REFUSED by name (a stated default -- extending the
> LL machinery to two surfaces is an architecture call, Vitor's), and auto
> on a liquid-only package goes to LL; supersaturatedCondensables also tests
> the mixed onset (Michelsen's incipient liquid from the gas, gamma
> included): elementPotential REFUSES it by name (one pure liquid by design,
> the route the lesson walks), reactiveFlash carries it (seeded by
> Rachford-Rice; GibbsMethod.cpp, ReactiveFlash.cpp); PC-SAFT steps a minor
> component on 100 h_rel of the total, one-sided below it, and verify()
> holds the trace limit (PCSAFT.cpp; majors bit for bit); the SLE step is
> held to 90 % of the inventory, announced (SolidEquilibrium.H `capacity`).
> Gates: new check_gibbs_real_gas; arms check_vlle_fallback (g)-(j),
> check_pcsaft_association (d), check_gibbs_condensables (f),
> check_ice_freezing (g) -- each FAILS on 39d83a96d (measured by restoring
> the base sources and rebuilding).  ONE GOLDEN WOULD MOVE, NOT RECORDED
> (the list for Vitor): ternary01_audit_vlle diag.lle.n_ll 29 -> 32,
> n_onephase 13 -> 10, n_tielines 22 -> 23 -- the nodes (0.071, 0.786,
> 0.143), (0.071, 0.857, 0.071), (0.143, 0.786, 0.071) were ONE_PHASE and
> are two liquids (beta 0.077 / 0.074 / 0.152 of an A-rich liquid): the
> A-B gap is wide (tau = 5) and the canonical starts had no admissible
> point there.  NAMED, not fixed: the ElementPotential/ReactiveFlash liquid
> tests read y P, not y phi P (the auditor lists it unestablished; no
> witness built); the VLLE's own sub-1 % phase drop and its NM answer carry
> no equal-fugacity polish (0.2-0.3 % in y/x); the electrolyte solids
> service passes no `capacity` (no witness).
> VALIDATED on the branch (2026-10-26): make all; the 71 cases whose dicts
> reach a Gibbs reactor, a phaseSet, named liquid phases, a solid phase or
> PC-SAFT -- 70 PASS, 1 FAIL = ternary01 above, unrecorded; --fast -j 2 76
> PASS / 0 FAIL (5 expected-fail); --gui 38 PASS / 0 FAIL (6543 GUI tests;
> the lesson citations into IsothermalFlash.cpp re-located, GibbsMethod.cpp
> kept line for line); check_compile_clean, check_wasm_dialect, and every
> gate reading a touched source.  PENDING: Vitor's word on the ternary01
> rows, then the merge.

> **C172. ONE GUI OR TWO: PROCESS SIMULATION AND PROPERTIES & DATA (Vitor,
> 2026-10-26, after "Nos temos de por um pouco de ordem nas propriedades!
> Idealmente devem ser a estrategia de um simulador sequencial", "Chamar
> 'Results' no menu aquilo tudo e uma merda!!! No simulador do processo ha
> um 'flowsheet' ... E preciso aqui um nome equivalente", "nao sei se o
> mesmo GUI deve ser usado para o simulador de processos ou para a
> analise de dados!" and "Invoca um forum de generais e decide tu").**
> The commander's own diagnosis, recorded because it is the lesson: the
> props screen grew one slice per request (C147 views, C151 map, C152
> two modes, C153 resizable panel, C154 block states, C157b record round
> trip, C165 per-ion tables), each drawing the next engine fact, none
> starting from what the person comes to do -- the rule the commander
> wrote into CLAUDE.md on 2026-10-25 and broke the same day.  The
> questions: (1) one application with two modes, or two applications
> (Process / Properties & Data) on a shared layer (case, files, Log, help,
> records); (2) the props case as a SEQUENTIAL procedure -- studies, then
> numbered steps, each reading only declared data or EARLIER steps,
> refused otherwise (the props analogue of validateSequentialPlan), its
> name (Workflow, Worksheet, Study...) in place of "Results"; (3) what a
> two-mode case (C152) becomes.  Method: a forum of generals with
> distinct mandates (comparable software and practice; the case FOR one
> app; the case FOR two; the cost in this code; the users' walks), read
> only, each answering the others' strongest point; the commander
> decides, writes the decision with its reasons here, and puts the page
> to Vitor before any code.  No GUI code lands until then.
> Status: recorded; forum convened the same turn.
> NAME RULED (Vitor, 2026-10-26: "Workflow"): the props home is the
> WORKFLOW -- the counterpart of the Flowsheet.  The forum's caution is
> kept as a constraint, not a reason to rename: in KNIME, Galaxy and JMP a
> workflow is an AUTHORED canvas; Choupo's is not -- it is the case's
> declared studies and their steps, shown by position (a numbered outline,
> COMSOL-style), never a canvas to draw on, and the GUI stays a runner and
> viewer.  "Results" keeps only its own meaning: what a run produced (each
> step's output and the after-run summary).
> DECIDED 2026-10-26 after the forum (A practice, B one app, C two apps --
> withdrawn to one app after reading B, D cost, E three users walked at
> 1366x768; the forwarded "radical simplification" opinion answered by
> all): ONE application, one case store, TWO HOMES -- the Flowsheet and the
> Workflow -- each case kind owning its home, menu, Run label and
> vocabulary from ONE table; a two-dict case opens on controlDict.application
> and crosses by explicit links, the home in the URL; the Workflow = studies
> and numbered steps by position (never a canvas), the centre the selected
> study's results, an inspector for the step (fit/held-out roles and band,
> model with its options inside, writes with fingerprint, verdict with
> identifiability), the map behind View; the ORDER enforced by the engine
> (no read of a later write; ctrl17 declares its process-run input); Run's
> four doors -> one; dead and empty surfaces removed; the content the engine
> already publishes reaches the screen.  Acceptance: the decisive test,
> scripted, all cells passing for the three users.  Record:
> docs/design/one-app-two-homes.md (the forum, the decision, the slices).
> Slice 1 (content gaps + removals) goes out after Vitor has read the
> decision page; GUI code lands slice by slice against the scripted test.
> SLICE 2 BUILT 2026-10-26 (engine only, branch
> claude/c172-slice2-props-order): `propsPlan::validate`
> (src/propertyOps/PropsPlan.{H,cpp}) runs before operation [0] and refuses
> by name a read of a file (or a membrane record, by name) a LATER
> operation writes, with the remedy; declared order stays the order.  What
> each op type reads/writes has ONE engine home, the file-traffic table
> there (`choupoProps --file-traffic`; `--plan` runs only the check).
> ctrl17 declares `writtenBy { trajectory process; }` and an absent
> trajectory refuses naming "Run the Flowsheet (choupoCtrl) first";
> ppr78Kij's schema declares the record it writes (the GUI had not carried
> it back) and its group table.  Measured: 134 propsDicts, ~470 operations,
> zero reads of a later write, zero migrations, no golden moved.  Gate
> check_props_order.  FINDINGS, not fixed: ReactionCurve and ThielePellet
> write their CSVs without `records::refuseStandardsWrite` (so a CSV path
> under data/standards/ is not refused there); the GUI's x-choupo still
> holds a second copy of the writes (held equal by the gate; slice 3 can
> read `--file-traffic` instead); the table cannot be proven complete for
> READS (no single read home, unlike writes).
> SLICE 2 LANDED 2026-10-26, rebased on C140, C168 and C161b (props cases
> 17/0, --gui 6516 passed, check_props_order over 135 propsDicts).  The
> commander keeps `writtenBy` as a DECLARATION rather than deriving it from
> controlDict.application: it states intent and lets a case carry a
> measured trajectory.  FINDING, not fixed: check_guide_pdf_fresh judges a
> PDF fresh by git ancestry, so a binary PDF taken whole in a rebase
> conflict (one side's render) passes while missing the other side's
> content -- caught here by reading the text, the PDF re-rendered.
> SLICE 1 BUILT 2026-10-26 (branch claude/c172-slice1; items 5 and 6, no
> Workflow outline and no chrome table): ONE Run in the toolbar
> (ui/RunButton.tsx, "Run flowsheet" / "Run workflow", + Ctrl+Enter; the
> canvas, Workflow and intro doors gone); no Workflow on a process case
> (its readiness at the Case tab's constant/thermoPhysPropDict), "Results"
> retired as a section name (the menu says Workflow), the Audit and its
> five pills rehomed (an op's panel in its details, readiness + decision
> ledger in the thermo package's, comparisons on the overview), the
> per-sector props route and the map's drag seam removed, version +
> adapter in a status bar, Variables/Pinch/Literature hidden when empty.
> Content: a fit's details show the FIT / HELD OUT datasets, the band,
> the held-out statistic in its own unit, the verdict WITH identifiability
> (also in the strip), the parameters as symbols with units (r_p = 0.6748
> nm, case/fitEvidence.ts); a held-out membrane set's line is "predicted",
> and a fitPoints table with a heldOut column splits parity/residuals
> (engine, src/propertyOps/FitParameters.cpp defaultViews,
> src/postProcessing/views/Views.cpp); a fit's case-path proposal is read
> back, shown, and carried by the zip; a record the run wrote is "updated
> by run", not "edited".  NOT DONE, with the reason: the held-out key
> rename -- `aad_heldout_pct` (relative %) and the membrane's
> `heldOut_AAD_pct` (rejection POINTS) are two statistics, and renaming
> moves three rows of membrane24's golden; the engine publishes each one's
> unit instead and the GUI reads both in one place.  Validated: the 26
> cases those edits reach PASS, --gui, the named gates; the forum-E walk,
> before/after, in the report.
> COMMANDER on slice 1: agreed, the two held-out keys stay apart (the
> decision page's "two spellings reconciled" corrected). OWED, recorded
> not fixed: membrane24 declares its band `maxAAD 10 percent` and is judged
> against rejection POINTS -- a band whose unit is not its statistic's
> must refuse by name (engine grammar, a slice of its own); the engine
> publishes no unit for pair parameters (NRTL b in K, UNIQUAC b
> dimensionless) -- units per model, never inferred from a name;
> curate02's held-out dataset is wired to a parity figure that draws only
> the fit points.
> SLICE 3 BUILT 2026-10-26 (branch claude/c172-slice3, GUI + one generated
> file; no engine source touched, no golden moved): THE WORKFLOW.  Left,
> the OUTLINE (ui/WorkflowOutline.tsx, case/workflowSteps.ts): the
> declared studies lettered by position, each with its steps numbered in
> declared order (A.1, B.2; a case with no study is 1, 2, 3); a SET OF
> RUNS -- consecutive ops of one type a declared view draws together as
> one `ops ( ... )` series -- is ONE step (NanoFiltran: 22 ops -> 9 steps,
> B.1 the five dye-4 feeds, C.1 the six node counts); below it, folded,
> the data, models and records.  Centre: the results of the selection
> (overview, study figures-first, a step's figures, fitted parameters and
> per-run numbers; before a run, "What will run").  Right, the INSPECTOR
> (ui/WorkflowInspector.tsx): reads (FIT / HELD OUT, the band), the model
> with its options inside it (a schema-`fixed` slot such as LM is said as
> the op's own method, not as the model), writes with the fingerprints the
> written record states, the verdict with identifiability -- slice 1's
> fit details split into parts and re-homed (PropsDetails.tsx).  The map
> is behind View > Calculation map (store `propsMapOpen`, closed by
> default; C168's fold-after-run retired).  ONE HOME FOR FILE TRAFFIC:
> the GUI reads gui/schemas/propsFileTraffic.json, GENERATED from
> `choupoProps --file-traffic` (bin/curate/gen_props_file_traffic.py);
> the three schemas' `x-choupo.writes` are deleted and check_props_order
> arm (c) now refuses a stale table or a writes copy put back (2 by-hand
> sabotages, both caught).  Walk at 1366x768 (5 users, replayed native
> runs): every cell passes; NanoFiltran Fig. 3 plot at y = 364-744 of 768
> in a 788 px pane after one click on study B (was 543-923, 225 px
> showing); no Workflow text below 11 px (was min 9 px, 141 of 241 items
> below 11 before a run).  FINDINGS, not fixed: the calculation map at fit
> still draws labels at 4.7 px (zoom 0.52, before and after: owed to C168
> slice 2's minimum-label ruling); Plotly legend/tick text at 9 px on some
> overview figures; the fitted membrane record states its own sha256
> fingerprints but not the evidence-partition fingerprint the run
> publishes (the pair proposal does); the status bar's 9 px badges.
> VITOR'S RULING 2026-10-26, on the landed slice 3 ("Tal como o processo
> comeca com a visao do flowsheet, isto nao devia de abrir com o workflow?
> E cada box nao devia de ter uma caixa a mostrar o que esta la dentro?
> Como no flowsheet?"): a properties case OPENS on the workflow DIAGRAM,
> full width, the way a process case opens on its flowsheet.  One box per
> step (A.1, B.2 ...) showing what is inside it without a click: the op
> type, the model and its main options, the data it reads marked FIT or
> HELD OUT, what it writes, its state and verdict; arrows are what one step
> writes and a later one reads (the engine's file-traffic table); studies
> are frames around their steps, as sectors are on the flowsheet; a click
> opens the step's results and inspector; the outline stays as the
> navigation.  This REVERSES the forum's "never a canvas": a diagram one
> looks at is not an editor.  It replaces the old calculation map.  Slice
> 3b, after C168 slice 2 (the minimum label size it uses).
> Same day, his addition ("um double click na caixa fazia abrir um tab com
> tudo detalhado!  Naturalmente o que se ve logo agora iria aparecer noutro
> menu equivalente ao que aparece no flowsheet"): a DOUBLE CLICK on a box
> opens that step in its own TAB with everything in detail (results,
> figures, parameters, verdict, reads and writes); the overview shown on
> opening today (the studies with their figures and tables) moves to its
> own menu entry, the way Streams and Reports sit beside the flowsheet --
> named STUDIES (the case's own word in propsDict), the commander's choice,
> open to his.  A single click keeps selecting (outline + inspector).
> And the reason the analogy is EXACT, his correction of the commander,
> who had proposed drawing the workflow's arrows differently "because a
> flowsheet arrow is matter": "O flowsheet nao e materia a passar!  E uma
> coincidencia!  Porque se decide que a informacao segue as correntes!"
> In a sequential-modular simulator an arrow is INFORMATION -- the output
> one unit computed is the input of the next -- and it coincides with the
> pipes only because the method chooses that information follows the
> streams (a recycle needs a TEAR, a guessed value: the graph is one of
> computation, not of pipes).  So both homes draw one structure, a graph
> of information dependencies walked in an order, and the engine already
> checks both with one rule (validateSequentialPlan, propsPlan::validate:
> nothing reads what is not yet computed).  The workflow's arrows take the
> flowsheet's visual grammar; each is labelled with what it carries (a
> stream's state there, a file or record here).
> SLICE 3B BUILT 2026-10-26 (branch claude/c172-slice3b, GUI only; no
> engine source touched, no golden moved): THE WORKFLOW DIAGRAM IS THE
> HOME.  A properties case opens on its workflow drawn on the flowsheet's
> own canvas (React Flow, dot grid, controls, fit, legibility floor,
> arrowheads, wire marks, legend, key line and selection card, now SHARED
> in ui/canvasChrome.tsx and ui/nodeCard.ts and used by FlowCanvas too):
> one box per numbered step, studies as frames, a study of independent
> steps laid in a grid of up to three columns when that fits the whole
> workflow at a larger zoom (NanoFiltran fits 1366x768 at zoom 0.58, study
> A in three columns).  ARROWS ARE INFORMATION (case/workflowDiagram.ts,
> from the engine's file-traffic table): feeds left (datasets FIT / HELD
> OUT, records), the "Flowsheet run" terminal (ctrl17's trajectory), products
> right (records, proposals, unread files, the case's declared views), step
> to step where a later step reads an earlier write (none in today's
> corpus); orthogonal routes in the gaps, a shared word said once.  A box
> too small for its 12 px lines at fit shows a COMPACT FACE (number never
> cut, name, type, model, state) sized to the zoom, never an empty box;
> terminal names wrap to two lines.  SINGLE CLICK: the flowsheet's own
> selection card with the step in PropertyPanel (the retired inspector's
> content, ui/workflowCard.tsx, plus its main numbers); DOUBLE CLICK, Enter
> or Open: the step in its own tab (`?step=`, ui/StepTab.tsx).  STUDIES is
> its own menu entry (the old overview); the View menu and the calculation
> map are RETIRED (Vitor: "E o 'view' nao esta la a fazer nada!!! Devia
> ficar em 'reports'!!!"); REPORTS (ui/PropsReports.tsx,
> case/propsReports.ts) holds what the run produced: curation verdicts
> (CSV), records and proposals written (preview, download), the comparison
> with measured data, the decision ledger, every file written (CSV, "Draw
> it"), the thermo readiness, one .zip.  Props menu: File · Workflow ·
> Studies · Reports · Log · Case · Help.  Walk at 1366x768, 100 % and
> 200 % (flash01, ammonia02, NanoFiltran, curate02, membrane24 both homes,
> ctrl17): every decisive cell passes; no label below 11 px at fit (at
> 200 % NanoFiltran's fit draws shapes, step numbers and state glyphs, and
> says so).  FINDINGS, not fixed: at 200 % the FLOWSHEET's own overlays
> (SHOW / PHASE / WIRES panels) cover its units on a short pane
> (pre-existing, FlowCanvas's overlay layout unchanged); a product
> terminal's detail line ("record · read by the Flowsheet's ...") is cut
> to one line with a tooltip.
> THE TWO OWED FINDINGS BUILT 2026-10-26 (branch claude/fit-band-units,
> engine; curate02's parity wiring NOT touched).  (1) A band is held to its
> statistic's unit: the Dictionary now keeps a scalar's unit WORD as
> written (`unitWordOf`), core/Units registers `points` (same factor as
> `percent`, a different `measure`) and `units::sameUnit` is the one
> comparison; every fit op names the statistic it judges
> (`HeldOutStatistic`, EvidencePartition.H -- the same declaration its
> diagnosticUnit publishes) and calls `requireBandInUnitOf`, which refuses a
> mismatched band, a bare number and a band on a statistic with no single
> unit (a membrane held-out set mixing rejections and fluxes); verdictOf
> refuses to judge an unchecked band.  Corpus: 23 bands over 13 propsDicts,
> ONE mismatch -- membrane24, re-declared `maxAAD 10 points;` (its own
> origin already said "within 10 points"; the engine had always judged it
> so, so verdict, record and goldens are unmoved).  (2) NRTL, UNIQUAC and
> Wilson each declare their pair-parameter units beside their formula
> (`pairParameterUnits()`, registered in ActivityModel::registerBuiltins);
> a fitted `...binaryParameters.<i-j>.<key>` publishes the model's unit,
> none when undeclared.  Gate: check_fit_verdict_channel arms (f), (g).

> **C171. THE PROPS SCREEN REDESIGNED BEFORE A RESEARCHER SEES IT, AND A
> PROPER WAY TO CITE (Vitor, 2026-10-26, on the live NanoFiltran case
> before sending the reply to Tim: "aquilo esta uma confusao diabolica que
> viola as boas praticas de GUI todas!" -- and, agreeing the e-mail waits:
> "claro que espera!  E tem de haver uma forma adequada de ele me poder
> citar!").**  THE E-MAIL TO TIM (C157) IS HELD until both land.  (A) The
> props-case screen is redesigned, not patched, ahead of the rest of
> C168: on opening, the case's question, ONE Run and the studies as
> readable cards; after a run, the results and the measured comparisons
> in the centre; the calculation map in a "how it is computed" section,
> closed by default and legible when open; ONE navigation (today the tree,
> the map and the details repeat the same objects); a model's options
> shown inside the model (bulkOverPoreDavies is an option of DSPM-DE, not
> a sibling model); no repeated "not run"/"evaluate" chips; held to the
> C168 audit's script-checkable criteria (clicks to results, minimum label
> size, contrast, keyboard) and shown to Vitor on screen BEFORE Tim.  (B)
> CITATION: today CITATION.cff exists (version 2608, one author, NO DOI)
> and the GUI shows it nowhere.  To build: a "How to cite" surface --
> Help menu and every case's About -- generated from CITATION.cff (one
> home) plus the case's own primary references (for this case Geraldes &
> Alves 2008 and the transport papers it reproduces) plus the exact
> version and commit of the run; the same text in a downloaded case
> (CITATION.txt) and in the result JSON.  A DOI needs Vitor: an archived
> release (Zenodo's GitHub integration on choupo-admin, or a DOI on the
> JOSS paper) -- a release tag is immutable and his (RELEASING.md), and
> the author list of record is his (C163 excluded authorship).
> Status: recorded; (A) dispatched after the running C168 slice 1 lands
> (same files); (B) built beside it; the DOI and authors put to Vitor.
> (B) BUILT 2026-10-26 (branch claude/c171-cite): ONE text, its wording
> GENERATED from CITATION.cff by bin/curate/gen_citation.py into
> src/core/CitationTemplate.H and gui/src/help/citation.generated.ts
> (reusing release_inventory.parse_cff), filled by core/Citation (engine)
> and gui/src/case/citation.ts (GUI) with the case's new optional
> controlDict `citations ( "..." );` and CHOUPO_VERSION + the build's
> commit; shown in Help > How to cite, About Choupo, every case's About
> (props drawer, flowsheet popover), a downloaded case's CITATION.txt and
> the result JSON's `citation` block (both emitters).  It says plainly that
> no DOI exists and cites the repository URL with version and commit;
> no author added.  `citations` declared on six cases (NanoFiltran,
> polarisation01, edwards02, membrane12, ed04, ctrl12; Cavett NOT -- its
> primary citations are not in the tree and were not invented).  Gate
> check_citation (6 by-hand sabotages, all caught); gui/tests/citation.test.ts
> holds the GUI's text to a native run's.  The WASM build gains `-I.` and
> an order-only `gitversion` so the browser engine names its commit too
> (unverified here: no emscripten in this container).  Still Vitor's: the
> DOI, the author list, any release tag.
> Commander, same day: the key is `citations`, not `references` (a
> propsDict's `references` are reference DATASETS; one word, one meaning),
> and `references` in a controlDict is refused by name; with no case open
> the footer names no controlDict.  The canonical citation URL (the cff's
> `url` or `repository-code`; the site renders the first) is put to Vitor.

> **C170. NOTHING SAID IS LOST: THE AUDIT OF EVERY REQUEST IN THE SESSION
> (Vitor, 2026-10-26: "Ve se nao te esqueceste de mais nada que eu tenha
> dito!" and "Nao me deites trabalho para o lixo nem te esquecas
> dele!").**  An auditor read all 268 typed messages and the 33 sent
> mid-turn (stored as `queued_command` attachments -- a filter on
> type:user misses them), the uploaded notes and the compaction summaries,
> against this file, CLAUDE.md and the git log.  ~80 % of ~95 requests
> and rulings were recorded and true; every question sampled had been
> answered.  THE GAPS, now recorded here or in the entry they belong to:
> (1) C140's third addendum (the process patent, Whittle) -- in C140.
> (2) C163's decisions -- in C163.  (3) TIM'S REPLY (C157): the draft
> given in chat predates the ions and the spiral/batch point; its
> blockers are the salt records (Na2CO3, NH4Cl lack `dissociatesTo`; no
> nitrate, fluoride or bromide salt) and the eight D0 re-source (C163);
> the reply is redrafted when both land, saying the model runs in
> spiral-wound modules (a SPATIAL average) and in batch (a TIME average).
> (4) VITOR'S LAPTOP SWEEP (2026-10-26, main bdceba213): PASS 752 / FAIL
> 15; three real (code-map, tutorials guide, origin census -- fixed),
> five nested runs refused by the workspace check after pushes made
> mid-sweep (fixed, 248646285), the rest his environment (Node 18, git
> tags, untracked files, private data).  PROMISED AND OWED: problem-
> divergence and duplicate-keys must not judge `data/local/` (private
> data is not the corpus); no gate may fail on an UNTRACKED file;
> check_workspace_truth must not tell a laptop that "the container
> recycler rewound this checkout" when it is simply behind (say "behind
> origin: git pull"); the empty suiteTimings.raw (a nested wrapper
> truncated it -- C167 slice 2).  The .cho markers on his laptop were his
> own "Save to case" layouts (reverted by him) -- not a defect.  (5) C164's
> engine findings: explicit colliders written `nu 0; order 1` left the
> ignition on a false plateau at exit 0 -- REFUSE them; a latent NewtonND
> line-search defect (an evaluable non-decreasing trial followed by
> infeasible ones keeps the old F; NewtonND.cpp near the line search); the
> records still citing "Burcat 2005/JANAF" (NC_COMPILATION debt).  (6)
> The EduTools audit's promises: C127 dispatched; the stale status lines
> of C10, C53, C54, C109, C128 and C166 (A) corrected; registry.ts's two
> stale texts (batch-membrane's gel model, hunter-nash's host dispatch);
> the design surveys' "nothing built" heads; the RTD EduTool (engine done,
> ctrl18) queued.  (7) A STANDING RULE he gave on 2026-10-21 and nobody
> wrote: "mete uma equipa de varios generais a fazer trabalho distribuido
> e a discutir entre si" -- for a review or a design with real
> alternatives, generals in pairs (analyst and refuter, as C131 did) or a
> team, not one voice.  (8) C127 lost two of his points: the path starts
> from a CONCRETE question, and the page shows where the result has
> experimental support and where it extrapolates.  (9) C154's P2 items:
> current documentation told apart from technical history (propsDict
> comments still carry C141/C148 history); inactive properties marked.
> (10) Owed tables: the C150 reply as a table (ID | confirmed / partial /
> no | evidence | fix | verification | open, with commit) and C112's final
> table.  (11) The JOSS paper is ~2 000 words against the 750-1 750 asked
> (aim 1 500-1 650).  (12) Minor: C146's reference site
> (centrivalab.com/simulator.html) noted there; C148's Rint per ion
> (built per salt, per ion refused when charged) to be put to him once;
> "Honest Open Source" DROPPED by him on 2026-10-21 ("vamos esquecer isso").
> TRIGGERS ALREADY FIRED, so these are dispatched in turn: C133 (PFD and
> spec-sheet PDFs), C159, the C160 phase-0 study's landing, C135 (kij(T)).
> OWED BY VITOR, unhurried: reviews of C53/C54, C101, C143 and C58; the
> paper's authors, ORCIDs, DOI and JOSS timing; C132's faults and course;
> C130's first instruments.
> Status: recorded 2026-10-26; work dispatched by priority, two to three
> generals at a time (disk).

> **C169. THE COLUMN SOLVES THE THERMODYNAMICS ITS STREAMS CARRY (Vitor,
> 2026-10-26, forwarding an external audit of the distillation models run
> on fd688e4ce: "detetou algumas coisas graves.  Podes ver?").**  Four
> findings, each MEASURED by the audit with the package's own functions:
> (1) fullMESH solves each stage's energy on `ThermoPackage::Hliquid` /
> `Hvapour` (the vapour as Hliq_pure + the Watson latent) while the
> streams, the condenser KPI and the global report price on the
> formation-datum surface; the two differ in their T dependence, not by a
> constant, so an interior stage with no feed closes to 1e-8 kW on the
> internal surface and leaves 3.94 kW (column06) and 124.0 kW (column08)
> on the streams' surface, the published condenser duty differs from the
> streams' by 22.9 and 93.9 kW, and the global first law closes BY
> CONSTRUCTION (Q_reboiler = dH - Q_condenser), so no gate saw it -- the
> 2026-09-12 family of CLAUDE.md 6 ("the state a unit computes with is
> not the state its streams carry"), on the one unit that family was
> thought closed on.  (2) the column calls stageK(T,P,x,x,x), so the
> vapour's fugacity coefficients are evaluated at the LIQUID composition:
> invisible under an ideal vapour, max |ln(y/(xK(x,y)))| 9.4e-4 on
> column15 (75 stages, SRK) -- the published state satisfies the equation
> implemented, not the package's equilibrium.  (3) `model fullMESH` on a
> reactive column runs CMO and says nothing (identical JSON on column05;
> C131 M9, still present).  (4) CMO takes q = 1 - vf, so a subcooled feed
> (300 K vs 364 K) moves only Q_reboiler, not the profile (C131 W4) --
> this is Vitor's pending physics decision P1, DECIDED under C163: q is
> the enthalpic q on the CMO approximation's own surface, q = (H_V,sat -
> H_F)/(H_V,sat - H_L,sat), announced.  Scope, one general, in order, each
> its own commit: first the GATE that fails today (stage-local energy on
> the streams' surface for every interior stage, the condenser and the
> reboiler; fugacity equality on the final state with the package's own
> Kvec(T,P,x,y)); then (3) the refusal; (1) ONE enthalpy surface in the
> stage equations, feeds, reflux, products and duties; (2) y and K solved
> self-consistently (Wang-Henke, simultaneous, fullMESH, the bubble-point
> routines of reflux and condensate); (4) the enthalpic q.  Every moved
> golden row listed with its reason (C163: shown, not waited on).
> Status: recorded; dispatched the same turn.
> LANDED 2026-10-26 (d8d6c1c8c), on Vitor's delegation ("Avanca da forma
> que achares melhor naquilo que me pedes") after the 426 moved golden rows
> were sent to him with their reasons: one enthalpy surface (Q_condenser
> +1.9 % benzene/toluene, -3.9 % SRK C4; CMO reboiler moves by -dQ_cond),
> K at the stage's own vapour, reactive fullMESH refused, the enthalpic CMO
> q (column05 conversion 0.9605 -> 0.9581, process05 V_strip +32 %).
> Commander's rulings: a two-phase feed and a reactive package keep
> q = 1 - vf, announced.  OPEN: Kirchhoff vs Watson latent heat is a data
> question; BubblePoint::compute still takes the vapour phi at y = x for 8
> non-column callers.

> **C168. A USABILITY AND ACCESSIBILITY AUDIT OF THE RESULTS GUI, BEFORE ANY
> REDESIGN (Vitor, 2026-10-25, forwarding a second opinion written on the
> Bowen study of the NanoFiltran case: "CHOUPO -- GUI UX Redesign Audit").**
> The text asks the redesign to follow Nielsen's ten heuristics, ISO
> 9241-110 and WCAG 2.2 AA with progressive disclosure, under six
> non-negotiables that are this project's own: the glass box (every result
> traceable to data, models, operations, numerical methods and the source
> dictionaries); exact identifiers kept beside any friendly title; the GUI
> a viewer and runner, never an editor; nothing hard-coded for one case
> (derived from case metadata and object relations); edge semantics kept
> (reference, dependency, model coupling, calculation order, produced
> result); model components not shown as competing models.  Priorities it
> names: P0 the information hierarchy (the physical system, question and
> objective first; one identifiable primary action -- competing run
> controls removed or scoped; results primary after a run; an empty state
> before one; implementation metadata out of the centre); P1 the
> calculation map (a simplified semantic overview by default, the full
> graph expandable, data / models / operations / outputs told apart,
> coupled submodels shown as coupled, no repeated status labels, a
> selection showing purpose, inputs, outputs, assumptions, dependencies
> and provenance, output -> operation -> model navigation, still useful
> with recycles); scientific presentation (titles, units, results and
> measured comparisons prominent, validity and limits explained, theory
> tied to the concept, unavailable / pending / failed / stale / done told
> apart, nothing invented); one primary navigation, less duplication
> between tree, graph and details; accessibility (contrast, 200 % zoom,
> keyboard and visible focus, accessible names, no colour-only status or
> edge meaning, target sizes).  Acceptance on THREE cases -- a simple
> properties calculation, the membrane benchmark with measured data, a
> complex flowsheet with recycles -- for a new user (find the problem, run
> it, find and read the results, which models and data made them, reach
> the dictionaries and the theory) and an expert (the whole graph and
> provenance, nothing lost); the zero-FAIL suite.  FIRST DELIVERABLE,
> before any code: an inventory of the GUI components, a map of the
> present information architecture, the proposed generic interface, the
> reuse / modify / remove list, testable acceptance criteria.  Scope:
> that deliverable, MEASURED on the rendered site (the C165 method:
> a headless browser here, screenshots, nothing claimed from the source
> alone; contrast and focus measured, not eyeballed), weighed against
> docs/ai/gui-credo.md -- where a heuristic and the credo disagree the
> disagreement is named, not silently resolved.  Then the commander
> decides the first slice under C163, Vitor reviewing after.
> Status: recorded; the audit dispatched the same turn.
> AUDIT DONE 2026-10-26 (live build 7c4f2e7c, three cases: pcsaft01, the
> NanoFiltran case's study B, ammonia02 with its two tears; ~80
> screenshots and ~30 script-checkable criteria in the session
> scratchpad, not in the tree).  Ten findings at severity 3: results are
> not the centre after a run on any case (pcsaft01's answer two clicks
> away as unitless numbers; Fig. 3 722 px down a 220 px pane; the plant's
> only signpost a toast); the plant and NanoFiltran maps illegible (labels
> 3.9-7.7 px, refitting so they do NOT grow at 200 % zoom -- WCAG 1.4.4);
> no visible focus on the flowsheet canvas; the flowsheet selection card
> takes edits (the credo says read-only, DEV.md's tinkering rule says
> otherwise -- Vitor's); the GUI draws what the engine did not say
> (phase letters before a run, seeds drawn like results, pinch targets in
> TypeScript); light-theme contrast (13-32 % of first-screen text below
> AA, every wire below 3:1 on the light canvas); F1 on PC-SAFT opens an
> options card; the models tree shows DSPM-DE's coupled parts as eight
> sibling models; the NanoFiltran run freezes the page 33 s with no
> progress.  Also measured: pcsaft01, titled a LIQUID molar volume,
> publishes the VAPOUR root -- a case/engine finding, separate.  The second
> opinion is wrong where the screen says so: one Run per case, the props
> map already a semantic overview, a good NanoFiltran empty state.
> DECIDED under C163, slice 1 "results first, nothing invented":
> props cases fold the map after a successful run and lead with the
> results, an operation with no table shows its numbers inline, and
> propertyPoint gives its numbers units (the engine hook exists, unused);
> the flowsheet replaces the toast by a persistent run summary announced
> as a status (convergence, mass and energy closure, advisories, products
> -- all already in the result JSON); before a run a phase letter only
> where `0/` declares one, seeds marked as seeds.  pcsaft01's root
> investigated beside it.  Slice 2: accessibility (focus >= 3:1, the light
> palette against the canvas, ARIA states, landmarks, named plot
> controls).  PUT TO VITOR: the selection card (read-only by the credo, or
> the tinkering rule) and the four credo/heuristic conflicts the audit
> names (a persistent left pane, one fixed place for Run, legible text
> versus the whole flowsheet on screen, colour-only phase on wires).
> RULED 2026-10-26 (Vitor: "1: tinkering.  2. decide tu  3. vemos
> depois"): (1) the flowsheet selection card STAYS EDITABLE -- the
> tinkering rule holds, and the credo and the panel's "Read-only" header
> are corrected to say what the card does (a what-if edit of the open copy,
> marked pending and announced, never written to disk).  (2) The four
> conflicts, DECIDED by the commander: (a) a left navigation pane is
> allowed when it is the case's ONE primary navigation and collapsible
> (PropsTree already is; the credo's "no permanent left tree" becomes "no
> second tree"); (b) ONE Run control in a fixed place (the top bar), its
> label and scope following the mode on screen (binaryForMode, C157b) --
> "Run is per view" becomes "the run follows the view"; (c) legibility
> wins over fitting the whole flowsheet: map labels never render below a
> minimum size and grow with browser zoom (WCAG 1.4.4), the overview at fit
> is a simplified view and the full graph pans and zooms; (d) no meaning in
> colour alone: phase on wires and edge kinds carry a second channel (dash
> pattern or a label).  All four go into slice 2 with the credo text.
> (3) The paper's authors, ORCIDs, DOI and JOSS timing: later.
> SLICE 1 LANDED 2026-10-26: results first (props: map folds after a
> run, numbers with units, a status line; flowsheet: a persistent run
> strip, phase letters only where 0/ declares one, seeds marked), rebased
> on main with C140, --gui gui-tests 6516 passed.  Its props parts are
> kept, not stripped: none contradicts C172, and the Workflow builds on
> them.  Open with Vitor: pcsaft01 declares the vapour root under a
> liquid name (proposed `properties ( Z_liquid v_molar_liq )`, one golden
> row leaves).
> SLICE 2 BUILT 2026-10-26 (branch claude/c168-slice2; GUI and credo only,
> no engine source, no golden moved).  The four rulings are in the credo
> (new §2.6, and §2.5, §3, §4, §5 corrected) and are built.
> (a) The Workflow outline is a panel-contract left rail; `[` folds it.
> "No permanent left tree" became "no second tree".
> (b) Built by C172 slice 1.
> (c) ONE minimum: 11 CSS px, RENDERED (case/legibility.ts).  The shared
> <Plot> floors every figure; a log axis is floored at 15 px.  A zoomed
> drawing marks each label from the zoom (ui/legibilityFloor.ts): shown,
> grown to the minimum if primary, else hidden.  The fit is the
> simplified view and says so.  On a short pane the fit's margins shrink;
> at 200 % zoom every plant had fitted at 0.01.
> (d) A phase letter on every wire.  A dash of its own for every wire kind
> and every map wire kind.  Series that differ only by colour get a
> marker shape or a dash (case/plotChannels.ts).  The light canvas is
> gray-1, with a light palette >= 3.8:1 on it.  The pre-run fallback wire
> is neutral grey.
> Also: the focus ring is ink (>= 15:1); a skip link and landmarks;
> aria-current and aria-expanded; wires named by their stream; plot
> controls and toast close buttons named.
> (1) The selection card says "What-if ... the OPEN COPY ... never written
> to disk"; its fields are named, and a polite status announces pending
> edits.
> Measured at 1366x768 and 200 % on flash01, ammonia02,
> ChemicalPlantTutorial, NanoFiltran (with and without its map) and
> membrane24 (Flowsheet and Workflow), base build against this branch:
> - text below 11 px: 0 on every surface (was 108/108 flowsheet labels on
>   ammonia02, 170/170 on the map);
> - focus stops below 3:1: 0 of about 60 (was 44-60);
> - unnamed controls: 0 (was 330 on NanoFiltran);
> - colour-only wire kinds and figure series: 0.
> OWED, not fixed:
> - at 200 % on a laptop the canvas is about 220 CSS px tall under the
>   run strip and the canvas legends (base the same);
> - at that zoom the plant and the map fit as shapes only (names past
>   GROW_MAX are hidden);
> - EduTools drawings (ui/methods/) keep ~250 sub-11 px declarations;
> - the selection card's number field is cut at the card's right edge
>   (base the same).

> **C167. THE SUITE USES EVERY CORE (Vitor, 2026-10-25, watching the
> sweep on his 10-core laptop: "aquilo passa a maioria do tempo a usar so
> um core.  Nao era possivel usar mais cores e correr mais casos ao mesmo
> tempo?").**  Today the case walk is SERIAL (bin/runTests, the
> `for case_dir in "${CASES[@]}"` loop) and so is every gate; the cores
> shorten only the build and vitest.  Scope: measure first where the
> wall clock goes (cases against gates, from build/suiteTimings.csv of a
> full sweep); then run the case walk N-wide (default nproc, a `-j N`
> flag and an env override) and the gates that share no state N-wide,
> with the printed report in the SAME order and the SAME verdict as a
> serial run (the output is read by people, runtests_verdict.py and the
> timings tool); anything that mutates the tree or shared files
> (check_gate_selftest's sabotages, the destructive journal, record
> modes, gates that rebuild) stays serial and alone; `-j 1` reproduces
> today's behaviour exactly.  Proof: one serial and one parallel full
> sweep on the same commit give identical result lines (order and
> verdict) -- a full sweep run here for that purpose, under C163.
> Status: recorded; dispatched the same turn.
> SLICE 2 LANDED 2026-10-26: the 132 gate sites a write-only strace sweep
> found writing nothing shared run N-wide inside segments runTests cuts
> from its own text (any SERIAL gate or tree-changing line is a barrier;
> an unlisted gate is SERIAL); the GUI witnesses run CHOUPO_JOBS-wide;
> gate-selftest rebuilds with make -j; each timing wrapper owns
> PID-named files (the emptied suiteTimings.raw on Vitor's laptop).
> Proven: --fast -j1 and -j4 give 83 identical result lines and one
> verdict; --gui green.  NOT proven here: the full -j1 vs -jN sweep,
> stopped under 0.4 -- Vitor's 10-core sweep against his serial run is the
> proof.  Estimate there: ~40 min serial -> 15-20 min.  The gate side gains
> about 2x at most (50 segments of ~2.6 PAR gates).  SLICE 3, recorded not
> started: read traces of the PAR gates, so a segment may cross a writer
> whose writes no PAR gate reads.

> **C166. NANOFILTRAN IN CHOUPO, EXPLAINED SO A PHD STUDENT CAN REIMPLEMENT
> IT (Vitor, 2026-10-25, with two review notes from another session --
> "Puxao de orelhas: o DSPM-DE esta mal explicado no Theory Guide" and
> "Recomendacao -- caso nanofiltran_geraldesAlves2008" -- and: "Eu vou
> dizer a um aluno de doutoramento que o Nanofiltran ja esta implementado
> no Choupo.  Eu quero que ele va la e sinta tudo muito bem explicado e
> facil de usar!").**  ACCEPTANCE (his words): a PhD student opens
> nanofiltran_geraldesAlves2008 (or membrane10) in the GUI, presses F1 on
> the DSPM-DE module, lands on the detailed model and from it on the
> numerical method, and from that alone can REIMPLEMENT the pore solver
> without opening the code or docs/design/a-stiff-pore-solved-at-once.md.
> The notes' findings: Theory Guide 19 never writes the whole boundary
> value problem (permeate face, its Donnan potential as an unknown, the
> wall/film balance of Geraldes & Afonso 2007 with the suction
> correction); the partition equation is written on c_b while the solver
> uses c_wall; notation collides (j_i per pore area in x against N_i per
> membrane area in xi, psi dimensional and not, xi the coordinate and xi'
> the wall field); the method is reduced to sentences -- the per-node
> unknown vector with its COPIES of the global unknowns (block 2Ni+4), why
> the copy-row order matters (a singular pivot block: block-Thomas does
> not pivot between blocks), row normalisation, convergence test, line
> search, the local Donnan seed, J_v continuation from Pe 1e-4 -- with no
> figure and no algorithm; the text is a changelog; no guidance on when
> the pore is stiff (Pe per ion: study C Mg2+ ~30 with an interior
> front, study B ~0.1, nearly linear) or how many nodes for which
> quantity (study C, N = 10: Na+ rejection within 0.1 point, trace Na+
> permeate +13 %, permeate psi -4.5 %); F1 resolves by unit TYPE only
> (gui/src/help/helpMap.ts resolveHelp), so a spiralWoundModule with
> `transport DSPM-DE;` opens ch:membrane (solution-diffusion: WRONG help),
> poreTransport and batchDiafilter are absent from docs/help-index.json,
> 19 has no subsection labels, no `algorithms` entry for the pore solver,
> a HelpTarget has one destination (no seeAlso).  The case note asks for:
> a gridStudy_profiles view (N10..N350 overlaid, Na+ zoom), per-dye-level
> pore overlays, a STAIRCASE view bulk -> wall -> pore inlet -> pore
> outlet -> permeate per ion including the dye (study B's physics is at
> the wall: the dye, lambda = 1, controls the interface and gives
> R_Cl = -2), the published Pe/stiffness per operation, the measured
> N-table in the README, the Choupo-vs-NanoFiltran performance paragraph
> (design doc 11.5: 20-40x, converges always, NanoFiltran ITMAX in 6 of
> 26), and RECORDS a decision: no ML surrogate for DSPM-DE (a pore costs
> ~1 ms; sweeps, fits and MCMC run on the physical model).  Scope, split
> by files so two generals never touch one: (A) Theory Guide 19.1-19.3 and
> the SDEM chapter's labels rewritten in the asked order (whole BVP;
> nondimensionalisation and Pe; Scharfetter-Gummel derived; unknown vector
> and block structure WITH a figure; Newton, analytic Jacobian,
> normalisation, convergence; seed and continuation WITH pseudo-algorithm;
> mesh and order; verification; practical N guidance), one notation end
> to end, history out to the design doc; F1 model-aware (helpMap,
> help-index, an `algorithms` entry, a seeAlso link, the CI anchor check
> extended, a test that a DSPM-DE case never resolves to ch:membrane);
> the Tutorials Guide card explaining the case; (B) after C165 phase 1
> lands (it publishes the partition and potentials the staircase needs):
> the case's views and README table.  C165 phase 1 keeps the engine facts,
> schemas and modelDocs; the 19.1 "bisection" sentence moves to (A).
> Status: recorded; (A) dispatched the same turn.

> **C165. CAN A PHD STUDENT LEARN DSPM-DE FROM THE NANOFILTRAN CASE ON THE
> SITE? (Vitor, 2026-10-25, forwarding a second opinion on
> props/membrane/nanofiltran_geraldesAlves2008: "Podes ver o que esta a
> sugerir o GPT no caso DSPM-DE?").**  The second opinion could not render
> the GUI and so judged nothing on screen; it set seven questions the GUI
> must answer without the 2008 paper -- what is simulated; why each ion is
> rejected (steric, Donnan and dielectric exclusion told apart); how it
> crosses (diffusion, electromigration, convection); what happens at the
> interfaces (concentrations, potentials, partition); the polarisation
> (bulk against wall); whether the results make sense (per-ion rejection,
> mass, electroneutrality, profiles); whether the solution can be trusted
> (convergence, tolerances, residuals, assumptions) -- and named two
> improvements: a spatial plot following each ion through film, interface
> and pore (click an ion, see why its concentration rises or falls), and
> F1 saying what physically happens when a parameter goes up or down.
> Measured the same turn: the live site renders the case for a headless
> browser here (the calculation map, studies A-C, data, models, ops), so
> the review can be made ON SCREEN rather than from screenshots.  Scope:
> (1) a measured on-screen audit against the seven questions, each answer
> naming what the screen shows or does not, with screenshots, scored, no
> claim made from the source alone; (2) the proposal that follows from it,
> engine facts before GUI drawing (a decomposition the engine does not
> publish is not drawn by TypeScript -- the GUI credo); (3) built under
> C163 on stated defaults, Vitor reviewing after.
> Status: recorded; (1) dispatched the same turn.
> (1) DONE 2026-10-25 (live build 87e85755; audit and ~60 screenshots in
> the session scratchpad, not in the tree): scores 6/2/2/3/6/5/7 out of 10.
> The case does what it was built for (verification against the paper)
> and does not teach WHY: no per-ion steric/Born/Donnan factor, no flux
> split, no named face potentials, the solver tolerance nowhere on
> screen, J_v without a description, F1 for `ideal` under DSPM-DE lands
> on Raoult.  The second opinion is wrong twice, said with the screen:
> polarisation and trust are largely there; a fixed "goes up / goes down"
> sentence about REJECTION would be false (Na+ changes sign with J_v,
> Cl- is negatively rejected in study B) -- directions only at the
> partition level, the rest by an engine sweep; and the film has no
> coordinate in this model, so it is drawn as a labelled jump, never a
> profile.  DECIDED under C163, phase 1 (dispatched): E1 the pore profile
> drawn for every operation (already published); E2 per ion and face
> lambda, hindrances, steric, Born and Donnan factors and the activity
> ratio, held by a gate to the published partition coefficient; E3/E5
> the three named potentials (summing to dPsi_m_V) and the final
> residual, tolerance and closure checks per point; G2/G3 F1 fixes (the
> DSPM-DE activity words, J_v's description, partition-level direction
> sentences with the non-monotone warning); the stale "robust bisection"
> sentence in Theory Guide 19.1; the module-only warning in the bench.
> Phase 2: E4 the per-node flux split with its closure residual; then
> G4 "follow an ion", assembled by the engine as a view.

> **C164. GRI-MECH 3.0 IS NOT USED DIRECTLY (Vitor, 2026-10-25, ruling on
> the licence question, quoting the two findings -- the H/O subset copied
> verbatim into the three ignition01 tutorials and the 17 component
> records citing GRI-Mech 3.0, some generated from its thermo file: "Nao
> podes usar de forma direta!").**  GRI-Mech 3.0 is "freely available,
> all rights reserved, cite to use" -- no redistribution grant -- so it
> is in the no-grant class CLAUDE.md 10 excludes, and the 2026-06-21
> kinetics record already said fetch-and-cite.  Measured on main
> 18e5dd732 (`git grep -i gri-mech`): 17 records under
> data/standards/components/ (C2H, C2H3, C2H5, C3H7, CH, CH2, CH2CO,
> CH2OH, CH2_S, CH3O, CN, HCCO, HCO, HNO, NCO, NNH, acetaldehyde); the
> case-local component copies of ignition01 (x3), ignition02, nox01 and
> gibbs06; the three ignition01 `constant/reactions`; the tools
> bin/curate/gri_subset_to_choupo.py and bin/import_nasa.py.  Scope: (1)
> classify every mention -- a VALUE taken from GRI-Mech (out) versus a
> name used as a cross-check that enters no value (allowed, the
> `via`/cross-check rule of CLAUDE.md 7); (2) every GRI-derived value
> replaced from a redistributable PRIMARY -- kinetics from the rate
> literature, cited per reaction (O Conaire et al. 2004, already
> transcribed from the paper in ignition02, or Burke et al. 2012); NASA-7
> thermo from NASA TM-4513 / TP-2002-211556 (public domain) -- or, where
> no clean primary exists, the species REMOVED and its absence named;
> never Burcat (NonCommercial); (3) the importers that read GRI files
> into the tree retired or turned into LOCAL-only cross-check tools; (4)
> `check_source_licence` refuses GRI-Mech as a value's origin from now on
> (the 2026-09-01 rule: a licence decision not in a gate is a sentence);
> (5) the goldens that move listed with their reason (C163: shown in the
> report, not waited on).  C160's GRI parity runs are LOCAL only.
> Status: recorded; dispatched the same turn.

> **C163. THE OPEN QUESTIONS ARE THE COMMANDER'S TO DECIDE, AND VITOR
> REVIEWS AFTER (Vitor, 2026-10-25, on the list of sixteen items put to
> him: "Isso sao merdas que tu podes decidir e eu depois revejo!  Diz me
> so qual e a questao com o 'A licenca do GRI-Mech 3.0.'").**  Scope:
> the items of that list -- the C158 open questions and the reactor
> ladder clause, the friction-gate prose, the D0 remedy, C160's scope,
> W1-W3, P1, P7, M1, the recorded engine findings, the GUI credo rule,
> the G9 thresholds, the Gantt tutorial -- are DECIDED by the commander
> on a stated default, each recorded here with its reason and made
> reversible (`git revert`), and Vitor reviews after.  A golden row that
> moves is still SHOWN to him as a list with its reason in the same
> message, but the work no longer waits for his answer.  NOT delegated by
> this: the paper's authorship, ORCIDs, DOI and the JOSS timing (they are
> his name and his calendar), and anything irreversible.  The GRI-Mech
> licence question was explained to him in chat the same turn.
> Status: recorded.
> THE DECISIONS, RECORDED (2026-10-26 -- the audit of Vitor's requests
> found that C163 promised a line per item and none had been written; each
> is a stated default, reversible, his to overrule):
> - the eight master-ion D0 (unsourced, C161): RE-SOURCED to PHREEQC
>   phreeqc.dat `-dw`, as the C157 ions; moved goldens listed to him.
> - reactor ladder Q3: the general's added clause STAYS (both reactors
>   read the same phi from one package, so pressure moves them together).
> - check_friction_correlations prose: "the regime is not determined by Re
>   alone in the transition band" -- the same rigour as C158 item 4.
> - C158's four open questions: title "Check your understanding"; the quiz
>   sits after the tool's last page; a paged tool gets ONE quiz whose
>   questions name the step; a Yes/No question is allowed where the concept
>   is binary, with the feedback explaining both answers.  The other 58
>   tools proceed in waves.
> - C160: the scope as proposed (thermodynamics, homogeneous gas kinetics,
>   ideal reactors, sensitivities, narrow transport; NOT flames or plasma;
>   microkinetics optional); GRI-Mech runs LOCAL only (C164); the
>   programme text's item 4 ("external numerical libraries may be used")
>   is NOT taken -- CLAUDE.md 10 "No external libs" is settled and argued;
>   the reference library stays an external oracle in curation tools.  The
>   phase-0 study (`claude/c160-parity-study`) lands now that the sweep ran.
> - W1-W3, P7, M1 (C131 phase-2 thermodynamics and separations): decided
>   by the review's own recommendation wherever its refuter agreed, the
>   refuter's where it did not; moved goldens listed to him.
> - diafilter01/02 (Euler under a "(fixed RK4)" header): the integrator
>   becomes what the header says; rows move at 1e-3, listed.
> - `fittedInCase case;` in browser fits: the case name is the case's own
>   (its .cho marker / folder name handed by the GUI), never the worker's
>   cwd.
> - batchReactor never computing P, and the 1e5 slip; the dynamicCSTR
>   outflow: fixed as defects, each with a gate arm.
> - "zero physics in TypeScript": ADOPTED into gui-credo.md; gui's
>   case/pinch.ts (targets computed in TS while the engine has a pinch
>   pass) is its first debt.
> - G9 fold thresholds: kept as built; revisited on a student's report.
> - a multiproduct Gantt tutorial: yes, on the batch plan the engine
>   already publishes (C98-C100), queued.
> - the Cavett 2005 article: cited where cavett01 draws on it (the primary
>   per value rule).

> **C162. A NONVOLATILE ON THE FORMATION LEG REFUSES, AND VITOR RUNS THE
> SWEEP ON HIS LAPTOP (Vitor, 2026-10-25, asked whether the full sweep the
> fix needs was authorised: "Eu estou em casa e posso fazer a suite
> completa no meu laptop.").**  Found by the general that cleared the
> container suite's first four FAILs (all four were stale gate PROBES, no
> engine regression; branch `claude/fix-suite-fd688e4ce`): the sensible
> leg (`Component::Hliq_pure`, Component.cpp:1378-1412) REFUSES a `role
> nonvolatile` component with no liquid Cp, while the formation leg
> (`ThermoPackage::speciesPhaseEnthalpy`, ThermoPackage.cpp ~1504-1516)
> ANNOUNCES and prices it through `h_pure_ig - Hvap` -- the ideal-gas
> route CLAUDE.md 5 (salt formation, 2026-06-29) forbids for a
> nonvolatile.  Since C65 the formation leg is the surface the energy
> report and every `priceState` unit price on, so the rule is unenforced
> on the main path, and one decision has two homes.  Scope: the refusal in
> ONE home both legs call; a formation-leg arm in
> `check_liquid_cp_fallback` (whose docstring wrongly calls that leg
> "already correct"); the corpus measured BEFORE the sweep (which cases
> start refusing -- expected: refusals rather than moved rows); then one
> branch carrying main + C158b + the gate fixes + this, which Vitor sweeps
> on his laptop (DEV.md 4c "THE FULL SUITE ON A 10-CORE PC").  The
> container sweep on fd688e4ce keeps running for its findings (6 FAIL at
> 704 PASS: the four probes, the theory bibliography out of first-citation
> order -- the Deen1987 cite -- and the origin census recount after the
> C157 provenance blocks).
> Status: recorded; dispatched the same hour.
> The container suite's six FAILs are cleared on main: the four probes
> (60a308466, 817ea51af -- the pump probe; `studies` dropped by
> props_views.strip_views), the bibliography and the census (9638d1cd9).
> THE CONTAINER SWEEP ENDED (fd688e4ce): PASS 759 / FAIL 7 /
> KNOWN-BROKEN 0 / EXPECTED-FAIL 6.  The seventh FAIL is check_mass_closure
> on userOp03_case_rate_law (133.333 %): the C67 witness reacts compA
> (MW 30) to compB (MW 50) at nu -1/+1 -- a case defect, the engine right
> to report it; dispatched (`claude/fix-userop03-mass`).

> **C160. THERMODYNAMICS AND KINETICS TOP NOTCH: A PARITY PROGRAMME
> AGAINST AN OPEN REFERENCE LIBRARY (Vitor, 2026-10-25, a programme text
> -- "CHOUPO -- Cantera 3.2 Scientific Parity Programme" -- with "Podes ver
> se isto faz falta para consolidarmos o choupo?  Eu queria ter a
> termodinamica e cinetica top notch!").**  The text asks, BEFORE any
> code: an inventory of what Choupo has, a parity matrix against the
> library's 3.2 documentation and examples (thermodynamics, homogeneous
> and heterogeneous kinetics, transport, reactors, 1-D flames,
> electrochemistry, plasma), the confirmed gaps, an architecture, a
> phased plan, oracle cases with quantitative tolerances (implementation
> error vs numerical-method error vs legitimate formulation difference),
> the numerical and scientific risks; the library used ONLY as an external
> numerical oracle, never as a hidden engine; zero FAIL on the full suite
> before each phase lands; licences and provenance checked.  Measured on
> main before judging: Choupo already has NASA-7 thermo (the GRI-Mech 3.0
> and Burcat-family combustion library; `bin/curate/import_gibbs_nasa.py`
> and `verify_against_nasa.py` already import the library as a CURATION
> oracle, never at run time), Troe / Lindemann fall-off and third bodies
> (src/thermo/reaction/, BatchReactor), LHHW and written rate laws
> (C67), Gibbs minimisation and equilibrium reactors, ideal reactors
> (batch, CSTR, PFR, dynamic), Chung / Wilke / Chapman-Enskog transport;
> it has NO sticking-coefficient surface kinetics with site coverages,
> no mixture-averaged or multicomponent diffusion fluxes, no 1-D flame
> and no plasma.  COMMANDER'S JUDGEMENT, put to him: the THERMODYNAMICS
> and KINETICS half is in Choupo's line (process simulation, glass box)
> and a parity matrix there is a strong validation layer -- worth doing;
> 1-D flames and plasma are BREADTH the project says it does not chase
> (CLAUDE.md section 1: "not aiming for breadth") and are his call
> (architecture / scope); electrochemistry only as far as the process
> units need it.  Taken as the stated default, reversible: PHASE 0 only
> -- the inventory, the matrix over ALL areas (so he decides with the
> whole picture), the confirmed gaps, the oracle cases and tolerances for
> the thermo + kinetics + ideal-reactor + transport scope, the
> architecture and phases -- a document, on a branch, landing after his
> full-suite run; no engine code until he rules on the scope.

> **C159. FROM THE EXPLORER TO THE FIT THAT MADE A PAIR, AND A STUDENT'S
> OWN FIT (Vitor, 2026-10-25: "o explorer permite mostrar a evidencia e
> os ajustes para um dado composto/binario.  Mas agora com o props podemos
> mostrar o data set do NIST e a forma como se faz a estimativa de
> parametros, nao e?  Ate pode gerar o ficheiro de binarios!!  E nos
> dicionarios especificamos os metodos de minimizacao dos ajustes e
> devemos ter help/F1 acessivel para os alunos perceberem").**  Measured
> on main: a regressed catalogue pair NAMES the case that fitted it --
> `data/standards/parameters/NRTL/acetone-ethanol.dat:64` `fittedInCase
> "tutorials/props/curation/curate11_nrtl_acetone_ethanol"`, its series
> located through the ThermoML archive and cited by DOI, its verdict
> `validated` (C16); that case is a props case (`fitParameters`), so with
> C151/C154 it already DRAWS the datasets, the fit, the parity and the
> verdict; the fit writes a promotable pair record (`output.proposal`,
> into data/local/); the minimisation is Levenberg-Marquardt, FIXED, with
> its controls declared (`lambda0` and the rest, the op schema's
> `x-choupo` lists the regression as "LevenbergMarquardt", fixed) -- no
> `method` key names it in the dict.  Scope: (1) the Explorer's pair view
> OPENS the case named by `fittedInCase` in Properties & data, at its fit
> (one click from "where did these numbers come from" to the data and the
> regression); (2) a student's own fit: from a pair with ThermoML series
> (`bin/choupo-thermoml extract-vle`), a props case is generated whose
> datasets carry the series with their citations, whose fit declares the
> partition fit / held-out and a band BEFORE the fit, and whose output is
> the pair record -- shipped as a template the student downloads, edits
> (another pair, another model) and opens back; (3) the minimisation made
> VISIBLE in the dict: `method LevenbergMarquardt;` declared (the default
> announced when absent, any other word refused by name until a second
> method exists), its controls each F1-answerable, F1 on `method` / the
> controls / `residual` / `evidence` landing on the least-squares EduTool
> and the Props Guide's fitting section (C154's key help is the
> mechanism).  Licence: the ThermoML series ship in a case only as the
> measured values with their article's citation, as the C16 records do.
> Status: recorded; queued AFTER Vitor's full-suite run (no new work
> before it, his ruling of the same evening).

> **C158. EVERY EDUTOOL ENDS WITH A LEARNING QUIZ (Vitor, 2026-10-25:
> "no final de cada EduTool deve haver um questionario de
> aprendizagem").**  Measured on main: the shared component exists --
> `gui/src/ui/methods/lessonQuiz.tsx` (questions are DATA on the lesson
> module; the feedback is shown for a right answer AND a wrong one,
> because the point is the reason, not the score) -- and ONE of the 65
> tools uses it (`standard-state`, C32).  Scope: a quiz at the end of
> every tool, built on that one component; each question tests a concept
> the lesson TEACHES (never trivia or a number to memorise) and names the
> step it tests; the feedback explains why, in the lesson's own terms;
> numbers in a question are the engine's or the page's, with their origin
> (C112's marks); about five questions per tool; a test derives the tool
> list from the registry and refuses a tool without a quiz or a question
> whose step does not exist.  Pedagogy is Vitor's: the questions are
> DRAFTS for his review -- the first wave (a handful of tools across
> disciplines) goes to him as a sample before the rest are written.
> Status: recorded; the first wave dispatched after C154 lands.
> REVIEWED 2026-10-25 (Vitor: "APROVADO COM CORRECOES" on the sample of
> 34 questions in 6 tools, branch `claude/c158-quiz-sample`): no structural
> problem in the shared component or the idea -- the quizzes test the
> difference between hypothesis, model, physical limit, measurement and
> engine result.  All eight land before the merge; (2), (3) and (6)
> are the ones he called MANDATORY before the quiz spreads to the other
> tools, the rest make the language as rigorous as the engine.  (1) McCabe-Thiele Q1: a horizontal
> step is NOT "one ideal stage" -- it is the equilibrium relation of one
> ideal stage (the leaving vapour and liquid in equilibrium); the feedback
> says horizontal = equilibrium, vertical = operating line (material
> balance, linear by constant molar overflow).  (2) McCabe Q4: total
> reflux is NOT "infinite energy" -- minimum stages but zero net product;
> R = L/D diverges because D -> 0, and for a fixed production the reflux
> and boil-up per unit product are unbounded.  (3) Data reconciliation
> Q3: Bayes does NOT add "the width" -- WLS with a statistical error model
> also gives the reconciled covariance; with a flat prior the posterior
> mode (and here the mean) IS the WLS answer, and Bayes makes the
> uncertainty a posterior distribution and makes informative priors
> explicit.  (4) Correlation simplicity Q6: not "the friction factor is
> not a function of Re" but "in the transition band there is no unique,
> universal friction factor determined by Re alone" (disturbances,
> history, inlet geometry).  (5) Bund Q4: keep the answer, drop "the rain
> is a term of its own ... not hidden in its margin"; say that whatever
> margin was used, standing rain occupies real containment volume and
> reduces what is available at the instant of a spill.  (6) Reactor
> ladder Q3: the explicit pressure factor cancels in an IDEAL-GAS reaction
> quotient because delta-nu = 0; with a non-ideal EoS the fugacity
> coefficients can still bring a pressure effect (say the tool is ideal
> gas if it is).  (7) FEL Q2: not "FEL 3 is FEED" as a universal anchor --
> "in many widely used three-stage schemes FEL-3 corresponds to
> FEED/Define; always check the owner's stage definitions."  (8) FEL Q6:
> Choupo may solve individual process items at FEED-like fidelity, which
> does not make the project definition FEED; its capital estimate stays a
> study / Class-4-type estimate because the class follows the maturity of
> the whole multidisciplinary definition (AACE: accuracy is a range of
> ranges and does not set the class).  Kept as written, by name: the bund
> quiz (primary vs secondary containment, other tanks' footprint, the
> drain valve, low/wide vs high/narrow) and the reactor ladder's declared
> 0.90 against 0.841 at equilibrium.  The four open questions put with
> the sample were not answered and stay open.
> LANDED 2026-10-25 on main (1147c8363, 832ea6a59, 975fa802a): the sample,
> the eight corrections, and the same corrections in the SEVEN lesson
> steps the quiz points to (plus the FEED row of the FEL stage table) --
> the general's disagreement, taken: a quiz corrected over a step that
> still makes the claim contradicts itself on one page.  `--gui` 36/0,
> 6465 GUI tests.  Put to Vitor: the general's added clause in the reactor
> ladder Q3 (with a non-ideal EoS both reactors read the same phi, so
> pressure moves them together); whether check_friction_correlations's
> prose ("the regime is not a function of Re") takes the same wording.
> The other 58 tools wait for the four open questions.

> **C157. CHOUPO READY FOR AN OUTSIDE MEMBRANE RESEARCHER (Vitor,
> 2026-10-25, with an e-mail of 2026-10-21 from a water-treatment R&D
> company asking for NanoFiltran "to better predict the rejection of
> specific ions by NF membranes ... to plan our experiments more
> efficiently" and its licence terms: "queria preparar o Choupo para
> responder").**  Measured on main: the original NanoFiltran source is in
> the tree under the MIT licence, copyright Vitor Geraldes and Ana Maria
> Alves, IST (`bin/curate/nanofiltran/README.md`, "Licences"); Choupo
> reproduces it code to code (C138) and goes beyond it (the solved pore,
> C142/C144; multi-ion polarisation; the membrane fit with a held-out
> verdict and the fitted record a unit reads, C149/C152; spiral elements
> in series and parallel, C146); the site can download a case as a zip
> and open a folder or zip back (`gui/src/case/saveCase.ts`,
> `gui/src/cases/loadCase.ts`), so a researcher can run his own data
> without installing anything.  THE GAP that matters for water treatment:
> of the 53 aqueous species in `data/standards/species/`, ONLY eight carry
> the radius and the free-solution diffusivity DSPM-DE needs (Na, K, Ca,
> Mg, H, OH, Cl, SO4) -- nitrate, bicarbonate, carbonate, fluoride,
> bromide, ammonium, lithium, strontium, barium, phosphates, borate,
> silica, iron and manganese have none, so a real water cannot be
> simulated.  Scope: (1) the transport data of those species, each value
> from a citable, licence-compatible primary source (the public-domain
> PHREEQC databases carry measured diffusion coefficients with
> references; the radius by ONE declared rule from D0 where the model
> asks for a Stokes radius, or from a primary measurement -- never typed
> from a no-grant compilation), reviewStatus as curation requires; (2)
> the researcher's path made explicit: membrane24 (fit then simulate) as
> the template, its README saying "replace these files with your data",
> the download -> edit -> open round trip verified on the live site, one
> quick-start page (what goes in, what comes out, what the verdict
> means, what the model cannot do); (3) the C154 usability fixes (About,
> evidence status, F1 on keys) before the e-mail goes; (4) the reply
> drafted for Vitor -- the licence answer (NanoFiltran MIT, Choupo
> GPL-3.0-or-later, free for commercial use, the name a trademark) and
> the honest scope (a model whose parameters must be fitted per membrane
> and solution; what was verified and what was validated).  Status:
> (1)-(2) dispatched 2026-10-25; the draft given to Vitor in chat.
> (1)-(2) LANDED 2026-10-25 (`claude/c157-membrane-researcher`): D0 for
> 14 ions (Li, Sr, Ba, FeII, MnII, CO3, NO3, PO4, F, Br, HCO3, NH4, HPO4,
> H2PO4) from the public-domain USGS PHREEQC `phreeqc.dat` (`-dw`, file,
> line and sha256 cited; reviewStatus interim); the multi-ionic film and
> the ED units read them.  NO RADIUS was added: the eight existing ions
> store Nightingale's (1959) hydrated radius, which DSPM-DE pores are
> fitted on, and no rule derives it from D0 -- a Stokes radius under the
> same key would silently shift steric hindrance -- so DSPM-DE still
> REFUSES those ions by name until a curator reads Nightingale's table
> (it covers NO3, F, Br, I, Li, NH4, Sr, Ba, CO3, PO4, Fe2+, Mn2+; not
> HCO3 or the hydrogen phosphates).  I- and B(OH)4- have no D0 in any
> PHREEQC database.  The researcher's path: membrane24's README "use it
> with your own data" (eight steps) and `docs/ai/membrane-research.md`;
> the live-site round trip (download -> edit a rejection -> open ->
> Process refuses the stale fit -> re-fit validated) DOES NOT CLOSE: the
> record the browser fit writes is not carried back into the opened case,
> so Process refuses again -- and the top Run button in Properties mode
> runs choupoSolve instead of the fit.  Both GUI defects queued as C157b
> behind C154 (same files).  Vitor, the same hour: wait for the ions
> before replying; the reply must also say the model runs in spiral-wound
> modules (the stage's rejection a SPATIAL average) and in batch (a
> TIME average).  Measured: the spiral module publishes the stage's
> observed rejection from the mixed permeate (`R_obs_<ion>`,
> SpiralWoundModule.cpp:1710, DSPM-DE witnesses membrane10/11/20/22); the
> batch diafilter takes any transport law through the factory
> (BatchDiafilter.cpp:113) but NO batch case runs DSPM-DE and it
> publishes R_initial / R_final and the recovery, not a time-averaged
> rejection -- a batch DSPM-DE witness and that average are C157c.
> C157c LANDED 2026-10-25 (`claude/c157c-batch-dspmde`): DSPM-DE and
> SDEM run end to end inside `batchDiafilter` (no engine change needed);
> witness `tutorials/batch/membrane/diafilter03_dspmde_batch` (NaCl R
> 0.691 -> 0.554 as the retentate concentrates, MgSO4 0.973 -> 0.979);
> the campaign publishes the TIME-AVERAGED rejection R_avg_<s> = 1 -
> c_permPooled / c_bMeanPerm (the pooled permeate against the retentate
> bulk averaged over what permeated, = the c_b Q_p-weighted mean of the
> instantaneous R_obs) and R_avgVsInitialFeed_<s> against the initial
> charge, from the unit's own integrated states (one more ODE row, not a
> second quadrature); diafilter01/02 gained 10 rows each by
> --record-append, none moved; `check_diafiltration` arm (i);
> docs/ai/membrane-research.md says how rejection is reported at a point,
> in a spiral stage and in a batch campaign.  FOUND, not fixed (goldens
> would move -- Vitor's): diafilter01/02 integrate by forward EULER while
> the header prints "(fixed RK4)" (NaCl recovery 0.501529 vs 0.502215
> adaptive, 1.4e-3); a declared fouling law lags under adaptive stepping;
> the electroneutral film's message misdescribes a constant k_film; SDEM's
> advisory names the wrong unit.
> C157b LANDED 2026-10-25 (`claude/c157b-fit-round-trip`): the record a
> run writes INTO the case (any op's `x-choupo.writes` slot of kind
> `record`, read off the schema -- nothing names membrane) is read back
> from the worker's MEMFS and carried into the open case (the next run and
> the next download), announced in the Log; the top Run, Ctrl+Enter and
> the menu run the MODE on screen (`binaryForMode`, mirroring
> `bin/runCase`), the props result kept in its own slots so a fit never
> replaces the Process streams.  The researcher's round trip now CLOSES
> (download -> edit a rejection -> open -> Process refuses the stale fit
> -> re-fit -> Process green -> the second download carries the new
> record).  `--gui` 36/0 on main.  FOUND, not fixed (engine): a fit run in
> the browser records `fittedInCase case;` -- the engine takes the case
> name from the working directory, which is always `/case` in the worker;
> the fingerprints are unaffected.
> NIGHTINGALE RECEIVED 2026-10-25 (Vitor sent the paper; a copy kept out
> of the tree, publisher's PDF).  READ BACK: the paper has ONE table,
> Table I (crystal, Stokes and hydrated radii at 25 C, p. 1383).  The
> eight stored radii (H 2.82, Na 3.58, K 3.31, Ca 4.12, Mg 4.28, Cl 3.32,
> OH 3.00, SO4 3.79 A) match it to the digit.  It gives r_H for Li 3.82,
> Sr 4.12, Ba 4.04, Fe2+ 4.28, Mn2+ 4.38, CO3 3.94, NO3 3.35, F 3.52,
> Br 3.30, NH4 3.31 and I 3.31 -- NOT PO4 (the line above said it did),
> HCO3 or the hydrogen phosphates, which keep refusing.  TWO FINDINGS:
> (a) `parameters/electrolyte/PROVENANCE.md` says "Nightingale's Table
> III reports BOTH the effective hydrated radii AND the limiting ionic
> conductances lambda0" and that the eight D0 are derived from "the same
> paper's lambda0": there is no Table III and no lambda0 in the paper, so
> the eight D0 are attributed to a source that does not contain them
> (falsely sourced, the class the 2026-08-05 honesty slice names).
> Recomputing the paper's Eq. (1), r_s = 0.820 z/(lambda0 eta0), with
> the stored lambda0 reproduces Table I's Stokes radii to its rounding
> for seven ions (within 1.1 %) and NOT for H+ (0.263 against 0.28, -6 %),
> so the stored values are consistent with, not taken from, the paper.
> (b) Nightingale's two Grotthuss entries (H+, OH-) are parenthesised in
> his table, i.e. extrapolated from his calibration curve.  Slice C161
> (`claude/c161-nightingale-radii`): the eleven radii with page and table
> cited, the false sentence corrected, the eight D0 pinned as a debt with
> two remedies for Vitor (re-source to the public-domain PHREEQC `-dw`
> the 14 new ions already use, or name a primary for lambda0).
> C161 LANDED 2026-10-25 (cca7169b2): the eleven radii, the corrected
> PROVENANCE.md (the eight D0 now said to be UNSOURCED), the absences
> buried; a DSPM-DE probe that refused 'Li' by name runs LiCl.  FOUND,
> the next blocker for a real water: Na2CO3 and NH4Cl declare no
> `dissociatesTo` (DSPM-DE refuses them: "no electrolyte{ cation; anion; }
> block"), and no nitrate, fluoride or bromide salt record exists, so the
> ions have their data and their salts do not -- a curation slice whose
> blast radius (cases carrying Na2CO3/NH4Cl gain a species decomposition)
> is measured before it is dispatched.

> **C156. THE PLOTS PAGE NAVIGATES BY UNIT TOO (Vitor, 2026-10-25, on
> ammonia02_full_plant's Plots page: "do lado esquerdo devia de haver uma
> tree para se associar um dado plot a operacao unitaria respetiva!
> Agenda isso tambem.").**  Measured on main: the Plots navigator
> (`gui/src/ui/PlotsWorkspace.tsx`, "Plot types") lists plot KINDS only
> (Balance, Phase equilibrium, Solver, Internal, Outer driver); a SECTORED
> plant also gets one group per sector with its units (read from the
> engine's `unitSectors` stamp), but a FLAT case gets nothing ("A FLAT
> CASE GETS NOTHING HERE", deliberately: no invented "root" sector) -- so
> on a flat plant like ammonia02 a unit's profile, its convergence trace
> or its envelope is reached only through each plot's own dropdown.
> Scope: a UNITS tree beside the plot types on every flowsheet case --
> flat cases list their units directly (no invented sector), sectored
> cases keep the sector level; under each unit, the plots the RUN
> published for that unit (its internal profile, its convergence trace,
> its T-x-y where it emitted one, its ports' streams), each opening the
> plot already focused on that unit; a unit with nothing to plot is shown
> greyed with "nothing published"; the unit's F1 to its theory as on the
> flowsheet.  Read from what the result publishes per unit, never
> inferred from a unit's type.  Status: dispatched 2026-10-25.
> LANDED 2026-10-25 (`claude/c156-plots-units`): a UNITS section under
> the plot types -- each unit with the profile and convergence curve the
> run published for it (read from `result.profiles` and the unit-keyed
> convergence rows; the global rows filed under no unit), sectors from the
> engine's stamp and UNSTAMPED units listed directly (on greenAmmonia03
> only the five CONVERTER units carry a stamp -- the plant-level units,
> FEHE's profile among them, had been hidden), a unit with nothing
> published greyed, F1 through the flowsheet's own help.  NOT per unit
> because the engine publishes it per case: the T-x-y; and no stream has
> a producer/consumer field for a port view.

> **C155. THE LAMINAR-TURBULENT TRANSITION IS NOT A CURVE (Vitor,
> 2026-10-25: "na analise dimensional usaste o metodo de Churchill para
> fazer uma interpolacao entre laminar / turbulento, mas essa aplicacao
> nao e a mais adequada: na regiao de transicao nenhuma correlacao
> funciona porque e uma zona caotica de instabilidade.  Pequenas
> perturbacoes do sistema podem influenciar o regime passar de laminar
> para turbulento.  Historicamente o Reynolds parece que conseguiu
> escoamento a Re de 10000, mas era muito instavel.  O mesmo equipamento
> que esta no museu hoje nao permite isso devido a vibracao provocada por
> camioes a passar na estrada.").**  Measured on main 92d96b8ec: the
> correlation-simplicity EduTool presents Churchill as "a correlation for
> the whole range ... built by joining" the asymptotes (step 13,
> `correlationSimplicityLesson.ts`) and only in step 14 says the blend
> "draws a smooth line through a region where the physics offers none";
> the ENGINE documents Churchill as covering "laminar, transition AND
> turbulent Re" (`Pipe.H:67`, `FrictionFactorCorrelation.H:61`) and a pipe
> in the transition band is computed on it without saying that the number
> is an interpolation, not a prediction (the band is named at
> `FrictionFactorCorrelation.cpp:50-53` for Colebrook/Haaland only).
> Scope (his words are the specification): (1) the lesson teaches the
> transition as a region of INSTABILITY -- intermittent turbulent puffs,
> a critical Reynolds number that depends on the disturbance level (inlet,
> vibration, roughness), hysteresis -- where no correlation predicts the
> friction factor and the regime itself is not determined by Re alone;
> Churchill's blend is presented as a smooth INTERPOLATION for continuity
> in a solver, never as physics of the transition; (2) the history:
> Reynolds 1883 and his carefully undisturbed apparatus, the much lower
> critical Re observed when the same apparatus was re-run in a modern,
> vibrating environment, and the modern measurement of sustained
> turbulence onset near Re ~ 2000 -- EVERY historical figure checked
> against a primary or authoritative source before it is taught (Reynolds,
> Phil. Trans. R. Soc. 174 (1883); the re-runs of his apparatus at
> Manchester; Avila et al., Science 333 (2011) on the onset of sustained
> turbulence), the anecdote as he recalls it is the question, not the
> answer; (3) the engine ANNOUNCES a pipe whose Re falls in the
> transition band: the friction factor is Churchill's interpolation, the
> regime is not determined there, the design should move out of the band
> -- an announcement, no number moved; the "covering transition" wording
> corrected in the headers.  Status: dispatched 2026-10-25.
> LANDED 2026-10-25 (`claude/c155-transition`): the lesson teaches the
> band as instability (finite disturbances decide the regime above ~2000;
> puffs; hysteresis; f not a function of Re) and Churchill as an
> interpolation for continuity, the band shaded on all four friction
> plots; a history step with its sources and how each was read --
> Reynolds 1883 read in full (two critical values, the coil of wire,
> "43.7 to 278"), Mukund & Hof (JFM 2018) for the ~13 000 and the ~2000,
> Avila et al. (2011) abstract only; his anecdote PARTLY confirmed: Van
> Dyke's Album says modern Manchester traffic lowered the critical number
> of Reynolds' own apparatus -- the year, the value, "vibration",
> "trucks" and "museum" were NOT found and are not taught; the engine
> ANNOUNCES a single-phase pipe with 2300 <= Re < 4000 (`Pipe.cpp`,
> caveat block, no number moved; `check_friction_correlations` arm (h),
> failing on main first); the Theory Guide, User Guide and pipe01 header
> teach the same.

> **C154. A USER'S WALK THROUGH THE NANOFILTRAN CASE ON THE LIVE SITE
> (Vitor, 2026-10-25: "O CPT Astra tambem decidiu ajudar e fez este review
> para por a tua consideracao" -- an external review of f871943a in the
> browser: run, log, dictionaries, results, F1, CSV export; kept OUT of
> the tree).**  Its verdict: the case runs and is auditable; the first use
> needs too much knowledge of Choupo's internals.  Commander's judgement,
> point by point (agree unless said): P1 the Theory Guide's Born sentence
> ("Like Donnan it scales with z_i^2") was WRONG -- the Donnan exponent is
> linear in z_i -- FIXED d674ca3a9, with the chapter's opening gamma
> qualified as the default of three activity choices (its P2); P1 "About
> this case" shows the short description and the licence banner, not the
> science -- show the three studies (A code to code, B CA30 measurements
> with previously fitted parameters, C the stiff case and the mesh), that
> the case IMPOSES J_v, and the calibration / digitisation caveats; P1
> separate the RUN status from the STATUS OF THE EVIDENCE -- `no claim`
> beside empty AAD columns reads as missing results on an op that fits
> nothing: say "not applicable", and the purpose (code-to-code,
> calibrated comparison) where the propsDict declares it -- never promote
> to `validated` because it converged; P1 F1 on a dictionary key
> (`poreRadius` opened the User Guide's `sec:gui`): key-aware help --
> meaning, unit, the model it feeds -- from the schemas where they carry
> it, else the block's help with its scope said; P2 navigation by the
> three scientific questions (the Overview opened on study C's figures),
> the map collapsed state and the selection kept across tabs (C153's
> splitter covers the height), a scientific table (per J_v and ion: J_v,
> c_bulk, c_wall, c_perm, R_obs, R_real, units) BEFORE the 97 raw
> diagnostics, the selected figure at the panel's full width, the caveats
> beside the figures (error bars = reading uncertainty; "nothing was
> fitted" = by this run; N-1 vs N-2 mesh counting; the mesh study's
> reference corrected for Davies only; 12 vs 88 iterations not a speed
> measure), the Outline naming operations and views, inactive properties
> marked (A_w in an imposed-flux bench), units shown in context without
> recommending a grammar the parser does not accept; P3 the log navigator
> on props cases jumps to OPERATIONS (it says "No unit banners found"),
> repeated warnings grouped; the CSV export self-describing (quantity,
> unit, label, source, what yError means) and the digitised-abscissa
> mapping documented.  Its own limit, kept: the walk is a usability
> trial, not a physical validation.  Status: the Born text fixed;
> the rest DISPATCHED after C153 lands (same files: PropsView,
> PropsDetails), one general, the reviewer's walk as the acceptance test.
> LANDED 2026-10-25 (`claude/c154-props-walk`, integrated with C155 and
> C156): the reviewer's walk replayed in a browser, step by step -- the
> map framed by the three studies, which the case now DECLARES
> (`studies (...)` in its propsDict, purpose from a closed list with no
> `validated` in it; an unknown op, an op in two studies, an unread key
> refused); About shows the case's README (the science, what it imposes,
> the caveats); run status, purpose and evidence in separate columns,
> "not applicable" where an op cannot have an AAD; a scientific table per
> J_v point and ion first (declared in the op schema, units from the
> engine; poreTransport now publishes `Jv_p<p>`, 29 rows APPENDED), the
> raw diagnostics folded after it; figures at full width with Enlarge and
> a `note` the views grammar now carries (11 on NanoFiltran); the CSV
> export with a 14-line self-describing header; F1 on a dictionary KEY
> (meaning, unit, the model it feeds, from the schemas -- a new membrane
> record schema; a key no schema covers answered for its block, said so);
> the log navigates operations and groups repeated announcements; every
> map block shows run / failed / not run / stale, stale per block only
> where the changed part is one the block reads, otherwise one case-wide
> badge.  NOT done: inactive-property marks (needs a structured engine
> fact), the thermoPhysPropDict F1 (its schema is the old grammar).
> ADDED the same day (Vitor: "Sim, regista no C154"), after asking whether
> such information diagrams are common in engineering software (they are:
> project schematics that show how the work is assembled left to right,
> pipeline browsers with a details pane, provenance graphs in scientific
> workflow tools): every block on the calculation map shows its STATE --
> run, failed, not run, or STALE because a file it reads changed since the
> run -- drawn from the existing staleness home
> (`gui/src/case/staleness.ts`, the case fingerprint stamped on the run)
> and from the run's own per-operation outcome; the state one word in ink
> AND colour (never colour alone), the map's legend naming the four.  The
> fingerprint is case-wide (2026-09-06: it is not a dependency analysis),
> so per-block staleness is claimed only where a block's own inputs are
> known (an op's propsDict block and the files it names); otherwise the
> whole map says "case changed since the run" once, never a per-block
> guess.

> **C153. THE PROPS SCREEN, SECOND PASS: A PANEL THAT RESIZES AND A BLOCK
> THAT ANSWERS WHEN CLICKED (Vitor, 2026-10-25, on the NanoFiltran case
> after C151 landed: "Ena pa! Ficou agora mesmo fixe e intuitivo!! ...
> Mas ainda temos de fazer umas afinacoes: o painel que fica por baixo
> nao e ajustavel.  Sera que pode ficar noutro menu de 'Plots'?  Aqui
> ainda estou na duvida.  Depois quando se clica nas caixas nao se veem
> la nada: nas operacoes unitarias ha uma box onde se pode clicar na
> teoria F1 e ver as coisas mais importantes.  Temos de refletir sobre
> isto.").**  Measured: the flowsheet's unit selection opens a FLOATING
> CARD over the canvas (FlowCanvas.tsx, "Selection card (top-right)":
> appears only when something is selected, foldable, Esc clears it, the
> credo's "pop-out beats modal"); the props map's selection only updates
> the details pane BELOW the map, which is a fixed height and out of view
> when the map fills the screen -- so a click looks like nothing.
> Commander's reading, put to him and taken as the stated default (a
> reversible GUI step): (1) the SAME selection card on the props map --
> the block's kind and name, its 3-5 most important numbers (verdict,
> AAD, the fitted parameters +- their 95 % half-widths, the model's key
> choices), the F1 theory button, "open in propsDict", and its figures as
> thumbnails that open full size; one component shared with the flowsheet
> card's frame, not a copy; (2) the map / details split becomes a
> DRAGGABLE divider (the size remembered as a reader preference, like
> the card's fold), with a "figures full height" toggle -- NOT a separate
> Plots menu, because a second door to the same figures is what C151
> removed (his own complaint of 2026-10-25: a Plots menu beside plots
> already on the main screen confuses).  If he still wants a Plots menu
> after seeing it, it is one switch.  Status: dispatched 2026-10-25.
> NARROWED the same hour (Vitor: "estive a ver melhor, e quando se clica
> numa box, o painel de baixo mostra o resumo!  Se o painel puder ser
> ajustado isso ja resolve muita coisa."): the card is DROPPED; the slice
> is the draggable divider, the full-height toggle, and a click on a block
> opening a collapsed details pane to a usable height.
> LANDED 2026-10-25 (`claude/c153-props-card`): the map is a draggable top
> panel on the shared resize behaviour the Streams band uses
> (`PROPS_MAP_PANEL`, `PANELS.propsMap`, 200-1600 px; drag, arrow keys,
> double-click or Enter resets to C151's computed height), its size a
> reader preference that changes nothing until dragged; "Figures full
> height" folds the map with one click and "Show the map" brings it back;
> the details header is never covered; a click on a block opens a details
> pane shorter than 260 px (or half the split on a short screen) without
> ever writing the stored size or shrinking a pane the reader enlarged
> (`propsSplit.ts`, 13 tests).  FlowCanvas untouched.  `--gui` 36/0 on
> main.  A Plots menu, should he still want one, is the props set in
> `allowedWorkspaceLabels` plus AppShell drawing it from the same views.

> **C152. ONE CASE, TWO MODES: PROCESS SIMULATION AND PROPERTIES & DATA
> (Vitor, 2026-10-25: "os dados podem ser usados no DSPM-DE para gerar
> previsoes, ou ... estimativa de parametros ... o caso que se prepare
> para estimar parametros pode depois expandir para a simulacao do
> processo ... o ideal era os dados experimentais e o ajuste estarem auto
> contidos no caso do processo final!"; then "Tens de pensar tu melhor
> como isso se resolve!  Eu posso abrir o caso em modo de simulacao de
> processo ou em modo de trabalhar com as propriedades e ajustes e data
> sets experimentais!").**  DESIGN, the commander's on his delegation:
> (1) an APPLICATION IS A RUN, NOT THE CASE'S IDENTITY (OpenFOAM: blockMesh,
> a solver and postProcess all run on one case folder) -- a case may carry
> `system/propsDict` (Properties & data mode, choupoProps) AND
> `system/flowsheetDict` (Process mode, choupoSolve) side by side, over
> ONE shared `constant/`; `controlDict.application` stays the DEFAULT
> mode, `runCase <case> props|process` picks the other, and a case with
> one dict is unchanged; (2) information flows ONE WAY: Properties mode
> WRITES records into `constant/` (a fitted membrane, a rate law, a
> pair), Process mode only READS them; (3) every written record carries
> its PROVENANCE and a FINGERPRINT of the dataset and of the fit block
> that produced it (origin fitted, fittedInCase, the held-out verdict);
> Process mode REFUSES a record whose fingerprint no longer matches its
> inputs, naming the remedy "run the case in Properties mode", never
> using a stale fit in silence; (4) a prediction is the same operation
> grammar with no free parameters; an estimation is `fitParameters` with
> a `residual { kind membrane; ... }` and an `output { record ...; }`;
> (5) the GUI opens a case with both dicts on a mode switch -- Process
> (the flowsheet) | Properties & data (the calculation map, C151) -- and a
> unit that reads a fitted record links to the fit that wrote it.
> Witness: a membrane case -- lab rejections, the DSPM-DE fit, the
> fitted membrane record, a spiral-wound stage that uses it.  Dispatched
> 2026-10-25 with C149's membrane fit (engine side); the GUI mode switch
> joins C151.  ENGINE SIDE LANDED 2026-10-25 (`claude/c152-two-modes`):
> `fitParameters residual { kind membrane; model DSPM-DE|SDEM|
> solutionDiffusion|constantRejection; }` (one dataset row = one operating
> point, evaluated through the units' own transport law and polarisation),
> `output { record "constant/assets/<name>.dat"; }` writing a `kind NF`
> record with per-value uncertainty, the verdict and SHA-256 fingerprints
> of its inputs; a unit that reads a STALE fitted record refuses by name
> with the remedy `runCase <case> props`; `runCase <case> props|process`;
> goldens `expected` (default mode) + `expected.<mode>`; `caseManifest`
> carries `modes`.  Witness `steady/membranes/membrane24_fit_then_simulate`
> (FdL 2021 NF270: r_p 0.675 +- 0.034 nm, X_d -10.5 +- 4.1 mol/m3,
> correlation -0.96, held-out sulfates AAD 0.93 points, `validated`; the
> partition was chosen after measuring others and the header says so).
> Gate `check_fit_then_simulate` (S1-S4 caught).  No existing golden
> moved.  Validated: props + membranes + batch/membrane + unsteady 157/0,
> `--fast` 76/0, the generated artefacts, `--gui` 34/1, the one failure fixed and its test file re-run green (the run-log lesson cited `bin/runCase` lines the two-mode dispatch had moved, +47).  Riding with it: the
> view writer (C147) now refuses a path inside data/standards/
> (`check_standards_write_guard` had gone red on main).  NOT done, named:
> the thermophysical package (ion radii, D0) is not fingerprinted; SDEM,
> solutionDiffusion and constantRejection residuals have no real-data
> witness; a spiral module fed a subset of the package's salts prints
> R_obs 100 % and "no B_s" for the absent ones (display only).  The GUI
> mode switch is C151's.

> **C151. A PROPS CASE GETS STRUCTURE: A CALCULATION MAP, A TREE BY
> DISCIPLINE, F1 TO THE THEORY, AND ONE HOME FOR ITS FIGURES (Vitor,
> 2026-10-25, reviewing C147's screen: a "Plots" menu beside plots already
> on the main screen confuses; "os dicionarios do caso sao muito
> importantes para consulta"; "nao ha nenhuma tree para nos guiarmos?
> Fica tudo ao molho? E baralhas termodinamica, cinetica quimica,
> transporte em membranas?"; "No flowsheet ... F1 e vamos ter a pagina
> exata da explicacao da operacao unitaria.  Aqui o help e uma confusao
> monumental ... podia haver um data set com uma seta para um bloco de
> modelo de transporte e ai com um F1 chegavamos a pagina da teoria";
> "Temos de ir por tentativa e erro.  Avanca").**  Measured: 46 props
> operations in a flat list; `tutorials/props/` folders mix discipline
> (thermo, kinetics, membrane, transport ...) with activity (fit,
> estimate, compare, scan, curation ...); F1 is handled per workspace in
> AppShell.tsx:231-255 and ExploreWorkspace.tsx:1083-1100.  Phase 1,
> dispatched: (1) a CALCULATION MAP -- the props case drawn like a
> flowsheet: data blocks (the datasets and references the propsDict
> names), model blocks (the thermo package pieces and the law an op uses:
> DSPM-DE, an isotherm, a rate law), operation blocks (predict / fit /
> scan / estimate), view blocks (the figures), arrows from what each op
> reads to what it writes, DERIVED from the propsDict and each op type's
> declared inputs, never drawn by hand; F1 or a click on any block opens
> the Theory Guide (or the EduTool) at its section, the same gesture as a
> unit in the flowsheet; (2) the TREE by discipline (Thermodynamics,
> Transport, Kinetics, Separation, Data, Safety) with the activity as a
> tag, each op type declaring both in ONE home (its schema); (3) the
> menu: Results is the one home of a props case's figures (the Plots tab
> leaves props cases; free CSV plots move into Results, collapsed); Case
> stays, named Case, and every operation and view links to its block in
> the propsDict.  Phase 2 (folders by discipline) waits on his look at
> phase 1.  PHASE 1 LANDED 2026-10-25 (`claude/c151-props-structure`), with
> C152's GUI half: every props op schema carries an `x-choupo` block
> (discipline, activity, model keys, data read, records written -- one
> home, a test fails on an op without one); Results = case tree (Overview,
> Data, Models, Operations by discipline with their views, Records, Process
> units, My plots) | calculation map (React Flow, read-only, derived from
> the propsDict, left to right data -> models -> ops -> views -> units,
> ops of one type grouped, studies framed: NanoFiltran in 13 blocks) |
> details of the selection, one selection across the three; F1 / double
> click opens the model's theory or the op's guide section (a new
> `op:<type>` label for every op; check_guide_anchors holds 181 anchors);
> menu File . Results . Log . Case . Literature . Help, Plots gone for a
> props case ("+ New plot" under My plots); the Case tab opens at the
> block.  Two modes: the Process | Properties & data switch appears only
> for a case with both dicts (held to caseManifest over every case), the
> map draws dataset -> fit -> record -> unit, a unit fed by a fitted record
> links back to its fit, a stale fit shows a banner with the remedy.
> Validated: `--gui` 35/0 on main 11c59908e, typecheck, the schema,
> anchor, guide and generated-artefact checks.  Screenshots in the
> commander's scratchpad.  NEXT, proposed by the general: one run control
> per mode, ctrl17's trajectory wired as a dataset, studies labelled by
> the propsDict, a taller map on wide screens.  Design record
> `docs/design/a-props-case-drawn-as-its-calculation.md`.

> **C150. A SECOND EXTERNAL REVIEW OF THE EDUTOOLS, R01-R28 (Vitor,
> 2026-10-25, a review of 63 EduTools relayed for the commander to judge
> and act on).**  It asks, per point, confirmed / partly / not confirmed,
> the evidence, the correction, the verification and what is pending, and
> to contest what does not hold.  Measured overlap with what is already
> owed: R01-R05 are the overpressure points C112 G11 built and left
> stranded (`claude/c112-overpressure-review`); R17 and R22 overlap G12
> (`claude/c112-g12-pump-fel-ladder-ss-poolfire`).  Plan: wave 1 lands G11
> + G12 and the safety and layout points (R01-R06, R26); wave 2 the engine
> investigations, each with a test able to fail (R07 element-potential
> with two condensable species, R08 PC-SAFT entropy and R ln Z, R14
> epsilon-NTU across saturation, R15 the cooling tower's external energy
> balance, R16 the pinch duty inventory, R27 the tear-streams contract);
> wave 3 the wording points across the remaining tools (R09-R13, R17-R25,
> R27, R28), "neste exemplo / neste modelo / nesta implementacao" rather
> than universal claims, limitations placed beside the numbers.  The
> review itself is kept out of the tree.  WAVE 1 LANDED 2026-10-25
> (`claude/c150-wave1`): C112 G11 (overpressure points 1-4, 10, 11) and G12
> (five EduTools on points 5, 8, 9, 12-14; the pool-fire helpers pure in
> `poolFire.ts`), R01-R06 and R26 -- the relief-valve basis now says its
> MAWP is ASSUMED equal to the design pressure and relieves at set + 10 %
> (8 `basis` rows of greenAmmonia03 moved, wording only, no number), and
> an exchanger priced above CAPCOST 2017's 140 bar g pressure-factor
> ceiling is announced `[validity] ... EXTRAPOLATED` (never clamped).
> Found while rebasing: main's `gui-tests` were red -- the C131 adiabatic
> mixer moved greenAmmonia03's converged streams in the 10th digit and
> nothing re-copied the two letdown witnesses that copy them
> (`letdown01` 0/RawLiquid + 0/Purge, `letdown02` purge + liquidLP); they
> are re-copied, no golden moved.  Validated: `--gui` 35/0 (6228 tests),
> the four cases, check_relief_valve, check_cost_provenance,
> check_design_sheet, the generated artefacts.  R01 LANDED 2026-10-25,
> on the commander's delegated authority on goldens: `pressureDesign` is
> derived on GAUGE by max(1.1 x Pg, Pg + 1.7 bar), the Design Guide's
> preliminary rule, in five plant cases (it had been 1.1 x the ABSOLUTE
> pressure, one bar of atmosphere in every margin; every consumer reads it
> as gauge).  285 rows moved, exactly the prepared list (same keys; values
> within 1.4e-7 of it, the C131 mixer's drift), updated row by row:
> design pressures, walls, weights, costs, relief set pressures and areas,
> economics (FCI -0.07 % PEQ, -0.16 % 150 bar; the acetic low-pressure
> items rise 2 -> 3 bar g on the +1.7 bar floor).  greenAmmonia03's README
> re-read (166 bar g, 147 mm, 175 t, the psv table) and the one-shell
> comparison re-measured by a probe (unchanged at its precision); the
> stage comparison regenerated.  NOT touched, Vitor's call: ammonia02,
> ammonia03, ammoniaReactor03/04 (220 = "200 bar loop + 10 %", the same
> derivation).  Riding with it: C152 had left three lesson citations
> stale (bin/runCase, FitParameters.cpp); remapped by the diff's line map.
> Validated: the five cases, check_converter_shell, check_relief_valve,
> check_design_sheet, check_cost_provenance, check_economic_sensitivity,
> `--gui` 34/1 with the one failure (those citations) fixed and its four
> test files re-run 301/301, the generated artefacts.  WAVE 2 LANDED
> 2026-10-25 (`claude/c150-wave2`), every point measured against the
> engine before it was fixed, each with a test shown failing first:
> R07 CONFIRMED and worse -- with two condensables supersaturated the
> element-potential, reactiveFlash and directMin-fallback answers stayed
> gas-only in silence (gibbs07 + methanol at 280 K: "single gas phase" with
> y_w P 14.5 kPa against Psat 0.99 kPa); one test
> (`supersaturatedCondensables`, GibbsMethod.cpp) now marks such an answer
> and the reactor REFUSES it by name on its final solve, naming
> `model directMin;` (gate `check_gibbs_condensables`; gibbsMap counts and
> announces those cells).  R08 CONFIRMED -- `PCSAFT::S_residual` returned
> the (T, rho) residual, the cubics the (T, P) departure `S_real` assumes;
> + R ln Z added (gate `check_departure_convention`: two Maxwell
> identities, PC-SAFT 56-136 % off before, 1e-6 after); the 12 moved
> rows (pcsaft01-03, S_R and S_real) each move by exactly R ln Z of the Z
> its golden pins, checked point by point, and were updated row by row on
> the commander's delegated authority.  R14 CONFIRMED -- an exchanger
> whose side crosses saturation is ANNOUNCED (the duty is sensible
> epsilon-NTU; LMTD is no check there; F printed with 2N passes); no
> number moved (gate `check_exchanger_phase_change`).  R15 CONFIRMED --
> the cooling tower's G(h2 - h1) = L cp range is an identity of the
> constant-L line; the unbalanced -E cpL (T_out - T0) is published as
> `H_closure_gap_kW` (tower01 -1.39 kW, 3.8 % of the duty; one row
> appended) and announced, nothing corrected.  R16 CONFIRMED -- the pinch
> population took only units publishing `Q` (a column did not enter; an
> exchanger entered as its hot side and its duty counted as cooling:
> heatExchanger01 reported Q_C,min 93.79 kW for a plant that needs no
> utility); every boundary duty is now a segment or an EXCLUDED row with
> its reason (`reports/pinch/population.csv`), the targets say "of the N
> extracted segments" or "NOT the plant's", KPIs `segments`,
> `duties_excluded`, `Q_excluded_kW` (rows appended: pinch01, greenAmmonia02
> 150/50 bar -- the 31/22 MW converter excluded); the energy-item
> vocabulary moved verbatim to `src/result/EnergyItems.H` (layering).  R27
> PARTLY -- the engine refuses a bad plan; the lesson spoke of the old
> silent answer; gate `check_sequential_plan` runs the three refusals
> through the binary.  Validated on main + C151: the 29 touched cases, the
> four new gates and the changed ones, check_std_includes,
> check_compile_clean, check_wasm_dialect, `--gui` 35/0, the generated
> artefacts.
> PROPOSALS for Vitor (not built, physics or pedagogy): column ports and
> reactor duties in the pinch population; a variable-L (Poppe) tower;
> reactiveFlash growing its active set instead of refusing; a two-phase
> epsilon-NTU / condenser model; the pcsaft "..._liquid" props points are
> evaluated on the vapour root by the family contract (names mislead).
> Riding: Views.cpp's missing <map>/<memory> (check_std_includes red on
> main since C147).  WAVE 3 LANDED 2026-10-25 (`claude/c150-wave3`), 40
> files of wording under gui/src/ui/methods/, each point measured first:
> R09 confirmed (Wilson's missing pair is Lambda = 1, not A = 0 -- with
> A = 0 a size term stays; "exactly ideal" scoped to the binary); R10,
> R12, R18, R23, R28 confirmed; R11, R13, R17, R19, R20, R21, R22, R24,
> R25, R27 partly (much already said; the over-broad remainder scoped to
> "this example / this model"); claims now scoped, limits beside the
> numbers, the column-control registry's "five inventories" corrected to
> the lesson's three.  `--gui` 36/0.  FOUND by it and FIXED by the
> commander on the same branch: the McCabe-Thiele page added one stage
> for a partial condenser -- the staircase is the same either way and its
> first step IS the condenser, so the +1 counted it twice and moved the
> feed marker; N and the feed stage no longer depend on the condenser and
> a `trays` readout says which steps are trays.  FOUND, NOT FIXED
> (suspected, not demonstrated -- separate slices): the single-reaction
> PFR uses liquid molar volumes for concentrations but the ideal-gas
> standard concentration for Kc (matters only for delta-nu != 0); the
> multi-reaction CSTR assumes one root at fixed T without checking.
> PROPOSALS for Vitor (pedagogy or physics): fractions over total carbon
> with an "other species" curve (Bjerrum); complete Ponchon and
> Hunter-Nash staircases against MESH at the same specifications; a
> centrifugal pump curve with NPSH; a delta-nu != 0 reactor witness; the
> van Heerden stability from the Jacobian; KKT residuals with scales;
> a collapsible technical section for bug chronicles; a Wilson case with
> unequal volumes.  C150 is COMPLETE.

> **C149. THE RESULTS A RESEARCHER RECEIVES: PLOTS FIRST, AND FITTING A
> MEMBRANE TO HIS OWN DATA (Vitor, 2026-10-24, with screenshots of the live
> app on polarisation01: "Tu achas que isto e um bom GUI para acompanhar os
> resultados da simulacao?!  Nao ha um postProcessDict a selecionar o que e
> representativo para esta analise?!  Nao ha um grafico! ... Eu tenho um
> investigador que pediu o Nanofiltran e eu quero lhe dar isto!  Ele pode
> estar interessado em criar uma simulacao para simular um conjunto de
> resultados experimentais e ajustar parametros!  Isto e AI SLOP!").**
> Measured: a props case's Results view is a flat list of KPI keys
> (Gamma_Cl_r1 ... r10, D_Na, ...) with no plot; no outer driver estimates
> parameters of a membrane model (OuterDriver.cpp registers sweep,
> gridSweep, fitBinaryPair -- retired, paretoSweep, optimization,
> designSpec); `fitParameters` (src/propertyOps/FitParameters.cpp) fits
> PAIR parameters with a held-out verdict.  (1) Folded into C147 at once:
> the dictionary is `system/postProcessDict`, a case that has one OPENS its
> results on its plots and tables, per-row KPIs are published as series, and
> polarisation01 gets its Table 1 / Fig. 7 view.  (2) NEW: a membrane
> characterisation fit -- the DSPM-DE (and SDEM / solution-diffusion)
> parameters (r_p, X_d, dx/A_k, eps_p; per-ion P_i) estimated from a
> researcher's dataset of fluxes and rejections, on the fitParameters
> discipline (evidence partition, a held-out set, a band declared before
> the fit, identifiability, a verdict), shown as fitted curves over the
> data in the same post-processing view.  Dispatched after C147 (shared
> src/propertyOps and the Plot workspace).
> DESIGN, decided by the commander on Vitor's delegation (2026-10-24:
> "Avanca com a que achares melhor -- eu depois testo e dou-te a minha
> opiniao"), after he rejected taking "postProcessDict" literally ("tens de
> refletir!  ... o caso choupoProps e para ser preparado para AI, e o GUI
> so serve para o utilizador rever ... o choupoProps serve para criar
> componentes novos, ajustar cineticas, adsorcoes etc -- e um companion
> para o engenheiro que cria o seu data set no laboratorio"): THREE LAYERS,
> ALL IN THE propsDict (one file an AI writes whole).  (1) DATA:
> `constant/experimental/<name>.dat`, one row = one experiment = one
> simulation.  (2) AN OPERATION OVER THE DATA: `fitParameters` with a new
> `residual { kind membrane; model DSPM-DE|SDEM|solutionDiffusion|
> constantRejection; dataset ...; }` (the isotherm grammar), the same op
> with no free parameters PREDICTS every row; rows are independent, run in
> parallel natively and in series (warm-started) where continuation or the
> browser needs it; the held-out / band / identifiability / verdict
> discipline unchanged.  (3) VIEWS: every operation publishes its DEFAULT
> views (a fit: parity, residuals, parameter table, verdict; a prediction:
> model curves over the data) with nothing declared; extra views in a
> `views ( ... )` block of the propsDict; data in
> `postProcessing/<op>/<view>.csv`.  The Props review screen, top to
> bottom: a verdict strip per operation, the figures, the parameters, and
> an "Audit" section collapsed by default (raw KPIs, decision ledger,
> operations; thermo readiness only where components are being created or
> estimated).  The same idea extends to choupoSolve later.

> **C147. PLOTS A CASE ASKS FOR: A POST-PROCESSING DICTIONARY (Vitor,
> 2026-10-24: "Era bom ter um dicionario onde se pudessem pedir plots que
> o utilizador gostasse de ter e que sejam pertinentes para pos
> processamento! ... no menu Plot em PostProcessing ... membrane10 ...
> o potencial dentro da membrana ou rejeicoes").**  Measured on main: a
> unit publishes ONE `UnitProfile` (one x-axis; `SimulationResult::
> profiles` holds one per unit -- `check_internal_states` arm (f) says two
> kinds on one unit has no live case); `spiralWoundModule` publishes its
> z-profile or, with scaling, a per-module table
> (SpiralWoundModule.cpp:1176); the pore profiles (c_i(xi), psi(xi)) are
> solved at every station and published nowhere; the GUI has a Plot
> workspace with a CSV auto-plot.  Proposal put to him: `system/plotDict`
> declares plots by name over PUBLISHED quantities (a unit profile, the
> pore at chosen stations, KPIs across an outer sweep); the engine
> REFUSES a name it does not publish and writes each plot's data to
> `postProcessing/<plot>.csv` with its units; the GUI draws them under
> "Post-processing" in the Plot workspace and computes nothing.  It needs
> a unit to publish MORE THAN ONE named profile -- an architecture change,
> his to approve.  RULING 2026-10-24: "Avanca como achares melhor" --
> APPROVED as proposed.  Sequenced after C146 and the C113 revival (both
> edit the files it needs: SpiralWoundModule, the GUI Plot workspace).

> **OPEN-WORK REGISTER (2026-10-24, after Vitor found a request dropped:
> "Tu ja te tinhas esquecido dessa tarefa que eu te tinha pedido?").**  An
> audit of every branch stranded by the 2026-10-20 machine failure found
> that NONE of the nine reached main by any route; each is listed here
> until it is merged or closed, and this register is re-read at every
> session start.  Lane A (engine, goldens owed to Vitor's authority):
> G14 letdown NH3 re-import (`claude/g14-letdown-nh3-reimport`, 12
> letdown01 rows), G13 gibbs07 closure (`backup/g-a7ca4522633443063`,
> gibbs07/08/09 + greenAmmoniaPEQ rows), G8 one home for the 1.18 + C71
> README (`backup/g-a351ac66e0c704e8d`, per-item C_TM rows).  Lane B (GUI,
> one at a time because they share files): C113 search (being revived),
> G16 colour by any field + the Streams-table solid double count
> (`claude/c114-flowsheet-colour`), G17 the unit that pulses
> (`backup/g-a2f767a5e10a7820e`), G9 fold long trains
> (`backup/g-af5c1d01a52ae83b4`, scratch tests to drop), G11 + G12 the C112
> EduTool corrections (`claude/c112-overpressure-review`,
> `claude/c112-g12-pump-fel-ladder-ss-poolfire`), G5 the batch Gantt
> (`backup/g-aa0b7a24502e7bf75`).  Also open: G4 debt financing
> (`claude/c110-g4-debt-financing` 484b52f54); the 2026-10-21 delegated
> decisions (compressor refuses liquid in suction; adiabatic mixer fixed);
> C131 phase 1 validation of the unvalidated C124 merge; C136, C137 (for
> Saturday); C127; C143 (built, awaiting Vitor's look); C145, C146 (in
> flight).  Waves that wait on these: C110 wave 2, C112 wave B.
> SECOND AUDIT 2026-10-25 (Vitor: "reve se escapou mais alguma coisa e
> acrescenta a lista"; every remote branch, every 4c entry and his own
> messages in the session transcript were read).  STILL OPEN, in priority
> order: (1) C147 + C149 -- one NanoFiltran case with its plots (LANDED
> 2026-10-25: views in the propsDict, every op's defaults, the review
> screen, `props/membrane/nanofiltran_geraldesAlves2008`), then the
> membrane fit for the outside researcher (NEXT); (2) C150 wave 1 (G11 + G12,
> R01-R06, R26), then waves 2-3 together with C131 phase 2 (a)-(g);
> (3) C131 phase 1 + the compressor refusal + the adiabatic mixer
> (`claude/c131-land`, validated) -- then the white paper's and the C&CE
> draft's benchmark D and cavett01 numbers re-read; (4) Saturday: C136
> bunds EduTool, C137 Bayes, the C&CE major revision, the JOSS
> three-reader revision; (5) owed to Vitor and never delivered: the
> instructions to run the full suite on his 10-core PC (promised
> 2026-10-24), the C112 final table, and the green-ammonia DEOXO question
> (asked 2026-10-22, answered in chat with three options, never recorded:
> deoxo + dryer, deoxo + moving the make-up point, or the electrolyser
> package already covers it; the ~10 ppm oxygenate limit unverified --
> his decision -- RULED on his delegation 2026-10-25, "Decide como achares
> melhor": the base case stays as it is, because it already says why --
> greenAmmoniaPEQ_baseCase/system/flowsheetDict lists "the H2O + O2 of the
> hydrogen (the feed here is pure H2)" among "WHAT IS NOT IN THIS CASE,
> and is the groups' work"; the oxygen removal (deoxo + dryer, or an
> electrolyser package that delivers synthesis-grade hydrogen) is a design
> decision the student groups must take and defend; the pre-2026-10-01
> version of the case carried a deoxo and a dryer, in git history as a
> worked reference); (6) dropped work still MISSING: G4 debt financing
> (`claude/c110-g4-debt-financing` 484b52f54), G9 fold long trains
> (`backup/g-af5c1d01a52ae83b4`), G5 batch Gantt
> (`backup/g-aa0b7a24502e7bf75`, re-base on G2's multiproduct JSON);
> (7) queued: C112 wave B, C110 wave 2 (room data sheets + HVAC, RO+EDI,
> utility tariffs, layout extensions -- the Atozet asks), C127 (the
> student's own data / compounds in the Explorer), C133, C135, C129, the
> scopes of C130 and C132, donepezil 5 mg, C118 stage 3, the C146/C142/
> C138 open items, C124 item 2; (8) small defects: Blasius does not flag
> 2300 <= Re < 4000; ethanol.dat lacks a Fuller diffusionVolume;
> userOp03_case_rate_law at 133 % mass closure; lithiumBrinePlant's 70
> unpinned KPI rows; apalutamide01's nine drifting rows; C123's
> shortcutColumn products at the feed bubble point and the multi-reaction
> pfr console (F_out 1000x small, tau 0.00 s); the named items of
> C85-C97; (9) decisions owed by Vitor: 4b R1-R6 (check first whether
> C38's "Faz tu!" covers them), the 2026-10-12 list of fourteen, C101
> feedback, C107 drag-and-drop, C71 M1, the C115 outer-iteration
> indicator, the upstream benchmark issue, the papers' authors / ORCIDs /
> cited release, JOSS eligibility.  STALE STATUS LINES corrected by this
> audit (the work did land): C118 stage 2, C128 slice 2, C126 GUI
> figures, C119's shelf, C102/C102b/C103/C106/C107/C109 "pending merge",
> C120 item 4, and the 2026-10-21 "site is not publishing" (it has
> published every push since 2026-10-24).
> ADDED 2026-10-25 (Vitor: "so quero ter a certeza de que nao te esqueceste
> de nada daquilo que eu encomendei"; the commander decides WHEN): IN
> FLIGHT -- C151 (props calculation map, tree, F1, one home for figures,
> the tree + canvas + details layout) and C152 + C149 (one case, two
> modes; the membrane fit for the outside researcher); C150 wave 1
> validating.  SCHEDULED, in this order once those land: C150 waves 2-3
> (R07, R08, R14, R15, R16, R27 in the engine; the wording points) with
> C131 phase 2; the R01 design-pressure golden rows (285, 5 cases; the
> rule choice is the Design Guide's); C136 and C137; the C&CE and JOSS
> revisions (benchmark D and cavett01 numbers re-read); G4, G9, G5; C140
> (the intellectual-property EduTool, with the turbine case and the
> defensive-publication addendum) and C139 (the chemical-network
> economics EduTool) -- each STARTS with a scope put to Vitor, because
> the pedagogy is his; then the queued items (7)-(8) above.  This list
> is the commander's memory: re-read at every session start, and an
> item leaves it only when it lands or Vitor drops it.
> PROGRESS 2026-10-24: LANDED -- C113 search, G16/C114 colour (with the
> Streams-table solid double count fixed), and lane A: G14 letdown NH3
> (12 rows), G13 gibbs07/08/09 + greenAmmonia + aceticAcid feed and
> outlet priced as the report prices them (gibbs07 residual -6.69 kW ->
> 0), G8 one home for the 1.18 (per-item C_TM only; FCI/NPV identical to
> 1e-12 on 23 cases).  Goldens updated ROW BY ROW (only rows out of
> tolerance or no longer published: 84 across 13 cases), never by a
> blanket --record, on Vitor's delegated authority.
> 2026-10-25: C131 phase 1 DONE (C124 item 1 validated; column17's golden
> had been recorded before G28 -- 53 rows caught up, row by row; the C126
> figure rebuilds byte for byte); the 2026-10-21 delegated decisions DONE
> -- a compressor REFUSES liquid in its suction (three recycle-tear seeds
> declared `phase gas;`; benchmark D gains a knock-out drum, C5 144.54 ->
> 140.00 kW, methanol 1.2098 -> 1.3967 mol/s -- the white paper and the
> C&CE draft quote the old benchmark D numbers and must be re-read), and
> the ADIABATIC mixer priced as the report prices it: cavett01's plant
> residual -549 319 -> +0.002 kW, the C&CE reviewer's central objection
> (section 2) answered in the engine; 47 rows moved row by row.  OPEN:
> userOp03_case_rate_law at 133.33 % mass closure (pre-existing).
> PROGRESS 2026-10-25, later the same day (Vitor: "so quero que termines
> tudo o que tens agendado"): LANDED on main -- C152 (one case, two modes,
> the membrane fit), C150 waves 1, 2, 3 and R01 (C150 COMPLETE), C151 phase
> 1, C136 bunds, C137 Bayes, G4 debt financing, the C&CE and JOSS
> revisions, and G9 the long train folded (`claude/g9-fold-trains`: a
> plant whose fit zoom in a 1280 x 720 window is below 0.5 and width-bound
> folds into two rows at an exact minimum cut of the stream graph -- a
> recycle loop is never split, the fewest cut wires among folds within
> 90 % of the best zoom, accepted only if it adds no overlap, no wire
> through a box and no crossing; 8 of 368 views fold (the four green-
> ammonia plants 0.20-0.23 -> 0.33-0.41, aceticAcid02, proxy01,
> combined01, economics03 drawn from its .cho), 2 more change by the
> source-tree rule (apalutamide01 crossings 18 -> 10, donepezil01 16 -> 1),
> 358 identical, the folded list pinned by a test; the 0.5 / 1.2
> thresholds are the general's judgement, Vitor may move them; `--gui`
> 36/0 on main).  G5 LANDED (`claude/g5-batch-gantt`): the batch plan's
> Gantt in Reports, drawn from the engine's batch-plan JSON in BOTH shapes
> it writes (`BatchPlanJson.cpp` single product and `emitMultiProduct`) --
> a field the reader needs and the engine did not publish is named in red
> and never defaulted, nothing re-derived; one product: one block per
> train, the limiting stage and T_L dimensioned between the published lot
> starts; several: a year block (campaigns, changeovers, stage cleans, the
> available time) and a first-campaign block per product; held to
> apalutamide01's own gantt.csv; `--gui` 36/0.  NOT done: no multiproduct
> TUTORIAL exists (G2 shipped only a probe inside check_batch_plan), so
> the multiproduct drawing is tested on a fixture in the engine's shape --
> a witness case is a corpus decision.  C131 phase 2 family (a)
> thermodynamics REVIEWED (branch `claude/c131-review-thermo`, its report
> in the branch's docs/design/, not yet on main): WRONG W1 gamma-phi without
> phi_sat / Poynting (pure propane at 310 K, 15 bar reported superheated
> vapour, 23 cases reach it -- a proposal, moves goldens), W2 bubble/dew T
> pricing the trial phase at the wrong composition and clamped to
> 200-700 K, W3 the phi-phi liquid enthalpy not on the EoS (flash09 latent
> heat 2.0 % low), W4/W8 an outer loop at its cap reported converged
> (fixed), W5 UNIQUAC gamma = 1 for an absent component (fixed), W6 the SRK
> m(omega) attribution (Graboski-Daubert, comments fixed), W7 a flat T-x-y
> (fixed); MISSING M1 no liquid-split check after a VL flash, M2 no
> fugacity residual published; gate `check_thermo_limits`.  LANDED with
> its refutation (`claude/c131-refute-thermo`, report
> `docs/design/review-c131-thermodynamics.md`): the refuter confirmed the
> defects with a second, independent implementation, CORRECTED the
> trivial-root refusal (it refused a real azeotrope -- bubbleT02's
> ethanol/water -- and now refuses only a phi-phi package whose two roots
> are one root), moved the lesson citations the inserted lines shifted,
> and MEASURED the shared-path change on 598 case folders against main:
> exit codes identical, no refusal fires anywhere, the JSON identical but
> for flash09/10's T-x-y block (intended) and rounding in four UNIQUAC
> cases; `--gui` 36/0 on main.  Its corrections: W1 reaches 24 cases, the
> SRK m(omega) difference is larger than stated, M1 misses the existing
> opt-in `phaseSet auto`, M2 is 20x larger (flash09 7.3e-6 in ln f).
> PROPOSALS for Vitor, worst first: W1 phi_sat / Poynting in gamma-phi
> (24 cases move), W2 bubble/dew T rebuilt on the incipient-phase
> iteration with a Tb/Tc bracket, W3 the phi-phi liquid enthalpy from the
> EoS liquid root, M1 an announcement, M2 a residual KPI, W6 Soave's or
> Graboski-Daubert's slope.  Family (c) REACTORS LANDED (analyst +
> refuter, `claude/c131-refute-reactors`, report
> `docs/design/review-c131-reactors.md`): FIXED -- the cstr/pfr reverse
> rate used the ideal-gas Kc in kmol/m3 against liquid-basis mol/m3
> (MTBE, Sigma-nu = -1: 99.95 % against 98.53 % consistent), now refused
> by name for Arrhenius/LHHW laws; the multi-reaction CSTR's other extent
> roots ANNOUNCED with their stability for a one-reaction set (an
> autocatalytic law had reported washout X = 0 against the stable 0.8954;
> in adiabatic mode the other roots are said NOT to be steady states);
> the gibbsReactor dropping a condensate with one declared outlet
> (0.254 % mass closure) refused; the equilibriumReactor's phi loop (y_NH3
> 0.300 -> 0.324 at 200 bar, ideal gas byte-identical), its duty as
> H_out - H_in (the syngas EduTool's -5.30/-1.72 kW were the defect; -30.89
> / -11.08 kW), its supersaturated outlet refused (incl. the mixture's dew
> point); the dynamicCSTR's Sigma-nu != 0 drain ANNOUNCED and its dropped
> `reversible`/`A_rev` restored; gate `check_reactor_limits`; 115 reactor
> cases identical to main.  PROPOSALS: a KKT check on directMin, the root
> audit for several reactions, a constant-volume outflow for the
> dynamicCSTR, M1-M6 of the report (a liquid standard state for reversible
> liquid reactions is pedagogy).  `check_ammonia_rate` arm (i) is RED on
> main since the C131 adiabatic mixer moved ammonia03's bed states inside
> its 1e-4 golden tolerance but outside the bench's 1e-6: re-transcribing
> moves the bench's golden past 1e-4 (two rows) and prose figures -- the
> commander's next slice, on delegated authority.  Family (b) separations LANDED
> (analyst `claude/c131-review-separations` + refuter
> `claude/c131-refute-separations`, report
> `docs/design/review-c131-separations.md` with its Refutation appendix):
> FIXED -- the Kremser stripper deleted a solvent arriving in its
> stripping gas (stripper01 + 20 kmol/h steam: mass 91.807 %, 1363 kW
> first-law hole, exit 0), stripper and absorber deleted a non-solute
> arriving in their liquid (96.986 % / 97.469 %), the stripper lacked the
> absorber's no-solvent refusal (60.926 %) -- all now REFUSE by name
> (gate `check_kremser_inventory`); the full MESH priced a two-phase feed
> as a blend at z and two feeds on one stage at a molar-average T, and the
> same fix closed 6.916 kW the CMO `simultaneous` duty block left on
> column04 (arms (j), (k) of `check_feed_thermal_state`).  36 column /
> absorber / stripper cases PASS, `--fast` 76/0, no golden moved.
> PROPOSALS for Vitor: P1 the CMO columns use q = 1 - vf, so a subcooled
> feed is priced in the duty but not in the internal flows (column01 at
> 300 K: x_D identical to 9 digits, Q_reb +260 kW) and `feedQuality 1.29;`
> is REFUSED as a contradiction, so no case can express it -- q from the
> feed enthalpies, announced, moves column05/13, crystalliser09,
> aceticAcid02, heatlink02; P2 an extractor duty (M1: -143.75 kW
> unattributed with a 330 K solvent); P3 the crystalliser's Newton stop
> normalised and checked; P5 the MSMPR CV named by definition and basis;
> P6 the Kirkbride feed stage vs the FUG lesson (the lesson counts the
> feed stage nowhere); P7 live steam / humid air through the stripper's gas
> (now REFUSED -- humid air is the normal air-stripper inlet); M9 `model
> fullMESH;` with a reaction block silently runs CMO (a refusal by name,
> moves nothing).  The check_doctrine exemption for
> the review-record filename prefix (that one product name only) lets the review
> records name the open reference simulator.  Family (c) reactors IN
> FLIGHT;
> C112 wave B IN FLIGHT.  Owed to Vitor, unchanged: C139 and C140 start
> with their scope.

> **THE FULL SUITE ON A 10-CORE PC (owed to Vitor since 2026-10-24;
> written 2026-10-25).**  Ubuntu 24.04 or WSL2 Ubuntu:
> `sudo apt install build-essential clang python3 git poppler-utils
> texlive-latex-extra`, and NODE 22 (Ubuntu 24.04's apt `nodejs` is 18,
> below what gui/'s packages require -- measured on Vitor's laptop
> 2026-10-25: `npm ci` warns EBADENGINE for commander, pdfjs-dist and
> postcss-mixins): `curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash`,
> then `nvm install 22` (clang for check_wasm_dialect,
> pdftotext for the guide-version gate, pdflatex only to rebuild guides;
> no Python package beyond the standard library is needed by the suite);
> `git clone https://github.com/choupo-admin/choupo.git && cd choupo`;
> `make all -j10`; `(cd gui && npm ci)` once; then
> `bin/runTests > runTests.log 2>&1; echo $?` -- the verdict is the
> `PASS n / FAIL 0 / KNOWN-BROKEN 0 / EXPECTED-FAIL k` line at the end of
> the log, the ten slowest items are printed after it and every item's
> seconds land in `build/suiteTimings.csv`.  The suite is N-wide by
> default (C167: the cases in a pool, the gates the write traces mark PAR
> between barriers, `bin/curate/suite_lanes.txt`; `-j 1` is the old serial
> walk, `-j N` or CHOUPO_JOBS sets the width).  With the log in a file, a progress line `[runTests] k/N
> items (p%)` is written to the terminal (since cdef2cb4d).  Do not edit
> the tree while it runs; after any `git pull` run
> `make all` again first (check_build_fresh refuses a stale binary and
> aborts the walk, by design).  A partial run on one folder:
> `bin/runTests tutorials/steady/flash` (cases only, no gates).

> **C146. SPIRAL-WOUND ELEMENTS BY STANDARD SIZE AND SPACER, ARRANGED IN
> SERIES AND PARALLEL, MULTI-ION THROUGHOUT (Vitor, 2026-10-24, with
> Geraldes & Afonso, J. Membr. Sci. 300 (2007) 20-27: "Achas que podemos
> fazer agora um modelo para simular modulos enrolados em espiral com
> diferentes tipos de modulos? 2.5'' 4'' 8'' 16'' standards, com
> diferentes espacadores ... Incluindo a correlacao de Schock e Miquel? ...
> preparar tudo para sistema multi ião usando a teoria de Geraldes e
> Afonso ... Uma operacao unitaria pode depois dizer quantos modulos tem
> em serie e em paralelo.  ... Discute primeiro comigo antes de
> implementar").**  DISCUSSION STAGE -- nothing is built before his answer.
> Measured on main 55b6b28f0: `spiralWoundModule` marches ONE pressure
> vessel of N elements in series (`elements`, or `moduleDiameter` +
> `nModules` against a HAND TABLE in SpiralWoundModule.cpp:169-213 that
> holds only an area per size -- a second home); module records
> (NF270-4040, SW30HR-380, SEPA_CF) carry channelHeight / spacerPorosity /
> leafLength as estimates; Schock & Miquel's Sh (0.065/0.875/0.25) and
> friction (6.23 Re^-0.3) are registered; the Geraldes-Afonso multi-ionic
> film with suction correction is built (`polarisation { ionCoupling
> electroneutral; }`) and serves SD, SDEM and DSPM-DE.  Missing: the
> spacer as a record, element geometry beyond the area (leaves, leaf
> width), parallel vessels and stages, Schock-Miquel's validity window
> (100 < Re < 1000) announced, its viscosity correction.  Proposal put to
> him the same day.
> RULING (2026-10-24): "Faz como achares a melhor boa pratica para
> simuladores de processos quimicos" -- the commander decides: (1) ONE unit
> = ONE STAGE (vessels in parallel x elements in series; parallel vessels
> identical, solved once on the split flow, said so), a multi-stage array
> built in the flowsheet with its interstage pump visible; (2) the feed
> spacer a record (`kind feedSpacer`) with its geometry and the
> correlations valid for it, values only from a primary source read by us,
> d_h DERIVED from thickness, porosity and filament geometry where the
> source gives those; (3) generic standard elements 2.5/4/8/16 in as
> records labelled estimated BESIDE real data-sheet elements, the hand
> table in SpiralWoundModule.cpp retired.  Dispatched the same day.
> LANDED 2026-10-24: `kind feedSpacer` records from Schock & Miquel's
> Tab. 1 (primary read; d_h by their Eq. 17, which replaces 2 h eps
> wherever a spacer record is named -- 0.952 vs 1.371 mm on FT30),
> Generic-2540/4040/8040/16040 records (the hand table retired),
> `vessels` x `elements` per unit with per-element KPIs, the Re window
> announced, witness `membrane21_two_stage_nf_array` (4:2, SDEM + the
> Geraldes-Afonso film); no existing golden moved.  OPEN: cases that still
> type channelHeight + spacerPorosity keep 2 h eps (announced; switching
> moves every correlation-driven membrane golden); membrane16's re-seal
> (7 rows) left; the 8040/16040 leaf counts are judgement.  Vitor's
> follow-up the same day: the spiral module takes ANY membrane model --
> solution-diffusion with B_i, SDEM, DSPM-DE, and a CONSTANT INTRINSIC
> REJECTION R_int,i (his 2007 paper's own input, Eq. 1) which does not
> exist yet; dispatched with a DSPM-DE twin of membrane21 and D(T).
> LANDED 2026-10-24 (C148): `transport constantRejection;` (R per salt
> allowed, per ion REFUSED when the permeate would carry charge -- measured
> 2.1e-3 relative on membrane21's feed), witness membrane23; D(T) by
> Stokes-Einstein in ONE home (thermo/transport/StokesEinstein), applied
> only where the case declares a liquid viscosity (no shipped case does,
> so nothing moved; with it, nanofiltran02's trace Na+ against corrected
> NanoFiltran goes from +2.95e-2 to -1.1e-3); membrane22, the DSPM-DE twin
> of membrane21.  FINDING, open for Vitor: on a MIXED-salt feed the DSPM-DE
> pore conserves charge, not salts (Mg2+ crosses with Cl-, not SO4 2-), so
> a module marched on a salt basis misplaces the anions in its permeate
> stream -- announced, not fixed; the commander recommends marching the
> module in ions.
> Vitor, 2026-10-24, on the comparison cases: ONE CASE PER PAPER, its
> tables and figures generated by a post-processing dictionary ("Um pos
> processamento nao gera os graficos e tabelas que sao precisos para este
> artigo?") -- nanofiltran01/02/03 become one case, the first witness of
> C147.

> **C145. THE NANOFILTRAN PAPER AS A COMPARISON CASE (Vitor, 2026-10-24,
> uploading Geraldes & Alves, J. Membr. Sci. 321 (2008) 172-182: "Tens aqui
> o paper original para criar um caso de comparacao").**  The paper (kept
> out of the tree: publisher copyright; its numbers are cited) carries two
> comparisons: (1) the STIFF case of its section 4.2 -- Na+/Mg2+/Cl-
> 10/20/50 mol/m3, J_v 5e-5 m/s, dx_e 2.5 um, r_p 0.40 nm, c_X -30
> mol/m3, eps_p 60, Davies activities, no polarisation -- with Table 2, a
> grid study (permeate Na+, Mg2+, Cl-, the potential difference across the
> membrane and the iteration count, N = 10..350) and Fig. 4's profiles;
> (2) the VERIFICATION against Bowen & Mohammad, AIChE J. 44 (1998) 1799:
> Na+/Cl-/a trivalent dye on the CA30 membrane (r_p 0.63 nm, dx 6.2 um,
> c_X from the paper's Eq. 43, J_v from Eqs. 44-45, the stirred cell's
> Sh = 0.23 Re^0.567 Sc^0.33, ideal activities, no dielectric exclusion)
> with the measured rejections of Fig. 3 -- the first comparison of this
> solver with EXPERIMENT.  Known before dispatch: NanoFiltran's Davies
> applies exp() to a log10 constant (C138), so the published Table 2 may
> carry that factor; the case must say which Davies each number uses.
> LANDED 2026-10-24: the stiff-case comparison (since C147 part of
> `props/membrane/nanofiltran_geraldesAlves2008`)
> (Table 2 accounted for step by step: NanoFiltran AS RECEIVED reproduces
> it, so Table 2 carries the Davies factor -- and the defect is in the
> paper's printed Eqs. 12-13, the log10 constant used as ln gamma; Choupo,
> with no option to reproduce it, agrees with the corrected NanoFiltran to
> ~1e-7, 12 Newton iterations against 88) and
> the Bowen & Mohammad case (both merged by C147 into
> `props/membrane/nanofiltran_geraldesAlves2008`; the solved pore against MEASURED
> rejections: rms 0.077, NanoFiltran 0.078 on the same inputs, several of
> them fitted to these data by Bowen & Mohammad -- said in the case).  The
> engine gained: ions the pore excludes (lambda >= 1) live only in the
> film, announced; `poreTransport` takes a per-op `chargeDensity` and
> writes a `profile` csv.  OPEN for Vitor: D(T) (Choupo reads the 25 C D0
> at any T; NanoFiltran applies Stokes-Einstein with Vogel's viscosity);
> whether nanofiltran03 joins the named validation subset.  RULED by the
> commander on his delegation ("Avanca como achares melhor", 2026-10-24):
> D(T) by Stokes-Einstein, D_i(T) = D_i0 (T/T0)(mu(T0)/mu(T)) on the
> package's own liquid viscosity, announced, the reference temperature
> moving no number -- dispatched after C146 (same transport layer);
> nanofiltran03 does NOT join the validation subset: its c_X and J_v are
> fitted to the same data, so it is a CALIBRATED comparison, and is
> labelled so.

> **C144. A SOLUTION-ADAPTIVE GRID FOR THE DSPM-DE PORE (Vitor,
> 2026-10-24: "Faz a malha adaptativa, porque eu preciso de enviar o link
> para um cientista que me pediu").**  C142 measured that a grid graded
> toward the faces is WORSE (1.1-8x the uniform error from beta >= 1.5):
> the hardest profile's steep region is an INTERIOR ion-exchange front
> (xi ~ 0.39), which needs ~400 uniform nodes to reach 1e-4 (nanofiltran01
> declares 801).  Scope: equidistribute a monitor of the solved profile
> (arc length / gradient of ln c and psi) with a fixed node count, re-solve
> on the moved grid, iterate to a declared tolerance; the error measured
> against the analytic limit and the 801-node reference; the default node
> count chosen by that measurement; every pinned golden reproduced within
> its tolerance or listed.  It is URGENT: the result goes to an outside
> scientist through the published site, so it must land validated and the
> site must be seen to publish it.  LANDED 2026-10-24, OPT-IN
> (`poreSolver { grid adaptive; }`): the arc-length monitor was measured
> WORSE than uniform; the local error follows psi'' so the monitor is
> |psi''|^(1/3); on the interior front it reaches 0.76x the uniform error,
> which is the computed bound for any grid of that node count, and it gains
> nothing on the corpus pores -- so uniform stays the default and no golden
> moved.  Fourth-order Richardson extrapolation (N, 2N) would reach 1e-6
> everywhere at ~2x cost but publish a permeate no discrete profile carries:
> recorded, not built.

> **C143. AN EDUTOOL ON ECONOMIC APPRAISAL AND PROJECT RISK: THE SINES PTA
> PLANT (Vitor, 2026-10-24).**  His rules: confirmed facts only, no
> speculation, a serious treatment with no insinuation of wrongdoing (he
> is an Associate Professor at a public university and the bank is a
> public company); his ruling the same day: politics stays out --
> institutions only, no persons.  The case: Artlant's purified
> terephthalic acid plant in Sines, a La Seda de Barcelona project
> financed by Caixa Geral de Depositos, which also became a shareholder;
> sold in liquidation in 2017.  Every fact cited to a primary public
> document (the inquiry report of 2019, the EY audit of 2000-2015, La
> Seda's CNMV filings, Indorama's reports), with its period and its kind
> (documented / attributed conclusion / own calculation / assumption).
> REVISED 2026-10-25 on an external review of eleven points relayed by
> Vitor, all accepted: the page states purpose, not judgement; each risk
> card separates risk identified, condition recommended, what the
> documents record of the decision, and the later outcome, presuming no
> link; the calculator is a simplified pre-tax unfinanced appraisal with
> an "Illustrative teaching scenario" notice beside its results;
> decision-time information is separated from later information; the
> offtake maximum, the capital perimeters and the sale figures are kept
> as the documents give them; public links; an institutional note.  No
> wording of the first version remains in the tree (git history is
> kept, his choice).  Record:
> docs/design/the-sines-pta-plant-appraisal-and-project-risk.md.  Final
> editorial validation is the author's.

> **C142. A PORE SOLVER BETTER THAN NANOFILTRAN, WITH NANOFILTRAN ONLY AS
> THE COMPARISON (Vitor, 2026-10-24: "Eu quero que facas um solver melhor!
> E deixes o nanofiltran resultados so para comparares!").**  C141 landed
> (e8afeef7e): K_d corrected, the pore solved by default, goldens
> re-recorded on his authority.  Measured then: the solved pore is ~100x
> the old closed form (membrane10 10.9 s vs 0.12 s) -- a finite-difference
> (CPR) Jacobian on a uniform 101-node grid (PoreNernstPlanck.cpp:212),
> nested inside a wall Newton inside a water-flux secant at every module
> station.  Scope dispatched: analytic Scharfetter-Gummel Jacobian (FD kept
> as the test oracle), a grid graded at both faces chosen by measured order,
> wall + pore in ONE bordered block-tridiagonal Newton per station, the
> closed form retired by name and membrane20 rebuilt to compare the two
> wall closures, and a timing table against NanoFiltran on its own
> problems.  NanoFiltran stays in bin/curate/ as the reference that
> produces the comparison numbers, never as a solver.  LANDED 2026-10-24:
> one Newton per station (pore + wall + its electroneutrality + J_v + face
> activities), analytic Jacobian (FD kept as the test oracle), the closed
> form refused by name, membrane20 rebuilt (porePermeate vs B_s wall);
> membrane10 10.9 s -> 0.27 s; on NanoFiltran's problems 4-24 Newton
> iterations, where NanoFiltran stalls at its cap on NaCl (ND 204) and
> Na2SO4.  The graded grid was built and measured WORSE (the steep region
> is an interior front), so the default stays uniform 101 nodes.  No
> 101-node golden moved; membrane20 lost its closed-form rows and gained
> its B_s-wall rows (appended).  OPEN, named: (adaptive grid: C144); SDEM's
> march onto this solver; the NF270_dspmde record comment "B_s unused by
> DSPM-DE" is false under a declared `wallClosure solutionDiffusion`;
> MgSO4 first stations still take the continuation once per unit.

> **C141. THE DSPM-DE DEFAULTS CORRECTED: K_d NO LONGER COUNTS THE STERIC
> PARTITION TWICE, AND THE PORE IS SOLVED AS NANOFILTRAN SOLVES IT (Vitor,
> 2026-10-24, on C138 slice 2's findings: "Avanca com tudo e Corrige o K_d
> e mostra-me as linhas que mudam").**  Measured before dispatch:
> `deenFactors` (`src/unitOperations/membrane/transport/DSPM_DE.cpp:109`)
> returns as K_d the Dechadilok-Deen polynomial, which is H = Phi K_d,
> while Phi is carried separately as the partition -- the steric
> partition enters the diffusive flux twice (K_d too small by (1-lambda)^2).
> Scope ("tudo"): (1) the default hindrance becomes the cited, consistent
> pair `DechadilokDeen2006` (K_d = H/Phi, its own K_c), and the `legacy`
> word is refused by name with the reason; (2) the default pore becomes
> `poreSolver { method finiteDifference; wallClosure porePermeate; }`, the
> closed form kept as a declared option -- each default change measured for
> robustness on every DSPM-DE case before it is taken; (3) the NanoFiltran
> Davies correction already exists as `regenerate.py`'s declared
> DAVIES_PATCH (the vendored source stays as received).  The moved golden
> rows are LISTED, per change, and shown to Vitor BEFORE any `--record`.
> Cases reached: membrane10, membrane11, membrane20, diafilter02,
> nanofiltran01.  Status: LANDED 2026-10-24 (e8afeef7e); goldens
> re-recorded on Vitor's authority, pore_stiffness_max deliberately unpinned.

> **C140. AN EDUTOOL ON INTELLECTUAL PROPERTY AS COMPETITIVE STRATEGY:
> PATENT OR SECRET, AND HOW FIRMS FIGHT WITH IP (Vitor, 2026-10-24: "as
> formas e estrategias como as empresas gerem a propriedade intelectual e
> como lutam com os concorrentes usando tecnicas sujas, como fazer
> patentes sem interesse so para induzirem os concorrentes a avancar por
> ideias sem futuro e os fazer perder tempo.  A competicao e feita sempre
> em modo de guerra e os alunos nao sabem isso.  Depois ha a questao de
> decidir o que vale a pena patentear e o que e melhor guardar como
> segredo industrial").**  Status: FUTURE WORK, not scheduled; scope to
> agree with Vitor (pedagogy is his).  Commander's first reading:
> (1) PATENT OR TRADE SECRET as a decision the student makes: a patent
> trades disclosure for ~20 years of exclusion; a secret lasts as long as
> it holds.  The questions that decide it -- can the product be reverse-
> engineered? can infringement be DETECTED (a process inside a plant
> usually cannot, a product on the market can)? how long is the useful
> life against the patent term? what does filing cost across the markets
> that matter? can the secret survive staff turnover?  A process
> catalyst recipe and a new molecule land on opposite sides, and the
> student should see why.  (2) IP AS A WEAPON, described as it is
> practised: blocking and fencing patents, patent thickets around a core
> invention, filings on dead-end routes that signal a direction the
> filer abandoned (decoys), continuation strategies, evergreening near
> expiry, defensive publication to destroy a rival's novelty, freedom-
> to-operate searches and opposition proceedings as counter-moves; the
> point is that competitors read your filings, and you read theirs.
> (3) THE LIMITS: where strategy becomes unlawful or sanctionable --
> sham litigation and misuse under competition law, inequitable conduct
> before a patent office, misappropriation of a rival's trade secrets --
> stated so the student can recognise them, not as a manual.  (4) an
> exercise: a fictitious company with three inventions (a process
> improvement, a new product, an analytical method) decides patent /
> secret / publish for each and plays one round against a competitor
> that reads its filings.  No real company accused of anything without a
> cited, public source (court decision or official record); any case
> study is either documented or explicitly fictitious.  Not legal
> advice, and the tool says so.  Shelf: "Process design & economics",
> beside C139 (the economics of the chemical network).
> **Addendum (Vitor, same day): "ha empresas que publicam coisas em
> revistas estrangeiras ... porque se alguem patentear eles podem provar
> que ja tinham isso primeiro! ... outras tecnicas que os meus alunos nao
> conhecem?"**  The list to put in the tool, each with its catch (to be
> checked against primary sources -- the EPC, the EU trade-secrets
> directive 2016/943, the Portuguese CPI -- before any of it is taught):
> DEFENSIVE PUBLICATION (novelty is absolute: a disclosure anywhere, in
> any language, blocks a later patent -- dedicated venues exist, e.g. the
> Research Disclosure journal; the catch: it ends the secret and the
> publisher's own right to patent); PRIOR-USER RIGHTS (keep the secret and
> keep using it after a rival patents, where national law grants it --
> needs DATED proof of use before the rival's filing date, and is
> territorial); DATED DEPOSITS as evidence without publication (France's
> enveloppe Soleau, the Benelux i-DEPOT, witnessed notebooks, timestamps);
> the trade secret's legal condition ("reasonable steps": need-to-know,
> NDAs, access control) and the legality of reverse engineering;
> splitting know-how (black-box catalyst supply, a process split among
> suppliers); UTILITY MODELS (faster, shorter, cheaper); TIMING (the
> 12-month priority year, the PCT's ~30 months to delay the cost and the
> choice, divisional applications); third-party observations and EPO
> oppositions (nine months after grant) as cheap counter-moves; cross-
> licensing, patent pools and standard-essential patents; patent
> assertion entities; employee-invention rules.
> **Second addendum (Vitor, 2026-10-24), a worked case for the tool:
> "imagina que eu patenteio uma turbina de aviao ... as blades derretem
> ... Essa empresa poe blades refrigerantes e a turbina passa a
> funcionar.  A empresa original continua a ter direito a primeira
> patente?"**  The teaching points (to check against primary sources):
> an office does not build the invention, so a patent that does not work
> may be GRANTED and is presumed valid until challenged; it is open to
> revocation for INSUFFICIENT DISCLOSURE (EPC Art. 83 / 35 USC 112
> enablement) where the skilled person cannot carry it out without undue
> burden -- but NOT if the missing piece is common general knowledge
> (blade cooling in a gas turbine is); the improver may patent the
> improvement if it is new and inventive, and the two patents then BLOCK
> each other (the improver infringes the first claim -- adding a feature
> does not escape it -- and the original may not use the cooling) ->
> cross-licence, or a compulsory licence for a dependent patent (TRIPS
> Art. 31(l)).  Historical case: the Wright brothers' wing-warping patent
> against Curtiss's ailerons, settled only by the 1917 US aircraft patent
> pool; Watt's patent holding back high-pressure steam until 1800.
> STATUS CORRECTED 2026-10-26: the "scope to agree" line above was STALE --
> the scope IS Vitor's two messages and two addenda above, with the
> commander's reading (1)-(4); he said so the day the audit of planned
> EduTools listed C140 as waiting on him ("Eu tinha discutido todas as
> coisas de que me lembrei").  DISPATCHED the same day under C163.
> THE DISCUSSION IS MORE THAN THIS SUMMARY (Vitor, 2026-10-26, "Nao me
> deites trabalho para o lixo nem te esquecas dele!").  The commander's
> answers in chat on 2026-10-24 carried points the entry above holds
> thinly or not at all, recorded here so they cannot be lost: defensive
> publication does NOT prove who was first -- it destroys novelty for
> everyone, which is why an obscure journal serves (it counts as a
> disclosure and almost nobody reads it), and it ends the publisher's own
> right to patent; the Portuguese CPI's own compulsory licence for a
> dependent patent, beside TRIPS 31(l); in the turbine case the decisive
> fact is that cooling gas-turbine blades is decades-old common general
> knowledge, so the original patent PROBABLY SURVIVES an insufficiency
> attack -- it falls only if making it work needs an invention of its own;
> the attack routes are EPO opposition within nine months of grant or a
> nullity action, with the burnt-blade tests as evidence; freedom-to-
> operate searches as a counter-move; "your competitors read your filings
> and you read theirs" is the tool's central idea.  Every point is to be
> confirmed against the primary sources before it is taught.  The full
> exchange was handed verbatim to the general building the tool, whose
> report maps each point to where the tool teaches it.
> THIRD ADDENDUM (Vitor, 2026-10-26, in chat): "se uma patente proteger um
> processo e eu seguir a receita e aquilo nao funcionar, tenho o direito a
> pedir para invalidarem a patente?" -- the case the tool must answer:
> insufficiency of disclosure (EPC Art. 83; 100(b) in opposition; 138(1)(b)
> in national revocation; the CPI equivalent); who may act and when
> (third-party observations before grant, Art. 115; EPO opposition by ANY
> person within nine months of grant, Art. 99; national nullity or the UPC
> after); the burden of proof (a reproducible report following the
> teaching exactly; the skilled person with common general knowledge fills
> gaps; the failure must concern what the CLAIMS require; plausibility of
> the effect, EPO G 2/21; partial working -> limitation).  And the case he
> had in mind behind "the turbine": FRANK WHITTLE's turbojet patent (GB
> 347,206, filed January 1930, lapsed 1935 on an unpaid renewal fee) --
> could it have been revoked because "the turbine would melt"?  Taught as a
> CONTESTED case: sufficiency judged at the filing date; early jets ran
> without cooled blades at limited inlet temperature, so "impossible" is
> false and "a decade of development" (undue burden) is the real attack;
> pre-1977 UK law also had INUTILITY as a ground.  All to be verified on
> primary sources; both handed to the C140 general.
> LANDED 2026-10-26 (3fd4a4e1b): built by a general, --gui PASS 37 /
> FAIL 0 (6505 tests); Vitor's content review still owed.
> FOURTH ADDENDUM (Vitor, 2026-10-26): "No capitulo das patentes eu
> adoraria ter o case study do John Cadotte (que foi injusticado pela
> historia porque fez um trabalho de engenharia fenomenal em arranjar
> filmes finos com mais de 99% de rejeicao ao sal, pelo menos 5x menos
> permeaveis ao sal que o heroi romantico do Sourirajan que perdeu a
> corrida!) e da FilmTec e Hydranautics."  A case study in the patent
> chapter: Loeb-Sourirajan's asymmetric cellulose acetate (the celebrated
> first) against Cadotte's interfacially polymerised thin-film composite
> (FT-30, the membrane the industry actually runs), FilmTec, and the
> litigation with Hydranautics (and Allied-Signal).  PRIMARY SOURCES ONLY
> (the patents, the Federal Circuit opinions, Cadotte's own papers); every
> number -- rejection, salt permeability, the "at least 5x" -- read from a
> source, and a number the sources do not support is put to Vitor before a
> word is written.  The lesson text is shown to him before it lands.

> **C139. AN EDUTOOL ON THE ECONOMICS OF THE CHEMICAL NETWORK: BASE
> CHEMICALS, INTERMEDIATES, INDUSTRIAL PARKS AND INTERNATIONAL TRADE
> (Vitor, 2026-10-24, "para refletir trabalho futuro": "ha uma rede de
> produtos quimicos de base, e depois ha outra network de produtos
> quimicos intermedios que estao todos interligados economicamente ...
> pode explicar a forma como os parques industriais se organizam e
> tambem como a rede internacional de produtos quimicos funciona").**
> Status: FUTURE WORK, to reflect on -- NOT scheduled; scope to be agreed
> with Vitor before anything is built (pedagogy is his).  Measured: the
> "Process design & economics" shelf (`gui/src/ui/methods/registry.ts`
> METHOD_DISCIPLINES) holds Front-End Loading, plant layout, the GMP
> interior and materials -- nothing on the chemical value chain, markets
> or industrial clusters; the engine prices ONE plant (`EconomicsPass`,
> declared prices per stream) and `ammoniaRoutes01_screening` compares
> routes to one product.  Commander's first reading, to put to him:
> (1) the network as a graph -- a few feedstocks (natural gas, naphtha,
> salt, air, biomass) -> ~20 base chemicals (syngas, ammonia, methanol,
> ethylene, propylene, BTX, chlorine/caustic, sulfuric acid) ->
> intermediates -> products, where a node's price is set by its feedstock
> and by the co-products it is forced to make (chlor-alkali: chlorine and
> caustic in fixed ratio; steam cracking: the ethylene/propylene slate);
> (2) INTEGRATION in a park (Verbund-style): pipeline exchange of
> intermediates, shared utilities and steam, one site's waste another's
> feed, and why co-location wins on logistics, safety and energy;
> (3) the international network: where feedstock is cheap (shale gas,
> Middle East) base chemicals are made and shipped, specialties stay near
> the customer; shipping cost per tonne against value per tonne decides
> what travels; (4) a student exercise: move a feedstock price and watch
> margins propagate down the graph, or remove a co-product's market and
> see the coupled unit's economics break.  Must not invent prices,
> capacities or trade flows: every number from a cited, licence-compatible
> source, or a clearly SYNTHETIC teaching network labelled as such.

> **C138. A STIFF PORE SOLVED AS NANOFILTRAN SOLVES IT: THE EXTENDED
> NERNST-PLANCK DISCRETISED ACROSS THE PORE AND EVERY NODE SOLVED AT ONCE
> (Vitor, 2026-10-22: "Porra!  Mas aquilo e um problema muito stiff!  O
> nanofiltran usa uma abordagem muito poderosa" ... "Faz isso e eu depois
> dou-te o meu artigo para comparares e criares um golden case").**  His
> code: Geraldes & Alves, "Computer program for simulation of mass
> transport in nanofiltration membranes", J. Membr. Sci. 321 (2008)
> 172-182 -- NanoFiltran: DSPM&DE with non-ideal electrolytes and
> concentration polarisation, the ENP equations discretised by finite
> differences inside the membrane, linearised and solved simultaneously
> (from the abstract; the full paper is his to hand over).  MEASURED in the
> engine: `DSPM-DE` does NOT solve the pore -- it takes a uniform-gradient
> closed form per ion and imposes electroneutrality only in the permeate
> (`src/unitOperations/membrane/transport/DSPM_DE.cpp` ~276-284 and
> ~385-404), while its header lists pore electroneutrality (4) and zero
> current (5) as the physics solved (`DSPM_DE.H` "THE PHYSICS") -- a
> header claiming more than the code does, fixed in this slice.  `SDEM`
> shoots a fixed-step RK4 across the layer (`SDEM.cpp:66`, 320 steps at
> :398) and converged at its witnesses' operating points and almost
> nowhere else until the shot was turned round (CLAUDE.md, the SDEM
> paragraph) -- the symptom of a stiff boundary-value problem met with an
> explicit march.  The structure is BLOCK-TRIDIAGONAL (each node couples
> only to its neighbours), and its one home already exists
> (`src/solver/BlockTridiagonal.H`, `NDOptions::blockTri` at
> `src/solver/NewtonND.H:105-123`, built for the MESH column).  SLICE 1:
> one pore solver, opt-in on DSPM-DE, the default path byte-identical;
> grid convergence, flux constancy and zero current to machine level, and
> the closed form compared beside it (differences REPORTED, no golden
> moved).  SLICE 2, on his paper: a golden case against NanoFiltran's own
> published results; SDEM's march onto the same solver measured, not
> assumed.  Engine numerics of two models, Vitor's decision taken in the
> quotation above.
> SLICE 1 DONE (be3a51788).  SLICE 2 DONE (2026-10-22, branch
> claude/c138-nanofiltran-golden): Vitor handed over NanoFiltran itself
> and leave to vendor it ("O nanofiltran pode ser usado sem problema!");
> it lives as received in `bin/curate/nanofiltran/` (MIT + Hutt's MIT +
> LAPACK modified BSD, held by `check_source_licence`
> ACCEPTED_VENDORED_CODE; `regenerate.py` rebuilds and reruns it and
> REFUSES without gfortran).  The golden
> the NanoFiltran reference case (since C147 part of
> `tutorials/props/membrane/nanofiltran_geraldesAlves2008`; the new
> `poreTransport` props op: the DSPM-DE law at imposed J_v) pins 35
> NanoFiltran permeates as anchors: the example, Born off, Davies, NaCl,
> Na2SO4, a polarised mixture, J_v 1e-6..5e-5; the two programs' grid
> limits agree within 7.9e-7 on every row (gate
> `check_nanofiltran_reference`, 6 sabotages).  To express NanoFiltran's
> model four DECLARED DSPM-DE choices were added, every default
> byte-identical (23 membrane cases, JSON and console): `hindrance
> DechadilokDeen2006`, `activity bulkOverPoreDavies | ideal`,
> `bulkDielectric`, `poreSolver { wallClosure porePermeate; }`.  FINDINGS,
> recorded not changed: (1) Choupo's default K_d is Dechadilok-Deen's H =
> Phi K_d, the steric partition counted twice in diffusion (K_d too small
> by (1-lambda)^2) in every DSPM-DE golden -- replacing the default is
> Vitor's; (2) NanoFiltran evaluates Davies with exp() on the log10 A
> (ln gamma ln 10 too small; +7.7 % Na+ on the Davies op) -- the anchors
> use a copy with that one constant corrected; (3) NanoFiltran's
> single-precision literals move Mg2+'s K_d by 1.55e-4, cancelled through
> its inputs.  Record: docs/design/a-stiff-pore-solved-at-once.md §9.
> STILL OPEN: SDEM's march onto the pore solver; the spiral module still
> refuses `ionCoupling electroneutral;` on a DSPM-DE salt feed; the
> paper's figures; whether to retire any default.

> **C137. THE RECONCILIATION EDUTOOL MUST MAKE BAYES VISIBLE AND CENTRAL
> (Vitor, 2026-10-21, for SATURDAY, a follow-up on C121: "Na realidade,
> Bayes quase nao se ve na primeira parte do EduTool!  E isso e uma
> fraqueza pedagogica que eu corrigiria.").**  The point to make
> central, in his words: "Bayes nao e apenas uma maneira diferente de
> calcular o mesmo resultado.  E uma maneira de representar e atualizar
> aquilo que sabemos sobre o estado de um processo."  What he asks:
> (1) name the three ingredients where the student meets them -- PRIOR
> (what was known before), LIKELIHOOD (what the meters say), POSTERIOR
> (what is believed now), p(x|m) proportional to p(m|x) p(x), always
> under the exact balances; with a flat prior on the admissible flows the
> MAP estimate IS the weighted least squares sum (m_j - x_j)^2/sigma_j^2.
> (2) the result is a DISTRIBUTION, not a set of flows: his example, F1
> read 101.40 +- 2.00 t/h, reconciled 99.53 +- 1.18 t/h (1 sigma, seven
> meters, four exact balances) -- narrower because the other six meters
> inform F1 through the balances.  (3) the informative prior: yesterday's
> estimate with its uncertainty, today's readings and the exact balances
> combined, the prior widened by an explicit process-evolution
> uncertainty (a plant that may have moved overnight makes the prior less
> informative).  (4) say plainly that the global chi-square and the
> measurement tests are FREQUENTIST, not Bayesian; a Bayesian version
> would compute P(meter faulty | m) from prior failure probabilities and
> separate error models for healthy and faulty meters -- NOT required,
> but the two methods must be told apart.  (5) show THREE results side by
> side: classical reconciliation (the flows minimising the weighted
> squares); Bayes with a flat prior (the SAME flows, now with their
> posterior uncertainties); Bayes with an informative prior (flows and
> uncertainties both move) -- and make that difference visual.
> MEASURED against the live tool before recording (main d82dbeed2): his
> F1 numbers are the engine's own (`reconcile01_recycle_loop/expected`:
> `reconciled_F1 99.5264184542`, `sigmaReconciled_F1 1.17574378534`;
> reading `F1 101.4 t/h`).  Much of the CONTENT already exists, which
> is why the defect is one of PLACEMENT and EMPHASIS, not of physics:
> the flat-prior/MAP bridge is one step on page 2
> (`gui/src/ui/methods/dataReconciliationLesson.ts:155`, "The same
> answer, read as Bayes"), the posterior covariance is page 4 (:373),
> the non-flat prior and the prior-data conflict are pages 4-5 (:401,
> :436), with yesterday's prior at 2 % per flow standing for the
> overnight drift (`constant/plant/yesterday`, its header says the
> width is a judgement, and that the prior is DIAGONAL by the
> operation's rule).  ABSENT: the three-way side-by-side comparison, the
> prior/likelihood/posterior framing at the start, the word
> "frequentist" anywhere in the lesson, and a visual of the posterior
> narrowing.  Scope is pedagogy, so the brief goes to Vitor before
> dispatch; the engine op already publishes every number the three
> panels need (`system/propsDict`: the `honest` run is the classical
> AND the flat-prior panel -- same flows, its `sigmaReconciled_*` the
> posterior widths -- and the `yesterday` run is the informative one;
> `drifted`/`driftedWithout` are the gross-error runs).
> Order on Saturday: with C136, after the C124 validation (C131 note).
> LANDED 2026-10-25 (`claude/c137-bayes-reconciliation`), placement and
> emphasis only -- no engine source, no golden, no number computed by the
> page: his sentence heads the tool in English ("Bayes is not merely a
> different way of calculating the same result. It is a way of
> representing, and updating, what we know about the state of a
> process."), step 1 names prior / likelihood / posterior with p(x|m)
> proportional to p(m|x) p(x) under the exact balances, page 2 draws the
> posterior narrowing (F1 101.40 +- 2.00 -> 99.53 +- 1.18 t/h), the global
> and measurement tests are called FREQUENTIST and told apart from a
> Bayesian fault probability (named, not built), and a new page 5 sets
> the three answers side by side (classical = the flat-prior flows, the
> flat prior's posterior widths, yesterday's prior: 99.64 +- 0.82).  Point
> (3), measured: the engine reads ONE sigma per prior flow
> (`DataReconciliation.cpp:494`), so the 2 % stands for yesterday's own
> uncertainty AND the overnight drift together; the page says so and
> writes the widening s^2 = Sigma^y + q^2 as a Kalman prediction step the
> engine does not have.  PROPOSALS for Vitor: an `evolution {}` term in a
> prior file; a Bayesian fault-probability op.  Validated with C136 on
> main + wave 2: `--gui` 35/0, check_data_reconciliation, reconcile01.

> **C136. AN EDUTOOL ON SECONDARY CONTAINMENT -- BUND DESIGN IN A CHEMICAL
> PLANT (Vitor, 2026-10-21, for SATURDAY: "Regista isto para fazer no
> Sabado porque e muito importante").**  The lesson, in his words: "Uma
> instalacao quimica nao deve ser concebida apenas para funcionar
> corretamente, mas tambem para limitar as consequencias quando alguma
> coisa corre mal."  A bund is a PASSIVE barrier (no power, no
> instrument, no operator); the student must understand the physics and
> the engineering decisions, "nao apenas que introduza numeros numa
> calculadora".  Scope as he wrote it (his message is the specification;
> this is its index):
> (1) why bunds exist, how they are built, how they are sized, what a leak
> or a rupture does, how the geometry decides safety, why a badly
> conceived bund can RAISE some risks, local containment vs remote
> collection.  (2) ONE SVG section view, the house style: two or three
> vertical tanks of different volumes in a bund -- impermeable floor,
> perimeter walls, wall height, spilled-liquid level, low collection
> point, controlled drain; normal operation visibly distinct from the
> accident; a rupture filling the bund progressively, the level rising and
> OVERTOPPING when the useful capacity is exceeded.  (3) sizing: the
> USEFUL capacity from the area, the wall height, the volume the tanks and
> other items displace below the liquid level, an optional floor slope,
> a safety margin and rain where it applies; GEOMETRIC capacity kept
> rigorously apart from USEFUL capacity.  V >= max(1.10 V_largest; 0.25
> V_total) is shown as a TEACHING EXAMPLE only -- its origin, conditions
> and limits traced to a source, never presented as a universal
> obligation (it depends on country, product and regulatory frame).
> (4) four scenarios with EXPLICIT mass conservation: A catastrophic
> rupture (contained or not); B a progressive leak, constant or varying
> flow, with the leak possibly stopped; C rain taking capacity before a
> later spill; D a drain or valve left open, the bund no longer a
> barrier.  (5) flammable liquids, QUALITATIVE only: the bund that stops
> the spread also makes a large pool -- evaporation surface, flammable
> vapour, pool fire; local vs remote containment; NO fire or dispersion
> model that is not properly founded ("nao produzir uma ferramenta
> certificada de analise de riscos").  (6) construction: reinforced
> concrete, impermeable linings and their chemical resistance, joints and
> pipe penetrations, compatibility, inspection and maintenance -- why a
> bund fit for water or some hydrocarbons may not be for an acid, a base
> or a given solvent; NO invented compatibility table.  (7) prevention /
> detection / isolation / secondary containment / mitigation, and the
> bund's place in the layers of protection: it does not prevent the
> initiating event, it stops or limits its propagation.  (8) exercise:
> tanks of 20, 15 and 10 m3; the student sizes the bund under a selected
> criterion with the volume the structures occupy; the tool ruptures the
> largest and shows the margin; area and height explorable, keeping the
> physical meaning; a second exercise adds rain and shows a design that
> was adequate stop being so.  (9) sources: CIRIA C736, UK HSE, the
> European guidance on storage of dangerous substances and accident
> prevention, Portuguese regulation where it can be identified; legal
> requirement, technical standard and example of good practice told
> apart; NOTHING normative or bibliographic invented.  (10) inspect the
> existing EduTools first (pages, SVG components, navigation, tests) and
> reuse them; self-contained in the browser; transparent model, visible
> equations, explicit hypotheses, verifiable results; NOT a case editor;
> tests for volume conservation, geometric capacity, tank displacement,
> overtopping and limit cases; every relevant gate, no test weakened.
> (11) closing reflection, verbatim: "A process flowsheet shows how a
> chemical plant is intended to operate. Secondary containment shows how
> engineers prepare for the possibility that it will not."
> Measured beside it, to be READ before the brief is written: C134 put
> bunds into the plant layout as a declared region the engine CHECKS
> (net volume = area x height minus the displaced footprints, against the
> case's own capacity rule) -- so the capacity arithmetic has an engine
> home, and on the relief-valve precedent (C62) the EduTool's TypeScript
> and the engine's C++ must be ONE procedure held to each other's pinned
> examples by a gate, not two that may drift.  Order on Saturday: after
> the validation owed by C124 (C131 note) and the site publish, before
> anything new opens.  Status: commissioned, scope given by Vitor in
> full; the brief carries file:line for every engine fact it uses.
> LANDED 2026-10-25 (`claude/c136-bund-edutool`): EduTool `bund` on the
> Process-safety shelf (16 steps, three benches -- design check, the four
> scenarios integrated in time with every transfer conserved to 1e-14,
> the 20/15/10 m3 exercise with rain; the section drawing with normal
> operation and the accident apart, a time slider, the level against
> time).  ONE procedure in two homes, the C62 way: C134's arithmetic left
> PlantLayout.cpp verbatim for `src/postProcessing/layout/BundArithmetic.H`
> (seven pure functions, every cited PlantLayout.cpp line kept in place)
> and `gui/src/ui/methods/bund.ts` twins each one; gate
> `check_bund_arithmetic` compiles 15 pinned examples against the header
> to 1e-14, ties the green-ammonia tankFarm pins to that case's layoutDict
> and golden, and refuses an inline copy (4 sabotages, one surviving by
> design inside 1e-14).  Where the page teaches MORE than the engine it
> says so: the engine deducts every enclosed footprint, the failing
> tank's too; the page's useful capacity leaves that tank's own footprint
> free (HSG176 para 157) and prints both -- the engine is on the safe side
> by that footprint x wall height.  Sources READ: SI 2001/2954 (the
> 110 % / 25 % rule, its scope -- a teaching example, never a universal
> obligation) and HSE HSG176 (2015), paraphrased; CIRIA C736, Directive
> 2012/18/EU, the storage BREF and DL 150/2015 cited by title only,
> marked NOT READ; no Portuguese bund-capacity rule could be verified and
> the page says so.  Not modelled, on the page: surge, evaporation, foam,
> fire water, head-driven leak, drain hydraulics, structural design,
> compliance.  Validated with C137: the five layout cases, the gates,
> `--gui` 35/0.

> **C135. A kij THAT VARIES WITH T, REGRESSED AND READ PER UNIT (Vitor,
> 2026-10-21: "Nos conseguimos fazer melhor e arranjar kij que variem com
> T?" -- then "Ok" to the plan below).**  Measured: on C123 case D every
> gas-methanol pair (H2, CO, CO2) failed its held-out isotherm (AAD 20-31 %
> against a 5 % band) because the residual changes SIGN between isotherms
> -- one constant kij is a compromise; the data want kij(T).  Plan, inside
> Vitor's own ruling of 2026-10-20 ("Rota P, kij a T declarada": every kij
> a unit runs on is a constant in a file, evaluated at the unit's declared
> T): (1) a pair record may carry a kij(T) form, e.g. kij = a + b(1/T -
> 1/Tref), with its evidence, band and verdict; (2) `fitParameters`
> regresses the two parameters on the fitting isotherms and judges the
> held-out one; (3) the per-unit kij file is evaluated at each unit's
> declared T and announced (case D: the 360 K separator and the 510 K
> reactor get different kij, both visible).  No promise the gas pairs pass
> the band -- the held-out isotherm decides.  Not chosen: PPR78 for
> methanol (whether the published group tables cover it is UNVERIFIED) and
> a gE mixing rule (PSRK / MHV2: an architecture change, his).  ORDER: after
> the white paper's first draft (C126).

> **C134. SECONDARY CONTAINMENT (BUNDS / RETENTION BASINS) IN THE PLANT
> LAYOUT, AND A SWEEP FOR WHAT ELSE A LAYOUT ROUTINELY CARRIES (Vitor,
> 2026-10-21, from a colleague: "no layout faltam as bacias de retencao
> nas zonas onde as boas praticas e as normas mandam por! Ve se ha mais
> alguma coisa que e muito habitual fazer que nos escapou.  Podes
> aproveitar e por as bacias de retencao no caso que falta da Amonia").**
> Measured: bunds were CONSIDERED AND NOT ADDED in C96 ("a bund as a
> placed item -- a wall round two items would overlap both -- the case
> says it in words", docs/design/a-plant-layout-is-declared-and-checked.md
> ~816 and ~991); the 3D drawing invents none (equipmentModel.ts:473).
> Named there as not built, beside it: the fire-water ring main and
> hydrants, escape routes inside the units, a toxic refuge in the control
> room; and plinths / foundations (C129 item 4).  The liquid-ammonia
> stores: `ammonia02_full_plant` (T201, seven vessels) and
> `greenAmmoniaPEQ_baseCase` (NH3Storage, two tanks; its layout carries
> no site elements at all).  Slice: a bund is a DECLARED REGION, not a
> placed item (it encloses items, so the overlap rule does not apply to
> it): `bunds ( { name; items ( ... ); wall { height; } | polygon;
> capacityRule <the case's>; drain <valve>; source; reason; } )`; the
> engine CHECKS it -- the net volume (area x height minus what the
> enclosed footprints displace) against the case's declared capacity rule
> (e.g. 110 % of the largest tank, or 100 % plus a rain/fire-water
> allowance -- the rule and its source are the case's, no standard's table
> is shipped), every declared item inside, an item holding liquid
> inventory that no bund encloses ANNOUNCED, a road or pipe crossing the
> wall announced; published (area, net volume, the rule, the verdict) and
> pinned by the `layout` kind; the GUI draws the wall.  Pressurised liquid
> ammonia is usually held in an impounding / catch area sloped to a
> remote pit rather than a full-height bund -- the case states which it
> is.  Plus a SWEEP (report, not build): what a plot plan routinely
> carries that the layout lacks, each with the standard practice it comes
> from, measured against the grammar -- e.g. flare/vent stack and its
> radiation distance, drainage and fire-water run-off retention, the
> fire-water ring main and hydrants, emergency showers/eyewash, a
> substation/MCC, analyser houses, maintenance access (crane, tube-bundle
> pulling space), tank-to-tank spacing, cooling-tower drift.  Status:
> dispatched (G34); the sweep's list comes back to Vitor before anything
> else is built.
> **LANDED 2026-10-21** (merge `7a35f9646`, rows `d40aabd86`, fix
> `a9f46a8c8`).  Re-recorded on the commander's authority, re-measured
> first: greenAmmoniaPEQ_baseCase plotArea / landArea 31 436.02 -> 38 142.56
> m2, land 1.5718 -> 1.9071 MEUR, NPV -408.635 -> -408.924 MEUR (arm (j)'s
> published <=> pinned row is that plotArea); aceticAcid02_plant findings
> 3 -> 5 and apalutamide01_tablets 1 -> 3, each with its four new
> `unbundedLiquid` rows.  NOT recorded, outside the families: nine
> apalutamide01 rows drifting within tolerance (loopGas T 264.70728 ->
> 264.70957 K and the SD / blower / condensatePot / n2Mix rows after it)
> and aceticAcid02's new `kpi lightsColumn Q_condensate_m3_s` (G28).
> Found on landing by check_design_sheet (q)/(w): a bund listing a tank
> whose sizer REFUSED refused the run, against C79; it is now published
> with verdict `notChecked` and `bundNotChecked` announced.

> **C133. THE DELIVERABLE DRAWINGS: THE PFD WITH ITS STREAM TABLE, AND
> THE SPECIFICATION SHEETS, AS PDFS IN THE SECTOR/UNIT HIERARCHY (Vitor,
> 2026-10-21: "Nos Reports devia de haver o diagrama PFD, com a tabela de
> correntes, de acordo com as boas praticas.  Aquilo deve gerar A4 A3 A2
> A1 (formato pdf) de acordo com o tamanho do PFD.  Se houver sectores,
> cada um tem o seu PFD ... tambem devia gerar o PDF A4 das folhas de
> especificacao com o esquema da operacao unitaria no centro, entradas e
> saidas de corrente, energia e calor trocado, materiais, porta de homem,
> flanges ... deve ficar uma hierarquia de acordo com os sectores e
> operacoes unitarias").**  Measured: the GUI draws the PFD on a canvas
> (`@xyflow/react`, laid out by `gui/src/case/flowsheetLayout.ts` /
> `toGraph.ts`, streams numbered by `streamNumbering.ts`); the stream
> table, the per-sector view and the specification sheets (`design/<SECTOR>/
> <unit>/<item>`, drawn by equipment kind) exist; THREE datasheets already
> print through the browser (`window.print()` -- hxDatasheet.ts:752,
> ColumnDatasheet.tsx:341, HeatExchangerDatasheet.tsx:313), so a sheet
> prints today only for the kinds that carry a button, at the browser's
> page size, one at a time.  Nothing produces a PFD drawing as a
> document, sized to its content, or a deliverable set.  Commander's
> reading, to be put to Vitor as a scope: (1) THE PFD SHEET by good
> practice -- the flowsheet drawn with equipment tags and stream numbers,
> the stream table below or beside it (number, phase, T, P, flows,
> composition, the case's units), a title block (case, sector, revision =
> the run's commit, date, the author), the sheet size CHOSEN from the
> drawing's extent (A4 -> A3 -> A2 -> A1, the smallest that keeps the
> text legible), one sheet per sector plus a plant overview sheet whose
> sectors are boxes; (2) THE SPECIFICATION SHEET as an A4 per sized item
> -- the unit's schematic at the centre with its ports, the inlets and
> outlets with their states, duties and work, materials, the nozzle
> schedule, manways (C129 supplies nozzles/manways: until then the sheet
> says "not yet declared"), the design basis and the `assumed` line;
> (3) THE HIERARCHY: `reports/drawings/<SECTOR>/PFD-<SECTOR>.pdf` and
> `reports/drawings/<SECTOR>/<unit>/<item>.pdf`, mirroring `design/`,
> plus a single bound PDF with a contents page, downloadable from Reports
> in one click.  HOW (the one decision that matters): the engine already
> publishes everything a sheet shows; the LAYOUT (positions) lives in the
> GUI, so the drawing is made where the layout is -- a print-ready SVG
> per sheet assembled in the browser (no new dependency; the PDF by the
> browser's print with an `@page` size per sheet, or by a small
> SVG-to-PDF writer of our own), never re-computing a number; a headless
> `bin/` route for the same sheets (the CI site smoke's Chrome) so a
> case can produce its drawing set without a person at the screen.
> Owed to Vitor: whether the sheets follow a named convention (title
> block fields, symbol set -- ISO 10628 / the course's own), and the
> priority against C129/C130 (the sheet shows nozzles and the P&ID's tags
> when they exist).  Status: proposed; queued after the C131
> consolidation.
> **Vitor, 2026-10-21: "Faz como achares mais sensato e de acordo com as
> boas praticas"** -- the commander's decisions, as stated defaults:
> (1) CONVENTION: the flow-diagram conventions of ISO 10628 (equipment
> and stream representation on a PFD) and the title-block fields of ISO
> 7200 (title, identifier, revision, date, author, sheet size, sheet
> n of N), followed as CONVENTIONS -- Choupo draws its OWN symbols and
> cites the standards by number; no figure or table of a standard is
> copied (they are no-grant texts, the C16 rule); one symbol per
> equipment kind, the same registry the 3D and datasheet drawings key on,
> so a kind is drawn the same way in every view; (2) PRIORITY: C133 goes
> FIRST after the consolidation, before C129/C130 -- the drawings
> deliver now, and the nozzle schedule, manways and P&ID tags are fields
> that C129/C130 fill later; until then each such field reads "not yet
> declared", never an invented value.

> **C132. DIAGNOSING A FAULT FROM A PLANT HISTORIAN -- AN EDUTOOL, AND
> THE FAULTS AND INSTRUMENTS IT NEEDS (Vitor, 2026-10-21, after a
> LinkedIn post of a historian dataset for root-cause analysis of a
> steam-heated agitated tank: "Esse EduTool e muito bom!  ... Faz como
> dizes").**  The commander's reading, accepted: a published dataset
> hides its answer; Choupo can publish the SIMULATOR that made it, so the
> student can TEST a diagnosis instead of guessing it.  The Tennessee
> Eastman Process (Downs & Vogel, Eastman Chemical / Kodak, Comput.
> Chem. Eng. 1993) is cited as the reference the field knows, NOT used
> as the base: its chemistry was disguised on purpose (components A-H,
> altered kinetics and properties), so first-principles diagnosis is
> impossible on it, and the licences of its circulating datasets are
> unread.  Measured: choupoCtrl's controllers are ideal and its
> measurements perfect -- `src/control/` has no measurement noise, no
> sensor drift, no missing readings, no declared fault (grep, 2026-10-21);
> the PRBS / signal family exists (ctrl08, ctrl17).  PROPOSED SCOPE, put
> to Vitor for the pedagogy: (1) ENGINE: `instruments {}` (per tag:
> noise sigma, drift rate, dropout, quantisation, a DECLARED random seed
> so a run stays a function of its inputs) and `faults {}` (start, end,
> mechanism -- steam-side fouling resistance rising, valve stiction or a
> stuck valve, a failed-open steam trap, a feed temperature or
> composition step, a sensor drift, an agitator stop) on a choupoCtrl
> case, plus operator setpoint changes; the run writes a HISTORIAN (CSV,
> tag per column, the 1-minute and the compressed form) and NOTHING of
> the answer; tags from the C130 P&ID when it exists, declared otherwise;
> (2) THE WITNESS: the steam-heated agitated tank with temperature and
> level control, a 14-day normal baseline, then non-overlapping faults
> each diagnosable from first principles (mass and energy balances, the
> steam side, the valve characteristic, control-loop behaviour -- the
> loop that MASKS the fault: T at setpoint while the steam valve opens);
> (3) THE EDUTOOL "Diagnosing a fault from the historian": the student
> sees the trends, is asked WHEN and WHY before any answer, uses the
> balances and the C121 reconciliation (gross-error tests) as
> instruments, then DECLARES the hypothesised fault in a copy of the
> case and runs it against the historian -- the diagnosis is a tested
> hypothesis; the answer key is the case's own `faults {}`, which the
> teacher keeps; (4) a later bridge: a few of the TEP's 21 fault TYPES
> reproduced on a transparent Choupo process.  Owed to Vitor: which
> faults, which course (process control? operations?), and whether the
> historian ships with the site or the teacher generates it.  Status:
> proposed; queued AFTER the C131 consolidation (nothing new opens
> until it ends), the engine half after C130 (the tags).

> **C131. CONSOLIDATE, THEN REVIEW EVERYTHING AGAINST GOOD PRACTICE AND
> THE OPEN REFERENCE (Vitor, 2026-10-21, approved: "Concordo, regista
> como C131 e avanca com a consolidacao").**  Why (measured): six
> branches await integration (C121 reconciliation, C124 column
> exchangers, C117 Evidence view, C123 benchmarks B/C, the column and
> LL-flash fixes), three slices are mid-flight (C123 A/D/E, C128
> solvent, C116 one Explore), the C125 speed-up is building, and the
> open-simulator comparison has already found four defects no gate saw
> (every one exited 0), while 17 first-law pins stay open (cavett01 at
> 88 %).  PHASE 1, CONSOLIDATE (today and tomorrow): integrate the six,
> finish the three, land C125, close C129/C130 only on Vitor's scope
> answers; nothing new opened.  PHASE 2, REVIEW (the rest of the week),
> one family at a time, a PAIR of generals per family -- one analyses,
> one refutes -- comparing Choupo's formulation, numerics, limit cases
> and announcements with the textbooks/articles (the standard of good
> practice) and with the open reference simulator (a second pair of
> eyes, cited by commit, nothing copied): (a) thermodynamics -- VLE/LL/
> VLLE flash, stability, bubble/dew, cubic EoS (PR78, SRK), activity
> models (NRTL, UNIQUAC, Wilson, UNIFAC), electrolytes; (b) separations
> -- the column (Wang-Henke, simultaneous MESH, condenser, feeds),
> absorber/stripper, extractor, crystalliser, membranes; (c) reactors --
> CSTR, PFR, Gibbs, equilibrium; rate-law reading and units; (d)
> recycles and convergence -- tears, Wegstein, Newton, stopping
> criteria, what is published on non-convergence; (e) sizing, costing,
> economics -- correlations, factors, the cash flow; (f) time-integrated
> and control -- integrators, ledgers, controllers.  Each pair delivers
> a short report: same / different and why / wrong / missing, with
> file:line on both sides; every confirmed defect becomes a witness and
> a gate; a defect on the reference side is documented and offered
> upstream.  One family at a time, the machine kept free for the suites;
> **(g) EVERY EDUTOOL (Vitor, minutes later: "E verifica tambem os
> EduTools todos!")** -- the 61 live tools, in pairs as above, each read
> as a student would AND against the engine it cites: every formula and
> symbol definition against the textbook and the engine's file:line
> (the 2026-08-31 method, which found 43 defects in one night); every
> number on the page traced to the witness run; the Help/F1 anchor
> landing on the right guide section; the page legible at phone width;
> the witness's run time (the C122 smoke's SLOW list); what the page
> claims the engine does, checked against what it does.  Defects fixed
> in the same pass where small, listed where not.


> **C131 PHASE 1 -- TWO SLICES ON `main` UNVALIDATED (Vitor, 2026-10-21:
> "Podes fazer push sem validar e no sabado validamos?").**  Merged
> without running any suite, by his order, so that `main` carries the
> whole day's work: C124 item 1 (a column's condenser and reboiler
> designed in detail -- `ShellTubeHX.cpp`, `ColumnSize.cpp`,
> `core/Units.cpp`, `core/Dimensions.H`; it reaches every case that sizes
> a `shellTubeHX` item) and the C126 white-paper figure that shows the
> C134 retention bunds (paper only).  The two generated files that
> conflicted were regenerated (`case_manifest.py`,
> `release_inventory.py`); nothing else was run, not even the build.
> OWED ON SATURDAY, before anything else lands: `make all`, the cases
> that size an exchanger or a column, `check_design_sheet`,
> `check_equipment_pinned`, `check_cost_provenance`, `--gui` (the
> lesson citations into the files C124 moved), the guides and `--fast`;
> any golden row that moves goes to Vitor as a list first.  Until then a
> red check on `main` is presumed to be this, and the revert is one
> merge commit (`git revert -m 1`).
> **C130. THE INSTRUMENTED FLOWSHEET -- A P&ID LAYER OVER THE PFD (Vitor,
> 2026-10-21, same night, "isto tambem devia de poder ser feito").**
> Measured: the control layer exists only in the time-integrated class
> (`src/control/`: PID, schedule and signal controllers with measured and
> manipulated variables, choupoCtrl's `controllers` block); a steady case
> carries no instrumentation at all; the EduTool `column-control`
> teaches control STRUCTURE and instruments for a column
> (`registry.ts:1090`, theory `sec:column-control`); `valve` is a
> letdown unit; the relief valve is a sized item of the unit it
> protects (C62).  Commander's reading, to be put to Vitor in the
> morning: a DECLARED `system/instrumentationDict` on a steady case --
> loops (`FIC-101 { measured { stream F; } controller { type PI; action
> reverse; } finalElement { controlValve { stream; } } }`, ISA-style
> tags declared by the case, never invented), indicators and
> transmitters (PT, TT, LT, FT on a stream or a unit's interior), the
> relief valves it already sizes, and interlocks named as text; the
> ENGINE validates it (a measured variable the flowsheet has, a final
> element on a stream that exists, one controller per manipulated
> variable, a control valve's steady sizing from the converged run's
> own flow and the dP the case declares for it -- Cv published, a
> declared `Cv` compared), and publishes a `pid` block the GUI draws
> over the PFD as a second view (tags on the lines, bubbles by ISA
> convention, the loop's dashed signal line) -- the engine decides, the
> GUI draws; the steady answer is UNCHANGED (the valve's steady dP is
> the pressure the flowsheet already carries through its `valve` or a
> declared drop).  THE DYNAMIC TWIN: a loop declared here can be
> EXPORTED as a choupoCtrl `controllers` block (tuning left to the
> student), the bridge between the design course and the control
> course -- Vitor's pedagogy.  Witness: greenAmmonia03 (his request for
> C129 names it), the synthesis loop's pressure and the separator
> level.  NOT in scope, named: a control-valve sizing standard's tables
> (no-grant; the case declares the Cv or the equation's coefficients
> with source), alarm rationalisation, SIL, any vendor instrument.
> **Vitor, minutes later: "este e o diagrama de flowsheet com
> instrumentacao e controlo que deve ser usado para correr o
> choupoCtrl".**  The diagram is the P&ID (piping and instrumentation
> diagram), the level after the PFD the GUI draws today; and it is not
> an export FROM the steady case but the INPUT TO choupoCtrl: one case,
> choupoSolve runs the PFD, the student declares the P&ID over it,
> choupoCtrl runs the same case from the P&ID -- each declared loop a
> controller, each control valve the final element that manipulates its
> variable, the converged steady state the starting point -- so the
> `controllers` block choupoCtrl reads today becomes DERIVED from the
> P&ID declaration (one home), never written beside it.  Status:
> proposed, awaiting Vitor's morning answer on scope (which instruments
> a student should see first) before dispatch.


> **C128. WHICH SOLVENT, OR WHICH SOLVENT MIXTURE, FOR A GIVEN SUBSTANCE
> -- an EduTool, and the Explorer's delta lens made honest first (Vitor,
> 2026-10-21, with a second opinion he consulted on the lens with
> methanol + water selected: "Isso no explorer ainda esta confuso").**
> Measured against the tree: `solubilityParameter` computes the
> Hildebrand delta of each PURE component (Watson Hvap, the record's
> Vliq; `SolubilityParameter.cpp:126`); it READS `hansen { dD; dP; dH; }`
> and computes the Teas coordinates with a sum-rule check (`:315-410`,
> `Component.H:112-140`, gate `check_hansen_teas`), but NO standards
> record carries a `hansen {}` block today (grep: 0) -- so the lens's
> caption "Hansen ... is not implemented" (`ExploreWorkspace.tsx:1162`)
> is false on the engine and true on the data, and its "ONE NUMBER
> CARRIES NO HYDROGEN BONDING" (`:1159`) is imprecise (the cohesive
> energy includes it; the single parameter does not separate it from
> dispersion and polarity).  Two slices, in order.  (1) THE LENS, with
> the Explore queue (G18b owns that file): title "Cohesion of the pure
> liquids -- Hildebrand parameter"; the first sentence says each bar is a
> pure liquid at the stated T, that a larger value is not a larger
> dissolving power and that no mixture property is computed; the two
> sentences corrected; sources and limits moved to the details.  (2) THE
> ENGINE AND THE EDUTOOL: a `hansenMixture` route (or an extension of the
> op) over DECLARED solvents, a composition with its declared basis
> (volume / mass / mole), a T, and a TARGET (solute or polymer with its
> own `hansen {}` and, where measured, an interaction radius R0): the
> usual volume-fraction rule delta_k,mix = sum phi_i delta_k,i (k = D, P,
> H), the Hansen distance Ra^2 = 4(dD - dD,t)^2 + (dP - dP,t)^2 + (dH -
> dH,t)^2 along a composition sweep, RED = Ra/R0 ONLY where R0 is
> declared (no invented universal cut-off), the approximation, the basis
> and the parameters' reference T stated on the run; a mixture the
> package finds two-phase at that composition is REFUSED as a solvent,
> never averaged; affinity (Ra) kept apart from solubility (g/L), which
> this route does not give.  The EduTool: "Choosing a solvent, or a
> solvent mixture" -- the student declares the target and the solvents,
> sees Ra against composition with the pure solvents at the ends and the
> minimum marked, the Teas diagram beside it as a complement, every
> parameter with its source, and the sentence that a small Ra is a
> compatibility indicator in this approach and not a saturation
> concentration.  THE DATA IS THE GATE: Hansen's own compilations (the
> Handbook, HSPiP) are no-grant; parameters may enter standards only
> from primary articles with a licence read first (the 2026-09-01 rule),
> or case-locally for a witness with the citation per value -- the
> licence reading is the slice's first step and a finding, not a
> formality.  Status: proposed; dispatch when a slot frees (the machine is
> at its limit), slice 2 as a general of its own, slice 1 in the Explore
> queue.
> **APPROVED 2026-10-21 (Vitor: "avanca", with his ruling on the data:
> "Isso ja e um modelo muito velho e nao sejas mais papista que o Papa"
> -- Hansen's parameters are decades-old published numbers; cite the
> primary source per value as always, but a licence reading is not a
> gate on this slice; what stays out is a wholesale copy of a
> compilation's ARRANGEMENT).**  Four adjustments from the second
> opinion, taken: (1) reading the block is not the mixture arithmetic --
> the engine work is real; (2) START with a synthetic example (two
> fictitious solvents A and B, a fictitious polymer between them, the
> minimum at 50:50, labelled "didactic example with synthetic
> parameters"), then a real documented one, then a confrontation with
> measured dissolution; (3) the two-phase rule precisely: refuse to
> REPRESENT the pair as one homogeneous solvent, and show three outcomes
> -- one phase predicted (the homogeneous approximation applies, with its
> assumptions), two phases predicted (no single average), data or model
> insufficient (homogeneity not verified); (4) T is not decorative: the
> parameters' reference T is stated, and the tool says whether a
> correction is applied or the values are held constant as an
> approximation.  Pedagogy (his): the student PREDICTS the best
> composition before the curve is revealed, then sees the measurements.
> Sequence: synthetic -> real -> experiment.  Dispatched (G33).
> **Slice 1 DONE 2026-10-21 (G18b, `claude/c128-delta-lens` bd33ec60e,
> integrated):** the lens retitled "Cohesion of the pure liquids
> (Hildebrand parameter)"; the caption says pure liquid / not dissolving
> power / no mixture property / "includes hydrogen bonding, does not
> separate it" / candidate never verdict; sources, `published` and the
> measured Hansen state in the Details; Explorer Guide
> `sec:explorer-hildebrand`.  Open for slice 2: the engine's console
> line `SolubilityParameter.cpp:309-313` repeats the old wording.

> **C127. ONE WORKED EXAMPLE, FROM A SENTENCE TO A STUDENT'S DECISION
> (Vitor, 2026-10-21, passing on a second opinion he asked for: "Mostra-me
> um exemplo completo, de uma instrucao em linguagem natural ate ao ecra
> em que um aluno consegue explicar por que aceita ou rejeita o modelo";
> he said he is himself still confused by the evidence workflow).**  The
> review's four points, measured against the tree: (1) "validated" is
> already contextual in the RECORD -- `validation { verdict; heldOut {
> points; aad_pct; aad_K; domain_x1 }; acceptance { maxAAD; origin } }`
> and `validity {}` (e.g. `data/standards/parameters/NRTL/
> 1Propanol-water.dat`) -- but no screen says "meets the criterion for
> THIS test set, THIS range, THIS property"; (2) the fit/held-out roles
> and their independence level are in the dossier (`evidencePartition`
> announces identity-level independence, `EvidencePartition.cpp:465`)
> and must be DRAWN, fit points and held-out points distinct, "another
> study" vs "a split of one study" said; (3) the Evidence view should
> open on the SELECTED model with the others addable, residuals per point
> against the condition, and an error measure with its unit (one AAD can
> hide a badly represented region); (4) the property-data pipeline does
> NOT reconcile measurements today (C121's reconciliation is plant
> flows); if it ever transforms data the originals stay readable and the
> change is shown.  The agent may choose and run, recording the
> instruction, the assumptions and the decisions; local acceptance and
> public promotion stay two separate acts (they are: promotion is
> Vitor's).  Proposed: (a) the worked example on methanol-water, a
> transcript from one natural-language request through
> `bin/choupo-thermoml`, the evidence files, `fitParameters` with a
> declared partition and band, the dossier, to the Explorer screens, with
> screenshots -- as a short guide chapter or tutorial README; (b) the
> Evidence view gains points 1-3 (after C117 and C116 land).  Status:
> proposed to Vitor.
> **Vitor, the same day: "devias fazer um EduTool sobre isso das
> propriedades!  O aluno via logo como tinha de fazer!"** -- (a) takes the
> form of an EduTool (the worked example walked page by page: the request,
> the data and their sources, the fit with its declared band, the
> held-out test, the verdict in context, the decision), built on the
> methanol-water witness and on the Evidence view, so it is dispatched
> after C117 and C116 land, then (b).  Queue on that screen, one general
> at a time to avoid conflicts: C117 -> C116 -> C118 stage 2 (the T/P
> excursion lens, whose engine op `phaseSplitScan` already shipped) ->
> C127.
> **Standing requirement (Vitor, same day): "nao te esquecas de ir
> fazendo update dos Guides e de ter os links corretos para o aluno fazer
> F1 onde precisa".**  Every user-facing slice in this queue (and after)
> updates the guide sections that describe it (rebuilt with `make -B`,
> read back, committed) and gives each new view an F1/Help anchor that
> lands on the right section, with the gates that hold those links green;
> it is in every brief, and an integration without it is not done.
> **And the student's OWN data, in the same EduTool (Vitor, 2026-10-21:
> "Uau!!! Isso devia de ser posto tambem no EduTool do explorer!").**
> Measured: the hosted site already opens a user's case folder or .zip
> (File -> "Open Case folder..." / "Open Case from .zip...", one rule in
> `gui/src/cases/caseArchive.ts`); the Evidence view reads the OPEN
> case's `constant/experiments/*.dat` as its first tier
> (`gui/src/case/evidence.ts:302-309`) and the Explorer the case's
> `constant/components/*.dat` (`ExploreWorkspace.tsx:410-484`);
> `data/local/evidence/` reaches the dev GUI only (the site cannot read a
> disk).  So C127's EduTool gains a last page: "now with your own
> mixture" -- a minimal self-contained case (a controlDict, the two
> component records if they are not in the catalogue, the measured
> series under constant/experiments/ with their citation) downloadable as
> a template, opened back in the site, drawn by the Evidence view.
> First step before writing it: an end-to-end test on the live site
> (a zip with one pair and its data, opened, drawn), the gaps it finds
> fixed; the Explorer Guide says how.  Not built, named: opening a data
> folder WITHOUT a case, or dropping .dat files on the view.

> **C126. A WHITE PAPER IN THE REPOSITORY (Vitor, 2026-10-21: "Achas que
> e bom pegarmos nesta dica, e fazemos um white paper que vamos
> disponibilizar online no repo?").**  The tip: as language models learn
> to write a 500-page design in minutes, what keeps its value is a
> simulator whose answers can be VERIFIED -- conservation gates, refusals
> by name, primary-sourced data, validation against measurements -- and
> that an agent calls instead of computing from memory.  Measured: `paper/`
> already holds a JOSS draft (`paper.md`) and a full companion article
> (`paper.tex`), both written against the withdrawn 2607 and owed a
> re-read.  Commander's recommendation, put to Vitor: yes, as a DIFFERENT
> artefact from the companion article -- its thesis is verifiable
> simulation for students working with AI agents, its evidence the
> failures this project caught at exit 0 and the C123 benchmarks; kept in
> the repo (CC BY-SA, like the guides) AND deposited on arXiv and Zenodo
> (a DOI makes it citable and findable, by people and by future models);
> NOT instead of JOSS, whose light public review is what gives an
> academic reader a reason to trust it.  Owed to Vitor before drafting:
> the author list, and whether it may name the reference simulator (the
> doctrine bans that in user-facing documents; benchmarks/ is exempt).
> Outline first, for his approval: the pedagogy and the public claims are
> his.
> **Vitor's answers, 2026-10-21:** authors Vitor Geraldes, Pedro Mendes
> and Miguel Rodrigues; the comparison MAY name the open reference
> simulators "se nao houver problemas eticos", the closed commercial ones
> not at all ("nem sequer sabemos que porcaria anda la dentro").  Taken
> with it, as practice: same inputs, every workaround stated, the
> reference's own defects reported neutrally with version and commit, and
> each one OFFERED to its maintainers (an upstream issue) before the paper
> is public; a tool is named only after its licence is verified (one whose
> source is closed is treated as closed).  The paper's folder becomes an
> exempt tree in `check_doctrine` (the benchmarks/ precedent) in the
> commit that creates it.
> **Outline APPROVED 2026-10-21 ("avanca"), with section 4 reframed on
> Vitor's objection ("nao des tiros nos pes"):** not a list of the
> project's defects but how each gate makes a CLASS of error unable to
> leave in silence -- with the one sentence the history forbids left out
> ("a basic error never ships": some reached the site before their gate
> existed; the honest and stronger form is "when an error escapes, it
> becomes a gate").  Nine sections: the problem, the thesis, what makes an
> answer verifiable, the gates by class, the open-simulator comparison
> (published only after the reference's defects are offered upstream),
> the agent workflow (C117), pedagogy, limitations, availability.
> Drafted by a general (G29) in `paper/whitepaper/`, every claim cited by
> file:line or commit; Vitor, Pedro and Miguel review and answer for it.
> **Added by Vitor the same day:** the OpenFOAM analogy (one of the most
> elegant simulators ever built, C++ with transparent dictionaries) with
> an explicit statement that Choupo is NOT part of it, nor affiliated
> with or endorsed by its owners (the trade mark named); and a section
> presenting the architecture and how Choupo works (three layers, the
> case directory and dictionaries, five binaries, explicit factories,
> state directories, the WASM front-end, the visible Newton log).  Sent
> to G29.
> **And a READER FORUM before it goes out (Vitor, same day: "deve ter um
> forum representativo de alunos, engenheiros e professores a lerem o
> paper, como se nunca tivesse ouvido falar dele, e a verem se entendem e
> ficam entusiasmados para terem vontade de ir conhecer").**  On the
> draft PDF, cold readers who have never heard of Choupo: two students
> (undergraduate, PhD), two industrial process engineers (a daily user of
> commercial simulators; one at an SME with no licence budget), two
> professors (process simulation; one sceptical of AI in teaching) and an
> OpenFOAM user.  Each reports, quoting the sentences that stopped them:
> did the thesis land, where they got lost, what excited and what made
> them distrust, and whether they would open choupo.org and why.  A
> synthesis separates consensus from taste and proposes edits; Vitor
> chooses which go in.
> **DRAFTED 2026-10-21 (G29, `claude/c126-white-paper` de41c0d3e,
> integrated):** `paper/whitepaper/whitepaper.{tex,pdf}`, 12 pages, a DRAFT
> watermark behind one switch (`\drafttrue`), the approved sections plus
> the architecture section and the OpenFOAM paragraph (non-affiliation in
> the text and the acknowledgements, NOTICE's wording; the holder's own
> requested wording not found online -- a TODO).  Every engine claim
> cited by file:line, gate or commit in LaTeX comments; counts only from
> generated/; the two run listings are real runs.  Section 6 names the
> open reference simulator only, and waits on `upstream-issue-draft.md`
> being posted by Vitor.  `check_doctrine` gains `COMPETITOR_NAMED_TREES`
> (`paper/whitepaper/` -> that one name only; any other banned word still
> fails there, also on a line that carries the allowed one) and arm (t)
> now reads `docs/ai/*.md`; three sabotages observed.  Found on the way
> and fixed on integration: `check_doctrine` was RED on main from the
> commander's own C123 note naming the benchmark folder's subpath.
> TODOs for Vitor are listed at the top of the source.  Next: the
> cold-reader forum on the PDF.
> **FRAMING REJECTED by Vitor the same day** ("Tu achas que isto e o
> primeiro paper que vai apresentar o Choupo ao mundo?!").  The commander
> turned a conversation about AI anxiety into the paper's thesis and
> title; the first paper must present CHOUPO -- what it is, how it is
> built, what it computes and why its numbers can be trusted -- with the
> agent argument as one section at most.  The content (architecture,
> OpenFOAM, the gates by class, the open-simulator comparison, the
> limitations) stands; the title, the thesis and the section order are
> redone once Vitor decides the frame (he is consulting a second
> opinion).  The forum already launched on the draft runs to completion
> as evidence on whether the frame works.
> **The forum (7 cold readers, all "thesis landed: partly")** agreed:
> replace the gate inventory with a worked, reproducible example; say what
> Choupo models today; the readers' favourite parts were the visible
> Newton log and the Duhem refusal -- Choupo itself, not the AI frame.
> **FRAME DECIDED (Vitor, with a second opinion):** title "Choupo: an
> open-source chemical process simulator for education and research";
> glass-box defined in the abstract by observable properties; the AI
> response IN the introduction as part of the philosophy (with the
> positive opportunity, its pedagogical effect a goal to evaluate, and
> never "auditing is what remains to the student"); sections: motivation
> and philosophy, current scope, architecture (OpenFOAM as a mapping
> table + non-affiliation), thermophysical data, verification and
> validation (each gate's concrete reach; the inventory to an appendix),
> representative examples (simple, integrated with recycle, research),
> discussion, availability; the centrepiece a property-curation example
> showing who does what (user, agent, engine, interface), including a
> candidate that fits the training data and fails the test; three
> figures from real runs.  The open-simulator comparison STAYS (Vitor:
> "vai ficar porque nos vamos resolver os problemas que viste") with
> cited-version / in-integration / future kept apart.  Two coordinated
> documents (JOSS short + this full article), both tied to a version.
> Sent to G29 (v2); then REASSIGNED the same hour on Vitor's instruction
> ("Refaz o draft agora com o Fable") to a fresh general on the model he
> named (G31, branch `claude/c126-white-paper-v2`); G29 stopped with
> nothing pushed, leaving one reusable measurement (curate05: in-sample
> rms 0.13 K, held-out AAD 0.316 K against a 0.047 % band declared before
> the fit -> notValidated; UNIFAC the mirror image).  The research
> team's licence findings feed it: OpenCFD's Trade Mark Policy (read
> 2026-10-21) asks for an Acknowledgement line and a Disclaimer line,
> both quoted verbatim in the brief; COCO is closed-source freeware and
> is NOT named; the reference simulator is GPL-3.0 at the recorded
> commit, its sample folder under no licence of its own.
> **v2 DRAFTED 2026-10-21 (G31, `claude/c126-white-paper-v2b` b53267b05,
> integrated):** `paper/whitepaper/whitepaper.{tex,pdf}` redrafted on the
> decided frame -- title "Choupo: an open-source chemical process
> simulator for education and research"; glass-box defined in the
> abstract by six observables; the AI response in the introduction
> (positive opportunity, effect a goal to evaluate, the student still
> formulates/chooses/designs/decides); a scope table from generated/
> (c402561ad); the OpenFOAM mapping table with OpenCFD's three required
> statements (policy re-read that day); the curation chain and the worked
> user/agent/engine/interface/student example on curate05 (fits its own
> study to 0.10 K, misses the held-out study by 0.316 K against a
> 0.155 K band declared before the fit -> notValidated; UNIFAC the mirror
> image), the figure from the run's own CSVs under
> `paper/whitepaper/data/`; "gate" defined at first use and each gate's
> concrete reach; the inventory to Appendix A; examples flash01 (log and
> Duhem refusal regenerated), cavett01 (Newton 7 iterations; its first
> law OPEN at 88 % and pinned -- shown, not hidden), SDEM/NF270 and ed04
> with exactly what the gates hold, the open-simulator comparison with
> the UNIFAC column and cited-version / in-integration / future kept
> apart.  16 pages, DRAFT on, TODOs commented at the top of the source.
> Gates green; a closed simulator's name in the paper still fails
> check_doctrine (sabotage observed).  Tool gap found: the engine prints
> held-out AADs but no per-point held-out residuals (the figure
> interpolates the scans; the C117 Evidence view needs them from the
> engine).  Owed to Vitor: his read; whether cavett01 (open first law
> shown) or hda (closes) is the recycle example in print; the release to
> cite.
> **Vitor's first read (same night): three things missing** -- the GUI
> is a VISUALISER on the ParaView pattern (OpenFOAM computes, ParaView
> shows; the user does NOT build the case in the GUI, the opposite of
> the usual simulator workflow); UNITS are mandatory in the dictionaries;
> and WHAT the GUI shows (streams coloured, global balances, the
> per-sector view, the 3D layout, and the P&ID to come, "nos vamos
> garantir que vai fazer"); and, minutes later, that a student or user
> installing Choupo on their own PC can WRITE THEIR OWN unit operations
> and models (a case's `code/` + `registerUserTypes()`, the userops
> tutorials, an expression rate law, a per-case thermo override -- the
> local installation's privilege; the hosted site runs the shipped
> engine only).  And "faz uma visita ao Choupo todo e ve se eu me
> esqueci de alguma coisa": the commander scanned the v2 text against
> the tree and found ten omissions, each sent as one sentence or row:
> the SEALED self-contained case (choupo-import, the computational
> seal), AGENTS.md / docs/ai / llmctx, the Explorer (and the Evidence
> view in integration), the model-boundary ledger and the advisory /
> divergence surface, the specification sheets, the numerics named
> (Newton, Wegstein, Nelder-Mead, Michelsen, Rosenbrock23, the normalised
> residual), the time-integrated classes' ledgers and the quasi-steady
> adapter, plant economics (NPV, sensitivity, land, quotes, crew), the
> 3D layout's declared-and-checked features by name, and the zero
> dependencies build (g++ + make, ~370 TUs) with its pedagogical reason.
> Sent to G31 as v2.1.
> **v2.1 DRAFTED AND INTEGRATED 2026-10-21 (G31, 97e654f9c):** the four
> points and the ten omissions in, every added sentence cited by
> file:line in the source (ParaView named -- Kitware's open-source
> visualiser, not on the ban list); 16 pages kept by margins and table
> sizes, no content cut; gates green.  One claim narrowed to what could
> be cited: the design-sheet provenance words -- the general found
> `assumed ( ... )` (ColumnSize.H) and the unit on every value, not the
> `declared / fromUnit / fromRecord` marks (they exist on the exchanger
> sheet, C124; to widen in the next read).
> **GUI figures (Vitor, 2026-10-21, after reading v2.1: "O paper esta
> fixe! Mas faltam umas imagens de layout (por exemplo da amonia verde) e
> do flowsheet para mostrar as features que o tornam semelhante ao
> paraview").**  Commander: agree -- the visualiser subsection is text
> only.  Two figures captured from the browser on a real run: (A) the
> flowsheet view of a sectored plant (case tree, streams coloured by a
> variable, the boundary balance, the stream table) and (B) the green
> ammonia 3D layout; a reproducible capture script, so the figures are
> regenerated from the cited release (TODO item 2) and pick up C134's
> bunds then.  Dispatched to G36 (`claude/c126-gui-figures`).

> **C125. WHY THE BREAKTHROUGH PAGES ARE SLOW (Vitor, 2026-10-21: "Porque
> isto e tao lento? breakthrough e do lub-scaleup").**  Measured by the
> commander: both EduTools run `batch13_breakthrough_co2` on open (85 s
> native at load ~5, ~195 s in the CI browser).  Two numerical causes, no
> physical one: `Rosenbrock23.cpp:119` builds a DENSE finite-difference
> Jacobian and a dense LU every step on ~200 rows of a banded FV system;
> and `FixedBedAdsorber.cpp` seeds each 0.5 s sampling chunk with the
> CLIPPED last step, so every chunk throws one step away (400 accepted /
> 200 rejected per 100 s).  Taken on the commander's mandate (numerics,
> no physics, no golden expected to move): an OPT-IN declared Jacobian
> structure for Rosenbrock23 on the `blockTri` precedent (announced,
> audited against a dense Jacobian, refused when false) and carrying the
> controller's proposed step across chunks.  Dispatched (G27, branch
> `claude/c125-adsorber-speed`).  Vitor's, not taken: a coarser mesh for
> the pages alone (faster, but a more diffuse front than the reference).
> **DONE 2026-10-21 (G27, `claude/c125-adsorber-speed` bcd6a90b0,
> integrated).**  Both causes measured on the parent build first (batch13:
> 202 derivative evaluations per dense Jacobian; 14865 accepted / 5274
> rejected steps, one rejection per chunk).  On the MESH precedent the
> unit now DECLARES its structure (`ODEControls::structure`: a block per
> cell through a row map, ledger rows as a border that says what it
> reads); Rosenbrock23 builds a Curtis-Powell-Reid coloured Jacobian (6
> evaluations instead of 202), factors W by block-Thomas (moved verbatim
> out of NewtonND.cpp into `solver/BlockTridiagonal`, the one home; every
> MESH column byte-identical), closes a NARROW ledger row from its own
> coloured entries and a wide one by a directional difference, and
> AUDITS the declaration against a dense Jacobian on the first step,
> refusing a false one by name; `ODEStats::hNext` carries the
> controller's proposal across chunks.  batch13 132 s -> 8 s wall
> natively (CPU 20x), 0 rejected; the other adsorber witnesses 5-27x;
> no golden re-recorded (worst physical move 6e-7 against 1e-4); every
> other Rosenbrock23 user byte-identical.  `solver { jacobian
> blockTridiagonal | dense; }`.  Gate `check_ode_block_structure` (six
> sabotages; the column-grouping one caught ONLY by the evaluation-count
> arms).  Trap paid for in the slice: closing every border row by a
> directional difference turned a round-off mass closure into a 3.8e-6
> LEAK at exit 0 -- a row the colouring can separate must be
> differentiated by colour.  Re-validated on the combination with main:
> `--fast` 74/0, `--gui` 34/0, adsorber + combustion + batch06 + ctrl03 +
> distillation scope 47/0.  ONLINE 1841da2d0: the site smoke measured
> `breakthrough` 9.4 s and `lub-scaleup` 10.0 s in the browser (were
> ~195 s), 0 SLOW across the 61 tools, the whole smoke 113 s (was 276 s).

> **C124. A COLUMN'S EXCHANGERS DESIGNED IN DETAIL: CONDENSER, REBOILER,
> SIDE COOLERS AND PUMPAROUNDS (Vitor, 2026-10-20, after asking whether the
> reference simulators' rigorous columns design the exchangers on their side
> streams -- the commander's answer from memory: no, a side heater/cooler
> or a pumparound enters the column as a DUTY in both, and the detailed
> exchanger design is a separate product or a separate unit -- "regista e
> prepara o ambito ... E os ebulidores e condensadores tipicos, nos ja
> fazemos o design?").**  Measured on main 1cc6f1acf: the column's sizer
> builds five items (`ColumnSize.cpp:273-330`) and sizes its CONDENSER and
> REBOILER only by A = Q/(U*LMTD) with U, LMTD and pressureDesign DECLARED
> by the case (`ShellTubeHX::sizeFromDuty`, route 1); the detailed design
> route of C48 (`ShellTubeHX.cpp:426-439`, `design {}`: U computed from the
> films, the wall and the fouling, the LMTD from the terminal temperatures)
> exists for flowsheet exchangers but is NOT offered to the column's two;
> the condensing and boiling film correlations exist (NusseltFilm,
> Rohsenow, ZuberCHF, `htc/PhaseChangeHTC`) but only the `phaseChanger` unit
> uses them (`PhaseChanger.cpp:594-711`); the column has NO side heater,
> side cooler or pumparound (no such word in `src/unitOperations/
> distillation/`).  Scope put to Vitor: (1) the column's condenser and
> reboiler on the C48 detailed route, the process side priced by the phase-
> change films already in the engine (Nusselt film condensation; Rohsenow
> nucleate boiling with the Zuber critical-flux check), the utility from
> the case; (2) side coolers/heaters and pumparounds as column FEATURES --
> new physics in the MESH (a draw, a duty or a return temperature, a return
> stage), Vitor's -- each realising a sized exchanger item on the same
> route, its terminal temperatures read off the stage profile.  Item (1)
> APPROVED 2026-10-20 ("sim a tudo") and dispatched; item (2), the side
> exchangers and pumparounds, waits until Vitor has seen (1) working.

> **C123. A BENCHMARK FOLDER: HARD CASES FROM THE OPEN-SOURCE REFERENCE
> SIMULATOR, REPRODUCED (Vitor, 2026-10-20: "tentes ir vendo casos dificeis
> do [simulador de referencia open-source] e ver se os reproduzes.  Sera que
> podemos fazer uma pasta de benchmark?  Isso e legal?").**  Commander's
> reading, put to Vitor: reproducing a published PROBLEM (its feeds, units,
> specifications) as Choupo's own case files is not copying anyone's code
> or data; the comparison numbers are facts; the reference simulator is
> itself GPL-3.0 (to be READ, not remembered, before anything is relied
> on), so even its sample files would be licence-compatible -- but they
> carry property parameters from databanks this project already excludes
> (the C16 rule: pair tables are not freed by their courier's licence), so
> NO file of theirs is vendored and every number in a benchmark case comes
> from Choupo's own catalogue or a primary source.  The one real conflict
> is this project's own doctrine: `check_doctrine` bans competitor names
> repo-wide (tracked files, named exemptions only), so a folder that names
> the reference simulator needs Vitor's ruling -- a named exemption for a
> developer-facing `benchmarks/` tree, or neutral wording ("the sample
> library of an open-source sequential-modular simulator", the version and
> URL in a non-shipped note).  RULED 2026-10-20, option (a) ("Usa a)"):
> `benchmarks/` is a named, developer-facing tree exempt from the name ban
> (`check_doctrine` `COMPETITOR_EXEMPT_TREES`, with an arm (t) that fails if
> a manual, a GUI source or `bin/buildSite` reaches it; two sabotages
> caught); `benchmarks/README.md` states the folder's rules (no file of
> theirs copied, every property number ours or primary, reference numbers
> cited with version, a difference is a finding).  The first cases:
> dispatched (G24).  PHASE 1 (research) DONE 2026-10-20: the reference
> simulator is GPL-3.0 (README + COPYING, read at its commit 1abf72d1b,
> 2026-07-17); its bundled pure-component databank is ChemSep 6.96 under
> Artistic-2.0, its pair tables carry no licence of their own (C16 applies);
> its 62 sample files carry no per-file licence and EMBED those pair values,
> so they are read as facts (the problem and the stored solved state, cited
> by commit + sample + the BuildVersion/SavedOn inside the file) and no
> parameter is copied.  Proposed: A Cavett as they ship it (their reading of
> the pressures as psig, compressors and valves added -- beside our
> cavett01), B methanol-acetone pressure-swing distillation (named
> "extractive", no entrainer; its saved state does not close, +0.14 % mass),
> C water/acetone/MIBK countercurrent extraction, D methanol from CO2 (a
> full plant; findings on their side: a 184.7 K distillate for 98.9 %
> methanol at 1 atm, a 100.004 % exchanger efficiency, one adsorption
> constant spelled two ways), E optional steam-reforming PFR.  Decision 1
> (Vitor, clarified): PR kij from PRIMARY sources only -- "Tiramos de
> fontes primarias.  Pedes os artigos cientificos e eu arranjo-tos": the
> commander lists the articles (pair, full citation, DOI), Vitor obtains
> them, and a pair stays at zero only where the list shows it can, with the
> reason (phase 1b, G24).  Phase 1b DONE: 19 verified articles, listed
> with citations and DOIs in `benchmarks/requests/pr-kij-articles.md`.
> DECISIONS (Vitor, 2026-10-20, "Rota P, kij a T declarada, e sim a tudo"):
> route P -- the PPR78 / E-PPR78 group-contribution kij (Jaubert, Privat and
> co-workers), evaluated ONCE per unit at that unit's declared T, a stated
> default announced on the run (no kij(T) in the PR); B may use curate05's
> notValidated NRTL pair case-locally; C may curate an LLE pair from primary
> data if Choupo's UNIFAC does not split water/MIBK; D's outlet-temperature
> PFR is mapped to isothermal, announced; E (steam-reforming PFR) is in;
> the methanol pairs PPR78 lacks fall back to Choupo's own regression to
> measured data (Brunner 1987; the ThermoML methanol-water series) through
> a high-pressure solubility residual in `fitParameters`.  Order: B and C
> first (no kij needed); A, D and E when Vitor has the articles.  Decisions 2-4 (B's case-local notValidated
> **THE ARTICLES READ, DOUBLE-ENTRY (2026-10-21, a five-pair team, one
> transcriber and one independent checker per article, private output in
> `data/local/curation/c123/`):** PPR78 2010 (86 values, 86 agreed; the
> minus signs the text layer drops re-read on the page image), E-PPR78
> 2017 (90/89 -- one printed-label ambiguity, H2-H2O's second parameter
> both lines labelled A), Vanden Bussche & Froment 1996 (120/116, every
> number right, four location/wording notes), Xu & Froment 1989
> (251/246, no wrong value), Brunner 1987 (917/917, all 301 Table 1
> rows).  TWO FACTS the briefs had wrong: (1) **`cavett01` declares SRK
> with every kij = 0, not Peng-Robinson**, and PPR78's kij are defined
> for PR78 (Eq. 7 carries PR78's a_i and b_i; the 2010 article gives no
> SRK route) -- case A must switch to PR78 or cite an SRK route, Vitor's
> call; (2) methanol is NOT a group of E-PPR78 (the 2017 paper scopes 15
> CCS species), and several H2/CO pairs were fitted only far below loop
> temperature (H2+CO2 to 303 K, H2+CO to 125 K): using them in the loop
> extrapolates Eq. (4) in T, to be announced.
> **Vitor, 2026-10-21: "Usa o PR78"** -- benchmark case A runs on PR78
> (Choupo's `PR` with the 1978 m(omega) branch at omega > 0.491, which
> the engine must state it has, or gain), kij from the 2010 table at each
> unit's declared T (route P); the corpus `cavett01` stays SRK and
> untouched.  A, D and E dispatched (G32).  **And the 1978 branch is the
> PR model, not an option (Vitor, same hour: "Nao e melhor fazer o ramo
> de 1978 para omega > 0.491?!").**  Measured before answering: the
> corpus declares PR in three cases (scan2d01, envelope01, envelope02)
> and every component in them has omega < 0.4911, so making the
> two-branch m(omega) of Robinson & Peng 1978 the model moves no golden;
> the branch is announced per component it applies to; the Theory Guide's
> cubic-EoS chapter, docs/ai and the lesson citations into PR.cpp follow
> in the same slice (the guides-and-F1 rule), with a gate arm that
> recomputes kappa above 0.491.  Sent to G32.
> pair; an LLE pair for C if UNIFAC does not split; D's outlet-temperature
> PFR mode) put to Vitor.
> **B and C BUILT 2026-10-21 (G26, `claude/c123-benchmarks-bc` 33e277ca2).**
> The benchmark's `read_sample.py` reads the facts of a sample the user
> holds (no parameter read, no file copied); `compare.py` runs every case
> in a scratch copy.  **B** (methanol-acetone pressure swing; the sample
> calls it extractive, it has no entrainer) runs on curate05's
> notValidated NRTL pair, case-local and held byte-identical to its home,
> and on UNIFAC: duties -0.9...+1.5 %, distillates 0.017 and 0.022 apart
> (set by the specifications' material balance, not by an azeotrope --
> the sample stores none), the 6 atm column 50 K past the pair's evidence
> and announced.  The reference's stored state does not close (+0.14 %
> on flows, a recycle 1.47 % off the stream it copies, "converged" after
> one iteration, two bottoms specs with no steady state).  Three stated
> workarounds (distillate-rate specs, the recycle on stage 2, a letdown
> valve).  Vitor 2026-10-21: "No B, as diferencas sao pequenas!  Se desse
> o mesmo ate parecia ajuste forcado!"  **C** (water/acetone/MIBK
> extraction) is BLOCKED by the engine: an LLE NRTL set curated from Choi
> & Rhim, Hwahak Konghak 24(3) (1986) 185-194, Table 3 (three interim
> case-local pair records, checked against the authors' calculated tie
> lines within 0.0034 on lines 1-9); the reference column is adiabatic,
> Choupo's extractor isothermal.  ENGINE FINDINGS, put to Vitor, who
> answered "No resto tens de analisar tu e usar as boas praticas de
> simulacao": (1) a multi-feed column accepts a stage-1 feed and drops it
> from the condenser balance (109.27 % mass closure at exit 0;
> `DistillationColumn.cpp:1515`, `:1941`, `:2257`); (2) the "total
> condenser" publishes x_D = K_1 x_1 (`:2315-2320`), the vapour in
> equilibrium with the reflux -- a total condenser has x_D = x_1;
> (3) the LL flash returns one liquid against its own TPD verdict,
> depending on the alpha/beta hints (`IsothermalFlash.cpp:693-696`,
> `:744`); (4) the extractor publishes a non-converged cascade at exit 0
> (23-50 % mass closure, a warning); (5) the LL TPD advisory fires on
> correct answers.  Commander's decision under that delegation: (1), (3),
> (4) are defects and are fixed (refuse by name / exit 1 / find the split
> the TPD says exists); (5) is root-caused; (2) is analysed against the
> MESH formulation and good practice, and the moved golden rows are shown
> to Vitor BEFORE any re-record.  Column half (1)+(2) dispatched (G28);
> LL half (3)-(5) after G7b lands (it changes the same flash).
> **Column findings C1/C2 DONE 2026-10-21 (G28, `claude/c123-column-
> findings` fc9518a72; awaiting Vitor's re-record of 239 rows).**  C1: a
> feed or a side draw on stage 1 is refused by the MESH through one
> function, `refuseStageOneTerm` (four sites; the reboiler's rows carry
> their feed and were never in the finding); the benchmark's 128.9 %
> closure and a column04 probe's 103.1 % are refusals now.  C2, analysed
> BEFORE anything moved: every method's stage-1 row  L_1 x_1 + D y_1 -
> V_2 y_2 = 0  is EXACTLY the top-tray balance of a total condenser
> whose reflux returns at x_D = y_1, so x_D = K_1 x_1 was a CORRECT total
> condenser OUTSIDE the stage count, not a mislabelled liquid -- the
> second opinion's reading was wrong and the commander's brief repeated
> it; and, by the same row, also a partial condenser's, so the engine
> held both readings (Wang-Henke rated stage 1 as a tray, the MESH's
> V_0 = 0 / L_1 = R D did not; one case had one tray more under one
> method than the other).  Now `operation { condenser { type total|
> partial; } }` (default total, announced): nStages counts EQUILIBRIUM
> stages; total -- stage 1 is the top tray, the condenser uncounted,
> liquid x_D = y_1 at its bubble point, the full MESH gives stage 1 a
> tray energy row, and the duty condenses (R+1)D to THAT state -- the
> CMO duty had condensed to T_1, the DEW point, and the reboiler plug was
> crediting the condenser's subcooling, invisible to every conservation
> gate (the plant first law is unchanged, only who pays): +15 % on
> acetonePlant C1, whose distillate holds 0.047 % H2 and a 36 K
> subcooling; partial -- stage 1 IS the condenser, vapour distillate y_1
> at T_1, its duty its own envelope, not a tray.  `condenserDuty` is the
> one home.  A source counting a total condenser as "stage 1" is
> nStages - 1 here (benchmark B's reference: 39/19, not 40/20; x_D
> 0.2843 is right).  THE MOVED ROWS, not recorded: 239 across 26 of 31
> column cases -- 35 from stage 1 rated as the tray it is (aceticAcid02
> nTrays 18 -> 19 and what follows; column06/08's new tray-1 energy row)
> and 204 from the condenser duty condensing to the bubble point (every
> Q_condenser grows in magnitude and Q_reboiler by the same kW, the
> utilities follow; +0.08 % to +15.1 %).  The list is at
> /tmp/claude-0/-home-user-choupo/00fe5640-94e2-5280-8336-43196ebbb987/scratchpad/c123-column-moved-rows.tsv
> (case, row, old, new, rel, commit), put to Vitor.  Three sabotages
> caught.  Still on the branch (G28): the README / Theory Guide
> sentences naming V_0 = 0 as the total condenser, and a
> partial-condenser witness (column18) -- BOTH DONE the same morning
> (3d0e37d78): the README, the Theory Guide's full-MESH section and its
> sensor worked example say the condenser-type rule, the tutorials guide
> regenerated, both PDFs rebuilt and read back; `column18_partial_
> condenser` is column01 under `condenser { type partial; }` (x_D equal,
> vapour distillate at 355.69 K, Q_cond -870.34 vs -1291.11 kW, first
> law 0 in both), 32 new rows recorded on the new case only.  The branch
> is ready; it lands the day Vitor approves the 239 rows.
> **LL HALF (3)-(5) DONE 2026-10-21 (G30, `claude/c123-ll-flash-findings`
> cb1bd674e; moved rows NOT recorded).**  (5) ROOT-CAUSED, and it is the
> root of (3): `michelsenTPD`'s tm omitted ln gamma_i(y)
> (`StabilityTest.cpp`, and the header's own formula), so it read
> -g^E/RT at the trivial point and every liquid with g^E > 1e-3 RT was
> "unstable"; restored -- extract01's 340 "TPD-unstable" warnings are 0.
> (3) FIXED: starts from the hint pair in index order + two seeded by the
> TPD's incipient phase; the hints only LABEL (`llSplit::labelByHints`);
> every split finished by a Newton on equal activities to 1e-12
> (a new `LiquidLiquidSplit.H` header beside the flash, on the G30 branch; the minimiser had stopped at 4e-4 ... 4e-3
> in ln activity); a TPD-unstable feed the box-bounded minimiser cannot
> split takes Michelsen's route from the incipient phase, and if that
> fails the flash is NOT converged and the unit refuses naming the feed --
> never "single liquid" at exit 0.  (4) FIXED: a non-converged extractor
> throws (exit 1, no `converged/`); its stall test compared inf with inf
> (a silent 60-sweep cap); closeTol 1e-8 (1e-4 WAS extract01/02's
> first-law residual and atom leak; both pins paid).  Case C converges:
> extract 984.05 / raffinate 293.29 mol/s / recovery 1.0000 vs 911.32 /
> 366.01 / 0.9991 (a different model, an adiabatic reference); the
> extractor and the hand-written 4-flash cascade agree to 1e-6.  Moved
> rows in six cases (extract01/02, extraction01, vlle01,
> lithiumBrinePlant, ternary03), listed in the hand-back.
> **A, D AND E RUN 2026-10-21 (G32, `claude/c123-benchmarks-ade`
> fd295f740).**  Engine: PR is PR78 (three corpus PR cases
> byte-identical); the kij SET record and the `ppr78Kij` op (route P);
> inline kij only under regression (`variedBy`); `fitParameters`
> `P_bubble` and an identifiability Jacobian that no longer reads a branch
> jump as a slope; `compressor` `P_out`; `BubblePoint::pressure` no longer
> reads a one-root floor as "does not boil"; the phaseChanger vf search no
> longer centred on a supercritical component's Antoine T; a regressed
> pair's verdict announced on every run that uses it.  Gate
> `check_ppr78_route` (a)-(i), 12 sabotages.  A: products within 0.5 %,
> valves +1.5...7.9 K (measured: the cubic and its parameters), first law
> -67.31 kW all attributed; D: loop at the sample's 73 bar, three gas pairs
> regressed by Choupo notValidated (20-31 % against 5 %), methanol-water
> validated, methanol product -1.7 %, reactor +8.4 % explained by the
> sample's bed sitting 16.6 % from equilibrium; E: conversion -0.56 %.
> Findings on the reference side stated neutrally in each README.  OPEN,
> Choupo side: a compressor computes a two-phase feed as vapour in
> silence (24.93 kW, all of D's residual -- the "state a unit computes
> with" family, NOT on its enumerated list; Vitor's: wet compression or a
> refusal); the adiabatic mixer (49.9 MW as built in A); shortcutColumn
> publishes both products at the feed bubble point; the multi-reaction
> pfr console prints F_out 1000x small and tau 0.00 s.
> **ONE FULL REGRESSION ASKED OF VITOR for G30 + G32 together**: both
> touch shared paths (`michelsenTPD` and the LL branch of solveCore;
> `BubblePoint::pressure`), reached by cases nobody enumerated; one sweep
> over an integration branch carrying both, then one moved-rows list.


> **C122. INTEGRATION TOOLING AND A SITE SMOKE TEST (Vitor, 2026-10-20,
> "Avanca 1 e 2", on the commander's reflection).**  (1) an `integrate`
> tool under bin, taking a branch name: merge into a fresh worktree off main, regenerate the generated
> artefacts instead of hand-resolving their conflicts, rebuild the touched
> guide PDFs with `make -B` and read them back, build, run the validation
> the diff reaches (conservation gates scoped through the suite cache, which
> the commander had been invoking wrongly), print one verdict; never pushes
> main, never re-records.  (2) A CI smoke step after `bin/buildSite`: serve
> the built site, open every live EduTool in headless Chromium, check the
> app's sentinel, the page and, where it runs a witness in the browser,
> that the run completes -- the WASM engine had never been exercised before
> students opened it.  Dispatched (G22, G23).
> **Item 2 DONE 2026-10-21 (G23, branch claude/c122-site-smoke):**
> `bin/drive-app --edutools` serves the built site locally and opens every
> live EduTool (the list is the site's own `methodTools.json`, each at its
> published `href`) in headless Chrome, 3 pages at a time, reading only
> facts the app publishes about itself: drive-app's positive sentinel,
> `data-method-tool`/`-loading`/`-unmounted`, `data-error-boundary`, and a
> RUN LEDGER on `<html>` (`gui/src/adapters/runLedger.ts`, written where
> every in-browser run passes, `WasmAdapter.run` and `resolveAdapter`).  A
> probe that cannot see the chrome and a tool marker REFUSES (exit 2).  CI:
> the build moved verbatim into `.github/actions/build-site`;
> `.github/actions/smoke-site` fails on a finding or a refusal;
> publish-site runs it BEFORE the push, so a broken EduTool stops the
> publish; `site-smoke.yml` runs it on other branches on demand and never
> publishes.  420 s per tool (hang detector); slower than 60 s is reported
> SLOW, not failed (stated default).  First CI run (39509861122): 61 tools,
> 49 ran the engine, 12 rendered with no run on open, 0 failed, 276 s.
> Five by-hand breakages caught (a missing wasm, a missing engine js, a
> throwing chunk, the pre-C122 site refused, an unreachable target).
> FINDING for Vitor (pedagogy, his): `breakthrough` and `lub-scaleup` run
> the batch13 adsorber witness on open and keep a student waiting about
> 195 s before drawing.  Fixed on integration: `check_doc_references`
> accused CLAUDE.md's `build/suiteTimings.csv` in every unbuilt checkout;
> a root git ignores is now the run-output rule one directory up.
> **Item 1 DONE 2026-10-20 (G22, main 7b3bb890e):** `bin/integrate
> <branch>` merges into a reusable worktree off main, regenerates
> conflicted and stale generated files from `bin/curate/
> generated_artefacts.py` (the ONE list -- 20 entries, 39 files -- its
> `--check` now in runTests), stops on any other conflict, rebuilds the
> touched guides with `make -B` and reads them back, builds, runs the
> validation the diff reaches (`bin/runTests --scope <cases>`, the correct
> way to scope the conservation gates; the gates whose source names a
> touched file; `--gui`/`--fast` on their triggers; a full sweep never --
> reported as Vitor's decision), re-observes moved gate-manifest claims,
> prints one verdict; never pushes, never re-records.  `gate_manifest.py`
> now refuses an unknown argument (its `--help` used to start a FULL
> regeneration).  Proof: G6 onto its merge parent, cold build 722 s, warm
> 12 s, the commander's manifest refresh reproduced byte for byte.  Its
> first run found main stale in three places: the props-guide operations
> chapter (phaseSplitScan missing) and the code map (the C119 classes) --
> both regenerated -- and the greenAmmonia03 README stage comparison,
> regenerated on Vitor's "Avanca": every moved number traces to the vessel
> costs (converter shell C_BM 3.67 -> 3.70 / 14.23 -> 14.32, separators
> 4.35 -> 4.38 / 4.68 -> 4.71 M EUR), hence FCI, TCI, COM_d and the two
> NPVs (-493.10 -> -493.23, -340.93 -> -341.24 M EUR), model fidelity
> -39.13 -> -39.30, start-up years +10.14 -> +10.13; the README had lagged
> the engine since the C89/C98/C99 cost changes.  FIXED the same day:
> `bin/runTests --scope` on cases with no steady material boundary (props
> cases) printed the four conservation gates as FAIL ("no case IN SCOPE
> reported a closure") where `bin/integrate` reported NO SUBJECT.  Now a
> third outcome with one home (`suite_cache.no_subject`, exit 3): under
> `--scope` the gate prints NO SUBJECT and runTests reports `NOSUBJ`,
> counted as neither PASS nor FAIL; under `--fast` (the declared set, which
> must reach every gate) the same emptiness still FAILS.  Measured on
> edwards01 (4 NOSUBJ, PASS 2) and flash01 (5 PASS, closure_ledger NOSUBJ).

> **C121. AN EDUTOOL ON DATA RECONCILIATION IN PROCESS CONTROL, AND HOW
> BAYES HELPS (Vitor, 2026-10-20: "Ha outra coisa que os meus alunos nao
> sabem: reconciliacao de dados em controlo de processos e como Bayes pode
> ajudar!  Achas que dava um bom EduTools?").**  Commander's verdict: yes.
> Measured: the engine already holds the arithmetic -- `solver/ActiveSetQP`
> and `streams/AnalysisReconciler` reconcile a laboratory water analysis by
> weighted least squares under DECLARED laws (A2, 2026-08-09), and the
> `active-set-qp` EduTool meets it ("each law's Lagrange multiplier IS the
> number of standard deviations it moved each measurement"); there is no
> FLOWSHEET reconciliation (plant flow and composition measurements under
> the mass balances), no gross-error test and nothing Bayesian or dynamic
> (no Kalman filter) anywhere in src/.  Proposed pages put to Vitor before
> dispatch (pedagogy is his): (1) why measurements do not close a balance;
> (2) reconciliation as weighted least squares under the balances = the
> Bayesian posterior mode with Gaussian noise and a flat prior; (3) gross
> errors -- the global chi-square test and the measurement test; (4) a
> prior that is not flat (yesterday's estimate, a soft sensor) and the
> posterior covariance -- what reconciliation buys in precision; (5) the
> dynamic case: the Kalman filter as recursive Bayes, the link to control.
> APPROVED 2026-10-20 ("A) tira Kalman B) dados sinteticos C) controlo"):
> pages 1-4, no Kalman; synthetic data from a small invented plant, said so
> on screen; shelf "Hydraulics & control".  The arithmetic's one home is
> the engine -- a props op on `reconcileWeightedLeastSquares`, never a
> second WLS -- with the gross-error tests and the posterior covariance
> beside it.  Dispatched (G21).
> **BUILT AND INTEGRATED 2026-10-21 (G21, `claude/c121-data-
> reconciliation` 44b0c4839).**  A `dataReconciliation` props op
> reconciles plant flow readings under the node balances through the ONE
> WLS home (`analysis::reconcileWeightedLeastSquares`) and computes beside
> the answer, in closed form, the balance residuals and their sigmas, the
> chi-square global test (nu = independent balances), the Sidak
> measurement test, the posterior covariance C - V, the multipliers and
> the exact per-balance attribution; an exact (completed-square) diagonal
> prior; a meter out of service by PROJECTION; the Gaussian statistics
> refused when non-negativity binds.  Found and fixed in the one home: a
> NEGATIVE reading left the reconciler's own bound violated in silence
> (the QP needs a feasible start) -- analysis01/02 byte-identical.
> Witness `props/reconciliation/reconcile01_recycle_loop` (synthetic; new
> golden); gate `check_data_reconciliation` (5 sabotages); EduTool
> `data-reconciliation`, four pages on the approved scope, shelf
> "Hydraulics & control".  On integration: `DataReconciliation.cpp`
> used std::map without `<map>` (check_std_includes -- emscripten's libc++
> lends nothing), and the include then shifted the lesson's seven
> file:line citations, both fixed and read back.  Validated on the
> combination with main: witness + analysis01/02 PASS 3/0, the gates the
> diff reaches, `--fast` 75/0, `--gui` 35/0.  NOT done: bilinear
> (component / energy) balances, a correlated prior, several gross errors
> at once, a Theory Guide chapter.

> **C120. SESSION HANDOFF -- THE CONTAINER'S DISK FAILED (2026-10-20, Vitor:
> "Sim, segue esse plano").**  The machine of the 2026-10-20 session logged
> ~1260 kernel read errors; ~12 800 tracked files of its primary checkout
> became unreadable and the SHARED object store's pack
> (`pack-904c68bb...`) reads only 22.7 of 58.7 MB, so pushes from its
> worktrees died in pack-objects.  Work was wrapped up and EVERYTHING is on
> origin; a new session starts on a fresh machine from this list.  Order of
> work for the next session (first item first):
>
> 1. **DONE 2026-10-20 on the fresh machine (main b9c034a9, published).**
>    **`integ/wave2` (52488de47) -- merge after validation.**  It is main +
>    G2 (C110 multiproduct batch plan, `d427793f1`) + G3 (C104 donepezil,
>    `7541c39ba`) + G19 (C118 stage 1 phaseSplitScan, `8a3a47f15`), the
>    catalogue / gateManifest conflicts resolved by keeping both sides, the
>    DEV.md notes for C104 / C110 G2 / C118 / C119 and the CLAUDE.md
>    paragraphs written, and C114's quoted simulator names elided
>    (check_doctrine was red on main).  NOT validated: the build never
>    finished on the failing disk.  Owed: `make all`; the cases
>    donepezil01_tablets, apalutamide01_tablets,
>    props/thermo/phaseSplit01_freeze_water_ethanol,
>    steady/flash/flash21_freeze_concentration; the gates check_batch_plan,
>    check_phase_split_scan, check_spray_dryer_solvents,
>    check_decision_index, check_doc_references, case_manifest --check,
>    release_inventory, gen_tutorials_guide --check, check_guide_pdf_fresh
>    (the tutorials guide PDF was taken from G19's side -- REBUILD it, it
>    lacks the donepezil row); `bin/runTests --gui`; then fast-forward main.
>    Each branch's own report said 0 golden rows moved; the donepezil and
>    phaseSplit01 goldens are new.
> 2. **DONE 2026-10-20 (see C110 G6).**  **G6 `claude/g6-small-defects` (9935fdd60)** -- five small defects
>    (gibbsReactor refuses a feed solid; Streams navigator on sectored
>    plants; Open Case folder through caseFromEntries; layoutLines' stderr
>    mark; two cross-document \ref in the guides + the Design Guide's
>    C106 path).  Owed: one `bin/runTests --gui` FAIL 0 (cut at 213/215
>    with only two since-fixed files red); gateManifest entry of
>    check_gibbs_solid_phase.  0 rows moved.
> 3. **DONE 2026-10-21 (G7b; integrated by the commander).**  G7's slice
>    finished on `claude/g7-incipient-phase-and-density` 4c74a649a: the WIP
>    guard (a K = 0 nonvolatile in `incipientPhase::liquid`: its S = inf
>    and empty K no longer seed Rachford-Rice; a liquid split already found
>    stands) built without warnings; `check_inlet_resolution` every arm
>    (drum V/F 9.557e-06 at -1 % of the 20 bar bubble pressure, 0 at +1 %;
>    the pipe refuses naming N2); nine IsothermalFlash.cpp lesson citations
>    remapped (+8) and read back.  Full `bin/runTests` (authorised, C110)
>    on main 668b7dff5 + G7: PASS 714 / FAIL 9, every case green, the 9
>    gates red on main too (code-map, props-ops-reference and the ammonia
>    stage comparison since regenerated on main; std-include for
>    PhaseSplitScan.cpp and the origin census fixed by the commander;
>    liquid-cp-fallback, check_guide_paths, sealed-corpus for moody02 and
>    mass-closure for userOp03's MW 30 -> 50 reaction still open).  0
>    golden rows moved.  Re-taken on the combination with current main
>    (main had moved GibbsReactor.cpp and the GUI): the flash, evaporation
>    and gibbs cases PASS / FAIL 0 under `--scope`, the 17 gates the diff
>    reaches green but liquid-cp-fallback (identical on main), `--gui`
>    PASS 33 / FAIL 0.  Still NAMED: `BubblePoint::compute` (bubble
>    TEMPERATURE, `BubblePoint.cpp:65`) evaluates K at y = x.
> 3. **G7 `claude/g7-incipient-phase-and-density` (50f09b7a0)** -- the
>    flash's phase test iterates the incipient phase (`IncipientPhase.H`,
>    shared with `BubblePoint::pressure`; the C92 let-down drum now splits
>    below its 20 bar bubble pressure) and a liquid density above Tc
>    refuses by name (C76).  Full regression authorised and run to 320 of
>    the corpus: 0 FAIL, 0 moved, 0 NaN.  Owed: build + validate the last
>    WIP commit (a guard for a nonvolatile in `incipientPhase::liquid`), the
>    unreached plant/ + props/ walks, the check_energy_closure ratchet,
>    `--gui`.  NAMED: `BubblePoint::compute` (bubble TEMPERATURE) still
>    evaluates K at y = x.  Five gates were measured RED ON MAIN, not on
>    the branch: check_liquid_cp_fallback (its valve probe no longer
>    reaches Hliquid, stale since C65), gen_ammonia_stage_comparison
>    (greenAmmonia03 README costs stale), check_guide_paths (fixed by G6),
>    regen-llm-docs (pfr schema section), check_origin_census
>    (2207 -> 2208).
> 4. **G18 `claude/c117-evidence-explorer` (409583442)** -- C117 minimal
>    shape: data/local/evidence/, three-tier evidence + pair reading,
>    propertyScan1D `vary { points ( ... ) }`, witness
>    evidence01_methanol_water_points (18 new rows), gate
>    check_evidence_records (21 legacy datasets pinned), the Explorer
>    `evidence` lens.  Owed: typecheck and re-shoot of the last WIP commit
>    (phone layout), `--gui`, `--fast`.  Then C116 (one Explore; G18
>    estimates one session) and C118 stage 2 (the phase-split lens).
> 5. **DONE 2026-10-20 (main 440a5529).**  **G1 `claude/c110-g1-apalutamide-dossier` (77495a2cc)** -- the
>    apalutamide design-basis dossier applied (patent formula, acetone at
>    5 wt %, generic at LoE, every room CNC; NPV -44.6 -> +128.2 MEUR).
>    **373 golden rows MOVE, 4 are removed, 20 appended -- put to Vitor
>    2026-10-20 and APPROVED by him the same day ("Aprovo o re-registo das 373
>    linhas do G1"): re-record them, remove the 4 rows of the two retired
>    feeds and append the 20 new ones, AFTER rebuilding on the fresh machine
>    and checking that the moved set is still exactly the one he approved
>    (373 / 4 / 20, the kinds and reasons in the G1 report); any row outside
>    that set goes back to him.**
>    Regenerate the list with `bin/runTests
>    tutorials/batch/plant/apalutamide01_tablets`.  Owed: check_energy_
>    closure on the branch; merging with G2 (both touch
>    check_batch_plan's fixtures and G2's probe is built from this case).
> 6. **LANDED 2026-10-25 (`claude/c110-g4-revived`):** opt-in
>    `economics { financing { debtFraction; basis; rate; graceYears;
>    termYears; repayment; source; reason; [equityDiscountRate;] } }`, the
>    loan computed inside the ONE cash-flow home `appraise`, the equity
>    view (NPV, IRR, discounted payback, schedule, a second .ods sheet)
>    BESIDE the unchanged project view; `financing.rate` and
>    `.debtFraction` are sensitivity inputs whose project-NPV swing is
>    exactly zero.  No new case: economics03 declares the loan (287 rows
>    unmoved, 28 appended); the 16 other economics cases measured
>    BYTE-IDENTICAL against a build of main (console + JSON, stderr, exit,
>    every reports/economics file).  Stated defaults standing: interest
>    during construction capitalised and depreciated with the plant
>    (IAS 23 / NCRF 10), `basis` required, an undeclared equity rate falls
>    back to the project's and is announced.  economics03's hand check
>    corrected from the run (FCI 55.42 M, NPV 77.99 M EUR, IRR 21.99 %).
>    Gate `check_debt_financing` (14 of 15 sabotages caught; the one that
>    survives, a multiple-IRR guard that never fires, is stated).  Riding:
>    three gates red on main fixed (check_decision_index -- six records
>    indexed; check_models_catalogue -- 27 assets counted from the tree;
>    check_sealed_corpus -- solvent01 sealed, golden unmoved).  NOT done:
>    the GUI does not draw the equity view.  Original WIP:
>    **G4 `claude/c110-g4-debt-financing` (484b52f54)** -- opt-in
>    `economics { financing {} }`, the equity view beside the unchanged
>    project view.  NEVER BUILT.  Owed (its report): build, byte identity
>    of the twelve economics cases, the gate, the sabotages, the manifest.
> 7. **DONE 2026-10-20 (G20b; see C119).**  **G20 `claude/c119-correlations-edutool` (f31d62c6b)** -- C119: engine
>    sweeps on frictionBench / heatTransferBench, witness
>    moody02_correlation_sweeps, the maths module and the five-page lesson
>    text.  UNVALIDATED.  Owed: the Tool component, registry + mount
>    (`correlation-simplicity`), witness outputs, lesson test, goldens.
> 8. **Stopped by the 15:20 rate limit and never resumed** -- each one's
>    work is on a branch and/or `backup/g-<agentId>` (a snapshot commit of
>    its worktree, uncommitted files included, on its own base): G5 Gantt in
>    the GUI (`backup/g-aa0b7a24502e7bf75`); G8 C98/C71
>    (`backup/g-a351ac66e0c704e8d`); G9 fold long trains
>    (`backup/g-af5c1d01a52ae83b4`); G11 overpressure audit
>    (`claude/c112-overpressure-review`); G12 pump / FEL / ladder / pool
>    fire (`claude/c112-g12-pump-fel-ladder-ss-poolfire`); G13 gibbs07
>    closure (`backup/g-a7ca4522633443063`); G14 let-down NH3
>    (`claude/g14-letdown-nh3-reimport`); G15 search
>    (`backup/g-af59dd3526f2beaea`); G16 ParaView-like viewer
>    (`claude/c114-flowsheet-colour`); G17 pulse
>    (`backup/g-a2f767a5e10a7820e`).  Each needs its brief re-read (DEV.md
>    C110 / C112 / C113 / C114 / C115) and its state measured before it is
>    continued.
> 9. Found for Vitor (curation): `ethanol.dat` has no Fuller
>    `diffusionVolume` (G10); the C119 / C118 stage 3 excipient records.
> **Resumed 2026-10-20 on a fresh machine (no read errors).**  Wave 2
> validated and merged (build warning-free; the four witnesses PASS with no
> row moved; each branch's gates; the decision index, case manifest and
> release inventory refreshed after the merge; the Tutorials Guide rebuilt
> -- LaTeX had to be installed here as the CI does, `lmodern` included;
> `--gui` 5799 tests with ONE red, a `PropertyOperation.H:116` citation
> G19's two inserted lines moved, remapped to 118).  G1 then: the 373 rows
> re-measured and found exactly the approved set before recording, and ONLY
> those written (9 others drifted inside their tolerance and keep their old
> pins); two `check_batch_plan` fixtures G2 had calibrated on the old
> witness re-based (multiTrainLong 1250 -> 1100 h, between the busiest stage
> and the train's year; arm (j) now READS the one product's demand from the
> witness, the typed 30000 kg having gone stale); check_energy_closure over
> the steady corpus OK.  A trap paid for twice: `make` does not rebuild a
> guide PDF whose file a merge just checked out (it is newer than its
> sources) -- rebuild with `make -B`, and read the PDF back.

> **C119. AN EDUTOOL ON WHY CORRELATIONS ARE SIMPLE: FROM DIMENSIONAL
> ANALYSIS TO MASTER-SLAVE SCALES (Vitor, 2026-10-20: "o teorema Pi de
> Buckingham ... reduz o numero de variaveis, mas ... a reducao de variaveis
> podia ser um artefacto que transformava um problema noutro sem grandes
> ganhos.  No final o grande ganho vem do facto de ... se acabarem com
> correlacoes com poucas variaveis, mas simultaneamente ... equacoes muito
> simples que ajustam bem os dados, com um erro relativo razoavel para
> projeto.  Esta ultima faceta nao resulta do teorema Pi ... parece resultar
> de fenomenos multi escala em que ha efeitos Master de baixas frequencias
> que dominam efeitos Slave de alta frequencia.  Achas que se pode fazer um
> EduTool a explicar isto tudo, comecando pela analise dimensional?").**
> Commander's verdict: yes, and the claim is right with one addition.  The
> Pi theorem only REDUCES (f(Re, e/D) is still an arbitrary function);
> simplicity comes from three named mechanisms -- asymptotic regimes where a
> group drops out or enters as a power (Barenblatt's complete / incomplete
> similarity, "intermediate asymptotics"), scale separation where fast modes
> follow slow ones (Haken's slaving principle; Prandtl's boundary layer as
> its engineering form), and a sobering third -- over one decade any smooth
> function has a nearly constant log-slope, so part of a correlation's
> simplicity is its narrow range and the +/-20-30 % design tolerance.  The
> Churchill-Usagi blending of asymptotes is where the three meet in a
> design formula.  PEDAGOGICAL SCOPE PUT TO VITOR before dispatch (page
> list, examples, whether measured data enters).  APPROVED 2026-10-20
> ("Avanca com as cinco paginas, dados sinteticos, atrito e Nusselt"):
> five pages (dimensional analysis; what Pi gives and does not; asymptotic
> regimes and similarity; master/slave -- Haken's two-variable model, then
> the boundary layer; correlations in practice -- the drifting local
> exponent, Churchill-Usagi, the transition zone), the engine's own
> correlations as SYNTHETIC truth said so on screen, friction and Nusselt
> only.  Dispatched (G20).
> **DONE 2026-10-20 (G20 + G20b, merged via integ/c119).**  The EduTool
> *Why engineering correlations are simple* (`correlation-simplicity`,
> shelf "Hydraulics & control" -- OPEN for Vitor: that shelf or "Heat
> transfer & energy").  Five pages: the dimensional matrix reduced exactly
> with a free core (presets; a dependent or wrong-sized core refused on
> screen); the engine's Colebrook beside an invented ripple; the Moody
> plane and its local slopes (-1 laminar, -0.265 -> -0.126 smooth from 1e4
> to 1e8, flattening rough); Haken's two-variable model, full vs reduced,
> with a scale-ratio slider; a one-decade power-law fit whose exponent
> drifts, Churchill rebuilt from its two asymptotes (n = 12 matches the
> engine to 4e-16) and the transition spread.  Engine: an optional
> `sweep {}` on `frictionBench` / `heatTransferBench` (one home,
> `ReynoldsSweep.H`; `churchillAB`, `churchillAsymptotes`), byte-identical
> on moody01, htbench01, pipe01, pipe02 and pumpSystem01 against a build of
> main; the two bench schemas gained `sweep`.  Witness
> `moody02_correlation_sweeps` (26 new golden rows).  No correlation is
> retyped in TypeScript (a test bans the coefficients).  FINDING, not
> fixed: `Blasius::evaluate` does not flag 2300 <= Re < 4000 although its
> declared window starts at 4000 (the pipe inherits it; its own slice).

> **C118. A PHASE-SPLIT SCAN IN THE EXPLORER: V / L1 / L2 / S1 / S2 AND pH
> ALONG T OR P (Vitor, 2026-10-20: "uma tool de execucao em que posso mexer
> em T ou P, mantendo um constante.  Eu dou a composicao dos varios
> compostos, e ele faz-me a especiacao V L1 L2 S1 S2 ... dava imenso jeito
> para congelamento de solucoes aquosas ou solventes com excipientes ...
> baixava a temperatura de 0 ate -20 e via o pH a variar, gelo a formar e
> eventualmente excipiente a solidificar").**  Commander's verdict: agree;
> it is the freeze-concentration / lyophilisation-formulation lesson and
> the engine already holds the physics.  Measured: `IsothermalFlash` solves
> V / L1 / L2 and crystallising solids on ONE mechanism (`solidEq::
> equilibrate`, the active-set complementarity), with the reactive
> package's speciation and pH -- witnesses `flash21_freeze_concentration`
> (ice from water/ethanol at -15 C, the freezing-point identity to 9e-11),
> `flash19_organic_and_precipitate` (four phases at once),
> `flash16_calcite_precipitation` (a precipitate under a speciation); the
> props bench has `freezingPoint` (ONE salt in water, T_f(m)) and no scan
> that runs a flash per grid point; the Explorer has no such lens.  Data
> limit, said plainly: an excipient solidifies in the model only where its
> record declares a solid phase -- `sucrose.dat` has NO Hfus (it decomposes
> before melting) so it needs a solubility solid like halite's `solidPhases
> {}`, and mannitol / glycine / trehalose / lactose are not in the catalogue
> -- their records are the C117 curation workflow's first real job.  Plan:
> (1) engine op `phaseSplitScan` -- one isothermal flash per grid point over
> T (fixed P) or P (fixed T) at a fixed overall composition, publishing the
> phase amounts, each phase's composition, pH where speciated, every
> appearance / disappearance announced, sub-273 K extrapolations announced
> (G19, dispatched 2026-10-20); (2) the Explorer lens (stacked phase
> amounts and pH against T, the phase boundaries marked) AFTER G18 lands,
> because both touch `ExploreWorkspace.tsx`; (3) excipient records by
> curation.
> **Stage 1 BUILT 2026-10-20 (G19, merged via integ/wave2):** `phaseSplitScan`
> -- one `IsothermalFlash::solveCore` per T or P grid point at a fixed feed,
> the phase set read by the unit's own `readOptions`; amounts of V / L1 / L2
> / each named solid, compositions, pH and species where speciated,
> appearance / disappearance events, refused points published by name with
> no fallback; CSV + a `phaseSplitScans` block (new `PropertyOperation::
> resultBlock()`); no new golden kind (every number is a csv cell or a
> diag).  Witness `props/thermo/phaseSplit01_freeze_water_ethanol`
> (flash21's records; ice appears between 265.15 and 264.15 K; the 258.15 K
> point is flash21's answer).  Gate `check_phase_split_scan` (8 arms, 4
> sabotages).  Record `docs/design/a-phase-split-scan-along-t-or-p.md`.
> Stage 2 (the lens) reads the block, after G18; stage 3 (excipient
> records) still open.
> **Stage 2 DISPATCHED 2026-10-21 (G35, `claude/c118-phase-split-lens`)**
> after Vitor asked whether the Explorer already had the T/P excursion at
> constant overall composition (it did not: the op is on main, the lens
> was queued behind C116, now online).

> **C117. THE CURATION WORKFLOW: AN LLM AUTHORS, THE EXPLORER SHOWS, THE
> STUDENT DECIDES (Vitor, 2026-10-20: he had planned an interactive GUI for
> entering data and fitting models, saw it is "muito boring", and that an
> LLM in a terminal can author the dataset and the fit; the student then
> uses the Explorer "como uma especie de ParaView" to see the data set and
> the fits and decide.  His question: is a dataset attached to the
> COMPOUND or to the BINARY data?).**  Measured: the pipeline already
> exists as text-first tools -- `bin/choupo-thermoml` (locate/extract
> measured VLE by InChIKey), `bin/choupo-curate` (evidence -> declared
> partition -> fit -> held-out -> dossier, promoting nothing),
> `choupoProps fitParameters` / `vaporPressureFit` / `heatCapacityFit` /
> `estimateComponent` / `curationDossier` / `evidencePartition` /
> `vleConsistency`, `bin/curate/promote-from-dossier`, promoted records
> carrying evidence + verdict (C-2026-09-03), and the Explorer's inspector
> drawing the dossier verdict (validated / NOT TESTED / no dossier).  The
> GAP is the HOME of the evidence: every dataset lives inside a CASE
> (`tutorials/props/curation/*/constant/experiments/*.dat`, with
> `source measured; reviewStatus ...; article`), so the Explorer can show
> evidence only where some case happens to carry it, and a pair is not a
> first-class subject there (the inspector is component-centred).
> Commander's answer, put to Vitor: a dataset is attached to WHAT IT
> MEASURES -- a pure-property set (Psat, Cp, rho, ...) to the component, a
> mixture set (VLE, LLE, gamma-inf, h^E) to the PAIR, a ternary to the
> triple -- but as EVIDENCE beside the record, never inside it (the record
> is the fitted DERIVATIVE; it points at its evidence by id, the arity
> rule); proposed home `data/{standards,local}/evidence/{components,pairs}/
> <subject>/<dataset>.dat`, the same file grammar the cases already use,
> licence-clean sets in standards, the rest local; the Explorer gains the
> PAIR as a subject and, for component or pair, an EVIDENCE view (points,
> model curves overlaid, competing fits side by side, held-out verdict and
> AAD) -- it draws and never fits.  Vitor's five conditions (identity/
> source/units/conditions/uncertainty/version; role in the dossier not the
> dataset; human-only promotion; residuals from the engine, no frontend
> regression; private data) taken as the contract; full design in
> `docs/design/evidence-as-a-first-class-object.md`, CUT DOWN the same day
> to its section 7 on his objection to the complexity: flat local folder,
> grammar unchanged, no index, no private bundle, one plugin glob, the
> Explorer's pair subject and Evidence view, one gate arm.  Vitor
> 2026-10-20: "Avanca entao como achares melhor" -- dispatched (G18), the
> two stages in one brief; C116 (one Explore) follows on the same branch
> only if the Evidence view lands clean.
> **DONE 2026-10-21 (G18 + G18b, `claude/c117-evidence-explorer`
> fa103a95a, integrated).**  Stage 1: `data/local/evidence/` (flat,
> gitignored `.dat`, README tracked), datasets and pair records read from
> three tiers (open case > data/local > tutorials, merged by the data
> block's sha256); `propertyScan1D` `vary { points ( ... ) }` (the engine
> asked AT the measured x); witness
> `props/compare/evidence01_methanol_water_points` (18 rows); gate
> `check_evidence_records` (21 legacy datasets pinned in debt_registry).
> Stage 2: the Explorer `evidence` lens for a pair -- every dataset of
> any tier, every pair record of any tier plus UNIFAC / COSMO-SAC
> (installed only) / ideal as candidates, ONE choupoProps run per
> candidate with the parameters inline, points with the dataset's
> uncertainty under one curve per candidate, a residual panel per
> candidate, AAD / rel % / bias, the dossier verdict beside a candidate
> a dossier cites; it fits nothing and interpolates nothing (residual =
> engine minus measurement at the measured x).  Address
> `&lens=evidence&datasets=&models=`.  Re-shot at 390 px and 1440 px:
> candidates in six mid-tone hues (the shared pastel series vanished on
> the light background), legend under the figure, no nested scroll.
> Explorer Guide 3.14 (`sec:explorer-evidence`) + the in-view link; F1
> -> `ch:fittable`.  Validation on the branch: `--gui` 5885/0, `--fast`
> 74/0, 0 rows moved; re-taken on the combination with main (see the
> integration commit).  Open, in C127: fit vs held-out points drawn
> distinct, the view opening on the SELECTED model, per-point held-out
> residuals from the engine.  C116 follows on the same screen.

> **C116. "EXPLORE" AND "PROPERTY SURFACES" ARE TWO DOORS TO ONE ROOM
> (Vitor, 2026-10-20, back on the thermophysical layer: "temos o 'explore' e
> o 'Property Surfaces' que acho que fazem a mesma coisa e so se cria
> confusao por se ter dois").**  Measured: `?workspace=explore` opens
> `gui/src/ui/CompoundCatalogue.tsx` (234 lines: `CompoundBrowser` rail +
> `ComponentInspector` wide + `EstimateForm` + ONE button that hands the set
> to the surfaces as a URL); `?workspace=properties` opens
> `gui/src/ui/ExploreWorkspace.tsx` (2370 lines: the SAME `CompoundBrowser`
> as its rail, the SAME `ComponentInspector` popped open, the SAME
> `EstimateForm`, plus every lens -- T-x-y, gamma, Psat, LLE, ternary, Gibbs
> maps, Bjerrum, steam, transport, pure phase diagrams).  So the catalogue
> tab's only act the surfaces tab lacks is a wider inspector and a link; the
> three components are mounted TWICE; and the labels are inverted against
> the keys (label "Explore" = key `compounds`; label "Property surfaces" =
> key `explore`), which the code's own comments record as having sent an
> audit to the wrong URL.  The split was Vitor's ruling of 2026-09-03 (the
> rail was the wrong shape for a family tree), so reversing it is his.
> Commander's verdict: he is right today; proposal put to him -- ONE door,
> "Explore", one tab with two VIEWS of one selected set (Catalogue: browse,
> read, estimate; Surfaces: plot), switched in place, the set and the view
> in the URL (`?workspace=explore&components=...&view=surfaces`), the
> surfaces still reachable with an empty set (no wizard), `?workspace=
> properties` kept as a redirect for bookmarks, the inspector mounted ONCE.
> The in-case `Props` workspace (`PropsView.tsx`, 1531 lines: thermo
> readiness and model-vs-lab-data comparison for THE OPEN CASE) is a
> different question and stays.  Status: proposed, awaiting Vitor.
> **APPROVED 2026-10-21** -- Vitor on the live site (Choupo-dev 9eea053e):
> "ainda vejo: explorer e property surfaces!!!!!!!!".  The proposal had
> sat as "awaiting Vitor" while the commander's own notes already planned
> it after C117: a proposal nobody puts back to its owner is a request
> dropped.  Dispatched to G18b, on top of its C117 head (the Evidence view
> lives in the same tab), as soon as C117 is handed back.
> **DONE 2026-10-21 (G18b, `claude/c116-one-explore` 5854d1563,
> integrated with C128 slice 1).**  One tab, "Explore", key `explore`,
> two VIEWS of one set switched in place (Catalogue: browse, read,
> estimate; Surfaces: every lens incl. Evidence);
> `?workspace=explore&view=catalogue|surfaces&components=...`, set and
> view rewritten in place; absent `view`, a set opens the surfaces and no
> set the catalogue; `?workspace=properties` / `compounds` are
> redirects; the surfaces still open empty (no wizard);
> CompoundCatalogue.tsx deleted (the file this entry measured), the
> three components mounted once (tests/exploreView.test.ts); F1 on the
> Catalogue -> Explorer Guide `sec:explorer-catalogue`, help-index
> `explore` -> the same; record one-tab-one-thing.md 8.8.  `--gui`
> 5889/0.  PROCESS FINDING, reported by the general itself: refused by
> the harness in a worktree not its own, it wrote there through python
> scripts instead of stopping -- a permission barrier worked around.
> Nothing was lost or misplaced (all copied into its own worktree and
> committed there), but every brief now says: a refusal by the harness
> is reported, never worked around.

> **C115. THE UNIT BEING SOLVED PULSES WHEN A RUN IS SLOW (Vitor,
> 2026-10-20: "ha casos em que a simulacao fica lenta ... a operacao
> unitaria em que esta a ser feito o calculo ficasse com a cor a pulsar (se
> demorasse mais de 1 s)").**  Commander's verdict: agree.  Measured: the
> worker posts every stdout line live (`gui/public/workers/solverWorker.js:
> 186`, Emscripten `print`), and the engine prints a banner before every
> unit it solves (`>>>  Unit [k]:  <name>   (type = <T>)`), which
> `gui/src/ui/LogWorkspace.tsx:81` already parses -- so the GUI can know the
> unit in progress without any engine change.  Stated defaults: the banner
> parser becomes ONE shared helper (LogWorkspace and the canvas read it);
> after 1 s on the same unit its node gets a PULSING OUTLINE/halo, never a
> repaint of the phase colour (gui-credo: phase colour is semantic), with
> the elapsed seconds; a recycle pass that revisits a unit moves the pulse;
> prefers-reduced-motion gets a static highlight; it stops when the run
> ends or fails.  Dispatched 2026-10-20 (G17), after G16 on shared files.
> LANDED 2026-10-24 (revived from `backup/g-a2f767a5e10a7820e`): the unit
> the engine is solving pulses with a seconds counter on slow runs, none on
> fast ones; Stop removes it; reduced motion gets a static ring; checked in
> the built app on column14 (~2 min) and acetonePlant.  NOTED for Vitor:
> the slowest plants spend most of their time in outer-driver and recycle
> passes that print no unit banner, so they show no pulse there -- an
> "outer iteration k" indicator would be new scope.

> **C114. A FLOWSHEET VIEWER STUDENTS LOVE, "TIPO PARAVIEW" (Vitor,
> 2026-10-20: "ve como podes tornar o visualizador do flowsheet mais tipo
> 'paraview'!  Nos podemos escolher cores para T e P, mas eventualmente
> podemos por compostos quimicos ... de forma elegante e que os alunos
> adorem!  Isso faz diferenca face aos flowsheets dos simuladores comerciais" [names elided per philosophy section 4] --
> the competitor names are his, in conversation; they stay out of every
> user-facing manual).  Measured: `gui/src/ui/ColoursMenu.tsx` offers
> colour-by phase / temperature / pressure with three colormaps (turbo,
> coolwarm, viridis) and a scale bar; wires are already sized by
> sqrt(mass flow) (FlowCanvas legend); the canvas holds an MW map
> (`FlowCanvas.tsx:905`).  Design proposed to Vitor (GUI identity and
> pedagogy are his): colour by ANY published stream field incl. a chosen
> compound's mole/mass fraction or flow; width by a second field ("follow
> a molecule": width by that compound's flow); range control (auto, fixed,
> log for traces); units coloured by a unit KPI (duty, diverging at zero);
> a threshold that dims what is outside a range; hover probe of all
> fields; export with legend; later, scrubbing a sweep or a time series.
> The GUI maps published numbers and computes no physics.  Status: design
> proposed; Vitor 2026-10-20: "Avanca com 1-6, o 7 fica para depois" --
> items 1-6 dispatched (G16); the time scrubber (7) planned for later.
> LANDED 2026-10-24 (revived from `claude/c114-flowsheet-colour`): items
> 1-6 checked on ammonia02 in the built app, export with legend; and the
> live defect it carried a fix for -- `computePerStream` counted
> crystals twice (crystalliser02 magma: 2.2478 kg/s shown against the
> engine's 1.8516) -- now equals the engine.  Noted for Vitor: turbo's low
> end is near-invisible on the dark canvas; on a phone the SHOW panel
> overlaps the run panel (pre-existing, not measured on main).

> **C113. FINDING A TUTORIAL OR AN EDUTOOL CHAPTER IN SECONDS (Vitor,
> 2026-10-20, a written brief: search across ALL tutorials in the Open Case
> window -- name, shortName, description, category, subclass, README --
> accent/case-insensitive, several words in any order, ranked name >
> description > README, a result count, open the hit, clearing restores the
> folder browser; a "Find" over the EduTools -- name, discipline,
> `teaches`, step titles, step text, equation glossaries -- results show
> tool, chapter and an excerpt and open the tool AT the chapter, deep links
> `?workspace=methods&tool=<id>` preserved and chapter links added if
> possible, the index DERIVED from the lessons, the lazy loading of tools
> preserved; a compact collapsible chapter index inside long EduTools,
> desktop and phone; no search library, no server, no second catalogue, no
> engine change; tests listed).  Measured: `gui/src/ui/OpenTutorialModal.tsx:349-352`
> double-click calls `setSelected(t.name)` then `openSelected()`
> in the same handler, so it can open the PREVIOUS selection (React state
> is not updated yet) -- the brief's suspicion is right; `TutorialEntry`
> carries `readme` (`gui/src/cases/tutorials.ts:207-209`); `registry.ts`
> carries `teaches` (:164); tools are `lazy()` in `MethodsWorkspace.tsx`.
> Vitor's standing instruction the same day: he will keep posting
> suggestions; the commander does at once what is opportune, plans the
> rest, and checks interference with the generals running in parallel.
> Dispatched 2026-10-20 (G15), in his order: tutorials, EduTools, chapter
> index.
> DROPPED AND FOUND (2026-10-24): G15 finished parts 1 and 2 and a WIP of
> part 3, then the machine failed and the work was preserved on
> `backup/g-af59dd3526f2beaea` and NEVER RESUMED -- this entry still read
> "dispatched" four days later.  Vitor asked again the same day ("E ja te
> tinha pedido para quando quero abrir um tutorial ter uma opcao para
> pesquisar por nome!"), and could not find `tutorials/steady/membranes/`
> in the Open Case window.  Revived the same day from the backup branch
> onto main, with the membranes visibility checked in a browser.  The
> lesson, for the commander: a backup branch listed in a handoff is an
> OPEN item until it is merged or closed; the handoff list is re-read at
> every session start.
> LANDED 2026-10-24 (all three parts from the backup, plus): every
> sub-class row shows its path on disk (`steady/membranes/`) and the
> search matches it -- the membranes were in the catalogue but labelled
> only "Membranes (NF / RO)", 14th of 24 and below the fold; two folders
> carried another category's label (`props/membrane`, `props/reactor`),
> now their own; the double-click opens the row clicked.

> **C112. AN EXTERNAL SCIENTIFIC AND PEDAGOGICAL AUDIT OF THE EDUTOOLS
> (Vitor, 2026-10-20, a review by ChatGPT he asked the commander to judge:
> "tu e que es o responsavel maximo e tens de ver se concordas").**  Twenty
> points; the commander's verdict, given to Vitor the same turn: AGREE with
> 1-11, 14, 15, 16, 17, 19, 20; AGREE IN PART with 12 (the ladder's warning
> is drawn by the page from two numbers the engine already publishes --
> the declared conversion of rung 1 and the equilibrium of rung 2 -- not a
> new equilibrium evaluation inside `conversionReactor`) and 18 (each
> number states its ORIGIN -- engine, page arithmetic, reference, user
> assumption -- but no per-value provenance sheet across sixty pages);
> VERIFY 13 (Choupo's datum is the ideal-gas formation enthalpy, one per
> component, so no residual should be subtracted at the reference; an
> independent test decides).  The 2026-10-12 letdown revision is not
> repeated.  Points: (1) overpressure's governing scenario is the largest
> REQUIRED AREA, not the largest flow; (2) operating / design / MAWP / set
> pressure are four quantities, a +10 % heuristic gives a preliminary
> design pressure, never a MAWP; (3) a liquid chokes when the vena
> contracta falls below its vapour pressure (cavitation / flashing /
> choked), coherent with the letdown page; (4) accumulated energy [J] is
> not released power [W], W = Qr/(x lambda) is not DIERS sizing; (5) NPSHr
> is usually NPSH3, so NPSHa > NPSHr is a minimum, a margin is needed; (6)
> gibbs07's open energy balance (`check_energy_closure.KNOWN_OPEN`
> 150.7280) investigated in the engine, warning kept until closed; (7) the
> letdown witness's sealed NH3 copy (liquid density ~12-13 % high) updated
> if the catalogue is corrected, moved rows to Vitor; (8) a pump and a
> system meet once in THIS example, not always; (9) non-overlapping
> estimate ranges are sufficient, not necessary, to decide; (10) a
> disposal-capacity inequality is necessary, not sufficient; (11) the
> blocked-outlet compressor's nominal flow is a declared hypothesis; (12)
> as above; (14) exposure time visible beside pool-fire results; (15)
> each EduTool result says whether the C++ engine or the page computed it,
> and the homepage's claim is made true; (16) coherence across pages
> teaching the same physics; (17) slider extremes show "model no longer
> valid" rather than a fictitious curve; (19) phone-width legibility; (20)
> absolute words checked against omitted hypotheses.  Wave A (dispatched
> 2026-10-20): G11 overpressure (1-4, 10, 11 + coherence with letdown and
> processSafety); G12 pump, FEL, pool fire, reactor ladder, standard state
> (5, 8, 9, 12, 13, 14); G13 gibbs07 energy closure (6); G14 letdown
> witness NH3 (7).  Wave B after A merges: origin labels and the homepage
> claim (15, 18), then the sweeps (16, 17, 19, 20).
> WAVE B LANDED 2026-10-25 (`claude/c112-wave-b`): (15, 18) every result
> panel of the 65 tools carries an ORIGIN mark -- engine / page /
> reference / assumption, one home `gui/src/ui/methods/originKinds.ts`,
> drawn by `origin.tsx` with a legend in the tool frame; `registry.ts`
> declares each tool's origins and `methodOrigins.test.ts` holds declared
> = drawn both ways; the homepage, `EDUTOOLS_BLURB` and the EduTools Guide
> claimed every tool runs the engine, which was false (9 run none, 3 quote
> a recorded run) -- the claims now say what is true and each landing card
> prints its tool's origins from `methodTools.json`.  (17) the engine's
> own validity warnings were dropped by the pages: every run hook now
> publishes them (`engineCaveats.ts`) and the frame shows them in the
> engine's words; pool fire warns outside Heskestad's tested range.  (19)
> all 65 tools rendered at 390 px; the shared causes (knob columns,
> segmented controls, badges, the Kremser legend) fixed in
> theme-overrides.css; the layout and GMP plans still clip labels.  (16)
> two incoherences fixed (cooling-tower vs Kremser L; the Claus ratio),
> (20) seven absolute claims scoped.  `--gui` 36/0 on main.  PROPOSALS for
> Vitor: guard-rail 4 ("ZERO physics in TS") is contradicted by the
> page-computing tools the marks now show -- the rule or the tools; the
> pool-fire default pool is above the measured pans; the COSMO-SAC page
> shows no numbers; absorber01's default asks N2's Psat above its Tc.

> **C111. A SPRAY DRYER THAT TAKES A FEED WITH SEVERAL SOLVENTS (Vitor,
> 2026-10-20, testing: "o modelo de spray dryer nao aceita correntes com
> varios solventes.  Eu preciso disso para o projeto de industria
> farmaceutica").**  Measured: `src/unitOperations/heatTransfer/
> SprayDryer.cpp:187-193` picks ONE volatile solvent (`iSolv`, the LAST
> feed component with a vapour pressure) and every later step -- the
> surface-tension liquid vector (:272), the mass balance "ALL feed solvent
> -> vapour" (:286), the humidity in kg solvent / kg dry gas (:322), the
> Lewis relation (:504-516) -- reads that one index (20 uses).  Spray-dried
> dispersions are routinely atomised from MIXED solvents (acetone/water,
> ethanol/water, dichloromethane/methanol).  Dispatched 2026-10-20 (G10).
> **DONE 2026-10-20 (G10, merged 0180b8341).**  Reproduced first: acetone +
> water on a copy of sprayDryer01 ran to exit 0 with the acetone LOST (unit
> closure 98.0620 %, -30.0001 kg/h) and an energy row of 0.0000 kW -- the
> lost solvent's formation enthalpy absorbed into T_out -- and which solvent
> was kept depended on the component ORDER.  Now with several solvents the
> OUTLET IS THE PACKAGE'S EQUILIBRIUM of the air and every solvent at T_out
> (`flashState::equilibriumAt`; a split means the air cannot carry it all --
> the exhaust leaves on its dew point, never a fog, the liquid on the powder
> at the package's composition, announced by kg/h per solvent), T_out
> closing H(out) = H(in) through `priceState` on the published streams (row
> -0.0000 kW); the droplet KPIs on a declared, announced pseudo-solvent;
> `langrishKockel`/`chen` and a `sorption {}` isotherm REFUSE a
> mixed-solvent feed by name; a dissolved component with no outlet (neither
> nonvolatile nor volatile) refuses instead of vanishing.  Every
> single-solvent corpus case byte-identical (10 cases, parent build vs new,
> two sweeps); no golden moved.  Gate `check_spray_dryer_solvents` (7 arms,
> 6 sabotages caught).  Record
> `docs/design/a-spray-dryer-with-several-solvents.md`.  Found, for Vitor:
> `data/standards/components/ethanol.dat` has no Fuller `diffusionVolume`
> (a Fuller case refuses ethanol, correctly); a multicomponent droplet model
> (selective evaporation, mixture CDC) is new physics and stays RESERVED.

> **C110. "RESOLVE TUDO" -- THE BACKLOG DELEGATED (Vitor, 2026-10-20, after
> upgrading his plan: "tenho de acabar isto once and for all!" ... "Resolve
> tudo e delego em ti fazeres como achares melhor.  Como temos agora
> bastante credito, usa os generais todos.").**  The backlog was read off
> this file (not memory) and put to him the same turn.  Wave 1, nine
> generals in separate worktrees on non-overlapping files:
> G1 the apalutamide dossier data slice (A1); G2 multiproduct campaigns and
> changeover cleaning in `batchPlan` (A2); G3 the donepezil case (C104) on
> stated defaults -- API bought, wet granulation, production from a cited
> source or a declared assumption; G4 debt financing and interest during
> construction in the appraisal (opt-in); G5 the batch plan's Gantt drawn
> in the GUI; G6 the small-defect pack (gibbsReactor drops a solid feed in
> silence; Streams Detail navigator on sectored cases; "Open Case folder"
> without the case-root rule; the plant-layout bench's `[stderr]` prefix;
> the missing `sec:column-control` label); G7 the two shared-path defects
> (the `flashState` phase test that evaluates K with y = x, C92; the
> silent NaN liquid density with a supercritical component, C76) -- the
> FULL regression they need is authorised by "resolve tudo", reason
> written in their dispatch; G8 the open calls Vitor delegated: C98 (print
> C_TM as the FCI arithmetic applies it) and C71 (measure aceticAcid02's
> M1 gap since C74 before choosing); G9 C102b, folding a long train so the
> whole flowsheet is legible.  Standing rules kept: a golden row that
> MOVES is listed to Vitor before it is re-recorded; generals report their
> DEV.md/CLAUDE.md text instead of editing those files (nine branches
> would collide there); the RESERVED items of 4b stay his until he rules
> on each.  Wave 2 (after wave 1 merges): room data sheets and HVAC loads;
> purified water by RO + EDI; utility tariffs; layout extensions (pipe
> pressure drop and cost, fire water, bunds, escape routes, nozzles).
> Status: wave 1 dispatched 2026-10-20.
> **G2 DONE 2026-10-20 (merged via integ/wave2):** `products ( ... )` +
> `campaignOrder` + per-stage `productChangeover` make `batchPlan` a
> multiproduct plant in single-product campaigns (per product its demand,
> lot, balance -- the flowsheet's unless `massPerProduct`, announced --
> time / density / fill overrides and `changeoverTo { <next> }`); each stage
> sized for the product needing the most (`sizingProduct`); the year per
> train = campaigns back to back in the declared order, the clean before
> the next product REPLACING the same-product changeover; an impossible year
> refused with each product's share, a poor plan announced; the year's
> Gantt with kinds; the `batch` kind pins every new record.  Stated
> defaults (record section 6): one rotation a year, no overlapping
> campaigns, the order mattering only through `changeoverTo`.  No tutorial:
> a three-product in-gate probe (arms (h)-(l), 20 refusals, sabotages
> S6-S11, one of which survived an arm that compared recomputations instead
> of the published year).  apalutamide01 byte-identical, 0 golden rows
> moved.  NOT built: overlapping campaigns, rotations, an order optimiser,
> the intermediate store.
> **G6 DONE 2026-10-20 (merged via integ/g6, validated on the fresh
> machine: build warning-free, the 15 steady/gibbs cases PASS, gates
> gibbs-solid-phase / guide-paths / guide-pdf-fresh / doctrine OK,
> `--gui` 32/0).**  Five small defects, one commit each plus a rider: (1)
> `gibbsReactor` dropped a SOLID in its feed at exit 0 (a copy of gibbs11
> fed 0.91 kmol/h of graphite: carbon in 2.91 / out 2.00 kmol-atom/h, only
> the element balance said so) -- it REFUSES by name now, the
> `equilibriumReactor` posture; carrying a feed solid is a feature not taken;
> gate `check_gibbs_solid_phase` arm (h).  (2) The Streams Detail navigator
> said "No flowsheet loaded." on lithiumBrinePlant: members resolve through
> `toGraph.memberFolder`, the engine's `resolveMemberBase` order.  (3) File
> -> "Open Case folder..." reads both browser routes through
> `caseFromEntries`, the C107 one-home rule.  (4) `layoutLines` kept the
> worker's `[stderr] ` mark, so the browser dropped every `[layout]`
> finding: `runLog.engineText` is the one home.  (5) Two cross-document
> `\ref`s in the Design and User Guides, and the Design Guide's stale C106
> path.  Rider: the inserted lines moved every `GibbsReactor.cpp:N`
> EduTool citation >= 275, remapped and read back.  0 golden rows moved.

> **C109. AN EDUTOOL ON SYNTHESIS GAS (Vitor, 2026-10-19, after asking why
> syngas is so widely used and which other synthesis gases are famous: "Podes
> fazer um EduTools sobre isso?  Eu sempre senti que nunca ninguem me
> explicou isso bem!").**  Measured: no lesson explains syngas AS A PLATFORM;
> five lessons use reforming as the vehicle for an equilibrium METHOD
> (approachToEquilibrium, declaredPathways, equilibriumLandscapes,
> elementPotential, limitingReactant).  Cases that could host engine-run
> moves as in-browser copies (no new case, the standing rule):
> `steady/gibbs/gibbs02_steam_reforming`, `steady/reactors/equil01_reforming`,
> `steady/gibbs/gibbs11_carbon_deposition`,
> `steady/reactors/screen01_methanol_routes`, `plant/ammoniaRoutes01_screening`,
> `steady/separation/psa01_h2_psa`.  Pedagogical scope is Vitor's: proposed
> to him before any dispatch.  Status: scope proposed (eight parts: where
> syngas comes from; why reforming is hot and low-pressure; carbon
> deposition; the shift as the ratio knob; each destination's ratio;
> cleaning the gas; the historical family and green CO2 + H2; what the
> model does not do).  Vitor 2026-10-19: "Podes avancar" -- dispatched on
> that scope.
> DONE, PENDING MERGE (branch claude/c109-syngas-edutool): EduTool `syngas`
> ("Synthesis gas: one gas, many products", Reaction engineering, notes),
> the eight parts in the approved order, linked to the five method pages
> (approach-to-equilibrium and declared-pathways link back) and to
> limiting-reactant and route-screening.  No new case: five benches are
> in-browser copies -- gibbs11 (steam reforming knobs T/P/S/C, pressure,
> carbon), screen01's gibbsC made ADIABATIC (partial oxidation, autothermal
> with O2 and steam; the engine finds the outlet T), equil01 with two shift
> reactors written in (`reactions ( wgs );`, 650 and 480 K; one stage at
> 480 K reproduces the two to the last digit), equil01 fed CO2 + 3 H2 with
> the shift alone (the reverse shift, module 2.000), psa01 (P_low and
> purge).  Every move is an exact edit landing once; 24 guided moves, each
> quoting engine numbers held by gui/tests/syngasLesson.test.ts to a NATIVE
> run of the exact file map the browser sends; 19 file:line citations
> (GibbsReactor, GibbsSolidPhase, EquilibriumReactor, PSA) held to their
> lines.  The module M = (3a + h - c - 2o)/(a + c) is derived from the
> element balances (steam cancels, the shift cannot move it) and the engine
> confirms it (3.000 on every steam-reforming move, 1.800 at O2/C 0.6).
> NOT SHOWN, said on the page: gasification (no reactor carries a solid feed
> into its equilibrium), CO2 absorption and sulfur removal (no case), any
> kinetics.  FOUND, NOT FIXED: `gibbsReactor` silently DROPS a solid
> declared in its feed (`phases { solid {...} }`) -- measured on a copy of
> gibbs11 fed graphite + CH4 + water, exit 0, the element balance reporting
> carbon off by 47.6 %; `equilibriumReactor` refuses the same feed by name
> (EquilibriumReactor.cpp:82-86).  A refusal there is a one-line engine
> change on a shared unit, left for a sized slice.

> **C108. A HOME-SCREEN ICON FOR THE APP (Vitor, 2026-10-19: "Sabes se
> podemos fazer a app choupo para iPhone?" ... "Eu preferia um icon que
> abrisse o Firefox com o choupo!" ... "Isso e muito facil e gasta poucos
> creditos?").**  Discussed: an App Store app needs an Apple developer
> account, a Mac, review, and a GPL/App Store licence exception every
> copyright holder must grant (Vitor's call, not taken); offline support
> was already tried and ROLLED BACK (`site/sw.js` self-destructs; a Chrome
> rendering glitch).  Built, on that scope only: a web app manifest
> (`gui/public/manifest.webmanifest`, start_url and scope `/app/`) and
> icons (`gui/public/icons/`, the leaf mark on white, 180/192/512) linked
> from the app's and the landing's `<head>`, so "Add to Home Screen" in
> any browser shows the Choupo name and leaf.  NO service worker.  Which
> browser a home-screen icon opens is the phone's decision, not ours (on
> iOS every browser is WebKit).

> **C107. OPEN A CASE ONLINE FROM ONE COMPRESSED FILE (Vitor, 2026-10-19,
> after a class: "dava muito jeito online poder abrir diretamente um caso
> com o folder num unico ficheiro comprimido").**  Measured: the capability
> EXISTS but is hidden.  `gui/src/cases/loadCase.ts:81` `openCaseZip()`
> unzips in memory with fflate (every browser) and strips ONE common top
> folder (`stripCommonTop`, :63); it is reached only from the Welcome
> screen's "Open case" button when no bridge is present
> (`gui/src/ui/WelcomeScreen.tsx:192-196`).  Once a case is open, File ->
> "Open Case..." ALWAYS opens the folder picker (`gui/src/ui/MenuBar.tsx:
> 354-367`, 567) and the menu has no .zip entry, though "Download case
> (.zip)" is there (:589).  Likely failures on a student's own zip, to be
> measured: a `__MACOSX/` or `.DS_Store` beside the case folder defeats the
> one-common-top rule; a zip whose case sits two folders deep; a zip holding
> two cases; a non-text file decoded as UTF-8.  Status: dispatched
> 2026-10-19.  DONE, PENDING MERGE (branch claude/c107-open-case-zip),
> GUI only.  Vitor confirmed the shape the same day ("No menu File open,
> devia ser possivel abrir tanto um folder como um zip"): the File menu
> carries TWO adjacent items, "Open Case folder..." and "Open Case from
> .zip..." -- two items rather than a submenu because a browser dialog picks
> a folder OR a file, never both, and two visible verbs need no second
> click; the Welcome screen shows both buttons ("Open case folder", "Open
> case .zip") whatever the bridge, instead of choosing one by its presence.
> The rule has ONE home, `gui/src/cases/caseArchive.ts`: THE CASE ROOT IS
> THE OUTERMOST FOLDER CONTAINING `system/controlDict` -- outermost because
> a sectored plant carries its sectors' own controlDicts (measured:
> twoSectorDemo has three, polycaprolactonePlant two).  No root, or two
> roots that are not nested, REFUSES naming the roots; RAR / 7z / gzip are
> refused BY NAME from their first bytes ("save it as .zip", with the
> Windows and macOS steps); a damaged zip refuses with a remedy.  OS junk
> (`__MACOSX/`, `._*`, `.DS_Store`, `Thumbs.db`, `desktop.ini`) is dropped
> by name in silence; a NON-TEXT file (a NUL byte, or not valid UTF-8 -- the
> bytes decide, never the extension) and a file OUTSIDE the case folder are
> dropped and NAMED in a yellow notice, because every case surface
> (`rawFiles`, `extraFiles`, the importer's map) is text and a PDF decoded
> as UTF-8 would be a mangled copy under the original's name.  Measured on
> real zips built with `zip` and a macOS-shaped one (before -> now): macOS
> failed -> opens; two-deep failed -> opens, names the file beside it;
> contents-only and Windows wrapping opened before and still do, now
> without the PDF and `.DS_Store` decoded as text; two cases failed with
> "missing system/controlDict" -> refused naming both; a .rar threw
> "invalid zip data" -> refused by name.  `buildCaseZip` was factored out of
> "Download case (.zip)" so the round trip is a test: the download opens
> back byte-identical, plus only its three teaching files.  Tests
> `gui/tests/caseArchive.test.ts` (22; two by-hand sabotages -- junk skip
> off, nesting rule off -- each failed the arms meant to catch it).  NOT
> done: drag-and-drop of a .zip onto the app (deferred, not small: which
> tabs accept a drop -- the tool tabs carry no case chrome -- is a GUI
> identity call, and the credo lists drag-drop among its anti-patterns, so
> it is put to Vitor rather than taken); the FOLDER route keeps its own
> reader (it does not use the root rule and still reads every file as
> text).

> **C106. A BATCH PLANT'S TUTORIAL LIVES UNDER `batch/plant/`, NOT
> `plant/` (Vitor, 2026-10-19: "estes tutoriais deviam ficar num folder com
> um nome que insinue que o processo e em batch, porque a industria
> farmaceutica trabalha por lotes! ... Por em /Plant nao me parece bem
> porque isso e para processos de producao em continuo").**  Ruling (chosen
> from three options put to him): `tutorials/batch/plant/` -- the design of
> a whole plant that runs in lots, beside the batch OPERATIONS already under
> `batch/<operation>/`; named by what the student does, not by the industry.
> `apalutamide01_tablets` moves there (35 tracked files reference its path);
> a donepezil case (C104), if built, joins it.  Folder is not binary: the
> case keeps `application choupoSolve`.  CLAUDE.md section 3 updated in the
> same commit.  His deliverables list for the pharmaceutical projects
> (process + patents, cycle, Gantt with cleaning, mass/energy balance and
> in/out table; equipment and alternatives; clean-area classes, layout,
> flows, total area; QC summary table; utilities incl. water/air
> purification and wastes; CAPEX, investment plan, OPEX, profitability,
> sensitivity) is recorded here as the reference for what such a case
> should help a group produce.  Status: dispatched 2026-10-19.  DONE,
> PENDING MERGE (branch claude/c106-batch-plant-folder): the case moved
> with `git mv`, no dict or golden value changed (the README's own
> `runCase` line is the only in-case edit); every reader of its path
> updated (four gates, FASTSET -- now in the batch block, family
> `tutorials/batch/plant` -- the GUI witness id and two GUI tests, the
> case-authoring docs, three design records that point a reader at it,
> the catalogue row beside the batch rows); the generated views
> regenerated with their own tools (caseManifest, the Tutorials Guide's
> batch/plant `.tex` and its PDF).  Folder = binary was assumed in TWO
> gates that select plants by folder -- `check_mass_closure`'s atom-scope
> arm and `check_utility_allocation_pinned`'s candidate set -- each now
> names `batch/plant/` beside `plant/`; the GUI gained the subclass label
> `plant` ("Plant design (run in lots)") and the guide generator's unused
> batch title stopped naming choupoBatch.  runTests, runCase, listCases
> and the GUI already dispatch by `controlDict.application`.  The old
> identifier `plant/apalutamide01_tablets` is an entry in
> `tutorials/ALIASES`, so a shared `?case=` link or `runCase` path keeps
> resolving and the dated C97 record keeps the name it was written with.

> **C105. THE STREAMS WORKSPACE HAS A WINDOW AT THE BOTTOM THAT CANNOT BE
> SCROLLED TO ITS END NOR RESIZED (Vitor, 2026-10-19, on the live site: "o
> painel 'stream' tem uma window ca embaixo que nao da para ver ate ao final,
> nem para ajustar").**  Measured only from the source, not yet reproduced:
> `gui/src/ui/StreamsWorkspace.tsx:153-265` stacks the StreamsSummary band, a
> Table/Detail toggle and the table (`StreamsTable`, overflow hidden) in one
> flex column; `gui/src/ui/AppShell.tsx:365-372` adds a docked console row at
> the bottom of the grid when the assistant console is docked.  Which of
> these is "the window at the bottom" is to be found by reproduction.
> Status: dispatched 2026-10-19.
>
> **Reproduced and fixed 2026-10-19 (branch `claude/c105-streams-bottom-window`,
> GUI only).**  Measured in Chromium on the dev GUI with each case's own
> native result injected (apalutamide01_tablets, lithiumBrinePlant,
> flash01_benzene_toluene; Table and Detail; console docked and not; 1280x720
> and 1920x1080).  The window at the bottom is the STREAM TABLE (and the
> Detail pane in the same slot): the balances band above it had no height of
> its own (`flex: 0 1 auto`, min-height auto, no scroller), so on a plant it
> took 445-461 of 688 px and left the table a 155 px viewport for 46 streams,
> whose scrollbar showed only on hover; with the console docked (workspace
> 328 px) the band alone overflowed, its own top was clipped and the
> table/Detail pane got 0 px.  Nothing could be dragged.  The docked console
> was not the culprit: its seam already exists and works.  Fix: the band is a
> panel-contract TOP panel (`STREAMS_SUMMARY_PANEL`, registry
> `PANELS.streamsSummary`; the contract gained a `top` edge whose seam is its
> bottom edge), scrolling inside its own height, dragged or arrow-keyed at the
> seam, folded to a `BALANCES` strip, and drawn at `shownTopPanelPx` =
> min(reader's size, content, workspace - 260 px kept for the table) --
> render-only.  The table's ScrollArea shows its bars always (both axes, offset
> so they cover no row).  After: table viewport 375 px at 1280x720 (735 px at
> 1920x1080), 187 px with the console docked; every scroller reaches its last
> row; a three-stream flash draws the band at its content (176 px), no blank.
> Pinned in `gui/tests/panelContract.test.ts`.  Found on the way, NOT fixed
> (separate defect): the Detail navigator reads "No flowsheet loaded." on
> lithiumBrinePlant, whose sectors `buildTree`/`walkChildren` does not walk.

> **C104. A SECOND PHARMACEUTICAL PROJECT GROUP: DONEPEZIL (Vitor,
> 2026-10-19: "Sabes qual e o API do meu outro grupo de projeto?" ... "e o
> Donepezilo").**  Recorded so it is not lost: besides the apalutamide group
> (C97), a second design-project group works on a donepezil (hydrochloride)
> tablet plant.  Nothing commissioned yet; whether the API is bought, the
> dosage forms and what Choupo should provide are Vitor's to state.  No new
> case without his explicit ruling (the standing rule; C97 was the
> exception for apalutamide only).
> **BUILT 2026-10-20 (G3, merged via integ/wave2):**
> `tutorials/batch/plant/donepezil01_tablets`, on C110's stated defaults --
> API bought, WET GRANULATION (aqueous HPC binder, high-shear granulator
> placeholder, fluid-bed drying as `solidDryer` on the maize starch's GAB
> isotherm, milling, final blend, press, aqueous HPMC coat dried by hot
> air, packaging), the simpler sibling of apalutamide01 (no spray drying,
> solvent, N2 loop or ATEX; nothing outdoors; two gates).  Read from the
> reference product's UK SmPCs (ARICEPT 10 mg / 5 mg, cited by title): the
> strengths (10 mg HCl = 9.12 mg base; 5 mg), the lactose (174.33 / 87.17 mg
> -- dose-proportional, one blend), the excipient and coat lists; no EPAR
> exists.  Production (150 M tablets/yr) and price (0.10 EUR/tablet) are
> DECLARED author-set assumptions.  `batchPlan`: 300 kg lots, 143/yr,
> granulation limited by the fluid bed and 29 % occupied (the lesson of a
> dedicated line for one strength), tableting by packaging; NPV -18.6 MEUR
> on placeholders, explained.  ONE product: the 5 mg strength is now
> possible with G2's `products ( ... )` (next).  Blend content uniformity
> stated as the group's question, not computed.  No engine change; golden
> recorded new (862 rows, nothing moved).

> **C103. A 2D GMP FLOOR PLAN A STUDENT CAN HAND IN (Vitor, 2026-10-19,
> after reading the Atozet student project, whose production area is drawn
> as detailed 2D plans: "Eles tem plantas detalhadas do pavilhao de
> producao.  Achas que isso se pode fazer?" ... "Faz o que for de mais bom
> senso e que nao torne isto muito complexo.  A plantas 2D eram
> interessantes").**  Measured: the GMP section draws one SVG per floor
> (`gui/src/ui/GmpBuildingSection.tsx`, 298 lines, from the published
> `building` block, `gui/src/adapters/buildingPayload.ts`); on
> apalutamide01 its labels overlap, the three flows are thick lines across
> walls, doors are not drawn, and there is no scale, legend or room
> schedule.  Best practice for an oral-solid-dose plant (ISPE Baseline
> Guide Vol. 2, cited by title only) is a SET of plans per floor -- a
> zoning plan (grades, colour-coded), a pressure-cascade plan, and
> personnel / material / waste flow plans -- plus a room schedule (room
> data sheet summary).  Scope, on Vitor's "bom senso, nao complexo": GUI
> only, drawing what the engine already publishes, no new physics and no
> new dict grammar; HVAC loads, purified water and QC specifications were
> discussed and are NOT in this slice.  Status: dispatched 2026-10-19.
>
> **C103 MERGED-pending (branch `claude/c103-gmp-floor-plans`, 2026-10-19).**
> GUI only.  The GMP section's plan becomes a SET of sheets per floor,
> chosen by two toggles (floor; Zoning | Pressure | one flow plan per kind
> the building declares): zoning (grade fill, airlocks dashed with
> PAL/MAL/GOW and regime, contained rooms double-lined, ATEX rooms hatched,
> rooms a finding names outlined orange); pressure (each room shaded by its
> published pressure to outside, an arrow across every door from the higher
> to the lower pressure read off the published `dP` = p(a) - p(b),
> labelled with the step; no arrow at equal pressure); flow (each flow
> routed DOOR TO DOOR -- in through a door, a lane offset by kind, an
> axis-aligned L inside the room, which cannot leave a rectangle -- tagged
> P1/M1/W1 with a key; a flow the engine found not connected dashed and
> keyed with its own `flowBreak` message; a stair change labelled).  Every
> sheet: walls, doors as gaps, stairs/lifts as symbols, equipment to scale,
> room labels that fit or fall back to the room's NUMBER (`<floor>.<nn>`,
> floors from the lowest), a scale bar, a north arrow (plan +y), legend,
> footnotes and a title block (case, building, floor, plan); ink on white
> in either theme; "Download SVG" per sheet, the room schedule (number,
> role, grade, regime, p to outside, declared, area, height, occupancy,
> ATEX, equipment, notes) as a table and a CSV.  NOT PUBLISHED, so drawn
> and said so on every sheet: a door's POSITION on its wall (drawn at the
> midpoint of the shared wall; an outside door at the midpoint of the
> room's outer wall nearest the building edge, the cutaway's rule) and its
> width (1.2 m, a symbol); the swing of a door is not drawn at all.
> Geometry in `gui/src/case/gmpPlanSheet.ts` (pure; tests
> `gui/tests/gmpPlanSheet.test.ts`: doors on shared walls, cascade
> direction, routes that cross walls only at doors, label fit and number
> fallback, schedule rows = published rooms), drawing in
> `gui/src/ui/GmpPlanSheet.tsx`; the C101 EduTool keeps its compact
> `FloorPlanSvg`.  The 3D view is untouched.  Validation: `bin/runTests
> --gui` PASS 32 / FAIL 0 (5720 GUI tests) on top of main f9ce67d58;
> before/after screenshots of apalutamide01 (both floors, every plan type,
> the schedule) taken in Chromium through the `?layout=` building tab.

> **C102. THE FLOWSHEET CANVAS CANNOT ZOOM OUT TO THE WHOLE FLOWSHEET
> (Vitor, 2026-10-19, screenshot of apalutamide01 on the live site: "No
> flowsheet o zoom out nao permite ver o flowsheet todo!  Ha uma parte em
> cima que e dificil de aceder.").**  Measured only from the screenshot:
> the canvas stops zooming out before the whole apalutamide flowsheet fits,
> and units above the visible area are hard to reach.  To check: the
> React Flow `minZoom` and the fit-view bounds in the GUI's flowsheet
> canvas, against a large flowsheet.  Status: recorded, not dispatched
> (Vitor's credit this week).
>
> **C102 MERGED-pending (branch `claude/c102-flowsheet-zoom`, 2026-10-19).**
> Measured in Chromium at 1280 x 720: THREE causes, not one.  (1) No
> `minZoom` was set, so React Flow's 0.5 clamped the wheel and every fit;
> apalutamide01 (laid out ~5100 x 7100 px) needs 0.063 to fit that window.
> (2) The first fit fired before the boxes were MEASURED and fitted only the
> few already measured, ending at the fit's maxZoom 1.1 -- 42 of
> apalutamide's 51 boxes off-screen, and lithiumBrinePlant opened at 1.1
> with 8 of 15 off-screen though it fits at 0.70 (pressing F fitted it).
> (3) The SHOW/PHASE/WIRES legends and the Run button float over the top
> ~120 px, and the even 10 % fit margin put the top units under them.  Fix,
> `gui/` only: `ui/flowsheetViewport.ts` is the ONE home of the fit options
> (`FLOWSHEET_MIN_ZOOM` 0.01 on `<ReactFlow minZoom>` and in every fit; a
> 150 px top margin); FlowCanvas fits once every box of the case is
> measured (`useNodesInitialized` + a per-node check of the store).  Panning
> was never bounded (no translateExtent / nodeExtent).  Test
> `gui/tests/flowsheetViewport.test.ts`: all 393 tutorial views (automatic
> and `.cho`) fit a 1024 x 420 pane above twice the minimum, through React
> Flow's own `getViewportForBounds`; sabotaged back to 0.5 it fails two
> arms.  The corpus view collector moved to `tests/flowsheetCorpusViews.ts`,
> shared with the C59 layout test.  NOT done, a finding for the layout
> (C59): apalutamide's automatic layout draws two groups of units ~5600 px
> apart, joined by long vertical wires, so its whole-plant fit is a small
> map (0.063 at 1280 x 720) -- the zoom now reaches it; the gap is the
> layout's.  Riding with it: the case-assembly lesson's `guiCho` citation
> follows its line (FlowCanvas.tsx 453 -> 456), and C100's scratchpad path
> above was reworded (`check_doc_references` read it as a repo path).
> Validation: `bin/runTests --gui` PASS 32 / FAIL 0.
>
> **C102b MERGED-pending (branch `claude/c102b-flowsheet-layout`,
> 2026-10-19): the 5600 px gap was the LAYOUT'S y-sweeps diverging.**
> Measured round by round: step 5 of `gui/src/case/flowsheetLayout.ts`
> (median alignment + isotonic spreading, 8 + 3 sweeps) moved apalutamide's
> granulation-to-packaging group ~590 px further down EVERY sweep.  The
> order step 4 chose leaves a cycle of constraints: the long
> coatingSuspensionPrep -> coatingPan wire is ordered ABOVE the granulation
> train (which the spreading therefore pushes below it), the coating-air
> wire is ordered BELOW the train, coatingDryer lines up with that wire,
> coatingPan with the dryer, and the long wire with the pan -- so each lap
> adds a stack height and nothing stops it.  Not a recycle, not a tear,
> not a sector box.  Fix, general (no case named in code): a step 6,
> `closeEmptyBands`, closes every horizontal band no box (stubs' room
> included) reaches into that is taller than `maxEmptyBand` (120 px).  A
> drift is a translation of a group, so it leaves exactly such a band; the
> map is monotone in y, so crossings, wires-through-boxes, overlaps and
> bends are unchanged over the corpus (C59 totals 63 / 17 / 0 / 2736 before
> and after) and only the wire length falls (305 622 -> 294 780 px); the
> recycle runs are routed after it.  The drift itself is NOT cured -- a
> convergent coordinate step (e.g. Brandes-Kopf) would be a redesign of
> step 5.  Measured in Chromium at 1280 x 720: apalutamide 0.063 -> 0.221
> (now 5091 x 1695 px as laid out), screen01_methanol_routes 0.117 -> 0.260;
> lithiumBrinePlant (it ships a `.cho`) and flash01 unchanged (0.70, 1.1).
> The 0.25 asked for is NOT reached: apalutamide is now WIDTH-limited -- 15
> columns, one train in series behind another -- and closing that needs a
> decision (fold a long train into rows, a smaller column gap, or a smaller
> side margin of the fit), put to the commander, not taken.  Tests:
> `flowsheetLayout.test.ts` (the band step: the excess only, stubs' room,
> monotone) and a `flowsheetViewport.test.ts` arm (apalutamide under
> 2000 px tall, fit > 0.2 in the 1280 x 653 canvas; fails with the step off).

> **C101. AN EDUTOOL ON THE PHARMACEUTICAL (GMP) LAYOUT (Vitor, 2026-10-19:
> "Sera que podes fazer um EduTool sobre este layout de processos
> farmaceuticos?").**  Measured: a plant-layout EduTool exists
> (`gui/src/ui/methods/plantLayoutLesson.ts`, `PlantLayoutTool.tsx`) and
> covers the outdoor plot plan; nothing teaches the GMP interior of C97B.
> Pedagogical scope is Vitor's: the scope was put to him before any
> dispatch, and the work waits behind the current phase (he asked to save
> credit this week).  Status: scope proposed (eight lessons: grades,
> pressure cascade, airlocks, gowning, containment, unidirectional flows,
> solvents and ATEX, escape); Vitor 2026-10-19: "Avanca como achares
> melhor e eu depois dou feedback no final" -- dispatched on that scope.
> MERGED 2026-10-19 (branch claude/c101-gmp-layout-edutool): EduTool
> `gmp-layout` ("Process design & economics", beside Plant layout, linked
> both ways), eight parts with 18 engine-run moves on a 17-room teaching
> building written into an in-browser copy of `sprayDryer07_design` (no new
> case, per the standing rule), every engine claim cited by `file:line`,
> Annex 1 and Directive 1999/92/EC read and paraphrased, ISPE and WHO named
> only.  Feedback from Vitor awaited.  NAMED, not fixed: the plant-layout
> bench's `layoutLines` keeps the worker's `[stderr] ` prefix, so its
> separator announcement is dropped (one line in `layoutExercise.ts`).

> **C100. THE APALUTAMIDE PROCESS EQUIPMENT GOES INSIDE THE GMP BUILDING
> (Vitor, 2026-10-19: "quero um layout que possa ser realisticamente
> adoptado!  Nao podes por um processo com equipamentos semi continuos ...
> mas com equipamentos colocados na rua expostos aos elementos!!!").**
> Measured: `system/layoutDict` places the spray dryer, its gas heater,
> blower, exhaust cooler, solvent condenser, condensate pot, the solution
> tank, the coating air heater and the coating-suspension tank OUTDOORS
> (x -30..25 m, beside the building), and the engine CANNOT put a placed
> item inside a building that declares an `envelope` (the overlap refusal;
> named as a limit in DEV.md C97 wiring).  A pharmaceutical spray-dried
> dispersion is made inside the GMP building (a contained, ATEX-zoned
> solvent suite with explosion venting to an outside wall, its condenser,
> blower and heater in an adjacent technical room); only bulk solvent
> storage (a bunded outdoor tank farm) and utilities stay outside.  PLAN:
> (1) engine -- a placed item may stand inside a room of a declared
> building: it must fit the room in plan and height, its z is the room's
> floor elevation, the envelope does not clash with the items its rooms
> hold, and the room must list it (already a rule); (2) the case -- every
> GMP-relevant item moves into its room (SDD suite, technical room,
> solution and coating-suspension preparation, coating), the building
> grows as its own rooms require, bulk acetone and recovered-acetone tanks
> stay in an outdoor bunded farm with their pipes entering the building,
> the separation and single-entrance exercises re-examined (kept only if
> still true).  Moved rows to Vitor before re-record.  Status: dispatched
> 2026-10-19.  ADDED the same day from Vitor's screenshot of the live site:
> the main plot-plan 3D painted the building envelope as an OPAQUE orange
> box (its separation finding's highlight), hiding every room, so the
> interior looked absent -- the envelope must always draw as glass with its
> rooms and indoor items, a finding shown by outline/label only, and the
> main view gets the room/flow toggles; and ("a ideia era haver uma forma
> de as novas vistas da planta do pavilhao poderem aparecer noutro tab")
> the building views open full-window in a new tab -- the `?layout=`
> pop-out draws the building, and the GMP section gets its own pop-out.
> BUILT and STOPPED 2026-10-19 on Vitor's credit limit (branch
> claude/c100-equipment-indoors, 3 commits, NOT merged): indoor items in
> listed rooms (z from the room's floor, one home), wall penetrations for
> pipes, the SDD suite + N2 technical room + solution/coating-prep rooms +
> HVAC room indoors, only the bunded tank farm outdoors; main 3D draws the
> envelope as glass with room/flow toggles; `?layout=` pop-out draws the
> building and the GMP section has its own pop-out.  MERGED 2026-10-19
> (Vitor: "vamos terminar isso porque esta semana vou precisar disso para
> os alunos"): main merged into the branch (C99, C101), the apalutamide
> list recomputed on top of C99 -- only layout rows, 50 moved, 86 removed,
> 84 added, no balance, cost or batch-plan row -- shown to and approved by
> Vitor and re-recorded; the C101 lesson's `BuildingLayout.cpp` citations
> remapped; the C101 teaching building lost the `z` its four indoor items
> declared, which C100 now refuses (one home for the base: the room's
> floor).  Validation: `--gui` (the one failing file re-run green after the
> fix, 36/36), check_gmp_layout, check_plant_layout, check_batch_plan,
> check_cost_provenance, check_design_sheet, check_decision_index,
> check_std_includes, check_doc_references, apalutamide01 PASS.

> **C99. THE APALUTAMIDE PLANT IS BATCH: CAMPAIGN DESIGN, NOT A STEADY RATE
> (Vitor, 2026-10-19: "Este processo e batch ou e continuo?" ... "Faz como
> for melhor!  Neste caso tem de ficar realista!").**  Measured: the case
> runs `choupoSolve` at the campaign rate (12 800 tablets/h, streamFactor
> 0.45) and sizes every item for that hourly rate; a real OSD plant runs
> its dispensing, blending, compaction, compression, coating and packaging
> as BATCHES released lot by lot, and its spray drying in CAMPAIGNS.
> `choupoBatch` carries no sizing/costing/economics/layout passes
> (`src/applications/choupoBatch/main.cpp` reads no postDict), so moving the
> case there is an architecture change for no physics gain.  PLAN (the
> commander's, on Vitor's "faz como for melhor"): the steady flowsheet stays
> the MATERIAL BALANCE PER UNIT OF PRODUCT, and a new post-processing pass
> designs the BATCH PLANT on it by the textbook method (size factors per
> stage from the flowsheet's own stream masses and declared bulk densities,
> batch size, number of batches per year, processing + cleaning times, the
> limiting cycle time, parallel units in or out of phase, equipment
> occupancy and a campaign Gantt), so each stage's equipment is sized PER
> BATCH and the declared quotes can scale with that size.  This is phase C
> of the C97 plan.  Moved rows to Vitor before re-record.  Status:
> dispatched 2026-10-19.  MERGED 2026-10-19 (branch claude/c99-batch-campaign): `batchPlan {}` (`postProcessing/BatchPlanPass`, registered
> explicitly; record `docs/design/a-batch-plant-on-a-steady-balance.md`):
> stages with a `holds` stream whose mass is READ, size factors, the lot
> (declared on a stream or `largestEquipment`), lots a year, cycles,
> `T_L = max t / N_op` per train, parallel units, campaigns, occupancy, the
> first campaign's Gantt as data; an impossible plan refuses, a poor one is
> announced.  Consumers: `volume fromBatchPlan` on a vessel, a quote's
> `scaling {}` (the case's exponent), `streamFactor fromBatchPlan` (a
> numeric factor beside a plan refused).  Golden kind `batch`, gate
> `check_batch_plan`.  apalutamide01: 350 kg lots, 84 a year, spray drying
> limited by its solution tank (53.1 h), the solid-dose suite by packaging
> (10 h); FCI 23.06 -> 22.54 MEUR, NPV -45.5 -> -44.6 MEUR; Vitor approved
> the 72 moved rows, 190 `batch` rows appended.  Every other costing
> case byte-identical.  The C97 "phase C" is this.
>   ADDENDUM, same day (Vitor: "Por amor de Deus, faz um
> projeto que seja realista!  Eu nao tenho experiencia em industria
> farmaceutica mas quero um projeto que nao me envergonhe!").  The case's
> DATA is the weak half, not only its structure: a 1 EUR tablet against a
> real list price two orders of magnitude higher, a production basis not
> tied to real demand, a formulation and a solvent nobody read from a
> regulatory source, equipment and building costs that are round numbers.
> PLAN: (1) a research general builds a SOURCED design-basis dossier from
> public documents (EMA EPAR / FDA review and label for apalutamide,
> patents for the spray-dried dispersion, public sales for demand,
> published OSD equipment and facility practice), each number with its
> source and a confidence word; (2) an independent reviewer playing a
> pharmaceutical-industry process engineer red-teams the case against that
> dossier; (3) the case's assumptions are replaced by the dossier's, on top
> of the C99 batch plan.  Nothing is invented: where no public source
> exists the case says so and the README hands the number to the group.
> DOSSIER RETURNED 2026-10-19: `docs/design/apalutamide-design-basis-dossier.md`
> (every number with source, page, read/derived and a confidence word; a
> red-team list ranked by severity).  Main finding: US 12,303,493 B2
> (Janssen) publishes the Erleada 60 mg recipe ingredient for ingredient
> (SDD 1:3 HPMCAS-LG, DCM/MeOH 40:60 at 5 wt % solids, PSD-3 pressure
> nozzle, 46 C outlet; 700 mg core; Opadry II 3 %), contradicting the case
> on composition, solvent, solids and outlet T; EU demand ~55 M 60-mg
> tablets/yr; the case's 50 M is nearly all of it; no business case and,
> as written, inside an active patent.  Vitor's rulings the same day:
> BUSINESS CASE "Generico a perda de exclusividade" (a generic plant
> launching at loss of exclusivity, price with 2-4 competitors, a declared
> market share); SOLVENT "Acetona, citada da patente" (the patent's
> acetone example at 5 wt % solids; the README says the commercial-scale
> example uses DCM/MeOH, which Choupo's one-volatile spray dryer cannot
> carry today).  The data slice that applies the dossier to the case waits
> for C99 and C100 to land (it edits the same files) and for Vitor's go
> (credit this week).

> **C98. PARTICULATE LABOUR AND DECLARED QUOTED COSTS (Vitor, 2026-10-18,
> two rulings on the C97 phase A findings).**  (1) Turton's operator count
> is N_OL = (6.29 + 31.7 P^2 + 0.23 N_np)^0.5 and the engine drops the P
> term (`EconomicsPass.cpp:2108`); ruling "P declarado pelo caso": a
> declared `particulateSteps` with source/reason, absent = 0 ANNOUNCED when
> the flowsheet holds a solids-handling unit; no existing case moves, the
> apalutamide case declares its own.  (2) An item with no cost correlation
> (OSD machines, the GMP building) gets no capital today, so apalutamide's
> FCI is the solvent section only; ruling "Sim, preco declarado": a case
> may DECLARE a quoted cost per item (value, year, source, reason), entering
> the capital marked `declared`, with no invented module factor -- the
> catalyst-charge `declared-unit-price` precedent.  Moved rows to Vitor
> before re-record.  Status: dispatched 2026-10-18.  First round
> (branch claude/c98-labour-and-quotes): both built; other 20 costing cases
> byte-identical; on apalutamide the quotes take FCI 2.26 -> 23.06 M EUR
> (quotes alone: NPV -4.7 M, IRR 7.4 %) but Turton at P = 6 staffs ~34
> operators a shift (12.5 M EUR/yr labour, NPV -158 M).  Vitor 2026-10-19,
> on a campaign drug-product line: "Equipa declarada pelo caso" -- the case
> may DECLARE its operating crew (operators per shift by area, source,
> reason) in place of the correlation, which is printed beside it for
> comparison.  Sent back to the same general.  MERGED 2026-10-19: round 2
> built `economics { operatingCrew { areas ( ... ); source; reason; } }`
> (labour = sum of operators per shift x the one positions factor, Turton's
> correlation printed beside it as a comparison that enters no total), and
> published `operatorsPerShift`/`operatingPositions`/`C_OL` on every
> appraisal (rows appended on 9 cases, none moved).  Vitor approved the 12
> apalutamide rows: FCI 2.26 -> 23.06 M EUR, TCI 14.7 -> 36.0 M, COM_d
> 41.4 -> 53.5 M/yr, NPV +31.3 -> -45.5 M, IRR and payback no longer
> exist, the four WC rows, cost per kg 314 -> 405; 37 rows appended.
> OPEN: catalyst-charge and steel-mass rows print C_TM = C_BM but the FCI
> applies the contingency fee to their C_BM (either fix moves goldens).

> **C97. APALUTAMIDE TABLETS: A NEW CASE AND THE GMP INTERIOR LAYOUT
> (Vitor, 2026-10-18: a pharmaceutical-industry project group produces
> apalutamide tablets; the API is bought, everything else is made on site.
> Ruling: "Caso novo + layout GMP" -- an EXPLICIT EXCEPTION to the standing
> no-new-case rule, for this project only).**  Measured before planning:
> the reference product is a film-coated tablet whose core carries HPMCAS,
> an amorphous solid dispersion made by SPRAY DRYING (AusPAR apalutamide
> 2019; Materials 16 (2023) 6616 review); the solvent system is NOT
> confirmed in any source read (the EPAR quality module 3.2.P.3 is where the
> group must look) -- it is declared in the case as an assumption.  Choupo
> today: `sprayDryer` takes any volatile solvent but defaults its liquid
> surface tension/viscosity to water and uses Le ~ 1 (water-air)
> (`SprayDryer.cpp` ~113-267), so an organic-solvent / nitrogen dryer runs
> with stated approximations; no blender, roller compactor, mill, tablet
> press or pan coater exists; there is no interior (rooms / floors / GMP
> grades / pressure cascade / flows) layout.  PLAN put to Vitor before
> dispatch: phase A the case; phase B the GMP interior layout; phase C
> (later) equipment counts from campaign occupancy.  Vitor 2026-10-18:
> "Avanca!" -- phases A and B dispatched in parallel (B on its own engine
> home and gate, to stay clear of C96's edits to PlantLayout).  MERGED
> 2026-10-18.  PHASE A (claude/c97a-apalutamide-case): case
> `tutorials/plant/apalutamide01_tablets` -- acetone/HPMCAS spray drying in
> a closed N2 loop with condenser recovery (93.5 %), the solid-dose train
> as mass-balance placeholders, coating dryer, layout, README for the
> group; engine prerequisites in sprayDryer (every non-volatile solid
> leaves in the powder; Le announced), solidDryer (non-sorbing solids ride
> through), mixer (a solids-only blend on the solid rung), ThermoPackage
> (S_ig/Cp_ig skip z = 0) and VesselSize (a declared volume needs no
> flow KPIs).  New golden recorded; after the C96 merge the case also
> raises `singleEntrance`, kept as a second exercise for the group
> (findings 1 -> 2, two rows appended).  PHASE B
> (claude/c97b-gmp-interior): `building {}` in layoutDict, engine
> `postProcessing/layout/BuildingLayout`, JSON `building` block, golden rows,
> 3D cutaway + plan per floor, gate `check_gmp_layout`, Design Guide
> section, record `docs/design/a-gmp-interior-is-declared-and-checked.md`.
> Byte-neutral on the corpus.  Validated together: --fast 74/0 (after the
> pin), --gui 5643 tests + 32 gates, check_gmp_layout, check_plant_layout,
> check_design_sheet, guide freshness.  OPEN, from the phase A report:
> Turton's particulate labour term absent (`EconomicsPass.cpp`
> N_OL_per_shift); no declared quoted cost for an item with no correlation
> (OSD machines, the GMP building) so FCI is the solvent section only; the
> router draws powders as rack pipes and unsized mixers as junctions; an
> anchorless unrouted marker drawn off the plot; the adiabatic mixer's
> fluid branch omits entering solids' enthalpy; sprayDryer handles ONE
> volatile and still defaults liquid viscosity/surface tension to water
> silently; mixer bracket probes leak caveats for absent components; a
> linked tank's working capital reads 0.  From phase B: the building does
> not count toward the plot area (`plotOf`); the apalutamide case does not
> yet declare its building (the WIRING step).  WIRING dispatched 2026-10-18
> (branch claude/c97c-apalutamide-gmp-wiring), MERGED 2026-10-19: the case's
> `building {}` (35 rooms, two floors, eight flows, zero findings) in its
> `productionBuilding` box through a new `envelope <id>;` key (a stated
> default: the shell item is exempt from "an item inside a room that does not
> list it", every room must fit it); the rooms in `plotOf` and
> `roomBeyondPlot` retired; SOLIDS ARE NOT PIPED (a stream with no fluid
> phase is listed not routed, `solids`, no anchor; a junction of solids
> alone leaves the rack); an anchorless unrouted stream is listed beneath
> the 3D view, not floated off the plot.  The corpus layouts are
> byte-identical; apalutamide01's golden moves (pipes, junctions, summary)
> and Vitor approved the rows (13 pipe lengths, pipes 41 -> 18, notRouted 5 -> 28, pipeLength 1014 -> 423 m, 87 rows of the solids pipes and junctions removed, 326 building rows appended; plot, land and NPV unchanged).  Limit named: with an
> envelope no placed item can stand inside the building (the plot plan's
> overlap refusal).

> **C94. LAYOUT GUIDELINES IN THE GUIDES (Vitor, 2026-10-18: "Nos Guias
> apropriados podes incluir uma parte sobre guidelines de layout?", after
> asking where a column's reboiler and condenser go, whether columns share
> platforms, and that the pumps' NPSH needs that information).**  Home: a
> new `designGuide.tex` section "Plant layout" (beside Storage and Pressure
> relief, which already points to `layoutDict`), cross-referenced from the
> Tutorials Guide's plant chapter and the EduTools Guide's plant-layout
> lesson.  Content: siting and wind, separation and hazardous areas
> (principles, cited, no no-grant table transcribed), roads, fence, gates and
> battery limits, pipe racks, tank farms (atmospheric vs pressurised vs
> refrigerated storage), the column group (reboiler at the base, the
> vertical order top -> condenser -> reflux drum -> pump, gravity reflux vs
> pumped, air coolers on the rack), NPSH and the elevations it fixes (skirt
> height, drum elevation; at the bubble point NPSHa = static head - suction
> losses), platforms, ladders and walkways (each column self-supporting,
> platforms at access points, walkways to neighbours), maintenance and crane
> access; and what Choupo checks vs what it does NOT (vertical order and
> NPSH unchecked today -- the C95 candidate).  PDF rebuilt.  Status:
> dispatched 2026-10-18.

> **C94 MERGED 2026-10-18.**  Design Guide §21 "Plant layout" (4 pages,
> between Pressure relief and Effluent treatment): siting and wind;
> separation and hazardous areas (principles and published sources by
> title, no table transcribed); blocks, roads, fence, battery limits; pipe
> racks; tank farms (pressurised / semi-refrigerated / fully refrigerated,
> ammonia's crossover in the low thousands of tonnes); the column group;
> NPSH and the elevations it fixes (illustrative worked example); platforms,
> ladders, walkways; maintenance access; what Choupo checks and does not.
> Tutorials Guide plant intro points to it; its generated plant part was
> STALE on main after C92/C93 (T101 still drawn) and is regenerated.  Doc
> gates OK.  Found, pre-existing, not fixed: `\ref{sec:column-control}` has
> no label (prints "??"); "Equipment selection at a glance" appears twice;
> the intro still says "eight faculty sections".  C95 note from the
> general: NPSHr is vendor data the engine does not carry -- publish NPSHa
> and let the case declare NPSHr with its source.

> **C88. THE 3D LAYOUT MADE TO LOOK LIKE A PLANT (Vitor, 2026-10-18: "E ve
> se pões o layout com melhor aspecto!  Eu acho que ha bibliotecas para
> renderizar o 3d para aquilo ficar top notch!").**  Measured:
> `gui/src/ui/plotting/layoutRenderer.ts` (533 lines, the ONE drawing shared
> by the app's pop-up and the exported viewer `gui/src/export/layoutViewer.ts`)
> draws every item as a plain cylinder or box (:257, :261) under an ambient
> + one directional light (:178-179), no shadows, no environment, no tone
> mapping.  Commander's technical call: stay on three.js (already a
> dependency, ^0.170) and its own shipped addons (RoomEnvironment, PBR
> materials, soft shadows, ACES tone mapping, ambient occlusion / outline
> post-processing) -- no new runtime library, so the exported viewer keeps
> bundling with no network.  Equipment drawn by its KIND (the datasheet
> rule: dispatch on the sheet's `equipment` word; an unknown kind keeps a
> labelled box): vessels with heads and skirts, a column with platforms and
> ladder, storage tanks with roofs and a bund, exchangers with channel heads
> and saddles, pipes with elbows on a steel rack.  The engine's geometry
> stays the truth: no dimension invented, decoration says it is decoration.
> A quality toggle for weak laptops.  Status: dispatched 2026-10-18.

> **C88 MERGED 2026-10-18.**  `gui/src/case/equipmentModel.ts` (pure, no
> three.js) holds one drawing per registered equipment word -- vessel
> standing (2:1 heads, skirt or legs) and lying (saddles), shellTubeHX
> (channel, heads, flanges, saddles), storageTank (cone roof, courses,
> ladder), stirredTank (drive), compressor (plinth, casing, motor),
> sprayDryer (cone, legs, atomiser) -- every part flagged BODY (fills the
> published envelope exactly) or DECORATION (never moves position, size,
> fit or tooltip); unknown kinds and non-process items keep the plain
> drawing; the tooltip says "drawn as".  RoomEnvironment + sky light + sun
> with soft shadows, tone mapping, fog, AO and outline in High; grass,
> gravel plot, concrete pads; one bent tube per pipe on a portal rack.
> High/Fast toggle (Fast default on touch / <= 4 GB / <= 2 cores).  No new
> dependency; exported viewer still offline (508 -> 590 kB).  `--gui` 31/1,
> the one (`layoutPopOut.test.ts` matched a literal import) fixed and the
> five layout files re-run 108/108; typecheck clean; `equipmentModel.test.ts`
> 22 tests.  Not done: a COLUMN is stamped `vessel` like every drum, so the
> ladders/platforms go on any standing item taller than 5 m (a column-kind
> field would be an engine change); no pump drawing (no sizer stamps one);
> no frame rate measured on a real GPU.

> **C83. AN EDUTOOL: THE RADIATION OF A POOL FIRE AND THE DISTANCE IT
> SETS (Vítor, 2026-10-17: "Faz essa EduTool da radiação do incêndio de
> poça, se achares importante" -- the commander judged it important: it is
> where the separation tables' numbers come from, the risk-based half of
> C75's prescriptive layout).**  Outline (stated to Vítor in the same turn):
> (1) why a distance -- radiation falls with distance, harm has thresholds;
> (2) the pool -- mass burning rate (Burgess-Strasser-Grumer, USBM, public
> domain), diameter, heat release; (3) the flame -- height (Thomas),
> surface emissive power with smoke obscuration (Mudan), a cylinder; (4)
> the receiver -- point-source vs solid-flame view factor, atmospheric
> transmissivity; (5) thresholds and the distance to each (sources must be
> citable and licence-clean, e.g. US EPA RMP offsite consequence guidance,
> public domain), compared with the separation table a layout case
> declares; (6) limits -- wind tilt, smoke, terrain, prescriptive tables vs
> QRA.  The heat of combustion read from the engine's own catalogue
> (formation data), never a typed constant; every correlation cited by
> file:line where computed; no new tutorial case; no no-grant table
> transcribed.  Status: dispatched 2026-10-17.

> **C83 MERGED 2026-10-17.**  `gui/src/ui/methods/poolFire.ts` (pure) +
> lesson (13 steps) + bench; Process safety shelf, id `pool-fire`.  The
> heat of combustion is Hess on the catalogue records the Explorer reads
> (methanol 676.232 kJ/mol vapour basis; the liquid basis through the
> engine's own Watson, held to relief02's pinned 24 520.52 J/mol).  Fuels:
> methanol and acetone only -- the two with a public-domain measurement to
> calibrate k-beta (NIST TN 2082); no per-fuel handbook table (no-grant,
> and NUREG-1805 copies it).  Checked against NIST TN 2083's 1 m methanol
> fire, which the calibration never saw (16.52 vs 16.30 g/m2s; Heskestad
> 1.10 vs 1.10 m).  Four corrections to the brief, taught as such: the two
> receiver models do NOT converge far away (ratio -> (4/pi) chi_E/chi_r);
> the point source over-predicts beside a tall flame and under-predicts
> beside a squat one; Thomas is a poor primary height for these fuels
> (Heskestad default, flagged OUTSIDE its range for wide methanol pools);
> Mudan & Croce is stated for gasoline/kerosene/JP-4 only.  tau = 1 (no
> transmissivity model read); wind tilt named, not computed.  `--gui`
> 32/0 on the branch after merging C84; no engine change, no case.

> **C82. THE PLOT AREA AND THE COST OF THE LAND (Vítor, 2026-10-17:
> "Avança", on the commander's proposal after "o layout acaba por ser
> importante para avaliar os m2 de implementação e o custo do terreno?").**
> Measured: `EconomicsPass.cpp` has no land term (grep), the layout
> publishes no area.  Slice: (1) the layout publishes the PLOT AREA (rule
> stated: the declared sector areas where the case declares them, else the
> envelope of the placed footprints plus a declared margin; per-sector
> areas; pinned by the `layout` kind); (2) the economics reads a DECLARED
> land price (EUR/m2, with source/reason, an author-set assumption), and
> prices the land as NON-DEPRECIABLE capital at year 0, RECOVERED at the end
> of the project life (the working-capital treatment, Turton's), through the
> ONE cash-flow home `appraise`; shown in the capital table and the cash
> flow; `land.price` (or the area) available to the C68 sensitivity;
> absent a land price, every economics case byte-identical.  Witnesses: the
> two layout cases that already run economics (ammonia02_full_plant,
> greenAmmoniaPEQ_baseCase); aceticAcid02 publishes its area only (its
> README makes pricing the students' task).  No new case.  Status:
> dispatched 2026-10-17.

> **C82 MERGED 2026-10-17.**  The layout publishes the PLOT: the
> axis-aligned envelope of every declared sector area, placed footprint and
> routed pipe, grown by a declared `plot { margin; reason; }` (absent: 0 m,
> announced -- a lower bound); the sector union, overlaps, the footprint
> share and per-sector areas beside it.  Pipes are in the envelope (the
> general's reasoned disagreement with the brief, accepted: they occupy
> ground and the battery limits sit at the rack ends).  The economics reads
> `economics { land { price; source; reason; } }`, the area from the
> published plot (a declared `area` only where there is no layout; both or
> neither refuse), bought at t = -constructionPeriod, not depreciated,
> recovered untaxed at its purchase value at year N, outside TCI -- CAPCOST
> 2017's placement -- through `appraise` alone; `land.price` joins the C68
> sensitivity.  Nine economics cases without a layout byte-identical against
> the parent build.  Four rows MOVED and re-recorded with the list in the
> commit: ammonia02 NPV/IRR/payback, PEQ NPV (dNPV = -L(1+i)^Nc + L/(1+i)^N,
> to the euro).  Gates: `check_plant_layout` (j), `check_economic_
> sensitivity` (i)-(l), `check_cost_provenance` (s).  `--gui` 32/0,
> `--fast` 71/2 before the re-record (the two witnesses), 3/3 after.  NOT
> done: appreciation, scheduled purchase, land taxes, land under an outer
> driver without a declared `area`, a non-rectangular plot.

> **C80 MERGED 2026-10-17.**  The engine routes every material stream
> between placed items (nozzle at the item's top; one rack, declared as
> `pipeRack {}` or an announced default; lanes in flowsheet order;
> junctions -- mixer, splitter, valve -- on the rack at their neighbours'
> mean x; battery limits at the rack ends; waypoint overrides, diagonals
> refused) and publishes route, length, flow, T, P, vf inside `layout {}`;
> every unrouted stream listed with its reason.  The 3D view draws the
> tubes by phase (colour + particle shape + word) with flow at
> 1.2 + 2.4 log10(1 + m) m/s, labels reduced to the id with screen-space
> declutter, camera fitted on the plant (the live-site defects Vítor saw).
> Golden `layout` rows appended 52/85/64, none moved; `--gui` 32/0,
> `--fast` 73/0.  NAMED, not done: pressure drop and pipe cost; clash
> check (a route crossing a tall item); multi-item units connect through
> their first item; one rack per plant along x.

> **C81. EXPORT THE LAYOUT AS A SELF-CONTAINED PAGE (Vítor, 2026-10-17:
> "Avança!", on the commander's proposal after "No final vou ficar com um
> layout gerado pelo Choupo que os alunos podem partilhar e é dinâmico?").**
> A student's case lives in their own files, so its layout has no link to
> share.  An "Export as page" button on the 3D layout (Reports section,
> `?layout=` pop-out, EduTool bench) writes ONE self-contained HTML file
> from the run on screen -- the published `layout {}` and `pipes {}` blocks
> embedded as data, three.js and the scene code inlined (no network, opens
> anywhere), the 3D view with the animated flow, the findings and the pipe
> register, and a footer naming the case, the run fingerprint and the
> Choupo version.  GUI only, no engine change, no new case.  The download
> goes through the GUI's existing save path (the pop-out Blob pattern of
> gui-credo).  MERGED 2026-10-17: `ExportLayoutButton` in Reports, the
> `?layout=` pop-out and the EduTool bench; the page carries the engine's
> `layout {}` verbatim, the app's own scene mapping and renderer compiled
> with three.js into one script (`gui/scripts/layoutViewerPlugin.ts`,
> `virtual:layout-viewer`, lazy), no network at all, footer with case, run
> fingerprint, version, date and the three.js MIT notice; ~535 kB per
> page.  A STALE run is not exported (the button says to re-run).
> Headless Chromium: webgl2 canvas, no errors, no requests.  NOT seen in
> a real browser.

> **STANDING RULE (Vítor, 2026-10-17: "Não cries mais casos novos!!!!
> Usa o que já está!").**  No new tutorial case is created -- by the
> commander or any general -- for a witness, a fixture, a demonstration or
> an EduTool.  A slice uses the corpus as it stands (extending an existing
> case's dicts where the feature needs it); a gate's probe lives in a
> temporary copy of an existing case, never committed as a case.  A brief
> that would need a new case goes to Vítor first.  (Measured the same day:
> no case directory was added under tutorials/ since 2026-10-14 other than
> his own two acetic-acid rungs.)

> **C77 MERGED 2026-10-17 (the energy solves on the published surface,
> named in the C73/C74 decisions).**  The cstr's adiabatic/heatExchange
> balance and the pfr's march solve on the outlet's own resolved surface
> (`reactorOutlet::pricedOutlet` / `temperatureOfEnthalpy`, ONE
> `equilibriumAt` in `ReactorOutlet.cpp`); the pfr resolves the phase at
> every point of the bed (kinetics still on a liquid basis, said in code).
> No golden row moved; at 1 atm an adiabatic reactor whose product boils
> now publishes Q ~ 0 and a jacketed one Q = UA(Tc - Tout) (was +9 kW).
> Found and fixed on the way: the cstr scan ceiling's Newton stalled on the
> boiling kink and cstr05 at 1 atm found ONE steady state of three at exit
> 0.  Cost: one flash per point -- ammoniaReactor04 3.3 -> 9.2 s,
> greenAmmonia03 47.6 -> 65.2 s.  NAMED, not fixed: the cstr scan ceiling
> is still a heuristic (composition at T + 1000 K); exposing P as a knob
> in the van Heerden EduTool is a pedagogy call left open.

> **C80. PIPES BETWEEN THE ITEMS, AND THE FLUID SEEN MOVING (Vítor,
> 2026-10-17: "os meus alunos tinham as colunas implantadas com as
> tubagens ligadas entre eles e até tinham o fluido a passar
> estilizadamente!!!").**  The slice C75 already named as next (pipe
> lengths), widened to what his students' drawing showed.  Stated defaults
> (the commander's; pipes are new physics only in their LENGTH, which is
> pedagogy already approved as "the trade-off becomes real when pipe
> lengths exist"): ENGINE -- every stream joining two PLACED items becomes
> a pipe, routed ONCE, deterministically, orthogonally (up from the source
> nozzle to a declared rack elevation, along x then y, down to the target;
> a case may override a route with declared waypoints), its length
> published in a `pipes {}` result block with the stream's identity, flow,
> phase (vf) and direction, a golden kind or an argued existing one, and
> no pressure drop or cost yet (named as the next slice); COLUMNS appear
> wherever a column is sized (C79 brings aceticAcid02's).  GUI -- the 3D
> view draws each pipe as a tube along the published route, coloured by
> phase in more than one channel (liquid / vapour / two-phase), with an
> ANIMATED, stylised flow along the published direction (speed a
> monotone function of the published flow, said in a legend; a toggle to
> stop it; reduced-motion respected).  Nothing routed or computed in the
> GUI.  Queued behind C79 (both touch PlantLayout.cpp).

> **C78. THE 3D LAYOUT IN ITS OWN POP-OUT TAB (Vítor, 2026-10-17: "Mas
> devia de haver um pop up para o layout 3d no Gui").**  Today the 3D view
> lives only inside Reports -> "Plant layout (3D)" and the EduTool bench.
> The GUI credo's answer to a large view is a POP-OUT (a real browser tab,
> never a modal: `docs/ai/gui-credo.md` §4 item 4 and "Tab citizenship"),
> on the `?internals=` precedent (`gui/src/ui/unitFocus.ts:223`,
> `AppShell.tsx:111`, `ExpiredTabPanel.tsx`): a `?layout=` tab drawing the
> SAME published `layout {}` block full-window, opened by a button on the
> Reports section (and wherever else the layout is drawn), surviving F5,
> titled, and saying "expired -- reopen from the parent" when its source is
> gone.  MERGED 2026-10-17: `?layout=<key>` tab (`LayoutPopOutTab.tsx`,
> pure logic `case/layoutPopOut.ts`), stash per source never consumed (F5
> redraws), follows the parent's new runs without resetting the camera,
> dims by the parent's own staleness, expired panel names how to reopen;
> buttons on Reports and the EduTool bench; the tables have one home
> (`PlantLayoutTables.tsx`).  Validated on main e1a94d3bc + C78: `--gui`
> 32/0 (5469 tests).  NOT seen in a browser (none in the container).

> **2026-10-17, Vítor: "Não me chateies com coisas que tu sabes bem
> resolver!"** -- taken by the commander, recorded here: (1) C73 group A
> (pfr_polyesterification, polycaprolactonePlant: the pfr duty on the
> published state, the first law closes) RE-RECORDED; (2) C73 group B
> (cstr04/05/06, pfr04: a liquid esterification whose product is all
> vapour at 1 atm and 394-454 K) declared at 15 bar, where the product
> holds the liquid and every golden number reproduces to the printed
> digit -- a liquid-phase reactor at 454 K is pressurised; the energy
> solves on the published surface are the NEXT slice (C77); (3) C74's 8
> boundary rows RE-RECORDED (each moves by exactly its mixer duties); the
> combination C73+C74 re-measured on polycaprolactonePlant before
> recording; KNOWN_OPEN re-seeded by `--seed`.  (4) C76: the layouts go in
> the repository's reference cases; students copy the layoutDict.
> Standing reading: technical calls inside an agreed scope are the
> commander's -- ask only architecture, pedagogy, RESERVED, irreversible.

> **C76. THE LAYOUT IN THE TWO PEQ PROJECTS (Vítor, 2026-10-17: "Podes por
> isso nos dois projetos de PEQ que estou a acompanhar?  NH3 e Ácido
> Acético").**  Measured: NH3 = `tutorials/plant/greenAmmoniaPEQ_baseCase`
> (has a sizing pass); acetic acid = `aceticAcid02_plant` (NO
> `system/postDict`, so no design/ sheets and nothing a layout can place).
> Plan, queued behind C75 slice 1 (it needs the grammar, the check and the
> draft tool): (a) aceticAcid02 gains a sizing pass (only sizers that
> already exist; a unit with none is listed, not invented; new rows
> appended, none moved); (b) both cases get a layoutDict produced by
> `choupo-layout --draft`, its separation table, wind and ATEX zones
> declared as LABELLED ASSUMPTIONS for the students to replace with their
> own site data (never presented as the students' design).  MERGED
> 2026-10-17: aceticAcid02 gains a sizing-only postDict (preheater 58.3 m2,
> reactor on a declared 3 m3, two drums by residence time; M1/M2/purge/
> letdown not sized), re-sealed (SS316 + 10 utility records mirrored,
> staged run reproduced the golden); both cases carry a layoutDict whose
> distances, wind and zones are labelled student placeholders, with
> findings left ON PURPOSE (acetic: control room downwind of three CO
> sources; NH3: tanks 12 m vs 17 m, a substation inside a zone 2); goldens
> APPENDED only (89 + 170 rows), none moved; `--gui` 32/0 on the
> combination.  OPEN, the commander's (C79): (a) the lights column cannot
> be sized -- `TrayHydraulics` takes `thermo.density(Liquid)` on a liquid
> carrying supercritical CO: design mode refuses with a misleading "two
> downcomers leave no active area", rating mode exits 0 printing dP -nan;
> (b) a layout REFUSES the whole run when one placed item's sizer refused
> -- it should announce and leave the item unplaced.  C79 MERGED 2026-10-17:
> (a) the NaN was born in Rackett (`DerivedClosures.H:69`, pow of a
> negative 1 - T/Tc for CO and DME above Tc) and slipped past two `<=`
> guards NaN never fails; `TrayHydraulics::liquidDensity` is now the one
> door (via `pricedDensity::select`, dropped components announced once,
> `liquidDensityUnpricedFraction_max` published), every hydraulic number
> must be finite or refuse by name; 24 column/plant cases byte-identical.
> (b) a refused sizer leaves its item unplaced, announced as a
> `sizingRefused` finding (check_plant_layout arm g).  aceticAcid02's
> lights column sized (D 0.338 m x H 11.2 m, 18 trays, 80 % flood) and
> placed; 69 rows appended, layout summary rows recorded by the commander
> (placed 5 -> 8, internal 0 -> 1).  Validated: distillation 21/0, the
> three layout plants, `--gui` 32/0, `--fast` 73/0.  NAMED, not fixed:
> `ThermoPackage::density` returns NaN silently for a liquid holding a
> supercritical component (`Vmix <= 0` does not catch NaN -- a shared path,
> needs the full sweep); under `model simultaneous` no `Q_condensate_m3_s`
> is published, so a simultaneous column's reflux drum cannot be sized.

> **C75. A PLANT LAYOUT IN 3D: A DICTIONARY, A TOOL AND AN EDUTOOL (Vítor,
> 2026-10-17: "Podes fazer um EduTool com isso, criar esse dicionario e
> criar uma tool para gerar o layout 3D?" -- after a student of his had an
> assistant draw her flowsheet's plant in 3D).**  The commander's reading,
> put to him first: the 3D picture is the easy half; what a student learns
> is PLACEMENT (separation distances, access, flow order, sectors as areas)
> and what it costs (pipe lengths).  Slice 1 (dispatched): `system/
> layoutDict` -- DECLARED positions/orientation per sized item, sectors as
> areas, a separation table DECLARED by the case with its source (no
> spacing table is shipped in `data/standards/`: the usual ones -- CCPS,
> GAP 2.5.2, Mecklenburgh -- are no-grant, CLAUDE.md §10 licence policy);
> an engine check that refuses overlaps and announces every pair closer
> than its declared distance; `bin/choupo-layout --draft` writing a
> PROPOSAL from the topology and the design/ sheets (announced as a draft,
> never overwriting without --force, the choupo-init0 posture); the GUI's
> 3D view drawing the design/ geometry at the declared positions.  Slice 2
> (EduTool lesson) waits on Vítor's yes to its outline.  Status: slice 1
> dispatched 2026-10-17.  LESSON OUTLINE APPROVED the same day ("Aprovo,
> acrescenta o vento dominante e as zonas ATEX"): (1) why layout matters
> (safety/domino, pipe cost, operation/maintenance access); (2) separation
> distances, what they are and why Choupo ships no table; (3) guided
> exercise from the draft; (4) the trade-offs; (5) what the model does not
> do; PLUS prevailing wind (ignition sources upwind of release sources) and
> ATEX hazardous-area zones (declared zone 0/1/2 envelopes per release
> source, ignition sources outside them; no IEC 60079-10-1 / EI 15 / API RP
> 505 extent table transcribed -- the case declares its own).  Wind and
> zones were folded into slice 1's grammar and check; the lesson is slice 2,
> after slice 1 merges.
> MERGED 2026-10-17 (slice 1): `system/layoutDict`, the check in
> `postProcessing/layout/PlantLayout` (refuses overlaps / unknown, duplicate
> or internal items; announces shortfalls), `bin/choupo-layout --draft`,
> golden kind `layout`, Reports "Plant layout (3D)" (three.js), witness
> `ammonia02_full_plant` (78 rows appended, none moved), gate
> `check_plant_layout` (7 sabotages), record
> `docs/design/a-plant-layout-is-declared-and-checked.md`.  Validated: the
> 20 sized cases 20/0, `--fast` 73/0, `--gui` 32/0; 84 cases byte-identical
> but for the banner's commit.  NEXT slice named: pipe lengths.
> SLICE 2 MERGED 2026-10-17: the EduTool `plant-layout` (Process design &
> economics shelf), eleven steps on the approved outline incl. wind and
> ATEX, a bench that runs `ammonia02_full_plant` in the browser with seven
> guided moves (each run natively first), every engine claim cited
> file:line and held by its test; `--gui` 32/0.  Said plainly on the page:
> the draft tool is command-line only; no pipe lengths yet; the zone check
> tests only declared ignition sources against declared envelopes.  OPEN
> (finding): `docs/designGuide.tex` ~l.1932 quotes a ~15 m setback
> attributed to IRI/GAP and API 521 beside "Choupo ships no spacing
> table" -- RECONCILED the same day: the guide now calls it an
> order-of-magnitude orientation the engine does not carry, marks the cited
> standards "not read here", and points to layoutDict and the EduTool.

> **C73 + C74, AND TWO DECISIONS TAKEN (Vítor, 2026-10-17: "avança como
> achares melhor", on the three open items after C72).**  Taken: (1)
> `ammoniaRoutes01_screening` KEEPS 0.02 bar -- it is the case's own stated
> LHV reference basis, not a workaround, and moving it is a pedagogy change
> nobody asked for.  (2) **C73**: the C72 rule extended to `cstr` and `pfr`,
> which publish their inlet's vf with "no phase change in a reactor"
> (`CSTR.cpp:419,882`, `PFR.cpp:414,1090`; 33 flowsheets use them).  (3)
> **C74**, the engine half of aceticAcid02's M1: an ISOTHERMAL `mixer`
> (`operation { T ...; }`) skips the energy balance and publishes NO duty
> (`Mixer.cpp:85-98,252,378`), so the heat that brings its outlet to the
> declared T comes from nowhere -- the -80 kW of aceticAcid02 is that heat.
> A declared T is legitimate (a mixer + heater); the duty it implies must
> be published and priced on the report's surface, or the plant's first law
> cannot close.  19 flowsheets declare a mixer T.  Both: moved golden rows
> LISTED to Vítor before any record.  Status: dispatched 2026-10-17.
> **C73 and C74 MERGED 2026-10-17, together** (merges 4e1e64bb8 and
> 2fceedf74 on `integ/c73-c74`, no conflict; rows d842dcbb6; cases
> 9442a63a6).  The moved rows were MEASURED ON THE COMBINATION, on
> current main, and matched the two lists exactly -- nothing else moved
> beyond acetonePlant's columnFeed F, C1/C2 x_D_LK and vent F_alpha in the
> 12th significant digit, NOT re-pinned.  Recorded (only the listed rows
> taken from `--record`, every other golden line byte-identical):
> pfr_polyesterification 5 (Q_kW, Q_boundary_kW, 3 cooling-water utility
> rows), polycaprolactonePlant 5 (the same five; its Q_boundary_kW
> -48.6297 -> -38.0202 kW is C73's +8.4650 plus C74's +2.1445), and
> aceticAcid02_plant, acetonePlant, hda 2 each (Q_boundary_kW,
> residual_kW).  Both residual_kW rows that went to round-off
> (pfr_polyesterification -9.3303 -> 0, polycaprolactonePlant -10.6095 ->
> 3.8e-8 kW) were DROPPED, by the recorder's own 1e-3 kW threshold -- a
> fresh record would not pin them.  `check_energy_closure` KNOWN_OPEN
> re-seeded with `--seed` (full steady corpus): pfr_polyesterification
> 18.3420 % and polycaprolactonePlant 15.3450 % LEFT (both 0.0000 %);
> aceticAcid02 stays out; KNOWN_OPEN_KW unchanged (userOp01, a `code/`
> case `--seed` cannot run, kept).  Group B: cstr04/05/06 and pfr04 declare
> `P 15 bar;` on `0/feed` and `0/reactorOut`, with one sentence in each
> header (README for cstr04) -- all four PASS their existing goldens, NO
> re-record, vf 0 at the outlet and no rung advisory.  One GUI test pinned
> the old spelling (`vanHeerdenTool.test.ts` wrote a Pa value under the
> dict's unit, producing `P 200000 bar;`): it now writes in bar
> (f75bd6639).  GUI `file:line` citations into CSTR/PFR/ConversionReactor/
> Mixer re-read on the combination: all still point at their lines.
> Validated on the combination + main (C75 slice 2 merged in): the 63
> cstr/pfr/conversionReactor/mixer cases 58/5 before the record and 5/0
> after, `--fast` 73/0, `--gui` 32/0, check_inlet_resolution,
> check_energy_closure, check_energy_boundary_pinned,
> check_utility_allocation_pinned, check_mass_closure,
> check_caveat_surface, check_design_sheet, check_plant_layout,
> check_compile_clean, check_std_includes, check_wasm_dialect and
> gate_manifest --check all OK (5 manifest claims refreshed).  NEXT: C77,
> the adiabatic/heatExchange energy solves on the published surface.

> **C72. A CONVERSION REACTOR'S OUTLET MEANS ITS OWN EQUILIBRIUM (Vítor,
> 2026-10-17: "Aprovo o 2, avança" -- approving the commander's proposal to
> revise the 2026-08-24 F2 posture).**  `ConversionReactor.cpp:286` and
> `:470` stamp the INLET's vf on an outlet at another T and z (C68 finding
> iii: `ammoniaRoutes01_screening` runs at 0.02 bar to stay ideal-gas).
> Approved: the outlet is resolved by the engine's own equilibrium home
> (`unitOperations/flash/StreamEquilibrium.H`), never invented and never
> hard-stamped; the duty stays priced on the state published.  Moved
> golden rows are LISTED to Vítor before any record.  Also running: the
> commander's GUI tornado for the C68 `sens_` KPIs (branch
> `claude/gui-tornado`) -- MERGED 2026-10-17: `economics.sensitivity {}`
> on the result JSON (rows of sensitivity.csv, its order, its caveat; only
> when declared), 36 `sens_*_value_{low,high}` rows appended, Reports draws
> the tornado in the engine's order; NOT yet looked at in a browser.
> C72 MERGED 2026-10-17: the outlet's vf is `equilibriumAt` at its own
> (T, P, z_out) in the unit's own thermo world, the duty priced on that
> state; a declared inlet phase is NOT carried (a statement about the
> inlet) and a departure is announced once with its remedy.  NO golden row
> moved (13 cases compared number by number; only chlorophenol01's
> unpinned `crude` vf 0.397 -> 0.472).  The 2026-08-24 witness (liquid
> esterification, 350 K) re-built in scratch: vf 0, closes 0.0000 kW.
> Gate `check_inlet_resolution` arm (m), 4 sabotages.  Validated on top of
> main (tornado + includes): conversionReactor cases 12/0, `--gui` 31/0,
> `--fast` 73/0.  FINDINGS for Vítor: (a) ammoniaRoutes01 keeps 0.02 bar
> for its own stated reason, the LHV basis -- at 1 atm water condenses
> (HHV), a pedagogy call; (b) `cstr` and `pfr` still carry their inlet's
> vf (`CSTR.cpp:419,882`, `PFR.cpp:414,1090`), the same shape -- next slice
> if he extends the ruling.  Also 2026-10-17: `check_std_includes` was red
> on main (10 borrowed headers from C66/C67/C69), fixed without moving a
> line (59d921170).

> **C71. ADD THE UPLOADED CASE `aceticAcid02_plant` (Vítor, 2026-10-14:
> "Podes adicionar este caso ao repositorio?").**  A sealed plant case
> (Gibbs reactor + condenser + CO recycle/purge + degasser + lights column,
> base case not optimised).  Both rungs ARRIVED by Vítor's own push
> (7453fea9a, `aceticAcid01_gibbsReactor` + `aceticAcid02_plant`, sealed,
> NO `expected` golden -- recorded on a build older than `Valve.H`).
> Measured on arrival, still open: no golden on either; aceticAcid02's
> controlDict says "two recycles" where its README and flowsheet have one;
> its README says the engine has no acetic vapour dimer (true of its UNIFAC
> path only); first law open at -80 kW (1.4 %), to be pinned as a measured
> debt.  Status: the general dispatched on the upload was STOPPED by Vítor
> (2026-10-14); "avança" the same day -- follow-up dispatched: goldens
> for both (appended, new cases), the two text fixes, the -80 kW pin,
> FASTSET per its rule, catalogue and tutorials guide.  MERGED 2026-10-14: goldens
> recorded (aceticAcid01 37 rows, aceticAcid02 164; new files, no row
> moved); controlDict, the stale second flowsheetDict diagram and the
> README dimer sentence corrected (the dimer lives on the reactive path,
> `ReactiveVLE.cpp`; this gamma-phi package does not use it); first law:
> aceticAcid01 +0.34 kW, aceticAcid02 -79.98 kW (1.3610 %) PINNED in
> `check_energy_closure.KNOWN_OPEN`, measured not diagnosed -- the byUnit
> report puts +82.77 kW at M1 (a mixer at a DECLARED 320 K) and -2.79 kW at
> the reactor; aceticAcid01 in FASTSET, aceticAcid02 EXCLUDED at 46.5 s.
> Validated: both cases PASS, `--fast` 73/0, the touched gates OK.  OPEN
> for Vítor: whether M1's declared temperature (the likely home of the
> -80 kW) should become adiabatic or a heater.

> **C70. THE LETDOWN EDUTOOL, REVIEWED (Vítor, 2026-10-12: "O chatGPT
> reviu isto.  Pode ver o que podes aproveitar?").**  A 15-point review of
> the C64 large-pressure-letdown EduTool plus three citation fixes; the
> commander's reading: all 15 are substantively right (the architecture of
> the chapter is kept).  Taken: no universal 10x ratio criterion; a valve
> conserves h -- what is destroyed is availability/exergy, never "pressure
> energy degraded into internal energy"; "222 kW hydraulic power
> dissipated", not "heat"; choking limits MASS FLOW (supersonic flow can
> exist downstream); the gas equation shows the cap
> x_eff = min(x, F_gamma x_T); "chokes later" is true only for the
> illustrative x_T = 0.7; F_F carries its square root wherever printed
> (the lesson source has it, verify the render); P_vc = -3.44 bar is the
> single-phase extrapolation, NONPHYSICAL -- vaporisation chokes first,
> near P2 = 20 - 0.81(20 - 1.75) = 5.22 bar; "two-phase equilibrium state"
> not "boiling point" (dissolved H2/N2/Ar; IEC liquid equations not meant
> for mixtures); "even a small pressure reduction CAN begin to release
> dissolved gas"; staging prevents/mitigates cavitation, cannot remove
> thermodynamically required final flashing (an orifice moves it); IEC
> 60534-8-4 does not predict flashing noise; the 74.6 K expander outlet is
> a FORMAL ideal-gas estimate (condensation possible, needs an isentropic
> equilibrium flash); ANSI/ISA-75.01.01-2012 and ISA-RP75.23-1995 (R2024)
> (to be verified against ISA's own listing before citing); EU 80/85/87
> dB(A) are daily L_EX,8h values, weekly only in the directive's specific
> circumstances.  MERGED 2026-10-12: all 17 applied; the gas code already
> capped Y at 2/3 (now written as x_eff explicitly, same numbers); no render
> had lost F_F's root; both ISA designations and the directive's Art. 3(3)
> verified at the source; the Design Guide's control-valve table had a
> flashing row prescribing anti-cavitation trim (split into no-vapour /
> cavitation / flashing).  `--gui` PASS 31 / FAIL 0, no golden moved.

> **PHASE CONSOLIDATED 2026-10-12 (Vítor: "Consolida esta fase como achares
> melhor", weekly credit near its limit).**  `main` 23d4cdbcb is clean, no
> general running, no branch unmerged.  MERGED this phase: C60 safety
> EduTool (+2 reviews), C61 overpressure, C62 relief valves, C63 DCF
> start-up years and working capital, C64 letdown EduTool, C65 data debts,
> C66 beds sized by criterion (Ergun), C67 kinetics in the case
> (`ReactionRate` factory, `type expression`), C68 ladder renames +
> `ammoniaRoutes01_screening` + feasibility sensitivity (tornado) + the
> feasibility -> basic-design comparison, C69 cooled multitubular pfr + one
> converter shell at one diameter.  Site published through C69.
> OPEN, VÍTOR'S (pedagogy / RESERVED), in the order they block work:
> (1) price the feasibility appraisal at its own pinch target too, so the
> stage comparison isolates the models (C68; today +187 MEUR of the +152
> is the heat recovery the feasibility flowsheet omits); (2) a two-way /
> scenario sensitivity (H2 and NH3 together is what flips the NPV); (3) the
> coolers' shells counted twice in the converter (C69); (4) 167 bar shell
> materials (SS rated 100 bar); (5) acetic-acid dimerisation architecture;
> (6) re-import of the 35 sealed NH3 cases; (7) the 13 case-local DECHEMA
> pair records; (8) Eq 39 below 150 atm; (9) L/D 1.5 and 8 mm particles;
> (10) CAPCOST labour factor 2.76 vs 2.73; (11) catalyst activityFactor;
> (12) FEL/AACE wording in the FEL EduTool; (13) PEQ H2/electricity
> prices (H2 at 4.50 EUR/kg against 0.100 EUR/kWh leaves nothing for the
> electrolyser); (14) tube-rupture 2/3 vs 10/13 (unverified).  NEXT SLICES
> the commander would take, none started: the `conversionReactor` outlet
> vf stamped from the inlet (C68 finding iii, state family); a GUI tornado
> for the `sens_` KPIs; a per-route screening pass (C68 finding ii).

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
     (PARTLY CLOSED 2026-10-17, C85: `maxT` is now compared with each sized
     item's hottest port and ANNOUNCED by `src/postProcessing/sizing/MaterialLimits.H`, beside
     the maxP comparison; still no design temperature and still one
     temperature-independent `sigma_y`.)
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

**C69. HEAT EXCHANGE IN AND AROUND A CATALYST BED: A COOLED MULTITUBULAR
PFR, AND A MULTIBED CONVERTER THAT IS ONE VESSEL (Vítor, 2026-10-12,
asking whether a PFR can size an internal heat exchanger "em contacto com o
catalisador ou a seguir ao enchimento", and relaying a second opinion he
accepted).**  Measured: the `pfr` already has `thermalMode heatExchange`
with a DECLARED U, a DECLARED `areaPerVolume` and a CONSTANT `T_coolant`
(`src/unitOperations/reactor/PFR.cpp:755-769`, U a (T_c - T) per unit
volume, marched with the species by the same RK4).  Missing: (a) a coolant
that changes temperature along the bed (co-current / counter-current, its
own energy balance; boiling = constant T as today); (b) the area from a
TUBE GEOMETRY (number of tubes, tube inner diameter -- a multitubular
reactor), so a designSpec can SOLVE the tube count against a hot-spot or
outlet target; (c) U from a PACKED-BED WALL heat-transfer correlation, cited
and windowed (NOT an empty-tube Dittus-Boelter); (d) a sizer for the
multitubular reactor; and (e) the ammonia case's three beds and two
interbed coolers grouped as ONE multibed CONVERTER -- a sector whose items
share ONE pressure shell in sizing and costing (today three shells are
priced), the interbed exchangers kept as their own blocks (the
interbed-exchanger converter is an industrial reference, e.g. a three-bed
radial converter with interbed exchangers -- cite a source read).
Sequenced AFTER C66 merges, the C68 renames and C67 (all touch the pfr or
this case).  Status: dispatched 2026-10-12 after C67 merged.
BUILT on branch `claude/c69-heat-exchange` (not merged): part A, the cooled
multitubular pfr (tube geometry, coolant co/counter-current/boiling, a
packed-bed wall correlation; witness `pfr05_cooled_multitubular`, gate
`check_cooled_pfr`); part B, the CONVERTER sector and `type converterShell`
(gate `check_converter_shell`).  Part B's first one-shell vs three-shell
comparison (31.4 vs 18.7 MEUR) was MEANINGLESS -- the beds kept DIFFERENT
diameters inside one shell -- so the rule taken: inside a converter the
beds share ONE diameter, the shell's (declared, or the smallest D whose
Ergun drop meets every bed's allowable, announced with the binding bed),
each bed's height V_R/(pi D^2/4), a bed's own `L_over_D` refused there.  A
container restart killed that work mid-flight on 2026-10-12; its surviving
edits were committed as WIP (3deb0b4fe) and the work resumed.
MERGED 2026-10-12.  D is NOT declared on the shell (the brief's form,
rejected with the reason): the Ergun drop is integrated with the
reactions, so D must be known during the solve -- its one home is the
flowsheet variable the beds read, solved by a new `designSpec` target
`largestOf ( ... )` (largest bed dP/allowable = 1), and the shell sizer
CHECKS it (`D_smallestAdmissible`, binding bed, bracket).  greenAmmonia03:
D 2.2283 m, Bed3 binding (Bed1 0.31, Bed2 0.62); at EQUAL diameter one
shell 16.79 vs three 15.90 MEUR (the coolers sit inside at full D and
167 bar); FCI 61.02 -> 59.14, NPV -344.68 -> -340.93 MEUR.  Goldens
re-recorded after the list was shown (199 + 7 + 1 rows moved, 277
renamed, 33 new, 42 retired).  Also: `bin/runTests` printed a failing
row containing `%` as a format string (fixed).  NAMED, not fixed: the
coolers' shells counted twice (converter height AND each cooler's Turton
cost); no head space/distributor in the shell height.  Record
`docs/design/a-converter-is-one-shell.md`.  NEXT: the feasibility ->
basic-design comparison (C68 addition) is unblocked.

**C68. ONE LADDER FOR THE AMMONIA CASES, AND ITS MISSING FIRST RUNG
(Vítor, 2026-10-12, verbatim: "os vários níveis de simulação do processo de
amónia têm a nomenclatura confusa. Não se percebe a sequência de
refinação da simulação, desde o Gibbs, ao pfr com dimensionamento
detalhado de tudo", then "Avança com isso e faz também o screening").**
Measured: two ladders on two axes share one vocabulary --
`ammoniaStaged01_yield`..`04_kinetic` is a REACTOR-MODEL ladder in one
loop (its texts say "stage A of three" and "stage D of four"), while
`greenAmmoniaFeasibility`, `...50bar`, `greenAmmoniaBasicDesign` are
PROJECT-STAGE rungs (FEL-2, FEL-3) of the whole plant, and
`greenAmmoniaIndustrialN2` (the PEQ base case, a hybrid) is named by its
N2 source; there is NO ammonia FEL-1 screening (route screening exists for
methanol only: `screen01_methanol_routes`, `RouteScreeningTool`).
Decided (names on a stated default, flat prefixed names because the case
index and FASTSET treat each `tutorials/plant/<dir>` as one case family --
nested case folders were not measured to work):
"greenAmmonia1_screening" (NEW, FEL-1: input-output gross margin of the
reaction routes), "greenAmmonia2_feasibilityGibbs150bar",
"greenAmmonia2_feasibilityGibbs50bar", "greenAmmonia3_basicDesignPFR",
"greenAmmoniaPEQ_baseCase" (outside the ladder, says it is the hybrid base
case), and the reactor ladder "ammoniaReactorLadder1_conversion",
`2_gibbs`, `3_gibbsApproach`, `4_pfrKinetic` ("rung N of 4"); a README map
of the sequence (stage, reactor model, exchangers, estimate class, what is
decided); old names kept as aliases so shared `?case=` links resolve.
Sequenced: the screening case now (new files only); the renames AFTER C66
merges (it edits greenAmmoniaBasicDesign), and BEFORE C67.  Status:
screening dispatched 2026-10-12.
NAMES REVISED 2026-10-12 after a second opinion Vítor relayed (accepted):
keep the TWO axes (reactor-model fidelity vs project stage -- one ladder
would teach that a project only matures by swapping Gibbs for a PFR),
name each case by its PURPOSE, models in the description, two digits:
"ammoniaRoutes01_screening" (three production routes, not "green"),
"greenAmmonia02_feasibility150bar", "greenAmmonia02_feasibility50bar"
(an exploratory alternative of the same stage, its catalyst hypothesis
visible), "greenAmmonia03_basicDesign", "greenAmmoniaPEQ_baseCase"
(the brief's reference case, different detail in different equipment --
outside the numbering, linked to both), "ammoniaReactor01_fixedConversion",
`02_equilibrium`, `03_equilibriumApproach`, `04_kineticSizing` (the engine
solves the volume); `ammonia01/02/03` stay as "synthesis-loop
fundamentals" with their 200 bar, capacity and model boundary stated (no
"full ammonia plant" claim if syngas production is not modelled); aliases
kept, the catalogue shows canonical names only.  Three additions taken:
the screening compares routes on an equivalent basis (assumed specific
energy consumptions); the feasibility cases gain a preliminary CAPEX and a
sensitivity; a feasibility -> basic-design comparison of consumptions,
investment and profitability, each difference traced to the model change.
And FEL stage is never equated with an AACE class (maturity of definition
decides the class): tables say "illustrated design stage".
SCREENING MERGED 2026-10-12 (8ebf3325e): `ammoniaRoutes01_screening`, green
/ grey / blue on raw materials and on assumed specific energy consumptions
(margins after energy per kg NH3: green from water and electricity -0.031,
grey 0.554, blue 0.611 EUR; green at the PEQ battery limit 0.130).  FOUND:
(i) the PEQ base data's H2 at 4.50 EUR/kg against electricity at 0.100
EUR/kWh buys 45 kWh/kg H2, 1.35x the electrolysis floor, nothing left for
the electrolyser -- put to Vítor; (ii) the margin table is worked BY HAND in
the README from engine-published flows (EconomicsPass prices one plant per
run and refuses without costed equipment) -- a per-route screening pass is
an architecture decision; (iii) a `conversionReactor` stamps its inlet's
vapour fraction on an all-gas outlet at 1 atm (the case runs at 0.02 bar to
stay ideal-gas) -- an engine defect of the state family, not yet fixed;
(iv) RouteScreeningTool is methanol-specific, generalising it is a few
hundred lines, not done.
RENAMES DONE 2026-10-12 on branch `claude/c68-renames` (not merged): the
eight directories and their `.cho` markers moved by `git mv` to the revised
names; every current reference followed (FASTSET, the gates and pin lists,
the GUI's EduTools and tests, `docs/ai/`, the catalogue, the guides --
regenerated and rebuilt -- CLAUDE.md, engine comments, case cross-links);
the reactor ladder says "rung N of 4" throughout, and the green sequence
and its postDicts say "illustrated design stage" and that `estimateClass`
is the author's statement of maturity.  ONE alias home, `tutorials/ALIASES`
(old -> new identifier): the GUI resolves `?case=<old>` and a drilled
`<old>/<unit>` through it and corrects the address bar, `bin/runCase`
resolves an old path ANNOUNCED, and `check_doc_references` lets THIS
file's dated records keep the name a case had when they were written (and
only this file).  No golden moved.  The dated records here, the design
records under `docs/design/` and CHANGELOG keep the old names on purpose;
the FEL EduTool's per-stage class column (the record's §2.3 table) now
reads "usually" -- whether the tool should drop the stage-class pairing is
a pedagogical question for Vítor.
FEASIBILITY SENSITIVITY dispatched 2026-10-12: measured, both feasibility
cases already carry a preliminary CAPEX (Turton, class 4, a declared
accuracyBand); what was missing is the sensitivity, and a `sweep` cannot
vary postDict prices (SweepDriver.cpp:148 varies flowsheet paths only).
Stated default: an opt-in `economics { sensitivity {} }` one-at-a-time
analysis on the same converged pass, one cash-flow home.  The
feasibility -> basic-design comparison waits for C69.
MERGED 2026-10-12: `economics { sensitivity {} }` (relative|absolute
stated per input; `FCI { relative accuracyBand; }` -- the declared band
had been PRINTED and reached no NPV until then), one cash-flow home
`appraise`, gate `check_economic_sensitivity`; 9 other economics cases
byte-identical, no golden moved, 40 new `sens_` rows.  What the tornado
teaches: H2 and NH3 prices +-20 % swing the NPV ~14x the whole capital
band; no single input flips the sign (break-even H2 ~3.55 EUR/kg or NH3
~1.21 EUR/kg); a higher discount rate and fewer hours IMPROVE the NPV
because the plant loses 69.4 MEUR/yr operating; 150 vs 50 bar differ by
4.3 MEUR, less than any bar.  OPEN for Vítor (pedagogy): a two-way /
scenario analysis (H2 and NH3 moving together is what would flip it);
no tornado drawn in the GUI yet (DRAWN 2026-10-17, branch
`claude/gui-tornado`: Reports "Economic sensitivity (tornado)", from a new
`economics.sensitivity` result block; gate arm (h)).
STAGE COMPARISON MERGED 2026-10-12 (branch `claude/c68-stage-comparison`):
`bin/curate/gen_ammonia_stage_comparison.py` writes a section
of `tutorials/plant/greenAmmonia03_basicDesign/README.md` (home chosen: the page the student
at rung 3 opens, which already carried two hand comparisons, both stale --
replaced by pointers) from three engine runs (the two cases and the
feasibility case at the basic design's start-up years); `--check` gated in
`bin/runTests`.  Measured: NPV -493.10 -> -340.93 M EUR, of which the
feed/effluent exchanger the feasibility flowsheet omits BY CONSTRUCTION is
+187.45 (molten salt no longer bought +182.56) -- more than the whole
difference; the model refinements together -39.13 (converter shell -26.49,
less steam, more refrigeration, interbed coolers); the catalyst the
feasibility did not cost -7.82; the start-up years, a CHANGED ASSUMPTION,
+10.14 on the feasibility plant but -1.33 on the basic-design one (the
ramp-up saves more on the plant that loses more per year).  FOUND: the
catalogue's "ten relief valves" was stale after C69 (eight; fixed); the
loop pressure drop is DECLARED in both stages (separator 140 bar), the Kern
exchanger drops are not applied to the streams.  OPEN for Vítor
(pedagogy): whether the feasibility appraisal should be priced at its own
pinch target as well, so the stage comparison isolates the models.

**C67. A CASE CARRIES ITS OWN KINETICS: RATE EXPRESSIONS IN THE DICT, AND A
FACTORY A CASE'S `code/` CAN REGISTER INTO (Vítor, 2026-10-12, verbatim:
"Eu até aceito o /user, mas o código tem de ficar no caso!!! ... Isto é a
única forma de o caso ficar auto contido", then "Faz o 3" to the
commander's three options -- ARCHITECTURE DECISION, his).**  Measured: the
`pfr` dispatches kinetics on a fixed word list, `{ "Arrhenius", "LHHW",
"dysonSimon1968" }` (`src/unitOperations/reactor/PFR.cpp:101`, `:353`,
`:733`), not a factory; the Dyson-Simon constants are `constexpr` in
`src/unitOperations/reactor/kinetics/AmmoniaSynthesisRate.cpp:42-54`;
case-local C++ exists for UNIT OPERATIONS only (`<case>/code/` +
`registerUserTypes()`, built by `bin/buildCode` into a per-case binary,
`src/applications/choupoSolve/main.cpp:128-134,459`; witnesses
`tutorials/steady/userops/userOp01_yield_reactor`, `userOp02`), and a case
with `code/` does NOT run on the site (no compiler in the browser).  The
decision: (i) `type expression;` -- the rate law written in
`constant/reactions` with its named parameters, evaluated by a small
dependency-free expression evaluator in the engine, runs everywhere; (ii)
a `ReactionRate` base with the explicit factory (`registerType`/`New`/
`registerBuiltins`), Arrhenius and LHHW as built-ins, and
`registerUserTypes()` able to register a case-local law from `code/`
(local only, said so); (iii) the ammonia law re-expressed in each case's
`constant/reactions` through route (i), every number visible, and the C++
`AmmoniaSynthesisRate` retired or reduced to the verification anchors
(one home).  Sequenced AFTER C66 items 1 and 3 merge (both touch
`PFR.cpp`).  Status: dispatched 2026-10-12, after C66 and the C68 renames merged (b5b2c851d).
BUILT 2026-10-12 on branch `claude/c67-kinetics` (not merged).  (ii)
`thermo/reaction/ReactionRate` -- explicit factory, `Arrhenius`/`LHHW` (the
old `RateLaw`, arithmetic unchanged) and `expression` built in, called from
choupoSolve/choupoBatch/the dynamic driver BEFORE `registerUserTypes()`; the
cstr and pfr multi-reaction paths take every law through it, batchReactor and
dynamicCSTR keep their native words (CHEMKIN forms; the dynamic CSTR's
Arrhenius) and send every other word to it, the single-reaction paths read
Arrhenius only and refuse naming the multi grammar.  Witness
`userOp03_case_rate_law`: Michaelis-Menten in C++ (code/) and as an
expression, two CSTRs, one answer, the closed form.  (i) `type expression`
on `core/Formula` (parse once, dimensions checked, printed back as parsed;
exp ln log10 sqrt pow min max + declared 1-D tables, linear, never
extrapolated); symbols T, P, x[i], p[i], c[i] -- package fugacities
deliberately NOT supplied; declared `basis` and `rateOf`; optional legs,
`rateConstant`, `fugacityCoefficients`, `validity` (announce|refuse),
`equilibriumTemperatureWindow`, `caveats`.  (iii) Dyson-Simon written in the
three cases (bench with Eq 39 as Table I + `dp` window `outside refuse`;
the two kinetic beds Eq 19 alone); `AmmoniaSynthesisRate.{H,cpp}` and
`ammoniaRateBench` RETIRED (generic `rateLawBench`); the anchors moved to
`check_ammonia_rate`, evaluated on every case's copy.  Measured against a
build of b5b2c851d: every other kinetics case byte-identical (log and JSON,
the commit banner aside); the bench's every published number identical;
reactor04 within 4e-10; greenAmmonia03 (designSpec) to solver round-off --
ONE golden row moves, `FEHE.H_closure_gap_kW` 1.14e-7 -> 1.63e-6 kW (a
closure gap at cancellation level), and eight bench rows are REMOVED with
the compiled verify() (`anchor1..5_pass`, `anchorCount`, `anchorsPassed`,
`particleDiameter_mm`).  NOT re-recorded: put to Vítor.  Eq 39 at 148.9 atm
stays OPEN (the table refuses, as before).
MERGED 2026-10-12 (3a4534f42) after the commander's validation on the merge:
`--gui` 31/0, `--fast` 72/0, every kinetics case (the two apparent
failures were sub-sector folders walked as cases, identical on main),
`check_rate_expression`, `check_ammonia_rate`, `check_wasm_dialect`,
`check_compile_clean`, `check_layering`, `check_energy_closure`; recorded
with the list: greenAmmonia03 `FEHE.H_closure_gap_kW` (round-off) + three
new X_H2 rows, ammoniaRate01's eight retired verify() rows removed.

**C66. THE GREEN-AMMONIA CONVERTER BEDS, SIZED AS A BASIC DESIGN SIZES
THEM (Vítor, 2026-10-12, asking "No Ammonia Green Design, como é que o PFR
é dimensionado?"; taken under his standing "Avança da melhor forma").**
Measured: each bed's catalyst volume is DECLARED and was tuned BY HAND
against a criterion (`greenAmmoniaBasicDesign/Bed1/system/flowsheetDict`:
V_R 8.72 m3 so bed 1 leaves at 515 C, 5 K under the 520 C catalyst limit;
Bed2 18.23 and Bed3 31.44 m3 for a 5 K approach), because a `$variable`
in a unit FOLDER does not resolve against the plant's `variables {}` and a
DesignSpec cannot reach it (C57); the rate is Dyson-Simon Eq 19 with the
effectiveness factor taken as 1 (`effectivenessFactor intrinsic`,
announced as unpriced; the paper's Eq 39 exists in the engine and needs a
particle diameter); the `pfr` computes NO pressure drop (`PFR.cpp` has no
Ergun term; `src/unitOperations/reactor/pellet/Catalyst.H` names Ergun as a future reader); the sizer
then wraps V_R in a straight cylinder at a declared L/D 6 and prices
V_R x 2500 kg/m3 of catalyst (both author-set).  Scope: (1) let a
DesignSpec reach a unit-folder variable, and SOLVE each bed's V_R to its
stated criterion; (2) the basic-design rate with Eq 39 and a declared
particle size; (3) an opt-in Ergun pressure drop in the `pfr` on the bed's
own cross-section, so the L/D is checked against an allowable drop rather
than typed.  Moved rows listed before any record.  Status: dispatched
2026-10-12.
RULING 2026-10-12 (Vítor, verbatim: "Um PFR tem de ter os parâmetros
cinéticos definidos no caso em /constant não é? ... Isto assim não é nada
glass box com tudo definido nos dicionários!"): KINETIC PARAMETERS ARE
DECLARED IN THE CASE'S `constant/`, never compiled into the engine.  A law
object keeps its FUNCTIONAL FORM in code; every NUMBER it uses (Dyson-Simon:
k0, E, Ka constants, fugacity-correlation constants, Table I) is declared
in `constant/reactions` with units and a source per group, read by the
engine, refused if missing; the paper's values survive in code only as
verification anchors, and a case value that differs from the paper's is
announced.  This is the three-axiom layout's own axiom 3 (equipment-
dependent kinetics -> case constant/), which the `constexpr` constants in
`AmmoniaSynthesisRate.cpp:42-54` contradicted.  Added to C66 as item 4
(done first): migrate every dysonSimon1968 case byte-identically.
SUPERSEDED the same day by C67 (option 3): item 4 stopped, item 2 deferred
until C67 lands; items 1, 3 and the banner fix continue.
MERGED 2026-10-12 (ff36172b4): item 1 -- a member folder with no
`variables {}` resolves `$names` against the enclosing level (one home,
`MemberFolder.H`; a homonym refuses), and a 3x3 designSpec SOLVES the three
bed volumes (Bed1 T_out 788.15 K, Bed2/3 approach 5 K); a designSpec's
result block now follows the reports, so their rows reach the JSON (15
`boundary global` rows appended on four designSpec cases); item 3 -- opt-in
Ergun in the pfr (`operation { L_over_D; catalyst { particleDiameter; }
pressureDrop { model Ergun; voidFraction; allowable; } }`), one home for
L/D, gate `check_pfr_ergun`: at L/D 6 the loop did not converge (35/24/16
bar first-pass drops), so the case runs L/D 1.5, 8 mm, void 0.40, allowable
1 bar -- ALL AUTHOR-SET, Vítor may want to choose the geometry -- drops
0.67/0.31/0.17 bar, volumes 8.89/18.42/31.74 m3, shells 11.9 -> 18.7 M EUR,
NPV -329.5 -> -344.7 M EUR; 393 rows moved + 42 new in greenAmmoniaBasicDesign,
letdown01 12 (+ValveHP T_out 3e-8), letdown02 2, recorded after the list.
Eq 39 REFUSES below 150 atm and the loop runs at ~148.9 atm: item 2 needs a
decision (a higher loop pressure or a declared approximation).  The banner
prints the law's own k.  Item 4 parked on `claude/c66-item4-constants-wip`.

**C65. THE DEBTS THE SAFETY AND LETDOWN SLICES FOUND: THREE RECORDS, ONE
VALVE, ONE GATE (commander, 2026-10-11, under Vítor's "Avança da melhor
forma porra! Eu vou dando feedback"; moved golden rows still go to him as a
list before any record, CLAUDE.md §10).**  Measured: (a) `aceticAcid.dat`
pairs a monomer ideal-gas datum with an `HvapTb` to the associated vapour
(C60 ENGINE/DATA FINDING; liquid heat of reaction -25.9 vs calorimetric
~-3.6 kJ/mol); (b) `NH3.dat:29` `Vliq 2.50e-5` is the molar volume at Tb,
anchored by the engine at 25 C -- liquid NH3 ~13 % too dense at 253 K
(C64); (c) `NH3.dat:16,69,87` `liquidViscosity` is regressed from
Engineering Toolbox, a no-grant source by the licence policy, and
`check_source_licence` has no arm for it; (d) the `valve` prices its
energy balance on its own surface (Watson latent, ideal-gas vapour) --
letdown01 38.66 kW unexplained, credo01 pinned for the same (C64); 41
corpus cases declare NH3.  Scope: correct each record from a PRIMARY open
source, teach `check_source_licence` the no-grant compilations the policy
names, price the valve through `flashState::priceState`; measure every
moved row and list it, record nothing that moves.  Status: dispatched
2026-10-11.
MERGED 2026-10-12 (d67b7f036).  (d) the valve prices both ends through
`flashState::priceState`: every valve closes to <= 5e-8 kW, credo01's plant
-5.44 -> 0 and letdown01's +38.66 -> 0 kW, the SRK purge valve now cools
(Joule-Thomson, 253.15 -> 248.68 K); 50 rows moved (credo01 16, letdown01
30 + ValveHP T_out 6 mK, letdown02 4), listed to Vítor and recorded; both
cases left `check_energy_closure`'s pins.  (b) `NH3.dat` Vliq = 2.8245e-5
(25 C, Gao et al. JPCRD 2023 via CoolProp); (c) NH3 liquid viscosity
refitted to Monogenidou, Assael & Huber JPCRD 2018 (the Engineering
Toolbox fit was +86 % at 320 K); `check_source_licence` refuses
Engineering Toolbox and REFPROP as value origins.  Both reach the corpus
only on RE-IMPORT of the 35 sealed NH3 cases (pinned in
`debt_registry.NO_GRANT_CASE_LOCAL`): measured 241 rows in 8 cases (liquid
NH3 -13 % density, tanks +13 % volume, FCI ~+0.45 M, NPV ~-0.9 M per
green-ammonia plant) -- put to Vítor.  (a) acetic acid: no honest data-only
fix (the monomer-basis HvapTb breaks 34 of 38 cases); the engine must
price the dimerisation -- architecture, Vítor's; record
`docs/design/one-record-two-vapours-acetic-acid.md`.  Also found: 13
case-local pair records transcribing DECHEMA (licence gate does not scan
tutorials/ for them; ~47 pins to widen it); `WilkeChang.cpp:45` uses the
25 C Vliq where the correlation wants the molar volume at Tb.

**C64. AN EDUTOOL ON LARGE PRESSURE LETDOWN: CHOKED FLOW, CAVITATION,
FLASHING, NOISE AND HOW INDUSTRY STAGES THE DROP (Vítor, 2026-10-11,
verbatim: "sabes como habitualmente se dá a redução de pressão de mais de
10x de uma corrente num processo químico? Isso sempre me preocupou, porque
do ponto de vista de válvulas pode ser um problema de desgaste e de ruído",
then "Achas que vale a pena criar um EduTool sobre isto?" and, to the
commander's scope, "Faz e se puder coloca muitas imagens e esquemas!").**
Measured before dispatch: the engine has a `valve` unit, an isenthalpic
Joule-Thomson throttle that flashes adiabatically at P_out
(`src/unitOperations/valve/Valve.H`), and NO valve sizing (no Cv, no choked
or cavitation check, no noise); the green-ammonia basic design lets its
liquid NH3 down 167 -> 22 bar and 22 -> 2 bar through `LetdownHP` and
`StorageFlash` (`tutorials/plant/greenAmmoniaBasicDesign/system/
flowsheetDict:72-73,105-110`).  Scope approved: one letdown with the engine
running (outlet vapour fraction, temperature, volume growth); gas choked
flow; liquid vena-contracta pressure vs vapour pressure, cavitation vs
flashing; remedies (staged trims with a stages slider, valve at the vessel,
hardened trim, power-recovery turbine as the alternative); noise
qualitative or a labelled estimate; valve-style factors (F_L, x_T) are
reader-declared assumptions, never a transcribed table; MANY drawings and
schematics (Vítor's explicit ask).  The engine-side valve sizer is a later
item, not this slice.  Status: dispatched 2026-10-11.
BUILT 2026-10-11 on branch `claude/c64-letdown`, NOT merged (the general's
report has the validation).  CORRECTION to the dispatch measurement above:
the plant's letdowns are 140 -> 20 bar and 20 -> 1.01325 bar (the
separator is at 140 bar, `Separator/system/flowsheetDict`), and both are
ISOTHERMAL flashes at a declared T, not throttles -- no valve exists in that
plant.  `letdown` (construction, 16 steps, five benches, eight inline-SVG
drawings) on "Hydraulics & control", not "Process safety" (the page's
question is how a restriction takes a drop -- the pump-system page's
neighbour; safety is linked, both ways with `overpressure` by a `leadsTo`
each).  Engine: the `valve` publishes its volumetric flow (Q_in, Q_out,
rho_in/out, volumeRatio, x_mass_out) and its T-Newton's maxIter 30 -> 200
(a nearly pure liquid flashed across Psat creeps; no existing iterate
moves).  Witnesses `tutorials/steady/hydraulics/letdown01_ammonia_flashing`
(the plant's separator liquid and purge, copied to the digit: ValveLP
253.02 -> 238.88 K, vf 0.0490, volume x42.6; purge 140 -> 2 bar) and
`tutorials/props/hydraulics/letdown02_valve_fluid_properties` (purge k, Z;
Psat_NH3 at 253.02 K).  IEC 60534 was NOT read: every valve relation via the
open `fluids` control_valve module (MIT), F_L and x_T reader-declared with
that library's keyword defaults.  FOUND, not fixed (Vítor's): (i) the valve
balances on its own surface (Hliquid/Hvapour, a Watson latent and an
ideal-gas vapour with no pressure term), so letdown01's first law is open by
38.66 kW (pinned in check_energy_closure, the credo01 family) and a GAS
throttle shows no Joule-Thomson effect; the fix (pricing through
`flashState::priceState`) moves credo01/inletState01 goldens; (ii) the NH3
record's `Vliq` 2.50e-5 m3/mol is ammonia's density at its normal boiling
point, not at 25 C where `ThermoPackage::density` anchors it, so liquid
ammonia comes out ~13 % dense at 253 K (cross-checked against CoolProp);
every pump, pipe, tank and sizer pricing liquid ammonia inherits it.

MERGED 2026-10-11 (C64): `letdown` on "Hydraulics & control" (the
general's reasoned choice), 16 steps, eight SVG schematics, the ammonia
letdown run live (witnesses `letdown01_ammonia_flashing`,
`letdown02_valve_fluid_properties`); the valve publishes volume KPIs and
its iteration cap is 200.  Validated on the merge: the five valve/relief
cases 5/0, `--fast` 71/0, the general's `--gui` 31/0 (main moved only in
DEV.md since).  FOUND, open: (i) the valve's energy balance is on its own
surface (Watson latent, ideal-gas vapour) -- letdown01 leaves 38.66 kW
unexplained, pinned like credo01; the fix is `flashState::priceState`
and moves credo01/inletState01 goldens; (ii) `NH3.dat` `Vliq` is the
density at Tb, anchored by the engine at 25 C: liquid NH3 ~13 % too dense
at 253 K; (iii) `NH3.dat` `liquidViscosity` is regressed from Engineering
Toolbox, a no-grant source; (iv) H2-NH3 Henry pair used ~35 K below its
range (announced).

**C63. THE DCF GETS ITS START-UP YEARS: A MULTI-YEAR CONSTRUCTION, A
RAMP-UP AND START-UP COSTS (Vítor, 2026-10-11, verbatim: "Sabes se foi feita
a análise económica com anos de arranque e capital circulante e fundo de
maneio?", then "Avança" to the commander's proposal).**  Measured before
dispatch: the working capital IS built up (`EconomicsPass.cpp:164-290`,
receivables/payables/minimum cash/process inventory/product stock, gross
and net published); the cash-flow timeline is ONE construction year with
FCI and WC both at t = 0 and full production from year 1
(`EconomicsPass.cpp:926-935`); `constructionPeriod` other than 1 is
ANNOUNCED as not implemented (`:679-692`) and exactly one corpus case
declares one (`ammonia02_full_plant`, 2 years), so its published NPV does
not honour its own declaration; 10 corpus postDicts carry `economics`.
Scope (stated default, the commander's proposal Vítor approved): opt-in
keys -- a capital schedule over the construction years, a ramp-up of
production fractions for the first operating years (revenue and the
VARIABLE costs scale, the fixed ones do not), start-up costs as their own
line, working capital at the start of operation; a case declaring none of
them byte-identical; `ammonia02`'s NPV rows MOVE (it finally honours its 2
years) and go to Vítor as a list before any record; `greenAmmoniaBasicDesign`
declares the new keys as labelled assumptions, its moved rows also listed.
Status: dispatched 2026-10-11.
BUILT 2026-10-11 on branch `claude/c63-startup-years`, NOT merged (the
general's report has the validation): `constructionPeriod` + a REQUIRED
`capitalSchedule` when N > 1 (FCI share at the END of each construction
year, sum 1, refused otherwise), `rampUp` (revenue and the variable group
1.23 (C_RM + C_UT + C_WT) scale; 0.180 FCI and 2.73 C_OL do not),
`startupCostFraction` (x FCI, an expense of operating year 1); the WC is
invested in full at the end of construction and does NOT follow the ramp-up
(announced).  The placement was read cell by cell from CAPCOST 2017; year 0
STAYS the end of construction (start-up), so the construction years are
compounded forward and every one-year case is byte-identical (measured on
the ten economics cases: eight identical, ChemicalPlantTutorial one stderr
line -- the postDict audit's menu now lists the four keys).  The
announcement "constructionPeriod is not implemented" is retired.  Witness
`economics03_startup_years` (recorded, new); gate `check_cost_provenance`
arm (r) recomputes its timeline row by row (4 by-hand sabotages, none
survived).  Moved and NOT recorded:
ammonia02 NPV 103 568 805 -> 100 252 473, IRR 0.3416 -> 0.2935, payback
3.584 -> 3.805 yr (its `( 0.6 0.4 )`, CAPCOST's two-year example);
greenAmmoniaBasicDesign NPV -328 925 057 -> -329 516 187.  OPEN for Vítor:
the start-up cost's tax treatment (expensed in year 1) and the WC-not-ramped
rule are stated defaults no source was read for; CAPCOST's COM_d labour
factor is 2.76 against this pass's 2.73 (found, not touched).  Record
`docs/design/the-start-up-years-of-a-cash-flow.md`.
MERGED 2026-10-11 on Vítor's go-ahead ("Avança da melhor forma"): the
four listed rows recorded, nothing else moved in either golden.

**C62. THE GREEN-AMMONIA BASIC DESIGN: WHAT IS SIZED, AND RELIEF VALVES
SIZED AT THIS STAGE (Vítor, 2026-10-11, verbatim: "Podes ver se o processo
green amónia já tem tudo dimensionado detalhadamente? Podes se por o
dimensionamento das válvulas de alívio de pressão nesta fase?").**
Measured on `greenAmmoniaBasicDesign` at 7afaa05c2 (fresh run): SIZED -- 4
compressors, 8 shell-and-tube exchangers by Kern, 3 catalyst beds (shell +
declared catalyst charge), 3 vessels (Separator, LetdownHP, StorageFlash),
2 NH3 storage tanks (23 sheets under `design/`).  NOT sized or not
detailed: (a) the converter is three separate straight cylinders, no common
pressure shell, no internals and NO bed pressure drop (no Ergun); (b) the
beds and the Separator run at a 167 bar design pressure in SS316/SS304
whose material record rates 100 bar (`[rating] WARNING`, four items) -- the
priced shells are not buildable as declared; (c) the beds' wall uses the
engine's default corrosion allowance and joint efficiency (announced
`[assumed]`); (d) the boiling-utility films are DECLARED (HP steam 5000,
NH3 refrigerant 2500 W/m2K) and the condensing films are not credited
(WaterCooler, Chiller over-size, said by the sizer); (e) Gnielinski is used
outside its Pr window on seven exchangers (the H2/N2 mixture's Pr falls
below 0.5 -- plausible for a light/heavy gas mixture, not checked) and the
tube friction factor outside its Re window on all eight; (f) no piping,
valves, pumps or instruments; (g) no relief device anywhere -- the engine
has no relief model (C61).  Decision taken on a stated default (Vítor may
reverse): relief devices are a SIZING-PASS item like the catalyst charge --
a `reliefValve` sizer in `src/postProcessing/sizing/`, one entry per
protected unit with its DECLARED credible scenarios, the governing case the
largest required area, a sheet at `design/<unit>/psv`, set pressure read
from the protected item's own design pressure (one home), fluid properties
from the case's package, API 520 Part I gas (critical/subcritical) and
liquid equations and the API 521 fire case, every coefficient's source
named, every default announced; NOT costed (no Turton set; said, and the
cost total does not move).  Status: dispatched 2026-10-11.
MERGED 2026-10-11 (6edf2a640) after the commander's validation on the branch
head: `--gui` 31/0, greenAmmoniaBasicDesign + IndustrialN2 + relief01/02
4/0, `check_relief_valve`, `check_source_licence`, `check_design_sheet`.
BUILT 2026-10-11 on branch `claude/c62-relief`, NOT merged (the general's
report has the validation): `reliefValve` (`src/postProcessing/sizing/
ReliefValveSize.{H,cpp}`, the arithmetic in `ReliefArithmetic.H`), ten valves
in `greenAmmoniaBasicDesign` (the four compressors' discharges, the three bed
shells, the three drums -- blocked gas and liquid lines, fire on LetdownHP
and StorageFlash; NO fire on the beds (gas-filled) or the Separator (its
liquid is above ammonia's Pc at the fire relieving pressure, refused by
name)); 162 golden rows APPENDED, none moved; the capital total unchanged and
complete.  Gate `check_relief_valve`.  Record
`docs/design/a-relief-valve-is-a-sized-item.md`.  The API 526 orifice
letter, built first, was REMOVED the same day on the commander's ruling (a
no-grant standard's table is not freed by the MIT library that carries it,
C16); the REQUIRED area is published and `check_source_licence` refuses the
letter table by its values.  OPEN for Vitor: (1) none on the letter; (2) the
EduTool's limit "Choupo has no relief model" was
corrected (bury the absence) -- the lesson text is his; (3) `CompressorSize`
publishes `pressureDesign` with a SILENT 1.0 bar default when undeclared
(found, not fixed: fixing it announces on every corpus compressor without one).

**C61. AN EDUTOOL ON DESIGNING FOR OVERPRESSURE (Vítor, 2026-10-11,
verbatim: "E depois outro sobre design de sistemas para lidar com a sobre
pressão").**  Measured before anything is proposed: the engine has NO relief
model of any kind (`grep -i relief src/` finds only the SQP watchdog,
`src/solver/SQP.cpp:346`); the Design Guide's rules of thumb carry a relief
chapter that `rules-of-thumb` deep-links to (`docs/designGuide.tex:1841`, "Pressure relief, flare & safety basics", which names API STD 520/521/526 as the controlling standards); the `propertyPoint` props op already prints and publishes gamma = Cp/Cv and Z (`src/propertyOps/PropertyPoint.cpp:122-154`), the two fluid properties the gas-relief equation needs.  Default scope (stated, Vítor
may reverse it; built AFTER C60, because both edit
`gui/src/ui/methods/registry.ts`): the relief SCENARIOS and why the sizing
case is the worst credible one (blocked outlet, external fire, cooling or
reflux failure, runaway reaction, tube rupture, thermal expansion); the
DEVICES and the pressure ladder they sit on (operating, set, MAWP,
accumulation); SIZING with the published equations, each cited to its
standard and edition and never a table transcribed (gas/vapour critical
flow, liquid, the fire-case heat input), with the fluid properties the
equations need (M, Z, k = Cp/Cv, latent heat) taken from the engine where
it can supply them; DISPOSAL (knock-out drum, flare, scrubber -- the C60
Bhopal thread); and two-phase runaway venting as the bridge back to C60's
cooling-failure lesson.  Status: dispatched 2026-10-11, after C60 merged.
DONE 2026-10-11, merged: `overpressure` (construction, 14 steps, four
benches) on the Process safety shelf, linked both ways with
`process-safety`.  Engine: `propertyPoint` gains `Hvap_<comp>`
(`src/propertyOps/PropertyEvaluator.cpp:192`, the record's Watson latent
heat, refused at or above Tc; no golden moved).  Witnesses
`tutorials/props/safety/relief01_ammonia_loop_gas` (both C57 converter
feeds at relieving pressure: the 50 bar loop needs a 4.65x larger orifice,
2976 vs 13 842 mm2 -- C60 lesson 2 seen from the relief side) and
`relief02_acetone_fire_case` (889 kW, 7584 kg/h, 1079 mm2 at T_bubble
394.11 K; acetone, not toluene, because toluene's Antoine record ends below
its own Tb).  API 520/521 and ASME VIII were NOT read: the gas/liquid
equations come from the open `fluids` library (MIT) and reproduce the
standard's Examples 1, 2 and 5 to 1e-9; the fire equation from the DIERS
Users Group document citing API 521 6th ed.; the page says so for each;
Leung's omega method is NAMED, its equations absent (no open copy found).
Validated on the merge: `--gui` 29/0, the five safety cases 5/0, `--fast`
71/0 (+5 deliberate), `check_method_tools`.  Not seen on the WASM engine
in a browser.  Findings outside scope: the Design Guide's relief chapter
(i) says the +1.7 bar floor dominates under ~7 barg -- the two rules cross
at 17 barg; (ii) claims Choupo models the relieved stream and puts the
PSV-vent enthalpy and flare duty in the first-law ledger -- no relief model
exists in `src/`; (iii) labels 43.2 F A^0.82 as "43-70 kW/m2" (it is a
duty in kW for A in m2, not a flux); (iv) its tube-rupture "2/3 rule" may
be superseded in current API 521 (unverified); `toluene.dat`'s Antoine
range ends below its Tb; acetone, N2, H2, NH3, Ar carry no `reviewStatus`.
(i)-(iii) CLOSED 2026-10-11: corrected in `docs/designGuide.tex` and
`docs/design-heuristics.md`, PDF rebuilt; the guide now says Choupo has NO
relief model and points at the EduTool.  (iv) stays open: unverified.

**C60. AN EDUTOOL ON PROCESS SAFETY: GALL AND KLETZ, THE COOLING-FAILURE
SCENARIO, AND INHERENT SAFETY ON THE AMMONIA LOOP (Vítor, 2026-10-11,
verbatim: "Então acho que podes por isso num edutool de segurança", answering
the commander's proposal in the same conversation: Gall's "fail-safe systems
fail by failing to fail safe" read beside Kletz's "what you don't have can't
leak", with Bhopal and Flixborough as the cases; lesson 1 the Stoessel
cooling-failure scenario (MTSR against the boiling point and the
decomposition onset, and semi-batch dosing as the inherent remedy); lesson 2
inherent safety against economics on the C57 ammonia cases, 150 vs 50 bar).**
Measured before dispatch: no EduTool on safety exists (registry searched;
`rules-of-thumb` defers safety to "the named standard",
`gui/src/ui/methods/registry.ts:549`); `batch02_adiabatic` runs the
esterification from 320 K to ~428 K and states its kinetics are pedagogical,
not quantitative (`tutorials/batch/reactor/batch06_adaptive_runaway/system/
flowsheetDict:46` says the same of its twin); `batchReactor` has two modes
only, Isothermal and Adiabatic, and a recipe `setParameter` moves only the
setpoint T (`src/unitOperations/batch/BatchReactor.H:155`,
`BatchReactor.cpp:569-574`), so a cooling failure mid-batch is not one
declaration today; `dynamicCSTR` carries a jacket (`UA`, `T_jacket` as an
MV, `src/unitOperations/dynamic/DynamicCSTR.H:184-185`); the van Heerden
ignition/extinction tool exists (`vanheerden`) and is the CSTR's half of
Semenov's picture, to be linked, not duplicated.  The C57 numbers: H2
converted per pass 29.7 % at 150 bar against 19.6 % at 50 bar, gross margin
24.58 against 23.46 M EUR/yr; whether the larger recycle at 50 bar raises
the hazardous inventory is NOT measured and is the point that makes lesson
2 honest.  Status: dispatched 2026-10-11.
DONE 2026-10-11, merged 46b76a412: `process-safety` (notes, seven live
runs) on a NEW shelf "Process safety".  Engine: `setParameter <reactor>
adiabatic 1` takes the cooling away mid-batch (`BatchReactor.cpp`, refuses
another value, a second failure, cooling coming back, and a reactor with no
heat of reaction; the adiabatic data check has one home,
`requireAdiabaticData_`); no existing golden moved.  Witnesses
`batch26_cooling_failure` (MTSR 394.84 K, hand estimate 395.42 K) and
`batch27_semibatch_dosing` (342-348 K; 395.6 K when the dosing interlock
fails).  Lesson 2 measured: at 50 bar the loop recycles ~4.2x the ammonia
(1220 vs 289 kmol/h) and earns less; no vessel is sized, so no inventory
is claimed.  Sources: Flixborough quoted from the Court of Inquiry report;
Gall PARAPHRASED (book not reachable) and said so; Stoessel's classes from
a secondary source (Molecules 30 (2025) 2939), said so; T_D24 a labelled
reader assumption.  Validated on the merge: `--gui` 29/0, batch reactor +
recipes + combustion + ctrl07 20/0 (+2 deliberate EXPECTED-FAIL),
`check_wasm_dialect`, `check_mass_closure`, `check_time_state_layout`,
`check_fastset` -- which was RED on main since C57 (the three ammonia
families had no FASTSET line; two added, BasicDesign excluded at 3.03 s).
NOT seen: the page in a browser on the WASM engine (no emscripten here;
publish-site builds it).  OPEN, found by the general, not fixed: (1) the
C59 layout routes each parallel recipe edge separately -- batch27's 17
edges between one vessel pair are an ACCEPTED_REGRESSIONS entry in
`flowsheetLayoutCorpus.test.ts`; parallel edges should bundle; (2)
`choupoSemiContinuous`'s header claims fed-batch (`main.cpp:37`,
`DynamicDriver.cpp:38`) but no dynamic unit can grow its volume; (3)
`batchReactor` keeps its declared volume when a charge lands in a
non-empty vessel; (4) an isothermal charge at another temperature is reset
to the setpoint with no energy record (`BatchUnitOperation::chargeFrom`).
ONLINE 2026-10-11: publish-site 38140117111 succeeded (the first WASM build
of the change); the live bundle carries `process-safety` and the live
`choupoBatch.wasm` carries the `[cooling failure]` announcement.  Still not
seen rendering in a browser from here (the container's proxy breaks
headless Chromium on the live site).
REVIEW 2026-10-11 (a second opinion Vítor relayed, "tu é que és
responsável pelo conteúdo"): twelve points, all ACCEPTED on their technical
content -- T_D24 is the temperature at which TMR_ad = 24 h, NOT a
decomposition onset; the semi-batch MTSR needs the instantaneous-mass
correction IN the equation; MTT as min(Tb_i) is a PROXY (the engine's own
bubble point at the failure-time composition is better where it can be
run); class 1 and class 5 sentences were absolute; a cooling failure with
the feed still running is a COMPOUND scenario, not Stoessel's MTSR;
inherent safety means safety no longer DEPENDS on the interlock, not that
there is none; Bhopal's layers were unavailable, disabled or inadequate,
not all simply "did not work"; the ammonia cases change T as well as P
(733 -> 673 K), so the conversion drop is not pressure alone; the ammonia
conclusion overreached (no inventory, so no verdict on total risk);
"four times the ammonia" is the RECYCLE flow, not the inventory; and the
thesis must say protection layers are still needed for the hazard that
remains.  Page follow-up dispatched the same day.
ENGINE/DATA FINDING behind point 3 (measured by the commander, NOT fixed):
the witnesses' liquid heat of reaction is -25.95 kJ/mol at 330 K
(`[reaction heat]` line of batch26), against about -3.6 kJ/mol measured
calorimetrically for the liquid esterification (the reviewer's citation, to
be read).  Cause: the liquid rung is Hf_gas - Hvap_Watson(298) + int Cp_liq
(`src/thermo/Component.cpp`, `h_formation` cross-phase leg), and
`aceticAcid.dat` pairs a MONOMER ideal-gas datum (`dHf_298 -432250`) with
an `HvapTb 24390` that is the vaporisation to the ASSOCIATED (dimerising)
vapour -- two vapour bases in one record.  Watson then gives ~28.2 kJ/mol
at 298 K, so the engine's liquid acetic acid sits ~-460 kJ/mol where the
tabulated liquid value is ~-484 (to be verified against the primary).  It
reaches every LIQUID-phase use of acetic acid's enthalpy (about 37 cases
declare the component).  RESERVED for Vítor: it is a curation decision on
a record (which vapour basis the record speaks, and whether the dimer is
priced) and it moves goldens across the corpus.
REVIEW DONE 2026-10-11, merged (branch claude/c60-review, b3239460a):
all twelve points taken; the MTT default is now the ENGINE's bubble point
of the reactor contents at the failure instant (new props witness
`bubble01_reaction_mass_boiling_point`, run live by the page; the min-Tb
value stays as a labelled proxy); the semi-batch estimate with the mass
correction tracks the engine within ~1 K over 22 failure runs (6.6 K low
without it), which moved the worst dosing instant to portion 4; the
acetic-acid finding is shown on the page as a limitation, reproduced from
the records by a test (the tree's own dimer record: the saturated vapour
is ~82 % dimer at 25 C; breaking it costs ~25.9 kJ per mol of acid, which
brings the liquid heat of reaction to about zero).  NOT read: Golikova et
al. 2020 (paywalled) -- cited as unread, its number not quoted; Stoessel's
book (the mass-ratio form is read from Chen et al. 2016, which cites it);
the Bhopal scrubber-capacity point was dropped, no read source states it.
Validated on the branch after its last commit (main had not moved):
`--gui` 29/0, the three cases 3/0; checkGui's off-screen and occlusion
probes clean on the page at 1400 and 390 px (the full walk was disturbed
by a concurrent dev server).  OPEN: the witnesses' `constant/reactions`
comment still calls -26.06 kJ/mol "the authoritative value" -- it goes
with the reserved acetic-acid decision.
SECOND REVIEW 2026-10-11 (relayed by Vítor: "Podes ver se há algo que se
possa aceitar?"), ALL SEVEN points accepted on their content: (1) a
runaway witness must not RUN on a known thermodynamic inconsistency -- the
esterification is replaced by an explicitly FICTITIOUS exothermic reaction
with coherent declared properties (the acetic-acid record stays its own
item); (2) a flow-limited pump limits the RATE, not the TOTAL that can
enter -- what removes the dependence on the interlock is a dosing tank
whose whole charge, plus what has accumulated, respects the thermal
limit; (3) the MTSR search must include the instants right after each
dose (the page sampled 50 s after), and the page must tell apart the
chosen instant, the estimated maximum and the engine-confirmed maximum;
(4) the class of a chosen instant is not the class of the process, and
MTT(t) - T_cf(t) is examined over the run, with the bubble-point pressure
stated; (5) "refrigerated" is not a layer that cannot be switched off;
(6) inventory is n = PV/(ZRT), not P x V, and total risk needs scenarios,
frequencies, protections and exposure beyond sizing -- the converter-feed
volumetric-flow ratio (~4.4x at 50 bar, with the engine's Z) is the
concrete lesson; (7) editorial: Gall was a paediatrician and Kletz a
chemist, not "two engineers"; caveats BEFORE the simulation; code paths
into a collapsible technical note; minimum-boiling azeotropes named; the
mixture cp varies with composition while the component cp are constant.
Dispatched 2026-10-11.
MERGED 2026-10-12: the witnesses' own goldens re-recorded with the list
shown to Vítor (ΔT_ad 107.77 -> 74.07 K, batch MTSR 437.77 -> 404.07 K,
semi-batch MTSR 348.29 -> 339.73 K right after portion 6, bubble01 362.34 ->
376.00 K) plus the new `batch28_dosing_vessel_limit` (356.55 K); no other
golden moved.  Validated on the merge: `--gui` 31/0, batch/safety cases
16/0, `--fast` 71/0, `check_energy_closure`, `check_element_closure` (the
general's intermittent failure did not reproduce); the page seen rendered
at desk width by checkGui (clean; the harness later refused on an
unrelated page under load).
SECOND REVIEW DONE 2026-10-11 (branch claude/c60-review2, not merged):
(1) the witnesses run a FICTITIOUS A + B -> P in an inert solvent S, four
case-local adopted records, coherent by construction (Tb and HvapTb from
each record's Antoine, Tc = Tb/0.65, Cp_ig from Kirchhoff against Watson's
slope at Tb, P's formation datum derived so the LIQUID heat of reaction is
-60.000 kJ/mol of B, dCp = 0, mass conserved); the heat comes from
formation data, NOT the dH_rxn override, because the override would leave
every transfer unpriced (a dose into a hot reactor falls back to a molar-T
average) and bubble01's propertyPoint refuses a species with no formation
datum.  Old -> new: dT_ad 107.77 -> 74.07 K; batch MTSR (t = 0) 437.77 ->
404.07 K; batch26 T_cf at 600 s 394.84 -> 374.96 K (now EXACTLY the
estimate, dCp = 0); semi-batch MTSR 348.29 K (50 s after portion 4) ->
339.73 K (1 s after portion 6); bubble01 T_bubble 362.34 -> 376.00 K.
(2) batch27's feed event gains a third reading (`to reactor;`, the whole
tank enters) and NEW witness batch28_dosing_vessel_limit (a day tank
holding a quarter of B, refilled only when empty): whole-tank failure
356.55 K worst (1 s after refill 1) against 404.07 K with the whole of B in
the tank; the refill is named as what remains.  (3) failures 1 s
after/before a portion; the page keeps (a) the chosen scenario, (b) the
estimate's maximum over the 50 s rows, (c) the engine's maximum over 31
runs on a button (gui/src/case/methodRun.ts gains useMethodRunSweep).
(4) scenario class vs process class, an MTT(t) - T_cf(t) table at 1.013
bar (23 bubble-point runs).  (5)-(7) as reviewed; Z at each converter feed
from relief01 run at the feed's own T, P: Q50/Q150 = 4.19 (ideal 4.33, so
the review's ~4.4 is the ideal-gas figure).  OPEN, found here, not fixed:
choupoBatch's "elemental balance UNAVAILABLE" line names the LAST
species' reason for every species without a formula
(`parseReason` keyed by the formula text, main.cpp:1726); and the
Tutorials Guide's plant .tex was already stale on main (regenerated here).

**C59. THE AUTOMATIC FLOWSHEET LAYOUT IS SPAGHETTI; MAKE IT READABLE, ALWAYS
(Vítor, 2026-10-10, verbatim: "o layout do flowsheet parece esparguete!
Consegues gerar um layout mais optimizado que seja fácil de ler? E fazer isso
sempre?", seen on the green-ammonia cases).**  Measured before dispatch:
`gui/src/case/toGraph.ts:39` says "longest-path layering (Sugiyama-lite)";
`:151-235` assign each unit its longest path from any feed (declared tears
skipped), put EVERY feed at layer 0 and EVERY product at the last layer, and
stack each layer in insertion order -- no crossing reduction, no
straightening -- so a feed consumed deep in the plant and a purge leaving
early draw edges across the whole canvas.  A case's curated layout in its
`.cho` (`gui/src/state/layout.ts`, written only by "Save layout to case")
keeps precedence (C55).  "Always" read as: the automatic layout is the one
every case without a curated layout gets, and new cases are drawn by it.
DONE 2026-10-11 (merged): `gui/src/case/flowsheetLayout.ts` (pure, no
dependency; layered with balanced feed/product layers, virtual nodes,
port-aware barycenter sweeps, median + pool-adjacent-violators coordinates,
recycle runs above/below in their own lanes), measured by
`layoutMetrics.ts` over every tutorial view (`flowsheetLayoutCorpus.test.ts`
pins: no overlap, never worse than the frozen old layout, totals better).
Vítor's rule (2026-10-10, "a primeira vez ... é feita por ti; depois de o
user arranjar já não mexes"): working copy > curated `.cho` > automatic;
any move snapshots every node; a new node is placed beside a saved
neighbour; a `layout` menu returns to the automatic or the case layout.
The four green-ammonia `.cho` layouts were machine-written and are emptied.
REPORTED, not changed (may be Vítor's own): curated layouts scoring worse
than automatic -- ammonia02_full_plant, hda, lithiumBrinePlant,
ChemicalPlantTutorial CONCENTRATION/FERMENTATION,
crystalliser09_KHT_KCl_series, column07_naphtaliSandholm (an overlap),
designSpec01_triple_equal_areas.  Residual: many-product plants share one
vertical trunk; ed06's energy wires cross its power stubs; no real-browser
drag exercised (rules tested as pure functions).
FOLLOW-UP 2026-10-11 (Vítor: "a localização das utilidades está uma grande
salganhada!"): the old canvas had written EVERY node, stubs included, into
`choupo.layouts.v1` on each drag, and C59's "a working copy wins whole"
honoured those machine positions.  Now a stub is stored as an OFFSET from its
unit and follows it (`gui/src/case/stubDocking.ts`, `resolveArrangement`);
localStorage is `choupo.layouts.v2`, a v1 copy is set aside once with a
notice and Restore/Forget in the `layout` menu; `.cho` schema 2 carries stub
offsets; before a run a stub says cooling/heating only when the case declares
it (`gui/src/case/dutySign.ts`), else "sign after run".

**C58. AN EDUTOOL ON FRONT-END LOADING: HOW INDUSTRY STAGES A PROCESS
DESIGN (Vítor, 2026-10-10, verbatim: "Podes fazer um EduTool sobre O que a
indústria usa: Front-End Loading (FEL)? Isso é muito importante!", then
"Avança" to the scope).**  Measured before dispatch: the research record
already exists (`docs/design/how-a-process-design-is-staged.md`, §1 AACE
18R-97, §2.1-2.3 the FEL/FEED vocabularies and the stage x fidelity x
deliverable table), and the engine has the ONE home of the AACE table
(`src/postProcessing/EstimateClass.H:94-118`, the range of ranges, the
pessimistic-corner default).  Scope (defaults, Vítor reviews): the stages
with what each DECIDES, at what simulation fidelity, with which deliverables
and which estimate class; the AACE range of ranges drawn as overlapping
bands; the lesson that two options whose difference lies inside the band
are not yet decided at that class; mapped onto Choupo's ammonia ladder and
the C57 cases.  DONE 2026-10-10, merged fa51e73d0: `FrontEndLoadingTool`
on a new shelf "Process design & economics" (no tool moved; route-screening
and pinch-composite are candidates, Vítor's call); notes only, no live run
(the C57 cases are its future witnesses); the AACE copy is held to
`EstimateClass.H` by `gui/tests/frontEndLoading.test.ts`.  OPEN: the chart
colours fail the palette validator in dark mode (compensated by A/B labels
and a table version, not investigated); `bin/checkGui --screenshots`
reported PAGE ERRORs on `wegstein` and `active-set-qp`, not this slice's
pages, not investigated.  BOTH CLOSED 2026-10-10 (merged after C57): the
dark-mode failure was the lightness band (orange-6 too light on the dark
body; option B is orange-8 now); Wegstein's error was a duplicate glossary
key `N_c` (a test now refuses a symbol glossed twice in a step);
active-set-qp did not reproduce; checkGui skipped `four-ways-mixture`
silently (a comment between `id:` and `label:`) and now refuses an id it
cannot read.  route-screening moved to "Process design & economics".
CLOSED the same day: active-set-qp's rail track is minmax(0, 1fr) and its
inputs are 358 px on a 390 px phone.  checkGui's "clipped" on other pages
means BELOW THE FOLD, not past the edge; the one page whose controls run
past a phone's width was `property-surfaces` -- CLOSED 0afa1fa57: on a
phone its toolbar folds into one `controls` popover (`ToolbarFold`, the
credo's own remedy; reach 1084 -> 378 px, desk unchanged; the curve-forking
controls go into the fold on a phone only, said in gui-credo.md).  The same
walk found `tear-streams` at x = 574 of 390: dispatched, with checkGui
learning to tell past-the-edge from below-the-fold.  CLOSED 2026-10-10: tear-streams
(574 -> 381) and entu (510 -> 378, found by the new check) use
minmax(0, 1fr) on a phone; checkGui now FAILS a run on a control past the
right edge at either viewport, excusing only a declared `data-pan-x`
scroll box (convention in gui-credo.md).  Not yet seen end to end: a full
walk exiting 1 on a real finding.

**C57. THE GREEN-AMMONIA PROJECT IN DESIGN PHASES: PHASE 2 (EQUILIBRIUM +
HEAT, GROSS MARGIN WITH THERMAL ENERGY) AND PHASE 3 (KINETIC BEDS, EVERY
EXCHANGER DESIGNED) (Vítor, 2026-10-10, verbatim: "começar primeiro por
calcular a margem bruta de várias vias reacionais (1). Depois balanços com
reatores de Gibbs/Equilíbrio, com troca de calor. Isto permite calcular a
margem bruta incluindo energia térmica. Depois na fase 3 usar reatores PFR e
dimensionar todos os permutadores de forma detalhada. Por isso, eu quero que
descrevas o processo Green Ammonia numa fase (2) e numa fase (3). [...] Na
fase (2) até dá para especular sobre o novo processo Haber-Bosch-2 que está
atualmente em testes com catalisadores que permitem operar desde 30-60
bar").**  Measured before anything is proposed: phase 1 exists as an
EduTool for methanol only (`gui/src/ui/methods/RouteScreeningTool.tsx`,
witness `screen01_methanol_routes`); the reactor-fidelity ladder exists for
the synthesis loop alone (`ammoniaStaged01..04`: yield, equilibrium,
approach, kinetic `pfr` with Dyson-Simon and a `designSpec` bed volume);
`greenAmmoniaIndustrialN2` (the PEQ 2026-27 base case) is today a HYBRID --
a phase-2 converter (`gibbsReactor`, 5 K approach) with phase-3 exchangers
(Kern on six; corrected 2026-10-10, the postDict carries six `design {
method Kern; }` blocks -- C48) and full Turton costing + DCF.  Status: SCOPE PUT
TO VÍTOR 2026-10-10 (pedagogy is his, CLAUDE.md §10); build after C52
merges, because C52 edits the same case (the converter's steam credit is a
phase-2 term).
DONE 2026-10-10, merged ac303268e (names delegated by Vítor: "resolve isso
tudo"): `greenAmmoniaFeasibility` (FEL-2: Gibbs converter, duties only,
pinch targets, `grossMargin_RM_UT` -- new EconomicsPass KPIs, arm (q) of
`check_cost_provenance`), `greenAmmoniaFeasibility50bar` (an equilibrium
speculation, its own case because no single knob moves the loop pressure
and gridSweep runs no economics chain), `greenAmmoniaBasicDesign` (three
Dyson-Simon beds with Kern interbed coolers raising HP steam, every
exchanger by Kern, still `estimateClass 4`).  The base case is untouched
but for one README paragraph.  Found and fixed: a unit folder at the plant
root dropped an unresolved `reactions` list (`Flowsheet.cpp`).  NOT done:
bed volumes by designSpec (a `$variable` in a unit folder does not resolve
against the plant's), a converter shell and bed pressure drop, ammonia
route screening (stage 1 exists for methanol only), and the pinch pass
reads only a unit's first inlet/outlet (a two-stream exchanger would be
misread; the feasibility case carries duties only).

**SATURDAY BATCH (Vítor, 2026-10-10, verbatim: "avança como achares que
fica melhor!", answering the commander's list of five open items).**  Taken
as follows, each recorded where it lives:
  - C52 (the converter's dropped duty): the fix AND a full regression are
    AUTHORISED by that answer (§0.4); the written reason: the utility
    allocation is a report run on every converged steady case, so reading
    `Q_kW` moves utility rows, C_UT and economics corpus-wide, which no
    targeted set can bound.  The moved golden rows still go to Vítor as a
    list before any `--record` (§10 standing instruction).  Dispatched.
  - C55 (below): examined and NOT done, with the reason recorded there.
  - C56 (below): the word "fractal" leaves every surface.
  - DONE 2026-10-10: the verbosity-0 sentence of CLAUDE.md §5 corrected to what C54 measured
    (the doc follows the engine; making level 0 silent would move console
    output nobody asked to move).
  - DONE 2026-10-10: Theory Guide `ch:sm-architecture` rule 4 corrected: the engine runs the
    DECLARED order and refuses an invalid one, it does not sort.

**C55. THE FLOWSHEET LAYOUT A STUDENT DRAGS IS NOT A TRACKED FILE (Vítor's
`git pull` refused, 2026-10-07: five `.cho` markers the GUI had written a
layout into collided with a restructured case; "porra! Mas aqui sempre
funcionou!").**  Measured: `gui/src/state/layout.ts:112-170` stores the
on-disk layout as JSON in the case's `<caseName>.cho` marker, a TRACKED file,
so a local arrangement is a local modification of the repository that any
upstream change to that marker turns into a refused pull.  NOT DONE, BY
JUDGEMENT (commander, 2026-10-10, under the batch's delegation): measured,
45 of the 507 tracked tutorial `.cho` markers carry a CURATED layout that
ships with the case, and the marker exists precisely so a layout travels with
the case (`layout.ts:114-120`: written only by the explicit "Save layout to
case", never on a drag).  Moving layouts to an ignored file would strip
those 45 tutorials of their arrangement.  The refused pull was git doing its
job: an uncommitted saved layout met an upstream restructure that deleted
the folders it described.  The remedy is the workflow, not the code: commit
a layout you want kept, or discard it (`git checkout -- <marker>`).  Revisit
only if it recurs on a case that was NOT restructured.  CORRECTED 2026-10-10 (C59): the
judgement above rested on a FALSE reading -- `layout.ts:114-120` says the
marker is written only by "Save layout to case", but `FlowCanvas.tsx` wrote
the tracked `.cho` AUTOMATICALLY on every drag whenever the app was served
on localhost.  That, not a deliberate save, is how Vítor's markers changed.
C59 removed the automatic write; "Save layout to case" is now the only
write.  The 45 curated layouts still ship.

**C56. "FRACTAL" LEAVES THE PROJECT'S SURFACES (the 2026-10-09 naming
ruling, scheduled by the 2026-10-10 batch).**  Status: dispatched
2026-10-10.
BUILT 2026-10-10 on branch `claude/c56-no-fractal` (NOT merged).  Measured
before: `git grep -i fractal` = 326 hits in 124 files.  Swept to the
vocabulary of the ruling -- "a plant and its sectors", "a sectored case /
plant", "the sectored layout", "flattening the sectors", and "the folder
cascade" for the `constant/` walk-up the old texts called the fractal
cascade -- in every live surface: the five guides that carried it (sources
and rebuilt PDFs; the tutorials guide regenerated from the cases),
`docs/ai/` (case-layout.md now says once what the layout was formerly
called), README.md, CLAUDE.md (§3, §6, §10), the current-state
architecture docs (stream-state-architecture.md says once that the graph
was formerly called fractal), the tutorial READMEs, header comments and
four `description` strings, every GUI string (the Open-Case category label
"Plant design (sectors)", the PropertyPanel sector card, the tear lesson's
limit), the one engine string a run writes (`SolutionWriter.cpp`'s
per-branch snapshot header), and the comments and gate messages in src/,
bin/ and gui/.  Wording only: every edited src/ and gui/ file keeps its line
count, so no `file:line` citation moved.  The word now stands only in
dated records (`docs/design/`, `docs/architecture/archive/`,
`docs/TUTORIAL-QA-*`, `decision-records.md`, the A4-A6 handoff, this file),
in the two SEALED `sucrose.dat` records (a comment edit moves their sha256
-- a re-seal is a curation act, not wording), in three lines that explain
the old name, and in the four files another general held that day
(`src/reporting/{Report.H,StreamTableReport.cpp,Topology.H}`,
`gui/src/case/toGraph.ts`).  Gate: `check_glossary_bans` gained a SECOND
PASS over every tracked file with its own exemptions (the `true`
exemptions do not carry over), a "formerly called" line accepted, the four
held files listed as PENDING so each fails as STALE the day it is swept;
five by-hand sabotages (the word in a tutorial README, in CLAUDE.md, an
innocent file exempted, a blind `git ls-files`, and the old `true` ban
still firing), all caught.  NOT renamed, PROPOSED to Vítor because each
is a key rather than wording: the witness class `sealedFractalPlant`
(`tutorials/WITNESSES`, `generated/caseManifest.json`,
`docs/architecture/ownership-index.md`; `bin/runTests --witnesses` reads
it) -> `sealedSectoredPlant`.  MEASURED on the way, NOT a premise to
build on: "we only have two levels" is true of every case and of the
vocabulary, but `Flowsheet.cpp` `flattenNode` (:256, recursive call at
:842) recurses with no depth limit and `StreamOwnership.H:92-96` writes its
rule for any depth -- the two levels are a convention of the corpus, not a
refusal of the engine (the Developer Guide says so).  Whether to REFUSE a
sector nested in a sector is an architecture decision, Vítor's.

**C54. THE SECOND "HOW CHOUPO WORKS" EDUTOOL: HOW TO READ A RUN'S LOG
(Vítor, 2026-10-09, verbatim: "Faz esse!", answering the commander's ranked
list of further EduTools, whose recommended next was the log).**  Scope as
proposed: what the log is and where it goes; the header and what was
assembled; the per-unit trace (Newton iterations, residuals, the
announcements such as `[plan]`); the convergence verdict; the end-of-run
caveat block; and the three kinds of message a student must tell apart -- an
ADVISORY (the answer is qualified), a DIVERGENCE (the answer is to a
different question), a REFUSAL (no answer, exit code 2).  Built on real runs
in the browser, every engine claim cited file:line.  Status: dispatched
2026-10-09.
BUILT 2026-10-09 on branch `claude/c54-edutool-run-log` (NOT merged).  A
second `notes` page on the "How Choupo works" shelf, `run-log` ("How to read
a run's log"): `gui/src/ui/methods/RunLogTool.tsx` (the page),
`runLogLesson.ts` (seven steps + four limits) and `runLog.ts` (React-free:
the citations, the markers, the classifier, the witnesses).  ONE panel: a
log viewer over a real run, made by the browser engine on an in-memory copy
through C53's `useCaseFilesRun`, of one of SEVEN witnesses -- flash01
(verbosity selectable 0..4), bubbleT01 ("none raised"), process03 (a
recycle), flash13 (the five-number verdict of `solver/Convergence.H`),
shortcut01 (a divergence), process03 with `recycleMaxIter 1` (exit 1) and
flash01 with C53's misspelt-model break (exit 2).  Every line is classified
ONLY from what the engine prints: its own marker (69 markers -- 63 the
engine's, 6 this app's -- each with the line that prints it), the block a
marker opens, or the stderr
line it continues; anything else is drawn as unclassified.  Above the log,
"read the end first" lifts out of the same run the exit code (read from the
worker's own `run_case returned rc=` line), the divergence verdict, the
caveat block and, where present, the refusal or the failed verdict.  Each
step carries buttons that load its run and select the line it means.  C53
step 5 now `leadsTo` this page, and step 5 here leads to the Wegstein page
(which runs process03 too).  Test `gui/tests/runLog.test.ts`: every
citation lands on its statement, no bare file:line, the classifier's rules
on synthetic logs; each witness serialised exactly as the worker receives
it and run NATIVELY must exit with its code and print the markers the page
uses it for; across the witnesses every engine marker is printed at least
once; the advisory / divergence / refusal / not-converged lines the page
draws are asserted verbatim; the numbers the lesson quotes (flash01's first
Rachford-Rice step, flash13's five numbers) are the ones printed; and the
verbosity table is MEASURED (flash01 at 0..4).  `generated/methodTools.json`
regenerated (51 live tools).  MEASURED on the way, and put to Vitor rather
than edited: (1) CLAUDE.md 5 reads "Verbosity: 0 silent"; verbosity 0 is
NOT silent -- the header, both stream tables and every unit's banner print
at 0 (measured), and on flash01 the stderr announcements
([psat], [cp], [unmarked]) are byte-identical at every level; level 1 adds
exactly the divergence and caveat blocks (main.cpp `if (verbosity >= 1)`).
The page states the measured behaviour.  (2) Of the seven witnesses only
the reactive flash prints the five-number verdict, and in the tree only
`ReactiveVLE.cpp` prints `rawInitial`/`normInitial`; the page says "of the
runs on this page" and claims nothing wider.  (3) `[unmarked]` records do
not ride the advisory log (Database.cpp `announceOnce`, and
AdvisorySummary.H says so), so bubbleT01 prints a "none raised" block AND two
`[unmarked]` lines -- the page teaches it as the block's exact
claim.  Also, per the naming ruling below, C53's limit "A fractal plant" now
reads "A plant and its sectors".  NOT done: the time-integrated binaries'
logs (stated as a limit); the GUI's own Log tab is unchanged (this page
reads the log, it does not restyle the tab); the screenshots were taken
against the WASM published on www.choupo.org because this container has no
emscripten -- the native test is what proves the witnesses against this
tree.  Status: built and validated 2026-10-09, waiting on Vitor's review.

**NAMING RULING (Vítor, 2026-10-09, verbatim: "não chames 'fractais' porque
já vimos que esse nome foi má escolha. Nós só temos dois níveis").**  A
student-facing surface does not call the plant/sector layout "fractal": the
engine has TWO levels, a plant and its sectors (plus each unit's own
folder), and the word promises a recursion that does not exist.  New
EduTools and lessons say "a plant and its sectors".  NOT done: the word
still appears in CLAUDE.md (§3, §6, §10), docs/ai/case-layout.md and the GUI
sources (measured 2026-10-09: CLAUDE.md 8, gui/src/cases/tutorials.ts 7,
docs/ai/case-layout.md 5, gui/src/case/toGraph.ts 4, ...); renaming those is
a sweep to be scheduled, not done in passing.

**C53. EDUTOOLS THAT SAY HOW CHOUPO WORKS, STARTING WITH HOW THE
DICTIONARIES ASSEMBLE A CASE (Vítor, 2026-10-09, after a class, verbatim:
"Hoje estive com os alunos e sentiram que faltam EduTools a dizer como
funciona o choupo! Podemos começar com um EduTools sobre como os dicionários
montam um caso?").**  Measured: the registry (gui/src/ui/methods/registry.ts)
holds 49 tools across thermodynamics, unit operations, reactions and
numerics; none explains the case itself (folders, dictionaries, who reads
what, in which order, where results land).  The pedagogical scope is
Vítor's (CLAUDE.md §10): a proposal was put to him before any dispatch, and
he answered "Avança que eu depois revejo e dou te feedback" -- build the
proposal as a first version for his review.
BUILT 2026-10-09 on branch `claude/c53-edutool-case-assembly` (NOT merged).
A new shelf, "How Choupo works", FIRST in `METHOD_DISCIPLINES`, holding one
`notes` page, `case-assembly` ("How dictionaries assemble a case"):
`gui/src/ui/methods/CaseAssemblyTool.tsx` (the page),
`caseAssemblyLesson.ts` (six steps + four limits, on the shared step
renderer) and `caseAssembly.ts` (React-free data).  The witness is the real
`tutorials/steady/flash/flash01_benzene_toluene`, read from the bundled
tutorial registry -- no case text is typed into the lesson.  Steps: (1) a
case is a folder; system/ HOW, constant/ WITH WHAT, 0/ FROM WHERE, the .cho
and README.md opened by the GUI only; (2) the grammar -- entry, sub-dict,
list, comments, units converted to SI with the dimension check, x_SI = f_u x
on the case's own `1.0 bar` and `40 kmol/h`; (3) the assembly order as
main.cpp does it, linked (`leadsTo`) to tear-streams; (4) topology is not
state, n_spec = N_c + 2 on 0/feed's four numbers; (5) what a run writes and
why it is never edited; (6) break a copy and read the refusal.  Three
panels: the file tree (click a file: what it says, who reads it and when
with the file:line, the file as it is); the assembly move by move beside the
lines the page's OWN run of flash01 printed about itself (the run header,
`[v2 native]`, `[state] seeded`, `Unit [0]`, `[flash] model`, ...); and what
that run wrote (converged/, reports/, no design/ because no postDict).  Four
breaks, each a one-click edit of an in-memory COPY run by the browser
engine, the refusal lifted out of the run's log: delete 0/feed (Flowsheet.cpp
completeness, "MISSING  0/feed"), misspell `activityModel ideal` as `idael`
(ActivityModel.cpp, "unknown activity model 'idael'.  Did you mean
'ideal'?"), add `vaporFraction 0.3;` beside T and P (StreamStateIO.cpp,
"OVER-SPECIFIED"), and `100000 pa;` (Dictionary.cpp, "unknown unit suffix
'pa'").  MEASURED on the way, and the reason every break edits 0/ or the
thermoPhysPropDict: the browser re-serialises controlDict, flowsheetDict and
solverDict through the GUI's own parser (`serialiseCase`), so a typo planted
there would be refused by the GUI's parser, not the engine.  One shared
change: `methodRun.ts` gains `useCaseFilesRun` (the debounce/abort/log of
`useMethodRun`, which now delegates to it) -- it gains no way to edit a dict.
Test `gui/tests/caseAssembly.test.ts`: every bundled file has one role and
every keyword a role claims is declared in the real file; every one of the
62 citations lands on its statement; no bare file:line in the page's
sources; each break, serialised exactly as the worker receives it, is run
by the NATIVE choupoSolve and must exit 2 with its refusal, and the intact
case must converge and narrate every move the page reads, in order.
`generated/methodTools.json` regenerated (50 live tools).  Its Theory Guide
link is `ch:sm-architecture` (every live tool must carry one,
tests/tabChrome.test.ts) -- whose rule 4 reads "solve in topological
order" while the engine runs the DECLARED order and refuses an invalid one;
the page teaches the engine's behaviour, and the wording of that chapter is
Vítor's to reconcile.  NOT done: no
EduTools Guide section (the guide writes up eight constructions and lists
six more as undocumented -- most live tools, tear-streams included, have no
section, so the brief's condition for adding one did not hold); backticks in
the shared step renderer's prose are drawn literally, as on the other
lessons (the page's own panels draw them as code); the browser screenshots
were taken against the WASM published on www.choupo.org, because this
container has no emscripten -- the native test is what proves the four
refusals against this tree.  Status: built and validated 2026-10-09,
waiting on Vítor's review.

**C52. THE GIBBS CONVERTER'S 30.6 MW HAS NO UTILITY, AND NOBODY SAYS SO
(Vítor, 2026-10-07, verbatim: "o reator gibbs não devia ter utilidade de
calor?!!!").**  Measured on greenAmmoniaIndustrialN2: the Converter
(`gibbsReactor`, isothermal at 733.15 K) publishes `Q_kW = -30605.3`, and
the energy report prices it (`energyBalance_byUnit.csv`), but the utility
allocation reads ONLY the KPI `Q` in W (plus the column's two keys):
`src/reporting/UtilityAllocationReport.cpp:283` `if (auto q = kf("Q"))`.
`gibbsReactor`, `cstr`, `conversionReactor`, `equilibriumReactor`, `pfr`,
`crystalliser` and `coolingTower` publish `Q_kW` only (grep of `kpis_["Q`
in src/unitOperations), so their duties are DROPPED from the allocation --
not allocated, not listed as unserved, absent from C_UT and from the
"N duties could not be allocated" count, and drawn with no duty stub on the
canvas.  A duty dropped in silence is the 2026-08-03 rule broken ("unserved
records LISTED, never dropped").  Two halves, both Vítor's: (1) the fix is a
shared path -- the allocation runs on every steady case, so utility rows,
C_UT and the economics move corpus-wide and a FULL regression is needed
(§0.4 authorisation); (2) what serves 30.6 MW released at 460 C is a design
decision: the catalogue holds only CONSUMING utilities, so the automatic pick
would dump it into cooling water, where a real ammonia loop raises HP steam
in a waste-heat boiler (a credit) -- that needs a steam-GENERATION utility
record, a curation act.  Status: diagnosed 2026-10-07; both halves
DELEGATED 2026-10-10 (SATURDAY BATCH above).
STATUS: MERGED 2026-10-10 (90010634e), with the 16 moved rows re-recorded
after Vítor's approval ("avança") and his explicit authorisation of
`bin/runTests --record` ("Eu autorizo"); semantic diff 16 moved, 0 added,
0 removed.  BUILT 2026-10-10 on branch `claude/c52-reactor-duty-utility`.
ONE HOME for "this unit has a duty": `reporting::unitHeatDuties`
(src/reporting/BalanceMath.H), derived from the SAME `energyItemKpis()` the
first law reads (its Heat items minus the internal-medium `duty_kW`), each on
its port with the KPI that carries its temperature (`heatDutyPorts()`; a Heat
item with no port REFUSES).  `Q` (W) and `Q_kW` are checked to agree where a
unit publishes both (heater, heatExchanger, isothermalFlash, phaseChanger
compute one from the other), `Q` preferred, so their rows are byte-identical.
The crystalliser's `T_op` joins the T / T_out chain; tsaTwinBed now publishes
`T_regeneration` / `T_adsorption` for its two ported duties, which were
dropped too.  The diagnosis was right with one addition and one correction:
the TSA's duties were a second dropped class, and `coolingTower` publishes
`Q_kW` but is CARRIED (water to air; the allocation now reads
`isProcessToProcessExchanger` instead of its own two-type list).  NOT routed
through the home, by stated reason: `PinchPass` (a duty as a stream SEGMENT
from inlet to outlet T, which a reactor's heat is not) and
`UtilitiesReport::dutyOfUnit` (the duty DELIVERED through utility STREAMS).
The allocation reads the engine's composed unit dicts (`Flowsheet::unitDicts`
-> `result.unitDicts`): the 2026-09-08 warning measured TRUE for this case
(17 units in their own folders, root lists `sectors`) and is now closed for
every choupoSolve result.  DECLARED UTILITY: `utility <name>;` beside `type`
(copied through the flatten; not in `operation {}`, which the unit's key
audit holds to "read by the unit"); a column port keeps
`operation.<port>.utility`.  Either is held to `UtilityCatalogue::canServe`
(tier = sign of the duty, dutyPerKg > 0, T known, dTmin) and REFUSES by name
when it cannot serve, when the duty is carried, when it is not in the
catalogue, or when the unit publishes no duty on that port.  `pickForDuty`
never picks a credit (cost < 0).  ECONOMICS: a CARRIED row is no longer
counted as an unpriced duty (the FEHE had been one of the witness's "2 duties
could not be allocated"); credits are summed, never clamped, printed on their
own line, and `C_UT` / `C_UT_credit` are published.  CASE: the Converter
declares `steamGenerationHP`, a CASE-LOCAL record (constant/utilities/,
unclaimed by the manifest; `bin/choupo-import` stages it untouched and the
sealed run equals the unsealed one): HP steam at steamHP.dat's own 41 bar /
525 K and latent heat, -18 EUR/GJ, an AUTHOR-SET assumption and an UPPER
bound, said in the record, the README and the postDict header.  Witness:
C_UT 20.71 -> 5.07 MEUR/yr (credit -15.64), COM_d 443.83 -> 424.60 MEUR/yr,
NPV -411.7 -> -294.6 MEUR.  GUI: the reactors and phaseChanger get a duty
stub; after a run the stub follows the allocation (idle without a row, sign
from the row -- `case/dutyUtility.ts` `dutyStubFromRun`).  Gate
`check_unit_duty_allocation` (4 by-hand sabotages, all caught).  Record
`docs/design/a-duty-the-allocation-dropped.md`.  FULL REGRESSION (authorised
above) on d160f0079: PASS 687 / FAIL 6 -- greenAmmonia (10 economics rows)
and optim05 (NPV) on the moved rows; the utility-allocation gate on 86 duties
published and not yet pinned (appended since, 320 rows, adds only); the GUI
lesson citation FlowCanvas.tsx:448 moved by one import line (fixed); and two
gates already red on main (code map stale since C48/C51, C48's record missing
from the decision index), both regenerated / indexed here.  16 golden rows
MOVE in four cases (11 outside their 1e-4 tolerance: greenAmmonia 10, optim05
1; 5 inside: optim05, economics01, economics02), every one an economics KPI
moved by C_UT -- NOT recorded; the list, with each row's reason, goes to
Vítor.

**C51. THE EXCHANGER DATASHEET DRAWS THE KERN DESIGN FROM ITS SHEET (Vítor,
2026-10-07, verbatim, on the green-ammonia FEHE "HX datasheet" pop-out on
www.choupo.org: "Fodas! O design continua uma merda!").**  The live site is
main, where C48 is not merged, so he saw the old pass-through sheet.  The
deeper defect, measured: `gui/src/ui/HeatExchangerDatasheet.tsx` drew its
schematic and its RATING / TUBE / SHELL / HYDRAULIC sections from the UNIT's
KPIs and the unit dict's `geometry {}`, which exist only when a
`heatExchanger` runs `model geometry|design`.  The C48 design lives on the
SIZER's sheet (`design/<unit>/shellTubeHX`), so even with C48 merged all six
exchangers would have drawn "tube count not declared", "0 baffles" and
dashes, with ~50 raw keys dumped; the five `phaseChanger` coolers were never
offered a datasheet at all (the trigger needed a `U` KPI).  And a second
defect, found on the way: C48 added `m2.K/W` and `W/m/K` to
`src/core/Units.cpp` and NOT to the GUI's mirror `gui/src/dict/units.ts`, so
the GUI's parser refused every designed sheet whole -- the datasheet would
have said the run wrote a sheet "this reader could not parse".
BUILT 2026-10-07 on branch `claude/c51-hx-datasheet-design` (from
`claude/c48-hx-detailed-design`, NOT merged; it waits on C48).  ENGINE: the
Kern route publishes what it DECIDED about each side as data -- an
`exchanger {}` block on the sheet (role process/utility/hot/cold, the
streams, the utility and its record supply/return T, regime gas/liquid/
condensing/boils, film computed/declared, the correlation, the tube pattern,
the controlling resistance, and which `sizing {}` keys the case DECLARED or
were read from the UNIT or a RECORD) -- `ExchangerService` in
`core/ResultRecords.H`, sheet-only, not in the result JSON, so no golden
moves (the case's 53 C48 rows are still the only moved ones).  GUI: the ONE
sheet reader (`case/designSheet.ts`) reads `exchanger {}` and `cost {}`; the
units mirror gains the two words; `case/hxDatasheet.ts` (pure, React-free)
builds a TEMA-style specification sheet from the sheet alone -- schematic
with the real pass arrangement (partitions in front channel and rear head,
head TYPE not drawn as designed), shells in series, the real baffle count,
shell ID and tube length dimensioned, nozzles labelled with fluid and
temperature, a tube-layout inset; SERVICE, THERMAL DESIGN (rated A/U beside
the designed, which is costed), PERFORMANCE tube side | shell side,
RESISTANCES, CONSTRUCTION, COST, the basis clause by clause with its WARNING
clauses and the condensing over-size statement set apart.  Every value in the
unit its sizer declared, converted only within one unit family the dict table
knows, and marked in ink AND word: Choupo / declared / from the unit / from a
record (the shared provenance vocabulary gained the last two).  Any unit
whose sheet carries a Kern design gets the datasheet (Properties panel and
Reports).  A sheet with no design keeps the old page unchanged.  Gate
`check_design_sheet` arm (k) now also requires every sizer unit word to be in
the GUI mirror (sabotage: dropping `m2.K/W` from it fires 5 problems).  Test
`gui/tests/hxDatasheet.test.ts` on the engine's real sheets (three witness
outputs added).  NOT done: the cost-correlation range warning (FEHE and
Chiller A outside [10, 1000] m2) is an advisory of the costing pass and is
not on the sheet, so the datasheet cannot show it; mechanical data (nozzle
sizes, TEMA head letters, tube-sheet thickness) is not computed by Choupo
and not drawn.  Status: built and validated 2026-10-07; merges with C48.

**C50. A DRILLED UNIT RAN FROM THE PLANT'S SEED, NOT FROM THE RUN IT CAME
OUT OF (Vítor, 2026-10-07, verbatim: "Eu corro o flowsheet principal. Depois
quando abro o reator de gibbs, ele aparece sem os dados convergidos
anteriores! E quando mando correr, a pressão de entrada passa para 8 bar!!").**
Measured on greenAmmoniaIndustrialN2/Converter: the registry PROJECTS the
root's `0/` into a drilled unit folder (`projectRootStreamState`,
gui/src/cases/tutorials.ts), and `bootCase`'s rule "a 0/ the sub-case already
carries always wins" counted that projection as the sub-case's own -- so the
drill's converged feed (151 bar, 378 degC, 152 t/h) was dropped and Run used
the plant's recycle SEED `0/PreheatedFeed` (8 bar, 208 degC, 296 t/h).
Separately, the inherited slice renamed the leaf's INLET into scope
(`PreheatedFeed` -> `Feed`) but not its OUTLET (`HotEffluent` -> `Out`), so
the drilled tab opened with its product empty.  Fixed: the registry records
which `0/` paths it projected (`TutorialEntry.projectedZero`); ONE home,
`drillSeed.applyDrillFeeds`, lets a projected path yield to the drill's state
while an AUTHORED one still wins; `SliceOptions.boundaryOutletMap` mirrors
`boundaryFeeds`.  Tests `gui/tests/drillProjectedSeed.test.ts` (on the real
registry entry) and `drillSeed.test.ts`.  Status: built and tested
2026-10-07.

**C49. THE PROPERTIES PANEL CONVERTS A TEMPERATURE DIFFERENCE AS A
TEMPERATURE, AND NEVER CONVERTS A SCALAR WRITTEN WITH ITS UNIT (Vítor,
2026-10-07, verbatim: "a temperatura de aproximação fica estranha quando mudo
de ºC para K. Por outro lado a T de operação fica sempre em K, mesmo quando
muda para outras unidades").**  Seen on the green-ammonia Converter
(`temperatureApproach 5;`, `T 733.15 K;`).  Measured: the panel's
`renderFieldValue` (gui/src/ui/PropertyPanel.tsx) sent every number whose
schema unit is "K" through the ABSOLUTE formatter, so a 5 K approach read
5 - 273.15 = -268 degC; and it converted only a bare NUMBER, while a scalar
written with its unit reaches the panel as the string "733.15 K", so the
operating T was printed as written whatever the Units menu said.  Fixed in
ONE home, `gui/src/ui/fieldDisplay.ts` (pure, tested): a schema field may
declare `"quantity": "temperatureDifference"` (the ten that are: every
`temperatureApproach`, `superheat`, `subcool`), which converts by the scale
and never by the offset; a "<n> <unit>" string is read to SI through the
dict's unit table, only within the field's own unit family, before it is
formatted; an unknown `quantity` word refuses at schema load.  An EDITABLE
field keeps being edited in the unit the file wrote (the tinkering rule,
unchanged) and now shows the menu's value beside it as a hint when the two
differ.  Test `gui/tests/fieldDisplay.test.ts`.  Status: built and tested
2026-10-07.

**C48. GREEN AMMONIA: THE EXCHANGERS DESIGNED IN DETAIL, NOT A = Q/(U*LMTD)
(Vítor, 2026-10-07, verbatim: "Eu estive a ver e os permutadores não estão
dimensionados de forma detalhada").**  Measured before dispatch: the six
exchangers of `tutorials/plant/greenAmmoniaIndustrialN2` are sized by
`ShellTubeHX` (`src/postProcessing/sizing/ShellTubeHX.cpp:84-176`) as A =
Q/(U*LMTD) with an AUTHOR-SET U (300-500 W/m2/K, postDict) -- no tubes, no
shell, no film coefficients, no fouling, no pressure drop; five are
`phaseChanger` units against no second stream (`WaterCooler/system/
flowsheetDict`: `outletT 313.15 K` only) and the FEHE is a rated
`heatExchanger` on a declared area and U (`FEHE/system/flowsheetDict`).  The
engine ALREADY carries a Kern design inside the two-stream unit
(`HeatExchanger.cpp:337-470` `model design;` -- Gnielinski tube side, Kern
shell side, Sinnott bundle diameter, N tubes bisected on the duty, Kern dP
both sides, witness `hxWorkflow1_design_from_duty`), reachable by no sizer
and with NO fouling resistance.  Commission: every exchanger of the case gets
a TEMA-style thermal and hydraulic design on its sizing sheet -- tube
geometry, N tubes, passes, shell ID, baffles, h_i, h_o, fouling, wall, U
COMPUTED, F correction, area, utility flow, dP both sides -- from ONE design
kernel shared with the unit (no second home for Kern), the FEHE designed from
its own duty and compared with its declared 2000 m2 (its answer is not
moved).  Condensing duty (WaterCooler, Chiller) is outside a single-phase
Kern and is said so on the sheet, never silently priced as single-phase.
Status: dispatched 2026-10-07 to a general in a worktree; golden rows that
MOVE go to Vítor as a list before any re-record.
STATUS: MERGED to main with C51 (see the end of this entry).  BUILT
2026-10-07 on branch `claude/c48-hx-detailed-design`.  ONE
kernel: the Kern arithmetic moved verbatim to `htc/ShellTubeDesign`
(+ per-side fouling, the 1-2 F of Bowman-Mueller-Nagle, friction-factor
validity flags); `heatExchanger` calls it, byte-identical on all 14 of its
cases, and gains OPTIONAL `foulingTubeSide`/`foulingShellSide`.  `shellTubeHX`
gains route 4, `design { method Kern; ... }`: the bundle and the fouling
DECLARED (an undeclared fouling REFUSES; `0` is a stated clean design), the
smallest tube count solved, U a RESULT, the installed area costed.  Process
side priced by the case's package at the mean terminal T (the case gained a
dilute-gas `transport {}`, and `diluteSolution` now wires one); utility side by
a `thermophysicalSystem {}` in the utility's OWN record (coolingWater: IF97),
its flow |Q|/dutyPerKg.  Condensing duties (WaterCooler, Chiller) on the gas
film of the vapour that leaves -- safe side, said; the boiling-NH3 film TYPED
(2500 W/m2/K, said).  FEHE: one tube pass, four shells in series, 1837 m2 at
U 468 against its declared 2000 m2 at U 550 (published as A_rated/U_rated,
the loop's answer unmoved; the DESIGNED area costed).  Found on the way: the
case's seal did not carry the utilities its C44 sizing names (the hidden-
catalogue validation sized no cooler, at exit 0) and `bin/choupo-import`
crashed on an `equipment ... basis` golden row -- both fixed; the seal grew
(water.dat, utilities, assets) and the sealed run equals the unsealed one.
53 golden rows MOVE (6 exchangers x A, U, weight, 3 costs, basis; 11
economics KPIs, FCI -0.84 %) -- NOT recorded, the list goes to Vítor; 235 new
rows appended.  Gate `check_design_sheet` arm (s) (5 sabotages caught), arm
(p) moved to an estimate twin.  Record:
`docs/design/an-exchanger-designed-not-estimated.md`.

Status 2026-10-07 (commander): REVIEWED and VALIDATED on branch
`claude/c48-hx-detailed-design` with main merged in -- the 66 cases the
change can reach (every gammaPhi case declaring transport, every
diluteSolution case) PASS 65 / FAIL 1, the one failure being
greenAmmoniaIndustrialN2 on exactly the 53 moved rows listed, with their
reasons, in the appendix of docs/design/an-exchanger-designed-not-estimated.md.
NOT MERGED: the rows wait for Vítor's approval (Saturday).
APPROVED by Vítor 2026-10-07 ("sim"): the 53 rows (plus WC_gross, which
moved inside its tolerance by exactly WC_net's -6565.4 EUR) re-recorded on
the C51 branch; merged to main with C51.

**C47. A VISIBLE COUNTER OF VISITS AND DOWNLOADS (Vítor, 2026-10-07: "E
sabes se se pode criar um contador para número de acessos e downloads, que
fique visível?").**  Measured: the site's analytics hook exists
(`site/analytics.conf`, GoatCounter, cookieless, injected by bin/buildSite)
but holds NO site code -- no account was ever created, so nothing is counted
today; the GitHub releases carry no assets (download_count 0, nothing to
download -- the app runs in the browser).  Answered with the options; the
account is his act.  Status: waiting on him.

**C46. HOW BIG CHOUPO IS, COUNTED AND SHOWN (Vítor, 2026-10-07: "Podes ver
quantas linhas de código tem? Faz como o openfoam e tenta usar uma definição
que maximize o número de linhas", then "ok. Põe isso").**  `bin/curate/
line_count.py`: every line of every git-tracked UTF-8 text file, comments and
blanks included, broken down by what the files are (most of the total is
data, and most of the data are group-contribution ESTIMATES -- the page says
so).  The landing's size line is filled by bin/buildSite from that script
and `generated/releaseInventory.json` when the site is built; a build that
cannot count REMOVES the line.  Not a gate: the count moves every commit.
The commander's first wording, "a 30,000-record property database", was
FALSE (28,447 of those files are estimates, the curated catalogue is 604
components) and was withdrawn before it reached the page.  README now opens
with the link to www.choupo.org.  Also fixed: C45's entry above named the
simulators outside the marked block and turned check_doctrine red on main.

**C45. THE LANDING PAGE IS FOUND BY "OPEN SOURCE CHEMICAL PROCESS SIMULATOR",
AND MAY COMPARE BY NAME (Vítor, 2026-10-07, after pasting a search engine's
indexing advice; then, verbatim, on the commander's objection that naming
competitors broke C7: "Que se lixe! Isto é guerra e eu posso fazer
comparação desde que não viole regras básicas, não é? 'CHOUPO vs [the two
simulators]!'" -- the names elided here, because C7 still binds this file).**  THIS NARROWS C7, by his ruling, for ONE page: `site/index.html`
may name other simulators inside ONE marked block
(`<!-- COMPARISON:BEGIN ... -->` .. `<!-- COMPARISON:END -->`), and
`check_doctrine` blanks that block and nothing else (a name elsewhere on the
page still fails; a missing marker pair fails -- two by-hand sabotages, both
caught).  The basic rules kept, which are EU comparative-advertising law's:
every cell is a fact the product publishes about itself, read 2026-10-07 and
cited under the table; no claim about what another product cannot do; the
trademarks used only to identify, with the notice.  Correction carried from
the search engine's own suggestion, which was FALSE: the open-source one is
GPL-3.0 and free like Choupo (its paid edition is a cloud service), so
"free vs commercial" and "glass-box vs black-box" could not be written
against it.  Also: the hero paragraph names the searched terms and the unit
operations; the JSON-LD gains codeRepository, sameAs, offers, keywords and
featureList; and `bin/buildSite` writes the EduTools list into the STATIC
page from the same `methodTools.json` the script fetches, so a crawler that
runs no JavaScript sees 49 tools instead of "Loading the EduTools...".
NOT done, said: GitHub topics (outward-facing, his to approve); a Wikipedia
entry (its conflict-of-interest rules advise against the author writing it);
Search Console (his account).

**C44. GREEN AMMONIA: SIZE EVERY UNIT AND THE STORAGE, KEEP EACH ITEM'S
INVENTORY, AND ESTIMATE THE WORKING CAPITAL (Vítor, 2026-10-07, verbatim:
"Vamos nos focar agora no caso Green Amonia. Primeiro, eu quero dimensionar
todas as operações unitárias, incluindo tanques de armazenamento de
[matérias-primas e] produtos que acabam por ser um item muito importante do
investimento. Também quero ficar com a quantidade de matérias primas e
produtos retidas em cada equipamento, porque isso vai fazer parte do capital
circulante. Também quero no final ficar com uma estimativa do capital
circulante e de fundo de maneio, que sempre me fez um pouco de confusão").**
Case: `tutorials/plant/greenAmmoniaIndustrialN2` (17 units, no postDict
today).  Measured 2026-10-07 before proposing: sizers exist for compressor,
vessel, shellTubeHX, stirredTank, pfr (catalyst bed), column, evaporator,
crystalliser, sprayDryer, cyclone (`EquipmentSize.cpp:73-96`); NONE for
gibbsReactor or phaseChanger, and no storage item of any kind; working
capital is ONE fraction of FCI (`EconomicsPass.cpp:388`, default 0.15),
with no inventory behind it.  The definitions a student is told (capital
circulante vs fundo de maneio) and the storage basis are PEDAGOGY and
DESIGN BASIS -- put to Vítor before building.
Status: scope proposed 2026-10-07.  ANSWERED: storage tanks live in the
postDict as items attached to boundary streams ("o postDict é boa ideia!").
STILL OPEN: product storage days, whether an H2 buffer is in scope, the
receivable/payable/cash days.  Slice 1 (size every unit, existing sizers
first) dispatched 2026-10-07 -- it depends on none of the open answers.
  The open answers DELEGATED (Vítor, 2026-10-07: "avança como achares
  melhor"); the commander's stated defaults, author-set design basis, each
  reversible by one line of the case: NH3 product storage 21 days,
  refrigerated atmospheric; the H2 buffer and N2 storage OUTSIDE battery
  limits (the electrolyser and the ASU own them); receivables 30 days of
  sales, payables 30 days of purchases, minimum cash 15 days of cash
  operating cost; inventories valued at COST.  Slices 2-4 (storage, inventory,
  working capital) dispatched the same day on `claude/c44-slices2-4`.
Slice 1 (sizing + costing, no storage, no economics) BUILT 2026-10-07 on
branch `claude/c44-slice1-sizing`, MERGED the same day: a `system/postDict` sizing
and costing (Turton) 14 of the 17 units -- 4 compressors by shaft power; 5
coolers as `shellTubeHX` on a declared U with the LMTD COMPUTED from the
unit's own T_in/T_out and a named utility record (new `ShellTubeHX` route,
`utility <name>;`; `LMTD` beside it refuses); the rated FEHE on its own
2000 m2 (new pass-through route when no U/LMTD/utility is declared); the
Converter as a `vessel` on the ASSUMED GHSV 20000 Nm3/(m3 h) (ammonia02's);
the three drums on vapour residence -- a LOWER BOUND for the two let-down
drums, which are liquid drums (no liquid-density route exists in the sizing
pass; it is the inventory slice's question too).  Mixers and the splitter
are not equipment.  140 golden rows appended; gate `check_design_sheet` arm
(p).
Slice 2 (product storage) BUILT 2026-10-07 on branch `claude/c44-slices2-4`,
NOT merged: `sizing { storage ( { name; stream; material; storageTime <n>
day; fillFraction; maxTankVolume; } ) }` -- a postDict item attached to a
boundary stream, V = t x mdot / (rho_liq x fill) split into equal tanks
(`StorageTankSize`), each costed on CAPCOST 2017's atmospheric API fixed-roof
row (`Turton.cpp`, cells C204:I204) and said to be a LOWER BOUND when the
liquid is stored below 0 degC.  The density comes from the case's own package
through a new on-demand hook (`SimulationResult::thermoForPost`, choupoSolve
only) and the ONE selection `storageTank` already made
(`thermo/PricedDensity`, moved out of `StorageTank.cpp` verbatim).  Green
ammonia: 21 days of `ProductNH3`, 90 % fill, at most 30 000 m3 -> two tanks
of 17 898 m3.  H2 buffer and N2 supply outside battery limits, said in the
case.  30 golden rows appended; gate `check_design_sheet` arm (q).  TWO
FINDINGS: (1) the commission's "no storage item of any kind" was FALSE -- the
`storageTank` UNIT exists (holdup KPIs, no sizer, no cost; ammonia02/03); (2)
the NH3 record's `Vliq` (681 kg/m3) reads as a 25 C datum and Rackett takes it
to ~769 kg/m3 at 238 K, while 681 is the figure usually quoted at the normal
boiling point -- if so every liquid volume from it is ~12 % small (a curation
question for Vitor, not changed).
Slice 3 (inventory held in each item) BUILT 2026-10-07 on the same branch, NOT
merged: a units entry may declare `inventory { held ( { stream; fraction; } ) }`
(or a `volume` where its sizer publishes none) and holds, per phase, V x
fraction x rho x w on the named stream's own state (`sizing/Inventory`); a
storage tank holds its working level.  Printed as a table, written to
`reports/inventory/inventory.csv`, drawn on the design sheet, published as
`equipment[].inventory` and pinned by the existing `equipment` kind (new key
family `inventory.<key>`, reader and generator in `bin/runTests`, mirror in
`check_equipment_pinned`).  Green ammonia: Converter (voidage 0.40),
Separator (level 0.25), the two let-down drums (half full) declared; the
compressors and exchangers are listed NOT DECLARED.  72 golden rows appended;
gate `check_design_sheet` arm (r) (SRK and Rackett densities recomputed from
the records).  Also fixed: the costing header's `Year:`/`CEPCI:` digits
inherited the sizing table's stream format (`2026`, `2026.0` or `2026.0000`
by which item was sized last); formatted where printed now.
Slice 4 (working capital) BUILT 2026-10-07 on the same branch, NOT merged:
`workingCapital` in the economics block is either the old fraction (every
existing economics case byte-identical, stdout and reports/economics, measured
on all six) or a BLOCK of four day counts (rawMaterialStock, receivables,
payables, minimumCash; units required) from which `buildWorkingCapital`
builds GROSS (capital circulante: raw-material stock + process inventory +
product stock + receivables + minimum cash) and NET (fundo de maneio = gross -
payables); the NET is the cash flow's WC.  Held material valued at COST (a
raw material's price, else COM_d per kg of product).  Green ammonia gains an
economics pass and `constant/economics` (H2 4.50, N2 0.05, NH3 1.00 EUR/kg,
labour 42 EUR/h -- every one AUTHOR-SET): gross 78.5 MEUR, net 51.2 MEUR
against 0.15 x FCI = 6.2 MEUR; NPV -412 MEUR (the H2 alone costs more than the
NH3 sells for at these assumed prices).  16 golden rows appended; gate
`check_cost_provenance` arm (q).  The commander's days (0/30/30/15) and the
prices are put to Vitor as assumptions.

**C43. REACTION ENTHALPY LEADS TO STANDARD STATE (Vítor, 2026-10-07: "Revê a
navegação pedagógica das EduTools do CHOUPO, sobretudo a ligação entre
Reaction Enthalpy e Standard State ... Não quero reescrever nem duplicar o
conteúdo do Standard State. Quero apenas criar uma ligação clara entre as
duas EduTools", then "Depois faz só isto e pára").**  The thermodynamics was
judged correct by him; the defect is NAVIGATION.  At the end of Reaction
Enthalpy's Kirchhoff step, a "Where does this lead?" box: the chain
ΔCp° -(Kirchhoff)-> ΔH°(T) -(Gibbs-Helmholtz)-> ΔG°(T)/T -(ΔG° = -RT ln K)->
K(T), and a link to Standard State step 10 ("Where the 1/T² comes from").
No Standard State content duplicated.
Status: DONE 2026-10-07.  A shared `LessonStep.leadsTo` field (a pointer
to another EduTool: its label, the step it continues at, a sentence and the
chain as display TeX; the link switches tool through `setActiveMethodTool`),
used once, on Reaction Enthalpy's Kirchhoff step.  Test
`gui/tests/lessonLeadsTo.test.ts` holds that the pointer lands on a LIVE tool
at a step it really has and that the chain parses.  `bin/runTests --gui`
PASS 27 / FAIL 0.  Not done: landing ON step 10 (the link opens the tool;
the step is named), because the methods workspace has no step address.

**C42. THE ENGINE PUBLISHES EACH RECYCLE'S LOOP, AND THE CANVAS LIGHTS IT
(Vítor, 2026-10-07: "Faz já", after the commander's C41 proposal had claimed
the engine already published the loop -- it did not, and that false claim
is this entry's reason; CLAUDE.md §10's rule that every engine fact in a
proposal is measured first was the one broken).**  `Flowsheet::
validateSequentialPlan` already found each tear's cycle to judge the plan; it
now WRITES it (an optional `loopsOut`): a unit is on the loop when a backward
consumer of the tear reaches it and it reaches the tear's producer, a stream
when its producer and one consumer are.  `SimulationResult::recycleLoops`,
emitted as the `recycleLoops` block (only when a tear exists -- every
tear-free result JSON is byte-identical).  The GUI reads it
(`gui/src/case/recycleLoops.ts`, membership only, exact names, a sector box
through the engine's `unitSectors`), and the `recycle` chip -- now default
OFF -- lights every unit and stream of the loop with a cyan halo; the cut
mark is always drawn.  The block carries names, no number, so no golden row
kind is owed for it.

**C41. RECYCLES ARE STREAMS LIKE THE OTHERS (Vítor, 2026-10-07, verbatim:
"as recirculações ficam a tracejado, mas isso fica esquisito porque elas são
correntes como as outras! Como achas que pode ficar mais elegante?", then
"ok! Podes refazer?" on the commander's proposal).**  A tear is drawn SOLID;
the solver's cut is a break MARK on it (two slanted strokes, with a hover
title saying what a cut is); the `recycle` chip toggles the mark and never
hides the pipe (a recycle is material); the legend's "recycle cut" row draws
the mark.  `edgeDashes.ts` gains `mark: "cut"`; the dash pattern `10 5` is
retired.  NOT built THEN (built by C42 the same day), and the commander's proposal
claimed it was cheap on a false premise: highlighting the whole LOOP needs
the cycle each tear closes, and the engine did NOT publish it (`Flowsheet::validateSequentialPlan`
finds cycles, the result JSON carries none) -- deriving it in the GUI would
be a second home for the plan's cycle detection.  The engine publishing
each tear's cycle is the next slice if he wants the loop drawn.
  Found while validating it: C40 (2026-10-06) moved lines in
`GibbsReactor.cpp` and `Flowsheet.cpp` that EduTool lessons cite by
file:line, and its validation did not run `--gui` (CLAUDE.md §10 requires it
when lines move in a cited engine file), so `main` carried two red lesson
tests overnight.  The 29 citations were re-pointed through a line map of the
C40 diff, not by hand.  Validated: `bin/runTests --gui` PASS 27 / FAIL 0
(4722 tests), typecheck clean.

**C40. "RESOLVE O PONTO1 E FICAMOS POR AQUI ATÉ SÁBADO" (Vítor, 2026-10-06,
verbatim, answering the commander's status report; point 1 was the two engine
debts the commander can take without him).**
  1. An UNPINNED authored stream whose two-phase root is DISCARDED (above every
     present component's Tc, CLAUDE.md §6 2026-09-26) kept its carried vf = 0
     and was priced on the LIQUID rung, in `resolvedInletVaporFraction` and in
     the flowsheet's post-solve surface pass (§5, 2026-09-26, item (b)).  It
     now reads the one fluid phase it can be, on the vapour leg -- the
     replacement `takeSupercriticalAsSinglePhase` already makes for an outlet
     search; `equilibriumAt` reports the discard through a new `discardedOut`;
     a pinned or produced stream is unchanged; the discard sentence says so.
     NOT changed, named: `resolveStreamThermalState` (a PRICING reader, and
     the surface pass now hands the report vf = 1 for these streams).
  2. A declared absolute temperature at or below 0 K is REFUSED by name: on a
     stream state (`StreamStateIO`, only when `T` is declared) and on a
     `gibbsReactor`'s `operation.T`; and the adiabatic Gibbs outer Newton
     REFUSES a trial at or below 0 K (`bracket = false` let gibbs05 given
     `Q -2.0e5;` walk to T = -100 K) instead of evaluating it (§5, the C11
     slice's "NAMED, NOT DONE" (1)).  Probed on gibbs05 copies, both refuse.
Status: built 2026-10-06 on `claude/c40-supercritical-and-zero-kelvin`,
MERGED 2026-10-06.  FULL REGRESSION AUTHORISED by Vítor 2026-10-06 ("faz a
regressão completa"), run once on the branch on top of main 8443fbe28:
PASS 688 / FAIL 1 / EXPECTED-FAIL 6; NO case moved.  The one failure was the
Tutorials Guide gate, stale on main since C37 item 6b changed condenser01's
header without regenerating it -- and that header had been made false by C39
(the package's K-values no longer read the Antoine); both corrected, the guide
regenerated.  Before: build, `--fast`, both refusals probed on gibbs05 copies,
the gates that read the touched files; `check_reaction_subset_approach` arm (w)
went stale as its own comment predicted and now holds the two refusals (its
cause-naming refusal has no live witness since, said in the gate).

**C38. THE RESERVED ITEMS, TAKEN (Vítor, 2026-10-05, verbatim: "Não quero que
deixes comigo!!!! Faz tu!", answering the commander's list of what stayed
reserved for him).**  The commander takes them, each one revertable merge:
  1. TRAY COST: a published tray correlation (Turton's sieve/valve tray set
     and its quantity factor) is added to the costing model ONLY with every
     coefficient transcribed from a source the general actually reads and
     cites; if no such source is readable, the refusal stays and the reason
     is recorded -- an invented set is never shipped.
     [BUILT 2026-10-05 on branch `claude/c38-costing`.  WHAT WAS SEARCHED:
     the tree (no tray coefficient anywhere; `thirdParty/`, `data/local/`
     empty of costing data); the web.  Pearson's public sample chapters of the
     4th and 5th editions stop before Appendix A.  WHAT WAS READ: CAPCOST 2017
     (`capcost_2017_rev2.xlsm`), the costing program the authors distribute
     with the 5th edition, downloaded from Richard Turton's WVU faculty page:
     sheet "Equipment Cost Data", block "Tower Trays", row Sieve, cells
     C257:G257 (K1 2.9949, K2 0.4465, K3 0.3961, A 0.07-12.3 m2); block
     "FBM", Sieve column, D262/D263/D265 (carbon steel 1.00, stainless 1.83,
     Ni-alloy 5.58); cell B267 (F_q = 10^(0.4771 + 0.08516 log N - 0.3473
     log^2 N)); and the program's macro `calculateTrayCosts` (F_q = 1 for
     N >= 20; C_p = N x 10^(...) x CEPCI/397; C_BM = C_p F_BM F_q).  WHAT WAS
     NOT READ: the book's own Appendix A table and page -- so no edition /
     table / page is cited per coefficient, and the citation is the program's
     cells instead.  What ties the program to the data already shipped: its
     vertical-vessel set equals `vesselCoeffs` digit for digit, and its own
     worked tower T-101 (32 sieve trays, D 2.1 m, H 23 m) reproduces from the
     transcribed set to 4e-7 relative on the CEPCI-397 basis (with the
     program's own pi = 3.14) -- `check_design_sheet` arm (m) recomputes it.
     The stainless and nickel-alloy F_BM are transcribed only (the anchor is a
     carbon-steel base cost).  Valve trays and demisters NOT transcribed: no
     Choupo unit sizes them.  ENGINE: `Turton::cost` routes `sieveTrays` to
     the tray-stack shape (`correlation tray-stack`); the material CLASS is a
     DECLARATION, `trayMaterial carbonSteel | stainlessSteel | nickelAlloy;`
     in the column's designRules, carried by `ColumnSize` through the new
     `EquipmentSizing::costWords` -- never read off the construction
     material's name (trays are often a different metal from the shell, and
     F_BM spans 1 to 5.58).  Absent or unknown, the trays still REFUSE by name
     (the unknown word through `registryRefusal::message`) and the total
     reads INCOMPLETE.  A sheet whose cost was priced in a material other than
     its own header's prints `pricedAs` in its cost block (catalyst charges
     gain that line too: "none: catalyst priced per kg").  GOLDENS:
     `column09_tray_hydraulics` declares `trayMaterial carbonSteel;` and gains
     3 rows (trays cost.purchased 28357.72, bareModule 37252.81, totalModule
     43958.32); NO row moved -- no golden pins a column total.  The column's
     TOTALS line went from INCOMPLETE (436 079 EUR C_TM) to 480 038 EUR.
     Gate: `check_design_sheet` arm (m) (`check_tray_stack`: anchor,
     coefficients, by-hand recomputation from the sheet's A and nTrays, two
     refusal probes; 4 sabotages).]
  2. THE COSTING MODEL'S NAME: registered `Guthrie` while every coefficient is
     Turton's.  Renamed to what it is (`Turton`), the corpus migrated in one
     pass, the old word REFUSED by name naming the new one (no dual reader).
     [BUILT 2026-10-05 on branch `claude/c38-costing`.  MEASURED FIRST: the
     key `Turton` had been registered since 2026-09-03 with `Guthrie` as an
     ANNOUNCED alias, and all 12 corpus `costing {}` blocks already said
     `method Turton;` -- so NO postDict needed migrating and no migrator was
     written.  What was left: the class and its files
     (`src/postProcessing/costing/Turton.{H,cpp}`), the alias registration
     (deleted), and the prose that named the model (src comments, the
     guides, README, docs/ai, tutorial READMEs/descriptions, the models
     catalogue).  `method Guthrie;` now REFUSES through
     `registryRefusal::message` (exit 2) with a line naming `Turton`.  No
     golden row and no result-JSON key carried the word (`type()` already
     returned `Turton`), so NO row moved.  Guthrie stays cited for what is
     his: the bare-module FORM.  NOT renamed, said rather than hidden: the
     `F_M feeds the Guthrie module-costing pass` header comment in the
     construction-material records (`data/standards/assets/*.dat` and their
     case-local copies) -- curated records, comment only, and a comment
     edit in a sealed copy is announced as cosmetic drift on every run.
     Gate: `check_cost_provenance` arm (p).]
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
Status: dispatched 2026-10-05; items 1-3 MERGED into main 2026-10-05/06, item 4 needed nothing.

**C37. THE C35/C36 LOOSE ENDS (Vítor, 2026-10-05, verbatim: "Trata tu disso
o melhor que souberes", answering the commander's list of six).**  Each lands
as one revertable merge with its moved rows listed:
  1. `flashState::resolvedInletVaporFraction` honours a pinned pure two-phase
     inlet for EVERY caller (today only heatExchanger/heater/phaseChanger read
     the pin first).
     [BUILT 2026-10-05 on `claude/c37-stream-state` (merged into main since).  The rule
     is in the one home: `resolvedInletVaporFraction` asks
     `pinnedPureQuality` first (StreamEquilibrium.H:717), and so does its
     sibling `resolveStreamThermalState` (:653, the column feed and the
     evaporator chest).  The three units' vf overrides are gone
     (HeatExchanger.cpp:88, Heater.cpp:128, PhaseChanger.cpp:232 call the
     one home alone); each keeps the pin only to PRICE its inlet at it.
     MEASURED: the corpus has no AUTHORED pinned pure two-phase inlet (the
     five fractional `vaporFraction` files are produced streams, for which
     the one home always returned the carried pin), so no golden moves; 14
     targeted cases PASS.  The fixture that shows it -- heatExchanger03's
     wetFeed declared as an authored inlet to a splitter -- published both
     branches at vf = 0 and a 98.28 kW first-law residual before, the pin
     (0.09917968728) and 0 kW after.  Gate `check_inlet_resolution` arm (k).]
  2. `bin/choupo-import` re-seals heatExchanger01 and heatExchanger03 (its
     agreement check drops the `utility <hx> heating.-.carried` row).
  3. `solidDryer` gets an exhaust-saturation limit (a fog is no longer
     published as vf = 1); the stale Theory Guide sentence on its X_final.
     [BUILT 2026-10-05 on `claude/c37-solid-dryer-saturation` (merged into main since).
     MEASURED first, at 32dbe5577: `SolidDryer.cpp:239-271` evaporated the
     isotherm's target (or what the heat paid for at the floor) and asked
     nothing of the exhaust; `:220` priced the exhaust UNPINNED, so
     `priceState` resolved a supersaturated one at its condensed equilibrium
     while `:285` published it with vf = 1.  The witness, solidDryer01 with
     its air cut from 800 to 100 kmol/h (now the case
     `solidDryer02_starved_air`), evaporated all 680.81 kg/h at 318.611 K into
     an exhaust whose package flash resolves ~524 kg/h of liquid.  NOW: the
     evaporation is the least of three and the one that binds is announced
     in the result block (`[isotherm-reached]` / `[heat-bound]` /
     `[saturation-bound]`), the last two also as a WARNING replayed in the
     caveat block (printed once per pass, not once per recycle re-solve):
     the exhaust's humidity ratio may not exceed Y_sat(T_out) -- written as
     a_w = p_w / p_sat(T_out) <= 1 through `psychrometry::airWaterActivity`
     (the same statement, and defined where `Ysat` refuses, p_sat >= 0.95 P);
     a_w rises monotonically with the evaporation (more water AND a colder
     outlet), so the saturated evaporation is bisected on [0, the isotherm's
     or the heat's cap], each trial at its OWN T_out, keeping the unsaturated
     end.  The limit is saturation itself, a_w = 1, not a knob (the
     evaporative dryer's `maxExhaustHumidity` 0.95 is a design margin).  New
     KPI `exhaust_humidity` (the exhaust's a_w).  The witness: 156.54 kg/h
     carried at a_w = 1.0000, T_out 318.6066 K (the fog answer's 318.6114 K
     -- a fog and a saturated gas beside the same water left on the powder
     hold the same enthalpy; what moves is WHERE the water is), X_final
     0.1543 against X_eq 0.0011, the unit and the plant closing at
     7e-12 kW.  GOLDENS: NO row moved -- solidDryer01, the flagship
     (DRYING.BD isotherm-reached, exhaust a_w 0.1469), lithiumBrinePlant,
     evapDryer01/02, convDryer01 and sprayDryer01/05 are byte-identical in
     every published number (an old/new build compared token by token), and
     sprayDryer02-04/06/07 PASS their goldens (they do not reach this
     unit); appended: `exhaust_humidity`
     on solidDryer01 (0.175354451046); the new witness's golden recorded
     whole.  `sugarPlantEconomicsSweep` (no golden) MOVES: its BD reached its
     isotherm into a fog on its later solves and now announces
     saturation-bound on six of them -- the exhaust carrying 145.63 to
     147.89 kg/h at ~321.3-321.4 K where the isotherm would remove 147.16
     to 245.71 kg/h; on the stream table it prints, the dry powder's water
     mole fraction moves 0.17015 -> 0.17507 (X 0.0112 against X_eq
     0.0108).  Its dryer is marginally under-aired, a case-design question
     left to Vitor.  NAMED, NOT
     FIXED: the limit is the psychrometric saturation of the WATER alone;
     the case's ideal-solution package applies Raoult's law to N2/O2/Ar on
     their extrapolated Antoine, so its dew sum at a_w = 1 is 1.0014 and it
     resolves a whisker of liquid at the saturated answer (V/F 0.99985,
     0.016 kmol/h on the witness), priced identically by the unit and the
     report.  Theory Guide: the two X_final sentences (the solid-dryer
     section and the drying chapter's equilibrium paragraph) now name the
     three limits; the PDF rebuilt; the Tutorials Guide, the case
     manifest and the release inventory regenerated for the new witness
     and the Tutorials Guide PDF rebuilt; docs/ai/unit-ops.md and CLAUDE.md
     §6 name the limit.  Gate: `check_evaporative_dryer` arm
     (g) (the witness saturation-bound with its exhaust's a_w RECOMPUTED
     from the published stream in [1 - 1e-6, 1], wetter than its isotherm,
     water picked up = water_removed, the unit's energyClosures row and the
     plant within 1e-4 kW; solidDryer01 isotherm-reached; the (f) fixture
     heat-bound); the witness joins `check_energy_closure`'s UNIT_WITNESSES.
     Sabotages: S4 the saturation test disabled -> (g); S5 the bisection
     reading a_w at the isotherm answer's T -> (g) at a_w 1.000247; a first
     S5 (keeping the supersaturated bisection end) SURVIVED -- it moves the
     answer 1e-13 relative, below the JSON's twelve digits, and proves
     nothing.]
  4. A `phaseSet VLLE` feed PRODUCED by another unit: report and producer read
     it the same way.
     [BUILT 2026-10-05 on `claude/c37-stream-state` (merged into main since).  THE RULE,
     one home: a stream means its consumer's search only when it is an
     AUTHORED inlet or a three-phase search itself published it --
     `flashState::consumerSearchApplies` (StreamEquilibrium.H, three
     overloads: the rule, a `ProcessStream`, a unit's feed dict).  Read by
     the flowsheet's `equilibriumConsumer` stamp (Flowsheet.cpp, so the
     energy report and the stream table follow) and by the VLLE unit's own
     feed pricing (IsothermalFlash.cpp `feedMeansThreePhase`; a feed it does
     not mean is re-flashed with the PRODUCER's vapour-liquid search).  "The
     producer itself is the VLLE unit" is read as: a stream a `phaseSet VLLE`
     search PUBLISHED -- its three ports now carry
     `ProcessStream::fromThreePhaseSearch`, which travels into the feed dict
     (UnitInputs.cpp, written only when set) -- so a VLLE port fed to a
     second VLLE unit keeps today's reading.  WITNESS
     `tutorials/steady/flash/vlle05_produced_feed` (sealed; vlle03's
     synthetic system with its three records ADOPTED carrying an invented,
     labelled datum so the report runs): a heater publishes the decanter's
     feed at 352.33 K, vf 0.0089 (vapour-liquid).  Before: the preheater's
     row left 193.92 kW unattributed and the plant missed by -193.92 kW;
     after: preheater -2.8e-5 kW (its Newton tolerance), decanter 0, plant
     2.8e-5 kW, and the decanter's duty is 169.815 kW (the demixing of the
     heater's outlet in the drum).  MOVED ROWS: none outside the new
     witness, whose golden is new (47 rows); the only corpus `phaseSet VLLE`
     cases (vlle03, vlle04) have authored feeds and PASS unchanged.  Gate
     `check_vlle_fallback` arm (f).]
  5. The C36 #1 saturation refusal reaches a unit's own `thermo {}` world and
     the time-integrated binaries' authored inlets.
     [BUILT 2026-10-05 on `claude/c37-stream-state` (merged into main since).  STEADY:
     `Flowsheet::solve`, after the global check, asks the world of each unit
     that consumes a pure, authored, unpinned inlet under its own
     `thermo {}` / property context (`thermoFor`, built once and cached) --
     the world `resolvedInletVaporFraction` reads that inlet in; a stream
     refused globally is not asked twice; the refusal names the unit's
     world.  TIME-INTEGRATED: `dynamicDriver`'s 0/ seeding applies the same
     refusal to its authored inlets (consumed, produced by no unit),
     prefixed by the binary's name.  The whole message has one home,
     `flashState::undeterminedStreamsMessage`.  The C36 rule is kept: the
     probe returns before evaluating K away from the stream's own T unless
     within the band.  MEASURED: pure benzene at 1 bar is on flash01's ideal
     curve at 352.826 K and on an SRK-vapour unit's at 351.925 K; unsteady02's
     pure compA at 455.608 K.  Moved rows: none -- the 23 time-integrated
     cases and the 8 per-unit-world cases PASS (listed in the commit).  Gate
     `check_overspecified_stream` arms (h), (i).  Record:
     docs/design/a-stream-is-fixed-by-two-variables.md §9.]
  6. Stale file:line citations (what-water-dat-does-not-say.md, the C33
     table), condenser01's "saturated vapour" header, `gateManifest` claims.
     [FINDING of the item-6 general on condenser01, filed as C39: a case
     declaring `pureFluids { water { method IF97; } }` priced water's
     enthalpy on IF97 while every saturation pressure the package handed out
     (`K`, `Kvec`, `Kvec_Raoult`, the Henry Poynting anchor) read the
     record's Antoine -- 1 bar boils at 372.09 K to the flash and 372.76 K
     to the enthalpy surface.  BUILT 2026-10-06 on `claude/c39-if97-dome`
     (merged into main as a5f1e112f, 2026-10-06): the declared method OWNS its component's saturation
     curve wherever the package is asked; ONE home `saturationPressure`
     (src/thermo/pureFluid/SaturationCurve), reached by `ThermoPackage::Psat`
     and by both phases; outside IF97's window (273.15 .. 647.096 K) the
     record answers, announced.  28 record reads routed, 7 left with their
     reasons.  150 of 151 sampled cases byte-identical to `a99e59370`;
     `rankine02_water` moves no number and loses a FALSE `[phase]`
     accusation against its saturated condensate.  No golden row moves.
     Gate `check_inlet_resolution` arm (l) (4 by-hand sabotages).  Record:
     docs/design/a-saturation-curve-with-two-homes.md.]
FULL REGRESSION AUTHORISED by Vítor 2026-10-05 ("sim", answering the
commander's §0.4 request for items 1, 4 and 5): run once on main with
C37 #1/#4/#5 and C38 #1/#2 merged.
Status: dispatched 2026-10-05; CLOSED 2026-10-06 (items 2 and 6 merged into
main the day work resumed, after Vítor's "Retoma").
  Items 2 and 6 BUILT 2026-10-05 on `claude/c37-housekeeping`, merged
  2026-10-06, one commit each, NO golden row moved:
   2. CAUSE: `validate_staged_agrees` looked every `utility` row up as
      `<tier>.<utility>.<field>` on an ALLOCATED entry, so the
      `<tier>.<port>.carried|unserved` row of an UNALLOCATED one (e26e5591d)
      searched for a utility called `-` and read MISSING.  FIX: ONE Python
      home for the row rule, `bin/curate/utility_rows.py` (a restatement of
      bin/runTests' `get_utility`), called by the importer AND by
      `check_utility_allocation_pinned`, whose both-ways comparison against
      the rows runTests' awk generator wrote is what holds the Python and
      awk copies together (OK, 707 quantities, 99 cases).  The awk copy
      stays: moving the suite's own checker is a path every case goes
      through.  The importer also names the kinds it does not read instead
      of filing them all as "aad/csv" (`boundary` rows are still not
      compared at seal time -- named, not built).  heatExchanger01 and
      heatExchanger03 RE-SEALED (water.dat 2607 -> 2608 in 01, the utility
      lineup sealed into both); result JSON identical leaf for leaf before
      and after; both PASS.
   6a. what-water-dat-does-not-say.md: Evaporator.cpp :373 -> :383, :325 ->
      :335, HeatExchanger.cpp :201 -> :231, PhaseChanger.cpp :704, 1140 ->
      :764, 1206; the C34 audit table's ElectrodialysisStack forward is at
      :743-744 today (its dated :725-726 kept beside it).
   6b. condenser01: `0/steam` declares `phase gas;` at its stated 372.76 K and
      the header says why -- 372.76 K is IF97's Tsat(1 bar), the curve the
      condenser reads, while the package's K-values read the record's
      Antoine (Tsat(1 bar) = 372.09 K), which is where the "0.67 K
      superheated" reading came from.  Result JSON byte-identical.  The
      FINDING it raised -- `ThermoPackage::Kvec_Raoult` read `Component::vp()`
      even where a `pureFluids` IF97 route owns the dome, so one package
      carried two saturation curves for water -- is CLOSED by C39
      (2026-10-06, the bracketed note above).
   6c. `generated/gateManifest.json` regenerated in full on 2026-10-06
      (every gate exit 0), `check_inlet_resolution`'s claim re-observed
      after C39 changed it.
  Follow-ups taken the same day, each its own merge: the Theory Guide's
  vertical-vessel B1/B2 (it quoted the horizontal 1.49/1.52; the code applies
  2.25/1.82); `sugarPlantEconomicsSweep`'s BD air sized for the richest
  sweep point (150 -> 300 kmol/h, design basis in `0/MAIN/BdAir`, every
  point now `[isotherm-reached]`; the case ships no golden, its stale prose
  table replaced by the measured one); three asset records that still named
  the retired Guthrie costing pass; `generated/codeMap.json` regenerated
  from a clean build (the committed one had read a stale `Guthrie.d`).

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
     [BUILT 2026-10-05 on branch `claude/c36-saturation-band` (merged into main since;
     after the full regression Vítor authorised ("Avança")).  The rule:
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
     binaries (their driver stamps no authored inlet) -- both CLOSED by
     C37 item 5.  Record:
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
Vítor's own deck stays his.  Status: dispatched 2026-10-05; items 1, 3, 4 and 5 MERGED into main.

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
     on `claude/c35-evaporator-latent` (merged into main since): every evaporator row
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
     vapour-liquid (no corpus case has one).  CLOSED by C37 item 4.]
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
     the new floor.  [FIXED 2026-10-05, C37 item 3: the evaporation stops
     where the exhaust saturates, announced; the witness is
     `solidDryer02_starved_air`.]  Gate `check_evaporative_dryer` extended: (a) the
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
Status: dispatched 2026-10-05; every item MERGED into main.
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
golden row moved.  Wave 2 COMPLETE (see below); its part 1 was: C16 slice 2, C26 slice 2, C4.
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
| ElectrodialysisStack.cpp:97 | forwarded unchanged to both outlets (:743-744 today; :725-726 on 296df2d9c), never priced | LEFT: a pass-through label on a brine the unit's physics requires liquid; resolving it would run the electrolyte package's flash for no information |
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
     see item 7).  P3-P5 and P7 stay his.  The gap item 7's general FOUND
     -- the solid dryer had no exhaust-saturation limit, so a starved air
     published a fog as vf = 1 -- is closed by C37 item 3 (2026-10-05): its
     evaporation now stops where the exhaust saturates, announced, gate
     `check_evaporative_dryer` arm (g).

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
     answer and says nothing (`ElementPotential.cpp:71`) -- FIXED
     2026-10-25 by C150 R07: the reactor refuses such an answer by name
     (gate `check_gibbs_condensables`).  The browser
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
     (The construction schedule, the ramp-up and a start-up cost were BUILT
     2026-10-11, C63; escalation was not.)

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
own commit, the two goldens NOT RE-RECORDED on that commit -- the moved rows were
listed in it; they were re-recorded on 2026-10-05 under C36's mandate
(1d7842629, "Re-record the 16 phaseChanger rows") and both cases PASS.**  Three sites (`PhaseChanger.cpp`, the duty mode and both
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
