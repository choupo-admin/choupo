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
| `Bed1` | adiabatic `pfr`, Dyson & Simon (1968) rate law, iron catalyst | 8.72 m³, chosen so the bed **leaves at 515 °C**, 5 K under the 520 °C the base data give as the catalyst's limit; run to a 5 K approach it would leave above that |
| `InterbedCooler1` | `phaseChanger` to 420 °C, raising HP steam | 420 °C author-set |
| `Bed2` | the same rate law | 18.23 m³, chosen so the effluent is **5 K short of equilibrium** (US 5,352,428's per bed approach, the base case's source) |
| `InterbedCooler2` | to 410 °C, raising HP steam | 410 °C author-set |
| `Bed3` | the same rate law | 31.44 m³, the same 5 K criterion |

The rate law is the correlation object
`src/unitOperations/reactor/kinetics/AmmoniaSynthesisRate.{H,cpp}`, selected
by `kinetics { type dysonSimon1968; }` in `constant/reactions` (copied from
[`ammoniaStaged04_kinetic`](../ammoniaStaged04_kinetic), whose README is the
reference for it). The FEHE now preheats bed 1 against bed 3's effluent, an
energy recycle through three kinetic beds (the second tear in
`system/solverDict`). The recycle compressor's power was re-tuned to 908 kW
so the loop sits again at the base case's 150.9 bar.

**The bed volumes are DECLARED, chosen by running the case** — the base
case's posture for its compressor powers. They are not solved by a
DesignSpec, as `ammoniaStaged04_kinetic` solves its one bed, because a
`$variable` in a unit **folder** does not resolve against the plant's
`variables {}` block (measured: `Dictionary.cpp:788-792` refuses it), so an
outer driver cannot reach a unit that lives in its own folder. The run
prints each bed's `T_out` and `approach_K`: a group that changes anything
upstream re-tunes them.

Douglas's hierarchy: the same levels as the feasibility case, with level 5
— the heat-exchanger network — now built (the FEHE and the two interbed
boilers) instead of targeted.

## What the run shows

Every number is read off a run of this case; the golden (`expected`) is the
authority on all of them.

| bed | in | out | NH₃ out | approach | volume |
|---|---|---|---|---|---|
| 1 | 380.6 °C | 515.0 °C | 9.77 % | 35.1 K | 8.72 m³ |
| 2 | 420.0 °C | 494.0 °C | 14.79 % | 5.0 K | 18.23 m³ |
| 3 | 410.0 °C | 464.8 °C | 18.76 % | 5.0 K | 31.44 m³ |

| | this case | feasibility case |
|---|---|---|
| ammonia produced | 1180.2 t/day | 1180.3 t/day |
| converter outlet NH₃ | 18.76 % (three beds) | 19.70 % (one Gibbs reactor at 460 °C) |
| hydrogen converted per pass | 28.3 % | 29.7 % |
| recycle / make-up (mol/mol) | 2.43 | 2.28 |
| HP steam raised | 29.62 MW (17.3 kg/s), in the interbed coolers | 30.94 MW, in the converter |
| feed preheat | 64.01 MW by the FEHE, **recovered** | 60.86 MW of molten salt, **bought** |
| refrigeration (−20 °C) | 21.31 MW | 20.24 MW |
| compression | 13.73 MW | 13.67 MW |
| catalyst | 58.39 m³ | (none: a space-velocity vessel) |
| plant first law | closes to 1.76 kW (0.002 %) | 9.0 kW |

An adiabatic bed publishes no duty (`Q_kW` 0), so the steam is raised and
credited where the heat is removed — the two interbed coolers, each of
which declares the base case's case-local credit utility
`steamGenerationHP` and is held to the allocation's 10 K approach.

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
vessel at L/D 6, Turton's vessel set) and a **catalyst charge** priced
from two declared numbers, 2500 kg/m³ and 15 EUR/kg — **author-set
assumptions**, the same round numbers `ammoniaStaged04_kinetic` declares,
with no source behind either: 0.33, 0.68 and 1.18 M EUR for the three
charges. Each bed is its own shell here; a real converter stacks them in
one.

The fixed capital is 54.1 M EUR (41.4 M EUR at the feasibility stage, whose
converter was one space-velocity vessel and whose exchangers rested on an
assumed U); the NPV at the base case's appraisal knobs is −329 M EUR
against −493 M EUR. The NPV moved because the energy bill did, not the
capital.

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
* A bed pressure drop, catalyst life or reduction, pellet size, or a start-
  up heater: the loop is lit by the FEHE alone, and the converged state is
  the one a group should check is reachable.
* A low-pressure loop: the Dyson & Simon kinetics are for an iron catalyst,
  and the 50 bar speculation stays at the feasibility stage
  ([`greenAmmoniaFeasibility50bar`](../greenAmmoniaFeasibility50bar)).
* Everything the base case lists as not in it (the purge scrubber, the
  let-down gas recovery, the cooling-water, refrigeration and steam
  systems as equipment).
