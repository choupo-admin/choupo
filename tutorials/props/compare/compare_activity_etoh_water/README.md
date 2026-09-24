# compare_activity_etoh_water — three models, one mixture, no equipment

An equimolar ethanol/water liquid, held at **1 bar**, scanned from **280 K to
360 K in 41 points**, and asked for exactly one property: `gamma_ethanol`.
The same scan is run **three times** — `g_ideal`, `g_nrtl`, `g_wilson` — and
the only thing that changes between them is the activity model.  There is no
unit operation here on purpose: this is the thermodynamics that every unit in
the rest of the path will be standing on.

Each op writes its own curve (`gamma_ideal.csv`, `gamma_nrtl.csv`,
`gamma_wilson.csv`), and the case's `system/propsDict` says the three are
overlaid on one set of axes in the app.  The golden pins the SHAPE of the
result rather than the numbers: **41 points, 0 failures, 0 empty curves** for
each of the three ops.

## The lesson

1. **Ideal is a model, and this case declares it.**  The case's
   `constant/thermoPhysPropDict` says `activityModel ideal;` with a header
   that spells out why — *Raoult DECLARED, not defaulted*.  The `g_ideal`
   curve is flat at 1 across the whole 80 K span not because something was
   missing but because that is the answer the declared model gives.  An
   absence and a choice would draw the same line; only the dict tells you
   which one you are looking at.
2. **A `thermo {}` block overrides the models for one op only.**  All three
   ops declare the identical `vary` and `state` blocks; each carries its own
   `thermo { equilibrium { liquid { activityModel ... } } }`.  The components
   stay global — it is the MODEL that is swapped, never the mixture — which
   is the same per-unit override a flowsheet uses to run one unit in a
   different thermodynamic world.
3. **The dict owns the parameters, in the open.**  NRTL is declared with
   `a_ij -0.8009`, `b_ij 246.18`, `a_ji 3.4578`, `b_ji -586.0809`,
   `alpha 0.30`; Wilson with `A_ij 1157.95` and `A_ji 4081.65` in J/mol.
   Two models, two different parameter shapes, both written where you can
   read them.  Those four NRTL numbers are worth remembering: they reappear
   **verbatim** in `flash02_ethanol_water` and again in
   `column03_azeotrope_mesh`, which is how one thermodynamic decision travels
   through a curriculum.
4. **A property scan is a case like any other.**  `application choupoProps;`
   in `controlDict`, the work declared as a list of `operations` in
   `system/propsDict`, the same dict grammar, the same `.cho` marker, the
   same golden file.  Nothing about "just properties" is a lesser kind of
   run.

## What to try

Change `composition` in all three ops to `ethanol 0.05; water 0.95;` and run
again: the ideal curve does not move at all, and the other two do.  Activity
is a function of composition, and that is precisely the information the ideal
model does not carry.  Then open `flash02_ethanol_water`, where this same
mixture and these same NRTL parameters arrive in a unit operation and change
its answer.
