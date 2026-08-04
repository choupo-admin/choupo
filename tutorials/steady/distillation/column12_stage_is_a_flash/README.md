# column12 — an equilibrium stage IS a flash

**What it demonstrates:** that Choupo's two independent equilibrium
routines — the column's MESH equations and the flash drum's Rachford-Rice
— give the same answer, by making them say it to each other inside one
run.

## The construction

```
feed ──▶ [tower: 15-stage MESH column] ──▶ distillate
                                       ──▶ bottoms
                                       ──▶ stageLiquid   ┐  the two halves
                                       ──▶ stageVapour   ┘  of stage 5

stageLiquid + stageVapour ──▶ [recombine: mixer] ──▶ stageMix
stageMix ──▶ [restage: adiabatic flash] ──▶ checkLiquid, checkVapour
```

Stage 5 is an equilibrium stage, so the vapour leaving it is in
equilibrium with the liquid leaving it.  Put them back together, let them
separate again at the same pressure with no heat added, and nothing may
happen.  The run must produce

| the column says | the flash says |
|---|---|
| `stageLiquid`  T = 371.8839 K, x(benzene) = 0.29215 | `checkLiquid`  the same |
| `stageVapour`  T = 371.8839 K, y(benzene) = 0.50143 | `checkVapour`  the same |
| draws 10 / 10 kmol/h                                | V/F = 0.500000 |

Not one of those numbers is typed into the case.  Both sides are computed,
by different code, and `bin/curate/check_stage_identity.py` compares them.

## What it is actually testing

Three things at once, and each of them has been wrong in a simulator
somewhere:

1. **The K-value definition.**  The column asks the package for K-values
   per stage; the flash asks it for a split.  A wrong normalisation or a
   wrong basis in one of them shifts the profile without ever making the
   column fail to converge.
2. **The enthalpy of each phase.**  The recombination carries an
   *enthalpy* across one arrow and the adiabatic flash reads it back.  If
   the column and the flash priced the vapour differently, the recovered
   temperature would be wrong even with perfect K-values.
3. **That a two-phase inlet is priced as two phases.**  Building this case
   is what found `adiabaticFlash` pricing every inlet as a sub-cooled
   liquid regardless of its vapour fraction — silently, since no case in
   the corpus had ever fed it one.

## The tolerance, honestly

The identity holds to about 1e-7 relative, not to machine precision, and
the reason is visible in the log: the adiabatic flash stops its outer
Newton at an energy residual of ~2.5e-4 J/mol out of 5.4e+4 J/mol.  That
is the limit of the *check*, not of the physics.  The gate is set at 1e-6
relative, which is a factor of ten of headroom over the observed
agreement.

## The one thing to know about `recombine`

A Choupo mixer mixes; it does not do the vapour/liquid split ("mixers mix,
flashes separate").  Handed a liquid and a vapour it conserves total
enthalpy exactly and reports a single dominant phase at whatever
temperature carries that enthalpy — here 182.88 K, a fictitious
sub-cooled vapour that appears in the stream table and means nothing on
its own.  It is a faithful enthalpy carrier, which is all this case asks
of it, and the adiabatic flash downstream reads that enthalpy back on the
same surface.  A student who is puzzled by 182 K in the stream table has
understood the case correctly; the answer is that `stageMix` is not a
physical state, it is a bookkeeping entry between two units.

## Running it

```bash
runCase tutorials/steady/distillation/column12_stage_is_a_flash
bin/curate/check_stage_identity.py
```
