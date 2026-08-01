# DEV.md — where the project is, and how to move it forward

The starting point for any development session on Choupo.  Read this + `CLAUDE.md`
(the always-loaded brief) and you know the state, the settled contracts, and the
next work — no need to reconstruct it from scattered notes.  Companion to
[`RELEASING.md`](RELEASING.md) (how to cut a release) — this file is *where we
are and what to do next*.

*Last synced 2026-07-31.  Verify any number against the tree before relying on it —
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
2. **Ctrl electrolyte Cp** — the dynamicCSTR's temperature ODE divides by
   Sum n_i·Cp_i read from per-component `liquidHeatCapacity`, which a
   dissolved salt cannot honestly declare (its enthalpy rides the aqueous
   ionic tier).  The slice: take the vessel Cp as the T-derivative of the
   SAME stored-H surface the canonical route prices (cp_aq for a
   solution-tier solute), so an electrolyte package can enter choupoCtrl.
   Witness-in-waiting: `ctrl10_brine_concentration` (EXPECTED-FAIL, its
   `.expect-nonconvergence` names this item; delete that file when this
   lands).  Was misattributed to roadmap #1 until 2026-08-01.
3. ~~**Williams-Otto reference case**~~ — **FIRST SLICE SHIPPED 2026-08-01**: the `williamsOttoPlant` unit (eqs. 3.6–3.11 verbatim, klb/h/°R internal, SI boundary, three conversions announced) + `ctrl12_williams_otto` landing on the published x* to all printed digits.  Remaining anchors (step responses, the four PI channels with the paper's tunings, the OuterDriver pairing on the §5 optima) stay banked in the design doc as the follow-on cases.  Originally: UNBLOCKED 2026-08-01 when Vítor
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
4. **PC-SAFT association term** — the non-associating core is validated (~1 %);
   the association term is the next model growth (keep it separate from any
   migration/refactor).
5. **New unit operations / catalogue expansion** — the strength area; add with
   KPIs + a golden-master tutorial + the theory-guide section (a feature is
   incomplete without its manual).
6. **solverDict consolidation** · **speciation aliases**.
7. **Reports default-on beyond elementBalance** (mass/energy as normal
   diagnostics — measure corpus impact first).
8. **Pinch full programme** (real match sizing beyond the heuristic screen).
9. **Adsorption A5-A6** — the cycle / cyclic-steady-state steps still
   refuse in the code (flow reversal refuses as an A5 step).  A4's energy
   ledger SHIPPED 2026-08-01: the adsorption duty is an exact state
   difference on the adsorbed inventory, the ergun-mode campaign balance
   claims at 6.7e-14 (batch18), and the A3 closure keeps a named gap.
   Close A5-A6 to complete the adsorption programme.

## 4b. Waiting on Vítor (not blocked — each CHANGES WHAT THE ENGINE REFUSES)

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
2. **`role` vocabulary migration** — `data/tmp/_ROLE_VOCABULARY_GAP.md`.
3. **flashComplex's 10 divergent component records** — adopt into the
   catalogue, or keep the case out of `tutorials/`?  Its README carries the
   numbers; this is the reason the hardest case the solver runs lives in
   `docs/design/` and is gated separately.
4. **Seal divergence: announce or refuse?**  The runtime now hashes every
   record a sealed manifest claims and SAYS which diverged (2026-07-31).  It
   does not refuse — editing your own case is exactly what a glass-box
   simulator is for, and only Vítor should decide that a stale provenance line
   stops a run.

## 5. Known debts (severity-ish)

1. **SEAL DRIFT — awaiting Vítor's decision.**  Sealed copies differ from the
   live catalogue (comment-only origin changes); no mass reseal without his call.
2. ~~**ctrl physical-energy refusal**~~ — **PAID 2026-08-01** (roadmap #1
   above).  What remains is narrower and named: the claim covers
   `dynamicCSTR`; any future dynamic unit type must fill `storedEnergy_kJ` /
   `enthalpyFlow_kW` / `heatInput_kW` or the whole rung withholds, which is
   the intended default (a unit that says nothing claims nothing).
3. **`constant/electrolyte/` transitional adapters** — the multi-ion speciation
   front-end still reads case-local `speciation.dat`/`ions.dat` sidecars in a
   couple of tutorials; fold into the sealed `species/`+`chemistry/` closure.
4. **Docs with partially-superseded "settled" sections** (a deeper pass than the
   2026-07-23 nomenclature sync — needs electrolyte-domain care, so do it with
   Vítor, not autonomously):
   - ~~`CLAUDE.md` §"Electrolyte data tree" says "7 homes"~~ — **CLOSED
     2026-07-28**: it now says 5, names the retired `methods/` and
     `phases/solid/` explicitly, and tells the reader to verify against
     `ls data/standards/` because the count has drifted once.  (A debt list
     that still lists a paid debt is the same drift one level up, which is
     why this line is struck rather than deleted.)
   - `docs/engine-capabilities.md` still narrates the retired `children`/`boundary`
     flowsheet grammar in places (343 lines, its own pass).
   Content is correct in the CODE; only the settled-note prose lags.
5. **`docs/ai/{consistency,extending,gui-credo}.md`** were not re-read in the v2
   scrub (no retired-token hits, but unverified end-to-end).
6. **Landing mobile** — the 390 px responsive fix WAS applied (`b9f17421a`,
   `f7b69592f`: minWidth:0 + clamp + wrap).  Not a standing debt, but no fresh
   390 px screenshot confirms it end-to-end (Codex: prove clean or it stays
   a check).  The adsorption debt is roadmap #7 above.

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

## 6. How to work (the short version; full: RELEASING.md)

```bash
git checkout main
# ... work; commit as Vítor Geraldes <talentgroundlda@gmail.com>, no Co-Authored-By ...
bin/runTests                 # 0 FAIL before any push (NaN/inf guard + goldens + gates)
git push origin main         # this also publishes www.choupo.org
```

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
