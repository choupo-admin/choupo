# Choupo-IP -- a glass-box primal-dual interior-point optimizer

*2026-11-25.  DESIGN record, no engine code.  The architect's decision of the
same day: Choupo gets its own primal-dual interior-point nonlinear optimizer,
built in stages A (dense core) to E (global phase equilibrium).  This record
fixes what is built, from which sources, in which files, how each stage is
proven, and in which slices.  Every source below is marked READ (with what was
read) or NOT READ; nothing unread is presented as read.  Equation numbers are
those of the version that was read, named in section 1.*

## 0. What this record corrects in its own brief

Measured before writing (CLAUDE.md section 10, "a brief is a set of claims"):

1. **Uno has EIGHT ingredients in FOUR layers**, not four parts (L4 sec. 3):
   constraint relaxation and inequality handling (reformulation), Hessian
   model and inertia correction (subproblem), subproblem solver, globalization
   strategy and mechanism.  L4 sec. 5.2: Uno 2.2.0 PROHIBITS interior point +
   trust region, so the IP here is line search only.
2. **The Gibbs reactor's selector is `model`** (`GibbsReactor.cpp:221-223`,
   registry `GibbsMethod.cpp:377-386`), not `gibbsMethod`.
3. **There is no `decanter01` case**: the decanter witness is
   `vlle04_two_liquids_decanter`, the LL witness `vlle01_waterButanol`.
4. **HS106 is out** of the HS list: the C496 bench found its stored solution
   does not reproduce its stored value
   (`docs/audits/2026-11-24-optimizer-bench-results.md`, sec. 3).
5. **The 2026-11-24 ruling "one optimiser that evolves"** (the SQP for
   `outerDict`) stands: no slice registers an `OptimizationDriver` method.
   The IP serves INNER problems with structure and analytic derivatives.
6. **A barrier cannot resolve trace species by itself** (2.9): stage B keeps
   the element-potential Newton as the polish.

## 1. The literature, verified

| # | Source | Status | What was read | Used for |
|---|---|---|---|---|
| L1 | Wächter & Biegler, "On the implementation of an interior-point filter line-search algorithm for large-scale nonlinear programming", Math. Prog. 106 (2006) 25-57 | READ as the preprint (optimization-online 2004/03/836, dated 12 March 2004, revised 19 March 2004; the IBM report RC23149 carries the same title and date; the IBM server refused the download).  Sections 1-3 and 4.1 in full; Algorithm A, Algorithm IC, the KKT-error-reduction algorithm; page 10 checked as an image for the IC constants | the whole of stage A.  Equation numbers below are the PREPRINT's; the journal's are not verified |
| L2 | Nocedal, Wächter & Waltz, "Adaptive barrier update strategies for nonlinear interior methods", SIAM J. Optim. 19(4) (2009) 1674-1693 | READ as the preprint "Adaptive Barrier Strategies for Nonlinear Interior Methods" (optimization-online 2005/03/1089, 25 Feb 2005): secs. 2-5 and the search procedures of sec. 6.  The journal version NOT read | adaptive mu (Mehrotra probing (3.2)-(3.5), quality function (4.2), globalization framework of sec. 5) |
| L3 | Fletcher & Leyffer, "Nonlinear programming without a penalty function", Math. Prog. 91 (2002) 239-269 | NOT READ (citation verified on the publisher's record; the filter used here is the LINE-SEARCH filter of L1 sec. 2.3) | origin of the filter, cited through L1 |
| L4 | Vanaret & Leyffer, "Implementing a unified solver for nonlinearly constrained optimization", arXiv 2406.13454v2 (9 Nov 2025), submitted to Math. Prog. Comp. | READ: abstract, sec. 3 (the eight ingredients, Algorithm 1), sec. 5.1-5.2 (architecture, presets, the IP + trust-region prohibition), sec. 6.2 (the line-search filter IP as a combination, system (IP SP_mu), rule (10)) | the code shape (section 3) |
| L5 | Chiang & Zavala, "An inertia-free filter line-search algorithm for large-scale nonlinear programming", Comput. Optim. Appl. 64(2) (2016) 327-354 | READ as the optimization-online preprint (2014/09/4550): abstract, sec. 4 (assumptions RG, curvature test (16), Lemma 1 with Sylvester's law (20), procedure IFR-1..4, remarks), sec. 4.1 (full-step test (28)) | the inertia-free alternative (stage D2, where a factorisation that gives the inertia does not exist) |
| L6 | Bunch & Kaufman, "Some stable methods for calculating inertia and solving symmetric linear systems", Math. Comp. 31 (1977) 163-179 | NOT READ (the publisher's server refused; citation verified) | the LDL^T pivoting, taken through L7 |
| L7 | Higham, "Stability of the diagonal pivoting method with partial pivoting", SIAM J. Matrix Anal. Appl. 18(1) (1997) 52-65 | READ (MIMS EPrint 2006.165): sec. 1, Algorithm 1 (the Bunch-Kaufman partial pivoting strategy, alpha = (1+sqrt 17)/8), the remark on alpha | the dense LDL^T of slice A1, written from Algorithm 1 as Higham states it |
| L8 | Michelsen, "The isothermal flash problem. Part I. Stability", Fluid Phase Equilib. 9 (1982) 1-19 | NOT READ.  Choupo's implementation of it (`StabilityTest.H:31-70`) READ | stage C phase addition |
| L9 | Pereira, Jackson, Galindo & Adjiman, "The HELD algorithm for multicomponent, multiphase equilibrium calculations with generic equations of state", Comput. Chem. Eng. 36 (2012) 99-118 | NOT READ (final reference verified on two bibliographic records; the open copy refused) | stage E only |
| L10 | Ben Gharbia, Haddou, Tran & Vu, "An analysis of the unified formulation for the equilibrium problem of compositional multiphase mixtures", ESAIM: M2AN 55 (2021) 2981-3016 (CC BY) | READ: abstract, sec. 1.1-1.2, sec. 2.1 | the cubic-EoS caveat of stage C (section 5) |
| L11 | Schittkowski, "306 Test Problems for Nonlinear Programming with Optimal Solutions", Univ. Bayreuth 2008, with its Fortran `PROB.FOR` | READ: the user's guide front matter, and in `PROB.FOR` the definitions, starts and stated optima `FEX` of the problems listed in section 4.1 | stage A test set.  Hock & Schittkowski, LNEMS 187 (Springer 1981), the original book: NOT READ |
| L12 | Vanroye, Sathya, De Schutter & Decré, "FATROP: a fast constrained optimal control problem solver for robot trajectory optimization and control", arXiv 2303.16746v3 (2023) | READ: abstract, sec. on the reduced primal-dual system (7), its stage-ordered block structure (9a-f), the generalised Riccati recursion, the remarks on Hessian regularisation | stage D1 |
| L13 | Gondzio, "Matrix-free interior point method", Comput. Optim. Appl. 51 (2012) 457-480 | READ (an open copy of the published version): abstract, sec. 1, sec. 4 (normal equations (31)-(32), Lemma 4.1-4.2, bounds (37) and (42)), the opening of sec. 5 (partial Cholesky preconditioner (45)).  Its scope is LINEAR and convex QUADRATIC programming | stage D2 |
| L14 | Pacaud, Shin, Montoison, Schanen & Anitescu, "Condensed interior-point methods for scalable nonlinear programming on GPUs", arXiv 2405.14236v3 (21 Jul 2026) | READ: abstract, secs. 3-3.3 (Remark 1, HyKKT (11)-(12), Remark 2 and (13), LiftedKKT (14)-(15)) and the section titles of sec. 4 | stage D2 |
| L15 | Curtis, Schenk & Wächter, "An interior-point algorithm for large-scale nonlinear optimization with inexact step computations", SIAM J. Sci. Comput. 32(6) (2010) 3447-3475 | NOT READ (citation verified on repository records; no open copy reached) | named in D2 as the route to read before an inexact solve is designed |
| L16 | Choupo's own optimizer bench, `docs/audits/2026-11-24-optimizer-bench-{protocol,results}.md` | READ | the acceptance protocol of section 4.4 |

Two printed details of L1 are flagged for the slice that codes them: the
filter update (22) prints `f(x_k)` where the barrier function `phi_mu(x_k)` is
meant (the sentence around it and (18b) use `phi`), and the merit acceptance
(40) prints `ared < eta pred` where the surrounding text and the descent
argument need `ared >= eta pred`.  Both are read against the journal version
before coding, or coded as the text means and said so in the source.

## 2. The algorithm of stage A, for a student

### 2.1 The problem and its barrier

Choupo-IP solves min f(x) s.t. c(x) = 0 (m rows), xL <= x <= xU, with f, c
twice differentiable; an inequality g(x) <= 0 becomes g(x) - s = 0, s <= 0
(as L1 sec. 4 does).  It solves a sequence of barrier problems (L1 (3), (34)):

    min phi_mu(x) = f(x) - mu sum_i ln(x_i - xL_i) - mu sum_i ln(xU_i - x_i)
    s.t. c(x) = 0

for mu decreasing to zero.  A one-sided bound adds kappa_d mu (x_i - xL_i)
(L1 sec. 3.7) so the variable cannot run to infinity; xL = xU fixes and
removes it (L1 sec. 3.4).

### 2.2 The primal-dual equations and the step

With multipliers lambda (equalities) and z (bounds), the barrier problem's
optimality conditions are (L1 (4), written for x >= 0):

    grad f(x) + A(x) lambda - z = 0,   c(x) = 0,   X Z e - mu e = 0

A = grad c (n x m).  Their Newton step is obtained from the SYMMETRIC system
(L1 (13)), the bound rows eliminated:

    [ W + Sigma + dw I     A    ] [ dx ]     [ grad phi_mu(x) + A lambda ]
    [       A^T          -dc I  ] [ dl ] = - [           c(x)            ]

    Sigma = X^-1 Z,     dz = mu X^-1 e - z - Sigma dx          (L1 (11), (12))

W is the Hessian of the Lagrangian f + c^T lambda.  sigma_i = z_i/x_i is
large for an amount pressed on its bound, and damps the step in it exactly as
much as the bound requires.

### 2.3 Inertia correction (L1 sec. 3.1, Algorithm IC)

The step is a descent direction for the line search only if the matrix has
inertia (n, m, 0) -- n positive, m negative, no zero eigenvalues -- which the
LDL^T of 2.10 returns.  Algorithm IC:

    IC-1 factor with dw = dc = 0; inertia (n,m,0) -> use the step
    IC-2 zero eigenvalues -> dc = dc_bar * mu^kappa_c, else dc = 0
    IC-3 dw = dw0_bar if dw_last = 0, else max(dw_min, kappa_w_minus * dw_last)
    IC-4 factor; inertia right -> dw_last = dw, use the step
    IC-5 dw *= (dw_last = 0 ? kappa_w_plus_bar : kappa_w_plus)
    IC-6 dw > dw_max -> abandon the step, go to restoration; else IC-4

Constants (L1 p. 10, read on the page image): dw_min = 1e-20, dw0_bar = 1e-4,
dw_max = 1e40, dc_bar = 1e-8, kappa_w_plus_bar = 100, kappa_w_plus = 8,
kappa_w_minus = 1/3, kappa_c = 1/4.  The deviation of L1 (if the matrix is
singular in the first three iterations, keep dc > 0 from then on) is
implemented and announced when it triggers.

### 2.4 Fraction to the boundary and the dual step (L1 (8), (15), (16))

    tau = max(tau_min, 1 - mu)
    alpha_max = max{a in (0,1] : x + a dx >= (1 - tau) x}
    alpha_z   = max{a in (0,1] : z + a dz >= (1 - tau) z}

x and z never touch their bounds.  After each step every z_i is clipped into
[mu / (kappa_Sigma x_i), kappa_Sigma mu / x_i], kappa_Sigma = 1e10 (L1 (16)),
so Sigma cannot drift from the primal barrier Hessian mu X^-2.

### 2.5 The filter line search (L1 sec. 2.3, Algorithm A step A-5)

theta(x) = ||c(x)||_1 measures infeasibility; phi_mu the barrier objective.
Trial points x + alpha dx, alpha = 2^-l alpha_max, are tested:

* REJECTED if (theta, phi) lies in the filter F (the forbidden region).
* **Switching condition** (L1 (19)): grad phi^T dx < 0 and
  alpha (-grad phi^T dx)^s_phi > delta theta^s_theta.  When it holds and
  theta <= theta_min, the trial must pass **Armijo** on phi (L1 (20)):
  phi(x+) <= phi(x) + eta_phi alpha grad phi^T dx.  Such a step is a
  "phi-type" step and does not enlarge the filter.
* Otherwise the trial must improve one of the two measures enough
  (L1 (18)): theta(x+) <= (1 - gamma_theta) theta(x) OR
  phi(x+) <= phi(x) - gamma_phi theta(x); the filter is then augmented with
  the corner (1 - gamma_theta) theta(x), phi(x) - gamma_phi theta(x)
  (L1 (22)).
* F starts as {theta >= theta_max} (L1 (21)) and is reset at each new mu.
* If alpha falls below alpha_min (L1 (23)), the restoration phase starts.
* A trial whose evaluation fails (NaN, Inf, a thermo routine that refuses)
  is rejected and the step is halved (L1, after Algorithm A).

### 2.6 Second-order correction (L1 sec. 2.4)

If the FIRST trial is rejected and it raised theta, the constraint residual is
corrected with the SAME factorisation: c_soc = alpha c(x) + c(x + alpha dx)
(L1 (27)), the system re-solved with c_soc as the second block, the fraction to
the boundary applied again (L1 (28)), up to p_max = 4 corrections while
theta falls by at least kappa_soc.  This is the cure of the Maratos effect that
the current SQP handles only by a watchdog (`SQP.cpp:498-500`).

### 2.7 Restoration (L1 sec. 3.3)

First the cheap route (L1 sec. 3.3.2, Algorithm "KKT error reduction"): keep
taking the regular steps while the 1-norm of the primal-dual equations falls
by kappa_F = 0.999 per step and stop as soon as a point is acceptable to the
filter.  If that fails, the robust route (L1 sec. 3.3.1): the same IP applied
to

    min rho sum(p + n) + (zeta/2) ||D_R (x - x_R)||^2
    s.t. c(x) - p + n = 0,   x, p, n >= 0

rho = 1000, zeta = sqrt(mu), D_R = diag(min(1, 1/|x_R,i|)), the start of
(p, n) in closed form (L1 (33)); it ends when the point is acceptable and
theta <= kappa_resto theta(x_R), kappa_resto = 0.9.  If the restoration
problem itself converges to a non-zero minimum of theta, the run stops with
**"locally infeasible"**, the infeasibility named row by row.  Restoration
called at theta < tol stops with that reason (L1 p. 13).

### 2.8 The barrier update

**Monotone** (default; L1 (7)): when E_mu <= kappa_eps mu,

    mu <- max(tol/10, min(kappa_mu mu, mu^theta_mu)),   kappa_mu = 0.2, theta_mu = 1.5

**Adaptive** (`barrierUpdate adaptive;`, L2): mu = sigma x^T z / n each
iteration, sigma from Mehrotra probing (L2 (3.2)-(3.5): an affine step with
mu = 0, then sigma = (mu_aff / (x^T z/n))^3), inside the globalization
framework of L2 sec. 5: "free mode" while the KKT error
Phi = ||dual inf||^2 + ||c||^2 + ||ZXe||^2 (L2 (5.1)) falls by kappa over at
most l_max iterations, otherwise the monotone mode until it does.  The filter
is reset at every free iteration (L2 sec. 5, last paragraph).  The quality
function (L2 (4.2)) is a later option, not part of the first adaptive slice.

### 2.9 What the barrier does to a TRACE amount -- why stage B keeps a polish

At a barrier solution x_i z_i = mu, so a variable PRESENT at the optimum (true
z_i = 0) keeps z_i = mu / x_i: in a Gibbs problem an error of mu / n_i in that
species' mu_i/RT.  With the final mu = tol/10 = 1e-9 of the scaled amounts, a
species below about 1e-7 of the feed is off by more than one per cent -- where
the radicals of `gibbs06_h2_flame_radicals` and the NO of `gibbs06_thermal_nox`
live.  The element-potential form n_i = exp(ln N - ln P - g_i/RT + sum pi_k
A_ki) has no such floor.  So stage B takes from the IP the phase set, the
present solids and the multipliers, from any start and with no bisection, then
recomputes every amount from pi = -lambda and finishes with the existing Newton
(`gibbsGasSolve`, `GibbsMethod.H:225`), printing the largest change it made.
A flash polishes the same way, as its VLLE path already does
(`sec:vlle-polish`, theoryGuide.tex:22007).

### 2.10 The dense LDL^T with inertia (slice A1)

P K P^T = L D L^T, L unit lower triangular, D block diagonal with 1x1 and 2x2
blocks, pivots by the Bunch-Kaufman partial pivoting strategy as stated by
Higham (L7, Algorithm 1): alpha = (1 + sqrt 17)/8; lambda = the largest
off-diagonal of the column; a 1x1 pivot if |a11| >= alpha lambda or
|a11| sigma >= alpha lambda^2; a 1x1 pivot at r after a swap if
|a_rr| >= alpha sigma; else a 2x2 pivot.  The inertia of K is that of D
(Sylvester's law: P K P^T = L D L^T is a congruence): a 1x1 block counts by
its sign, a 2x2 block with negative determinant counts one positive and one
negative.  A pivot whose magnitude is below a stated threshold of the
column's scale is counted as ZERO (the "zero eigenvalue" of IC-2), and the
threshold is printed.  O(n^3/3), no BLAS, a student reads every line.

### 2.11 Termination, initialisation, scaling (L1 (5)-(6), secs. 3.5-3.8)

    E_mu = max( ||grad f + A lambda - z||_inf / s_d,  ||c||_inf,  ||XZe - mu e||_inf / s_c )

s_d, s_c >= 1 grow with the average multiplier above s_max = 100 (L1 p. 3).
Converged when E_0 <= tol = 1e-8.  Other stops, each named: iteration limit;
locally infeasible (2.7); restoration at a feasible point; dw > dw_max with
restoration failing; a step below 10 eps_mach twice at mu = tol/10 (L1 sec.
3.9).  The end prints the KKT certificate, the active bounds and the
multipliers as shadow prices (`sec:sqp-shadow`).  Before the first iteration:
bounds relaxed by 1e-8 max(1, |bound|) (L1 (35)); x0 pushed inside
(kappa_1 = kappa_2 = 1e-2); z0 = 1; lambda0 by least squares (L1 (36)),
dropped above 1e3; f and each c_j scaled DOWN so their gradients at x0 are at
most g_max = 100.  Each is printed when it changes the problem.

### 2.13 Parameters, defaults, sources

| symbol | default | source | symbol | default | source |
|---|---|---|---|---|---|
| tol | 1e-8 | L1 p. 9 | mu0 | 0.1 | L1 p. 9 |
| kappa_eps | 10 | L1 p. 9 | kappa_mu, theta_mu | 0.2, 1.5 | L1 p. 9 |
| tau_min | 0.99 | L1 p. 9 | kappa_Sigma | 1e10 | L1 p. 5 |
| gamma_theta, gamma_phi | 1e-5, 1e-5 | L1 p. 9 | delta | 1 | L1 p. 9 |
| s_theta, s_phi | 1.1, 2.3 | L1 p. 9 | eta_phi | 1e-4 | L1 p. 9 |
| gamma_alpha | 0.05 | L1 p. 9 | p_max | 4 | L1 p. 9 |
| theta_max | 1e4 max(1, theta(x0)) | L1 p. 9 | theta_min | 1e-4 max(1, theta(x0)) | L1 p. 9 |
| kappa_soc | 0.99 | Choupo's choice: the preprint gives kappa_soc in (0,1) and no value | s_max | 100 | L1 p. 3 |
| rho, zeta | 1000, sqrt(mu) | L1 sec. 3.3.1 | kappa_resto, kappa_F | 0.9, 0.999 | L1 sec. 3.3 |
| kappa_d | 1e-4 | L1 sec. 3.7 | lambda_max | 1e3 | L1 sec. 3.6 |
| IC constants | section 2.3 | L1 p. 10 | g_max | 100 | L1 sec. 3.8 |

None is a dictionary key (the amplifier rule); the run header prints them
with these sources.

### 2.14 Pseudocode (Algorithm A as Choupo runs it)

    scale, relax bounds, push x0 inside, z0 = 1, lambda0 by (36)
    mu = mu0; F = {theta >= theta_max}
    loop k = 0, 1, ...
        if E_0 <= tol: CONVERGED
        while E_mu <= kappa_eps mu (at least one step per mu):
            mu = update(mu); tau = max(tau_min, 1-mu); F = {theta >= theta_max}
        build W, A, Sigma; (dx, dl) = solve (13) with Algorithm IC
            on dw > dw_max: RESTORATION
        dz from (12); alpha_max, alpha_z by (15)
        for l = 0, 1, ...: alpha = 2^-l alpha_max
            x+ = x + alpha dx; evaluate (failure -> reject)
            if (theta+, phi+) in F: reject
            elif switching(19) and theta <= theta_min: accept iff Armijo(20)
            else: accept iff (18)
            if rejected and l == 0 and theta+ >= theta: try SOC (26)-(28)
            if alpha < alpha_min (23): RESTORATION; break
        on accept: lambda += alpha dl; z += alpha_z dz; clip z by (16)
                   if not phi-type: F += corner (22)
        RESTORATION: KKT-error reduction, else the min-violation IP (31);
                     its optimum with theta > 0: LOCALLY INFEASIBLE

## 3. The code shape in Choupo

### 3.1 What exists and is reused (read at file:line)

* **SQP** `solver::sqp` (`SQP.H:180-186`): FD gradients, damped BFGS
  (`SQP.cpp:553`), active-set QP (`ActiveSetQP.H:136-138`), L1 merit, a
  watchdog every 5 iterations (`SQP.cpp:498-500`); `verifySQP` (HS35, HS21,
  HS71, `SQP.cpp:726-805`) runs before every `method sqp` case
  (`OptimizationDriver.cpp:983-990`); the method list is an if/else chain
  (`OptimizationDriver.cpp:222-228`), not a factory.
* **Newton and chains** `newtonND`, `gaussSolve` (`NewtonND.H:233,239`); the
  declared, AUDITED structure `BlockTri` (`NewtonND.H:147-154`), declared by
  the MESH column (`DistillationColumn.cpp:3710-3720`) and the rate-based
  segment (`RateBasedSegment.cpp:780-781`); block-Thomas
  (`BlockTridiagonal.H:89-96`, used at `NewtonND.cpp:756`), LU with pivoting
  inside each block only (`BlockTridiagonal.H:47-50`): no symmetry, no inertia.
* **Dense LU** `luFactor/luSolve` (`LU.H:52-53`).  **SparseLU**
  (`SparseLU.H:97-111`): minimum degree and symbolic once, a FIXED pattern,
  DIAGONAL pivots, each factor accepted on its backward error -- no inertia,
  no pivoting, which is exactly what a sparse CHOLESKY needs (D2).
* **Stability** `michelsenTPD` (`StabilityTest.H:94-100`) on a LIQUID's
  activity coefficients (`Phase.H:85-88`); no fugacity-based test exists.
* **Gibbs** `GibbsMethod` (`GibbsMethod.H:281-317`), registry
  (`GibbsMethod.cpp:377-386`) called from `choupoSolve/main.cpp:549` and
  `DynamicDriver.cpp:418`; `GibbsProblem` (`:73`), `GibbsEquilibrium` (`:99`)
  with `pi` (`:105`), `nSolid` (`:131`), `lnActivity` (`:135`); pure solids by
  a bisection OUTSIDE each method (`GibbsSolidPhase.cpp:123`); `directMin` =
  Nelder-Mead with a penalty (`DirectMin.cpp:87`, `:241`).
* **Flash** LL objective (`IsothermalFlash.cpp:584-605`), TPD first (`:608`),
  Nelder-Mead (`:847`); VLLE objective (`:999-1020`), Nelder-Mead (`:1357`);
  the `model` slot (`:2510-2530`).

### 3.2 New files, by Uno ingredient (L4 sec. 3)

    src/solver/ip/
      NLPProblem.H            f, grad f, c, A, Hessian of the Lagrangian
                              (analytic | finite differences of the gradient,
                              announced), bounds, names of rows and variables
      SymmetricIndefinite.H   abstract: factor(K) -> inertia; solve(b)
      DenseLDLT.{H,cpp}       Bunch-Kaufman (A1)                 [subproblem solver]
      BlockLDLT.{H,cpp}       symmetric block-tridiagonal (D1)   [subproblem solver]
      InertiaCorrection.{H,cpp}  IC (A2) | inertiaFree (D2, L5)  [inertia correction]
      BarrierUpdate.{H,cpp}   monotone (A2) | adaptive (A3)      [inequality handling: IP]
      Globalization.{H,cpp}   filter (A2) | merit (A4, L1 (39)) [globalization strategy]
      LineSearch.{H,cpp}      backtracking + SOC                 [globalization mechanism]
      Restoration.{H,cpp}     KKT-error reduction + min-violation [constraint relaxation]
      InteriorPoint.{H,cpp}   Algorithm A over the parts above
      IPTrace.H               the per-iteration record (3.4)

The Hessian model is the `NLPProblem`'s (exact, or FD of an analytic
gradient).  Each abstract part has `registerType`, `New`, `registerBuiltins`
(CLAUDE.md section 5), called explicitly beside `GibbsMethod::registerBuiltins()`
in `choupoSolve/main.cpp` and `DynamicDriver.cpp`; no static registration.

**The SQP as one combination.**  In Uno's terms the shipped SQP is: no
constraint relaxation (Powell's theta scaling when the QP is inconsistent),
inequality-constrained subproblem, damped-BFGS Hessian, no inertia
correction (B is SPD by construction), active-set QP solver, L1 merit,
backtracking.  The mapping is clean, the refactoring is NOT done in these
slices: the SQP is the one `outerDict` optimiser and has its own robustness
slice (C496).  When stage A has landed, the SQP may be moved onto the shared
parts only with byte-identical traces on HS35/HS21/HS71 and every `method sqp`
golden unmoved; until then the two share vocabulary (the KKT certificate,
shadow prices), not code.

### 3.3 What a case writes

Gibbs reactor (stage B):

    type   gibbsReactor;
    model  interiorPoint;                  // the other values exist: elementPotential, reactiveFlash, directMin
    operation { ... as today ... }
    interiorPoint
    {
        barrierUpdate  monotone;           // | adaptive
        globalization  filter;             // | merit
        log            "ipLog.csv";        // optional; refused inside data/standards
    }

The block is optional and REFUSED by name under any other `model`; no
`tolerance`/`maxIter` key until a case needs another value.  Flash (stage C):
`model gibbsMinimisation;` gains `minimiser nelderMead | interiorPoint;`
(default `nelderMead`, the unchanged path) and the same block; the asymmetry
with the reactor (whose `model` IS the minimiser) is inherited and named.

### 3.4 What the run prints (the glass box)

The header: n, m, bounds, removed variables, scaling, the table of 2.13.
Then one line per iteration:

    it  mu       phi_mu      theta     inf_du    compl     ||dx||    dw      inertia  a_pr    a_du   ls  type  |F|
    12  1.0e-03  -3.1e+01    2.4e-06   8.1e-05   9.8e-04   3.2e-02   0       (9,4,0)  1.0e+0  1.0e+0  1  phi   7

`type`: `phi` (Armijo, filter unchanged), `theta` (filter augmented), `soc`,
`resto`, `wd`.  Each barrier change prints its rule ("mu 1.0e-01 -> 2.0e-02 by
(7)"), each inertia correction its trials ("(8,5,0) wanted (9,4,0): dw 1e-4"),
each restoration its entry and exit.  `log` writes the same numbers as a
long-form CSV shaped like `GibbsLogRecord` (`GibbsMethod.H:172-180`), so an
EduTool reads the run, never re-computes it.  Verbosity 2: header and
certificate only.

## 4. Validation plan

### 4.1 Stage A: Hock-Schittkowski (L11, values read in `PROB.FOR`)

| problem | n | constraints | f* (`FEX`) | why it is in the set |
|---|---|---|---|---|
| HS1 | 2 | lower bound x2 >= -1.5 | 0 | Rosenbrock valley, one bound |
| HS6 | 2 | 1 nonlinear equality | 0 | equality only, start (-1.2, 1) |
| HS7 | 2 | 1 nonlinear equality | -sqrt(3) | nonconvex objective |
| HS13 | 2 | 1 nonlinear inequality, x >= 0 | 1 | LICQ FAILS at x* = (1, 0): tests dc and restoration |
| HS21 | 2 | 1 linear inequality, bounds | -99.96 | shared with `verifySQP` |
| HS35 | 3 | 1 linear inequality, x >= 0 | 1/9 | shared with `verifySQP` |
| HS38 | 4 | bounds only | 0 | Colville, bounds on a hard valley |
| HS40 | 4 | 3 nonlinear equalities | -0.25 | indefinite Lagrangian Hessian: inertia correction |
| HS43 | 4 | 3 nonlinear inequalities | -44 | Rosen-Suzuki |
| HS71 | 4 | 1 equality, 1 inequality, bounds | 17.0140172895 | shared with `verifySQP` |
| HS76 | 4 | 3 linear inequalities, x >= 0 | -4.68181818182 | QP, a bound active at x* |
| HS100 | 7 | 4 nonlinear inequalities | 680.630057275 | nonconvex |
| HS113 | 10 | 8 inequalities | 24.3062090641 | ten variables |
| HS116 | 13 | 15 inequalities, bounds | 97.5884089805 | badly scaled |
| HS118 | 15 | 29 linear inequalities, bounds | 664.820449993 | many bounds |

Written in C++ from the MATHEMATICAL statement (as `verifySQP` does), never
copied from the Fortran; hand derivatives checked against central differences
in the test.  PASS: |f - f*| <= 1e-6 max(1, |f*|), violation <= 1e-8, from the
collection's start.  Iteration counts are pinned with a band.

**Gates and their sabotages** (each gate's header names the defect it would
have caught, CLAUDE.md rule 4e(4)):

* `check_ldlt_inertia` (A1; `test/ldlt_inertia.cpp`, compiled by the gate as
  `check_kinetics_jacobian.py` compiles `test/sparse_lu.cpp`): matrices of
  known inertia -- diagonal, [[0,1],[1,0]], the KKT matrix of HS76 at x*, a
  random congruence S diag(signs) S^T -- backward error <= 1e-12 and the exact
  inertia.  Sabotages: a 2x2 block counted as two positive (inertia wrong on
  [[0,1],[1,0]]); alpha set to 0 so no 2x2 pivot is ever taken (breakdown on
  the zero-diagonal matrix).
* `check_interior_point` (A2..A4; `test/interior_point_hs.cpp`): the table.
  Sabotages: (i) the fraction-to-the-boundary rule removed -- an iterate
  leaves x > 0 and a log is evaluated at a negative argument; (ii) Algorithm
  IC disabled -- HS40 (indefinite W) converges to a non-minimiser or stalls;
  (iii) the restoration phase replaced by a stop -- HS13 fails; (iv) the
  filter's (22) corner computed from f instead of phi_mu -- caught if the
  pinned iteration counts move.  A sabotage that the gate does not catch is
  recorded as such, and the gate is not claimed to hold that line.

### 4.2 Stage B: the Gibbs reactor (cases read in `tutorials/steady/gibbs/`)

`model interiorPoint` against the existing methods on the SAME case, by a
gate that copies each case and switches the model (the copy-through-one-home
kit of C420):

| case | what it tests | compared with |
|---|---|---|
| gibbs01_water_gas_shift, gibbs02_steam_reforming, gibbs03_methane_combustion, gibbs04_wgs_temperature_sweep | ideal gas | elementPotential: every amount 1e-8 relative, pi = -lambda to 1e-8 |
| gibbs05_adiabatic_flame, gibbs13_adiabatic_approach_direction (SRK vapour: B3) | the adiabatic outer loop calls the method at many T | elementPotential: outlet T within 1e-6 K |
| gibbs06_h2_flame_radicals, gibbs06_thermal_nox | trace species (2.9) | elementPotential after the polish; the polish's largest change printed and pinned |
| gibbs07_wgs_cooled, gibbs08 (reactiveFlash), gibbs09 (directMin) | gas + liquid | all three methods; directMin agrees to ~0.3 % by its own description |
| gibbs10_ammonia_fugacity | SRK fugacity coefficients (B3) | elementPotential with its phi passes |
| gibbs11_carbon_deposition | pure solid present / absent (B2) | the bisection of `GibbsSolidPhase.cpp`: n_s, and the absent solid's bound multiplier against `lnActivity` |
| gibbs12_element_potential_newton | the four logged reactors incl. the far feed | elementPotential; the IP needs no primal seed |
| claus01_thermal_stage | C-H-N-O-S, adiabatic | elementPotential |

**The bridge to the element potentials**, said in the run and the Theory
Guide: with c(n) = A n - b and stationarity mu_i/RT + (A^T lambda)_i - z_i = 0,
a present species has z_i -> 0 and mu_i/RT = -(A^T lambda)_i, which is the
element-potential form mu_i/RT = sum_k pi_k A_ki with **pi = -lambda**.  An
ABSENT pure solid keeps z_s > 0 and z_s = g_s/RT - sum_k pi_k A_ks = -ln a_s:
the bound multiplier IS the solid's test, which the bisection computes
separately (`GibbsMethod.H:135`).  The ideal-mixture Hessian of G/RT is
analytic, diag(1/n_i) - 1/N per phase; a fugacity or activity correction adds
its derivative, by finite differences of the analytic ln phi (n evaluations,
announced) until an analytic one exists.  Amounts are scaled by the total feed
moles.

### 4.3 Stage C: the flash

Variables n_i^alpha per candidate phase; equalities sum_alpha n_i^alpha =
F z_i over the components PRESENT in the feed; n >= 0.  TPD proposes a phase;
one whose amount falls below a stated threshold is dropped; TPD on the
converged phases decides whether one is added back.  The barrier's own
certificate (positive z in an absent phase) holds per component at that
phase's current composition only, weaker than TPD, so TPD decides.

| case | test |
|---|---|
| vlle01_waterButanol | LL, UNIQUAC: both liquid compositions within 1e-6 of Nelder-Mead; G/RT not higher |
| vlle04_two_liquids_decanter | two liquids, no vapour: the vapour phase dropped and named |
| vlle03_audit_artificial | three phases by construction |
| vlle05_produced_feed | VLLE from a produced feed |
| flash01_benzene_toluene, flash02_ethanol_water, flash03_wilson_ethanol_water | VLE against `rachfordRice` to 1e-8 |

Accepted only if G/RT is not above Nelder-Mead's by more than 1e-10 and every
returned liquid passes TPD; a disagreement prints both answers.

### 4.4 Acceptance by measurement against the external reference

As Cantera was used for combustion: the authors' open-source implementation of
L1 is run OUTSIDE the repository (a throw-away environment, as the C496 bench
did; nothing of it enters the tree), on the same problems, the same start
points, the same tolerance 1e-8: the HS set of 4.1, and the stage B and C cases
whose problem is fully defined by exported data (ideal gas and ideal or
gamma-model liquids: A, b, g_i/RT, P, the activity parameters; SRK cases are
compared with elementPotential only).  The table -- solved (the PASS rule of
4.1), iterations, function evaluations, failures and their reason -- is
published as `docs/audits/<date>-interior-point-bench.md`, with its PROTOCOL
committed before any result (the C496 rule).  The external code is named there
as the external reference and nowhere else.  Acceptance of stage A: every HS
problem the reference solves is solved, and the median iteration count is
within a factor of 2 of the reference's; a problem only the reference solves is
a named defect with a slice.

### 4.5 The EduTool

"What does the barrier do?", from a recorded `ipLog` (as `stiff-chemistry`
reads recorded runs): a 2-variable HS problem's iterates over the barrier's
level curves at three mu (the barrier emptying); the filter in the
(theta, phi) plane, each trial accepted or rejected and the corner it added;
the Gibbs reactor's absent solid, its bound multiplier against ln a_s.  Its
pedagogical scope goes to Vítor BEFORE dispatch (CLAUDE.md section 10);
`OptimizersTool` links to it.

## 5. Risks, and what is OUT

**Risks.**
* *A second optimiser beside the SQP* reads as the zoo the 11-24 ruling
  stopped: inner problems only, no `outerDict` method, the bench of 4.4 first.
* *Trace species* (2.9): the polish is mandatory in stage B; a polish that
  moves a major species by more than 1e-6 is a defect.
* *Equation-of-state phases in stage C* (L10, abstract and sec. 1.2): keeping
  every candidate phase present, as a barrier does, evaluates each phase's
  Gibbs function where the cubic may have one real root, and there the liquid-
  and vapour-like functions are not both defined -- the authors' explanation of
  the unified formulation's failures with cubic laws.  So stage C is gamma-phi
  first (activity liquids are defined on the whole simplex); EoS phases come in
  C3, after a fugacity-based TPD, a missing root being a rejected trial (2.5).
* *Nonconvex Gibbs surfaces*: the IP finds a LOCAL minimum; TPD and
  multi-start stay; global certainty is stage E's question.

**OUT, explicitly.**
* Matching a production solver on 1e5-variable problems, or its speed.
* An `outerDict` method `interiorPoint` (see 0.5).
* Quasi-Newton Hessians for the IP; trust-region IP (L4 sec. 5.2);
  complementarity constraints.
* The unification of the shipped SQP before stage A has landed (3.2).
* A multigrid KKT solver (D2 names it as research, nothing more).

## 6. Stage D: large problems, structure first

### 6.1 D1 -- the KKT solve along the chain

Choupo's large problems are CHAINS: a column of stages (the MESH Jacobian is
block-tridiagonal, off-band maximum 0 measured on the corpus,
`DistillationColumn.cpp:3710-3712`), a collocation problem of time elements.
Ordered stage by stage, (x_j, lambda_j), the KKT matrix of 2.2 is SYMMETRIC
block-tridiagonal provided each stage equation is a SUM of terms each in one
stage's variables (MESH is: flows times stage properties), so that the
Lagrangian Hessian couples no stage to j+-2; that claim is audited on the
first iteration as `BlockTri` audits the Jacobian's (`NewtonND.H:147-154`).
A few global variables (a reflux ratio, a duty, a final time) form an
arrowhead border.  FATROP (L12) orders its reduced primal-dual system (7) by
stage (9a-f) and solves it by a Riccati recursion generalised to stagewise
equality constraints, linear in the horizon; it needs a full-rank Jacobian
and a positive definite reduced Hessian, tests the latter inside the
recursion "at no extra cost", and otherwise adds a multiple of the identity
to the Hessian.  A column is not an optimal-control chain (its stage
equations are implicit in both neighbours; there is no x_{k+1} = f(x_k, u_k)),
so the Riccati form does not carry over; the general symmetric block
elimination does:

    S_1 = D_1;   S_j = D_j - L_j S_{j-1}^-1 L_j^T          (j = 2..N)
    K = L_blk diag(S_1..S_N) L_blk^T  is a congruence, so
    inertia(K) = sum_j inertia(S_j)                         (Sylvester)

Each S_j is factored by the Bunch-Kaufman LDL^T of A1; the inertia of K is
the sum read as the elimination runs, and Algorithm IC works unchanged; the
border is eliminated last.  Storage: `BlockBands`; NOT `blockThomasFactor`'s
LU, which has no symmetry and no inertia.  Its stated limit stays: no
pivoting ACROSS blocks, so a singular S_j stops the elimination though K is
nonsingular; remedy, in order: dw (it lifts every S_j's primal part), dc, then
the dense LDL^T of the whole matrix, announced.  First consumer: a column MESH
as an IP with bounds (flows, fractions >= 0), equal to the shipped MESH Newton
on the column corpus; then collocation, when dynamic optimisation exists.

### 6.2 D2 -- the iterative route for general large sparse problems

The CFD way (PCG, multigrid; OpenFOAM's PCG/GAMG is the owner's reference)
works because a pressure matrix is symmetric positive definite and its
conditioning is set by the mesh, not by the iteration.  An IP's KKT matrix is
INDEFINITE and degrades AS mu GOES TO ZERO: sigma_i = z_i/x_i tends to
infinity on an active bound, to zero on an inactive one.  For an LP, Gondzio
bounds the normal equations' condition number by O(mu^-2), O(mu^-1) when
nondegenerate (L13 Lemma 4.1, (37)).  What the literature does, as read:

* **Regularise, then precondition** (L13 secs. 3-5): primal-dual
  regularisation bounds the condition number independently of mu ((42)), at
  the price of a step that departs from Newton's when it is large; the
  preconditioner is a PARTIAL Cholesky of the k largest pivots ((45)), built
  from matrix-vector products.  Scope: LP and convex QP.
* **The condensed SPD form** (L14 sec. 3): with dc > 0, K + G^T G / dc is
  positive definite exactly when the KKT matrix has the right inertia
  (Remark 1), so a CHOLESKY breakdown IS the inertia test and no pivoting is
  needed.  HyKKT: Cholesky of K + gamma G^T G and CG on the Schur complement
  (12), whose eigenvalues cluster at 1/gamma -- but gamma must pass a
  threshold that grows with a near rank-deficient Jacobian or a nearly
  indefinite reduced Hessian (Remark 2, (13)).  LiftedKKT relaxes each
  equality to |g| <= tau; K_tau is Cholesky-factorable for a large enough dw
  but severely ill-conditioned, so it needs accurate iterative refinement
  (sec. 3.2).  That this ill-conditioning is benign is argued in L14 sec. 4,
  whose body was NOT read.
* **Constraint preconditioners** (cited in L13 sec. 4) and **inexact steps**
  (L15): NOT READ; read before an inexact solve is designed.
* **Without an inertia** an iterative solve uses L5's curvature test along the
  step ((16), (28)) in place of Algorithm IC, at the stated price that the
  step need not minimise the quadratic model (L5 sec. 4).

Choupo's D2, in order of measurement: (a) the condensed SPD form and a SPARSE
CHOLESKY on `SparseLU`'s ordering and symbolic stages (fixed pattern,
diagonal pivots: what SPD needs), breakdown answered by Algorithm IC; (b) PCG
with a partial-Cholesky preconditioner, its iteration count printed per IP
iteration so the student watches it grow as mu falls; (c) multigrid:
research, no slice.  Each held to the dense or block solve first.

### 6.3 E -- global phase equilibrium (research)

HELD (L9, not read) is read before any design; it would certify what stage
C's local answers and TPD only test.

## 7. Slice plan

Each slice: its own worktree, the validation its reach requires, and rule
4d's four criteria -- (1) a labelled Theory Guide section, equations as
implemented, sources with equation numbers; (2) each selectable key's F1 link
to it (`gui/src/case/modelDocs.ts`), "not applicable" where no key is added;
(3) Tutorials Guide, `docs/tutorials-catalogue.md`, `docs/ai/unit-ops.md`, the
capability index; (4) the PDFs rebuilt.

| slice | content | acceptance |
|---|---|---|
| A0 | this record | committed |
| A1 | `DenseLDLT` (Bunch-Kaufman, inertia) | `check_ldlt_inertia` green, both sabotages caught; `sec:ldlt-inertia` |
| A2 | Algorithm A: monotone mu, filter LS, IC, min-violation restoration, termination, scaling; trace and CSV | the HS table of 4.1 with f* to 1e-6; `check_interior_point` with sabotages (i)-(iii); `sec:ip-*` in a new Theory Guide chapter beside `ch:sqp` |
| A3 | SOC, KKT-error-reduction restoration, the L1 sec. 3.2 heuristics, `barrierUpdate adaptive` (L2) | each added ONLY with the HS iteration counts it changes, shown before/after; sabotage (iv) |
| A4 | `globalization merit` (L1 (39)-(40)) | same HS set; the filter/merit table published in the guide |
| A5 | external bench on the HS set, protocol first (4.4); the Gibbs and flash rows are added after B1 and C2 | the audit document; stage A accepted or its defects named |
| B1 | `model interiorPoint` in the Gibbs reactor, gas + ideal liquid, element-potential polish, `ipLog` | 4.2 rows gibbs01-07, 12, claus01; a tutorial `gibbs14_interior_point`; F1 link; `unit-ops.md` |
| B2 | pure solids as bounded variables (a virtual on `GibbsMethod` saying the method carries solids; the bisection stays for the others) | gibbs11 and gibbs12's solid reactor: n_s and z_s = -ln a_s |
| B3 | fugacity coefficients (FD Hessian part) | gibbs10, gibbs13 |
| C1 | `minimiser interiorPoint` in the LL flash | vlle01, vlle04 |
| C2 | VLLE and VLE | vlle03, vlle05, flash01-03 |
| C3 | EoS phases, after a fugacity-based TPD | named cases chosen then |
| D1 | `BlockLDLT`, column MESH with bounds | block = dense on the KKT of every column case; MESH answers unmoved |
| D2 | condensed SPD + sparse Cholesky; then PCG | each held to the dense/block solve; CG counts printed |
| E | HELD, read first | a reading note before any code |

Order: A1 -> A2 -> A5 (measure early) -> B1 -> A3/A4 as the measurements ask
-> B2, B3 -> C1, C2 -> D1 -> D2 -> C3 -> E.  The EduTool (4.5) follows B2,
after Vítor has the scope.

## 8. The architect's review (2026-11-25, read in full before any code)

Sections 2.2-2.8 were checked against L1 as the reviewer knows it (system
(13), the IC constants, (15)-(16), the switching and Armijo tests, (22),
(27), the restoration problem, (7)): no discrepancy found.  Four amendments,
each binding on the slice it names.

**R1 (slice B1) -- A MIXTURE'S ENTROPY IS ALREADY A BARRIER.**  In a phase
that is present (N > 0), a species' term n_i ln(n_i/N) has the derivative
ln(n_i/N), which goes to minus infinity as n_i -> 0+: the minimum has every
n_i > 0 and the bound n_i >= 0 is NEVER active for a species of a present
mixture phase.  A log barrier on top of it buys nothing and costs exactly the
mu/n_i error of 2.9.  So B1 implements and MEASURES two variants on the same
cases: (a) the barrier on every amount, with the polish (2.9 as written);
(b) NO barrier term on the species of a mixing phase (z_i = 0 identically;
positivity kept by the fraction-to-the-boundary rule alone), the barrier only
on pure condensed species, whose G is linear in n_s and whose bound can be
active.  Reported for each: iterations, and the largest change the polish
makes.  The expectation, stated before the measurement: (b) needs no polish
on gibbs06's radicals, and is the primal-dual Newton on the true KKT
conditions (the classical RAND step), with the IP's globalization around it.
The variant that measures better is the default; the other stays selectable
only if a case needs it.  The limit of (b), said: when a WHOLE phase vanishes
(N -> 0) the gradient ln(n_i/N) stays finite and the bounds become active
together, so the barrier is needed on a phase that can disappear (stage C).

**R2 (slice C1) -- measure the second formulation of the flash.**  Beside the
variables n_i^alpha of 4.3, the formulation in phase amounts beta_alpha >= 0
and compositions x^alpha on the simplex puts the barrier where R1 says it
belongs (on beta only).  C1 states which one it implements and why, with the
iteration counts of both on vlle01 if both are cheap to write.

**R3 (slice A2) -- an infeasible problem in the test set.**  HS13 tests a
failing constraint qualification, not infeasibility.  Add two tiny problems
with no feasible point (two inconsistent linear equalities; a bound against
an equality): the run must end "locally infeasible" naming the rows, never
"converged" and never an iteration-limit stop.  A sabotage of the restoration
exit test must fail the gate.

**R4 (slice A1) -- the solve is refined and its error is printed.**  The
dense LDL^T returns, with each solve, the backward error after at most two
steps of iterative refinement on the unscaled system; Algorithm IC treats a
backward error above a stated threshold as a wrong factorisation (the same
acceptance rule `SparseLU` already uses for its factors).

**On D1** the congruence argument is right provided every S_j is nonsingular;
the document says what happens when one is not.  For a SQUARE stage block
(as many stage equations as stage unknowns, the simulation case) that
condition is the nonsingularity of the stage's own Jacobian block, which the
shipped block-Thomas already requires.

Not re-derived by the reviewer: L2's rule that the filter is reset at every
free iteration (2.8), and the two printing details of L1 flagged in section 1;
each is read against its source by the slice that codes it.
