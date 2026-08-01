# Williams-Otto reference case — primary specification and build plan

Status: **anchors 1-3 SHIPPED 2026-08-01** (`ctrl12` the steady state to
all printed digits; `ctrl13` the Fig.-2 step, 3.901 -> 4.446 klb/h;
`ctrl14` the Fig.-4 PI tracking, peaks 4.634@14h / 22.89@8h on the
figure's own shape).  Anchor 4 (the section-5 optima with the
OuterDriver) remains.  Written 2026-08-01, from Schmid, Teichert, Chioua,
Schindler & Bortz, *"Simulation and optimal control of the Williams-Otto
process using Pyomo"*, arXiv:2004.07614v1 (16 Apr 2020) — supplied by Vítor
as a PDF; every number below is transcribed from that paper, with the
equation numbers it uses.  Original process: T. J. Williams & R. E. Otto,
AIEE Trans. 80 (1961) 458.

## Why this case

The natural sequel to `cavett01_recycle_train`: reactor + decanter +
column + purge/recycle with a PUBLISHED steady state, published PI
tunings, and published optimisation values — pairing the ctrl programme
and the OuterDriver with an external anchor the way cavett01 pairs the
tear solver with one.

## The model (paper §3.1, equations 3.1–3.19)

Reactions (mass-based stoichiometry; species are fictitious):

    A + B -> C          (3.1)     mass coefficients  1 A + 1 B -> 2 C
    C + B -> P + E      (3.2)     1 B + 2 C -> 1 P + 2 E
    P + C -> G          (3.3)     1 P/2 + 1 C -> 3 G/2   (per the ODE terms)

Flowsheet (paper Fig. 1): CSTR -> decanter (removes ALL G: F_wG = F_tG,
eq. 3.4) -> distillation column (product P overhead with a fixed
efficiency: F_pP = F_tP − 0.1·F_tE, eq. 3.5 — 0.1 klb of P per klb of E
stays in the bottoms) -> splitter (fraction η withdrawn as F_d, 1−η
recycled to the reactor as F_r).

The whole flowsheet is FOLDED into one ODE system for the reactor masses
m_A..m_G [klb] (eqs. 3.6–3.11, transcribed verbatim):

    dm_A/dt = F_fA + ((1−η)μ − μ)·m_A/m − k1·m_A·m_B/V
    dm_B/dt = F_fB + ((1−η)μ − μ)·m_B/m − k1·m_A·m_B/V − k2·m_B·m_C/V
    dm_C/dt = ((1−η)μ − μ)·m_C/m + 2k1·m_A·m_B/V − 2k2·m_B·m_C/V − k3·m_C·m_P/V
    dm_E/dt = ((1−η)μ − μ)·m_E/m + 2k2·m_B·m_C/V
    dm_P/dt = 0.1(1−η)μ·m_E/m − μ·m_P/m + k2·m_B·m_C/V − 0.5·k3·m_C·m_P/V
    dm_G/dt = −μ·m_G/m + 1.5·k3·m_C·m_P/V

with m = Σm_i, V = Σ m_i/ρ0_i, all ρ0_i = 50 lb/ft³; tank outlet stream μ
[klb/h] (a CONTROL); per-species outlet F_ti = μ·m_i/m (eq. 3.19).

Kinetics (eqs. 3.12–3.14):

    k_i(T) = (a_i/ρ)·exp(−b_i/T)         T in °R (Rankine)
    a1 = 5.9755e9  1/h      b1 = 12000 °R
    a2 = 2.5962e12 1/h      b2 = 15000 °R
    a3 = 9.6283e15 1/h      b3 = 20000 °R
    ρ  = 50 lb/ft³

NOTE ON UNITS: the paper's prose says "degrees Réaumur"; the values
(T* = 580, bounds 200–800) and the entire Williams-Otto literature are
degrees RANKINE (580 °R = 322.04 K).  Treat "Réaumur" as the paper's
lapse; say so in the case header.  Unit convention throughout: masses
klb, time h, flows klb/h, T °R.

Controls u = (F_fA, F_fB, T, μ, η).

## Validation anchors (the numbers a Choupo build must hit)

1. **Nominal steady state** (eq. 4.8, at u* = (10, 20, 580, 129.5, 0.2)
   from eq. 3.20; reached from x0 = (10, 1, 0, 0, 0, 0)):

       x* = (m_A, m_B, m_C, m_E, m_P, m_G)
          = (3.27, 7.47, 1.12, 9.81, 1.69, 0.22) klb

   This is THE golden target: an independently published fixed point of
   the exact primary ODEs.  Derived streams at x*: F_pP ≈ 3.9 klb/h
   (Fig. 2 pre-step level), F_wG ≈ 1.2 klb/h (Fig. 3).

2. **Step responses** (paper §3.2, Figs. 2–3): F_fB 20→21 at t = 100 h
   drives F_pP ≈ 3.9 → ≈ 4.4 klb/h; T 580→585 °R drives F_wG up then a
   new plateau (≈1.25→ after transient ≈1.3).  Qualitative but shaped —
   good trajectory checks.

3. **PI channels and tunings** (§4, eqs. 4.3–4.9): channels (μ,m),
   (F_fA,F_tP), (F_fB,F_pP), (T,F_wG); biases = u*; Skogestad-IMC gains

       K1p = −0.002,  K1i = −40.659
       K2p =  0.053,  K2i =  1.504
       K3p =  0.069,  K3i =  1.282
       K4p =  0.143,  K4i =  0.1      (hand-tuned; channel not 1st-order)

   Setpoint-tracking examples (§4.2, Figs. 4–5): F_pP^sp = 4.5 klb/h via
   channel 3 (overshoot then settle ~t=140); F_wG^sp = 1.0 via channel 4.

4. **Optimal-control values** (§5, tf = 100 h, x0 = x*, bounds
   F_fA = 10, 0 ≤ F_fB ≤ 56, 200 ≤ T ≤ 800, μ = 129.5, η = 0.2):
   - Waste minimisation (5.4): total waste ≈ 0 (degenerate — kills yield).
   - Yield maximisation (5.5) under path constraint F_wG ≤ 1: yield
     ∫F_pP dt = 611.3 (bang-bang F_fB); total waste 86.3.
   - Combined (5.7, α = β = 1): yield 608.3, waste 56.5 → J = 551.8.

   ANCHOR-4 BUILD PLAN (design settled 2026-08-01; integrals SHIPPED):
   the plant now carries yield_klb = ∫F_pP dt, waste_klb = ∫F_wG dt and
   J_combined_klb as ODE STATES (exact under both integrators), so any
   outer loop reads the objective as a plain KPI.  The vehicle is the
   EXISTING architecture end to end: a piecewise-constant control
   profile IS a Schedule controller; varying it programmatically IS
   setScalarAtPath on `controllers[i].schedule[j].value`; the optimiser
   IS OptimizationDriver (nelderMead, objective kpi
   plant.J_combined_klb_final, sense maximise).  The ONE missing piece
   is choupoCtrl reading system/outerDict: extract the campaign
   (main.cpp lines ~180-1230) into a pure functor
   `SimulationResult runCampaign(flowsheetDict, ...)` with a no-write
   mode for inner evaluations, then hand it to the driver exactly as
   choupoSolve does.  Target problem: §5.3 combined (bounds only —
   Nelder-Mead's honest domain; the §5.2 PATH constraint needs SQP over
   a noisy campaign functor and is deferred, named).  EXPECTATION,
   stated up front: K-segment single shooting will land BELOW the
   paper's 200-element collocation optimum (their F_fB is bang-bang);
   the case reports its own J beside 551.8 and the gap IS the
   parameterisation — say so, measure it vs K.

## Build plan (next session)

1. New dynamic unit `williamsOttoPlant` (src/unitOperations/dynamic/),
   implementing eqs. 3.6–3.11 VERBATIM in the paper's own units
   internally (klb, h, °R — the citation is the spec); SI at the dict
   boundary, both conversions announced.  MVs: F_fA, F_fB, T, mu, eta.
   CVs: m, F_tP, F_pP, F_wG, and the six masses.  Registered explicitly
   (no macros), like every other unit.
2. Six toy components (A_wo..G_wo) with MW 1 so the mass ledger closes
   physically (kmol == kg numerically); no formulas -> the elemental
   claim is withheld by name, no standardThermochemistry -> the energy
   claim refuses by name (both correct: fictitious species).
3. `ctrl12_williams_otto` — nominal controls, x0 = (10,1,0,0,0,0) klb,
   run to steady state, golden pinned against x* (anchor 1) with the
   klb<->SI conversion stated in the header.
4. Later cases, in order of value: the F_fB step (anchor 2); the PI
   channel (F_fB, F_pP) with the paper's gains (anchor 3); the OuterDriver
   pairing (anchor 4).

## Provenance discipline

The k20 = 7.2117e8 vs 7.2177e8 variance seen in search snippets belongs
to a DIFFERENT parameterisation lineage (the mass-fraction RTO variant of
Forbes & Marlin).  This plan uses ONE source end to end — the a_i/b_i/ρ
form above — and any future case on the RTO lineage is a separate case
with its own citation, never a blend.
