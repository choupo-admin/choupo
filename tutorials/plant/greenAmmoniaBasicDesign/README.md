# Green ammonia, 1200 t/day — the basic-design stage (FEL-3, process side)

The PEQ 2026-27 green-ammonia plant as it is described at the **basic
design** stage: FEL-3 in both numberings (FEED, basic engineering). The
stage's fidelity, from
[`docs/design/how-a-process-design-is-staged.md`](../../../docs/design/how-a-process-design-is-staged.md)
§2.3: *the reactor on real kinetics where they exist; the exchangers rated
against geometry.* Both are here.

```bash
source /path/to/Choupo/etc/bashrc
runCase -f .
```

**This is FEL-3 on the PROCESS side only.** The cost beside it is still
Turton's equipment-factored method, which is AACE's Class 4 methodology;
a Class 3 estimate is built from semi-detailed unit costs and vendor
quotations, which no part of Choupo reads. So `system/postDict` keeps
`estimateClass 4` and its −30 % / +50 % band: the process fidelity moved
to FEL-3, the cost estimate did not.

| case | stage | converter | exchangers |
|---|---|---|---|
| [`greenAmmoniaFeasibility`](../greenAmmoniaFeasibility) | feasibility, FEL-2 | one Gibbs reactor 5 K short of equilibrium | duties only; areas on an assumed U |
| [`greenAmmoniaFeasibility50bar`](../greenAmmoniaFeasibility50bar) | the same study, 50 bar | the same, at 400 °C | the same |
| **this case** | basic design, FEL-3 (process side) | **three adiabatic beds on a rate law** | **every one designed (Kern)** |

## What it is derived from, and what differs

It is a copy of the base case
[`greenAmmoniaIndustrialN2`](../greenAmmoniaIndustrialN2): the same feeds,
package, compressors, feed/effluent exchanger (FEHE), coolers, separation,
let-down, utilities and appraisal, and the same six Kern exchanger designs.
Read the base case's README for all of that.

**One block differs: the converter.** The base case's single Gibbs reactor
— which has no volume and no path, so it cannot tell one bed from three —
is replaced by:

| unit | what it is | its number, and why |
|---|---|---|
| `Bed1` | adiabatic `pfr`, Dyson & Simon (1968) rate law, iron catalyst | 8.89 m³, SOLVED so the bed **leaves at 515 °C**, 5 K under the 520 °C the base data give as the catalyst's limit; run to a 5 K approach it would leave above that |
| `InterbedCooler1` | `phaseChanger` to 420 °C, raising HP steam | 420 °C author-set |
| `Bed2` | the same rate law | 18.42 m³, SOLVED so the effluent is **5 K short of equilibrium** (US 5,352,428's per bed approach, the base case's source) |
| `InterbedCooler2` | to 410 °C, raising HP steam | 410 °C author-set |
| `Bed3` | the same rate law | 31.74 m³, the same 5 K criterion |

The rate law is the correlation object
`src/unitOperations/reactor/kinetics/AmmoniaSynthesisRate.{H,cpp}`, selected
by `kinetics { type dysonSimon1968; }` in `constant/reactions` (copied from
[`ammoniaStaged04_kinetic`](../ammoniaStaged04_kinetic), whose README is the
reference for it). The FEHE now preheats bed 1 against bed 3's effluent, an
energy recycle through three kinetic beds (the second tear in
`system/solverDict`). The recycle compressor's power was re-tuned to 908 kW
so the loop sits again at the base case's 150.9 bar.

**The bed volumes are SOLVED, not typed** (DEV.md 4c C66). Each bed reads
its volume as `V_R $V_BedN;` from the plant's `variables {}` block, and
`system/outerDict` is a 3 x 3 DesignSpec that solves the three together:
bed 1's `T_out` = 788.15 K (515 °C), beds 2 and 3's `approach_K` = 5 K.
Simultaneous, because the beds are coupled -- bed 1's conversion sets bed
2's composition, and bed 3's effluent closes the FEHE recycle that sets bed
1's inlet. A unit **folder** reaches the plant's variables because a member
that declares no `variables {}` of its own resolves its `$references`
against the enclosing level's (`src/unitOperations/flowsheet/MemberFolder.H`);
until C66 it did not, and these volumes were found by hand. The values in
`variables {}` are the design point the Newton last converged to, so a run
without the outerDict RATES the designed beds; a group that changes anything
upstream re-solves them by running the case. The sizing, relief, costing and
economics chain runs once, on the replay at the design point.

Douglas's hierarchy: the same levels as the feasibility case, with level 5
— the heat-exchanger network — now built (the FEHE and the two interbed
boilers) instead of targeted.

## What the run shows

Every number is read off a run of this case; the golden (`expected`) is the
authority on all of them.

| bed | in | out | NH₃ out | approach | volume | D × L | pressure drop |
|---|---|---|---|---|---|---|---|
| 1 | 380.1 °C | 515.0 °C | 9.80 % | 34.1 K | 8.89 m³ | 1.96 × 2.94 m | 0.67 bar |
| 2 | 420.0 °C | 493.4 °C | 14.78 % | 5.0 K | 18.42 m³ | 2.50 × 3.75 m | 0.31 bar |
| 3 | 410.0 °C | 464.4 °C | 18.72 % | 5.0 K | 31.74 m³ | 3.00 × 4.50 m | 0.17 bar |

| | this case | feasibility case |
|---|---|---|
| ammonia produced | 1180.2 t/day | 1180.3 t/day |
| converter outlet NH₃ | 18.72 % (three beds) | 19.70 % (one Gibbs reactor at 460 °C) |
| hydrogen converted per pass | 28.3 % | 29.7 % |
| recycle / make-up (mol/mol) | 2.44 | 2.28 |
| HP steam raised | 29.59 MW, in the interbed coolers | 30.94 MW, in the converter |
| feed preheat | 64.01 MW by the FEHE, **recovered** | 60.86 MW of molten salt, **bought** |
| refrigeration (−20 °C) | 21.45 MW | 20.24 MW |
| compression | 13.73 MW | 13.67 MW |
| catalyst | 59.05 m³ | (none: a space-velocity vessel) |
| plant first law | closes to 1.76 kW (0.002 %) | 9.0 kW |

An adiabatic bed publishes no duty (`Q_kW` 0), so the steam is raised and
credited where the heat is removed — the two interbed coolers, each of
which declares the base case's case-local credit utility
`steamGenerationHP` and is held to the allocation's 10 K approach.

### The beds' pressure drop, and why they are squat (DEV.md 4c C66)

Each bed declares its slenderness `operation.L_over_D` -- the ONE home of
it: the bed is the straight cylinder of its volume at that ratio, the
`pfr` integrates Ergun's pressure drop along that length on that
cross-section (`operation.pressureDrop { model Ergun; ... }`), and the
sizer builds the shell on the same number. The particle (8 mm, the middle
of the 6-10 mm window Dyson & Simon's Eq 39 was computed for), the void
fraction (0.40) and the budget (1 bar per bed) are **author-set**, said in
`Bed1/system/flowsheetDict`. At the L/D 6 the case carried before, the
loop did not converge: its first pass lost 35, 24 and 16 bar across the
three beds. At a fixed volume both the gas velocity and the bed length go
as (L/D)^(2/3), so the drop goes as (L/D)^2; at L/D 1.5 the beds lose
0.67, 0.31 and 0.17 bar (the table above), and the inertial term carries
98-99 % of it (superficial velocity 0.70, 0.43 and 0.28 m/s at the bed inlets, Re_p 3600-8100). The price is steel: a wider shell at
167 bar has a thicker wall, so the three shells cost 18.7 M EUR (total
module) where the slender ones cost 11.9 M EUR. A bed the gas crosses
RADIALLY -- through its thickness, not its length -- is the other answer,
and this `pfr` does not model one. The tables below this one were read
off the run BEFORE C66's beds (sub-percent moves; the golden is the
authority, and it moves with the list put to Vitor).

### The gross margin, and why it nearly doubled

| M EUR/yr | this case | feasibility |
|---|---|---|
| revenue R | 387.68 | 387.73 |
| raw materials C_RM | 331.65 | 331.65 |
| **R − C_RM** | **56.02** | **56.08** |
| electricity | 11.40 | 11.35 |
| heating the converter feed | 0 | 25.91 |
| ammonia refrigeration | 9.58 | 9.10 |
| cooling water and LP steam | 0.26 | 0.94 |
| HP steam raised (credit) | −15.13 | −15.81 |
| C_UT | 6.11 | 31.50 |
| **R − C_RM − C_UT** | **49.92** | **24.58** |

The difference is the feed/effluent exchanger the feasibility case's pinch
targeted (minimum heating zero): built here, it carries the 64 MW the
feasibility flowsheet bought as molten salt. Both margins are upper
bounds for the same reason (the `StorageFlash`'s −35 °C duty, which no
catalogue utility serves); every price is the base case's author-set
assumption.

### The equipment, designed

Every exchanger is designed by the Kern method (DEV.md 4c C48): the bundle
and the fouling declared, the tube count, the shell, both films, U, F, the
area and both pressure drops computed. The two that are new here:

| | InterbedCooler1 | InterbedCooler2 |
|---|---|---|
| duty | 15.82 MW | 13.81 MW |
| steam raised at 41 bar | 9.23 kg/s | 8.06 kg/s |
| area installed | 93.2 m² | 86.6 m² |
| U (computed) | 802 W/m²/K | 810 W/m²/K |
| tubes (1 pass, 10 ft) | 383 | 356 |
| gas-side pressure drop | 21.2 kPa | 22.7 kPa |

Their boiling-water film (5000 W/m²/K) is **typed**, as the base case
types the chiller's boiling ammonia: no boiling correlation is wired into
the design. With two passes of 20 ft tubes (the first trial) the gas lost
~13 bar in the tubes, so they are one pass of 10 ft — the sheet in
`design/InterbedCooler1/shellTubeHX` has the rest. The FEHE comes out at
1817 m² at U 482 W/m²/K over four shells, against the 2000 m² at U 550 the
flowsheet declares and converges on; the designed area is costed.

The beds are sized by the `pfr` sizer from their own volume: a shell (a
vessel at the bed's own L/D 1.5, Turton's vessel set, its sheet carrying
the bed's pressure drop) and a **catalyst charge** priced from two
declared numbers, 2500 kg/m³ and 15 EUR/kg — **author-set assumptions**,
the same round numbers `ammoniaStaged04_kinetic` declares, with no source
behind either: 0.33, 0.69 and 1.19 M EUR for the three charges. Each bed is its own shell here; a real converter stacks them in
one.

The fixed capital is 61.0 M EUR (41.4 M EUR at the feasibility stage, whose
converter was one space-velocity vessel and whose exchangers rested on an
assumed U; 54.1 M EUR here before C66 squatted the beds); the NPV at the
base case's appraisal knobs is −345 M EUR against −493 M EUR. The NPV
moved because the energy bill did, much more than the capital.

### The start-up years (DEV.md 4c C63)

The appraisal is a basic-design one, so it declares how the plant gets
built and started: a **three-year construction** spending the FCI as
`( 0.25 0.45 0.30 )` at the end of each year, a **ramp-up** to 70 % and 90 %
of design production in the first two operating years, and a **start-up
cost** of 0.08 × FCI expensed in the first. Every one of these is an
**author-set assumption**, not a datum. Year 0 is the end of construction,
so the construction outflows are compounded to start-up; the working
capital is invested in full at year 0 and does not follow the ramp-up (the
run says so). The ramp-up scales the revenue and the variable costs only,
and because this plant loses money in every operating year at these prices,
producing less in years 1 and 2 loses LESS: the NPV moves only from
−328.9 to −329.5 M EUR, the compounded capital and the start-up cost
slightly outweighing the smaller early losses. The run prints the table
year by year.

### The relief valves (DEV.md 4c C62)

Ten pressure-relief valves are sized as `reliefValve` items of the sizing
pass, each one more item of the unit it protects (`design/<unit>/psv`). The
**set pressure is read** from the protected item's own `pressureDesign`
(gauge, the MAWP; one valve set at it), never typed; the **scenarios are
declared** in `system/postDict`, because which causes of overpressure are
credible is the designer's judgement; the valve is sized by API 520 Part I
on every scenario and governed by the one needing the largest area:

| protected item | set (barg) | scenarios | governing | rate (kg/h) | A required (mm²) |
|---|---|---|---|---|---|
| N2Boost | 34 | discharge blocked | gas | 41 181 | 1691 |
| MakeupComp1 | 74 | discharge blocked | gas | 50 071 | 1651 |
| MakeupComp2 | 167 | discharge blocked | gas | 50 071 | 758 |
| RecycleComp | 167 | discharge blocked | gas | 109 370 | 1373 |
| Bed1/shell | 167 | outlet blocked | gas at 788 K | 159 440 | 3269 |
| Bed2/shell | 167 | outlet blocked | gas at 767 K | 159 440 | 3165 |
| Bed3/shell | 167 | outlet blocked | gas at 738 K | 159 440 | 3058 |
| Separator | 167 | gas line, liquid line | gas line | 109 463 | 1355 |
| LetdownHP | 22 | gas line, liquid line, fire | liquid line | 49 849 | 354 |
| StorageFlash | 2 | gas line, liquid line, fire | liquid line | 49 172 | 1140 |

The fire cases are much smaller (LetdownHP 48 kW of fire heat, 183 kg/h of
vapour, 11 mm²; StorageFlash 447 kW, 1262 kg/h, 553 mm²): these drums are
small and half full, so a blocked liquid line -- the level controller
failing shut and the drum filling -- is what sizes them. Every number of
every scenario is on its sheet and in the result JSON (pinned).  The
**lettered orifice is not selected**: the letter areas are a table of API
526, a no-grant standard, and are not reproduced here (the MIT licence of
the library that carries them does not relicense them), so the sheet
publishes the REQUIRED effective area and the vendor's letter is the
reader's.

Read these before quoting them:

* **Relief does not cure an under-rated shell.** The run warns that four
  items -- Bed1, Bed2, Bed3 and the Separator -- are designed at 167 bar in
  stainless steels whose material record rates 100 bar (`[rating]
  WARNING`). A valve set at 167 barg protects a vessel built for 167 barg;
  it does nothing for one that could not be built to it. The materials are
  NOT changed here: that moves the cost goldens and is the owner's call.
* **The coefficients are preliminary.** No `Kd`, `Kb`, `Kc`, `Kw`, `Kv` or
  back pressure is declared, so the engine takes the preliminary-sizing
  values (0.975 gas, 0.65 liquid, the corrections 1, discharge to
  atmosphere) and ANNOUNCES each one. A flare header's back pressure and a
  vendor's certified coefficient replace them.
* **The fluid is the stream as solved, carried to the relieving pressure.**
  A blocked line relieves that stream's own flow at its own temperature;
  the Separator's vapour, at 184.7 bar abs and -20 °C, is relieved as the
  gas it is at 140 bar -- it is not re-flashed, although some ammonia
  would condense there. A compressor's blocked discharge is relieved at its
  normal flow, which over-states what a centrifugal machine delivers
  against a closed valve (it surges) and is the full displacement of a
  reciprocating one.
* **No fire case on the beds or the Separator.** A bed holds gas and no
  liquid, so nothing boils to carry the fire's heat away (its wall fails
  first: a depressuring question). The Separator's liquid at its fire
  relieving pressure (1.21 x 167 barg) is above ammonia's critical pressure
  and does not boil; declaring the scenario makes the run refuse by name.
* **Not modelled:** tube rupture (the API 521 rule was not verified), a
  control valve failing open (no valve capacity is declared), two-phase
  relief, the relief header, the knock-out drum and the flare. **No valve
  is costed**: this engine carries no relief-device cost correlation and
  invents none, so the capital total is the same as without them and says
  so (`NOT COSTED`). API 520, API 521 and ASME VIII were not read: the
  equations and percentages are the overpressure EduTool's, reached through
  the open `fluids` library and the DIERS fire document.

### The first law

The plant's first law closes to 1.76 kW. Every bed is adiabatic and
publishes no duty, so there is no reactor duty for the allocation to serve
at an inlet temperature (DEV.md 4c C52 records that a non-isothermal
`pfr`'s duty is served at its inlet `T`, not along its profile — not
reached here).

## Read before quoting it

* **The rate law is for an iron catalyst at 150-300 atm**, and this loop
  runs at 148.9 atm: the engine announces on every bed that the rate is
  extrapolated just below its window. The effectiveness factor is taken
  as 1 (`effectivenessFactor intrinsic`), and the engine says that is
  unpriced: a real charge with diffusion-limited pellets is larger.
* **Bed 1's 515 °C is a criterion, not a result of optimisation**; the two
  interbed temperatures are author-set; no bed has been optimised against
  catalyst cost.
* **The gas viscosity and conductivity in every exchanger design are
  dilute-gas values** (Chung, Eucken), as in the base case; the Kern
  sheets carry their correlation-window warnings.
* **The cost is a study-type estimate** (see the top of this page).

## What this case does NOT claim

* A converter vessel: three separate shells are costed, not one pressure
  shell with internals, a cartridge, an interbed exchanger inside it or a
  quench.
* Catalyst life or reduction, the pellet's diffusion correction (Eq 39:
  the particle is declared, but only the Ergun drop reads it -- the beds
  run Eq 19 alone), a radial-flow bed, or a start-up heater: the loop is
  lit by the FEHE alone, and the converged state is the one a group should
  check is reachable.
* A low-pressure loop: the Dyson & Simon kinetics are for an iron catalyst,
  and the 50 bar speculation stays at the feasibility stage
  ([`greenAmmoniaFeasibility50bar`](../greenAmmoniaFeasibility50bar)).
* Everything the base case lists as not in it (the purge scrubber, the
  let-down gas recovery, the cooling-water, refrigeration and steam
  systems as equipment).
