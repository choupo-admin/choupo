# Kernel numerical audit (2026-11-08)

Read-only audit of the kernel's numerical hygiene: eight readers (thermo core, EoS, activity, solvers, flash, distillation, reactors, flowsheet; about 37 000 lines), each finding cited by file:line, every HIGH finding re-opened and confirmed by a synthesis stage.  No case was run.  Prompted by the liquid-reference step at Tc (DEV.md 4c C239), found the slow way; register entry DEV.md 4c C245.


## 1. Verification of the HIGH findings

I opened every HIGH finding at its cited lines. **All 16 match the code, so none were dropped.** Two needed corrections, and three carry consequences that were argued but not measured. I did not open the MEDIUM and LOW findings; they appear below as the auditors reported them. No case was run during this audit.

| # | Finding (as cited) | Verdict | What the code shows |
|---|---|---|---|
| H1 | `ThermoPackage.cpp:1124-1162, 1200-1219`: stageK switches on convergence | CONFIRMED (code). The size of the dew-side gap is PLAUSIBLE, not measured | `catch (const electrolyte::ReactiveVLE::NonConvergence&)` re-runs with `/*subsaturatedProbe*/ true`, so K depends on whether Newton converged, not only on (T,x). Line 1215 `K[i] = (up > 0.0) ? infinity() : 0.0;` is there as cited. |
| H2 | `SRK.cpp:226-249`, `PR.cpp`, `PCSAFT.cpp`: root picked by branch, not by continuity | CONFIRMED. The PC-SAFT line is 384, not 347-357 | `if (Delta > 0.0) { ... return w + shift; }` ignores `liquid`. PCSAFT.cpp:384 `auto br = liquidRoot ? roots.back() : roots.front();`: with one bracket, both phase labels get the same root. |
| H3 | `NewtonND.cpp:164`: absolute FD step floor | CONFIRMED | `scalar h = h0 * std::max(std::abs(x[j]), 1.0);` |
| H4 | `NewtonND.cpp:544-545`: no per-variable step bound | CONFIRMED | Full step at alpha = 1. The line search catches only `InfeasibleTrial`, so any other exception escapes newtonND. |
| H5 | `NewtonND.cpp:549, 587-616`: no Armijo test, uphill steps taken | CONFIRMED | `if (normFNew < normF) break; alpha *= 0.5;`. When the search exhausts, a finite uphill trial is still taken (`x = std::move(xNew)`), up to `maxStalledSteps = 25` times. NewtonND.H:39 calls the search "Armijo". |
| H6 | `IsothermalFlash.cpp:1661-1662, 1761-1780`: phase verdict on every pass | CONFIRMED | `liquidVerdict` and `vapourVerdict` are recomputed each `outerIt`. The incipient-phase override runs only `if (outerIt == 0 ...)`. The break sets `converged = true; phaseTrivial = true`. |
| H7 | `IsothermalFlash.cpp:1458-1487`: VLLE demoted at beta < 1 % | CONFIRMED | `PHASE_EPS = 1.0e-2`. The dropped phase is not re-balanced, and `converged = bestConv` is copied from the Nelder-Mead minimiser. |
| H8 | `StreamEquilibrium.H:208-239`: supercritical split discarded inside T searches | CONFIRMED. A step occurs only where the package still predicts a split above TcMax | Called on every trial by AdiabaticFlash.cpp:164 and SpecifiedFlash.cpp:181. |
| H9 | `DistillationColumn.cpp:3277, 3696`: MESH runs with no bounds | CONFIRMED. Duplicate of H4 + H5 | `opts` sets only tolerance, maxIter, parallel (and blockTri). |
| H10 | `DistillationColumn.cpp:3622-3623`: Treflux solved inside the residual | CONFIRMED | `bubbleTWithItsVapour(thermo, yD, P, Ts[0], 1.0e-12)` has no `&ok`; line 688 passes it. SaturationCurves.cpp:104-114: `dT = 0.25`, bracket [200, 700], maxStep 15, maxIter 30. |
| H11 | `GibbsReactor.cpp:507`: 1e30 penalty inside a differenced residual | CONFIRMED | `if (!e.converged) { penalisedT.push_back(Tt); return 1.0e30; }` with a central difference at h = 0.5 and `bracket = false`. |
| H12 | `CSTR.cpp:852-853`: extents convergence flag ignored | CONFIRMED | `ok` is never read in `phi`; `ok2` and `okSat` are likewise unused. |
| H13 | `Flowsheet.cpp:3466-3470`: tear Newton uses the default FD step | CONFIRMED. Duplicate of H3. The noise-to-signal estimates are arithmetic, not measurements | `ndo` sets only tolerance, maxIter, onIter. P is packed in Pa (line 3394). |
| H14 | `Flowsheet.cpp:3404-3431`: residual clips its own input | CONFIRMED | `Fi[i] = std::max(raw, 0.0)` and `applyStreamBounds` run inside the residual. No `InfeasibleTrial` appears in Flowsheet.cpp. |
| H15 | `Flowsheet.cpp:3457-3466`: unit failures are not turned into infeasible trials | CONFIRMED | `sweep(true)` runs with no try/catch. Correction: the auditor's claim that Newton is the default recycle solver was not checked and is dropped. |
| H16 | `Flowsheet.cpp:1208-1238`: negative trial pressure replaced by the inlet pressure | CONFIRMED | In the quiet sweep it counts, then `if (s.P <= 0.0) s.P = P_inherit;`. |

## 2. Classes and shared root causes

Merging duplicates leaves five classes. Classes A and B together drive most of the reported stalls, and both are fixed in shared code.

- **A. The Newton kernel (NewtonND) has no globalisation contract.**
  - Its finite-difference step is absolute.
  - It has no bounds, no fraction-to-boundary and no step cap.
  - Its line search tests simple decrease and then accepts uphill steps.
  - It only understands `InfeasibleTrial`.
  - Every caller compensates locally, with clamps, hand-written seeds, `stageKOnTrial` wrappers and `maxStalledSteps`.
  - Reaches every MESH column (simultaneous and fullMESH), the tear Newton, multi-reaction CSTRs, GibbsMethod, ReactiveFlash, DesignSpec and PelletDiffusion.
- **B. Residuals that are not a pure function of the state.**
  - Mechanisms: inner solves whose convergence is not checked, branches chosen by solver success, constant penalties, clipped inputs, and silent substitutions.
  - Every FD Jacobian built over them is corrupted, and the same (T,x) can return two values.
- **C. Thermodynamic surfaces with steps or kinks inside the iterated domain.**
  - EoS root swap, Antoine pole, Ambrose-Walton and Wagner frozen above Tc, the IF97 window edge, water H at the vf endpoints.
  - Activity models on negative or unnormalised x, the electrolyte gamma_w branch, UNIFAC groupless leak.
  - Supercritical discard and VLLE demotion.
  - These are the same class as the liquidReferenceFactor step at Tc.
- **D. Convergence measured on the step or with absolute and mixed-unit tolerances.**
  - Flash successive substitution, Wegstein's norm, the Gibbs outer 0.01 W, the SQP feasibility test, newton1D, tmTol.
- **E. Silent fallbacks outside residuals.** These do not change convergence, but they hide a failure behind a plausible number.

## 3. Ranked findings

Rank = cases reached × severity of the failure. Severity means: a wrong answer published at exit 0 counts more than an abort, which counts more than a slow solve. A "test" is a new arm of a gate (a `check_*` script) or a case that proves the fix.

### Rank 1: NewtonND globalisation (class A; H4, H5, H9, H15; LU.cpp:67)

- **Where:** `src/solver/NewtonND.cpp:544-616`, `NewtonND.H:146-160`, `LU.cpp:67`, `Flowsheet.cpp:3460`. Duplicates: DistillationColumn.cpp:3277 and :3696.
- **Defect:**
  - Full step with no bounds.
  - Simple-decrease test.
  - An exhausted search still steps uphill.
  - Any exception other than `InfeasibleTrial` aborts the solve.
  - A NaN pivot passes `best < 1e-30`.
- **Consequence:**
  - From a poor seed, columns visit 140 K or thousands of K and stall at |F| ~ 1e-2 to 8. column08 needs a hand-written seed; column19 under SRK stops not converged.
  - The tear Newton aborts with exit 2 on a recoverable overshoot.
  - A non-finite Jacobian is reported as "no evaluable step".
- **Fix:** add `lower`, `upper` and `maxStep` (per variable) to `NDOptions`, then:
  - Fraction-to-boundary scale 0.99 on the whole step, including the eliminated fraction 1 − Σx.
  - Armijo test on ½‖F‖²; backtrack by quadratic/cubic interpolation within [0.1a, 0.5a].
  - When the search exhausts, take a Levenberg-Marquardt step on the same J instead of an uphill step.
  - Relative pivot test `!(best > 1e-14·max|A|)` and a finite check on each Jacobian column.
  - Callers declare their bounds: columns T ∈ [0.5 Tmin_sat, 1.2 Tmax_sat], fractions ≥ 0, V and L ≥ 0, flows ≥ 0. The flowsheet residual rethrows `std::exception` as `InfeasibleTrial` and counts it.
- **Test:**
  - New gate arm `check_newton_globalisation` with three synthetic problems:
    - a bounded variable whose full step crosses zero, inside a log residual (must converge, never evaluate x < lower);
    - a Powell badly scaled function (must converge with no uphill step);
    - a residual returning NaN at one probe (must stop with "non-finite Jacobian column j").
  - Cases: column08 started from the linear profile with no `stageProfile` seed must converge, and the stalled-step count of stripper02 and acetone06 must reach 0.

### Rank 2: FD step and central differences across a bound (class A + B; H3, H13, H14; dist :3194, :3654, :3042; CSTR.cpp:661)

- **Where:** `NewtonND.cpp:164`, :277, :305; `Flowsheet.cpp:3417, 3428-3430, 3468`; `DistillationColumn.cpp:3194, 3654, 3042-3049`; `CSTR.cpp:661`.
- **Defect:** h = 1e-7·max(|x|,1) in raw units. Residuals clamp their input (`max(raw,0)`, `log(max(γx, 1e-300))`), so the central difference straddles a kink or a plateau.
- **Consequence:**
  - Trace components get a halved or zero Jacobian column.
  - The reactive equilibrium row goes flat, giving singular J and |F| 9e21 on column05 (recorded in the code).
  - Tear P and small-flow columns are dominated by the units' inner-tolerance noise.
- **Fix:**
  - `NDOptions::typX`; h_j = h0·max(|x_j|, typX_j).
  - A forward difference when x_j − h_j < lower_j.
  - The tear Newton passes its existing `scale[]` as typX and an h_rel no smaller than √(inner tolerance).
  - Residual owners **throw `InfeasibleTrial`** on γx ≤ 0 or a negative flow instead of clamping; the clamp stays only on the final, announced unpack.
- **Test:** a gate arm on a 2×2 residual with x₁ = 1e-10 inside ln x₁: the FD Jacobian must match the analytic one to 1e-4 relative. Cases: column05 and column19 converge without the 1e-4 seed floor; process05 and greenAmmoniaPEQ_baseCase converge their tear Newton in no more iterations than today.

### Rank 3: Residuals that are not functions of the state (class B; H1, H10, H11, H12, H16 + medium/low)

Each row below is the same disease: a value that depends on solver history or failure, inside a function that Newton or a T-search differentiates.

| Sub | Where | Defect | Fix | Test |
|---|---|---|---|---|
| 3a | `GibbsReactor.cpp:507-515` | 1e30 penalty, differenced at h = 0.5 K | Throw `InfeasibleTrial`; safeguarded bracketed 1-D solve (Newton inside the bracket, bisect otherwise) | ammonia03_quench_converter and aceticAcid01_gibbsReactor with the seed T moved ±300 K must converge and record `penalisedT` = 0 Newton steps across a failure |
| 3b | `CSTR.cpp:852-853, 882-883, 905-906` | `ok` ignored; unconverged extents reach phi(T) | phi returns NaN or throws when `!ok`; the root scan splits such intervals; extentsAt warm-starts from the neighbouring grid point | cstr05_multiplicity: the three roots are unchanged and the count of failed scan points is announced (0 today); a gate arm forces a failure at one grid T and asserts no root is reported there |
| 3c | `DistillationColumn.cpp:3622-3623` | Treflux is an inner bubble point whose flag is dropped, inside the full-MESH residual | Make Treflux a MESH unknown with its own Σ K·yD − 1 row; at minimum pass `&ok` and throw `InfeasibleTrial` | column06, column07, column08 converge in no more iterations; a gate arm asserts no unconverged inner Treflux on any trial |
| 3d | `DistillationColumn.cpp:3093-3095, 517-523` | stageVapourK inner incipient loop: flag dropped, cold start, `max(x,0)` without renormalising | Pass `&ok` and throw on failure; warm-start from the last accepted vapour; share the activity projection of rank 7 | column08, column19, column20 are unchanged at convergence |
| 3e | `ThermoPackage.cpp:1124-1219` (H1) | K branch chosen by `NonConvergence`; +inf K for xApp == 0 | Choose the branch from the reactive bubble/dew test (Σp_eq/P, Σz/K); above the dew point use the dew-side incipient construction; replace inf with a finite cap or a fixed-K flag, announced | A gate arm on stripper01's stage composition sweeping T across the band asserts K(T) is continuous to 1e-6 relative at the band edges, and that the same (T,x) gives the same K regardless of call order |
| 3f | `Flowsheet.cpp:1208-1238` (H16) | Negative trial P replaced by P_inherit | Quiet branch throws `InfeasibleTrial`; Wegstein treats it as a rejected extrapolation | Gate arm: a two-unit recycle whose pipe drop exceeds the inlet P at the first Newton trial must converge or refuse by name, never with P = P_in |
| 3g | `AdiabaticFlash.cpp:189-211` | Inner flash `converged` never read; inner tolerance (1e-6 on the composition step) about the size of the outer 0.01 J/mol | Refuse the trial when the inner flash fails; report both flags; inner tolerance ≥ 1e3× tighter, or a relative outer tolerance | adiabaticFlash01 unchanged; an arm with maxOuterIter = 3 must report not converged |
| 3h | `ReactorOutlet.cpp:220-236` | T(H) inversion returns with no residual check after 40 steps or cp ≈ 0 | Require \|h − H(T1)\| ≤ 1e-9·max(1,\|h\|), else fall through to the Illinois branch | pfr04, pfr05 and greenAmmonia03 beds: the H residual of every RHS call ≤ 1e-9 (counter printed at verbosity 4) |
| 3i | `SaturatedVapour.cpp:137-147` | factor = 1 on an EoS failure mid-range (about a 40 % step), announced once | Retry at the hold T or use the cached last good value; else throw; at T ≤ 0 use the T → 0 limit | Gate arm: force a PC-SAFT throw at one T and assert K is continuous to the neighbouring T |

### Rank 4: EoS root continuity and accuracy (class C; H2 + medium)

- **Where:** `SRK.cpp:191-250`, `PR.cpp:217-267`, PR.H (no `hasLiquidRoot`), `PCSAFT.cpp:102-114, 290-295, 352-384, 430-450, 542-594`, `SRK.cpp:127-173`.
- **Defect:**
  - Past a spinodal, the phase labelled vapour gets the liquid root (and vice versa) with no flag.
  - PR inherits `hasLiquidRoot() == false`, so genuine PR azeotropes are refused as trivial roots.
  - Cardano roots are never polished.
  - PC-SAFT uses absolute bisection on eta under three layers of finite differences.
  - PC-SAFT silently drops a kij for an unknown component name (an answer-changing defect).
  - The verification gate skips its own tests when no liquid root exists at 298 K and 1 bar.
  - The signed square root in the SRK/PR mixing rule gives 0/0 at the alpha minimum.
- **Fix:**
  - One generic cubic base parameterised by (ε, σ) with one root picker.
  - A pseudo-root (spinodal extrapolation) plus a `rootIsPseudo` flag the flash announces.
  - 1-2 Newton polish steps on f(Z).
  - Signed √a in the mixing rule.
  - PC-SAFT: Newton polish in ln ρ, a relative tolerance, throw on an unknown kij name, and run the verification on the vapour root when no liquid root exists.
- **Test:**
  - A gate arm sweeping P across the vapour spinodal of propane at 0.98 Tc: Z_vap is continuous and `rootIsPseudo` flips at the spinodal.
  - A PR binary azeotrope accepted where SRK accepts it.
  - A misspelt kij name in pcsaft02 is refused.
  - Cases: envelope01 and envelope02 reach further along the branch; flash09 and flash10 unchanged.

### Rank 5: Flash phase verdict and convergence (class C + D; H6 + medium)

- **Where:** `IsothermalFlash.cpp:1577-1780` (H6), 1698-1736 (incipient flag), 1834-1852 (Wegstein positivity, step-based stop), `IncipientPhase.H:103-169`.
- **Defect:**
  - The single-phase verdict is taken from a non-equilibrium iterate on any pass and is published as converged.
  - `r.converged` of the incipient phase is never read.
  - Wegstein q ∈ [−5, 0] can make x negative.
  - The loop stops on a 1e-6 step, not on the fugacity residual.
- **Consequence:** H and V/F jump inside adiabatic, PH and PVF searches and column restage flashes. Near-critical answers are wrong in the third digit, published as converged.
- **Fix:**
  - Take the verdict only at outerIt == 0.
  - Then a negative-flash Rachford-Rice; declare single phase only when the converged V leaves [0,1] and a TPD confirms it.
  - Incipient result returns unstable / stable / undecided, with a retry from the second seed.
  - Wegstein falls back per component to substitution when x ≤ 0 (or is applied on ln K).
  - Stop on max|Δln f| < 1e-10; switch to Newton on ln K after about 10 successive-substitution passes or when λ > 0.9.
- **Test:** a gate arm drives a two-phase feed whose 3rd successive-substitution iterate has Σ zK < 1 (constructible on a near-critical CH4/propane phi-phi feed) and asserts the result is two-phase. Cases: adiabaticFlash01, column12, column13, column14 unchanged; flash09 converged on the residual test.

### Rank 6: Supercritical split discarded inside residuals (class C; H8)

- **Where:** `StreamEquilibrium.H:208-239`, applied at AdiabaticFlash.cpp:164 and SpecifiedFlash.cpp:181.
- **Fix:** keep the discard only as an announced diagnostic on the final answer. Inside a T-search, bracket TcMax explicitly and refuse by name instead of bisecting into the jump. The physics fix (K → 1 at the liquid-reference critical point) belongs to rank 8.
- **Test:** a gate arm runs an NH3/H2/N2 adiabatic flash whose root lies 2 K above TcMax: either it converges smoothly or it refuses naming the jump, and it never publishes T = TcMax with converged = true.

### Rank 7: VLLE demotion and unpolished three-phase point (class C + D; H7 + medium)

- **Where:** `IsothermalFlash.cpp:1458-1487`, :1279-1295, :1500, :827-831, :967.
- **Defect:** phase count steps at beta = 0.01; mass is not conserved on demotion; the three-phase answer is the raw Nelder-Mead point (accurate to about 1e-5); vlle03 beta_V moves 1.7 % between two solves of the same state.
- **Fix:** re-solve the reduced problem by equal-fugacity Newton and accept it only if the TPD of the removed phase is ≥ 0. Recompute the last phase from the component balance. Extend `polishEqualActivity` with the vapour row and declare converged only on its residual.
- **Test:** a gate arm checks the component balance of every VLLE answer to 1e-12; vlle03 run twice gives beta_V identical to 1e-9; vlle03, vlle04 and vlle05 unchanged otherwise.

### Rank 8: Vapour-pressure and pure-water surface continuity (class C; medium/low)

| Where | Defect | Fix | Test |
|---|---|---|---|
| `Antoine.cpp:62` | Pole at T = −C: Psat → inf, and dPsat/dT has the wrong sign below it | Return 0 at T + C ≤ 0, or better, continue ln P linear in 1/T below Tmin | Gate arm: benzene Psat monotone and finite on [10 K, Tc] |
| `AmbroseWalton.cpp:57`, `Wagner.cpp:97` | Psat = Pc above Tc: C0 but not C1, and different from Antoine above Tc | Continue ln Psat in the base class `VaporPressureModel::Psat_Pa` with the slope at Tc⁻ (same rule for all models) | d ln Psat/dT continuous at Tc to 1e-6, all three models |
| `SaturationCurve.cpp:85-87` | IF97 window edge: +17.6 % step at 647.096 K | Scale the record correlation by the IF97/record ratio at the window edge | Water Psat continuous at 273.15 K and 647.096 K to 1e-9 relative |
| `ThermoPackage.cpp:1261...2172` | Direct `m.p_sat(T)` calls throw above 647 K | Vapour and transport at (T,P); route every Psat need through `saturationPressure` | rankine02: a 773 K steam stream priced for H, μ and k |
| `ThermoPackage.cpp:1806-1811, 1929, 1963` | Water H at the vf endpoints evaluated at (T,P) vs psat(T): a full latent-heat step | Use the same P on all three branches, with the IF97 region forced per leg | H(vf) linear and continuous on [0,1] at P ≠ psat(T) |
| `SaturatedVapour.cpp:143` + `SRK.cpp:228` | phi_sat may come from the liquid branch near 0.99 Tc | Use the rank 4 vapour-root request; or lower the hold to the last T at which a vapour root exists | propane phi_sat continuous on [0.95, 0.99] Tc |
| `ThermoPackage.cpp:1359-1374` | Pure-fluid route: wall at z = 0.999 inside residuals | Price IF97 water plus the remainder by generic legs, announced; refuse only at the converged state | sprayDryer01 with a 1e-3 air trace solves |

### Rank 9: Activity models on trial compositions (class C; medium/low)

| Where | Defect | Fix | Test |
|---|---|---|---|
| `Wilson.cpp:264`, `UNIFAC.cpp:291-293`, `NRTL.cpp:404,410`; DistillationColumn.cpp:516-521 | No policy for negative or unnormalised x: NaN, branch switches, dropped terms; the two stageK branches price one trial differently | Non-virtual `ActivityModel::gamma` wrapper projecting x⁺ = max(x,0)/Σ, announced once; delete the per-model guards | Gate arm: each model, x = (0.6, 0.41, −0.01) gives the same γ as the projected x, finite |
| `ElectrolyteActivity.cpp:74-78` | γ_w jumps by 1/x_w when x_s crosses 0 with an antisolvent present | x_wb = x_w/(x_w + x_s), no `xs > 0` gate (byte-identical for binaries) | γ_w continuous at x_s = 0 for crystalliser11's liquid |
| `UNIFAC.cpp:168, 305, 322` | A groupless H2 leaks into the other components' combinatorial; −993 at x_H2 = 0.999 | Combinatorial on the grouped sub-mixture, l = 0 for groupless | acetonePlant and acetone05: γ of acetone independent of x_H2 |
| `CosmoSac.cpp:117-132` | 500-iteration cap reached silently; absolute test on G | Relative test on ln G at 1e-12; throw or announce at the cap | cosmoSAC01 unchanged; d ln γ/dT smooth by finite differences |
| `ElectrolyteActivity.H:198-211` | Piecewise-linear average Cp: dH/dT steps at the nodes | PCHIP, or an analytic Cp(T) integral | dH/dT continuous at 333/373/423/473 K |

### Rank 10: Tear accelerators: projection and scaling (class D; medium/low)

| Where | Defect | Fix | Test |
|---|---|---|---|
| `Flowsheet.cpp:3343-3349`, 1806-1838 | Wegstein keeps the unprojected x while the sweep saw the projected one | `x = packTears(...)` after unpack, or accelerate on F_i | aceticAcid02, acetonePlant, cavett01: iterations ≤ today |
| `Flowsheet.cpp:3332/3342`, 1784-1790 | Absolute L2 norm over mixed units [F, z, T, P] | Use the Newton branch's scaled residual, printed in both tables | A 1e-3 kmol/s tear converges to the stated relative tolerance |
| `Flowsheet.cpp:3437-3455` | Scales frozen from the seed, floor 1e-12; traces scaled by the total flow | Refuse a near-empty seed or rescale after the first sweep; per-component scale max(F_i, 1e-6 F) | greenAmmoniaPEQ: Ar/CH4 loop inventory converged to 1e-8 relative to itself |
| `DominantEigenvalue.cpp:96` | Unscaled norms: the T mode dominates | Pass the tear scales | Same cases |

### Rank 11: Column outer methods (class A + D; medium/low)

| Where | Defect | Fix | Test |
|---|---|---|---|
| `DistillationColumn.cpp:1456, 1749-1752` | Wang-Henke is plain successive substitution (2000 passes for Klemola); bubbleT flag dropped | Theta-method plus bounded Wegstein on T; pass `&ok` and refuse "converged" while any stage failed | column14 and column15 converge in under 200 passes |
| `:1655-1657` | Murphree effective K clipped and switched at 1e-12 | Murphree on vapour flows in the tridiagonal | column14 (E_MV 1.191) has no clipped stage; column11 unchanged |
| `SaturationCurves.cpp:104-114` | Bracket fixed at [200, 700] K; ΔT = 0.25 K absolute | Bracket from the components' Tsat(P); relative step | An air-separation smoke case at 90 K reaches its bubble point |
| `:3397-3412`, :3780-3791 | Homotopy publishes the failed iterate | Publish uDone or wDone at s reached | Forced failure publishes the s < 1 solution |
| `:3332-3333` | Fixed catalyst-continuation schedule on the CMO path | Share the fullMESH adaptive helper | A simultaneous kinetic column smoke case |
| `ShortcutColumn.cpp:233-235` | Underwood R_min < 0 silently set to 0 | Refuse naming θ and the distributed components | Arm with a bad key choice is refused by name |

### Rank 12: Phase stability (class C; medium)

- **Where:** `StabilityTest.H:98` (`tmTol = -1e-3`) used at `StabilityTest.cpp:422`; :312 vs :367-369.
- **Defect:** the binodal is displaced into the two-phase region, so a split appears with a finite composition jump. γ_y ≤ 0 is silently treated as ideal, while the reference point uses a different floor.
- **Fix:** decide on tm < −1e-10 together with an explicit trivial-solution test, max|y − z| > 1e-4. A failed probe ends with ok = false and is counted in `StabilityResult::failedProbes`.
- **Test:** an LL binary swept across its binodal: β grows continuously from 0. vlle04 unchanged.

### Rank 13: Time integration (class D; medium/low)

| Where | Defect | Fix | Test |
|---|---|---|---|
| `AdaptiveTimeStep.H:299` | Carries `hLast` instead of `hNext` across write boundaries | Use the same line as FixedBedAdsorber.cpp:1572 | ctrl03, batch06, diafilter03: accepted plus rejected step counts drop, results unchanged |
| `AdaptiveTimeStep.H:231` | One scalar atol for every row of the packed state | Per-row scale on OdeUnit | Rows with energy or temperature declare their scale |
| `PFR.cpp:1020-1046`, 326-352 | Fixed-step RK4 with no error estimate | Embedded RK4(5) or step doubling | pfr05 and the greenAmmonia03 beds agree with 2·nSteps to a stated tolerance |
| `PFR.cpp:1038` | Fraction-to-boundary scales P and coolant increments too | Scale only species and H, or shorten the step | Ergun bed run to exhaustion: outlet P exact |

### Rank 14: Tolerance hygiene (class D; low)

| Where | Fix |
|---|---|
| `GibbsReactor.cpp:513` (absolute 0.01 W) | Relative tolerance on the duty scale |
| `CSTR.cpp:355-356` | Bounds [−ξ_back, ξ_max]; solve in ln F_lim |
| `CSTR.cpp:699` | Relative tolerance about 1e-10 |
| `EquilibriumReactor.cpp:471, 700-712` | Relative pivot test; warm-started fugacity loop |
| `SpecifiedFlash.cpp:69-95` | Relative PH/PS tolerance; inner tolerance derived from it |
| `AdiabaticFlash.cpp:235` | Bracket expanded from the feed instead of [200, 700] K |
| `PureSaturationPlateau.H:92-101` | Trace threshold 1e-10 for route selection |
| `NewtonRaphson.cpp:65, 91-95` | xTol, a sign-change check, a reason string |
| `SQP.cpp:656` | Use the declared tolFeasEq |
| `SQP.cpp:518-521` | True watchdog with save and restore |

Each fix gets one gate arm asserting the declared tolerance is the one applied.

### Rank 15: Silent fallbacks outside residuals (class E; low)

| Where | Fix |
|---|---|
| `ThermoPackage.cpp:1990-2002` | Skip by phase fact; let other exceptions propagate |
| `Flowsheet.cpp:1924, 1962` | NaN and an AdvisoryLog line |
| `ModelBoundaryAudit.H:186-201` | Emit "not evaluable: reason" |
| `ConversionReactor.cpp:139, 285`, `CSTR.cpp:1129`, `PFR.cpp:494, 1461` | Catch only the missing-datum exception type |
| `SpecifiedFlash.cpp:240, 273` | Carry the exception text into the refusal |

Test: one gate arm per site injecting a non-datum exception and asserting it is announced.

## 4. Slice order (each slice is one builder's afternoon)

Shared root causes go first: slices 1-3 make most of the later column, flash and reactor symptoms disappear or become refusals the solver can handle.

| Slice | Content | Why here | Validation (written reason) |
|---|---|---|---|
| 1 | NewtonND contract: `typX`, `lower`, `upper`, `maxStep`; fraction-to-boundary; forward difference at a bound; Armijo; Levenberg-Marquardt on exhaustion (retires `maxStalledSteps`); relative pivot and finite checks. Defaults keep current behaviour until a caller declares bounds | Root of ranks 1-2; every Newton caller benefits | Gate arm `check_newton_globalisation`. **Full sweep:** the solver is a path that every MESH, tear-Newton and CSTR case goes through, so targeted cases cannot cover it |
| 2 | Callers declare bounds and stop clamping: column MESH (T box, x ≥ 0, Σ ≤ 1, V and L ≥ 0, `InfeasibleTrial` on γx ≤ 0); tear Newton (scale as typX, `InfeasibleTrial` on negative flow or P, sweep exceptions rethrown); CSTR multi-reaction | Turns slice 1 on; removes the clamps of rank 2 and H14-H16 | column05/06/07/08/19/20, stripper01/02, acetone06/07, process05, hda, greenAmmoniaPEQ, cstr03-07. Then re-record the moved golden rows with a reason per row |
| 3 | Residual purity in units (rank 3a-3d, 3g, 3h): Gibbs safeguarded 1-D solve, CSTR `ok`, Treflux as an unknown, stageVapourK `&ok`, AdiabaticFlash flags, ReactorOutlet residual check | Same root cause as slice 2, inside the units | Cases listed in rank 3 and the reactor family through `--fast` |
| 4 | EoS: generic cubic base (SRK/PR merged, PR `hasLiquidRoot`, Newton polish, signed √a, pseudo-root flag); PC-SAFT polish, relative tolerance, kij refusal, verification fix | Largest surface discontinuity (rank 4); shared thermo path | **Full sweep:** every phiPhi and SRK/PR vapour case goes through it |
| 5 | Vapour-pressure continuity in the `VaporPressureModel` base, the IF97 window blend, `saturationPressure` as the only route, water H endpoints, SaturatedVapour retry/cache, stageK branch by state (3e) | Rank 8 and 3e/3i; removes the Tc-class steps at their source | **Full sweep:** Psat is on every gamma-phi K |
| 6 | Flash: verdict only at outerIt 0 with a negative flash, residual-based convergence plus a Newton switch, incipient-phase verdict, Wegstein positivity, supercritical discard out of residuals | Ranks 5-6; depends on slices 4-5 for a continuous K | Flash family, column restage cases, ammonia02, flashSpec01 |
| 7 | VLLE: reduced re-solve with a TPD check, balance-consistent output, three-phase polish; stability tmTol and probe flags | Ranks 7 and 12 | vlle03/04/05, LL cases, the decanter family |
| 8 | Activity projection wrapper, electrolyte γ_w, UNIFAC groupless sub-mixture, COSMO-SAC test, Criss-Cobble PCHIP | Rank 9 | UNIFAC, UNIQUAC, NRTL column cases, crystalliser09-11, cosmoSAC01, acetonePlant |
| 9 | Tear accelerator scaling and projection; DominantEigenvalue scales | Rank 10 | Wegstein plants: aceticAcid02, acetonePlant, polycaprolactonePlant, cavett01, rankine02, evaporator05 |
| 10 | Wang-Henke theta method plus acceleration, Murphree on flows, bubbleT bracket, homotopy publish, CMO continuation, Underwood refusal | Rank 11 | column01-15, shortcut cases |
| 11 | ODE `hNext` and atol per row, adaptive PFR, PFR fraction commit | Rank 13 | ctrl, batch and pfr adaptive cases |
| 12 | Tolerance hygiene and silent fallbacks (ranks 14-15) | Lowest reach; mostly announcements | Gates that read the touched files plus each named case |

Slices 1, 4 and 5 each change a path that every case goes through, so each needs one full sweep, run after its targeted checks pass, with the moved golden rows re-recorded and justified row by row in the commit. Slices 2, 3 and 6-12 are validated by the cases they reach plus `--fast` when a factory or shared helper is touched.