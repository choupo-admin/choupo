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
  system **from the permeate face back to the wall** (the film model, per
  ion, gives the wall); arrival residuals for all ions but the one carrying
  the most charge, plus permeate electroneutrality; forward-difference
  Jacobian, the step halved until every concentration stays positive and
  then backtracked on the residual norm.  The first version shot from the
  wall TOWARD the permeate and it converged on the two witnesses' operating
  points and almost nowhere else — §7 is where that was found, and why the
  direction matters.  The potential
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

Sabotages of the 2026-09-15 figure arms (h)–(j), fired by hand and restored:

| # | sabotage | result |
|---|----------|--------|
| F1 | the shot direction reverted to wall → permeate (rebuilt) | CAUGHT, structurally: with 320 RK4 steps the forward shot now fails on the NaCl WITNESS itself ("did not converge … residual 1.77e+00 at J_w = 3.0e-05"), so the gate stops at "the case did not run" — finer steps make the forward shot WORSE, because the virtual ionic strength it divides by is smallest exactly where it lands. |
| F2 | a Table 1 trace permeance perturbed in the gate (MgSO4 NO3 41.9 → 30 µm/s) | CAUGHT by (h): MgSO4/NO3 at 43.1 µm/s, engine 1.190 vs line 0.916 (29.9 %, band 12 %). |
| F3 | one digitised line moved +20 % (Na2SO4/Cl) | **SURVIVED**, at 11.7 % against a 12 % band: the engine sits +6 % above that line, so raising the line by 20 % lands at −12 %.  The same shift the other way (F3b, −20 %) is caught at 32 % and 35 %.  The bands are one-sided by the measured residual; recorded, not tightened. |
| F4 | Fig 2a's line rewritten as Eq. (1) with P_s = 6.1 | CAUGHT by (j): "the recorded gap has closed; take this pin back". |
| F5 | the 2e-4 M probe of arm (i) built in the trace limit | CAUGHT by (i): all three ratios exactly 1.00. |
| F6 | RK4 steps 320 → 40 (rebuilt) | **SURVIVED**: the bands are 5–14 % and the 40-step discretisation error is 2.4e-3.  The step count is pinned by membrane13's golden (four rows at 1e-4), not by this gate. |
| F7 | one row dropped from the CSV | CAUGHT by the exact count (105 of 106); the first cut of that arm said `< 100` and let it through. |

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
* A comparison against the paper's measured SYMBOLS (they are in the CSV of
  §7; the model is held to the authors' fit, and the symbols scatter about
  it by the authors' own residual, which is theirs to explain).
* Rebuilding `gui/public/wasm/` — no emscripten in this container; the site
  will not run the law until the next `make wasm`.

## 7. The figures, digitised — and what the comparison found (2026-09-15)

Vítor asked whether the points of the figures could be taken off.  They
could: the publisher serves the eight panels at 2460 px, and
`bin/curate/digitise_fdl2021.py` reads them — axes calibrated from the axis
lines and VERIFIED against the tick-label centroids (they map back to 0, 10,
20 … within a few hundredths), markers separated from lines by a
morphological opening, a second pass for markers half-hidden under another
series' marker (flagged, with a larger reading error), the position the
centre of the bounding box, the drawn line read locally under each marker,
Fig 3b's three arrows blanked by declared rectangles.  106 points in 16
series, in `membrane12_sdem_nf270_nacl_traces/constant/experimental/fdl2021_figures.csv`
(the tree's home for measured data a case carries), each
with its reading error; the images stay out of the tree (`data/local/`).

**What the lines are.**  The symbols are the measurement (CP-corrected);
the lines are the authors' SDEM fit — Eq. (1) for the salt, Eq. (3), the
ANALYTICAL TRACE-LIMIT solution, for a trace — with the permeances of
Table 1.  So the sharp test of the engine is against the LINES (same model,
same parameters, ONE answer), and the symbols are context.

**Finding 1 — the engine did not converge over most of the range.**
Driving the feed pressure so the engine's flux equals each figure's J_v,
the two witnesses' own operating points (4 bar) converged and the rest did
not: MgCl2 at ≥ 4 bar, Na2SO4 at ≤ 4 bar, MgSO4 at 1.8, 2.5 and 8 bar,
"inner Newton, 59 iterations, residual 1.4e-1".  A log-variable Newton with
Armijo backtracking did not help (it crept and failed elsewhere — measured
in a Python replica of the C++ over 24 (feed, flux) pairs).  The cause was
the DIRECTION of the shot.  Shot from the wall, a well-rejected salt's
profile has to land on a permeate value a hundred times smaller than where
it started, and the field it divides by, `−(Σ z j/P)/(Σ z² c)`, is smallest
exactly there; every error is compared against the tiny target.  Shot
**from the permeate face** the state at the start IS the unknown, the ionic
strength there is known exactly, and the concentrations grow toward the
wall — the stable direction.  28 of 28 (feed, flux) pairs converge in 3–7
iterations from the uncoupled seed; where both directions converge they
agree to the last digit at fine steps.  The engine had been RIGHT on both
witnesses and unable to say so anywhere else: a witness at one operating
point is not a sweep.

**Finding 2 — 40 RK4 steps was too coarse for a golden at 1e-4.**  The
forward and backward shots disagreed by 1e-3 relative on membrane13's
R_NO3 at 40 steps, which is the discretisation error, not the physics
(measured against 80…1280 steps: 3.4e-4 absolute at 40, 1.4e-7 at 320, both
directions identical from 640 on).  The step count is 320 now, and
membrane13's golden moves on four rows by ≤ 1.3e-3 relative (R_Na, R_NH4,
R_NO3, membranePotential_mV_avg); membrane12's does not move at 1e-4.

**Finding 3 — the engine reproduces the paper's lines in the trace limit,
and NOT at the paper's own trace concentration.**  With the traces at 1e-3
of 2e-4 M the engine's f = 1/(1−R) sits within 2–8 % of the drawn lines on
every series whose permeances the paper determines (MgSO4: Na +5 %, Cl −2…−7
%, NO3 −3…−9 %; MgCl2: NO3 +2…+8 %, Na −1…−3 %; Na2SO4: Cl +1…+8 %, NO3 −2
…−4 % above 10 µm/s; NaCl: NO3 −8…−1 %).  At 2e-4 M the sulfate series were
25–60 % off, all in ONE direction — trace cations rejected less, trace
anions less negatively — which is a WEAKER field.  The reason is the paper's
own caveat ("trace ions cannot be accounted as authentic traces"): 2e-4 M
of NO3⁻ at 42 µm/s carries more anion current than 0.01 M of SO4²⁻ at 0.13
µm/s, so the traces relieve the field the analytical trace-limit fit
assumes they do not touch.  On MgSO4 at 34.7 µm/s the engine's NO3 f is
1.37× its trace-limit value and the trace cations' 0.45×.  That is the size
of what the fit neglected, it is a lesson for a student (a trace is not a
trace when the dominant anion is 100× slower), and it is pinned as one.

**Finding 4 — two of the paper's permeances are bounds, and the lines say
which end.**  NH4⁺ under NaCl is given as "> 60, the fit became
insensitive"; the engine at 60 µm/s sits 8–24 % ABOVE that line and meets
it at ~1000 µm/s (measured 60/120/300/1000: f 6.34/5.73/5.37/5.21 against
the line's 5.22 at 36 µm/s) — the fit was insensitive because it had
already saturated.  NH4⁺ under Na2SO4 depends on Na⁺'s permeance, which the
paper calls "orientative": at 27 µm/s the engine's NH4 f moves 64 → 119 →
141 as P_Na goes 0.8 → 3 → 10 µm/s.  Neither is held by the gate, and the
gate says so.

**Finding 5 — Fig 2a's drawn line is not Eq. (1) with Table 1's P_s.**
For MgCl2 the table gives 6.1 µm/s; Eq. (1) then reads 8.3 at 44 µm/s and
9.6 at 52.5, off the top of the axis, while the drawn line (and the
measured points under it) read 5.5 and 6.1.  The points imply an apparent
salt permeance rising from 7.0 to 10.3 µm/s.  The text calls the fit
"linear" and "quite good".  The engine agrees with Eq. (1) and the
ambipolar identity (both dominant ions, within the not-a-trace correction),
not with the drawn line; the gap is PINNED (arm (j)) and not tuned, and it
is the source's to explain.

Everything above is in `check_sdem` arms (h)–(j): 18 (salt, trace, flux)
points across all four dominant salts against the drawn lines, the
not-a-trace ratio, the Fig 2a pin, and the CSV's exact shape — five
seconds, probes built from the NaCl witness with the Table 1 rows.

**The Tutorials Guide carries this comparison as a validation section**
(`docs/tutorialsGuide-sdemValidation.tex`, written for the paper's authors to
check), its seven tables GENERATED by `bin/curate/gen_sdem_validation.py` from
the engine and the digitised CSV and held fresh by `--check` in
`bin/runTests` (`sdem-tables-gate`).  **The same generator draws the
comparison as ONE figure** (`docs/tutorialsGuide-sdem-figure.tex`, four
pgfplots panels, one per dominant salt, f against J_v on a log axis: measured
markers with their reading error, the paper's line dashed, Choupo trace-limit
solid, Choupo at the paper's feed dotted) from the same points as the tables,
in the same pass, held fresh by the same `--check` — asked for by Vítor on
2026-09-15 ("um gráfico a comparar as previsões do Choupo com as do Andriy").
Trap paid for: `ymode=log` inside a `\pgfplotsset` style is refused by
pgfplots at `\end{axis}` ("I do not know the key /tikz/ymode"); the panels
use `semilogyaxis` instead.

**The Theory Guide carries the law itself** (chapter *Nanofiltration without
a fixed charge: solution-diffusion with one electric field (SDEM)*,
`docs/theoryGuide.tex`, label `ch:sdem`, added 2026-09-15 after Vítor asked
for it): the equations, the ambipolar single-salt limit DERIVED rather than
quoted, a closed form for the membrane potential of a single salt
(`Δψ = (P₊ − P₋)/(z₊P₊ + |z₋|P₋) · ln(c_m/c_p)`) that the engine reproduces to
0.1 mV on both witnesses once their traces are reduced a thousandfold — and at
the paper's own trace level does NOT (34.2 vs 35.1 mV on NaCl, 24.2 vs 44.4 mV
on MgSO4), which is the not-a-trace lesson of §7 stated as a number a student
can recompute.  The solution-diffusion chapter's "where the model ends" box
now names SDEM beside DSPM-DE.
