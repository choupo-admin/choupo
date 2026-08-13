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

### F3 -- THE BLOCKER: no unit can remove a component completely

`acetone06` established that a permanent gas fed to a TOTAL condenser is asked
to leave as a liquid, and the engine rightly refuses (`Component 'H2':
liquidHeatCapacity missing -- required for enthalpy`), because at 330 K
hydrogen has no liquid. Luyben's C1 has a PARTIAL condenser and vents it.

An explicit vent flash ahead of C1 fixes the MESH -- V/F 0.16 %, and what
leaves with the hydrogen is computed rather than assumed, directly comparable
to his 0.0465 kmol/h vent. But an equilibrium flash leaves a TRACE, and the
column's duty refusal is about PRESENCE, not amount. So the column converges
and then refuses to price its condenser.

**What is missing is a component-selective split.** `splitter` divides by ONE
fraction common to every species (it declares that: `materialMapping
proportionalExtensiveSplit`), and nothing else in the corpus removes a named
component.

**Two candidate remedies, and the choice is a design decision not yet made:**

* **(a) A per-component recovery on `splitter`** -- `operation { recoveries {
  H2 ( 1.0 0.0 ); } }` beside the existing proportional `fractions`. Cheap,
  and it makes the "this is a vent, and here is exactly what it removes"
  statement explicit and readable. Risk: a splitter that can separate is no
  longer a splitter, and the name would then lie.
* **(b) A partial condenser on `distillationColumn`** -- the physically
  faithful answer, since that is what Luyben has, and it would also let C1's
  vent loss be compared with his 0.0335 kmol/h directly. Much larger: it
  changes the MESH boundary condition at stage 1 and touches every column
  golden's condenser duty unless gated behind a declared option.

(b) is the right unit-operation answer and (a) is the right flowsheet answer;
they are not exclusive. **Neither is authorised yet.**

## What is NOT claimed here

No number in this document is a validation. The plant reproduces Luyben's
TOPOLOGY and his EQUIPMENT SPECIFICATIONS; it does not reproduce his stream
table and the siblings measured, in advance, exactly why it cannot. When it
converges, the comparison will be published with the same posture as
`acetone06` and `acetone07`: a comparison with a published reference, never a
validation, because every number in his table is his own Aspen/UNIQUAC output
rather than a measurement.
