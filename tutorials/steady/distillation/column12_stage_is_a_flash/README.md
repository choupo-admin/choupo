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

Since 2026-10-24 the identity holds to round-off: `restage` publishes
`T_drop` 0 and `H_residual` 0, and lands on V/F = 0.5 exactly.  Until then
it held to about 1e-7 relative -- the adiabatic flash stopped its outer
Newton at an energy residual of ~2.5e-4 J/mol, because `recombine` handed
it a single-phase stream at a temperature 189 K away from the stage's (see
below), and the flash had to walk all the way back.  The gate is still set
at 1e-6 relative.

## The one thing to know about `recombine`

`recombine` is an ADIABATIC mixer, and since 2026-10-24 its outlet is the
state of equal enthalpy RESOLVED at its own equilibrium, priced the way
the energy report prices every stream.  Handed the two halves of stage 5
it therefore publishes exactly what they are together: 371.8839 K and
V/F = 0.5, the stage's own temperature and the ratio of the two draws --
the identity already, one unit early.  It does not SEPARATE the phases
(one combined outlet); `restage` does, and finds nothing to do.

Before that date the mixer balanced its enthalpy on ONE dominant phase and
published that label, so `stageMix` appeared in the stream table as a
sub-cooled vapour at 182.88 K -- a bookkeeping entry, not a physical state.
The case still closed, because the adiabatic flash read the same enthalpy
back, but the stream table showed a temperature no fluid can have.

## Running it

```bash
runCase tutorials/steady/distillation/column12_stage_is_a_flash
bin/curate/check_stage_identity.py
```
