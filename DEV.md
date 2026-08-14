# DEV.md — where the project is, and how to move it forward

The starting point for any development session on Choupo.  Read this + `CLAUDE.md`
(the always-loaded brief) and you know the state, the settled contracts, and the
next work — no need to reconstruct it from scattered notes.  Companion to
[`RELEASING.md`](RELEASING.md) (how to cut a release) — this file is *where we
are and what to do next*.

*Last synced 2026-08-04.  Verify any number against the tree before relying on it —
and prefer `generated/releaseInventory.json` to any number written in prose.*

---

## 1. Current state (facts, not history)

- **Branches (revised 2026-07-29):** `main` **is** `Choupo-dev` — the default
  branch carries the continuously-updated development line, no pre-announced
  target version.  **Work happens on `main`.**  A release is an immutable tag
  `vYYMM`; a `release-YYMM` branch is cut from that tag only on the day a patch
  actually ships.  `dev` is retired.  Rationale and procedure: `RELEASING.md`.
- **Latest release:** `Choupo-2607` — immutable git tag `v2607`, a GitHub
  Release, and a frozen browser copy at `choupo.org/v2607/app/`.  `main` is
  tagged as the next `Choupo-YYMM` when the teaching term needs one (roughly
  every six months; decided at cut time, never pre-committed).
- **Site:** served by a SECOND repository, `choupo-admin/choupo-admin.github.io`
  — it holds the `CNAME` and the frozen `/v2607/app/`.  This repo only BUILDS
  it: `publish-site.yml` verifies on every push to `main` and publishes
  nothing (a deploy from here would fight the user site for the domain — it
  did, for an afternoon, while the live site sat 55 commits stale).
  Publishing is a hand act, one command, in `RELEASING.md`.  **The top-bar
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
   * a reactive ADIABATIC flash needs its bracket seeded from the feed and
     not from 200 K — until then column13 claims the equilibrium half of
     the identity and column12 keeps the energy half;
   * S2 proper (a taller stripper, wider loading range so the mechanism
     check has more than four points) and S3 (the Edwards 1978 literature
     anchor, whose data is transcribed in
     `docs/design/sour-water-stripper-scope.md` Appendix A) are NOT built.
     S3 needs a decision first: Edwards' activity model is a Pitzer
     truncation, not `davies`, so it is a MODEL addition and not only a
     curation act.

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

## 4b. Waiting on Vítor (not blocked — each CHANGES WHAT THE ENGINE REFUSES)

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
> +82.93 kW to +27.98 kW.  A second instance is confirmed --
> `evapDryer01_nacl`'s 400 K drying gas, also `vf 0`.  A scan finds 27
> boundary inlets carrying the signature (unpinned, permanent gas plus a
> sub-critical species).
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
> sub-critical component present.  Two are confirmed; the rest are
> unclassified, and the scan cannot separate them without resolving each.
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

## 5. Known debts (severity-ish)

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
8. **Landing mobile** — the 390 px responsive fix WAS applied (`b9f17421a`,
   `f7b69592f`: minWidth:0 + clamp + wrap).  Not a standing debt, but no fresh
   390 px screenshot confirms it end-to-end (Codex: prove clean or it stays
   a check).  The adsorption debt is roadmap #7 above.
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

## 5b. If you are working in a HOSTED session, read this first

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
   minutes).
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
