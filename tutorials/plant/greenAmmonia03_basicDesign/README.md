# Green ammonia, 1200 t/day — basic design (process side)

**Illustrated design stage: FEL-3**, process side (FEL-3 in both
numberings: FEED, basic engineering). The PEQ 2026-27 green-ammonia plant as
it is described at the **basic design** stage. The stage's fidelity, from
[`docs/design/how-a-process-design-is-staged.md`](../../../docs/design/how-a-process-design-is-staged.md)
§2.3: *the reactor on real kinetics where they exist; the exchangers rated
against geometry.* Both are here.

```bash
source /path/to/Choupo/etc/bashrc
runCase -f .
```

**This is FEL-3 on the PROCESS side only, and the estimate class is not read
off the stage.** The cost beside it is still Turton's equipment-factored
method; a Class 3 estimate is built from semi-detailed unit costs and vendor
quotations, which no part of Choupo reads. So `system/postDict` keeps
`estimateClass 4` and its −30 % / +50 % band — the author's statement of how
far the project is defined (AACE's primary characteristic), never a
consequence of the model or of the design stage illustrated: the process
fidelity moved to FEL-3, the cost estimate did not.

It is rung 3 of the green-ammonia sequence, which the common entry
[`ammoniaRoutes01_screening`](../ammoniaRoutes01_screening) maps in full:

| rung | case | illustrated design stage | converter | exchangers |
|---|---|---|---|---|
| 2 | [`greenAmmonia02_feasibility150bar`](../greenAmmonia02_feasibility150bar) | FEL-2, feasibility | one Gibbs reactor 5 K short of equilibrium | duties only; areas on an assumed U |
| 2 | [`greenAmmonia02_feasibility50bar`](../greenAmmonia02_feasibility50bar) | FEL-2, an exploratory alternative at 50 bar | the same, at 400 °C — a catalyst hypothesis | the same |
| 3 | **this case** | FEL-3, basic design (process side) | **three adiabatic beds on a rate law, volumes solved** | **every one designed (Kern)** |

## What it is derived from, and what differs

It is a copy of the base case
[`greenAmmoniaPEQ_baseCase`](../greenAmmoniaPEQ_baseCase): the same feeds,
package, compressors, feed/effluent exchanger (FEHE), coolers, separation,
let-down, utilities and appraisal, and the same six Kern exchanger designs.
Read the base case's README for all of that.

**One block differs: the converter.** The base case's single Gibbs reactor
— which has no volume and no path, so it cannot tell one bed from three —
is replaced by:

| unit | what it is | its number, and why |
|---|---|---|
| `Bed1` | adiabatic `pfr`, Dyson & Simon (1968) rate law, iron catalyst | 8.95 m³, SOLVED so the bed **leaves at 515 °C**, 5 K under the 520 °C the base data give as the catalyst's limit; run to a 5 K approach it would leave above that |
| `InterbedCooler1` | `phaseChanger` to 420 °C, raising HP steam | 420 °C author-set |
| `Bed2` | the same rate law | 18.41 m³, SOLVED so the effluent is **5 K short of equilibrium** (US 5,352,428's per bed approach, the base case's source) |
| `InterbedCooler2` | to 410 °C, raising HP steam | 410 °C author-set |
| `Bed3` | the same rate law | 31.70 m³, the same 5 K criterion |

**The five are ONE SECTOR, `CONVERTER`** (DEV.md 4c C69): five
calculations, one piece of equipment.  Industrially a multibed converter
is one pressure shell holding the beds -- in a basket -- and the interbed
exchange (`CONVERTER/system/flowsheetDict` says where that construction was
read: a Kellogg patent and a licensor's product page; neither has TWO
interbed coolers, which is this case's own arrangement).  So the units
live in `CONVERTER/`, their names are `CONVERTER.Bed1` ... in every report
and KPI, and `system/postDict` prices ONE shell for them -- at ONE
diameter, which the three beds share (below).  The grouping
moved the energy recycle's cut: the CONVERTER runs before the FEHE and the
loop is torn at `PreheatedFeed` (`system/solverDict` says why), at a
recycle tolerance of 1e-10.

The rate law is WRITTEN in this case's `constant/reactions` — `kinetics {
type expression; }`, every constant of Dyson & Simon's Eqs 2, 6–8, 18 and 19
with its unit and its equation number (DEV.md 4c C67: the kinetics live in
the case) — the same law
[`ammoniaReactor04_kineticSizing`](../ammoniaReactor04_kineticSizing) writes, whose README is the
reference for it; `bin/curate/check_ammonia_rate.py` holds the copies equal. The FEHE now preheats bed 1 against bed 3's effluent, an
energy recycle through three kinetic beds (the second tear in
`system/solverDict`, cut at `PreheatedFeed`). The recycle compressor's power was re-tuned to 908 kW
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
| 1 | 379.8 °C | 515.0 °C | 9.83 % | 34.1 K | 8.95 m³ | 2.23 × 2.30 m | 0.31 bar |
| 2 | 420.0 °C | 493.3 °C | 14.80 % | 5.0 K | 18.41 m³ | 2.23 × 4.72 m | 0.62 bar |
| 3 | 410.0 °C | 463.9 °C | 18.71 % | 5.0 K | 31.70 m³ | 2.23 × 8.13 m | 1.00 bar |

| | this case | feasibility case |
|---|---|---|
| ammonia produced | 1180.2 t/day | 1180.3 t/day |
| converter outlet NH₃ | 18.72 % (three beds) | 19.70 % (one Gibbs reactor at 460 °C) |
| hydrogen converted per pass | 28.3 % | 29.7 % |
| recycle / make-up (mol/mol) | 2.44 | 2.28 |
| HP steam raised | 29.59 MW, in the interbed coolers | 30.94 MW, in the converter |
| feed preheat | 64.07 MW by the FEHE, **recovered** | 60.86 MW of molten salt, **bought** |
| refrigeration (−20 °C) | 21.53 MW | 20.24 MW |
| compression | 13.73 MW | 13.67 MW |
| catalyst | 59.06 m³ | (none: a space-velocity vessel) |
| plant first law | closes to 1.76 kW (0.002 %) | 9.0 kW |

An adiabatic bed publishes no duty (`Q_kW` 0), so the steam is raised and
credited where the heat is removed — the two interbed coolers, each of
which declares the base case's case-local credit utility
`steamGenerationHP` and is held to the allocation's 10 K approach.

### The beds' pressure drop, and ONE diameter for the three (DEV.md 4c C66, C69)

The three beds sit in ONE pressure shell, so they share ONE diameter, the
converter's: each bed declares `operation.diameter $D_converter;`, a plant
variable -- in the flowsheet, because a bed needs its cross-section DURING
the solve -- and its length is its volume over that cross-section,
L = V_R / (π D²/4). The `pfr` integrates Ergun's pressure drop along that
length (`operation.pressureDrop { model Ergun; ... }`). The particle (8 mm,
the middle of the 6-10 mm window Dyson & Simon's Eq 39 was computed for),
the void fraction (0.40) and the budget (1 bar per bed) are **author-set**,
said in `CONVERTER/Bed1/system/flowsheetDict`.

**The diameter is solved**, as the fourth unknown of the DesignSpec
(`system/outerDict`): the SMALLEST at which every bed's drop is within its
1 bar, written as "the LARGEST of the three drops over allowable equals 1"
(a `largestOf` target), so no bed is named in advance as the binding one.
At one diameter the gas velocity is nearly the same in the three beds and
the drop grows with the bed's length, so the largest volume binds: bed 3
loses exactly 1.00 bar, bed 1 0.31 and bed 2 0.62, and the converter is
2.23 m across. The drop falls as D⁻⁴ (viscous) to D⁻⁶ (inertial; here the
inertial term carries 99 % of it over each bed, superficial velocity
0.51-0.55 m/s at the bed inlets, Re_p 6300-6500), so no narrower converter
would do -- the `converterShell` sizer brackets the same smallest diameter
on the solved beds (each bed's drop scaled to another diameter by its own
inertial share, the axial state held fixed), finds it at the converter's
2.23 m with bed 3 binding, and says so on the run.  Started from 2.6 m, the
DesignSpec comes back to 2.2283 m in three Newton steps.

C66 had given each bed its OWN slenderness, L/D 1.5 (at the L/D 6 the case
carried before, the loop did not converge: its first pass lost 35, 24 and
16 bar across the three beds): 1.96, 2.50 and 3.00 m wide, losing 0.67,
0.31 and 0.17 bar. Three diameters cannot share one shell -- a shell around
them is as wide as the widest along its whole height, which is how the first
one-shell version of this case came out MORE expensive than three separate
vessels. A bed the gas crosses RADIALLY -- through its thickness, not its
length -- is the other answer, and this `pfr` does not model one. The
tables below this section were read off the run BEFORE C66's beds and C69's
one diameter (sub-percent moves; the golden is the authority, and it moves
with the list put to Vitor).

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
`design/CONVERTER/InterbedCooler1/shellTubeHX` has the rest. The FEHE comes out at
1817 m² at U 482 W/m²/K over four shells, against the 2000 m² at U 550 the
flowsheet declares and converges on; the designed area is costed.

The beds are sized by the `pfr` sizer from their own volume: a shell (a
vessel at the converter's diameter, its sheet carrying the bed's pressure
drop; inside the converter it is a basket, not costed) and a **catalyst
charge** priced from two
declared numbers, 2500 kg/m³ and 15 EUR/kg — **author-set assumptions**,
the same round numbers `ammoniaReactor04_kineticSizing` declares, with no source
behind either: 0.34, 0.69 and 1.19 M EUR for the three charges.

**The converter is ONE pressure shell** (DEV.md 4c C69): `type
converterShell` reads the CONVERTER sector's five units from the topology,
takes the beds' ONE diameter (2.23 m) -- refusing a bed at its own
slenderness, two diameters, a `D` of its own and a cooler too wide to fit
(their Kern shells are 0.71 and 0.68 m) -- stacks the members into one
straight cylinder as tall as their sum (2.30 + 4.72 + 8.13 m of bed and two
3.05 m coolers: 21.24 m), and walls it at 167 bar: 82.8 m³, 148 mm of wall,
177 t, 16.79 M EUR total module.  The beds' own shells become internal
BASKETS -- sized and drawn, not costed.

**What the one shell costs against three, AT THE SAME DIAMETER** (measured:
the same design point with the `converterShell` entry removed, so each bed
keeps its own 167 bar shell at 2.23 m): three shells 3.12 + 5.12 + 7.67 =
15.90 M EUR, against the one shell's 16.79 M EUR -- the ONE shell is
0.89 M EUR DEARER here, FCI 59.14 against 58.24 M EUR.  It is not the
grouping that costs more: a shell around the three beds ALONE (59.1 m³)
would be 12.6 M EUR on the same Turton vessel curve, 3.3 M EUR under three
separate ones (one vessel's cost grows more slowly than its volume).  It is
the 6.10 m of the two coolers' Kern shells stacked inside it at the full
2.23 m and 167 bar -- 4.2 M EUR of pressure wall -- while each cooler keeps
its own Turton exchanger cost too (0.49 and 0.48 M EUR, its own shell
included).  So the coolers' shells are counted TWICE: once as converter
height, once inside their exchanger price.  Whether a real converter would
stack them at full diameter (rather than in the centre of an annular bed,
or as a bundle in the transfer space) is a construction question this
sizer does not answer; the basis says so.  The comparisons this page used
to make were not at one diameter: three shells at their OWN L/D 1.5 (1.96,
2.50 and 3.00 m) cost 18.70 M EUR, and a first one-shell version built
around the widest of them, 3.00 m, cost 31.44 M EUR -- both figures measure
the diameters, not the grouping.

The fixed capital is 59.1 M EUR (61.0 M EUR before C69, with three separate bed shells at their own L/D 1.5;
41.4 M EUR at the feasibility stage, whose converter was one space-velocity
vessel and whose exchangers rested on an assumed U); the NPV at the base
case's appraisal knobs is −341 M EUR against −493 M EUR. The NPV moved from
the feasibility case because the energy bill did, much more than the
capital.

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

Eight pressure-relief valves are sized as `reliefValve` items of the sizing
pass, each one more item of the unit it protects (`design/<unit>/psv`) --
ONE on the converter's one shell (`design/CONVERTER/psv`) where its three
beds had one each while each was its own vessel. The
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
| CONVERTER/shell | 167 | outlet blocked | gas at 737 K | 159 923 | 3066 |
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
  items -- the CONVERTER's shell (and its three bed baskets, sized as
  vessels) and the Separator -- are designed at 167 bar in
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
* **No fire case on the converter or the Separator.** The converter holds
  gas and no liquid, so nothing boils to carry the fire's heat away (its wall fails
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
  as 1 (the declared law is Eq 19 alone), and the law's own `caveats` say
  that is unpriced on every run: a real charge with diffusion-limited
  pellets is larger.
* **Bed 1's 515 °C is a criterion, not a result of optimisation**; the two
  interbed temperatures are author-set; no bed has been optimised against
  catalyst cost.
* **The gas viscosity and conductivity in every exchanger design are
  dilute-gas values** (Chung, Eucken), as in the base case; the Kern
  sheets carry their correlation-window warnings.
* **The cost is a study-type estimate** (see the top of this page).

## What this case does NOT claim

* A converter's internals: the one shell is its members STACKED at the
  beds' one diameter (no head space, cooling annulus, cartridge,
  distributor, support grid or plenum); no quench.
* Catalyst life or reduction, the pellet's diffusion correction (Eq 39:
  the particle is declared, but only the Ergun drop reads it -- the beds
  run Eq 19 alone), a radial-flow bed, or a start-up heater: the loop is
  lit by the FEHE alone, and the converged state is the one a group should
  check is reachable.
* A low-pressure loop: the Dyson & Simon kinetics are for an iron catalyst,
  and the 50 bar speculation stays at the feasibility stage
  ([`greenAmmonia02_feasibility50bar`](../greenAmmonia02_feasibility50bar)).
* Everything the base case lists as not in it (the purge scrubber, the
  let-down gas recovery, the cooling-water, refrigeration and steam
  systems as equipment).
