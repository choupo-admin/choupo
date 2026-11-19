# Flow curves, form 3 of the property door (C421 (7)): moved goldens and the evidence

Branch `build/last-flowcurve`, cut from `origin/integ/final-1118` (9a52244dc).  Design record:
`docs/design/measured-facts-materials-and-flow-curves.md`, section 4 and rules R7-R10.  Book:
Chhabra & Richardson, *Non-Newtonian Flow and Applied Rheology*, 2nd ed.; pages below are PRINTED
pages, read on the page images (PDF page = printed + 6).

## 1. Goldens moved: none

No existing golden row moved, and none was re-recorded.  Why that is credible, by reach:

* `ThermoPackage::viscosityLiquid` gained one guard on its opening line, `flowCurveFor(x)`; with no
  `rheology` block the member vector is empty and the function returns `nullptr` before anything else.
* `Pipe::solve` gained one block taken only when `flowCurveFor(z)` is non-null; the Newtonian path is
  the lines it was.
* The transport grammar gained `liquid { rheology { measured } }`; no existing case writes it.
* `liquidProperty::apparentViscosity` is a new function; nothing existing calls it.
* `bin/runTests --scope` over `tutorials/steady/{hydraulics,heat,rotating,membranes,drying}` (every
  case that prices a liquid viscosity through the door): PASS 79 / FAIL 0 / KNOWN-BROKEN 0 /
  EXPECTED-FAIL 4 (the four refusal cases below), with the mass, element and energy closure gates
  scoped to the pass.  No full sweep, no `--nightly`, no `--fast`, as ordered.

## 2. New golden rows (self-recorded) and anchors (the book's printed numbers)

Every anchor row below is AUTHORED against the book (`--record` copies it verbatim and never
refreshes it); the independent column is a Python recomputation that shares no code with the engine.

| case | quantity | engine | independent | book (page) | row |
|---|---|---|---|---|---|
| pipe04 (Ex. 3.1) | -dP, Pa | 110 128.78 | 110 128.77 (eq. 3.9 closed form) | 110 kPa (p. 115) | anchor, 2e-3 |
| | V, m/s | 1.31601 | 1.31601 | 1.32 (p. 115) | anchor, 5e-3 |
| | wall stress, Pa | 68.8305 | 68.8305 | not printed | self-recorded |
| | Re_MR | 216.389 | 216.389 | not printed | self-recorded |
| pipe05 (Ex. 3.3) | tau_w, Pa | 29.3359 | 29.3359 (numeric integral of eq. 3.46) | 29.31 (p. 123; from phi rounded to 0.58) | anchor, 2e-3 |
| | -dP, Pa | 1.46679e6 | 1.46679e6 | 1.46e6 (p. 123) | anchor, 1e-2 |
| | phi = tau_0/tau_w | 0.57949 | 0.57949 | 0.58 (p. 122) | anchor, 1e-2 |
| | plug radius, m | 0.0115899 | R tau_0/tau_w | 11.6 mm (p. 123) | anchor, 1e-2 |
| | plug velocity, m/s | 0.619249 | eq. 3.40 closed form 0.6192 | 0.62 (p. 123) | anchor, 1e-2 |
| pipe06 (case's own numbers) | f_Fanning, tau_w, dP | 0.0045898, 20.654 Pa, 82.616 kPa | 0.0045898, 20.654, 82.616 (Dodge-Metzner eq. 3.73 solved by bisection in Python) | none: the book prints no turbulent power-law example in closed form | self-recorded |
| agitation01 (Ex. 8.5) | P, kW | 9.83273 | 9.83273 | 9.84 (9838 W, p. 418) | anchor, 1e-2 |
| | gamma_avg, 1/s | 4.55762 | 4.55762 | 4.56 (p. 417) | anchor, 5e-3 |
| | mu_app, Pa s | 93.6830 | 93.6830 | 93.7 (p. 417) | anchor, 5e-3 |
| | Re | 6.97668 | 6.97668 | 6.98 (p. 418) | anchor, 5e-3 |
| | K_p (eq. 8.7) | 494.401 | 494.401 | 494 (p. 418) | anchor, 5e-3 |
| | D, m / N, Hz | 2.09524 / 0.151921 | | 2.095 / 0.152 (p. 417) | anchor, 5e-3 |

The book's 9838 W is the engine's 9832.7 W within 0.06 %: the book rounds N to 0.152 Hz and Re to 6.98
before multiplying.  The case feeds the PRIMARY inputs (D_T, the clearance ratio, the tip speed) and not
the book's rounded intermediates.  The extra row of Ex. 8.5, `Re_cr = 183/Po^(1/3) = 44`, is
reproduced (44.22) and is what lets the vessel call the flow laminar.

Energy: agitation01 publishes `W_shaft_kW = 9.83273` (a Work item, `src/result/EnergyItems.H`) and the
jacket's duty `Q_kW = -9.83273`; `globalEnergyBoundary` residual 0.0000 kW.  Run adiabatic (by hand, not a
shipped case) the outlet warms to 452.346 K, `Q_boundary = W = 9.83273 kW`, residual 0.0000 kW.  Mass
and element closure 100.000 % in every shipped case.

## 3. The refusals (each a shipped `.expect-nonconvergence` case; messages as printed)

* pipe07: `Re_MR = 28924.9 >= 2100 ... REFUSED (R9): turbulent non-Newtonian flow has no method until the
  case declares one -- operation { turbulent { method DodgeMetzner; } } ...  the published methods differ
  by up to +-50 % (p. 150-151)`.
* pipe08: `R8 -- these readings are refused as a flow curve: the correction endEffects is not declared in
  conditions { corrected ( ... ); } for a capillary: the Bagley end-pressure correction ...`.
* agitation02: `the flow curve powerLawEx85 has a yield stress (10 Pa, ...): REFUSED (R9). The
  average-shear-rate concept needs a single k_s, and with a yield stress there are unyielded regions ...
  (p. 395-396)`.
* agitation03: `the flow curve powerLawEx85 is shear-THICKENING (d ln tau / d ln gamma reaches 1.3 (> 1) ...):
  REFUSED (R9) ... "the impeller draws enormous power ..." (p. 396)`.

The suite counts these as EXPECTED-FAIL; it does not compare their messages (a gap in the suite, not in
this slice: no gate pins a refusal's words).

## 4. Where the design record turned out wrong, or silent

* **Example 8.5 is outside the data range of the correlation it uses.**  Eq. 8.7 was fitted to
  0.88 <= H/D <= 1.30 (p. 386); the example takes H/D = 1.5 (p. 417).  The engine refuses a geometry
  outside the window unless the unit declares `outsideCorrelationWindow { reason }`; the witness declares
  it, with the reason, and the run says so.  The design record did not foresee that its own anchor example
  breaks a window the book states.
* **R7 says the pipe's shear is "from its velocity and diameter with the correction for the curve's local
  slope".**  The exact route needs no local slope at all: eq. 3.46 integrates the curve's inverse.  The pipe
  does that and computes n' only as a report (and for the declared turbulent method).  What the record did
  not say, and the book makes explicit, is that eq. 3.46 needs the curve FROM ZERO STRESS: a table does not
  give it.  The pipe takes the chord of the first segment below the lowest measured rate and PRINTS the
  share of the flow that stands on it (`tailShare`; 0 in the witnesses, whose rows reach 0.01-0.1 1/s).
* **R10, "a named WORK stream".**  The tree has no work stream for a pump either: a pump's shaft power is the
  KPI `W_shaft_kW`, an energy item of kind Work.  The vessel does the same.  The energy wire
  (`energyInputs`/`energyOutputs`, turbine to generator) exists but is a source-side port; nothing produces
  a stream a vessel would consume.  Reported as built, not as the record words it.
* **Where the power lives.**  The power is the UNIT's.  The `stirredTank` sizer runs after the pass and
  cannot put work into an energy balance.  The `cstr` was not given an agitator (1444 lines, two thermal
  paths, an energy residual that already carries a closure variable): a new unit `agitatedVessel` instead.
  The helper that gives the power (`agitation/Impeller.H`, the Metzner-Otto and K_p arithmetic) is not
  vessel-specific and can be called by the CSTR later.
* **A flow curve is one state.**  The book (p. 319) says the consistency index follows an Arrhenius law in
  temperature and n is nearly constant; the design record asks R4 (conditions are part of the identity).
  Built as the record says: a record states the T and composition it was taken at, the box is the stated
  point unless the record widens it with a reason, and a state in the widened box away from the stated
  point is announced as a constant-state approximation.  No temperature shift law is carried.
* **Door property name.**  The apparent viscosity is recorded under the property `liquidViscosity` with the
  source `flowCurve.<name>`, not under a new property word, so the declared-property table of
  `PropertySourceDeclarations` needed only the new unit's row.

## 5. What was NOT built

* A power CURVE table for the transitional range (refused by name instead), the cavern model for yield-stress
  fluids (eq. 8.12), mixing time and heat transfer in the vessel, an agitator on the `cstr`.
* Bingham/Hanks and Slatter transition criteria, Tomita and Darby turbulent methods, non-circular ducts.
* Temperature dependence of a flow curve; a suspension viscosity-concentration law; time-dependent and
  viscoelastic fluids (refused).
* `bin/runTests --gui`, the WASM rebuild and the Explorer: not run (see the report).
