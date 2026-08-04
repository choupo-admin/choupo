# column13 — the stage identity, under chemistry

**What it demonstrates:** a distillation column solved under an aqueous
equilibrium, and the proof that the effective K-value it uses per stage is
the same equilibrium a flash computes — checked through two independent
code paths, on the apparent components *and* on the ions.

Read `column12_stage_is_a_flash` first.  This is the same construction; only
the thermodynamic package differs.

## The column

Four stages, sour water (NH₃ + CO₂ in water), 1 atm, R = 2, D = 3 kmol/h.
It converges in **7 Newton iterations to ‖F‖ ≈ 8e-10**, and the profile is
the physics:

| stage | T [K] | x(NH₃) | x(CO₂) | y(NH₃) | y(CO₂) |
|---|---|---|---|---|---|
| 1 (top)      | 354.63 | 0.0459 | 0.0097 | 0.3028 | 0.2367 |
| 2            | 367.34 | 0.0132 | 0.0022 | 0.1316 | 0.0854 |
| 3 (feed)     | 368.14 | 0.0110 | 0.0018 | 0.1109 | 0.0806 |
| 4 (reboiler) | 371.48 | 0.0054 | 0.0005 | 0.0656 | 0.0152 |

No `gammaPhi` column can produce that profile, because in a molecular world
ammonia's volatility does not depend on how much carbon dioxide has left
the liquid.  Here it does: the carbon dioxide a liquid still carries is
what holds its ammonia as NH₄⁺, so stripping the CO₂ sets the ammonia free
and the free ammonia then strips.  (The usual shorthand for that is
"stripping CO₂ raises the pH" — which is true of a fixed solution and is
*not* how it reads tray by tray here.  See the per-tray table below: it is
the carbonate loading that orders cleanly, not the pH.)

## The identity

Both halves of stage 2 are drawn as real streams, recombined, and
re-flashed at the same (T, P).  Nothing may happen — and nothing does, to
about **1e-9 relative**:

```
                   column (MESH)        flash (Rachford-Rice)
  x(NH3)   0.01985798974 kmol/h   0.01985798974 kmol/h
  x(CO2)   0.003231329484         0.003231329475
  y(NH3)   0.06577743231          0.06577743231
  CO2aq    2.498183165e-05        2.49818315e-05      <- the SPECIATION too
```

The ion inventories agreeing is the claim that a comparison of apparent
compositions alone would miss: an effective K could reproduce the apparent
split while resting on a different chemistry underneath.

## The per-tray chemistry

A profile that prints `x`, `y` and `T` and *not* the pH shows the
consequence while hiding the cause.  So on a reacting package the column
speciates each tray liquid once after convergence and writes `pH`,
`ionicStrength` and every species molality into `profile.csv`:

| stage | T [K] | pH | I [mol/kg] | free-NH₃ fraction | carbonate loading |
|---|---|---|---|---|---|
| 1 (top)      | 354.63 | 8.485 | 0.636 | 0.7767 | 0.2120 |
| 2            | 367.34 | 8.361 | 0.130 | 0.8319 | 0.1627 |
| 3            | 368.14 | 8.328 | 0.110 | 0.8283 | 0.1670 |
| 4 (reboiler) | 371.48 | 8.532 | 0.029 | 0.9091 | 0.0872 |

It costs one reactive flash per stage, **once** — not one per residual.

### The check is the mechanism, not a guessed direction

The scope asked for a physics-direction check: *stripping CO₂ must raise
the liquid pH, and the free-NH₃ fraction must rise with it.*  The first
half of that is **not true here**, and the table shows why it looked true:
pH runs 8.485 → 8.361 → 8.328 → 8.532, which is not monotone in either
direction.

The reason is worth more than the check would have been.  Ionic strength
varies **22-fold** between the top tray and the reboiler, and a pH is an
*activity* — it moves with the activity coefficients as well as with the
inventory.  The carbonate loading is an *inventory*, and only an inventory
gives a clean ordering variable.

So the gate orders the trays by carbonate loading and requires the
free-ammonia fraction to order **strictly the other way** — which it does,
across all four trays.  That is the sour-water mechanism itself: the CO₂ a
liquid still carries is what holds ammonia as ammonium, and stripping it
sets the ammonia free.

`bin/curate/check_tray_chemistry.py` also re-derives the per-tray charge
balance from its own charge table, and checks that every carbonate and
ammonia species falls down the column.  H⁺ and OH⁻ are excluded from that
last check on purpose: they are not solutes being stripped, they are
water's own dissociation products pinned by the pH — `m_OH` rises between
trays 1 and 2 for exactly that reason.  An earlier draft included them and
failed, which is how the distinction got written down.

## What this case cost, and what it found

Building it broke `stageK` twice, and both were real:

1. **A K-value is an INCIPIENT quantity.**  The first definition read
   K = y/x off the flash.  That is right for a two-phase stage and returns
   a column of *zeros* the moment the trial state is subsaturated — which
   a solver's trial states usually are on the way to the answer.  Every
   bubble-point residual then reads −1, the Jacobian is singular in T, and
   the MESH stops without moving (`Newton iters: 0`).  The subsaturated
   branch now uses the equilibrium partial pressures over the fully
   speciated liquid, K_i = (p_i/P)/x_i.  The two branches agree where they
   meet, because at a two-phase state the partials sum to P.
2. **A trial composition can leave the simplex, and saying so is the fix.**
   The Newton overshoots a minor component first: CO₂ was proposed at
   −8.5e-4 while it is fed at 8e-3.  There is no liquid whose CO₂ content
   is minus a thousandth.  `stageK` now projects onto the simplex and
   **announces it once** — a declared solver aid, not a disguised one.  A
   negative entry is clamped; an exactly-zero entry stays zero, because
   absent means absent.

A third finding needed no fix, only a better sentence: a refusal raised
inside a stage now names the trial (T, z) that provoked it, so
"the chemistry set does not form species X" no longer sends a student
auditing curated records that are perfectly correct.

## What this case does NOT claim

`column12` re-flashes **adiabatically**, so recovering the stage
temperature there is a *result* of an energy balance.  This case re-flashes
**isothermally** at a declared temperature, because the adiabatic flash
brackets T by marching up from 200 K and the reactive VLE does not
converge down there (`|r|max = 4.74 after 21 outer iterations`).  So:

* the **equilibrium** half of the identity is claimed here;
* the **energy** half is claimed by column12 and not by this case;
* the declared temperature is not a free parameter — the gate reads stage
  2's temperature out of the column's own `profile.csv` and refuses any
  disagreement, so if the stage moves this case fails loudly.

A reactive adiabatic flash needs its bracket seeded from the feed rather
than from a constant.  That is a named gap, not something this case
pretends to have.

## Running it

```bash
runCase tutorials/steady/distillation/column13_sour_water_stage_identity
bin/curate/check_stage_identity.py     # the identity
bin/curate/check_tray_chemistry.py     # the per-tray chemistry + mechanism
```
