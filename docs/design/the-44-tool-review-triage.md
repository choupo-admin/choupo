# The 44-tool external review, triaged (2026-09-28)

Vítor forwarded an external pedagogical review of the 44 EduTools (a synthesis
plus one analysis per tool, written against commit `1dbabb16`; the archive is
the reviewer's text and is not committed).  His instruction: analyse it
critically, as the architect responsible, not as a transcriber.  This record is
the result.  It is DEV.md commission C22.

## Method

Every claim that our TEXT, a FORMULA, a NUMBER or the CODE is wrong was checked
against the current lesson source and, where the page cites engine behaviour,
against the engine, with the algebra redone rather than trusted.  Four
read-only verifications ran in parallel (05–14, 15–23, 24–34, 35–44); the
commander spot-checked at least two confirmed findings per batch in the source
before accepting the batch.  01–04 and 11 were acted on the same day (C17–C21)
and are not repeated here.

Four verdicts: **CONFIRMED** (wrong as written; fix it) · **REVIEWER WRONG**
(the page already says it, or the claim is false) · **SOFTEN** (true in its
domain, stated more absolutely than true; add the condition) · **MISSED**
(a real defect the reviewer did not see).

## What was decided about the review itself

- **The uniform nine-section template for all 44 tools is NOT adopted.**  It is
  a total rewrite, the review observed no student, and it collides with rulings
  already made (one page, one mental model; the method-construction tools have
  a different audience).  Organisation and progression are Vítor's decisions;
  the per-tool pedagogy lines below are recorded for him, not acted on.
- **The review's own evaluation proposal is the sound part:** pick three tools,
  observe students on a short task, revise, re-test with equivalent numbers.
  That is Vítor's to run.
- **Worth a candidate slot:** visually distinguishing four statuses on every
  page — measured datum, model result, in-browser didactic arithmetic, declared
  hypothesis.  It matches the provenance doctrine and is ONE shared component,
  not 44 rewrites.  Not commissioned.
- "Agreement between implementations or closure of an identity is
  verification, not validation" is already this project's rule
  (`docs/architecture/verification-and-validation.md`).

## Confirmed errors in the lesson text, by damage

Paths are under `gui/src/ui/methods/` unless stated.  Line numbers are as of
`9ec28e63c`.

**Physics or a formula stated backwards**
- Ponchon–Savarit `ponchonLesson.ts:160-161`: moving the difference point away
  RAISES the reflux (L/V → 1 at Δ_D → ∞), the page says it falls.
- Approach to equilibrium `approachToEquilibriumLesson.ts:326-327`: a steep
  equilibrium curve makes a 10 K approach a LARGE shortfall, not a small one.
- Element potentials `elementPotentialLesson.ts:282-284`: a phase belongs when
  its potential is no LOWER than its standard state (engine: ln a_s > 0,
  `GibbsSolidPhase.cpp:105`); the page says "no higher".
- Wegstein `wegsteinLesson.ts:297-298`: q = −1 is a double step (2G − x), not
  a 50/50 blend; `:215-216`, `:283-286`, `:294-296` (direct substitution is not
  "never wrong"; it diverges for |G′| > 1), `:340` vs `:333-334`.
- McCabe–Thiele `mccabeLesson.ts:140-141`: q defined "to saturated LIQUID"
  gives q = 0 for a saturated liquid; the derivation below says vapour.  Also
  `:53` (L̄ = L + qF) and `:152-153` (q is not a fraction outside 0–1).
- Psychrometrics `psychroLesson.ts:149-150,246,254,282`: adiabatic
  humidification follows the adiabatic-saturation line (floor T_as), which
  coincides with the wet-bulb line only for Le ≈ 1 — the page says so
  elsewhere and contradicts itself.
- ε-NTU `epsilonNtuLesson.ts:143-144`: a balanced counter-current exchanger at
  ε → 1 generates no entropy; and ε is capped by the SECOND law (`:84-85`),
  not the first; `:250` title contradicts the engine's refusal.
- LUB scale-up `lubScaleupLesson.ts:160-162,205-208` and
  `LubScaleupTool.tsx:512-513`: a truncated tail makes LUB a lower bound but
  the design lengths OVER-estimated; `:101-102` (linear isotherm spreads ∝ √t;
  ∝ t is the unfavourable case); `:111-112` vs `:330-333`.
- Breakthrough `breakthroughLesson.ts:185` (LUB is unused capacity inside the
  zone, not a clean slice), `:263` (t_b bounds the switching interval; it is
  not the cycle time).
- Pump/system `pumpSystemLesson.ts:262,279`: NPSH counts suction elevation and
  friction twice when P_suction is a flange pressure.
- Merkel `merkelLesson.ts:149,170`: kJ/kg against J/(kg·K) — a factor 1000 on
  the step that says "check the units".
- Rayleigh `rayleighLesson.ts:64-65`: the area is ln(W₀/W), not the log of
  what was boiled off.
- Levenspiel `levenspielLesson.ts:148`: exit-height rectangles lie OVER a
  rising curve.
- Claus `ClausGibbsTool.tsx:212-215`: the 2 : 1 ratio did not "fall out of" the
  minimisation — the declared air rate and the O and H balances force
  H₂S = 2 SO₂; `:73-78,278` (the mass balance closes for any x), `:110` vs
  `:125` (N species vs total moles), `:125,137,140` (ln P, engine ln P/P°),
  `:114` ("the one real assumption").
- Sour water `SourWaterTool.tsx:80-82,98,111` (molality mixed with moles),
  `:97` (mass action without γ), `:196-198` and `:154-158` (the "top" column
  mixes tray 0 and tray 1), `:48,176` (validated against the paper's
  prediction, not a measurement).
- Declared pathways `declaredPathwaysLesson.ts:94` vs `:102`: ν as R×N and ν_ij
  as species-by-reaction (transposed).
- Local composition `LocalCompositionTool.tsx:212-217`: "exactly ideal" holds
  for NRTL only — Wilson's substitution is Λ = 1, UNIQUAC keeps its
  combinatorial term; `:63-64` (ethanol/water deviates positively).
- UNIFAC `UnifacTheoryTool.tsx:204-206` (a missing main-group pair CAN be
  regressed — it becomes a new named parameterisation), `:95` (Ψ indices),
  `:100-101` (T enters NRTL beyond one exponential), `:112` (X_m undefined).
- COSMO-SAC `CosmoSacTheoryTool.tsx:168-170` (contacts are Boltzmann-weighted),
  `:216-219,123` (α′, c_HB, σ_HB were regressed on mixtures), `:200` (φ, θ
  undefined).
- Property origins `PropertyOriginsTool.tsx:279-280` (an uncited ΔHf error
  band, withdrawn in the case header), `:99` (MW is not "a weighing"),
  `:122-124` (ω is DEFINED at T_r = 0.7; here it comes from Lee–Kesler),
  `:146-147,168` (no group sum is shown; ω is not Joback), `:107`.
- Property trust `PropertyTrustTool.tsx:289` (at T_b the P_sat is 1 atm by
  definition), `:310-313` (the gate named does not cover water or glycerol).
- Four ways `FourWaysMixtureTool.tsx:225`: not five models on one binary.
- Van Heerden `vanHeerdenLesson.ts:192-195,208-210` (the slope test is
  necessary, not sufficient — the page's own limit says so), `:216-218`
  (feedback control holds the middle state).
- Column control `columnControlLesson.ts:301-303,234-235` (T–x is one-to-one
  only for a zeotropic binary), `:225-227` (ΔT/Δu IS a finite-difference gain).
- Bode `bodeLesson.ts:290` (not every tuning rule is in that form),
  `:452-453` and `bodeMath.ts:383-385` (the lag comes from the zero-order hold,
  `DynamicDriver.cpp:1326-1327`, not from sampling).
- Tear streams `tearLesson.ts:137-138` (cycles are found on all edges, as the
  engine does, `Flowsheet.cpp:4380-4392`), `:133-135`.
- Active-set QP `activeSetQpLesson.ts:45-47` (the engine has three
  tolerances), `:203-205,221-225` (degenerate zero steps exist), `:174` (a
  primal method needs a feasible start), `:299-310,320-321` (the identity as
  written is not the engine's normalised form).
- Least squares `leastSquaresLesson.ts:106-108,543-544` (maximum likelihood
  needs normal errors), `:146` (one minimum needs full column rank).
- Thiele `ThielePelletTool.tsx:187-190` (Weisz–Prater still needs an estimated
  D_eff), `:971-974` (name the convention of the 0.3).
- Batch membranes `batchMembraneLesson.ts:512-513,545-546` vs `:600-602` (an
  endpoint may be a constrained optimum).
- Bjerrum `bjerrumLesson.ts:79-80` (a fixed-pH diagram is a real buffered
  beaker with an untracked counter-ion), `:293-294` (self-contradiction),
  `:187-188` (the first crossover shift is γ(HCO₃⁻)'s).
- FUG `fugLesson.ts:299-300,345-346`: a constant α cannot CROSS one.
- Kremser `kremserLesson.ts:111`: the recovery formula assumes solute-free
  entering solvent.
- Pinch `pinchLesson.ts:264-265` (the targets do not rise; the duties exceed
  them), `:206` (Q in W for A in m²).

**In the Design Guide** (`docs/designGuide.tex`): `:97` PFR volume goes as
ln[1/(1−X)] for first order (the guide's own `:208` says so); `:138` the
direct sequence is lightest-out.  MISSED: `RulesOfThumbTool.tsx:126` ("a PFR
for a fast liquid reaction") contradicts the guide's `:130-131` and the page's
own promise that nothing is quoted.

## MISSED by the reviewer, in the ENGINE — each its own slice

None of these is fixed by a text edit, and some can move goldens, so each is
measured before it is changed, and moved rows go to Vítor first.

- `ShortcutColumn.cpp:229` clamps a negative R_min to zero **silently** — the
  no-silent-crutch rule.  Announce it (or refuse).
- `ActiveSetQP.cpp:160` starts at x = 0 without checking feasibility (safe for
  reconciliation, where x = 0 is x = m ≥ 0; not guaranteed for the SQP
  driver), and `:222,276` marks a linearly dependent row "implied" and skips
  it in the step test — a parallel row with a different offset is not implied
  and can be violated.
- `Wegstein.cpp:82`: q_max = 0 forces plain substitution for s < −1, where the
  unclamped q ∈ (½, 1) would stabilise the oscillation.
- `VleConsistency.cpp:156` tests |D − J| < 10; Herington's criterion is usually
  quoted as D − J < 10.  To be checked against Herington (1951) before any
  change (no effect on today's witness, D − J = +4.6).
- `glycerol.dat`: T_c, P_c and ω are mutually inconsistent with its own T_b (by
  the definition of ω).  A data-curation finding, not a lesson one.

## Reviewer wrong (recorded so it is not re-raised)

Bjerrum renormalisation (on the axis, `BjerrumTool.tsx:198`); flash uniqueness
for a stable binary; ε-NTU C_r = 0 (stated at `:206-214`); pump curve
extrapolation and affinity laws (stated); Merkel Ka/V and make-up (stated);
Rayleigh multicomponent (stated); Levenspiel/Van Heerden flag, kinetics and
straight removal line (stated); drying "usually" and k_Y (stated); breakthrough
carrier and mesh dispersion (stated); approach-to-equilibrium network sign
(stated); least-squares χ² units (stated); NRTL α = 0 (the page says random,
not ideal); Herington "proves accuracy" (the page says passes); water's 0.70 K
(far beyond T_b's uncertainty); Hunter–Nash basis (consistently molar).

## SOFTEN

About forty statements are true in their domain and stated more absolutely
than true ("always", "never", "exactly", "the only").  The four verification
reports that listed each with its condition were session output and are NOT
in the repository; whoever fixes a page re-reads it for its absolutes, and
they are applied with that page's confirmed fixes, never as a separate sweep.

## Order of work

1. The confirmed text errors above, page by page, with each page's SOFTEN
   items riding along, validated by `bin/runTests --gui` per slice.
2. The Design Guide lines (rebuild the PDF: `make -C docs all`).
3. The engine items, one slice each, measured first.
4. Pedagogy, organisation and the four-status component: Vítor's decision.
