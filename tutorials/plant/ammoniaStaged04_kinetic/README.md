# `ammoniaStaged04_kinetic` — stage D of the staged design sequence

**THE FIRST BED VOLUME IN THIS CORPUS THAT THE ENGINE COMPUTED.**  The same
ammonia synthesis loop as stages A, B and C, with the converter as an
**adiabatic plug-flow catalyst bed integrating the Dyson & Simon (1968) rate
law**, and the bed volume the answer of a `designSpec` rather than a number
anybody typed.  Until this case that rate law
(`src/unitOperations/reactor/kinetics/AmmoniaSynthesisRate.{H,cpp}`) was
reachable only from the props bench
(`tutorials/props/kinetics/ammoniaRate01_dyson_simon`); `pfr` reads it now
through `kinetics { type dysonSimon1968; }` in `constant/reactions`.

## 1. Where this sits

| | reactor | claims | must not claim |
|---|---|---|---|
| A `ammoniaStaged01_yield` | `conversionReactor`, declared conversion | a material balance | a reactor size; an equipment-factored cost |
| B `ammoniaStaged02_equilibrium` | `gibbsReactor`, true equilibrium | the thermodynamic ceiling | any size, any cost |
| C `ammoniaStaged03_approach` | `gibbsReactor` + 5 K approach | a realistic outlet; the converter may be costed from a DECLARED space velocity | a bed volume the engine computed |
| **D** *this case* | adiabatic `pfr` on Dyson & Simon (1968), volume solved by a DesignSpec | **a bed volume the ENGINE computed** | a pellet effectiveness factor (announced as **unpriced**); a cost |

Background: `docs/design/how-a-process-design-is-staged.md` §3.4, §6 and
§7.3, and DEV.md C8.

## 2. What changed against stage C — TWO blocks, not one, and the measured diff

```bash
diff <(grep -v '^ *//' tutorials/plant/ammoniaStaged03_approach/system/flowsheetDict) \
     <(grep -v '^ *//' tutorials/plant/ammoniaStaged04_kinetic/system/flowsheetDict)
```

Comments aside, the diff is exactly: a `variables { V_bed }` block, a
`feedPreheat` unit inserted between the mixer and the converter, and the
converter block (`gibbsReactor` with `T 700 K; P 200 bar; temperatureApproach 5;`
and its species list → `pfr` with `V_R $V_bed; nSteps 400; thermalMode
adiabatic;` and `reactions ( ammoniaSynthesis )`).  Makeup, pressure,
components, sealed property package, separator, let-down, purge, recycle
plan (`system/solverDict`) and the tear seed (`0/recycle`) are byte-identical
to stage C except for the comments in `0/makeup`, `0/recycle` and
`system/solverDict` that now say "four stages" instead of "three".  Stage D
adds two files C has no counterpart for — `constant/reactions` (the rate law
selection) and `system/outerDict` (the DesignSpec) — and drops C's
`system/postDict` (§6 says why).

**Why the second block is a consequence of the first.**  Stage C's
`gibbsReactor` declares `T 700 K`: it IMPOSES the converter temperature, and
the 3 287 kW duty it reports silently includes heating the loop gas from the
mixer's 274 K to 700 K.  A kinetic bed cannot impose a temperature — it
integrates from the state it is fed — so the preheat C hid inside its reactor
becomes a unit of its own here.  It is a `phaseChanger { outletT 700 K; }`
(the engine's unit that TAKES a target outlet temperature and RETURNS the
duty, a built-in inverse solve it announces as SELF-TARGET) and not a
`heater`, and that choice was **measured, not preferred**:

* A `heater` takes a DUTY and returns T_out.  A fixed duty in front of a
  kinetic bed inside a recycle is **open-loop unstable**: a larger recycle is
  heated less, the colder bed converts less, the recycle grows again.  With
  the Wegstein recycle solver the loop ran away in three passes — recycle
  12 998 → 15 378 → 23 475 kmol/h while the bed inlet fell 697 → 597 → 532
  → 480 K — and with the Newton solver a trial step fed the let-down drum an
  empty stream and the run stopped.  That is real physics, and it is why an
  industrial loop preheats through a feed-effluent exchanger under
  temperature control, never through a fixed-duty heater.
* The `phaseChanger`'s emergent role label reads `boiler` (Q > 0 on the
  vapour side); the gas enters and leaves as superheated vapour and the duty
  is entirely sensible (`Q_latent_kW 0`).  The `Tsat 150 K` it prints is the
  bracket centre of its inverse solve on a gas far above every critical
  temperature, not a claim about anything boiling.

The 700 K inlet is **inherited from stage C**: it is the one thermal fact C
states about its converter, and inheriting it keeps the ladder's rule — one
thing moves per rung — as close as a kinetic bed allows.  It was a declared
assumption there and is one here.

## 3. What the engine solved

`system/outerDict` is a 1 × 1 DesignSpec: manipulate `$V_bed`, target
`converter.approach_K = 5 K` to `tol 0.02`.  The target is **the same
source and the same number stage C declared, read the way the source
defines it PER BED** — US 5,352,428 (Bhakta & Grotz, CF Braun, 1994): *"The
effluent from each bed has an approach to equilibrium of 5 C., i.e., the
ammonia concentration corresponds to the equilibrium concentration at a
temperature 5 C. above the actual temperature."*  Stage C imposed that on an
isothermal Gibbs converter; here the engine solves for the bed volume at
which an adiabatic kinetic bed's effluent actually reaches it.

`approach_K` is the PFR's own KPI: `T* − T_out`, where `T*` is the
temperature at which the outlet gas would be at equilibrium **under the rate
law's own Ka** (Gillespie & Beattie 1930, Eq 2, with the paper's fugacity
coefficients, Eqs 6–8) — found by a bracketed bisection on Eq 19's forward
and reverse terms.  It is NOT the package's Gibbs surface; §5 measures how
far the two sit apart.

| DesignSpec iteration | `$V_bed` (m³) | residual F = (approach − 5)/0.02 |
|---|---|---|
| 0 | 6.0000 | 553.6 |
| 1 | 6.5636 | 159.6 |
| 2 | 6.8960 | 28.45 |
| 3 | 6.9848 | 1.460 |
| **converged** | **6.989826** | 4.4e-3 (13 evaluations) |

The whole recycle loop is re-converged inside every evaluation (Newton on
the tear, |r| 2.6e-9); the bed's RK4 was checked by rating the solved
volume at `nSteps 1600` against the shipped 400: `X_N2` moves by 2.6e-9
relative and the approach by 1e-6 K.

## 4. The ladder as numbers, extended to D

| quantity | A | B | C | **D** |
|---|---|---|---|---|
| converter model | conversion 25 % | Gibbs, 700 K isothermal | Gibbs + 5 K, 700 K isothermal | **Dyson–Simon bed, 700 K in, adiabatic** |
| converter outlet y(NH₃) | 0.149843 | 0.310807 | 0.300194 | **0.100764** |
| per-pass N₂ conversion | 25.0 (declared) | 47.9288 % | 46.6023 % | **16.5991 %** |
| converter outlet T | 700 K | 700 K | 700 K | **844.86 K** (the hot spot: +144.86 K, and it is the outlet) |
| recycle / makeup (molar) | 2.565 | 1.0257 | 1.0778 | **3.9289** |
| converter inlet, kmol/h | — | — | 16 622.66 | **39 431.19** (y(NH₃) 0.0127) |
| product NH₃, kmol/h | — | — | 3 722.5 (1 521.5 t/d) | **3 127.0 (1 278 t/d)**, 98.75 mol% in 3 166.58 kmol/h |
| bed volume | none | none | 18.6290 m³ from an ASSUMED 20 000 Nm³/(m³ h) | **6.9898 m³, SOLVED for a 5 K approach** |
| GHSV on the normal basis | — | — | 20 000 (the assumption) | **126 442 Nm³/(m³ h)** (KPI, 0 °C / 1 atm ideal-gas convention, computed) |
| actual-gas residence time | — | — | — | **2.057 s** (SRK molar volume at the inlet) |
| approach to equilibrium of the effluent | — | 0 | 5 K, imposed on the whole converter | **5.0001 K, reached, on the law's own equilibrium** |
| rate at inlet → outlet, kmol NH₃/(m³ bed h) | — | — | — | **1 076.6 → 58.96** (a factor of 18.3) |
| preheat duty | inside the converter's duty | inside | inside (3 287 kW total) | **146 229 kW**, its own unit |

**The two gaps are the lesson, and the second is larger than the first.**

1. *The volume.*  The engine's bed at a 5 K approach is **6.99 m³ against
   the 18.63 m³** stage C sized from an assumed 20 000 Nm³/(m³ h) — the
   kinetic bed runs at 126 442 Nm³/(m³ h) on the same basis.  Read this with
   §5 in hand: it is a FRESH, CLEAN, FULLY REDUCED bed with the pellet
   correction UNPRICED, and both of those make it smaller than a real one.
2. *The conversion.*  A single adiabatic bed converts **16.60 %** of its
   nitrogen per pass where stage C's isothermal converter converts 46.60 %.
   The bed heats itself 145 K as it converts, ammonia equilibrium retreats
   as it heats, and the conversion is capped where the adiabatic line meets
   the equilibrium curve.  Measured, by rating the bed at sixteen volumes
   (the case without its `outerDict`):

   | V_bed, m³ | X(N₂) % | approach, K | T_out, K | y(NH₃) out |
   |---|---|---|---|---|
   | 0.5 | 0.617 | (not published: at equilibrium above 1 500 K) | 705.33 | 0.0181 |
   | 1 | 1.311 | 389.1 | 711.32 | 0.0214 |
   | 2 | 3.007 | 311.3 | 725.99 | 0.0297 |
   | 4 | 8.861 | 148.0 | 776.90 | 0.0592 |
   | 5 | 13.561 | 56.59 | 818.09 | 0.0841 |
   | 6 | 15.926 | 16.07 | 838.92 | 0.0970 |
   | **6.99** | **16.599** | **5.00** | **844.86** | **0.1008** |
   | 8 | 16.808 | 1.604 | 846.70 | 0.1019 |
   | 10 | 16.895 | 0.179 | 847.47 | 0.1024 |
   | 20 | 16.906 | 3e-6 | 847.57 | 0.1025 |
   | 200 | 16.906 | 1e-13 | 847.57 | 0.1025 |

   **16.906 % is the cap**, at 847.57 K.  No volume of this bed reaches
   stage C's 46.60 %, which is why the DesignSpec targets the sourced
   per-bed approach and not C's conversion — a target the bed cannot reach
   would make the Newton diverge honestly and size nothing.  Because the
   per-pass conversion is a third of C's, the loop recirculates 3.9× the
   makeup instead of 1.08× and the purge (1 654 kmol/h against C's 454)
   carries away 16 % of the ammonia C made.  **The isothermal 700 K converter
   of stages B and C is a fiction no single bed can be** — and that is
   precisely why an industrial converter is a train of adiabatic beds with
   quench or intercooling between them (`tutorials/plant/ammonia03_quench_converter`,
   whose beds are still equilibrium beds).

## 5. What the bed prices, and what it does not — every one announced

The engine says each of these on every run, in the end-of-run caveat block
and the result JSON; this README must agree with it and not soften it.

* **The effectiveness factor is 1 and UNPRICED.**  `effectivenessFactor
  intrinsic;` integrates Equation 19 alone.  The paper's own diffusion
  correction — Eq 39 with Table I, for 6–10 mm particles at 150–300 atm —
  exists in the engine and is deliberately NOT applied: the pellet is the
  rung beyond D (DEV.md C8), and this case says so rather than picking a
  particle nobody sourced.  **Measured, outside the shipped case**, by
  switching to `effectivenessFactor dysonSimonEq39;` with `operation {
  catalyst { particleDiameter 8 mm; } }` — 8 mm being the midpoint of Table
  I's 6–10 mm range, an ASSUMPTION in those words, which a catalyst vendor's
  data sheet would replace — the same 5 K target needs **15.04 m³** (ξ from
  0.319 to 0.490 along the bed, Eq 39 linearly interpolated between the 150
  and 225 atm columns at 197.4 atm — Choupo's choice, announced), with the
  same 16.60 % conversion and the same outlet.  So the pellet more than
  doubles the bed and changes nothing downstream: the size is where the
  correction bites.
* **The activities are the paper's, not the package's.**  Equation 19's
  rate constant was fitted with the activities of Eqs 3–8 — Dyson & Simon's
  own fugacity-coefficient correlations — and a rate constant is meaningless
  without the activity model it was regressed with.  So the bed prices its
  activities with the paper's γ's while the package's SRK (kᵢⱼ = 0) prices
  the streams and the adiabatic enthalpy march.  The disagreement is
  published, not suspected: at the inlet `gamma_law / phi_package` is 1.0045
  (N₂), 0.9966 (H₂) and **0.8840 (NH₃)**.
* **Two equilibria, and the approach is quoted on the law's.**  The rate
  vanishes at Gillespie & Beattie's Ka; the package minimises Gibbs energy
  with SRK.  Probed with a `gibbsReactor` fed the converged bed inlet
  (outside the shipped case): at the bed's outlet T (844.86 K, 200 bar) the
  package's equilibrium ammonia is **0.103917** against the bed's 0.100764, so
  on the Gibbs surface the effluent is at 96.97 % of equilibrium ammonia —
  about 4.1 K short by the local slope (−0.000766 per K) — where the law
  says 5.00 K.  At the law's own T* = 849.86 K the package finds y(NH₃) =
  0.100086 against the law's 0.100764: the two equilibria are 0.68 % apart
  in ammonia at this state, the law the richer, which is the same finding
  `ammoniaRate01_dyson_simon` §4 recorded at 841 K (0.64 %).  A reader who
  compares this case's approach against stage B or C must know which
  surface each number is on.
* **A fresh, clean, fully reduced bed.**  Equation 40 carries no correction
  for the effect of particle size on reduction, poisoning or ageing — the
  authors say so — and the caveat travels on every result.  A working
  converter is none of those for most of its life; a real charge is larger.
* **The window.**  200 bar is 197.4 atm, inside the 150–300 atm the
  correlation was fitted over; nothing is extrapolated in pressure.  The
  temperature range of the fit is not stated by the paper and is therefore
  not claimed here.

## 6. What this case does NOT claim

* **It does not cost anything, and it sizes no vessel.**  Under an
  `outerDict` the engine does not apply `system/postDict` to the
  representative pass (the sizing/costing chain is Layer 3 of the
  single-pass path only), so the case carries no postDict, no
  `design/converter/vessel` sheet and no CAPEX; it computes the BED, and the
  vessel around it stays stage C's.  Costing stage D's converter would take
  this run's own `V_R` in a case of its own, and the invariant of the
  sequence — *a stage may not cost what it did not size* — is why it is not
  typed into a `designRules { volume }` here.
* **It does not claim the plant's first law closes.**  The balance reports
  DO run on the representative pass (Layer 3b), and the material side
  closes (99.998 % global, every element to 0.0000 %) — but the
  `globalEnergyBoundary` is **−22 274.7 kW (5.918 %)**, and all of it sits
  on the SEPARATOR: its published duty is −230 170.6 kW against a stream
  enthalpy difference of −207 895.9 kW (90.32 % closure), while the
  preheater and the converter close at 0.0000 kW.  See §7.
* **It does not claim the loop's conversion is the ammonia industry's.**
  Stage C's README §7 lists the inherited causes (a 250 K separator, kᵢⱼ = 0);
  they are unchanged here, and the single adiabatic bed is a further
  simplification no plant makes.

## 7. A finding carried, not fixed: the separator's duty on a supercritical root

The −22 274.7 kW is the engine disagreeing with itself about ONE stream.
`IsothermalFlash` prices its duty on its feed's OWN re-resolved equilibrium
(R-E1, `IsothermalFlash.cpp` §"Q = F·(H_out − H_in)"); at 844.86 K and 200
bar the diluteSolution/Henry world, extrapolated 500 K beyond every fitted
range, returns a TWO-PHASE root, and the unit accepts it and blends a
"liquid" enthalpy into H_in.  The energy report resolves the same stream,
finds the same root, and REFUSES it — its own words, in this run's caveat
block: *"stream 'reacted': resolved TWO-PHASE at T = 844.858 K, which is
above the highest critical temperature of any component present (405.4 K):
no liquid can exist there, so the split is DISCARDED and this stream is
priced on the state it carries."*  Stage C did not show this because its
separator feed was 700 K; the hotter effluent of an adiabatic bed is what
reached the seam.  The guard the report has and the unit lacks is a defect
in `IsothermalFlash.cpp`, outside this slice's scope; the residual is pinned
in `check_energy_closure.KNOWN_OPEN` at the value the engine printed, and
the pin asks to be removed the day the flash guards its feed the way the
report does.

## 8. Assumptions, each declared with its source or its absence

| assumption | value | source |
|---|---|---|
| bed inlet temperature | 700 K | inherited from stage C's declared converter temperature (a declared assumption there) |
| per-bed approach to equilibrium | 5 K | US 5,352,428, verbatim in `system/outerDict` |
| effectiveness factor | 1, UNPRICED | a declared route (`effectivenessFactor intrinsic`), announced; the alternative measured in §5 |
| rate law and every constant in it | Dyson & Simon (1968), Eqs 2, 6–8, 18, 19 | `AmmoniaSynthesisRate.cpp`, cited on every run; fitted to Nielsen, Kjær & Hansen (1964) — nothing measured by Choupo |
| GHSV basis | 0 °C, 1 atm, ideal gas | a stated convention, computed from R, never typed |
| particle diameter (probe only, §5) | 8 mm | the midpoint of Table I's 6–10 mm range — an ASSUMPTION; a vendor data sheet replaces it |
| RK4 axial steps | 400 | numerical; checked against 1 600 (§3) |
| loop pressure, makeup, separator, purge, tear seed | as stages A–C | unchanged, see stage C's README |

## 9. Running it

```bash
bin/choupo-lint  tutorials/plant/ammoniaStaged04_kinetic
runCase          tutorials/plant/ammoniaStaged04_kinetic       # the DesignSpec (13 loop solves)
cat tutorials/plant/ammoniaStaged04_kinetic/designspec_history.csv
# rate ONE volume instead: move system/outerDict aside and set variables.V_bed
```

## 10. Sources

* D. C. Dyson and J. M. Simon, *A kinetic expression with diffusion
  correction for ammonia synthesis on industrial catalyst*, Ind. Eng. Chem.
  Fundam. 7 (1968) 605–610 — the rate law, its fugacity coefficients, Table I.
* US 5,352,428, *High conversion ammonia synthesis*, M. L. Bhakta and
  B. J. Grotz, CF Braun and Co, issued 4 October 1994 — the per-bed
  approach-to-equilibrium definition and the 5 °C value.
* Stage C's README for the sources of everything inherited.
