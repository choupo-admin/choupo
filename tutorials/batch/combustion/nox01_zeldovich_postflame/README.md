# nox01_zeldovich_postflame — thermal NOx, and a two-engine handshake

Hot burnt gas (lean H₂/air, **2125 K, 1 atm** — Homer & Sutton Flame 1 as
compiled in Glarborg 2018) held isothermal, starting from the equilibrated
H/O radical pool with **all nitrogen still as N₂**.  The Glarborg 2018
nitrogen chemistry (extended Zeldovich + N₂O routes, Tables 2/5
**verbatim**) then forms NO.

## The numbers (re-measured 2026-10-25)

| quantity | value |
|---|---|
| NO equilibrium ceiling (gibbsReactor, isothermal 2125 K / 1 atm, same 13-species thermo, this case's initial pool as feed) | **5178 ppm** |
| NO from kinetics at 6 s | **5178 ppm = 99.996 % of the ceiling** |
| t½ (half the ceiling) | **0.48 s** |
| t 90 % | **1.44 s** |

**What is not carried.**  Glarborg's NNH route (R20–R24) is absent since
2026-10-25: NNH's thermo had come from GRI-Mech 3.0's thermo file, which grants
no redistribution, and no public-domain primary for it was found
(NASA/TP-2002-211556 has no NNH entry).  The heat capacities of the flame
species are NASA-9 polynomials from that report.  On 2026-07-02, with the NNH
route and the earlier thermo, the same table read 5227 / 5167 ppm (98.9 %),
0.50 s and 1.56 s.

## The two lessons

1. **The cross-engine pin.**  The kinetic plateau lands on the Gibbs
   equilibrium computed by a *different engine* (steady Gibbs minimisation vs
   stiff batch integration).  Kinetics choose the path and the clock; the
   destination belongs to the thermodynamics.  Reverse rates come from the
   same equilibrium constants — so this agreement is a genuine consistency
   check of the mechanism transcription + thermo, not a tautology.
2. **NOx forms in engineering time.**  Ignition takes microseconds
   (ignition02: 43 µs); thermal NO takes **seconds** at 2125 K.  That
   timescale gap is the whole basis of NOx control by quench: cool the gas
   before the Zeldovich clock runs.

The burnt-gas initial pool was computed by a
gibbsReactor at 2125 K/1 atm (14 species on 2026-07-02; it still agrees with
the current 13-species thermo to the printed digits) (25 % H₂ / 17.5 % O₂ / 57.5 % N₂
feed); the equilibrium NO share was returned to N₂/O₂ elementally.
