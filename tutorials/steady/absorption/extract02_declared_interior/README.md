# extract02_declared_interior — the interior the case declares

Physically this is `extract01_ethanol_water_benzene`: recover **ethanol** from
a dilute aqueous feed with **benzene**, five theoretical stages,
counter-current, UNIFAC for both liquid phases, each stage split by the shared
Gibbs-minimisation LL flash. The answer is the same answer — ethanol recovery
to the extract **44.2 %**, distribution **0.555**. What differs is where the
cascade **starts**.

*Same to the digits above, not to every digit:* both runs stop inside the same
1e-4 mass-closure target, and they stop at slightly different points inside it
(recovery 0.44157 here against 0.44176 unseeded). That is what a restart from
an answer looks like — it is not obliged to take the same path back — which is
why this case carries its own golden rather than sharing `extract01`'s.

## A state directory is a restartable snapshot

In OpenFOAM a time directory holds one file per **field**, and that file
carries `boundaryField` *and* `internalField` — the conditions at the edges of
the domain and the values inside it, together, so the directory is a complete
snapshot you can restart from.

Choupo's state views carry both halves too:

```
0/<stream>                       a stream: one file, flat        (the boundary)
0/internalStates/<unit>          a unit's interior: ONE file per unit, one
                                 block per kind                  (what it holds)
```

This case declares `0/internalStates/extractor01` — a `stageProfile` block
with the extract and raffinate leaving each of the five stages and their
compositions, in exactly the grammar the run writes to
`converged/internalStates/extractor01`. **The same object travels both ways.**

## What the cascade's interior *is*

The extractor's unknowns **are** its stage profile. The sweep starts by
putting something on every stage and grinding the counter-current balance
down; until this slice that something was written in code — *"every stage's
extract = the fresh solvent, every stage's raffinate = the feed"* — honest,
built from the streams the case declares, and **undeclared, unseen, unowned**.
That is the one thing the 2026-05-30 rule forbids: every solver aid is
explicit in a dict, and the solver announces what it does to converge.

Both routes now speak, on every run:

```
[seed] interior read from 0/ (stageProfile): 5 stages, extract F 3.5929e-02
       .. 3.5566e-02 kmol/s -- a declared profile is a SEED, not an answer:
       the balances still decide
```

and, with nothing declared:

```
[seed] interior seeded by the unit: the fresh solvent as every stage's
       extract, the feed as every stage's raffinate -- declare a stageProfile
       block in 0/internalStates/<SECTOR>/<unit> to own it
```

## A declared profile is a SEED, not an answer

Nothing checks this file against the stage equilibria. The sweeps do, and they
move off any profile that is wrong. Edit a stage's extract flow by half and
the cascade still converges to the same recovery — it simply has further to
travel.

What *is* checked is that the declaration describes **this** cascade: the
stage count against `stages`, one `xE_` and one `xR_` column
per component of the case and none for a component it does not have, every
value finite, no negative flow. A mismatch **refuses by name** and says how to
fix it. A seed silently ignored would be exactly the silence this case exists
to end.

One thing is deliberately *not* refused: a stage whose extract composition is
all zeros. That is what the writer emits for a stage where the LL flash found
no split, so refusing it would refuse the engine's own output — a writer whose
output its own reader rejects is a bug in both. The phase starts empty there,
and the run says how many stages it did that for.

## Try it

Read the `iterations` KPI here, then delete `0/internalStates/` and run again.

| run | sweeps |
|---|---|
| from the declared (converged) interior | **1** |
| from the seed the unit invents | **34** |

Both reach the same cascade; only one had to search for it.

`bin/choupo-init0` writes the third possibility: the unit's **own** seed,
materialised on disk so it can be read and edited. It is not a better guess —
it is exactly the guess the unit would have made in silence, and a case seeded
from it reproduces the unseeded answer to the twelve digits the file carries.

Record: `docs/design/a-state-directory-is-a-restartable-snapshot.md`.
