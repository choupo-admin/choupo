# column18_partial_condenser — the same column, a different condenser

`column01_benzene_toluene`'s 15-stage benzene/toluene column (feed on
stage 8, R = 2, D = 50 kmol/h, Raoult, Wang–Henke) with ONE line added:

```
condenser { type partial; }
```

The condenser TYPE is a declared choice (default `total`, announced when it
is taken), and it decides what stage 1 IS.

## What a partial condenser is here

Stage 1 is the condenser itself, an equilibrium stage.  The vapour from
stage 2 enters it, part of it is condensed and returned as the reflux — the
stage's liquid `x_1` — and the rest leaves as the distillate, a saturated
VAPOUR `y_1 = K_1 x_1` at `T_1`.  Under a total condenser (column01) ALL of
the vapour leaving stage 1 is condensed and reflux and distillate leave as
one liquid of that vapour's composition, at its bubble point; stage 1 is
then the top tray, and the condenser above it is not an equilibrium stage
and is not counted.

Both types write the same material balance on stage 1, so the two cases
share their composition profile and their distillate composition exactly
(**x_D = 0.9510** benzene, both).  What differs:

| | column01 (`total`) | column18 (`partial`) |
|---|---|---|
| distillate phase | liquid at its bubble point, **354.25 K** | vapour at T_1 = **355.69 K** |
| condenser duty | −1291 kW: (R+1)·D condensed and cooled to that bubble point | **−870 kW**: the stage's own envelope, D leaves uncondensed |
| reboiler duty | 655 kW | **673 kW**: the vapour distillate carries its latent heat out of the plant |
| stage 1 in the hydraulics | the top tray, rated | not a tray (`V_1 = 0`), dropped |

The condenser duty is the stage's own energy balance,

```
Q_cond = −[ V_2 h_V(y_2, T_2) − L_1 h_L(x_1, T_1) − D h_V(y_1, T_1) ]
```

and the reboiler duty closes the column, as always.  The plant first law
closes at 0 kW in both cases: the split between the two duties moves, the
sum does not.

## The stage count

`nStages` counts EQUILIBRIUM stages, top to bottom, the reboiler included.
A partial condenser is one of them: the 15 stages here are 1 condenser +
13 trays + 1 reboiler.  column01's 15 are 14 trays + 1 reboiler, under a
total condenser that is not counted.  So a source that counts its TOTAL
condenser as "stage 1" (many textbooks and simulators do) describes a column
of `nStages − 1` here, and one that counts a partial condenser as stage 1
maps one to one.

## Run it

```
runCase tutorials/steady/distillation/column18_partial_condenser
```

41 bubble-point passes, the same as column01 — the condenser type changes no
material equation, only what the top stage is called, the phase the
distillate leaves in, and which envelope each duty prices.
