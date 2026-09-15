# Electroneutrality without a new parameter — the `SDEM` transport law

*2026-09-15.  Vítor's question, verbatim: "Não há forma de forçar a
electroneutralidade no modelo do B?  De forma criativa?  É que não se pode
andar a aumentar o número de parâmetros porque o modelo fica melhor mas
depois não há dados!"  Authorised the same day: "Avança com esse e tenta
arranjar um paper para validação."*

## 1. What was measured before anything was built

`spiralWoundModule` delegates the local flux problem to a transport law;
`solutionDiffusion` is the default.  On an ION-declared feed (Ca Mg Na K Cl
SO4 HCO3 + water, each ion a component with an `aqueousMapping`) it gives
every ion its own `B_s` and couples nothing.  Read on `membrane07`'s
`converged/` streams, Σz·F as a fraction of the cation equivalents:

| stream    | imbalance |
|-----------|-----------|
| feed      | −0.353 %  (the water analysis itself) |
| retentate | −0.352 %  |
| permeate  | −0.822 %  |

The half-percent the permeate gains is the coupling the law does not have.
The engine said so — but only inside `if (doScaling)`, so an ionic case
without a `scaling{}` block ran silent (the 2026-09-07 shape: an announcement
inside a conditional that is not the condition of the fact).

`DSPM-DE` imposes electroneutrality at both faces, by bisection on the
permeate Donnan potential — but with `X_d = 0` it calls `permAt(0.0)` and
imposes nothing, and a failed bracket silently uses the midpoint.  Neither
is exercised by a corpus case (both DSPM-DE cases declare `chargeDensity −5`).
Recorded in task #165; NOT fixed here.

## 2. The idea, and why it costs no parameter

Every ion diffuses in the membrane with its own permeance, but the ions share
ONE electric field.  Add one state variable per station — the dimensionless
potential ψ across the active layer — and one constraint the uncoupled law
never imposed — zero electric current.  The count of parameters is exactly
the record's per-ion permeances, as before.

The formulation is Yaroshchuk's solution-diffusion-electromigration model
(Yaroshchuk, Bruening & Licón Bernal, *J. Membr. Sci.* 447 (2013) 463–476;
the ternary analytical solution: Yaroshchuk & Bruening, *J. Membr. Sci.* 523
(2017) 361–372): Nernst-Planck on *virtual* concentrations (the bulk
solution that would be in equilibrium with each point inside the membrane),

    j_i = −P_i (dc_i/dx + z_i c_i dψ/dx),   Σ z_i c_i(x) = 0,   Σ z_i j_i = 0,
    j_i = J_v c_p,i

so that `dψ/dx = −(Σ z_i j_i/P_i)/(Σ z_i² c_i)` — an algebraic consequence of
the two constraints, with nothing to fit.

**Two things that were settled by reading rather than remembering.**

*The partition coefficient.*  Vítor asked whether one is needed.  It is not:
the permeance `P_i = D_i K_i/δ` already contains it — exactly as `B_s` does
in the solution-diffusion law — because the Nernst-Planck equation is written
on virtual concentrations.  A separate `K` is needed only under fixed charge
(a Donnan jump at each face: that is DSPM-DE) or under electroneutrality
imposed INSIDE the membrane (TMS).  SDEM assumes neither.

*Constant field or not.*  The first draft of the proposal was a Goldman
(constant-field) integration.  The manuscript of the 2017 paper says
otherwise: the virtual solution is electroneutral at every `x`, and the
field follows from that.  The two formulations differ, and the difference is
checkable: only the Yaroshchuk formulation collapses a single salt EXACTLY to
the classical `R = J_v/(J_v + P_s)` with the ambipolar salt permeance

    P_s = (z₊ + |z₋|) P₊ P₋ / (z₊ P₊ + |z₋| P₋).

That identity is the answer to "depois não há dados": each single-salt test
— the measurement manufacturers and the literature actually publish — gives
one equation in the ion permeances.  Seven ions, seven salts; an eighth
over-determines and checks.

## 3. The validation source

Fernández de Labastida & Yaroshchuk, *Membranes* 11 (2021) 272,
doi:10.3390/membranes11040272, **CC BY 4.0** (full text read from Europe PMC,
PMC8068212).  NF270 flat discs in a rotating-disk cell (CP corrected to
intrinsic rejections), dominant salt 0.01 mol/L, trace salts 2·10⁻⁴ mol/L,
20 °C, 2–14 bar.  Table 1 gives, per dominant salt, the salt permeance and
the SDEM-fitted ion permeances (µm/s):

| dominant | P_s  | Na⁺    | Mg²⁺ | NH₄⁺ | Cl⁻  | NO₃⁻ | SO₄²⁻ |
|----------|------|--------|------|------|------|------|-------|
| NaCl     | 7.5  | 20–113 | –    | >60  | 3.9  | 13.8 | –     |
| MgCl₂    | 6.1  | >250   | 3.7  | >700 | 9.3  | 16.9 | –     |
| Na₂SO₄   | 0.16 | >0.8   | –    | >100 | 3.4  | 9.8  | 0.06  |
| MgSO₄    | 0.23 | 79.4   | 0.9  | 80   | 15.7 | 41.9 | 0.13  |

The ambipolar identity recomputed from the ion columns: NaCl 7.54 (with Na at
113), MgCl₂ 6.18, Na₂SO₄ 0.157, MgSO₄ 0.227 — all four within the table's
rounding of the P_s column.  This is the check `check_sdem` (b) runs in
Python, independently of the engine, on all four rows.

The paper's per-point rejections are in its figures and were NOT
transcribed; what its text states is used as sign anchors: under NaCl,
NO₃⁻ below 50 % and lightly negative at small flux, NH₄⁺ 40–80 %; under
MgSO₄, Cl⁻ from −70 % at small flux to +60 %, NO₃⁻ negative over the whole
range (−151 % to −5 %), trace cations rejected.

## 4. What the engine does now

* `src/unitOperations/membrane/transport/SDEM.{H,cpp}`, registered as
  `transport SDEM;`.  Per station: an outer Newton-1D in `J_w` (osmotic
  back-pressure, as the baseline) around an inner Newton in the permeate
  composition, each residual a fixed-step RK4 shot of the Nernst-Planck
  system from the wall (film model, per ion) to the permeate face; landing
  residuals for all ions but the one carrying the most charge, plus
  permeate electroneutrality; forward-difference Jacobian.  The potential
  drop is integrated alongside and published — profile column `psi_mV`, KPI
  `membranePotential_mV_avg` (34 mV on membrane12, 24 mV on membrane13).
* Refusals by name: no aqueous bridge on a solute; no permeance for an ion;
  a feed that is not electroneutral (the FilmTec protocol's precondition —
  `aqueousAnalysis {}` reconciles one); fewer than two ions.
* Announced: the model and its assumptions once per run; the per-ion,
  field-free polarisation film as an approximation (`AdvisoryLog`).
* The uncoupled law's silence closed: `solutionDiffusion` on ≥ 2 ionic
  solutes announces `per-ion solution-diffusion without charge coupling` on
  every such case, `scaling{}` or not, and names `transport SDEM;`.
* `constant::F` (Faraday, CODATA 2018 exact) added to `core/Constants.H`.

Witnesses: `membrane12_sdem_nf270_nacl_traces` (NaCl 0.775 against the
single-salt law's 0.774 at J_v = 25.9 µm/s; NO₃⁻ 0.31; NH₄⁺ 0.78) and
`membrane13_sdem_nf270_mgso4_traces` (SO₄²⁻ 0.992; NO₃⁻ **−0.15**; Cl⁻ +0.40;
Na⁺ and NH₄⁺ 0.67).  Permeate charge on both: 3·10⁻¹¹ of the equivalents.

## 5. Sabotages, observed

| # | sabotage | result |
|---|----------|--------|
| S1 | the electroneutrality residual `F[drop]` set to zero | CAUGHT — but STRUCTURALLY: the inner Newton's system loses its last equation and refuses to converge ("did not converge … residual 3.3e-01"), so the gate fails on "the case did not run", not on arm (a).  Recorded as measured: arm (a) has not been shown to fire on its own. |
| S2 | the field zeroed (`dψ/dx = 0`) | CAUGHT — also structurally: with no field the landing residuals and the electroneutrality equation are inconsistent and the inner Newton stalls at 4.6e-04.  Arm (d)'s negative-rejection check was not the arm that fired. |
| S4 | the record's Cl⁻ permeance 3.9 → 8.0 µm/s | CAUGHT by (b) (the record no longer ships the table's value) AND by (c) (engine R 0.639 against the law's 0.779) — two independent arms, as intended. |

The honest reading of S1/S2: this law's structure makes the two constraints
LOAD-BEARING — remove either and the local problem has no solution — which
is a stronger guarantee than a check, and is why a behavioural sabotage of
(a) needs a law that converges to a wrong answer, which this one cannot be
made to do by deleting a line.

## 6. Not done, named

* The DSPM-DE `X_d = 0` branch and its silent midpoint (task #165).
* A polarisation film with a field (the diffusion potential exists there
  too); this version's film is per ion and announced as such.
* Concentration-dependent permeances (outside the model).
* `batchDiafilter` accepts `transport SDEM;` through the same factory and
  was not exercised.
* A pressure sweep reproducing the paper's rejection-vs-flux figures — the
  measured points would have to be transcribed from the figures first.
* Rebuilding `gui/public/wasm/` — no emscripten in this container; the site
  will not run the law until the next `make wasm`.
