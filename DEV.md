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

1. **Ctrl physical energy** — reformulate `dynamicCSTR`'s energy equation around a
   stored `U(n,T)`/`H(n,T)` so the first-law ledger can CLAIM closure (today it
   honestly refuses).  The most "physical" open item; the honesty refusal is the
   contract to replace, not to hide.
2. **PC-SAFT association term** — the non-associating core is validated (~1 %);
   the association term is the next model growth (keep it separate from any
   migration/refactor).
3. **New unit operations / catalogue expansion** — the strength area; add with
   KPIs + a golden-master tutorial + the theory-guide section (a feature is
   incomplete without its manual).
4. **solverDict consolidation** · **speciation aliases**.
5. **Reports default-on beyond elementBalance** (mass/energy as normal
   diagnostics — measure corpus impact first).
6. **Pinch full programme** (real match sizing beyond the heuristic screen).
7. **Adsorption A4-A6** — the fixed-bed energy ledger (A4) and the cycle /
   cyclic-steady-state steps (A5-A6) still refuse in the code
   (`FixedBedAdsorber::energyLedgerGap()` names A4; flow reversal refuses as
   an A5 step).  Close them to complete the adsorption programme.

## 4b. Waiting on Vítor (not blocked — each CHANGES WHAT THE ENGINE REFUSES)

These are decisions, not tasks.  Work continues around them; none should be
taken by a helper, because each one makes the engine refuse something it
accepts today, and that is a policy call.

1. **Unread dict keys.**  A misspelt key (`murphreeEficiency`) runs silently
   with the default.  Proposal, with the three candidate strictness levels:
   [`docs/design/unread-dict-keys-proposal.md`](docs/design/unread-dict-keys-proposal.md).
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
2. **ctrl physical-energy refusal** = roadmap #1.
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
