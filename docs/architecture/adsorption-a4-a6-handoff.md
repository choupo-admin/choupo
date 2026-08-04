# Adsorption A4-A6 — handoff of closed physics (forum #123)

**Status:** the irreversible PHYSICAL decisions of phases A4 (flow/Ergun +
energy), A5 (cycles/CSS) and A6 (TSA), closed with independent numerical anchors
so the implementation is MECHANICAL, with no new architecture decisions.  It
complements `adsorption-contract.md` (§1-§9, which still rules) and the A3 code
(`FixedBedAdsorber`, commit `21917b20`).  Written under #123's budget rule.  The
anchors' numbers: a reproducible script at the end of each section.

---

## Part 1 — A4-flow: multicomponent continuity + Ergun (kills the fabricated carrier)

### 1.1 State variables and closures (DECIDED)

* **ODE state per cell j:** `c_ij` [mol/m3 of gas] per component (ALL of them,
  carrier included — there is no longer a "carrier by difference") and `q_ij`
  [mol/kg] per active adsorbent.  NOTHING ELSE: neither P nor u is state.
* **P is DERIVED:** `P_j = R.T_j.Sum_i c_ij` (an ideal gas DECLARED, contract
  §1.2).  Because total continuity is the SUM of the per-species equations, it is
  IMPOSSIBLE for the system to fabricate matter — the invariant that was a
  hypothesis in A3 (constant Sum c) becomes a consequence.
* **u is ALGEBRAIC per face**, from the pressure drop between neighbouring cells
  (Ergun, 1.2).  No implicit loop: `odeDerivative` evaluates u from the current
  state's pressures (explicitly); the resulting stiffness belongs to the
  integrator (the existing Rosenbrock23), not to a new algebraic solver.

### 1.2 Ergun per face — form, sign, reversal, u -> 0 (DECIDED)

Coefficients (the adsorbent's identity gains `d_p` and an optional sphericity
phi; the gas mixture's mu by the rule already used in transport, announced):

```
A' = 150.(1-eps)^2.mu / (eps^3.(phi d_p)^2)   [Pa.s/m^2]  (viscous)
B' = 1.75.(1-eps).rho_g / (eps^3.phi d_p)     [kg/m^4]    (inertial; rho_g = P.Mbar/(R T) at the face, harmonic mean of the cells)
-dP/dz = A'.u + B'.u.|u|                      (u SUPERFICIAL, signed)
```

Per face j+1/2 with `DP = P_j - P_{j+1}` and `g = |DP|/Dz`:

```
u = sign(DP) . ( -A' + sqrt(A'^2 + 4.B'.g) ) / (2.B')
```

* **No singularity at u = 0:** as DP -> 0 the root tends to `g/A'` (the Darcy
  limit, smooth); at DP = 0, u = 0 exactly.  NEVER divide by u.
* **Flow reversal is the sign of DP** — the species upwind follows
  `sign(u_face)` per face (necessary for A5: pressurisation/blowdown reverse the
  flow locally).
* B' = 0 (large d_p, or a `darcyOnly` declaration) degrades to Darcy with no
  special branch (the general formula with B' -> 0 needs the limit: implement
  `u = g/A'` when `4B'g < 1e-12.A'^2` — write the why in the comment).

### 1.3 FV per cell — pseudocode and units (DECIDED)

```
for each face f (0..N):                          # includes both boundaries
    u_f   = ergun(P_up, P_down, props_f)         # m/s, signed
    for each component i:
        F_if = u_f . c_i,upwind(f)               # mol/m2/s  (upwind advection)
              - Dax . (c_i,down - c_i,up)/Dz     # mol/m2/s  (central dispersion)

for each cell j, component i:
    eps . dc_ij/dt = (F_i,j-1/2 - F_i,j+1/2)/Dz  # mol/m3/s
                   - rho_b . k_i . (q*_ij - q_ij)  # only if i is active on the adsorbent
    dq_ij/dt       = k_i . (q*_ij - q_ij)          # mol/kg/s
    # q*_ij = MixingRule(T_j, p_vector_j), p_ij = c_ij.R.T_j  (Pa)
```

* **Boundaries:** inlet = a DECLARED MOLAR FLOW (`F_feed,i = u_in.c_in,i` imposed
  on face 0; A3's advective Danckwerts stays for the dispersive part); outlet =
  a **DECLARED P_out** on face N (u_N from Ergun between P_N and P_out;
  dc/dz|N = 0 in the dispersion).  The P(z) profile FLOATS — it is a result.
  (These two choices are the industrial pair: a fixed-flow feed, a fixed-pressure
  downstream; the alternative P_in/P_out pair stays as a declarable option, same
  machine.)
* **Ledger:** M_in integrates `A.F_i,0`, M_out integrates `A.F_i,N` — PER
  SPECIES, carrier included (ODE state rows, as in A3).
  `carrier_fabricated_mol` stays as a KPI and MUST measure < 1e-12 (gate F3) — it
  stops being a declared residual; `declaredMaterialResidual()` returns {} on
  this unit from A4-flow onwards.

### 1.4 Stiffness and Jacobian blocks (DECIDED)

Modes: LDF (lambda ~ -k(1 + rho_b.q*'/eps), down to ~-9e3 1/s measured in A3),
advection (u/(eps.Dz)), dispersion (4Dax/(eps.Dz^2)), and the NEW pressure
coupling (du_f/dP ~ 1/(A'.Dz) in the Darcy limit -> a slow-acoustic mode
~R.T.c_tot/(A'.Dz^2) — evaluate it at start-up and PRINT it like A3's three
terms).  Structure: dense blocks per cell (nComp + nAds) plus a block-tridiagonal
coupling (faces only link neighbours).  Rosenbrock23 with the FD Jacobian, as
today, suffices; if the O((N.n)^2) cost hurts, the optimisation packet is
banded-FD (colour 3 groups) — mechanical, no physics.

### 1.5 A4-flow anchors (INDEPENDENT NUMBERS)

batch13 geometry (L = 0.5 m, eps = 0.4, A = 0.01 m2), d_p = 2.0e-3 m, phi = 1,
T = 298.15 K, ideal gas.

* **F1 — Ergun with no adsorption, CLOSED form** (k = 0, pure He,
  mu_He = 1.99e-5 Pa.s and Mbar = 4.003e-3 kg/mol DECLARED as case-local test
  data): with a constant molar flow N = u_in.c_tot(P_in) = 0.05 x 40.3395 =
  2.01697 mol/m2/s and P_in = 1e5 Pa, the exact solution is
  **P(z)^2 = P_in^2 - 2RT.(A'N + B'_m.Mbar.N^2).z** (B'_m = B'/rho_g..., i.e. the
  inertial coefficient with rho_g eliminated analytically — derivation: at
  isothermal steady state N is constant, u = N.RT/P, rho_g.u^2 = Mbar.N^2.RT/P,
  hence -P.dP = RT(A'N + 1.75(1-eps)/(eps^3 d_p).Mbar N^2)dz).
  Numbers: A' = 4197.66, inertial coefficient = 8203.12 (SI units as above);
  **DP_total = 106.6540743 Pa, P(L) = 99893.34593 Pa,
  P(L/2) = 99946.68719 Pa**; Darcy alone would give P(L) = 99895.00347 (the B
  term is worth 1.658 Pa — the case distinguishes the two terms).  Gate: the
  steady FV profile matches the closed form to 1e-8 relative at N = 100.
* **F2 — dilute uptake** (400 ppm CO2 in He): total conservation per species to
  machine error (it is structural now) and u(z) constant to < 1e-5 relative — the
  limit where A3 and A4 coincide; A4's breakthrough differs from A3's by < 0.1 %
  in t_b5.
* **F3 — the 15 % case (batch13 re-run under A4):**
  `carrier_fabricated_mol < 1e-12` with NO accounting correction whatsoever
  (#123's central gate); the campaign balance closes on the elements to < 1e-6
  with an empty `declaredMaterialResidual()`; expected sense of the deviation vs
  A3: u drops crossing the uptake zone (-15 % locally), so t_b5 INCREASES —
  report the Dt_b5 obtained (not pinned a priori: it is the new result; it is
  pinned into the golden when recorded, with the sense verified).

```python
# reproduction of F1 (verbatim from the calculation used above)
import math; R=8.314462618; T=298.15
eps,dp,L,mu,M=0.4,2e-3,0.5,1.99e-5,4.003e-3
P_in=1e5; N=0.05*P_in/(R*T)
A1=150*(1-eps)**2/(eps**3*dp**2)*mu; B1=1.75*(1-eps)/(eps**3*dp)
S=2*R*T*(A1*N+B1*M*N**2); print(math.sqrt(P_in**2-S*L))  # 99893.34593
```

---

## Part 2 — A4-energy: the T balance + the ledger (no second enthalpy surface)

### 2.1 Per-cell balance (DECIDED — one gas+solid thermal lump)

```
[eps.Sum_i c_ij.cp_g,i(T_j) + rho_b.cp_s] . dT_j/dt =
      - Sum_i (F_i upwind at the face).cp_g,i.(DT upwind)/Dz  # thermal convection
      + lambda_ax . (T_{j+1} - 2T_j + T_{j-1})/Dz^2           # thermal conduction/dispersion
      + rho_b . Sum_i (-dH_ads,i) . k_i.(q*_ij - q_ij)        # adsorption source (>=0 if dH<0 and adsorbing)
      + (4.h_w/d_bed) . (T_w - T_j)                           # wall/jacket (opt-in; h_w, T_w declared)
```

* **Signs FIXED:** dH_ads < 0 (contract §2); the source is `+(-dH).dq/dt` —
  adsorption heats, desorption cools, with NO sign branches in the code.
* cp_g,i = the `idealGasHeatCapacity` of the EXISTING records evaluated at T_j —
  **the same canonical surface as always, NEVER a parallel table** (lesson #106
  is law here).  `cp_s` = a new `cpSolid` field on the adsorbent's IDENTITY
  (curated; absent -> the T balance REFUSES by name, contract §9).  The adsorbed
  phase's heat capacity: NEGLECTED AND DECLARED in the header (a future
  extension, never a silent default).
* lambda_ax and h_w/T_w: equipment (the case), like Dax.  T at the inlet: a
  thermal Danckwerts (an imposed enthalpy flux on face 0), dT/dz|N = 0.
* Datum: irrelevant to the ODE (only DT enters); the LEDGER prices everything on
  the canonical surface (2.2) — there is no thermal integration outside it.

### 2.2 Ledger (DECIDED)

* Kind **`adsorption`** (reserved in contract §2, activated here):
  `E = Sum_i (-dH_ads,i) . D(m_ads.q_i)` per segment — an EXACT state difference
  (Hess), never a quadrature; validity requires dH_ads on ALL active pairs,
  otherwise a NAMED gap.
* Inventory sensible heat: `H(end state) - H(start state)` on the canonical
  surface (gas) plus `m_ads.cp_s.DT` (solid, because the solid has no H surface —
  declared as its own ledger leg with the curated cp_s).  Wall/jacket: kind
  `heatLoss` (already reserved).
* A3's `energyLedgerGap()` ("isothermal ... A4") dies in this slice; batch09
  gains the adiabatic variant with the balance AVAILABLE.

### 2.3 A4-energy anchors (NUMBERS)

* **T1 — adiabatic lumped (batchAdsorber + energy):** batch09 (1 kg 13X,
  V = 0.01 m3, n0 = 2 mol CO2, T0 = 298.15) with `cpSolid = 920 J/kg/K`
  (DECLARED case-local as TEST data — curating the real value is Vitor's) and
  cp_g,CO2 = 37.1 J/mol/K: the inventory+energy fixed point
  (n_gas + m.q = n0; T = T0 + (-dH).q.m/(m.cp_s + n0.cp_g); q* at the new T)
  converges to **T_inf = 366.983377 K (DT = 68.833 K),
  q_inf = 1.52075875 mol/kg, p_inf = 146229 Pa** — physically right: hot adsorbs
  LESS than the isothermal 1.9708.  Gate 1e-6 relative.
* **T2 — exact isothermal duty:** already pinned today
  (Q = 1.970838025 x 45000 = **88.68771113 kJ** — the existing KPI); under A4 it
  becomes an `adsorption` ledger record with the balance closing.
* **T3 — reduction:** `dH_ads = 0` on all pairs (case-local test records) plus
  adiabatic => T constant, and the bed reproduces the isothermal A3
  BIT-IDENTICALLY (same goldens) — the non-regression gate.

---

## Part 3 — A5/A6: the step machine, invariants and CSS (SPEC, not code)

### 3.1 Steps and transitions (DECIDED)

* The sequencer IS choupoBatch's recipe layer (contract §9): a step =
  {a duration OR an end event; the BCs at each end of the bed}.  Minimal
  vocabulary: `pressurize` (inlet: P_feed as a ramp or a value, outlet CLOSED —
  face N with u = 0), `adsorb` (flow in / P_out), `blowdown` (inlet CLOSED,
  outlet at low P), `purge` (REVERSED flow — inlet closed, face N fed by another
  bed's product), `equalize` (two beds connected: the common face's flow from the
  declared valve's Ergun, `u = f(DP between the tops)`, with PAIRWISE
  conservation), `heat`/`cool` (A6: T_w or T_feed on a ramp — the existing
  `setParameter`).
* **Transition invariant:** the bed's state (c, q, T, P) is CONTINUOUS across any
  transition — steps only swap BCs; NO transition re-initialises state.  Matter
  transferred between beds (purge/equalize) is ledgered in BOTH (the existing
  TransferRecord); ownership: the stream belongs to the PRODUCING bed over the
  interval, as in the fractal.
* The bed does not know which step it is in (contract §9) — it receives BCs.

### 3.2 CSS (DECIDED)

```
err_css(n) = max_{field in {c_i, q_i, T}, cell j} |Y_n(j) - Y_{n-1}(j)| / scale(field)
scale: c -> c_feed,i (or c_tot,feed if a trace);  q -> q_sat,i;  T -> the declared DT_swing
```

evaluated at the START of a cycle; the tolerance is DECLARED in the case;
`maxCycles` is declared — reaching it without converging is a NAMED FAILURE
(never report averages from a non-converged cycle; the driver refuses as it
refuses a LEAK).  Cycle KPIs (recovery, purity, productivity, specific
consumption) ONLY after CSS.

### 3.3 Acceptance vectors (DECIDED as the target; the numbers come with the implementation)

* **A 2-bed Skarstrom PSA, H2/CH4** (activated carbon from the catalogue): the
  equilibrium psa01 is the IDEAL LIMIT — the cycle's recovery/purity must
  converge BELOW that limit with a D explained by LDF + dispersion + purge
  (report the decomposition; never calibrate against psa01: it is a limit anchor,
  not an oracle).
* **A 2-bed TSA, CO2/13X**: the cycle average against the steady `tsaTwinBed`
  algebra (packet 118.5) — same status: an upper limit, with the deficit closing
  as t_cycle -> large and k -> large (an asymptotic check, the anti-circularity
  #123 asks for).

---

## Part 4 — Audit and implementation sequence

**CLOSED decisions:** everything above plus contract §1-§9.  **Open (not
blocking):** the curated cpSolid / d_p value per adsorbent (Vitor's curation;
the tests use declared case-local values); Dax / lambda_ax correlations as
curation aids; a banded-FD Jacobian (only if the cost profile asks for it);
dual-site/IAST (out of scope, #122).

**Commit sequence (each one whole, a green corpus, new goldens):**

1. `tsaTwinBed` steady (packet 118.5 — algebra, independent of A4);
2. the teaching-only curatorial slice of the 15 records (#122 — tokens of the
   existing Origin enum, an anti-design-grade advisory, a gate);
3. A4-flow in `fixedBedAdsorber` (files: FixedBedAdsorber.{H,cpp}; the
   adsorbent's identity gains optional d_p/phi plus the parser; anchors F1/F2/F3
   as the tutorials batch16_ergun_profile / batch17_dilute / a re-recorded
   batch13; `declaredMaterialResidual()` empties HERE);
4. A4-energy (the same files plus BatchAdsorber.{H,cpp} for T1; cpSolid in the
   identity reader with its refusal; kind `adsorption` in main.cpp's ledger;
   T1/T2/T3 as batch18_adiabatic_uptake + a batch09 variant + the reduction
   gate);
5. A5 steps + CSS (the recipe layer plus a coordinating `bedPair` for
   equalize/purge; Skarstrom as a plant/ or batch/ case with 2 beds);
6. A6 TSA (ramps — almost entirely case files and goldens).

*Author: Claude (autonomous loop), 2026-07-13, under #123's budget.  The anchors'
numbers are reproducible from the included Python snippets.*
