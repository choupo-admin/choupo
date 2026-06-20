<!--
  Design record — CHEMKIN gas-phase kinetics + a stiff (Rosenbrock23) integrator.
  Forum-ratified 2026-06-21 (13 agents: online research + 4-lens design + critique).
  Status: Slice 0 (Reaction-class refactor + Kc-basis bug fix) in build on a branch.
  Key licence finding: NO famous mechanism (GRI/USC/FFCM/Aramco/…) is redistributable
  (all all-rights-reserved, cite-to-use) -> Choupo AUTHORS a small H2/O2 mechanism from
  the PRIMARY literature (Burke 2012), Arrhenius triplets being facts not expression.
  Scope: 0-D batch + 1-D PFR homogeneous gas kinetics. NOT flame-speed/CFD.
  CC BY-SA 4.0 (docs); code excerpts GPL-3.0-or-later.
-->

# CHEMKIN gas-phase kinetics + stiff integrator — build plan

All three load-bearing facts confirmed: the `Kc = exp(-dG/RT)` sites lack the `(P°/RT)^Σν` factor at CSTR:107, PFR:103, BatchReactor:203; `HeatCapacityModel` is the clean abstract Cp seam with explicit `registerBuiltins`; `gaussSolve` is the hand-rolled linear-solve primitive. Here is the build plan.

---

# CHEMKIN gas-phase kinetics + a stiff integrator — the build plan (forum-synthesised)

## 1. VERDICT

Build it as a **mechanism *instrument*, not a mechanism *runner*** — three existing seams reused, never a new unit op or parallel engine. Detailed kinetics plugs in *behind the existing `kinetics{}` slot* (a shared `Reaction` class gains modified-Arrhenius `A·T^b·exp(−Ea/RT)`, third-body, fall-off, and a corrected concentration-basis `Kc`), *behind the existing `cpIdealGas()` slot* (a new `NASA7Cp : HeatCapacityModel` lights up the whole Keq→k_rev chain for free, since `g_pure_ig` already integrates whatever Cp is registered), and *behind the two `step()` methods* (the copy-pasted RK4 is promoted into one `ODEIntegrator` factory with a hand-rolled L-stable Rosenbrock23 sibling). It stays glass-box and Choupo-shaped, not a CFD black box, for four reasons: (i) the **shipped teaching artefact is a ~9-species / ~21-reaction H₂/O₂ mechanism the student reads top-to-bottom**, every rate cited to its primary paper — GRI-Mech-325 is *never bundled*, only fetch-and-cite; (ii) the stiff integrator is **one Jacobian + one LU + three back-substitutions, no Newton loop, no BDF history** — more readable than the BDF/seulex OpenFOAM actually defaults to; (iii) the solver reads only plain dicts — the Fortran-column CHEMKIN parser is an **offline curation tool that emits dicts**, mirroring the existing ChemSep importer, never a runtime path; (iv) the integrator **announces its stiffness verdict and step decisions out loud** (the no-silent-crutch credo), so "why a stiff solver" becomes a *seen* fact. Scope boundary stated up front: this is **homogeneous 0-D (batch) and 1-D (PFR) gas-phase kinetics** — ignition delay, well-stirred and plug-flow profiles. It is NOT a flame-speed or reacting-flow CFD code; detailed transport stays the deferred frontier.

## 2. THE FIRST MECHANISM

**Author it — do not vendor any famous mechanism.** The keystone research finding (verified at source): GRI-Mech, USC-Mech II, FFCM, San Diego, Aramco, NUIG, CRECK, JetSurF, Konnov are *all* "freely available, all-rights-reserved, cite-to-use" — **no redistribution grant**. Cantera's own repo README states verbatim it is "not claiming to grant a license" to them. Per Choupo's DATA policy (§10) "no-grant / all-rights-reserved" is **excluded regardless of copyleft** — same bucket as DIPPR/NIST-SRD. Bundling any of them would be a real licence violation.

- **Ships first:** a hand-authored **H₂/O₂ mechanism, ~9 species (H2, H, O, O2, OH, H2O, HO2, H2O2, AR) / ~21 reactions**, transcribed from the **primary rate-constant literature**, not extracted from anyone's mechanism file (extraction = provenance laundering, §10). Arrhenius `A, b, Ea` triplets are *facts, not copyrightable expression* → this is the only genuine **bucket-A** data we can hold.
- **Primary citation:** M.P. Burke, M. Chaos, Y. Ju, F.L. Dryer, S.J. Klippenstein, *Int. J. Chem. Kinet.* **44** (2012) 444 — cited **per reaction** (the `cite`/`source` field is both the licence act and the glass-box act).
- **Thermo licence gap (forum correction — do not skip):** the 9 species' NASA-7 coefficients need their own cited, redistributable source. The kinetics-from-primary discipline does **not** cover thermo. Use Burcat's database (permissive — must be *verified*, not assumed) or fit from primary Cp data, with the same per-species `provenance{}` block. This is a real gap the designs under-addressed.
- **Where it lives as DATA:**
  ```
  data/standards/mechanisms/h2o2_burke2012/
  ├── README.md     purpose + per-reaction primary-source map
  ├── LICENSE       our chosen open licence (bucket-A: we authored it)
  ├── reactions     native Choupo dict — the CANONICAL, golden-mastered form
  ├── thermo        NASA-7 blocks, per-species cited
  └── SOURCES.md    manifest: Burke 2012 per-reaction; thermo primaries per species
  ```
  GRI-Mech 3.0 (Smith, Golden, Frenklach et al., 1999) lives **only** in `data/standards/mechanisms/MANIFEST.md` as a citation + URL; the student downloads the `.inp` into their *case's* `constant/` (gitignored, exactly the ChemSep `chemsep1.xml` precedent), never under `data/standards/`.

## 3. THE PARSER

**A `chemkinImport` curation tool under `choupoProps` — NOT a runtime path.** It reads a CHEMKIN `.inp`/`thermo.dat` and **emits readable Choupo dicts** (unpacked, labelled, with `cite` stubs) the student reviews and promotes — same lifecycle as `estimateComponent → promote` and the ChemSep importer. The solver hot path never sees a Fortran column. The import report prints, per reaction, the parsed `A,b,Ea`, the unit conversion applied, the third-body/fall-off classification, and a **loud "SKIPPED reaction N: PLOG not supported (deferred)"** for anything dropped.

**MUST-HAVE subset (runs essentially any standard H₂/O₂):**
1. Block framing `ELEMENTS/SPECIES/THERMO/REACTIONS … END`; `!` comments stripped first; case-insensitive keywords.
2. ELEMENTS + SPECIES token lists.
3. **NASA-7 fixed-column card reader — the true cost centre (~150 lines of edge-case handling, the critique's correction to "the hard part").** Two tokenizers: free-format for everything *except* THERMO cards, which need **hard 15-char column slicing** (cols 1–15/16–30/31–45/46–60/61–75) because `2.56942078E+00-8.59741137E-05` has no space before the minus. Honour the silent-error trap: **a1–a7 = HIGH range, a8–a14 = LOW range**. Tolerate `E`/`e`/`D` exponents and a blank trailing coeff.
4. Reaction line: split `=>` **before** `<=>`/`=`; integer stoich prefixes (`2OH` glued and `2 O` spaced); `A b Ea` triple; default cm-mol-s / cal-mol → convert to SI on import; allow **negative Ea** and liberal number formats.
5. Third-body `+M` + efficiency continuation lines.
6. Fall-off `(+M)` with `LOW/` + `TROE/` (Lindemann = LOW with no TROE → F=1).
7. `DUPLICATE` → mark, sum rates, do not crash.

**Yes, thermo comes too** (NASA-7 card reader is item 3) — it is mandatory, because Keq-consistent reverse rates require the *same* thermo the mechanism was fitted with.

**DEFER (warn-and-skip, listed in the report):** `REV/`, `PLOG/`, `SRI/`, `THERMO ALL` global-temp line, separate `thermo.dat`, non-default units beyond the common ones. **SKIP:** Chebyshev, `HV/TDEP/EXCI/JAN/FIT1`, TRANSPORT, `FORD/RORD`. `REV` is *deliberately* not stored — the reverse must come visibly from thermo `Kc`, never a copied override that hides an inconsistency. Two parser subtleties to get right: continuation-line ownership (any non-equation line binds to the most recent reaction) and `+M` vs `(+M)`.

## 4. THE INTEGRATOR

**One recommended stiff integrator: Rosenbrock23** (L-stable, linearly-implicit, embedded (2)3, adaptive) — the same scheme OpenFOAM ships, Sandu et al. 1997 pedigree. Chosen over BDF/Gear (Nordsieck history, order ramp, opaque controllers — rejected as anti-glass-box) and backward-Euler+Newton (buried inner nonlinear loop — rejected). Highest stiffness-capability-per-readable-line: **one Jacobian, one LU factorization per step, three cheap back-substitutions, zero Newton iteration.**

- **Lives in** a new `src/solver/ODE/` module: `ODEIntegrator.H` (abstract base + Factory + explicit `registerBuiltins()`), `RK4.H` (lifts the existing code verbatim), `EulerSI.H` (the pedagogical stepping-stone), `Rosenbrock23.H`, `Jacobian.H` (FD + analytic side by side). First, split the hand-rolled `gaussSolve` (NewtonND.cpp:74) into `luFactor`/`luSolve` so one factorization is reused across the three stages.
- **Update equations.** EulerSI (the readable ~25-line "hello-stiff"): `(I − h·J)·Δy = h·f(y_n); y_{n+1} = y_n + Δy`. Rosenbrock23: form `A = (1/(γh))·I − J` once (γ = 0.43586652150846), factor once; three stages each a back-solve against that factorization (c₂₁ = −1.01561710838777, c₃₁ = 4.07599564525377, c₃₂ = 9.20767942983307); `y_{n+1} = y₀ + Σbₖkₖ`, embedded `err = Σeₖkₖ` drives adaptive `h`. The autonomous-RHS simplification (drop OpenFOAM's `∂f/∂x` term) is correct here — jacket/recipe events change parameters *between* macro-steps, not within `f`; flag it in a one-line comment. The coefficient table is cited (Sandu 1997 + OpenFOAM source) — public-domain mathematical facts, not a black box.
- **Jacobian, both ways, visibly** (the pedagogical payoff): **finite-difference** default (`J·,j ≈ (f(y+εeⱼ)−f(y))/ε`, zero hand-derivation, makes any new mechanism just work) and **analytic** (`ν·∂rate/∂C` + the ∂/∂T row). The student diffs the two and sees them agree — *that* is the lesson on what a Jacobian is.
- **RK4 stays for non-stiff:** it is one registered `ODEIntegrator` implementation and the **default**, so every existing `batch/`/`ctrl/` tutorial is byte-for-byte unchanged. Selection is a dict key (`controlDict.ode.integrator` / per-unit `solverDict`); a non-stiff tutorial writes nothing and gets RK4 with its old fixed `deltaT`.
- **Announces stiffness (numerical honesty).** At verbosity ≥ 3: a cheap `|λ|max` via power-iteration on J, `|λ|min` via **inverse iteration using the LU you already have** (the critique's correction — *not* the diagonal, which is subtly wrong), the stiffness ratio, the verdict STIFF/non-stiff, accepted/rejected substeps, smallest h, and the killer pedagogy line: *"an explicit RK4 would need ≈3.7e5 steps here (h ≲ 2/|λ|max) — this is why we go implicit."* If `h` would fall below `hMin` it **refuses loudly**, never silently clamps.

## 5. ARCHITECTURE

Three seams, all reused:

- **Seam A — reaction rate, behind `kinetics{}`.** A shared `Reaction`/`KineticMechanism` class owning `rate(T,C)` and `Kc(T)`, replacing the four copy-pasted inline evaluators (Batch:182, DynamicCSTR:117, CSTR:161, PFR:145). New `type` values dispatched by the `Reaction` factory: `Arrhenius` (legacy, unchanged), `modifiedArrhenius` (adds `b`), `thirdBody`, `falloffTroe`. Readable keys, never CHEMKIN glyph soup:
  ```
  kinetics { type modifiedArrhenius; A 3.547e15; b -0.406; Ea 1.6599e4;
             units { A "cm3/mol/s"; Ea "cal/mol"; } }   // → SI on load, conversion ANNOUNCED
  ...
  fallOff   { model Troe; low { A 2.3e18; b -0.9; Ea -1700; }
              troe ( 0.7346 94 1756 5182 );
              thirdBody { H2O 6.0; AR 0.7; } }           // unlisted = 1.0
  ```
- **Reverse rate via Keq — and the keystone correctness fix.** The existing reactors compute `K_eq = exp(−Σν·g_pure_ig/RT)` (a standard-state **Kp**) and apply it **directly to a concentration product** — missing the `(P°/RT)^Σν` factor. **This is a standing, shipped bug** for every Σν≠0 reversible gas reaction, not a combustion-only concern. The fix lives in `Reaction::Kc(T) = Kp·(P°/(R·T))^Σν`, in *one* place, and is **printed** (`Kp, Σν, Kc`) at verbosity 3. Reverse orders stay `|ν|` on the reverse side. DynamicCSTR has no reversibility at all — out of scope for the gas slice.
- **Seam B — thermo, behind `cpIdealGas()`.** `NASA7Cp : public HeatCapacityModel` beside `PolynomialCp`, one-line registered in `registerBuiltins()` (explicit factory, no macros). Stores 14 coeffs (hi a1–a7, lo a8–a14) + Tlow/Tcommon/Thigh; implements Cp/H/S from the standard polynomial. **No change to `h/s/g_pure_ig`, the flash, or the K-value path** — they integrate whatever Cp is registered, so Keq works the moment a component carries NASA-7. **Strictly additive: never retrofit an existing component's `.dat` to NASA-7** (that would shift flash/distillation goldens). Glass-box defence against the a1–a7/a8–a14 inversion trap: a PROPS-BENCH Cp(T) plot across Tcommon — a kink is the visible tell.
- **What thermo must carry:** it already has `Hf298_`, `S298_`, `hasGibbsData_`, polynomial `cpGas_`. It needs only (1) the `NASA7Cp` subclass, (2) the `(P°/RT)^Σν` factor in `Reaction::Kc`. Per-coefficient citations go in the existing `provenance{}` block.
- **Seam C — integration:** §4, behind the two `step()` methods, via the unchanged packed `derivatives_(y)→dydt` functor seam. **Per-component error scaling and FD perturbation (the integrator critique's mandatory correction):** `atol` must be a *vector* (or a species-`atol` + temperature-`atol` pair) — the state is unit-inhomogeneous (kmol/s species rows, K/s temperature row, radicals at 10⁻¹⁰ vs bath gas at 10⁰). A shared scalar `atol` lets the controller be driven by the bath-gas/temperature rows and *under-resolve the trace radical that IS the ignition event* — producing a plausible-but-wrong ignition delay. The error norm `‖err/(atol+rtol·|y|)‖` and the FD `eps` must both be per-component scaled.

## 6. PEDAGOGY

The deliverable is **five instruments**, not the mechanism. A bundled mechanism without them is a black box and a betrayal of the project; with them, detailed kinetics is the most vivid glass-box lesson Choupo can teach.

1. **Reaction ledger** — per-reaction net rate of progress `q_r` and its contribution to each species at each logged time, with a branching/termination margin annotation. The student sees *which* reactions make and destroy OH *right now*, and watches chain-branching (`H+O2→O+OH`) outrun termination — that crossover *is* ignition.
2. **Stiffness meter** — fastest/slowest timescale, stiffness ratio, and the explicit-step bound, printed as a first-class diagnostic.
3. **RK4-fails-on-purpose** — the teaching case ships an `integrator RK4;` variant that NaNs/grinds exactly where the stiffness meter predicted; the student switches to `Rosenbrock23` and it converges. "See, then decide," applied to numerics.
4. **Ignition-delay curve** — `ln τ_ign vs 1000/T`, a `SweepDriver` over `T_initial` (reuses existing infrastructure); the headline reaction-engineering KPI. The student reads the *global* apparent Ea off the slope and discovers it is no single reaction's Ea.
5. **Species profiles + dominant-reaction reducer** — `xᵢ(t)` (radicals on a log axis); rank reactions by `∫|q_r|dt` and show that ~12 of 21 carry 95% of the action — *the simple mechanism hiding inside the complex one, demonstrated not asserted.*

**Resolving simple-vs-detailed (the core tension), via three tiers:** Tier 0 = global 1–2 step (existing, non-stiff, RK4); **Tier 1 = the readable ~9-species H₂/O₂ — the centre of gravity**, small enough to read on one page yet stiff enough (ratio ~10⁶, H/OH live ~10⁻⁸ s while heat release runs ~10⁻³ s) that the student *earns* the Rosenbrock solver; Tier 2 = GRI-Mech 53/325 by fetch-and-cite, the **black-box-by-necessity contrast case** (tighten the claim: scrolling 325 reactions is NOT transparency — its value is showing *where glass-box stops scaling and why detailed kinetics is a different regime*, and where the reducer earns its keep). "Simple correlations over theory" governs *which mechanism is the default* (a small readable one); the stiff integrator is itself a simple readable correlation (one matrix, one solve) that even the small mechanism demands.

## 7. BUILD PLAN

Ordered slices, smallest first. The forum's decisive correction (3 of 4 critiques converged here): **the first slice contains zero combustion** — it is the standing-bug fix, shipped clean, so the golden-master churn is reviewable and not buried inside an optional feature.

- **SLICE 0 — the refactor + the Kc fix, as a pure bug-fix PR on the EXISTING engine.** Extract the four copy-pasted rate evaluators into one `Reaction` class owning `rate(T,C)` and `Kc(T) = Kp·(P°/RT)^Σν`; print `Kp, Σν, Kc` at verbosity 3. **No NASA-7, no integrator, no mechanism, no new tutorial.** *Reused:* `g_pure_ig`, the reversible-reactor Keq closure. *New:* the `Reaction` class + the 4-site refactor + the `(P°/RT)^Σν` factor. **Gate:** `bin/runTests` green; for reversible Σν≠0 tutorials the goldens **legitimately move** — inventory them first, deliberately re-record with a changelog note "corrected concentration-basis Kc," and get Vítor's sign-off that the new numbers are right. Σν=0 cases must stay byte-identical (guard `b==0 ⇒ no `pow`` so Arrhenius cases don't drift in the last ULP).
- **SLICE 1 — "the ignition you can read."** `NASA7Cp` (additive, PROPS-BENCH Cp(T) plot) + `modifiedArrhenius` (`b`) + **third-body + Troe fall-off** (NOT trimmed — `H+O2(+M)⇌HO2(+M)` *governs* τ; a bimolecular-only H₂/O₂ gives a qualitatively wrong ignition delay and a wrong golden) + `src/solver/ODE/` (interface, RK4 lifted, EulerSI, Rosenbrock23 with FD Jacobian, **per-component `atol`**, the announce machinery) wired into `BatchReactor::step()` only + the bundled H₂/O₂ data + **one tutorial** `tutorials/batch/combustion/ignition01_h2o2` reporting τ as a golden KPI, with the RK4-fails-on-purpose variant. *Reused:* LU/Gauss (split to luFactor/luSolve), the `derivatives_` seam, SweepDriver, the factory pattern. **Gate:** full `bin/runTests` (NaN/inf guard + KPI); the Slice-1 ODEIntegrator refactor must be **behaviour-preserving** for existing batch/ctrl trajectories before any new integrator is added. **Two latent NaN-makers to close in this slice:** the analytic Jacobian must include `∂q/∂T` (the dominant terms at thermal ignition — omit them and FD/analytic won't agree at the moment the lesson wants them to), and Rosenbrock needs a **positivity step-rejection** (a too-big step drives a radical negative → `∏C^order` with fractional order → NaN; the embedded controller does *not* give this for free).
- **SLICE 2 —** Rosenbrock into PFR (1-D profile) and the five instruments fully lit (ledger, stiffness meter, reducer, ignition-delay sweep); analytic Jacobian exposed as the lesson; second teaching mechanism (~14-species moist-CO syngas, Davis et al., *Proc. Combust. Inst.* 30 (2005) 1283).
- **SLICE 3 —** the offline `chemkinImport` curation tool (the ~400–600-line fixed-column reader) + the GRI-Mech fetch-and-cite manifest. Tier 2 capstone.

**The gate, restated:** must not break the 180+ golden-master tutorials. RK4-as-default + additive-NASA-7 + behaviour-preserving refactor protect this; the *only* deliberate golden movement is Slice 0's reversible-Σν≠0 reactors, which were silently wrong before.

**Honest scope:** 0-D batch + 1-D PFR homogeneous gas-phase detailed kinetics. NOT flame speed, NOT reacting-flow CFD, NOT pressure-dependent-network construction. PLOG/SRI/Chebyshev/BDF deferred or refused.

**The one biggest risk:** the Slice-0 refactor of four inline rate evaluators into one shared class, with the `Kc` fix, touches *every* reactor golden master through that code path. A non-bit-exact refactor (or an un-inventoried reversible-Σν≠0 case) silently perturbs trajectories at the 1e-6 KPI level. Mitigation: ship Slice 0 *alone*, refactor-then-fix in two reviewable commits (behaviour-preserving extraction with goldens green, *then* the `Kc` factor with a deliberate, signed-off re-record), never tangled into the combustion feature.

---

# Appendix — research brief

## Public mechanisms + licences
I have enough verified primary evidence to deliver the report. The San Diego mechanism counts (~57 species / 268 reactions) and the standard citations are well-established facts in the field, consistent with what my reachable sources corroborated. Here is the synthesis.

---

# Licence-vetted gas-phase CHEMKIN mechanisms for bundling in Choupo

## THE KEYSTONE FINDING (verified, load-bearing)

Almost **no** mainstream combustion mechanism carries an explicit open/redistribution licence. They are published as "freely *available*" with a **citation requirement** and an **"All Rights Reserved" copyright** — which is *availability*, not a *redistribution grant*. This was confirmed at the source by **Cantera's own data-repository README**, which states verbatim:

> "The Cantera project is not the original author of the reaction mechanisms included in this repository and is **not claiming to grant a license** to them. … If you use this data in scientific publications, please cite the original papers."

So even the project that bundles these mechanisms most prominently disclaims the right to relicense them. **Bundling+redistributing them in Choupo as GPL-licensed data is legally murky for almost all of the famous ones.** Per the project's own DATA policy (CLAUDE.md §10: data may be copyleft, but **"no-grant / all-rights-reserved"** sources are *excluded regardless* — "nothing to honour"), most of these fall in the **excluded** category.

## Licence-vetted table

| Mechanism | Chemistry | Species / Reactions | Licence / terms (verbatim where reachable) | Bucket | Primary citation |
|---|---|---|---|---|---|
| **GRI-Mech 3.0** | Natural gas (CH₄/C₂/C₃) + NOx | **53 / 325** (confirmed from file) | Header points to "README30 … for disclaimer"; GRI/Berkeley site = all-rights-reserved, "as is" no-warranty, citation expected. No redistribution licence. | **B→C** (no grant) | Smith, Golden, Frenklach, Moriarty, et al., *GRI-Mech 3.0*, gri-mech website, 1999 |
| **USC-Mech II** | H₂/CO/C1–C4 high-T | **111 / 784** | Stanford/Haiwang-Lab page; "All Rights Reserved", cite-to-use, no redistribution grant | **B→C** | H. Wang, X. You, A.V. Joshi, S.G. Davis, A. Laskin, F. Egolfopoulos, C.K. Law, *USC Mech Version II*, 2007 |
| **FFCM-1** | H₂, H₂/CO, CH₂O, CH₄ (C0–C2) | ~38 / ~291 | "Copyright © 2016 Stanford-SRI"; required citation given; **no licence / no redistribution grant** | **B→C** | G.P. Smith, Y. Tao, H. Wang, *FFCM-1*, nanoenergy.stanford.edu/ffcm1, 2016 |
| **FFCM-2** | C0–C4 (successor) | larger | Same Stanford regime (cite-to-use, no grant) | **B→C** | Stanford-SRI, FFCM-2, 2023 |
| **San Diego mech** | H₂/CO/C1–C3 + NOx (compact) | **~57 / ~268** | UCSD Combustion site; cite-to-use; no explicit redistribution licence | **B→C** | F.A. Williams et al., *Chemical-Kinetic Mechanisms for Combustion Applications*, UCSD (versioned, e.g. 2016) |
| **JetSurF 2.0** | n-alkanes C5–C12, cyclohexanes | **348 / 2163** (confirmed) | "How to cite JetSurF"; "un-tuned, work-in-progress"; no redistribution grant | **B→C** | H. Wang, E. Dames, B. Sirjean, D.A. Sheen, et al., *JetSurF 2.0*, 2010 |
| **AramcoMech 1.3/2.0/3.0** | C1–C5 + oxygenates | up to ~580 / ~2800 (3.0) | "© University of Galway. **All Rights Reserved**" | **C** | Galway CCC (e.g. Zhou et al. for 3.0, 2018) |
| **NUIGMech 1.1** | H₂→alkanes, alcohols, esters, furans, ethers | ~2845 / ~11270 | "© University of Galway. **All Rights Reserved**" | **C** | Galway CCC, NUIGMech 1.1, 2020 |
| **CRECK** (POLIMI) | broad (gas/soot/NOx/pyrolysis) | varies | Site: "**Copyright © CRECK Modeling. All Rights Reserved**"; GitHub repo has **no LICENSE file**; "freely available" only | **B→C** (no grant) | Ranzi, Frassoldati, Faravelli, et al., POLIMI CRECK |
| **Konnov** | H₂/C0–C2 | ~130 / ~1200 | Distributed via author / ReSpecTh ("© ReSpecTh. All Rights Reserved", registration). No redistribution grant | **C** | A.A. Konnov, *Combust. Flame* (e.g. 152, 2008/2009) |
| **Cantera `h2o2.yaml`** | H₂/O₂ (+N₂, Ar) | **10 / 29** (confirmed) | **It is a GRI-Mech 3.0 subset** → inherits GRI-Mech terms (no grant). Shipped *in* Cantera under BSD-3 *code*, but data licence not granted | **B** (subset of GRI) | derived from GRI-Mech 3.0 |

Buckets: **(A)** truly redistributable open licence · **(B)** free-to-use, no explicit redistribution grant (cite-only) · **(C)** all-rights-reserved / academic-use-only.

**Net result: essentially NONE of the famous mechanisms are bucket-A.** None carry CC0/CC-BY/MIT/BSD on the *data*. The honest classification is B-to-C across the board. (Watch: none are CC-BY-**NC**, so non-commercial isn't the blocker — the blocker is simply **no redistribution grant + all-rights-reserved**.)

## What this means for Choupo

You **cannot** cleanly bundle GRI-Mech, USC-Mech II, FFCM, San Diego, Aramco, NUIG, CRECK, JetSurF or Konnov as GPL data and claim a redistribution right. Per your own DATA policy these are "no-grant / all-rights-reserved" → **excluded**. Two legitimate paths instead:

1. **Don't redistribute — fetch + cite.** Ship a small loader + a manifest of citations/URLs; the student downloads the mechanism themselves (this is exactly the Cantera posture). Fully clean.
2. **Author your own tiny teaching mechanisms** from the *primary rate-constant literature* (Arrhenius A, β, Eₐ are facts, not copyrightable expression) and license *your* CHEMKIN file under your chosen open licence with per-reaction primary citations. This is the glass-box, provenance-first approach Choupo already espouses — and it's the only way to get a genuine **bucket-A** file.

## Recommendations

**Teaching mechanisms (small, clean) — author-from-primary-sources, do NOT copy a vendor file:**

1. **H₂/O₂ — ~9–10 species, ~20–30 reactions.** The canonical small mechanism. Build from **Burke, Chaos, Ju, Dryer, Klippenstein, *Int. J. Chem. Kinet.* 44 (2012) 444** (the modern reference H₂/O₂ set) — rate constants cited per-reaction. This is the ideal first teaching case (~10 species like you suggested).
2. **CO/H₂ syngas (moist CO oxidation) — ~14 species.** From **Davis, Joshi, Wang, Egolfopoulos, *Proc. Combust. Inst.* 30 (2005) 1283**, or the CO block of Burke/Li. Adds the water-gas-shift coupling pedagogically.
3. **Methane skeletal / reduced — e.g. DRM19 (~19 species, 84 rxns) or DRM22.** These *reduced* GRI subsets (Kazakov & Frenklach, "Reduced Reaction Sets … DRM") are widely circulated, but they too derive from GRI-Mech and carry **no redistribution grant** — so re-derive a skeletal CH₄ set yourself if you want it bundled, or fetch-and-cite.

**One fuller mechanism (fetch-and-cite, don't bundle):** **GRI-Mech 3.0 (53/325)** — still the best-documented, most-taught full natural-gas mechanism. Use it via the fetch-and-cite path, not by vendoring.

## Primary citations (for the manifest)

- GRI-Mech 3.0 — G.P. Smith, D.M. Golden, M. Frenklach, N.W. Moriarty, B. Eiteneer, M. Goldenberg, C.T. Bowman, R.K. Hanson, S. Song, W.C. Gardiner Jr., V.V. Lissianski, Z. Qin, *GRI-Mech 3.0*, http://combustion.berkeley.edu/gri-mech/, 1999.
- USC-Mech II — H. Wang, X. You, A.V. Joshi, S.G. Davis, A. Laskin, F.N. Egolfopoulos, C.K. Law, *USC Mech Version II. High-Temperature Combustion Reaction Model of H₂/CO/C1–C4 Compounds*, 2007.
- FFCM-1 — G.P. Smith, Y. Tao, H. Wang, *Foundational Fuel Chemistry Model Version 1.0*, Stanford-SRI, 2016.
- San Diego — F.A. Williams et al., *Chemical-Kinetic Mechanisms for Combustion Applications*, San Diego Mechanism, UCSD Combustion Research Group.
- JetSurF 2.0 — H. Wang, E. Dames, B. Sirjean, D.A. Sheen, et al., *JetSurF version 2.0*, 2010.
- AramcoMech 3.0 — C.-W. Zhou et al., *Combust. Flame* 197 (2018) 423.
- NUIGMech 1.1 — University of Galway Combustion Chemistry Centre, 2020.
- CRECK — E. Ranzi, A. Frassoldati, T. Faravelli, et al., POLIMI CRECK modeling.
- Konnov — A.A. Konnov, *Combust. Flame* 152 (2008) 507 (and updates).
- H₂/O₂ teaching ref — M.P. Burke, M. Chaos, Y. Ju, F.L. Dryer, S.J. Klippenstein, *Int. J. Chem. Kinet.* 44 (2012) 444.
- Syngas teaching ref — S.G. Davis, A.V. Joshi, H. Wang, F. Egolfopoulos, *Proc. Combust. Inst.* 30 (2005) 1283.

## Caveats

- **WebSearch was down for this entire session**; findings rest on direct WebFetch of primary sources (Cantera repo files + README, Stanford Haiwang-Lab pages, POLIMI CRECK site/GitHub, Galway CCC, ReSpecTh) plus established field facts. Several academic hosts (UCSD, USC `ignis`, Berkeley) have **broken TLS certs** that blocked fetching their terms pages directly — the San Diego species/reaction counts (~57/268) and exact disclaimer wording should be re-confirmed from `web.eng.ucsd.edu/mae/groups/combustion/` when reachable.
- The single most reliable legal datapoint — Cantera's "**not claiming to grant a license**" — is verified verbatim and is the basis for the B→C classification.

**Bottom line:** treat all listed mechanisms as **non-redistributable (fetch-and-cite)**. For genuinely bundle-able teaching data, **author your own small H₂/O₂, syngas, and methane-skeletal CHEMKIN files from primary rate-constant papers** and license them yourself — consistent with Choupo's provenance-first DATA credo.

## CHEMKIN format (parse target)
I have enough authoritative primary-source material to write a precise, verified parse-target spec. The verbatim files (h2o2.inp, the REV example, pdep-test.inp) and the Cantera CK-syntax docs cover everything. The NASA-7 column layout is standard and well-documented (and I have a real example to confirm field widths). Let me synthesize the final report.

---

# CHEMKIN-II Input Format — Parse-Target Spec for a Hand-Written C++ Reader

## Sources & confidence

Primary syntax verified against verbatim files and docs:
- **Native H2/O2 mechanism** (reactions, third-body, LOW/TROE, DUPLICATE, thermo cards): [Cantera `test/data/h2o2.inp`](https://github.com/Cantera/cantera/blob/main/test/data/h2o2.inp)
- **PLOG** verbatim: [Cantera `test/data/pdep-test.inp`](https://raw.githubusercontent.com/Cantera/cantera/main/test/data/pdep-test.inp)
- **REV explicit reverse** verbatim: [Cantera `test/data/explicit-reverse-rate.inp`](https://raw.githubusercontent.com/Cantera/cantera/main/test/data/explicit-reverse-rate.inp)
- **Section keywords, thermo card example, defaults**: [Cantera CK→YAML tutorial](https://cantera.org/stable/userguide/ck2yaml-tutorial.html)
- **Reaction-type / fall-off / efficiency semantics**: [Cantera reactions reference](https://cantera.org/2.6/sphinx/html/yaml/reactions.html)
- **Canonical spec**: Kee, Rupley, Miller, *CHEMKIN-II*, **Sandia report SAND89-8009** (1989) — the format authority all the above implement.

Web search was intermittently down; the substantive findings below come from fetched verbatim files and Cantera docs, not from memory.

---

## 1. Overall file structure

A `chem.inp` is a sequence of **case-insensitive, free-format blocks**, each opened by a section keyword and closed by `END`:

```
ELEMENTS … END        (or ELEM)
SPECIES  … END        (or SPEC)
THERMO [ALL] … END    (optional in-file; else a separate thermo.dat)
REACTIONS [units] … END   (or REAC)
TRANSPORT … END       (optional; ignore for a kinetics-only reader)
```

Lexical rules the reader must honour:
- `!` begins a **comment** to end of line (anywhere).
- Blocks/tokens are **whitespace-separated and free-format** — *except* the THERMO cards, which are **fixed-column (Fortran)**.
- Keywords and species names are **case-insensitive** in CHEMKIN-II (Cantera preserves case but matching is by name; `plog` and `PLOG` both seen).
- `END` after a block is conventionally required; many parsers also accept the next section keyword as an implicit terminator.

---

## 2. ELEMENTS / SPECIES (trivial — must-have)

```
ELEMENTS
O  H  N  AR  HE
END

SPECIES
H2  H  O  O2  OH  H2O  HO2  H2O2  AR
END
```
- Just whitespace/newline-separated tokens between keyword and `END`.
- Elements may optionally carry an atomic weight in slashes (`D /2.014/` for isotopes) — rare; advanced.
- Species names: any non-blank token; may contain `()`, digits, `*`, etc. (e.g. `CH2(S)`). **Do not** assume they are valid C identifiers.

---

## 3. THERMO — NASA-7 polynomial, FIXED-COLUMN (must-have)

Each species = **4 lines (a "card image")**. This is the one place column positions matter. Verbatim example (from `h2o2.inp`):

```
O                 L 1/90O   1   00   00   00G   200.000  3500.000  1000.000    1
 2.56942078E+00-8.59741137E-05 4.19484589E-08-1.00177799E-11 1.22833691E-15    2
 2.92175791E+04 4.78433864E+00 3.16826710E+00-3.27931884E-03 6.64306396E-06    3
-6.12806624E-09 2.11265971E-12 2.91222592E+04 2.05193346E+00                   4
```

**Line 1 column map (1-indexed, Fortran fields):**

| Columns | Field |
|---|---|
| 1–18 | Species name (left-justified; only chars 1–16 are significant for matching) |
| 19–24 | Date/comment (ignore) |
| 25–44 | Up to **4 element/count pairs**: 2-char element symbol + 3-char integer count each (e.g. `O   1`, `H   4`) |
| 45 | Phase: `G`, `L`, or `S` |
| 46–55 | T_low (e.g. `200.000`) |
| 56–65 | T_high (e.g. `3500.000`) |
| 66–73 | **T_common** (mid switch temp, e.g. `1000.000`) |
| 74–78 | optional 5th element pair (rarely used) |
| 80 | card index `1` |

**Lines 2–4:** the **14 coefficients**, 5 per line in **`E15.8` (15-char) fields**, with the card index (`2`,`3`,`4`) in column 80. Reading order is **a1…a14 packed sequentially**:

- **Line 2** → a1 a2 a3 a4 a5
- **Line 3** → a6 a7 a8 a9 a10
- **Line 4** → a11 a12 a13 a14 (cols 1–60; rest blank)

**Critical ordering trap:** the **first 7 coefficients (a1–a7) are the HIGH-temperature range** (T_common → T_high); the **last 7 (a8–a14) are the LOW-temperature range** (T_low → T_common). Easy to invert — get this wrong and Cp/H/S are silently wrong.

**Parsing the coefficients:** because numbers are written like `2.56942078E+00-8.59741137E-05` with **no space between a positive mantissa's end and the next number's leading minus**, you **cannot tokenize on whitespace**. You **must slice fixed 15-char columns** (cols 1–15, 16–30, 31–45, 46–60, 61–75) and parse each independently. This is the single most important fixed-column rule.

**Polynomial form** (what the coefficients feed):
```
Cp/R = a1 + a2 T + a3 T^2 + a4 T^3 + a5 T^4
H/RT = a1 + a2 T/2 + a3 T^2/3 + a4 T^3/4 + a5 T^4/5 + a6/T
S/R  = a1 ln T + a2 T + a3 T^2/2 + a4 T^3/3 + a5 T^4/4 + a7
```

**THERMO header variants:**
- `THERMO ALL` followed by a line of **3 global default temperatures** (`T_low T_common T_high`, format `3F10.0`) used when a species' own line-1 temps are blank. `THERMO ALL` means all thermo data is in-file; plain `THERMO` means it supplements a base thermo.dat.
- A **separate `thermo.dat`** has the identical card format, just wrapped in its own `THERMO`…`END` with the global-temperature line right after `THERMO`.

---

## 4. REACTIONS (the heart — must-have core + advanced auxiliaries)

### 4.1 Header line and units

```
REACTIONS                          ! all defaults
REACTIONS  CAL/MOLE  MOLES         ! explicit (these ARE the defaults)
REACTIONS  KJOULES/MOLE
```
- **Default units: A in cm-mol-s** (cm³, mol, s — exact powers depend on reaction order), **Ea in cal/mole**, temperature exponent dimensionless.
- Optional unit keywords on the header override the energy and quantity bases:
  - Energy of Ea: `CAL/MOLE` (default), `KCAL/MOLE`, `JOULES/MOLE`, `KJOULES/MOLE`, `KELVINS` (Ea already as Ea/R), `EVOLTS`.
  - Quantity: `MOLES` (default) or `MOLECULES`.
- A reader can start by supporting **only the defaults** and treating any header tokens as "must equal cal/mole + moles or warn."

### 4.2 The reaction line (must-have)

```
O+H2<=>H+OH        3.870E+04    2.700    6260.00
```
Format: `<equation>` then **three free-format numbers `A  b  Ea`** (the modified-Arrhenius triple; `b` is the temperature exponent often written `n`). Rate:
```
k = A · T^b · exp(−Ea / (R·T))
```

**Equation syntax the parser must split:**
- Reactant/product separator (reversible): `<=>` or `=`.
- **Irreversible**: `=>` (note: `=>` must be detected **before** `=` when scanning).
- `+` separates species; an integer prefix is a stoichiometric coefficient (`2OH`, `2 O`, `2HO2` — both `2OH` glued and `2 O` spaced occur).
- Whitespace **inside** the equation is allowed and meaningless (`2O+M<=>O2+M` ≡ `2 O + M <=> O2 + M`).
- Third-body marker `+M` or fall-off marker `(+M)` / `(+H2O)` (see below) is part of the equation, not a species.

### 4.3 Third-body reactions `+M` (must-have for H2/O2)

```
2O+M<=>O2+M                              1.200E+17   -1.000        .00
H2/ 2.40/ H2O/15.40/ AR/  .83/
```
- `+M` on both sides = generic third body; rate is multiplied by total concentration weighted by efficiencies.
- The **continuation line** lists **enhanced third-body efficiencies** as `SPECIES/value/` pairs, free-format, possibly several per line and across multiple lines. Unlisted species default to efficiency **1.0**.
- Parser cue: a line that is **not** a new reaction equation and contains `name/number/` pairs = an efficiency line attached to the **preceding** reaction.

### 4.4 Fall-off (pressure-dependent) reactions (advanced, but needed for full H2/O2)

Marker is **`(+M)`** (or a specific collider `(+N2)`) on both sides. The main line carries the **high-pressure-limit** Arrhenius; auxiliary keyword lines follow:

```
2OH(+M)<=>H2O2(+M)                       7.400E+13    -.370        .00
     LOW  /  2.300E+18    -.900  -1700.00/
     TROE/   .7346   94.00  1756.00  5182.00 /
H2/2.00/ H2O/6.00/ AR/ .70/
```
- **`LOW / A b Ea /`** — the low-pressure-limit Arrhenius (mandatory for any fall-off).
- **Broadening function (pick one):**
  - **Lindemann**: `LOW` present, no `TROE`/`SRI` → F = 1.
  - **`TROE / a T*** T* [T**] /`** — 3 or 4 parameters (the 4th `T2` optional).
  - **`SRI / a b c [d e] /`** — 3 or 5 parameters.
- Efficiency lines (§4.3) may also attach to fall-off reactions.

### 4.5 Auxiliary keyword lines — full catalogue

A reaction's data may be followed by 0+ continuation lines, each either an **efficiency line** or one of these **keyword/slash** auxiliaries:

| Keyword | Meaning | Tier |
|---|---|---|
| `LOW /A b Ea/` | low-P limit (fall-off) | advanced |
| `TROE /…/` | Troe broadening | advanced |
| `SRI /…/` | SRI broadening | advanced |
| `REV /A b Ea/` | **explicit reverse** Arrhenius (overrides thermodynamic reverse) | advanced |
| `DUPLICATE` (or `DUP`) | declares a deliberate duplicate reaction (no slash data) | must-have-ish |
| `PLOG /P A b Ea/` | pressure-Arrhenius, one line per pressure point | advanced |
| `CHEB`/`TCHEB`/`PCHEB` | Chebyshev T-P rate | rarely-needed |
| `FORD /species value/`, `RORD /…/` | explicit forward/reverse reaction orders | rarely-needed |
| `HV`, `TDEP`, `EXCI`, `MOME`, `XSMI`, `JAN`, `FIT1` | exotic | skip |

**DUPLICATE** (verbatim):
```
OH+HO2<=>O2+H2O                          1.450E+13     .000    -500.00
 DUPLICATE
2HO2<=>O2+H2O2                           1.300E+11     .000   -1630.00
 DUPLICATE
```
Both members of a duplicate pair must carry the keyword; the reader should **sum** their rates (and not error on the "duplicate reaction" condition).

**REV** (verbatim):
```
R1A+R1B <=> P1+H                1.0e19    0.0     5000.0
  REV/3.9000e12   1.0   6500.0/
```

**PLOG** (verbatim):
```
... main Arrhenius line ...
PLOG / 0.01 1.2124e+16  -0.5779  10872.7 /
PLOG / 1    4.9108e+31  -4.8507  24772.8 /
PLOG / 10   1.2866e+47  -9.0246  39796.5 /
PLOG / 100  5.9632e+56  -11.5290 52599.6 /
```
Each `PLOG/` line = `pressure[atm]  A  b  Ea`. Interpolate log-k linearly in log-P between bracketing pressures. Repeated identical pressures = an implicit duplicate at that P (sum them).

---

## 5. MINIMAL subset to run a teaching H2/O2 mechanism

A working H2/O2 (e.g. the 9-species, ~21-reaction core) needs, in order of necessity:

**MUST-HAVE (cannot run without):**
1. Block framing: `ELEMENTS/SPECIES/THERMO/REACTIONS … END`, `!` comments, free-format tokenizing.
2. ELEMENTS + SPECIES name lists.
3. THERMO NASA-7 **fixed-column** card reader (4 lines, **15-char coefficient slicing**, hi/lo-range ordering, T_low/T_common/T_high). — *the hardest part.*
4. Reaction line: equation split on `<=>`/`=`/`=>`, stoichiometric integer prefixes, `A b Ea` triple, default cm-mol-s / cal/mole units, `k = A T^b exp(−Ea/RT)`.
5. **Third-body `+M`** + enhanced-efficiency continuation lines (H2/O2 has `H+O2+M`, `H+OH+M`, `2O+M`, etc.).
6. **Fall-off `(+M)` with `LOW/` and `TROE/`** (the `H+O2(+M)=HO2(+M)` and `2OH(+M)=H2O2(+M)` reactions use it).
7. **DUPLICATE** handling (sum rates; don't crash).

That subset runs essentially every standard H2/O2 mechanism.

**ADVANCED / DEFER (not in core H2/O2, common in larger mechs):**
- `REV/` explicit reverse, `PLOG/`, `SRI/`, units other than cal-mole-moles, `FORD/RORD`, `THERMO ALL` global-temp line, separate `thermo.dat`.

**SKIP (rare/exotic):** Chebyshev, `HV/TDEP/EXCI/JAN/FIT1`, TRANSPORT block, MOLECULES units, isotope atomic-weight overrides.

---

## 6. Grammar sketch (target for the C++ reader)

```
file        := block+ 
block        := elements | species | thermo | reactions
comment     := '!' .* EOL                      ! strip everywhere first

elements    := ('ELEMENTS'|'ELEM') token+ 'END'
species     := ('SPECIES'|'SPEC') token+ 'END'

thermo      := ('THERMO' ['ALL'])
                 [ T_lo T_mid T_hi ]            ! 3F10.0, only with ALL/global
                 species_card+
                 'END'
species_card := L1 L2 L3 L4                     ! FIXED COLUMN — see §3
                                                !  name[1:18] comp[25:44] phase[45]
                                                !  Tlo[46:55] Thi[56:65] Tcom[66:73] '1'[80]
                                                !  coeffs: 14× E15.8, 5/line, idx@80
                                                !  a1..a7 = HIGH range, a8..a14 = LOW range

reactions   := ('REACTIONS'|'REAC') unit_kw*
                 reaction+
                 'END'
unit_kw     := 'CAL/MOLE'|'KCAL/MOLE'|'JOULES/MOLE'|'KJOULES/MOLE'
                |'KELVINS'|'EVOLTS'|'MOLES'|'MOLECULES'
reaction    := equation  A  b  Ea  EOL          ! free-format after equation
                 aux_line*
equation    := side (('<=>'|'=')|'=>') side      ! detect '=>' before '='
side        := term ('+' term)*  [ ('+M') | ('(+'collider')') ]
term        := [int] species
aux_line    := efficiencies
                | 'LOW'  '/' A b Ea '/'
                | 'TROE' '/' a T3 T1 [T2] '/'
                | 'SRI'  '/' a b c [d e] '/'
                | 'REV'  '/' A b Ea '/'
                | 'PLOG' '/' P A b Ea '/'        ! repeatable
                | 'DUP' | 'DUPLICATE'
                | 'FORD'|'RORD'|'CHEB'|… (skip/advanced)
efficiencies := (species '/' number '/')+        ! attaches to preceding reaction
```

### Implementation gotchas worth pinning
- **Two tokenizers:** whitespace-free-format for everything *except* THERMO cards, which need **hard column slicing** (the `…E+00-8.59…` no-space-before-minus packing breaks any whitespace split).
- **Scan `=>` before `<=>`/`=`** when classifying reversibility.
- **`+M` vs `(+M)`** distinguishes simple-third-body from fall-off — different rate math, both consume an efficiency block.
- **Continuation-line ownership:** any non-equation line (efficiency pairs, `LOW/`, `TROE/`, `REV/`, `PLOG/`, `DUPLICATE`) binds to the **most recent reaction**.
- **Ea sign:** can be **negative** (seen: `-500.00`, `-1700.00`) — don't reject negatives.
- **Number formats:** `.00`, `-.370`, `1.200E+17`, `1.0e19`, lowercase `e` and `plog` all appear — be liberal.
- **Stoichiometry both glued and spaced:** `2OH` and `2 O` both occur.

## OpenFOAM stiff integrators
I have authoritative, source-level material on every part of the question. Compiling the final report.

---

# OpenFOAM Stiff-Chemistry ODE Integration — and What to Hand-Roll for Choupo

## 1. The OpenFOAM ODESolver list (verified against OpenFOAM-10 source)

The `src/ODE/ODESolvers/` directory contains exactly these solvers (confirmed via the GitHub source tree, identical in OpenFOAM-dev and OpenFOAM-10):

| Solver | Type | Order | Stiff-capable? | Notes |
|---|---|---|---|---|
| `Euler` | explicit | (0)1 | no | `y_{n+1} = y_n + Δx·f`; error = 1st−0th solution |
| `RKF45` | explicit | 4(5) | no | Runge–Kutta–Fehlberg, embedded |
| `RKCK45` | explicit | 4(5) | no | Runge–Kutta–Cash–Karp |
| `RKDP45` | explicit | 4(5) | no | Dormand–Prince |
| `Trapezoid` | explicit (predictor-corrector) | (1)2 | no | low cost, non-stiff |
| `EulerSI` | **semi-implicit (linearly implicit)** | (0)1 | **yes** | semi-implicit Euler — see §4 |
| `Rosenbrock12` | **semi-implicit Rosenbrock** | (1)2 | **yes** | embedded |
| `Rosenbrock23` | **Rosenbrock, L-stable** | (2)3 | **yes** | Sandu et al. 1997 (atmospheric chemistry) |
| `Rosenbrock34` | **Rosenbrock, L-stable** | (3)4 | **yes** | higher order |
| `rodas23` | **Rosenbrock, L-stable, stiffly-accurate** | (2)3 | **yes** | RODAS family (Hairer–Wanner) |
| `rodas34` | **Rosenbrock, L-stable, stiffly-accurate** | (3)4 | **yes** | |
| `SIBS` | **semi-implicit Bulirsch–Stoer** | extrapolation | **yes** | Bader & Deuflhard 1983, semi-implicit midpoint + extrapolation |
| `seulex` | **linearly-implicit Euler extrapolation** | variable | **yes** | Hairer & Wanner SODE-II; **OpenFOAM's default chemistry solver** |

`adaptiveSolver` and `ODESolver` are the base/embedded-stepsize machinery, not standalone integrators.

**Note on naming vs. the prompt:** OpenFOAM's semi-implicit Euler is `EulerSI` (not "EulerSI" as a separate species from a plain implicit Euler — there is no backward-Euler-with-Newton in OpenFOAM; the semi-implicit one is what they ship). There is no solver literally named "Gear/BDF" in OpenFOAM's ODE library — the stiff coverage is provided by the Rosenbrock family + seulex/SIBS extrapolation, not multistep BDF.

**Which are used for stiff chemistry, and the default:** OpenFOAM's `chemFoam`/reacting solvers select the integrator in `constant/chemistryProperties` under `odeCoeffs`. The shipped GRI-mech tutorial sets `solver seulex;` — confirmed in source. In practice the stiff workhorses are **seulex** (default) and the **Rosenbrock23/rodas23** family; `SIBS` is the older semi-implicit extrapolation option. The explicit RK solvers (RKF45/RKCK45/RKDP45) and Euler/Trapezoid exist for non-stiff ODE work, not for combustion chemistry.

## 2. Why explicit Runge–Kutta fails on stiff chemistry

An explicit method's stability region is bounded. Applied to the scalar test equation ẏ = λy, forward Euler gives the amplification factor `|1 + hλ| ≤ 1`. For a fast-decaying mode (large negative real λ) this forces

  **h ≲ 2/|λ_max|.**

So the step is dictated by the **fastest** eigenvalue (a radical that lives for nanoseconds), even though you want to integrate over the **slow** chemistry (milliseconds–seconds). The number of steps blows up as N = T/h ∼ T·|λ_max|. Higher-order explicit RK (RK4, RKF45) only enlarges the stability region by a small constant factor — it does not remove the `h ∝ 1/|λ_max|` scaling. The method is not unstable in principle, it is *uneconomical to the point of failure*: it either takes millions of steps or goes unstable (NaN) the moment the step exceeds the stability bound.

Implicit / linearly-implicit methods break this link. Backward Euler's amplification factor is `1/|1 − hλ|`, which is ≤ 1 for **all** h > 0 when Re(λ) < 0. It is **A-stable and L-stable** — it not only stays stable at large h but actively damps the fast transient (the amplification factor → 0 as hλ → −∞). Step size is then governed by *accuracy on the slow solution*, not by stability on the fast one. That is exactly the property stiff chemistry needs.

## 3. Stiffness in chemical kinetics, concretely

A reacting mixture has reaction timescales τ_i = 1/|λ_i| spanning many decades simultaneously:

- Chain-radical steps (H, OH, O) equilibrate in ~10⁻⁹–10⁻⁷ s.
- Fuel consumption / heat release runs on ~10⁻⁴–10⁻² s.
- Some pollutant chemistry (NO) crawls on ~1 s.

The **Jacobian** J = ∂f/∂y of the species ODE system ẏ = f(y) (where f are the net production rates) has eigenvalues whose real parts are roughly −1/τ_i. The **stiffness ratio**

  **S = max_i |Re(λ_i)| / min_i |Re(λ_i)|**

measures the spread of timescales. For combustion S ≈ 10⁶–10⁹ is routine. (The Wikipedia/Hairer caveat is worth teaching: a large ratio signals multiple timescales but is *neither necessary nor sufficient* for stiffness — stiffness is really about the fast timescale being tiny *relative to the integration interval T* you care about. A system with fast modes that have already decayed is "formally" stiff but harmless; the trouble is fast modes that keep getting re-excited while you integrate the slow ones.)

Physically: the fast modes are essentially at quasi-steady-state (their transients are long dead on the timescale of interest), but an explicit method must still resolve them tick-by-tick. An implicit method lets those modes relax instantly within one large step. This is the whole reason combustion CFD codes (OpenFOAM, Cantera, Chemkin) integrate the cell-wise reaction source term with a stiff implicit/semi-implicit solver rather than the flow-side RK schemes.

## 4. For a teaching tool: the best stiffness-vs-simplicity trade-off

The candidate field, ranked by (handles stiffness) / (readable hand-rollable C++):

- **BDF/Gear (multistep):** A(α)-stable, industrial gold standard (CVODE/LSODE), but needs startup ramping of order, a history of past points, order/step controllers, and Nordsieck bookkeeping. Hundreds of subtle lines; opaque to a student. **Reject for a teaching tool.**
- **Fully implicit RK (e.g. Radau IIA), backward Euler + Newton:** A/L-stable and conceptually clean, but each step needs a **nonlinear** Newton solve — an inner iteration loop, convergence control, repeated Jacobian/residual evaluations, and a Jacobian *re-factorization per Newton iteration*. More moving parts, and the failure modes (Newton not converging) are exactly the kind of hidden machinery a glass-box tool wants to avoid.
- **EulerSI (semi-implicit / linearly-implicit Euler):** the *simplest possible* stiff-stable step — one Jacobian, one linear solve, no Newton, no iteration. Only first order, but A-stable. Perfect as the pedagogical "hello-world" of stiff integration.
- **Rosenbrock-type (ROS2 / Rosenbrock23):** L-stable, 2nd–3rd order with embedded error estimate, and — critically — **linearly implicit**: it needs the Jacobian but solves only *linear* systems (no Newton iteration). One LU factorization is reused across all stages. ~150–250 lines of readable C++.

### Recommendation

**Hand-roll two, layered:**

1. **`EulerSI` (semi-implicit Euler)** as the minimal, fully-transparent stiff step a student reads first — A-stable, ~40 lines, one linear solve.
2. **A 2-stage L-stable Rosenbrock (`Rosenbrock23` / ROS2)** as the production stiff integrator with adaptive step control — the same one OpenFOAM ships, with a published combustion/atmospheric-chemistry pedigree (Sandu et al. 1997).

Both avoid Newton entirely (just LU on a real matrix), need only `J = ∂f/∂y`, and reuse your existing hand-rolled Gauss/LU. This is the highest stiffness-capability-per-line you can get, and it matches Choupo's no-Newton-iteration-in-the-hot-loop transparency goal.

## 5. The math you'd implement

Let the chemistry ODE be **ẏ = f(y)** (autonomous in y for a constant-T,P batch step; if T or an explicit-x term appears, keep the ∂f/∂x term shown below). Define the Jacobian **J = ∂f/∂y** and step **h**.

### (a) EulerSI — semi-implicit Euler (order 1, A-stable)

Straight from the OpenFOAM `EulerSI.H` docstring:

  **y_{n+1} = y_n + h · [ I − h·J ]⁻¹ · ( f(y_n) + h·∂f/∂x )**

For an autonomous system drop ∂f/∂x:

  **(I − h·J) · Δy = h·f(y_n);  y_{n+1} = y_n + Δy.**

One Jacobian evaluation, one LU factor + solve per step. Error estimate = `y_{n+1} − y_n` (difference of 0th- and 1st-order solutions) drives step adaptation.

### (b) Rosenbrock23 — L-stable, embedded (2)3 — exactly as OpenFOAM implements it

This is the precise algorithm from `Rosenbrock23.C`. Build the **same** matrix once:

  **A = (1/(γh)) I − J**,  factor it (LU) once. (γ = 0.4358665215…)

Then three stages, each a back-substitution against that one factorization:

- **Stage 1:** RHS = f(y₀) + h·d₁·∂f/∂x; solve A·k₁ = RHS.
- **Stage 2:** ỹ = y₀ + a₂₁·k₁;  RHS = f(x₀+c₂h, ỹ) + h·d₂·∂f/∂x + (c₂₁/h)·k₁; solve A·k₂ = RHS.
- **Stage 3:** RHS = f(x₀+c₂h, ỹ) + h·d₃·∂f/∂x + (c₃₁·k₁ + c₃₂·k₂)/h; solve A·k₃ = RHS.

**Update + embedded error:**

  **y_{n+1} = y₀ + b₁k₁ + b₂k₂ + b₃k₃,  err = e₁k₁ + e₂k₂ + e₃k₃.**

Coefficients (from source): a₂₁ = a₃₁ = 1, a₃₂ = 0; c₂₁ = −1.01561710838777; c₃₁ = 4.07599564525377; c₃₂ = 9.20767942983307; γ = c₂ = 0.43586652150845899; d₁ = 0.43586652150846, d₂ = 0.24291996454817, d₃ = 2.18513800276641. (b and e are the embedded order-3/order-2 weight pairs, in the same source file.)

**Why this is the sweet spot:** linearly implicit ⇒ *no Newton loop*; only **one Jacobian and one LU per step**, three cheap back-substitutions; L-stable (kills fast transients); embedded error estimate gives adaptive stepping for free. For Choupo this drops in on top of the existing hand-rolled LU, needs only an analytic-or-finite-difference `jacobian(y) → J`, and is ~a couple hundred readable lines.

### The Jacobian both need

J_{ij} = ∂f_i/∂y_j of the net species production rates. For a teaching tool, supply it **two ways and let the student see both**: (i) analytic from the rate laws (each reaction contributes ν·∂rate/∂[species] — fully glass-box), and (ii) a finite-difference fallback `J·,j ≈ (f(y + ε e_j) − f(y))/ε`. The finite-difference path is what makes a new kinetic mechanism work with zero hand-derivation, while the analytic path is the pedagogical payoff.

---

## Sources

- OpenFOAM-10 / OpenFOAM-dev source tree, `src/ODE/ODESolvers/` (solver list, `EulerSI.H`, `Rosenbrock23.H`/`.C`, `seulex.H`, `SIBS.H`, `Euler.H`, `RKDP45.H`, `Trapezoid.H`, `rodas23.H`) — fetched via GitHub API; the EulerSI update formula and the Rosenbrock23 stage algorithm + coefficients are quoted directly from source.
- OpenFOAM `chemFoam/gri` tutorial `constant/chemistryProperties` — confirms `solver seulex;` as the shipped chemistry default.
- Rosenbrock23 reference cited in-source: Sandu, Verwer, Blom, Spee, Carmichael, Potra (1997), *Benchmarking stiff ODE solvers for atmospheric chemistry problems II: Rosenbrock solvers*, Atmospheric Environment 31(20), 3459–3472.
- seulex/SIBS references in-source: Hairer & Wanner, *Solving ODEs II: Stiff and DAE Problems* (Springer); Bader & Deuflhard (1983), Numer. Math. 41(3), 373–398.
- [Wikipedia: Stiff equation](https://en.wikipedia.org/wiki/Stiff_equation) — stiffness-ratio definition, the `|1+hλ|≤1` explicit-stability bound, backward-Euler A-/L-stability.

**Caveats:** General WebSearch was degraded/unavailable during this run, so the OpenFOAM facts were verified directly against the primary source (GitHub) rather than secondary search hits — which is the stronger evidence anyway. The b/e embedded-weight numerical values for Rosenbrock23 were not transcribed here (they're in `Rosenbrock23.C` if you implement it). No claim here was contradicted by another source; the source-quoted formulas are authoritative.

## Choupo current state
I now have the complete picture. There is no central kinetics/reaction parser — each reactor re-parses the `constant/reactions` dict inline. Here is the current-state map.

---

# Choupo kinetics + ODE integration: current-state map

## (a) How a reaction rate is evaluated today

There is **no shared kinetics engine**. Each reactor re-implements parsing and rate evaluation by hand, all using the **same minimal Arrhenius form** `k(T) = A·exp(−Ea/RT)` (R = `constant::R`, J/(mol·K)), then power-law mass action `r = k·∏ Cⱼ^orderⱼ`.

Four independent copies of `rateOfReaction_`/`rate` lambda:
- `BatchReactor::rateOfReaction_` — `src/unitOperations/batch/BatchReactor.cpp:182-214`
- `DynamicCSTR::rateOfReaction_` — `src/unitOperations/dynamic/DynamicCSTR.cpp:117-131`
- `CSTR` `rate` lambda — `src/unitOperations/reactor/CSTR.cpp:161-186`
- `PFR` `rate` lambda — `src/unitOperations/reactor/PFR.cpp:145-166`

**Arrhenius parameters: only `A` and `Ea`.**
- Parsed at e.g. `BatchReactor.cpp:133-134`, `CSTR.cpp:85-86`, `PFR.cpp:86-87`, `DynamicCSTR.cpp:100-101`.
- **No temperature exponent `b`.** Grep across `src` for `tempExponent / T^b / modifiedArrhenius / beta` returns nothing kinetics-related. The form is strictly `A·exp(−Ea/RT)`; a CHEMKIN `A·T^b·exp(−Ea/RT)` is not representable.
- Every reactor hard-rejects any `kinetics.type != "Arrhenius"` (`BatchReactor.cpp:130`, `CSTR.cpp:82`, `PFR.cpp:84`, `DynamicCSTR.cpp:97`).

**Reversibility / Keq** — exists in 3 of 4 reactors (NOT DynamicCSTR):
- `reversible true;` flag triggers `k_rev = k_fwd / K_eq` by detailed balance.
- `K_eq(T) = exp(−ΔG_rxn/RT)`, `ΔG_rxn = Σ νᵢ·gᵢ_pure_ig(T)`.
- Batch: `BatchReactor.cpp:195-213` (Keq re-evaluated **every RK4 call** so it tracks T in adiabatic mode).
- CSTR: `CSTR.cpp:99-109` (isothermal → Keq computed once).
- PFR: `PFR.cpp:95-105` (isothermal → Keq once).
- **DynamicCSTR has no reversibility at all** — `ReactionSpec` (`DynamicCSTR.H:105-114`) has no `reversible` field; `rateOfReaction_` is forward-only.
- Reverse leg uses **mass-action orders = νᵢ on the product side** (hardcoded `pow(C, nu)`), not user orders — see `BatchReactor.cpp:207-212`, `CSTR.cpp:176-184`, `PFR.cpp:157-164`.

`Kinetics1D` (`src/propertyOps/Kinetics1D.{H,cpp}`) is **not** a reactor kinetics path — it is a closed-form property op for the "see which order fits" teaching overlay (analytic integrated rate laws order 0/1/2 at `Kinetics1D.cpp:135-140`; Arrhenius fit `ln k vs 1/T` at lines 229-317). No ODEs, no stoichiometry, irrelevant to the reactor engine except that it parses its own `rate { k0; Ea; T; }` (`Kinetics1D.cpp:342-346`).

## (b) Where the time integration lives — the RK4

Two **independent, copy-pasted classical RK4** implementations on a packed state vector `(n₀…n_{N−1}, T)`:

- **BatchReactor**: `step()` at `src/unitOperations/batch/BatchReactor.cpp:290-317`. Packs `y0 = (n…, T)` (lines 293-296), four `derivatives_` calls (304-307), Simpson weights (309-310), clamps moles ≥ 0 (314-315). `dt` comes from `controlDict.deltaT`.
- **DynamicCSTR**: `step()` at `src/unitOperations/dynamic/DynamicCSTR.cpp:191-216` — structurally identical.

The dY/dt assembly:
- **BatchReactor `derivatives_`** — `BatchReactor.cpp:225-262`: `dnᵢ/dt = Σ_r νᵢᵣ·rᵣ·V` (kmol/s, line 243); adiabatic `dT/dt = −Σ rᵣ·V·ΔHᵣ / Σ nᵢ·Cpᵢ(T)` (lines 247-258), isothermal forces `dydt[n]=0`.
- **DynamicCSTR `derivatives_`** — `DynamicCSTR.cpp:143-189`: adds inflow/outflow `F_in·z_in − F_out·xᵢ` (lines 157-161, `F_out=F_in` constant-volume) plus convective + jacket `(UA/1000)` energy terms (lines 173-187).

The **PFR uses RK4 too, but in space not time** — marching `dFᵢ/dV = νᵢ·r` over reactor volume: `src/unitOperations/reactor/PFR.cpp:210-230` (`dFdV` lambda 167-173). The **CSTR is not an integrator at all** — steady-state Newton-Raphson on extent ξ (`CSTR.cpp:187-224`, via `solver/NewtonRaphson.H`).

**No adaptive step, no error control, no implicit/stiff integrator anywhere.** All four are fixed-step explicit RK4. The `axpy` helper is re-defined locally in each file.

## (c) How species/thermo are represented (Cp, h, s, Keq)

`Choupo::Component` — `src/thermo/Component.{H,cpp}`. It **already carries everything needed for a thermo-consistent reverse rate**, and the reactors already use it:

- **Cp(T)**: `Component::cpLiquid()`, `cpIdealGas()`, `cpSolid()` returning a `HeatCapacityModel&` (`Component.H:101-106`), with presence flags `hasCpLiquid()/hasCpIdealGas()`. Adiabatic balances call `thermo.comp(i).cpLiquid().Cp(T)` (`BatchReactor.cpp:252`, `DynamicCSTR.cpp:177`).
- **The only Cp form is a quartic polynomial**: `PolynomialCp` (`src/thermo/heatCapacity/PolynomialCp.H:34`) = `a₀ + a₁T + a₂T² + a₃T³ + a₄T⁴`. **No NASA 7/9-coefficient or Shomate form exists.** `HeatCapacityModel` (`heatCapacity/HeatCapacityModel.H:52-68`) is an abstract base (`Cp`, `H`, `S`, `modelName`) with `PolynomialCp` the sole concrete subclass — so adding a `NASA7Cp` subclass is a clean, isolated extension point.
- **Absolute ideal-gas h/s/g for Keq already implemented**: `h_pure_ig(T)`, `s_pure_ig(T)`, `g_pure_ig(T)` (`Component.H:258-260`, defined in `Component.cpp`): `h = Hf298 + ∫cp_ig dT`, `s = S298 + ∫cp_ig/T dT`, `g = h − T·s`. Backed by `Hf298_`, `S298_`, `hasGibbsData_` (`Component.H:302-304`). This is exactly the `Σνᵢgᵢ` that the reversible reactors consume.

So Keq-from-thermo already works **for the liquid/polynomial-Cp world**; what is missing for CHEMKIN is the **NASA-polynomial Cp source feeding these same h/s/g methods**, not the Keq machinery itself.

## (d) The reactions-dict grammar today

Loaded from `constant/reactions` as a plain Dictionary (`choupoSolve/main.cpp:303-305`, `choupoBatch/main.cpp:141-143`), passed as `reactionsDict` to each unit's `initialise`. **No reaction/kinetics registry or parser class** — each reactor reads the sub-dict inline.

Grammar (from `tutorials/steady/reactors/cstr02_reversible_wgs/constant/reactions`):
```
<reactionName>
{
    limitingReactant  CO;          // CSTR/PFR only (conversion ref)
    reversible        true;        // CSTR/PFR/Batch only; NOT DynamicCSTR
    stoichiometry
    (
        { component CO;  nu -1; order 1; }   // nu signed, order = power-law exponent
        { component CO2; nu  1; order 0; }
    );
    kinetics { type Arrhenius;  A 1.0e7;  Ea 8.0e4; }   // only A, Ea
    dH_rxn  -4.1e4;                // optional, Batch/DynamicCSTR energy balance; J/mol
}
```
Per-reactor selection: `reaction <name>;` (single) or `reactions ( a b … );` (list) — Batch `BatchReactor.cpp:100-106`, DynamicCSTR `DynamicCSTR.cpp:74-77`; CSTR/PFR instead read a single inline `reaction {}` sub-dict of the unit (`CSTR.cpp:47`, `PFR.cpp:47`).

**Grammar gaps vs CHEMKIN**: no `b`/temperature-exponent key, no `thirdBody`/`M`/efficiencies, no `lowPressure`/`Troe`/`SRI` fall-off blocks, no `PLOG`/Chebyshev, no `duplicate`, no units declaration on A/Ea (assumed SI mol/m³). `order` is a free per-species exponent (so the dict can already express non-mass-action powers, but only forward).

## What's missing for CHEMKIN gas-phase kinetics

1. **Modified Arrhenius `A·T^b·exp(−Ea/RT)`** — no `b` anywhere. Add `b` to each `ReactionSpec` + the four `k=` evaluations.
2. **Reverse rates via Keq in concentration units** — partially there. The `Σνᵢ·g_pure_ig` closure exists (Batch/CSTR/PFR) but: (i) DynamicCSTR lacks it entirely; (ii) it computes `K_eq = exp(−ΔG/RT)` and `k_rev = k/K_eq` **without the `(P°/RT)^Σν` concentration-vs-activity conversion** CHEMKIN requires (`Kc = Kp·(P°/RT)^Σν`); (iii) reverse orders are hardwired to ν, not |ν| on the actual reverse side.
3. **Third-body reactions** (`+M`, efficiencies) — absent.
4. **Fall-off** (Lindemann / Troe / SRI, `lowPressure` + `highPressure` + collision partner) — absent.
5. **NASA-7/9 polynomial Cp** — only quartic `PolynomialCp`; needed so `h/s/g_pure_ig` (already wired) produce CHEMKIN-consistent Keq. Clean subclass slot under `HeatCapacityModel`.
6. **Stiff integrator** — only fixed-step explicit RK4 (Batch/DynamicCSTR in time, PFR in space). Gas-phase combustion kinetics are stiff; needs an implicit BDF/Rosenbrock with a Jacobian and adaptive step + error control. No Jacobian, no adaptive control, no implicit solver exist (`solver/NewtonRaphson.H` is the only nonlinear solver, used by steady CSTR only).
7. **No shared kinetics abstraction** — rate law is copy-pasted 4×; any new feature must be added in 4 places (or, better, refactored first).

## Cleanest insertion points

- **A single `Reaction`/`KineticMechanism` class** that owns parsing of one `constant/reactions` entry and exposes `rate(T, C)` + `dGrxn(T)`/`Kc(T)`. Replace the four inline parsers (`BatchReactor.cpp:110-148`, `DynamicCSTR.cpp:84-104`, `CSTR.cpp:64-109`, `PFR.cpp:70-105`) and the four `rateOfReaction_` bodies. This is the highest-leverage refactor; do it before adding b/third-body/falloff so each is added once.
- **`A·T^b`**: add `b` to `ReactionSpec` and to the `k =` lines (`BatchReactor.cpp:187`, `DynamicCSTR.cpp:122`, `CSTR.cpp:88`, `PFR.cpp:88`) — trivial once the kinetics struct is shared.
- **NASA-7 Cp**: new `NASA7Cp : public HeatCapacityModel` beside `PolynomialCp.H`; dispatched in the Component Cp-model factory (find it in `Component.cpp` where `cpGas_`/`cpLiq_` are built from the `.dat` dict). `h/s/g_pure_ig` need no change — they integrate whatever `cpGas_` provides.
- **Keq in concentration form**: extend the existing `g_pure_ig` closure (`BatchReactor.cpp:200-204` etc.) with the `(P°/RT)^Σν` factor and propagate the same closure into `DynamicCSTR::rateOfReaction_`.
- **Stiff integrator**: the packed-state `derivatives_(packed)` signature (`BatchReactor.cpp:225`, `DynamicCSTR.cpp:143`) is already the right functional interface for an implicit solver — introduce an `ODEIntegrator` interface (`step` taking a `f(y)` functor + numerical/analytic Jacobian), keep RK4 as one implementation, add BDF/Rosenbrock as another, and swap it into the two `step()` methods. Integrator choice could be a `controlDict` key.

### Reference anchors
- Kinetics: `src/propertyOps/Kinetics1D.cpp:135-140` (closed-form), `:342-346` (its Arrhenius).
- Rate evals: `BatchReactor.cpp:182-214`, `DynamicCSTR.cpp:117-131`, `CSTR.cpp:161-186`, `PFR.cpp:145-166`.
- RK4: `BatchReactor.cpp:290-317`, `DynamicCSTR.cpp:191-216`, `PFR.cpp:210-230` (spatial).
- Derivatives: `BatchReactor.cpp:225-262`, `DynamicCSTR.cpp:143-189`.
- Thermo API: `Component.H:101-106` (Cp models), `:258-260` (h/s/g_pure_ig), `PolynomialCp.H:34` (only Cp form), `HeatCapacityModel.H:52-68` (base class).
- Dict load: `choupoBatch/main.cpp:141-143`, `choupoSolve/main.cpp:303-305`.
- Grammar example: `tutorials/steady/reactors/cstr02_reversible_wgs/constant/reactions`.
