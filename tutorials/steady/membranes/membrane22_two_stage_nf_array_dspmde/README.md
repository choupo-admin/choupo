# membrane22 -- the same NF array under the charged-pore model

**The question.** membrane21 runs a two-stage array of generic 8-inch
elements with the SDEM membrane model.  What changes when the SAME hardware
carries a different membrane model -- the charged pore of DSPM-DE?

**What is the same.** The array (4:2 vessels of six `Generic-8040` elements,
the interstage booster a unit of its own), the FT30 feed spacer and Schock &
Miquel's correlations, the Geraldes & Afonso multi-ionic film
(`ionCoupling electroneutral;` with the 2006 suction correction), 20 C,
12 m3/h per stage-1 vessel.  Only two lines of each stage differ:

    membrane   NF270_dspmde;   // the pore tier: r_p 0.60 nm, X_d -5 mol/m3, eps_p 35
    transport  DSPM-DE;        // the pore SOLVED at every station

**What the model does.** DSPM-DE (Bowen & Welfoot 2002) carries each ion
through the pore by the extended Nernst-Planck equations -- hindered
diffusion, convection and migration -- with steric, Donnan and dielectric
exclusion at both faces, on 101 nodes, in ONE Newton per station with the
film's interface balance and the water flux.  The feed is declared by SALTS
(NaCl, CaCl2, MgSO4); the law decomposes them into Na+, Ca2+, Mg2+, Cl- and
SO4 2-, and the film couples those same ions at the wall.  Each stage prints
a pore summary: 61 and 43 pore solves, at most 8 Newton iterations each.
The whole array runs in under a second.

**D(T).** The ion D0 are 25 C values; this case DECLARES the liquid
viscosity (`transport { liquid { viscosity { model Vogel; } } }` in its
thermoPhysPropDict), so every D is corrected by Stokes-Einstein to the
stage's temperature -- 0.874 at 20 C, printed on the run as `[D(T)]` (the
booster's dissipation warms stage 2 by 0.015 K, and its factor is 0.8744).
membrane21, which declares none, runs on the 25 C values and says so.

**What the student sees -- and the limit it shows.**  In ions, the pore
rejects SO4 2- almost completely (Donnan and dielectric exclusion of a
divalent co-ion) while Mg2+ and Ca2+ pass in part, and Na+ and Cl- more.
But the module marches SALTS, and a pore conserves CHARGE, not salts: Mg2+
crosses with Cl-, not with SO4 2-.  So a salt's two legs differ in a mixture
-- at the first station MgSO4's cation leg passes 0.18 mol/m3 and its anion
leg 3e-4 -- and the salt basis can carry only one.  The engine carries the
cation leg and ANNOUNCES every salt whose legs differ (`[DSPM-DE] salt
'MgSO4' in a MIXED feed ...`): the permeate stream's sulfate and chloride
are NOT the pore's.  The published `R_obs_MgSO4` (0.69 in stage 1) is
therefore the rejection of Mg2+, not of the salt.  The ion-by-ion permeate
is what the props bench `poreTransport` prints (its ion rows).  Mapping the
ion permeate back onto the salt components -- or marching the module in
ions -- is a model decision that has not been taken.

**What is not claimed.** Nothing here is compared with a measured array.
The NF270_dspmde pore parameters are literature characterisation values for
one operating point (its record says so); the generic element is estimated
and announced; the film's `diffusivity` key prices only the salt-level
`k_film` column (each ion's k is priced on its own D).

Gate: `bin/curate/check_spiral_array.py` arm (i).
