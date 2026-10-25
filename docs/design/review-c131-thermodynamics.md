# C131 phase 2, family (a): thermodynamics, reviewed against good practice and the open reference

Status: analyst's report, 2026-10-25, branch `claude/c131-review-thermo`.
A second general refutes it next, so every claim below carries its evidence.

**Scope.** VL / LL / VLLE flash, phase stability, bubble and dew points, the
cubic equations of state (PR78, SRK), the activity models (NRTL, UNIQUAC,
Wilson, UNIFAC), and the electrolyte models only where the flash calls them
(not reviewed in depth here).

**Method.** Each item compares Choupo's formulation, numerics, limit cases and
announcements with (1) the references that define good practice and (2) the
open reference simulator, DWSIM (GPL-3.0). DWSIM was read at commit
`1abf72d1b6b41d3e9a8cc770d3cc4e8fc76e5766` (GitHub `DanWBR/dwsim`, sparse
checkout in a scratch directory). Nothing from it was copied into the tree.
Where a defect is claimed, the minimal witness was run on the engine built
from `origin/main` at `4c9d4142f`. The witnesses are scratch cases built from
corpus cases; they are not in the tree. An independent Python implementation
of the SRK/PR mixture fugacity and departure functions (its own cubic root
bracketing, not the engine's Cardano) checked the numbers. It reproduces the
engine's flash09 **vapour** enthalpy to 0.00 J/mol and the engine's PR
phi-phi K-values at a converged split to 4 decimals.

The verdicts are **SAME**, **DIFFERENT** (a legitimate choice, stated),
**WRONG** (a defect, with a witness) and **MISSING** (a check or announcement
good practice expects).

---

## 1. Summary table

| # | Item | Verdict | Action |
|---|------|---------|--------|
| W1 | γ-φ K-value omits φᵢˢᵃᵗ (and Poynting) | **WRONG** | proposal (23 cases move) |
| W2 | Bubble/dew T: trial phase priced at the given phase's composition (y = x; x₀ = y), 200–700 K bracket | **WRONG** | trivial-root refusal **fixed**; the algorithm is a proposal |
| W3 | phi-phi liquid enthalpy is not the EoS liquid-root departure that the case declares and the log announces | **WRONG** | proposal (phiPhi cases move) |
| W4 | VL flash: an exhausted composition outer loop is published as converged | **WRONG** | **fixed** |
| W5 | UNIQUAC γᵢ(xᵢ = 0) = 1 instead of γᵢ^∞ | **WRONG** | **fixed** |
| W6 | SRK m(ω) credited to Soave 1972; the coefficients are Graboski & Daubert 1978 | **WRONG** (attribution) | code comments **fixed**; guide text is a proposal |
| W7 | T-x-y diagnostic published a flat trivial-root "diagram" | **WRONG** | **fixed** (omitted, said) |
| W8 | Dew T outer loop exhausted → still "converged" | **WRONG** | **fixed** |
| M1 | VL flash: no stability check of the converged liquid against a second liquid | **MISSING** | proposal (announcement) |
| M2 | Flash publishes no equilibrium (fugacity) residual; it stops on \|Δx\|₂ | **MISSING** | proposal |
| M3 | Bubble-T has three homes for one residual | **MISSING** (arity) | proposal |
| M4 | Theory Guide: γ-φ written with φᵢˢᵃᵗ the engine does not apply; "not yet the full LL flash" is stale | **MISSING** (prose) | proposal |
| D1 | Rachford-Rice: bracketed Newton on [0, 1] after the g(0), g(1) test | SAME (outcome) / DIFFERENT (method) | none |
| D2 | Trivial K at the unsplit phi-phi feed: Wilson-K seed | SAME | none |
| D3 | LL stability: SS TPD, n pure-biased starts + perturbed feed, trajectory minimum, tm < −1e-3 | DIFFERENT (stated) | none; measured adequate |
| D4 | Cubic root selection by phase label (L = smallest > B, V = largest) | SAME as DWSIM with a phase given; DIFFERENT from M&M min-G for single-phase properties | none (contract is stated) |
| D5 | PR78 κ(ω), break at 0.491 | SAME | none |
| D6 | PR / SRK fugacity coefficient and H^R, S^R formulas | SAME | none |
| D7 | vdW one-fluid, symmetric kij, absent kij announced | SAME | none |
| D8 | NRTL τ = a + b/T, constant α | DIFFERENT (narrower T-form than DWSIM's) | none |
| D9 | UNIQUAC τ = exp(−(a + bT + cT²)/T), z = 10 | SAME | none |
| D10 | Wilson Λ with constant Vᵢ; "ideal pair" Λ = 1 | DIFFERENT (stated) | none |
| D11 | UNIFAC original, Hansen et al. 1991 table, missing a_mn announced | SAME | table version could be named in the run (minor) |
| D12 | Henry (KK/KI), Poynting anchored at the solvent's Psat | SAME | none |

---

## 2. WRONG items

### W1. The γ-φ K-value omits the saturated-vapour fugacity coefficient

* **Choupo.** `ThermoPackage::Kvec`, `src/thermo/ThermoPackage.cpp:829`
  (and the scalar `K`, `:730`): `K_i = γ_i Psat_i / (φ̂_i^V P)`. There is no
  φᵢˢᵃᵗ and no Poynting factor anywhere on this path (grep `phiSat|Poynting`:
  only the Henry branch has one).
* **Good practice.** The γ-φ (modified Raoult) form is
  `y_i Φ_i P = x_i γ_i Psat_i` with
  `Φ_i = (φ̂_i^V / φ_i^sat) exp[−V_i^L (P − Psat_i)/RT]`. This is Smith, Van
  Ness & Abbott, *Introduction to Chemical Engineering Thermodynamics*, the
  "gamma/phi formulation of VLE" (ch. 14 of the 7th ed.; equation numbers
  to be read back by the refuter), and
  Prausnitz, Lichtenthaler & de Azevedo, *Molecular Thermodynamics of
  Fluid-Phase Equilibria*, the liquid fugacity referred to the pure saturated
  liquid. With φ̂^V switched on and φˢᵃᵗ off, the pure-component limit is
  violated: a pure liquid at its own vapour pressure gets `K = 1/φ^V(Psat) ≠ 1`.
  Choupo's own Theory Guide writes the criterion **with** φᵢˢᵃᵗ
  (`docs/theoryGuide.tex:672`, `γ_i x_i Psat_i φ_i^sat = y_i φ_i P`), so the
  engine does not do what the guide teaches.
* **Reference.** DWSIM also omits φˢᵃᵗ. Its liquid is `γ Psat Poynting / P`
  (`DWSIM.Thermodynamics/PropertyPackages/ActivityCoefficientBase.vb:636`)
  and its vapour is PR (`:659`), so DWSIM shares the defect. It carries a
  Poynting factor, but that factor has its own sign defect (see §6).
* **Minimal witness.** Pure propane, 310 K, 15 bar, on the `envelope02`
  package (γ-φ, ideal liquid, PR vapour). The Antoine record gives
  Psat(310 K) = 13.0037 bar, so this state is a **subcooled liquid**
  (Tsat(15 bar) = 316.31 K). The engine's `isothermalFlash` reports:
  ```
  propane  Psat = 13.0037 bar   K = 1.1048
  Regime: superheated vapor   Converged: yes   V/F 1.000   (exit 0)
  ```
  K = 13.0037/(15 × 0.7847): the liquid is priced as an ideal liquid and the
  vapour with φ = 0.785. The independent PR gives φ^V = 0.7967 at 316.31 K
  and 15 bar, and the root of the engine's own equation
  `Psat = φ^V P` is **305.23 K**, 11 K below the true saturation
  temperature, for a single pure component.
* **Reach.** 23 corpus cases declare γ-φ with a non-ideal vapour
  (`fugacityModel PengRobinson|SRK|PCSAFT`): every ammonia-loop case
  (`ammonia01_synthesis_loop`, `ammonia02_full_plant`,
  `ammonia03_quench_converter`, `ammoniaReactor01-04`, `greenAmmonia02/03`,
  `greenAmmoniaPEQ_baseCase`, `letdown01/02`, `relief01`, `gibbs10`, `gibbs13`,
  `economics03`), the Klemola C4 splitter (`column14`, `column15`), both
  envelopes, `relief02`, `temperature01`. The ammonia separators condense NH3
  at 150–220 bar, where φ^sat of NH3 is far from 1.
* **Action: PROPOSAL, not done (golden-moving).** Use
  `K_i = γ_i Psat_i φ_i^sat exp[V_i^L (P − Psat_i)/RT] / (φ̂_i^V P)`, with φᵢˢᵃᵗ
  from the same EoS at (T, Psat_i) on the pure component's vapour root, and
  Vᵢᴸ from the record's `Vliq` (Rackett is already anchored on it). Make it
  the default whenever the vapour is not ideal, announced. An authorised
  `approximations` opt-out keeps today's form for a case that wants the
  textbook "modified Raoult" with no correction. **Rows that would move:**
  every K, V/F, separator split and duty in the 23 cases above. The list
  goes to Vítor before any `--record`.

### W2. Bubble and dew temperature price the trial phase on the wrong composition and bracket T in 200–700 K

* **Choupo.**
  * `BubblePoint::compute` evaluates `Kvec(T, P, x, x)`, the vapour at the
    liquid's composition (`src/unitOperations/saturation/BubblePoint.cpp:66`;
    the verbose copy `:251`).
  * `SaturationCurves::bubbleT` does the same
    (`src/thermo/SaturationCurves.cpp:45`). The Wang-Henke column and the
    T-x-y sweep use it.
  * `DewPoint::compute` iterates x but starts at x = y and skips the
    iteration entirely when `activity().modelName() == "ideal"`
    (`DewPoint.cpp:69`). That is true of a phi-phi package, where K depends
    on x through φ̂ᴸ.
  * All four solvers clamp T to [200, 700] K (`BubblePoint.cpp:83`, `:268`;
    `DewPoint.cpp:96`; `SaturationCurves.cpp:58`).
  * `BubblePoint::pressure` was fixed for exactly this in C92/C110: it
    iterates the incipient vapour through `incipientPhase::vapour`, and its
    header (`IncipientPhase.H`) explains why. The temperature solvers never
    got the same treatment, and the relief sizer works around it with a seed
    (`ReliefValveSize.cpp:457`).
* **Good practice.** Michelsen & Mollerup, *Thermodynamic Models:
  Fundamentals & Computational Aspects* (the saturation-point chapter): the
  incipient phase composition is an unknown, solved with
  the saturation variable (`y_i = K_i x_i`, K re-evaluated at that y). The
  trivial solution K ≡ 1 must be detected and avoided. DWSIM's PV flash
  iterates the incipient phase (`FlashAlgorithms/NestedLoops.vb`,
  `Flash_PV_1`, the `Vy(i) = Vz(i)*Ki(i)/((Ki(i)-1)*V+1)` update at `:3006`,
  with K recomputed from `(Vx, Vy)`).
* **Minimal witnesses** (pre-fix binary):
  1. **phi-phi SRK, N2 + CH4** (flash09's package). flash09's own converged
     **liquid** (x_N2 = 0.1495), saturated by the flash at 149.82 K and
     20.616 bar, gives:
     ```
     T_bubble: 200.0000 K  Converged: yes  Iterations: 1  |f| = 0  K = 1.0000 1.0000  (exit 0)
     ```
     That is the bracket floor, with K ≡ 1 identically.
  2. **phi-phi PR, propane + n-butane 50/50, 10 bar.** The engine's `dewT`
     and `bubbleT` units **both** return 251.8350 K (the seed) "Converged:
     yes" with K ≡ 1. The independent PR, iterating the incipient phase,
     gives bubble **320.69 K** and dew **332.79 K**. The engine's own flash
     on the same package is right: at 326 K it splits, V/F = 0.4258, and
     the independent K at its x, y match to 4 decimals with
     |ln(xK/y)| ≤ 3.4e-7. So the engine is inconsistent with itself.
  3. **γ-φ + PR, pure propane, 15 bar.** `T_bubble` = **228.63 K**,
     "Converged: yes", against 316.31 K. At 228.63 K PR has only one root
     (Z = 0.0556, liquid-like). The "vapour" φ = 0.06236 equals Psat/P, so
     the residual is satisfied by the crossing of Antoine with the PR
     **liquid** fugacity, not by a saturation point.
* **Action.**
  * **FIXED (refusal only).** `trivialSaturationK`
    (`src/thermo/SaturationCurves.H`): at least two components present and
    every present |K − 1| ≤ 1e-9 is not a saturation point.
    `BubblePoint::compute` and its verbose path, `DewPoint::compute` and
    `binaryTxy` now report NOT converged, or omit the diagram, naming the
    trivial root. Witnesses 1 and 2 now read "Converged: NO" with the
    `TRIVIAL` line. A pure component is deliberately excluded, because its
    genuine saturation point also has K = 1. Witness 3 is therefore **not**
    caught; the gate says so.
  * **PROPOSAL (golden-moving).** Rebuild bubble T and dew T on
    `incipientPhase::vapour` / `liquid`, the one home `BubblePoint::pressure`
    already uses. Seed T from the package's ideal K. Replace the hard
    200/700 K bracket with one derived from the components' own Tb/Tc,
    announced when it binds. **Reach:** `bubbleT`/`dewT` units, the column's
    distillate bubble point (`DistillationColumn.cpp:312`), the
    shortcut column, the batch still, both phase envelopes, the relief sizer,
    `FitParameters`, `EnthalpyConcentration`, `PropertyEvaluator`'s
    `T_bubble`, and the Wang-Henke stage temperatures through
    `SaturationCurves::bubbleT`. On a γ-φ ideal-gas package nothing moves,
    because K does not depend on y. On a γ-φ + EoS or phi-phi package,
    `envelope01`/`envelope02` and `column14`/`column15` move. **`envelope02`
    is worth a separate look.** Its header attributes its bubble-branch
    "root jump" at 17–19 bar to Newton finding another root. Witness 3 shows
    the y = x vapour root collapsing onto the liquid root, which is the more
    likely cause. That hypothesis is not proven here.

### W3. The phi-phi liquid enthalpy is not on the EoS that the case declares and the log announces

* **Choupo.** For phiPhi the builder **requires**
  `caloric { liquid { departureRoute equilibriumEquationOfState; root liquid; } }`
  (`ThermoPackageBuilder.cpp:2759`), and the run prints "caloric: departure
  from the SAME EoS (elements datum)" (`:2954`). The liquid enthalpy is
  nonetheless `H_liquid_formation` → `speciesPhaseEnthalpy`
  (`ThermoPackage.cpp:1349`, `:1506–1521`). That is the liquid-Cp leg, or
  the Watson-slope fallback for a component without a liquid Cp (CH4 in
  flash09, announced as such). The vapour is `H_ig + H^R(vapour root)`
  (`:1216`). No call anywhere evaluates `H^R` on the **liquid** root;
  `EquationOfState::H_residual` is vapour-root by contract
  (`EquationOfState.H`).
* **Good practice.** With one EoS for both phases, both phase enthalpies are
  `H_ig + H^R(root)`. The latent heat then follows from the same Gibbs
  surface that fixed the K-values (Michelsen & Mollerup, the residual
  functions from a single Helmholtz model). DWSIM's PR package prices the
  liquid with the PR mixture departure on the liquid root
  (`PropertyPackages/PengRobinson.vb:126`, `H_PR_MIX("L", ...)`). The "one
  Gibbs surface per phase" rule in `docs/ai/thermo.md` says the same.
* **Minimal witness.** flash09 as shipped. The independent SRK reproduces the
  engine's **vapour** H to 0.00 J/mol (−45 234.37). For the **liquid**
  (x_N2 = 0.1495, 149.82 K, 20.616 bar):
  `H_ig + H^R_L = −74 578.50 J/mol` against the engine's −73 993.94, a
  difference of **+584.6 J/mol**. The EoS latent heat at this split is
  29 344 J/mol and the engine's is 28 760 (2.0 % short). flash09 publishes no
  duty, so its golden cannot see this. Any phi-phi heater, column or
  adiabatic flash prices its duty on the mismatched surface: the
  "STATE A UNIT COMPUTES WITH" family of CLAUDE.md §6, inside the package.
* **Action: PROPOSAL (golden-moving).** In a phiPhi world, price the liquid
  as `H_ig(T, x) + H^R(T, P, x; liquid root)` and S likewise, through a new
  `H_residualLiquid` on the cubic. This retires the Watson fallback there
  and honours the declared caloric route. **Rows that would move:** every
  H, H_kW and boundary row of the phiPhi cases (`flash09`, `cavett01`,
  `flash10`/`flash20` (PC-SAFT), `letdown02`, `entropy01`, `exergy01`,
  `mixrules01`, `pcsaft01-03`, `ppr78Kij01`, `srk01`, `relief01`,
  `scan2d01`, `standardState01`). Whether `cavett01`'s open first-law pin
  is partly this is worth measuring before deciding.

### W4. An exhausted VL flash outer loop was published as converged — FIXED

* **Choupo (before).** `IsothermalFlash::solveCore`
  (`src/unitOperations/flash/IsothermalFlash.cpp`, the composition loop
  ending ≈ `:1612`). `sol.converged` is the **inner** Rachford-Rice verdict.
  At `maxOuterIter` the loop fell out with it standing and printed
  "converged after N composition iterations".
* **Good practice.** Michelsen & Mollerup (two-phase flash): the solution is
  the fixed point of the K-value iteration; the RR sub-problem is not the
  equilibrium. DWSIM throws when its external-iteration count exceeds the
  limit (`FlashAlgorithms/NestedLoops.vb:601–605`, `ecount > maxit_e`).
* **Witness (pre-fix).** flash02 with `maxOuterIter 1;`:
  "converged after 2 composition iterations (|Δx|₂ = 1.953e-01)",
  V/F = 0.890095 against the converged 0.797563, "Converged: yes", exit 0.
* **Fix.** After the loop, if the phase was not trivial and
  |Δx|₂ ≥ compositionTol, set `converged = false` and announce once (stdout
  at verbosity ≥ 1, plus `AdvisoryLog`, category `solver`), naming the cap,
  the last |Δx|₂ and the tolerance. The witness now exits 2 with
  "the composition outer loop did NOT converge in 1 iteration(s) ...". The
  uncapped flash02 is unchanged.
* **Reach.** Every VL flash that hits the cap. The flash chunk passed 39/39
  (§5). No corpus case was found hitting the 100-iteration default, but the
  full corpus was not run (§5).

### W5. UNIQUAC returned γ = 1 for an absent component — FIXED

* **Choupo (before).** `src/thermo/activityCoefficient/UNIQUAC.cpp:276` (at
  `4c9d4142f`): `if (x[i] <= 0.0) { gam[i] = 1.0; continue; }`.
* **Good practice.** Abrams & Prausnitz, AIChE J. 21 (1975) 116: γᵢ is
  defined in the limit xᵢ → 0 (γᵢ^∞). The combinatorial written in
  φᵢ/xᵢ = rᵢ/Σrⱼxⱼ and θᵢ/φᵢ is finite there. Choupo's own UNIFAC does
  exactly this (`UNIFAC.cpp:303–306`), and so does DWSIM's UNIQUAC, whose
  combinatorial is written in rᵢ/r and φ/θ
  (`PropertyPackages/Models/UNIQUAC.vb:431`).
* **Witness (pre-fix).** bubbleT02's ethanol–water pair, 350 K:
  γ_ethanol(x = 0) = **1**, γ_ethanol(x = 1e-9) = **7.7114**.
* **Fix.** The combinatorial is written in the two ratios, so the limit is
  returned at x = 0. γ(x = 0) = 7.71143867 against 7.71143861 at 1e-9. For
  xᵢ > 0 the two forms are the same quantity to rounding. The unused φ
  vector was removed. The EduTool `local-composition` cited the moved lines;
  its `cites` string was updated (`LocalCompositionTool.tsx`).

### W6. SRK m(ω): the attribution is inverted

* **Choupo.** `SRK.cpp` (`return 0.48508 + 1.55171ω − 0.15613ω²`, credited
  "Soave (1972)"), `SRK.H`, `docs/theoryGuide.tex:7773` and the footnote at
  `:7779–7782` ("Choupo uses the original Soave slope ...; some texts quote
  the rounded 0.480 + 1.574ω − 0.176ω²"), and `docs/propsGuide.tex:398`.
* **Good practice / sources.** Soave, Chem. Eng. Sci. 27 (1972) 1197,
  printed `m = 0.480 + 1.574ω − 0.176ω²`. The 0.48508/1.55171/0.15613 form is
  Graboski & Daubert, Ind. Eng. Chem. Process Des. Dev. 17 (1978) 443
  (Wikipedia's "Cubic equations of state" also credits this form to them).
  DWSIM runs Soave's original
  (`PropertyPackages/Models/SoaveRedlichKwong.vb:121`).
* **Size.** |Δm| ≈ 1e-3 for 0 ≤ ω ≤ 0.6 (e.g. ω = 0.344: 1.00063 against
  1.00039).
* **Action.** **FIXED:** the code comments in `SRK.cpp` and `SRK.H` now name
  Graboski & Daubert and quote Soave's form. No number changed.
  **PROPOSAL:** correct the two guide passages (a PDF rebuild; the wording
  is pedagogy and stays Vítor's). **DECISION FOR VÍTOR:** run Soave's form?
  The SRK kij records are regressed on a specific m; a kij used under
  another m is the argument the PR78 comment itself makes. Moves every SRK
  row by about 1e-3 relative.

### W7. The T-x-y diagnostic published a trivial-root "diagram" — FIXED

* **Choupo (before).** `binaryTxy` (`SaturationCurves.cpp`) never checked
  convergence and took K at y = x. flash09's result JSON carried
  `"Tbubble": [350, 350, …]`, the seed, with K ≡ 1, and the GUI draws it.
  Guard (4) in `choupoSolve/main.cpp` only knew the 200 K floor.
* **Fix.** `binaryTxy` refuses a trivial root. `main.cpp` now says
  "[txy] T-x-y block omitted: …" (verbosity ≥ 2) instead of degrading
  silently. flash09 now carries no T-x-y block; flash01 keeps its block.

### W8. The dew-point outer loop exhausted → "converged" — FIXED

The same shape as W4, in `DewPoint::compute`: 30 outer iterations on x,
then `converged` = the last Newton's verdict. It is now false when
|Δx| ≥ 1e-6 after the cap (non-ideal worlds only). No corpus witness hits
the cap; the fix is the rule, stated.

---

## 3. MISSING items

* **M1 — a VL flash does not test its converged liquid for a second
  liquid.** Michelsen & Mollerup's flash procedure tests stability of the
  converged phases before accepting them. DWSIM's two-phase `Flash_PT`
  (`NestedLoops.vb`) does not either; its liquid stability routine is
  `StabTest` (`BaseFlashAlgorithm.vb:736`, called from `:1201`), driven by
  the three-phase flash settings (`:47–114`). Witness: vlle01's UNIQUAC water + 1-butanol pair, re-declared
  γ-φ with an ideal-gas vapour, at 320 K, 1.013 bar, z_w = 0.8. The engine
  says "subcooled liquid", exit 0, with no word. The LL test on the same
  feed gives tm_min = −4.0e-2, and the LL flash splits it 0.588/0.412
  (vlle01's own golden). **Proposal:** after a VL answer (or a single-liquid
  verdict), run `michelsenTPD` on the liquid when the activity model can
  split (not Wilson, not ideal) and ANNOUNCE an unstable liquid, naming
  `phaseSet auto` / `VLLE`. This is an announcement only; no number moves.
* **M2 — the flash stops on |Δx|₂ < 1e-6 and publishes no equilibrium
  residual.** M&M recommend stopping on the fugacity residual
  Σ(ln xᵢKᵢ − ln yᵢ)² (or Δln K). With Wegstein acceleration a small step
  does not bound the residual. Measured: the PR phi-phi split above leaves
  |ln(xK/y)| up to 3.4e-7. **Proposal:** publish
  `max_i |ln(x_i φ_i^L) − ln(y_i φ_i^V)|` as a KPI and (optionally) stop on
  it. The KPI is additive (`--record-append`).
* **M3 — bubble T has three homes for one residual**:
  `BubblePoint::compute`, the verbose re-implementation inside
  `BubblePoint::solve` (`BubblePoint.cpp:251–292`, "keep them in sync"), and
  `SaturationCurves::bubbleT` (different FD step 0.25 K, maxStep 15,
  maxIter 30). W2's proposal should collapse them into one.
* **M4 — the prose.** `docs/theoryGuide.tex:672` teaches γ-φ with φᵢˢᵃᵗ
  that the engine does not apply (W1). `:686–687` says the simulator "ships
  the detector but not yet the full LL flash (§9 of CLAUDE.md)", which is
  stale: the LL and VLLE Gibbs flashes exist. The guide edits are Vítor's
  (pedagogy) and need a PDF rebuild.
* **Minor.** The UNIFAC run log never names the table it priced with
  (Hansen 1991, the original VLE table). `groups.dat` says so; the log does
  not.

---

## 4. SAME / DIFFERENT, with evidence

* **D1 Rachford-Rice.** `IsothermalFlash.cpp:69–88` (RR and dRR/dV, absent
  components skipped). The phase test is g(0) = Σz(K−1), g(1) = Σz(K−1)/K;
  the solve is `newton1D` on [0, 1] with bracketing and bisection fallback,
  from V = 0.5 (`:1536`). Once g(0) > 0 > g(1), every pole 1/(1−Kᵢ) lies
  outside [0, 1] and g is monotone there, so the root is unique and the
  bracket is safe. Rachford & Rice (1952); Whitson & Michelsen (1989)
  tighten the bracket to [(Kᵢzᵢ−1)/(Kᵢ−1), (1−zᵢ)/(1−Kᵢ)]; DWSIM does that
  with Brent (`NestedLoops.vb:327–349`). Same answer; Choupo's bracket is
  wider and the Newton is guarded. The method differs only. One related
  observation: the phase test is re-run at every outer iteration, so a
  transient K set can end the loop as "subcooled"/"superheated"
  mid-iteration. Michelsen's negative flash would carry on instead. No
  witness found; the flash09 pressure scan 22–45 bar runs V/F smoothly to 0
  at ≈ 30 bar.
* **D2 Trivial K at the unsplit phi-phi feed.** The Wilson K seed
  (`IsothermalFlash.cpp` ≈ `:1262–1290`) matches M&M's recommended
  initialisation, and the incipient-phase iteration overturns a false
  single-phase verdict at outer iteration 0. SAME.
* **D3 LL stability.** `src/solver/StabilityTest.cpp`: successive
  substitution on Y with the true modified tm, one probe per
  pure-component-biased start (0.99) plus a perturbed feed, keeping the
  trajectory minimum. Instability is declared at tm < −1e-3
  (`StabilityTest.H:98`). Michelsen 1982a uses the same trial set; DWSIM
  uses the same pure-component trial phases with a 1e-3 tolerance
  (`BaseFlashAlgorithm.vb:857`, `:863`). Measured near the water-rich
  binodal (x_BuOH = 0.017021 at 320 K): z = 0.0175 (β = 0.00108) still reads
  tm = −6.9e-3, unstable, and the LL flash returns β = 0.001080 exactly the
  lever rule. Only β ≲ 1.5e-4 can be missed. DIFFERENT (no second-order
  polish), adequate.
* **D4 Root selection.** `PR.cpp:232–265` (and SRK): with three real roots,
  the liquid takes the smallest > B and the vapour the largest. With one
  root, both take it, and the caller owns the trivial case. DWSIM: the
  same by phase label (`Models/PengRobinson.vb:1257–1263`), and min-G root
  selection when no phase is given. Choupo's single-phase `Z`, `H_residual`
  and `S_residual` are the vapour root by a stated contract
  (`EquationOfState.H`). DIFFERENT from M&M for a single-phase stream of
  unknown phase, but stated. W2 and W3 are where it bites.
* **D5 PR78.** `PR.cpp:72–79`: two-branch κ, break at ω = 0.491 (`<=` on the
  1976 branch), announced per component above the break. DWSIM
  `Models/PengRobinson78.vb:145–148`: identical coefficients and break.
  SAME. Ω_a = 0.45724, Ω_b = 0.07780: SAME.
* **D6 Fugacity and departure.** PR ln φ̂
  (`PR.cpp`, `phi`/`phiLiquid`), H^R = RT(Z−1) + (T da/dT − a)/(2√2 b)·ln[…]
  and S^R = R ln(Z−B) + (da/dT)/(2√2 b)·ln[…]. These match Peng & Robinson
  1976 and DWSIM `Models/PengRobinson.vb:1271–1276`. Checked numerically:
  the independent SRK reproduces flash09's vapour enthalpy to 0.00 J/mol,
  and the independent PR reproduces the phi-phi K-values to 4 decimals.
  SAME. (SRK Ω_a 0.42747 against the exact 0.4274802 is a 2e-6 relative
  truncation; immaterial.)
* **D7 Mixing.** vdW one-fluid, (1 − kᵢⱼ)√(aᵢaⱼ), kᵢⱼ forced symmetric. A
  missing or partially declared kᵢⱼ set is announced once
  (`PR.cpp` `fromDict`). SAME.
* **D8 NRTL.** `NRTL.cpp:319–409`: Renon & Prausnitz 1968 exactly, with
  τ = a + b/T and constant α. It is homogeneous of degree 0 in x and has a
  finite limit at xᵢ = 0. DWSIM: τ = (A + BT + CT²)/(1.98721 T) with A in
  cal/mol and a constant α (`PropertyPackages/Models/NRTL.vb:321–322`,
  `alpha12` `:34`). DIFFERENT (narrower T-form): a record regressed with
  extra temperature terms (B, C, or e·ln T, f·T) cannot be represented.
  That should be refused, not truncated; worth checking in the pair
  reader.
* **D9 UNIQUAC.** z = 10, lᵢ = (z/2)(rᵢ − qᵢ) − (rᵢ − 1),
  τ = exp(−(a + bT + cT²)/T) (Abrams & Prausnitz 1975; Winkelman et al. 2009
  for the T-form). SAME, after W5.
* **D10 Wilson.** Λᵢⱼ = (Vⱼ/Vᵢ) exp(−Aᵢⱼ/RT), constant Vᵢ from the record
  (Wilson 1964; the usual practice). An unparameterised pair is set to
  Λ = 1 (ideal) and announced, not the athermal Vⱼ/Vᵢ: DIFFERENT, stated.
  Wilson cannot split, and the LL test correctly finds no instability.
* **D11 UNIFAC.** Original UNIFAC, Hansen, Rasmussen, Fredenslund, Schiller
  & Gmehling, IECR 30 (1991) 2352: 111 subgroups, 1166 directed a_mn
  (`data/standards/parameters/UNIFAC/`), spot-checked (CH2/OH 986.5,
  OH/CH2 156.4, CH2/H2O 1318, H2O/CH2 300). The combinatorial has the
  correct infinite-dilution limit; a missing a_mn is announced as
  athermal. SAME.
* **D12 Henry.** `ThermoPackage.cpp:800–826`: K = γ₂* H(T) ·
  exp[v∞(P − Ps_solvent)/RT] / (φ^V P) (Prausnitz et al., ch. 10,
  Krichevsky-Kasarnovsky / -Ilinskaya). SAME.

---

## 5. Fixes made, tests, and validation

Files: `src/thermo/activityCoefficient/UNIQUAC.cpp` (W5),
`src/unitOperations/flash/IsothermalFlash.cpp` (W4),
`src/unitOperations/saturation/BubblePoint.cpp`, `DewPoint.cpp`,
`src/thermo/SaturationCurves.{H,cpp}` (W2 refusal, W7, W8),
`src/applications/choupoSolve/main.cpp` (the T-x-y omission is said),
`src/thermo/equationOfState/SRK.{H,cpp}` (W6, comments only),
`gui/src/ui/methods/LocalCompositionTool.tsx` (the EduTool's citation into
the moved UNIQUAC lines).

**Gate:** `bin/curate/check_thermo_limits.py` is wired into `bin/runTests`
and has a `generated/gateManifest.json` entry. It builds its five probes in
temp directories from corpus cases:
* (a) UNIQUAC γ(x = 0) = γ(x = 1e-9) to 1e-6, with γ^∞ > 2;
* (b) flash02 capped refuses naming the loop, and uncapped converges;
* (c)/(d) the trivial phi-phi bubble and dew roots are reported NOT
  converged, and bubbleT01 stays converged;
* (e) flash09 carries no T-x-y block and says why, and flash01 keeps its.

**Pre-fix evidence for every arm** (the arm fires on the old behaviour):
γ(x = 0) = 1 (`uq` witness); flash02 capped exit 0 "Converged: yes"; bubble
200 K and dew 251.8 K "Converged: yes"; flash09 JSON with `"Tbubble":
[350, …]`. All of these were measured on the pre-fix build and are quoted
above. Each fix was then reverted on its own and the gate re-run; see §5a.

**Validation run (no full regression, per §0.4):**
* `bin/runTests tutorials/steady/flash`: 39 PASS, 0 FAIL.
* The reach set: the 23 γ-φ + EoS cases, the 7 UNIQUAC cases,
  `tutorials/steady/distillation`, `tutorials/props/molecular` and
  `cavett01`.
* `bin/runTests --fast`.
* The gates that read the touched files.
* **Pending:** `--gui` (no `node_modules` in this worktree: the EduTool
  `cites` string changed, so `--gui` is owed before merge) and the full
  sweep (W4 touches the shared flash path; a sweep needs Vítor's
  authorisation and a written reason).

### 5a. Results

* `tutorials/steady/flash`: **39 PASS / 0 FAIL**.
* Reach set: **PASS 67 / FAIL 0 / KNOWN-BROKEN 0 / EXPECTED-FAIL 0**. No
  golden row moved.
* `--fast`: **PASS 76 / FAIL 0 / KNOWN-BROKEN 0 / EXPECTED-FAIL 5** (the
  deliberate ones), plus its four conservation gates.
* Gates: `check_compile_clean`, `check_wasm_dialect`, `check_std_includes`,
  `check_layering`, `check_lesson_symbols`, `check_glossary_bans`,
  `check_doctrine`, `check_doc_references`, `check_ownership_index`,
  `check_debt_registry` and `gate_manifest --check` all pass.
  `check_theory_citations` FAILS with one finding: `\bibitem Deen1987` is
  cited nowhere. That is in `docs/theoryGuide.tex`, which this branch does
  not touch, so it is pre-existing on `origin/main` and not caused here.
* **Sabotages** (each reverted, rebuilt, gate run, then restored and
  rebuilt; `make all` after the last restore):
  * S1 (UNIQUAC `x <= 0 → γ = 1` restored) is caught by (a):
    "gamma(x=0) = 1 but gamma(x=1e-9) = 7.71144".
  * S2 (`outerExhausted = false`) is caught by (b): "the capped flash02
    exited 0".
  * S3 (`trivialSaturationK` always false) is caught by (c), (d) and both
    halves of (e).

  The restored tree passes the gate.

---

## 6. On the reference side (to offer upstream)

* DWSIM `ActivityCoefficientBase.vb:599`:
  `poy(i) = Math.Exp(vli * Abs(P - Psati) / (8314.47 * T))`. The Poynting
  factor is exp[Vᴸ(P − Psat)/RT]. With `Abs`, a liquid **below** its vapour
  pressure gets a factor > 1 instead of < 1 (the error is symmetric about
  Psat). DWSIM also omits φˢᵃᵗ in the same expression (W1). Both are worth
  an issue upstream. Nothing was filed from here.
* DWSIM NestedLoops `Flash_PT` declares an all-vapour answer when
  `T > Max(VTc, Vz)` (`NestedLoops.vb:276`, the "Estimate V" block). Read
  literally, this tests T against a composition-weighted maximum Tc. A
  mixture above that Tc can still be inside its envelope near the
  cricondentherm. Noted, not traced.

---

## 7. Proposals, in order of damage to a student

1. **W1** φᵢˢᵃᵗ (+ Poynting) in γ-φ with a non-ideal vapour. This is the
   largest error: 11 K on a pure propane saturation temperature at 15 bar,
   and it sits in the ammonia plant's separators. It moves 23 cases; the
   list goes to Vítor first.
2. **W2** bubble T and dew T on the incipient-phase home, with a
   data-derived bracket. Collapse the three homes (M3). This moves the
   envelopes, column14/15 and the column distillate T under an EoS.
3. **W3** phi-phi liquid enthalpy on the liquid root. This moves the
   phiPhi H rows; measure cavett01's open first-law pin before and after.
4. **M1** announce an unstable VL liquid (no number moves).
5. **M2** publish the equilibrium residual (append-only).
6. **W6** Soave's slope or Graboski & Daubert's (Vítor's model decision),
   and the guide wording.
7. **M4** the two Theory Guide passages.
