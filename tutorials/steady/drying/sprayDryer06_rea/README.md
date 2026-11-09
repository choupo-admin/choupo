# sprayDryer06_rea: when does the drying kinetics matter?

The question this case asks: **does the drying-rate model change the
powder?**  Run `sprayDryer01_sugar` first, then this case.

## What is the same and what is not

The feed (100 kg/h of 40 wt% sucrose solution at 25 C), the drying air
(50 kmol/h of dry air at 200 C), the sucrose's GAB isotherm and the drying
record `sugarDrying` (constant/dryingKinetics) are sprayDryer01's.  Two
things differ.

* The drying-rate MODEL: `model chen;` (the Reaction Engineering Approach:
  one smooth rate, no critical-moisture break) instead of sprayDryer01's
  default characteristic drying curve (a constant rate down to Xc = 0.15,
  then a falling rate).
* The HARDWARE: the wheel turns at 5 000 rpm instead of 20 000, so the
  droplets are coarser (about 139 um instead of 60), and the chamber is
  0.5 m tall instead of 5 m.

## Why the hardware had to change

In sprayDryer01 a droplet finishes its constant-rate drying in 0.08 s and
the chamber holds it 7.1 s.  Whatever the rate model, the powder reaches the
isotherm's equilibrium moisture long before the outlet, and the outlet
reports only that equilibrium: put `model chen;` into sprayDryer01 and every
number stays the same to the last digit.  A kinetic model decides the
product only where the residence time is comparable to the drying time.
Here the constant-rate drying takes 0.34 s and the residence is 0.46 s, so
the powder leaves before it is at equilibrium.

## What to compare

Read `X_final`, `moisture_pct_wb` and `residenceTime` on the dryer, then
change `model chen;` to `model langrishKockel;` in system/flowsheetDict (the
characteristic drying curve on the same 1-D trajectory) and run again.

| | REA (`chen`, this case) | drying curve (`langrishKockel`) | sprayDryer01 |
|---|---|---|---|
| residence time | 0.46 s | 0.46 s | 7.1 s |
| powder moisture | about 2.2 wt% | about 1.6 wt% | 1.54 wt% (equilibrium) |

The REA leaves the powder wetter: its rate falls smoothly from the first
second of drying, while the drying curve keeps the full rate down to the
critical moisture and then falls steeply.  Which one is right for sucrose is
not a question this case can answer: the critical moisture and the REA's
`activationDecay` in constant/dryingKinetics are author-set, not fitted to a
measured drying curve.  Fit both to a measured single-droplet curve before
trusting either.

The run also announces the atomiser's SHEET/FILM regime, as it does for
sprayDryer01: the Friedman droplet size is used outside the ligament regime
it was fitted in.
