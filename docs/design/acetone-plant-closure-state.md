# The acetone plant: what closes, what does not, and the one gap left

**Status: WORK IN PROGRESS.  The flowsheet is written and six of its eight
units run; it is blocked on ONE named engine gap and is deliberately NOT in
`tutorials/` until it converges.**  Recorded 2026-08-13 so the state is a
document rather than a memory.

The dictionaries are in [`acetone-plant-wip/`](acetone-plant-wip/), beside
this record; that directory's README says why they are not in the corpus and
what has to be true before they move there.

Programme record: [`acetone-ipa-reference-case.md`](acetone-ipa-reference-case.md).

## What the closed flowsheet is

Luyben's Figure 1, end to end, on the thermodynamics Choupo actually has:

```
freshFeed + ipaRecycle -> M1 -> vaporiser -> reactor -> separator
                                          -> absorber -> M2 -> vent -> C1 -> acetoneProduct
                                                                          -> B1 -> C2 -> waterProduct
                                                                                      -> ipaRecycle (TEAR)
```

## What already works, and it is most of it

1. **The topology closes and the tear is cut correctly.** The
   sequential-plan contract validates the plan and announces the cut:
   `[plan] material recycle: tear 'ipaRecycle' cuts M1 -> vaporiser ->
   reactor -> separator -> M2 -> C1 -> C2 --ipaRecycle--> M1`.

2. **TWO THERMODYNAMIC WORLDS IN ONE PLANT, and the plant does not run
   without them.** Handed the global gammaPhi/UNIFAC package the absorber
   REFUSES by name -- Kremser reads Henry's law and an activity model carries
   no answer it can use. It gets its own `thermo {}` block (water solvent on
   Raoult, acetone solute on Henry) and the run announces the boundary:
   `[thermo-override] unit 'absorber': equilibrium <- LOCAL override, WHOLE
   block (formulation gammaPhi -> diluteSolution)`. This is the settled
   heterogeneous-thermo architecture exercised on a published flowsheet
   rather than on a demonstration.

3. **Both columns converge on the plant's own streams** -- C1 in 7 Newton
   iterations to |F| 2.1e-10 once the vent is in place, C2 likewise.

## THREE ENGINE FINDINGS, each reproduced

### F1 -- a declared approximation was not locally contained

Hydrogen runs at gamma = 1 outside the activity model (authorised by name; no
UNIFAC group for hydrogen exists and inventing one would be fabrication).
`acetone03` recorded this as "right for the wrong reason" with a stated small
local effect: H2 leaves the separator almost entirely in the vapour, which is
correct, via a vapour pressure extrapolated far above its 33.18 K critical
temperature.

The residue it leaves in the flash LIQUID is 6.8e-4 against Luyben's 2e-4 --
and that residue **breaks the rigorous MESH three units downstream**.
Measured on the plant's own F1, at four distillate rates (24, 26, 27,
32.25 kmol/h):

| feed | outcome |
|---|---|
| with H2 at 6.8e-4 | **diverges**: |F| 6.2e+12 after 3 iterations, x_D(IPA) NEGATIVE |
| same feed, no H2 | **converges**: 8 iterations, |F| 2.2e-14 |

A supercritical permanent gas at K ~ 1e3-1e4 wrecks the Jacobian. **This is
the clearest thing the plant has to teach so far**: an approximation whose
local effect was measured and judged small was not locally contained, and the
composition of six units is where that showed.

### F2 -- the plant cannot honour Luyben's product rate, and that is the result

His C1 distillate of 32.25 kmol/h is the acetone in HIS feed. This plant
delivers only ~26.6 kmol/h of acetone to C1, because the separator sends 2.9x
too much acetone to the vapour (`acetone03`) and the absorber recovers a sixth
of what the paper does (`acetone05`). Asked for 32.25 the column would have to
make up the balance with water.

The spec is therefore carried over rather than the number: send overhead the
acetone that arrives, at the azeotropic ceiling `acetone06` measured. That is
a **declared divergence**, not a tuning -- the resulting rate is 16 % below
his, which is the finding, not an improvement.

### F3 -- CLOSED 2026-08-13: the refusal was an inconsistency, not a gap

The blocker was recorded here as "no unit can remove a component completely",
with two candidate remedies (per-component recoveries on `splitter`, or a
partial condenser on `distillationColumn`). **Neither was needed, and building
either would have been a workaround for an engine defect.**

`ThermoPackage::speciesPhaseEnthalpy` -- the formation-datum leg -- had
handled a component with no `liquidHeatCapacity` since it was written, by an
ANNOUNCED Watson-slope fallback documented in place as the right treatment for
"a permanent / supercritical gas appearing as a dissolved trace in a liquid
stream". `Component::Hliq_pure` -- the sensible leg, reached through
`ThermoPackage::Hliquid` -- REFUSED HARD on the identical condition. Same
component, same missing datum, two behaviours in one run; C1 converged and
then refused to price its condenser **four lines after its own log announced
the fallback for that very component**.

Both legs now take the fallback, and the two refusals that must survive it
are pinned: a `role nonvolatile;` component still refuses naming the role (the
ideal-gas reference is forbidden for it, settled 2026-06-29), and a component
with neither heat capacity still refuses naming both blocks. Gate:
`check_liquid_cp_fallback`.

**The vent flash stays**, for the other half of F1: the MESH divergence at
H2 6.8e-4 is a Jacobian problem, not an enthalpy one, and removing the bulk of
the hydrogen before the column is the physical thing to do anyway.

### F4 -- THE TWO CEILINGS INTERACT THROUGH THE RECYCLE

With the enthalpy legs consistent, the open-loop chain runs end to end: all
eight units solve, C1 converges in 7 Newton iterations to |F| 2.1e-10 and
prices its condenser. The closed loop did not.

Wegstein moved the tear twice -- |r| 3.86 -> 1.20, so it was converging -- and
then C1 failed on the third pass. Newton failed on the first, before printing
an iteration, because its Jacobian perturbation pushed the tear somewhere C1
could not solve.

The mechanism is physical and is the plant's own finding. C2's overhead is
capped by the IPA/water azeotrope, so the recycle returns **wetter** than
Luyben's; a wetter recycle carries less isopropanol; less isopropanol makes
less acetone; and C1's distillate rate -- a FIXED number -- becomes infeasible
again as the loop tightens. **The two column ceilings are coupled through the
recycle**, which is exactly what a closed flowsheet shows and six isolated
units cannot.

### F5 -- `distillateRecovery`: the specification the loop needed, and what it costs

A rate is the wrong specification for a column inside a recycle, because the
quantity the design actually fixes is a RECOVERY. `distillateRecovery {
component <name>; fraction <f>; }` now says "send this fraction of the named
component's feed overhead", implemented as an ANNOUNCED outer secant on the
rate around the existing solve -- so it wraps either method, and the MESH
residual every existing column golden is recorded against is untouched. Five
column cases verified unmoved, including the two acetone columns and the
reactive `column13`.

Three things it had to learn, each from a failed run rather than from thought:

1. **The feasible region has a real boundary.** Asked for a rate that needs
   more light material than the feed carries, the MESH does not converge --
   that is physics, not a wobble. The first version treated an inner failure
   as fatal and killed the plant on its second guess; the search now RETREATS,
   halving back towards the last feasible rate and announcing when it does.
2. **The search must start from below.** The pure-distillate rate (recovery x
   feed of the component) is a lower bound any real column exceeds, so the
   secant steps up from it and never down into a region where the recovery is
   unreachable at all.
3. **Cold, it is unaffordable inside a recycle.** Each outer evaluation is a
   full 66-stage MESH; multiplied by a recycle Jacobian and the recycle's own
   iterations, the plant was still grinding after eleven minutes at 200 % CPU,
   re-solving each pass a problem whose answer had barely moved. The accepted
   rate is now remembered between passes and announced as a warm start.

**STATE: the code is in and verified against the existing corpus; the closed
plant has NOT yet been run to convergence with it.** That is the next step and
it is the only thing between here and the stream table.

## What is NOT claimed here

No number in this document is a validation. The plant reproduces Luyben's
TOPOLOGY and his EQUIPMENT SPECIFICATIONS; it does not reproduce his stream
table and the siblings measured, in advance, exactly why it cannot. When it
converges, the comparison will be published with the same posture as
`acetone06` and `acetone07`: a comparison with a published reference, never a
validation, because every number in his table is his own Aspen/UNIQUAC output
rather than a measurement.
