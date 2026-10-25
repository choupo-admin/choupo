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

What changed against the feasibility case — production, every consumption, the loop, the
converter, the investment and the NPV, each difference traced to what changed between the two
stages — is in the generated section
[From feasibility to basic design](#from-feasibility-to-basic-design-what-changed-and-why) below.

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

The margin after the energy, R − C_RM − C_UT, is about double the feasibility case's
(the numbers, by utility service, are in the generated section below). The difference is the feed/effluent exchanger the feasibility case's pinch
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
3.05 m coolers: 21.24 m), and walls it at 166 bar g: 82.8 m³, 147 mm of wall,
175 t, 16.79 M EUR total module.  The beds' own shells become internal
BASKETS -- sized and drawn, not costed.

**What the one shell costs against three, AT THE SAME DIAMETER** (measured:
the same design point with the `converterShell` entry removed, so each bed
keeps its own 166 bar g shell at 2.23 m): three shells 3.12 + 5.12 + 7.67 =
15.90 M EUR, against the one shell's 16.79 M EUR -- the ONE shell is
0.89 M EUR DEARER here, FCI 59.14 against 58.24 M EUR.  It is not the
grouping that costs more: a shell around the three beds ALONE (59.1 m³)
would be 12.6 M EUR on the same Turton vessel curve, 3.3 M EUR under three
separate ones (one vessel's cost grows more slowly than its volume).  It is
the 6.10 m of the two coolers' Kern shells stacked inside it at the full
2.23 m and 166 bar g -- 4.2 M EUR of pressure wall -- while each cooler keeps
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

The fixed capital at 59.1 M EUR was 61.0 M EUR before C69, with three separate bed shells at
their own L/D 1.5; how it and the NPV compare with the feasibility case, and why, is in the
generated section below.

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
producing less in years 1 and 2 loses LESS, while the compounded capital
and the start-up cost weigh the other way; what the start-up years move the NPV by, net, is
measured in the generated section below. The run prints the table
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
| N2Boost | 33 | discharge blocked | gas | 41 181 | 1741 |
| MakeupComp1 | 73 | discharge blocked | gas | 50 071 | 1673 |
| MakeupComp2 | 166 | discharge blocked | gas | 50 071 | 762 |
| RecycleComp | 166 | discharge blocked | gas | 109 853 | 1387 |
| CONVERTER/shell | 166 | outlet blocked | gas at 737 K | 159 923 | 3084 |
| Separator | 166 | gas line, liquid line | gas line | 109 947 | 1368 |
| LetdownHP | 21 | gas line, liquid line, fire | liquid line | 49 849 | 362 |
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

* **Relief does not cure an under-rated shell.** The run warns that every
  item of the loop designed at 166 bar g -- the CONVERTER's shell, its three
  bed baskets and two interbed coolers, the Separator, the loop's other
  exchangers and its two compressors -- is in a material whose record rates
  100 bar (`[rating] WARNING`; the exchangers and compressors have been
  compared since DEV.md 4c C86). A valve set at 166 barg protects a vessel built for 166 barg;
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
  relieving pressure (1.21 x 166 barg) is above ammonia's critical pressure
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

<!-- BEGIN GENERATED: bin/curate/gen_ammonia_stage_comparison.py -->
<!-- Generated from three engine runs of the two cases; do not edit by hand.  Regenerate with `bin/curate/gen_ammonia_stage_comparison.py`; `bin/runTests` fails when this section no longer matches the engine. -->

## From feasibility to basic design: what changed, and why

The same plant at two stages: [`greenAmmonia02_feasibility150bar`](../greenAmmonia02_feasibility150bar) (illustrated design stage FEL-2) and this case (FEL-3, process side). Both declare `estimateClass 4` with the same -30 / +50 % band: the class is the author's statement of how far the project is defined, so it did not move with the stage. Every number below comes from the engine's runs of the two cases (the one exception is labelled where it appears); the *why* column traces each difference to what changed between them, and says so where a difference could not be traced. The 50 bar alternative is a different design, not a stage, and is not a column here.

**Read this first: most of the NPV difference is NOT the better models.** The feasibility flowsheet has no feed/effluent exchanger *by construction* — its converter feed is heated by molten salt bought as a utility, which its own pinch pass says the next stage can recover — and this case builds that exchanger. That one flowsheet decision is worth more than the whole NPV difference; the model refinements (kinetic beds, Ergun, Kern, one converter shell, a costed catalyst) together move the NPV the OTHER way. The appraisal's start-up years are a changed assumption, measured separately below.

### Production and consumptions

| quantity | feasibility | basic design | difference | why |
|---|---|---|---|---|
| NH₃ produced, t/day | 1 180.35 | 1 180.16 | -0.18 | Both stages buy the same declared make-up, so production moves only by what the purge and the let-down gas carry out: the beds convert less per pass, the loop recirculates more, and the purge (a fixed fraction of the recycle) is larger. *Reactor model.* |
| NH₃ produced, t/yr | 387 744 | 387 684 | -60 | 7884 h/yr on stream in both (`streamFactor` 0.9). |
| H₂ consumed, kg/t NH₃ | 180.8 | 180.8 | +0.0 | The same feed over a slightly smaller product. *Reactor model* (through the purge). |
| H₂ consumed, t/yr | 70 093 | 70 093 | +0 | Declared make-up: identical. |
| N₂ consumed, kg/t NH₃ | 837.3 | 837.5 | +0.1 | As H₂. |
| N₂ consumed, t/yr | 324 670 | 324 670 | +0 | Declared make-up: identical. |
| electricity, kWh/t NH₃ | 292.6 | 293.9 | +1.3 | Every compressor's shaft power is DECLARED. The one change: the recycle compressor, re-tuned by the author from 850 to 908 kW so the loop sits again at the base case's pressure against the beds' Ergun drop. *Pressure-drop model, and an author's re-tune — not a computed compression.* |
| electricity, GWh/yr | 113.45 | 113.93 | +0.48 | As above. |
| converter-feed heating BOUGHT (molten salt), kWh/t NH₃ | 1 237.5 | 0.0 | -1 237.5 | The feasibility flowsheet has no feed/effluent exchanger by construction, so the feed is heated by molten salt bought as a utility; here the FEHE carries 64.07 MW from bed 3's effluent. *Flowsheet decision (heat recovery built), not model fidelity* — the feasibility's own pinch pass targets a minimum heating of 0.00 MW. |
| converter-feed heating bought, GWh/yr | 479.85 | 0.00 | -479.85 | As above. |
| HP steam raised (credit), t/t NH₃ | 1.322 | 1.264 | -0.058 | The steam is the reaction heat less what heats the loop gas from the converter inlet to its outlet. The ammonia formed per pass is the same (2 927.7 / 2 927.3 kmol/h: the make-up fixes it), so the reaction heat is too; but the beds' gas is heated through 84.2 K against the Gibbs reactor's 80.0 K, and there is 5.1 % more of it, so more of the heat leaves with the effluent (to the FEHE) and less is raised — in the two interbed coolers, not inside the converter. *Reactor model.* |
| HP steam raised, MW | 30.95 | 29.59 | -1.36 | As above. |
| cooling water, kWh/t NH₃ | 1 633.5 | 398.5 | -1 234.9 | The effluent cooler's duty is gone into the FEHE, and the water cooler starts from the FEHE's hot outlet (65.2 °C) instead of the effluent cooler's declared 72.0 °C. *Heat recovery built.* |
| cooling water circulated, t/t NH₃ | 140.7 | 34.3 | -106.4 | As above. |
| refrigeration (−20 °C chiller), kWh/t NH₃ | 411.6 | 437.8 | +26.1 | More gas reaches the chiller (the larger recycle) carrying the same ammonia to condense. *Reactor model.* |
| refrigeration, GWh/yr | 159.60 | 169.71 | +10.11 | As above. |
| LP steam (drum heating), kWh/t NH₃ | 1.80 | 1.75 | -0.05 | Follows the separator's flows. |
| duty no catalogue utility serves, kW | 736.7 (StorageFlash) | 736.4 (StorageFlash) | -0.3 | The product flash at −35 °C, below every catalogue refrigerant: unpriced in BOTH, so both utility bills are lower bounds. The same gap, not a difference. |

### The loop and the converter

| quantity | feasibility | basic design | difference | why |
|---|---|---|---|---|
| converter outlet NH₃, mol % | 19.70 | 18.71 | -0.99 | Gibbs: 5 K short of equilibrium at a declared 460.0 °C and 150.0 bar. Beds: adiabatic, bed 1 stopped at 515 °C (the catalyst-limit criterion), beds 2 and 3 at a 5 K approach. Three causes, their shares NOT separated here: the last bed leaves 3.9 K hotter and 1.06 bar lower (Ergun), and its approach is measured against the rate law's own equilibrium constant, not the package's Gibbs energy. *Reactor model.* |
| recycle / make-up, mol/mol | 2.275 | 2.442 | +0.166 | Less conversion per pass, the same ammonia per pass: more gas goes round. *Reactor model.* |
| purge, kmol/h | 11.38 | 12.21 | +0.83 | A declared fraction of the recycle in both, so it follows the recycle. |
| catalyst volume, m³ | 21.58 | 59.06 | +37.48 | Rule → criterion. Feasibility: a vessel sized on an ASSUMED space velocity (20 000 Nm³/(m³ h), normal basis). Basic design: the three bed volumes SOLVED by the rate law against 515 °C and two 5 K approaches; the last bed alone is 31.70 m³, because the rate collapses near equilibrium. *Reactor model; the rule of thumb was optimistic here.* |
| converter pressure vessel, m³ (D × H, m) | 21.58 (1.66 × 9.96) | 82.83 (2.23 × 21.24) | +61.25 | Feasibility: the space-velocity vessel at a declared L/D. Basic design: ONE shell holding the three beds and the two interbed coolers stacked at the beds' one diameter, which the DesignSpec solves so the largest bed drop meets its 1 bar budget (DEV.md 4c C69). *Reactor model + one-shell construction.* |
| converter pressure drop, bar | 0.93 | 1.93 | +1.01 | Feasibility: no flow model — the number is the loop pressure minus the Gibbs reactor's DECLARED 150 bar. Basic design: Ergun integrated along each bed (0.31 + 0.62 + 1.00 bar). *Pressure-drop model.* |
| loop pressure drop, recycle compressor discharge → separator, bar | 10.93 | 10.88 | -0.05 | Set in BOTH by the separator's DECLARED 140 bar and the declared compressor powers. The exchangers' Kern pressure drops are computed on their design sheets and NOT applied to the streams, so only the converter's share of this drop is modelled, and only at the basic design. *No difference by construction — not a measured agreement.* |

### Investment

Bare-module cost C_BM by equipment group, M EUR. FCI = 1.18 ΣC_BM + 0.50 ΣC_BM⁰, C_BM⁰ the same items at carbon steel and 1 bar (Turton's grassroots rule, the same in both), so a group's FCI effect below can differ in sign from its C_BM difference when its materials or pressures changed.

| equipment group | feasibility | basic design | difference | why |
|---|---|---|---|---|
| compressors (4) | 12.53 | 12.60 | +0.06 | The recycle compressor's declared power, 850 → 908 kW (above). *Pressure-drop model.* |
| converter pressure vessel | 3.67 | 14.23 | +10.56 | The space-velocity vessel → one shell around beds and coolers at 166 bar g. The coolers' shells are counted twice (here as converter height, and again inside their own exchanger cost), an over-estimate C69 names. *Reactor model + one-shell construction.* |
| catalyst charge | — | 2.21 | +2.21 | NOT COSTED at feasibility (the vessel carries no charge); here the solved volume × a declared bulk density × a declared price, both author-set. *Scope: a cost the earlier stage left out.* |
| feed heating / effluent cooling exchangers | 2.15 | 2.14 | -0.01 | Feed heater + effluent cooler on assumed U (658 + 689 m²) → one FEHE designed by Kern (1 821 m², U 483 W/m²/K). *Heat recovery built.* |
| interbed coolers | — | 0.82 | +0.82 | New equipment: the beds need their heat removed between them. *Reactor model.* |
| the five other exchangers | 2.39 | 2.28 | -0.11 | Assumed U → Kern design (e.g. the aftercooler's U 500 → 642 W/m²/K); the chiller's duty grows with the recycle. *Exchanger model.* |
| separator and let-down drums (3) | 4.35 | 4.68 | +0.33 | The separator is sized on its gas flow, which the larger recycle raises (25.16 → 27.00 m³). *Reactor model, through the recycle.* |
| NH3 storage tanks (2) | 2.49 | 2.49 | -0.00 | Sized on the product flow: no material difference. |
| relief valves | — | not costed | — | Sized here (API 520) and NOT costed by rule (DEV.md 4c C62); none at feasibility. No cost difference — a scope difference. |
| **ΣC_BM** | 27.58 | 41.45 | +13.87 | |

| appraisal | feasibility | basic design | difference | why |
|---|---|---|---|---|
| FCI, M EUR | 41.38 | 59.14 | +17.75 | The equipment above, through the same Turton rule. |
| working capital, M EUR | 52.63 | 49.71 | -2.92 | Built up from the same days: the product stock is valued at the cost of manufacture and the minimum cash is 15 days of it, so both fall with COM_d. |
| TCI, M EUR | 94.02 | 108.85 | +14.83 | FCI + WC. |
| revenue R, M EUR/yr | 387.73 | 387.67 | -0.06 | The production above, at the same price. |
| raw materials C_RM, M EUR/yr | 331.65 | 331.65 | +0.00 | The same declared make-up at the same prices. |
| utilities C_UT (net of the steam credit), M EUR/yr | 31.50 | 6.21 | -25.28 | Almost all of it the molten salt no longer bought; the split by service is in the decomposition below. |
| operating labour C_OL, M EUR/yr | 1.114 | 1.156 | +0.042 | Turton's operator count from a DECLARED equipment count `N_np`: 12 (4 compressors, 7 exchangers, 1 reactor) → 15 (4, 8, 3 beds). The three beds share one shell; counting them as three is the author's choice. |
| COM_d, M EUR/yr | 457.17 | 429.38 | -27.79 | 0.180 FCI + 2.73 C_OL + 1.23 (C_RM + C_UT): the utilities fall, the capital-driven term rises. |
| R − C_RM − C_UT, M EUR/yr | 24.58 | 49.80 | +25.22 | An upper bound in both (the unpriced −35 °C duty). |
| construction and start-up | 1 yr, all capital at start-up; full production from year 1 | 3 yr, capital ( 0.25 0.45 0.3 ); ramp-up ( 0.7 0.9 ); start-up cost 0.08 × FCI | — | **A changed ASSUMPTION** (author-set, DEV.md 4c C63), not a consequence of any model; its effect is measured below. |
| discount rate, tax, life | 0.1, 0.21, 15 yr | 0.1, 0.21, 15 yr | — | The same; the script fails if any appraisal input it does not trace differs. |
| NPV at 10 %, M EUR | -493.07 | -340.93 | +152.15 | Decomposed below. |
| IRR | not defined (NPV(i) has no sign change) | not defined (NPV(i) has no sign change) | — | The plant loses money in every operating year at these prices, in both. |
| discounted payback | never within the project life | never within the project life | — | As IRR. |
| estimate class (declared) | 4 (-30 / +50 %) | 4 (-30 / +50 %) | — | The author's statement of the project's definition. A design stage is not an AACE class: the cost method is Turton's equipment-factored estimate at both stages. |

### Where the NPV moved

From -493.07 to -340.93 M EUR. The first step re-runs the feasibility case with the basic design's start-up years — a changed ASSUMPTION, measured by the engine. The remaining steps are the plant's differences at the basic design's timeline: the engine's cash-flow rule is linear in each of them, so they split exactly (this script reproduces the engine's NPV of all three runs before it prints a single row).

| step | NPV effect, M EUR | kind of change |
|---|---|---|
| feasibility, as published | -493.07 | |
| the appraisal's start-up years (construction 1 → 3 yr, ramp-up, start-up cost), measured by re-running the feasibility case with them | +10.13 | **changed assumption** |
| revenue: slightly less ammonia (the purge) | -0.34 | reactor model |
| cooling water (the effluent cooler gone into the FEHE) | +4.86 | **heat recovery built** |
| electricity (recycle compressor re-tuned for the Ergun drop) | -0.34 | pressure-drop model |
| converter-feed heating no longer bought (molten salt) | +182.56 | **heat recovery built** |
| refrigeration (more recycle through the chiller) | -4.06 | reactor model |
| HP steam credit (less steam raised) | -4.89 | reactor model |
| LP steam (drum heating) | +0.01 | reactor model (flows) |
| operating labour (N_np 12 → 15, a declared count) | -0.68 | count |
| capital: compressors (4) | -0.23 | pressure-drop model |
| capital: converter pressure vessel | -26.49 | reactor model + one shell |
| capital: catalyst charge | -7.82 | **scope** (not costed before) |
| capital: feed heating / effluent cooling exchangers | +0.03 | **heat recovery built** |
| capital: interbed coolers | -2.33 | reactor model |
| capital: the five other exchangers | +0.35 | exchanger model |
| capital: separator and let-down drums (3) | -0.82 | reactor model |
| capital: NH3 storage tanks (2) | +0.00 | reactor model (production) |
| working capital (follows COM_d) | +2.22 | follows the above |
| **basic design, as published** | **-340.93** | |

| by kind | NPV effect, M EUR |
|---|---|
| heat recovery built | +187.45 |
| model fidelity | -39.16 |
| scope (not costed before) | -7.82 |
| changed assumption | +10.13 |
| count | -0.68 |
| follows the above | +2.22 |

**So:** building the heat recovery the feasibility flowsheet left out is worth +187.45 M EUR — more than the whole difference. The model refinements together are worth -39.16 M EUR (the converter shell around a catalyst volume 2.7 times the space-velocity rule's, the interbed coolers, less steam, more refrigeration), costing the catalyst the feasibility left out -7.82, and the start-up years +10.13. A student who reads the +152.15 M EUR as "the better model found money" has it backwards: at feasibility the same exchanger was already visible in the pinch target, and the better models made the plant dearer.

**The start-up years are worth a different amount on each plant, and that is not a rounding matter.** On the feasibility plant (engine run) they move the NPV by +10.13 M EUR; on the basic-design plant by -1.33 M EUR (this one computed with this script's transcription of the cash-flow rule, which reproduced the engine's three NPVs — not an engine run). Two parts of the timeline scale with the plant and pull opposite ways: both plants lose money in every operating year at these prices, so the ramp-up (producing 70 % and 90 % in the first years) loses LESS, and gains more on the plant that loses more per year — the feasibility one; while the capital compounded over the construction years and the start-up cost weigh more on the plant with the larger FCI — the basic design. Taken in that other order — the plant first, at the feasibility's one-year timeline — the plant differences are worth +153.48 M EUR instead of +142.01.

**Not comparable, and said rather than adjusted:** the catalyst charge is costed only at the basic design; the 8 relief valves exist only at the basic design and are costed at neither; the interbed coolers' shells are counted twice at the basic design; the FEHE is costed at its designed 1 821 m² while the flowsheet converges on a declared 2 000 m²; and the start-up years were declared only for the basic design.
<!-- END GENERATED: bin/curate/gen_ammonia_stage_comparison.py -->

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
