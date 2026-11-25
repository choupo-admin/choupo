# optim09 — the problem of optim05 with `fdMode auto` (noise-aware SQP)

This case is `optim05_reactor_npv` with `fdMode auto;` instead of `fdStep 2e-2; fdMode central;` and without the inert
variable `T_feed` (below).  Same flowsheet, same economics, one variable and two constraints; what changes is how the
SQP differences its responses and what it is allowed to call a result.

* The step of each variable comes from the NOISE the engine measures in the
  NPV (about 2e-4 EUR on 6.6e8, nine points 1e-3 apart, never the same point
  twice) and from its curvature.  The first line of each iteration's `fd:` row
  says which variable was differenced forward or central, with which step and
  why.
* The shadow prices print with an error bar (`lam (+-bar)`, 2 sd, first order,
  through the QP's own multiplier map), `inactive: exactly 0` for the slack
  capital cap, and `error bar unavailable` whenever the bar cannot be defended.
* `CONVERGED` needs the gradient re-estimated AT the optimum and its error bar
  (3 sd of ||grad L||) below the tolerance; the tolerance is scaled by the size
  of the gradient terms (an absolute 1e-5 on a 6.6e8 objective with a shadow
  price of 2.4e6 is a relative 1e-11).  The optimum block prints the bar beside
  the tolerance.  When the bar is too large the word is `STATIONARY, NOT
  CERTIFIED`, exit code 1.
* Theory Guide, section "Noise-aware differences: fdMode auto".  It costs more
  simulator runs than the default on a response that is smooth to rounding
  (40 against 16 from the tutorial start): measured in
  `docs/audits/2026-11-24-optimizer-bench-results.md`, section 8.

**Finding (2026-11-25, C496 review 2): `T_feed` is INERT in optim05, so optim09 does not carry it.**
In optim05 `variables.T_feed` is declared and the optimiser varies it, but nothing reads it: the
feed stream's temperature is the 352.5 K of `0/feed` (the reactor and the replayed JSON show
352.5 K while the history prints `T_feed = 350`).  Its gradient is zero, and under `fdMode auto`
the noise bar of that component (the NPV, 6.6e8, carries 2e-4 of noise) is far above any
tolerance a zero-gradient component can have, so the run could never be certified for a
variable that does nothing.  optim09 therefore has ONE variable, `V_R`, against the size cap and
the (slack) capital cap; everything else is optim05's.  The prose below, which credits `T_feed`
with raising the conversion, describes optim05's intention, not its wiring.

Original description of the problem (optim05):

# optim05 — esterification plant, size & operate for MAXIMUM NPV (constrained SQP)

Take the `economics01` ethyl-acetate plant and stop *fixing* the design — let
the engine **choose** it. The hand-rolled SQP sizes and operates the reactor
to **maximise the net present value**, subject to inequality caps, and prints
the **shadow prices** (Lagrange multipliers) of the binding caps.

```
feed → reactor (CSTR) → heater → separator (flash) → vapProd  (EtOAc-rich, sold high)
                                                    → liqProd  (water/acid, sold cheap)
```

## The decision

```
maximise   economics.NPV
varying    V_R     (reactor volume,        m³)
           T_feed  (feed / reactor T,      K)
subject to reactor.V_R    ≤ 12 m³     (a physical SIZE cap)
           economics.FCI  ≤ 1.0 M€    (a CAPITAL-BUDGET cap)
```

The objective `economics.NPV` is a KPI **published by the `EconomicsPass`** in
the `system/postDict` chain (sizing → costing → economics). The optimiser runs
that whole post chain on every evaluation, so the economics scalars
(`economics.NPV`, `economics.FCI`, …) are reachable as ordinary
objective/constraint paths — exactly like a sweep reads them.

## The economic trade-off

The heater runs at a **fixed partial duty**, so the flash *splits* the reactor
effluent into a light ethyl-acetate-rich **vapour overhead** (the prime product
at 1.55 €/kg) and a heavy water/acid-rich **liquid bottoms** (a low-value
byproduct at 0.30 €/kg). Esterification conserves total mass; what conversion
buys you is the **reshuffling** of that mass toward the valuable overhead.

* **V_R** — a bigger reactor raises the residence time τ = V_R/Q, so the
  isothermal-CSTR conversion `X = k·τ/(1+k·τ)` climbs and the priced overhead
  grows. But a bigger vessel costs more steel — the `StirredTank` sizing →
  Turton costing drives **FCI (CAPEX) up**. Revenue rises with **diminishing
  returns** (X saturates toward 1) while CAPEX keeps climbing → an NPV maximum
  exists.
* **T_feed** — a higher feed temperature raises the Arrhenius rate `k =
  A·exp(−Eₐ/RT)`, the cheap conversion *accelerator*. Its bounds stay inside the
  window where the flash splits cleanly (below the ~353 K edge that boils the
  bottoms dry).

We deliberately set the size cap **tighter** than where the NPV-greedy design
would otherwise stop, so the reactor-size constraint **binds** at the optimum.

## What the SQP prints

The optimiser drives the **money-losing** initial design (V_R = 4 m³,
T_feed = 350 K → **NPV ≈ −164 M€**) to a **profitable, certified optimum**:

```
status:        CONVERGED  (KKT conditions satisfied)
best variables:  V_R = 12.0 m³,  T_feed = 352.5 K
best objective:  NPV ≈ +478 M€
Lagrange multipliers (shadow prices):
  reactor.V_R    lambda = 1.80e7   ← ACTIVE   (the size cap binds)
  economics.FCI  lambda = 0.0                 (SLACK — capital is not the limit)
KKT certificate:  ||grad L|| ≈ 4e-6,  complementarity ≈ 3e-8,  feasibility 0
```

## How to read the shadow prices (the point of the tutorial)

A constraint with **λ > 0 is ACTIVE** (binding); its multiplier is the
**shadow price** — the marginal NPV you would gain by relaxing that cap by one
unit:

* **reactor.V_R cap — ACTIVE, λ ≈ 1.8e7**: every extra **m³** of reactor
  head-room is worth **≈ 18 M€ of NPV** at the margin. (A finite-difference
  cross-check confirms it: NPV at a 13 m³ cap exceeds the 12 m³ optimum by
  ≈ 12 M€, the slope being steeper at the cap itself.)
* **economics.FCI cap — SLACK, λ = 0**: capital is *not* the limiting
  resource here, so loosening the budget buys nothing. The student sees an
  **active** and an **inactive** constraint side by side.

The KKT certificate proves the returned point is a true *constrained* optimum,
not a guessed answer. (If the SQP ever fails to converge, it prints an explicit
"NO KKT certificate … NOT a certified optimum" block instead — never a forged
all-zeros certificate.)

## Numerics (numerical honesty — announced)

The driver solves the SQP in **scaled** coordinates `xs = x/s` (the scale
factors are printed). Because the NPV objective is large (~5×10⁸ €), the
finite-difference gradient step is set to `fdStep 2e-2` in `system/outerDict`
so the perturbation clears the simulator's repeatability floor — the
noise-floor probe at the top of the run reports `|dF|` so you can see the
gradients are signal, not noise.

## Run

```bash
runCase tutorials/steady/optimisation/optim09_sqp_fdmode_auto
```

AACE Class-4 economics — accuracy −30 % / +50 %. The prices in
`constant/economics` are representative teaching figures (each dated and
primary-cited in a `provenance{}` block); refresh them before any live
appraisal. The numbers above are what *this* model gives at the certified
optimum, not an independent ground truth.
