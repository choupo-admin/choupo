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
  droplets are coarser (about 177 um instead of 77), and the chamber is
  1.2 m tall instead of 5 m.

## Why the hardware had to change

In sprayDryer01 a droplet finishes its constant-rate drying in 0.15 s and
the chamber holds it 6.4 s.  Whatever the rate model, the powder reaches the
isotherm's equilibrium moisture long before the outlet, and the outlet
reports only that equilibrium: put `model chen;` into sprayDryer01 and every
number stays the same to the last digit.  A kinetic model decides the
product only where the residence time is comparable to the drying time.
Here the constant-rate drying takes 0.55 s and the residence is 0.80 s, so
the powder leaves before it is at equilibrium.

## What to compare

Read `X_final`, `moisture_pct_wb` and `residenceTime` on the dryer, then
change `model chen;` to `model langrishKockel;` in system/flowsheetDict (the
characteristic drying curve on the same 1-D trajectory) and run again.

| | REA (`chen`, this case) | drying curve (`langrishKockel`) | sprayDryer01 |
|---|---|---|---|
| residence time | 0.80 s | 0.80 s | 6.4 s |
| powder moisture | about 2.0 wt% | about 1.6 wt% | 1.57 wt% (equilibrium) |

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

## What changed on 2026-11-18 (DEV.md 4c C421, door slice B)

The atomiser no longer takes water's viscosity and density: it reads the
FEED's own, from the property dictionary (the NBS table of aqueous sucrose,
Swindells et al. 1958, 5.16 mPa s for 40 wt % at 25 C, and the solution's
1178 kg/m3).  The same 5 000 rpm wheel therefore makes a coarser spray than
it did (177 um, not 139), the 0.5 m chamber that used to leave the powder
at 2.2 wt % left it at 38 wt % (the REA and the curve alike, so the lesson
was lost), and the chamber is now 1.2 m tall, which restores the regime this
case exists to show.  Typing a viscosity or a density in `operation` is
refused by name.
