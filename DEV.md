# DEV.md — where the project is, and how to move it forward

The starting point for any development session on Choupo.  Read this + `CLAUDE.md`
(the always-loaded brief) and you know the state, the settled contracts, and the
next work — no need to reconstruct it from scattered notes.  Companion to
[`RELEASING.md`](RELEASING.md) (how to cut a release) — this file is *where we
are and what to do next*.

*Last synced 2026-07-21.  Verify any number against the tree before relying on it.*

---

## 1. Current state (facts, not history)

- **Branches:** `main` = the latest stable release, `dev` = `Choupo-dev` (the
  continuously-updated development line, OpenFOAM-dev style — no pre-announced
  target version).  **Work happens on `dev`.**
- **Latest release:** `Choupo-2607` — immutable git tag `v2607`, a GitHub
  Release, and a frozen browser copy at `choupo.org/v2607/app/`.  A snapshot of
  `dev` becomes the next `Choupo-YYMM` when the teaching term needs one (roughly
  every six months; decided at cut time, never pre-committed).
- **Site:** `choupo.org/app/` runs `Choupo-dev` (badged with its commit in the
  top bar, from `wasm/version.json`); `choupo.org/v2607/app/` is the frozen
  stable copy; `choupo.org/releases/` is the version storefront.
- **Health:** full regression **299 / 0** (4 deliberate EXPECTED-FAILs);
  GUI vitest ~1834; four quality gates green (doctrine, tree, retired-name,
  seal-drift, element/ctrl balance).
- **Scale:** 4 binaries, 49 unit-operation models, 288 runnable tutorials
  (255 golden-master pinned); catalogue 247 components, 205 Henry pairs,
  55 Pitzer + eNRTL sets.

## 2. The architecture in one page (pointers, not a re-derivation)

The authority is [`docs/architecture/CHOUPO-CONSTITUTION.md`](docs/architecture/CHOUPO-CONSTITUTION.md)
(level 1) + [`docs/architecture/property-architecture.md`](docs/architecture/property-architecture.md)
(level 2); the authority map is `docs/architecture/README.md`.  **These were
synchronised with the v2-native engine on 2026-07-21** — they no longer describe
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

## 4. Roadmap for `dev` (candidate work, priority-ish)

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
7. **Landing mobile layout** (390 px clips today).

## 5. Known debts (severity-ish)

1. **SEAL DRIFT — awaiting Vítor's decision.**  Sealed copies differ from the
   live catalogue (comment-only origin changes); no mass reseal without his call.
2. **ctrl physical-energy refusal** = roadmap #1.
3. **`constant/electrolyte/` transitional adapters** — the multi-ion speciation
   front-end still reads case-local `speciation.dat`/`ions.dat` sidecars in a
   couple of tutorials; fold into the sealed `species/`+`chemistry/` closure.
4. **Docs with partially-superseded "settled" sections** (a deeper pass than the
   2026-07-21 nomenclature sync): `docs/engine-capabilities.md` still narrates the
   retired `children`/`boundary` flowsheet grammar; `CLAUDE.md` §7 still says
   "7 homes" including `phases/solid/`, which was retired (minerals folded into
   `components/` `solidPhases{}`).  Content-correct in the code; the settled-note
   prose lags.
5. **`docs/ai/{consistency,extending,gui-credo}.md`** were not re-read in the v2
   scrub (no retired-token hits, but unverified end-to-end).
6. **Landing mobile** = roadmap #7.

## 6. How to work (the short version; full: RELEASING.md)

```bash
git checkout dev
# ... work; commit as Vítor Geraldes <talentgroundlda@gmail.com>, no Co-Authored-By ...
bin/runTests                 # 0 FAIL before any push (NaN/inf guard + goldens + gates)
git push origin dev
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
