# column16_declared_interior — the interior the case declares

Physically this is `column01_benzene_toluene`:
equimolar benzene/toluene, Raoult VLE, **15 stages** (reboiler counted), feed
on **stage 8**, **R = 2**, distillate **50 kmol/h**, Wang–Henke.  The answer is
the same answer — **x_D = 0.9812** benzene, **x_B = 0.9812** toluene.  What
differs is where the iteration **starts**.

## A state directory is a restartable snapshot

In OpenFOAM a time directory holds one file per **field**, and that file
carries `boundaryField` *and* `internalField`: the conditions at the edges of
the domain and the values inside it, together, so the directory is a complete
snapshot you can restart from.

Choupo's `0/` used to carry only the boundary half — one file per stream —
while what each unit held *inside* it existed nowhere a case could declare.
Since 2026-09-06 a state view carries both:

```
0/<stream>                       a stream: one file, flat        (the boundary)
0/internalStates/<unit>          a unit's interior: ONE file per unit, one
                                 block per kind                  (what it holds)
```

This case declares `0/internalStates/column16` — a `stageProfile` block with
T and the liquid and vapour compositions on all fifteen stages, in exactly the
grammar the run writes to `converged/internalStates/column16`.  **The same
object travels both ways.**  Run the case, copy the file from
`converged/internalStates/` into `0/internalStates/`, and the next run starts
where the last one finished.  The interiors have their own root because a
unit and a stream may share a name — identity is (kind, sector, name), never
name alone.

## A declared profile is a SEED, not an answer

Nothing checks this file against the column equations.  The iteration does
that, and it moves off any profile that is wrong.  Edit a stage temperature by
fifty kelvin and the column still converges to the same distillate — it simply
has further to travel.

What *is* checked is that the declaration describes **this** column: the stage
count against `nStages`, the component set against the case's, every value
finite.  A mismatch **refuses by name** and says how to fix it.  A seed
silently ignored would be exactly the silence this case exists to end.

## Why it exists at all — the silence it closes

Until this slice the column seeded its own interior in code, `DistillationColumn.H`:
*"Initial T-profile (linear between guesses)"*.  Undeclared, unseen, unowned —
the one solver aid in Choupo that broke the 2026-05-30 rule that **every**
aid is explicit in a dict and announces itself when it binds.  Now the unit
says which route it took, on every run, both ways:

```
[seed] interior read from 0/ (stageProfile): 15 stages, T 354.21 .. 382.89 K
       (WangHenke) -- a declared profile is a SEED, not an answer: the
       balances still decide
```

and, with nothing declared:

```
[seed] interior seeded by the unit: linear T between the guesses, feed
       composition on every stage (WangHenke) -- declare a stageProfile block
       in 0/internalStates/<SECTOR>/<unit> to own it
```

## Try it

Run the case and read the `iterations` KPI.  Then delete `0/internalStates/` and run
it again.  Both runs reach the same column; only one of them had to search for
it.  That difference is the whole value of a restartable snapshot — and it is
why an interior is **state** and not a report.

Record: `docs/design/a-state-directory-is-a-restartable-snapshot.md`.
