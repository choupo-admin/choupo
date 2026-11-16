# mhv01_methanol_water_100C -- can a cubic be fed a low-pressure G^E model?

`runCase tutorials/props/molecular/mhv01_methanol_water_100C`

## The question

Activity-coefficient models (NRTL, UNIQUAC, UNIFAC) have been fitted to
low-pressure phase equilibrium for decades and cannot go to high pressure or to
a supercritical component.  A cubic equation of state can.  A **mixing rule that
lets a cubic use an activity model's parameters** gives both, with no new
regression.  Michelsen (1990) matches the cubic to the model's excess Gibbs energy
at *zero pressure*; Dahl & Michelsen (1990) improve the match with a second
term.  This case asks what that costs against a **measured** diagram.

## What it does

Twelve `propertyPoint` operations per way of asking, at the twelve measured
liquid compositions of methanol (1) + water (2) at 100 C
(Griswold & Wong 1952, as printed in Poling, Prausnitz & O'Connell, 5th ed.,
Table 8-46 "Experimental", p. 8.146; 760.0 to 2650.9 mmHg).  Each reports
`P_bubble` and `y_eqT_methanol` (the incipient vapour):

| name | what runs |
|---|---|
| `gammaPhi_*` | the system: the catalogue's NRTL pair, an ideal-gas vapour, the records' own vapour pressures -- the **frame the pair was regressed in** |
| `mhv1_*` | SRK, `mixingRule MHV1` (q1 = -0.593), fed the same pair |
| `mhv2_*` | SRK, `mixingRule MHV2` (q1 = -0.478, q2 = -0.0047), fed the same pair |
| `oneFluid_*` | SRK, `vanDerWaalsOneFluid`, kij = 0 (announced): no G^E reaches the cubic |
| `mhv1Soave_*`, `mhv2Soave_*` | the same two rules on the PLAIN Soave alpha; the three rows above them carry `alphaFunction MathiasCopeman;` |

and three `pin_*` operations (x1 = 0.522) that pin the engine's own value where
the `anchor` rows replace it.

## The constants, and where they were read

| rule | q1 | q2 | read at |
|---|---|---|---|
| `MHV1` | -0.593 | -- | Michelsen, Fluid Phase Equilib. 60 (1990) 213, p. 216 ("our recommended value of q1 for use with the SRK equation"); the fit of q(alpha) on 10 < alpha < 13, Eq. 10 p. 215; the rule is Eq. 12 p. 215; Poling Table 5-1, p. 5.17 |
| `MHV2` | -0.478 | -0.0047 | Dahl & Michelsen, AIChE J. 36 (1990) 1829, p. 1831 (Eq. 13 and "the recommended values of q1 and q2"); the composition derivatives Eq. A3, p. 1835; Poling Table 5-1 p. 5.17 and its note a (A2 = -0.0047) |

The composition derivatives of the attraction behind the fugacity coefficients (Eq. A3) were checked against a
finite-difference derivative of the cubic's total residual Helmholtz energy
before they were written into the engine (agreement 1e-9 in ln phi_i, both
roots, both rules).

## The result (bubble pressure, kPa; deviation from the measurement)

| x1 | y1 (meas.) | P meas. | gammaPhi | MHV1 | MHV2 | one-fluid kij = 0 | MHV1 Soave | MHV2 Soave |
|---|---|---|---|---|---|---|---|---|
| 0.000 | 0.000 | 101.3 | 101.4 (+0.1 %) | 101.5 (+0.1 %) | 101.5 (+0.1 %) | 101.5 (+0.1 %) | 92.5 (-8.8 %) | 92.5 (-8.8 %) |
| 0.011 | 0.086 | 110.3 | 106.7 (-3.3 %) | 107.1 (-3.0 %) | 106.7 (-3.3 %) | 144.4 (+30.9 %) | 98.3 (-10.9 %) | 97.8 (-11.3 %) |
| 0.035 | 0.191 | 124.1 | 117.9 (-5.0 %) | 118.8 (-4.3 %) | 117.6 (-5.2 %) | 208.2 (+67.7 %) | 110.5 (-11.0 %) | 109.2 (-12.0 %) |
| 0.053 | 0.245 | 133.7 | 125.9 (-5.8 %) | 127.1 (-5.0 %) | 125.5 (-6.2 %) | 237.9 (+77.8 %) | 119.2 (-10.8 %) | 117.4 (-12.2 %) |
| 0.121 | 0.434 | 164.8 | 153.7 (-6.7 %) | 155.7 (-5.5 %) | 153.0 (-7.2 %) | 283.7 (+72.2 %) | 149.1 (-9.5 %) | 145.9 (-11.4 %) |
| 0.281 | 0.619 | 204.8 | 206.6 (+0.9 %) | 208.5 (+1.8 %) | 205.5 (+0.4 %) | 295.5 (+44.3 %) | 204.4 (-0.2 %) | 200.9 (-1.9 %) |
| 0.352 | 0.662 | 216.5 | 225.8 (+4.3 %) | 227.4 (+5.0 %) | 224.7 (+3.8 %) | 298.5 (+37.9 %) | 224.2 (+3.5 %) | 221.1 (+2.1 %) |
| 0.522 | 0.750 | 251.0 | 264.9 (+5.5 %) | 265.6 (+5.8 %) | 263.8 (+5.1 %) | 312.1 (+24.4 %) | 264.4 (+5.4 %) | 262.4 (+4.5 %) |
| 0.667 | 0.824 | 282.0 | 293.5 (+4.1 %) | 293.6 (+4.1 %) | 292.5 (+3.7 %) | 326.9 (+15.9 %) | 294.2 (+4.3 %) | 292.9 (+3.9 %) |
| 0.826 | 0.911 | 311.7 | 322.5 (+3.5 %) | 322.2 (+3.4 %) | 321.6 (+3.2 %) | 341.7 (+9.6 %) | 325.1 (+4.3 %) | 324.4 (+4.1 %) |
| 0.932 | 0.969 | 334.4 | 341.3 (+2.1 %) | 340.9 (+1.9 %) | 340.6 (+1.9 %) | 349.3 (+4.5 %) | 345.7 (+3.4 %) | 345.4 (+3.3 %) |
| 1.000 | 1.000 | 353.4 | 353.4 (-0.0 %) | 352.8 (-0.2 %) | 352.8 (-0.2 %) | 352.8 (-0.2 %) | 359.1 (+1.6 %) | 359.1 (+1.6 %) |

Over the ten interior points (mean / maximum |dP/P|, mean |dy|):

| | mean | max | mean abs dy |
|---|---|---|---|
| gammaPhi | 4.1 % | 6.7 % | 0.020 |
| mhv1 | 4.0 % | 5.8 % | 0.016 |
| mhv2 | 4.0 % | 7.2 % | 0.019 |
| oneFluid | 38.5 % | 77.8 % | 0.134 |
| mhv1Soave | 6.3 % | 11.0 % | 0.023 |
| mhv2Soave | 6.7 % | 12.2 % | 0.022 |

## How to read it

1. **The one-fluid rule with kij = 0 is not a model of this system**: 78 % wrong
   in the water-rich range.  The cubic alone has no way to know that methanol and
   water attract each other.
2. **MHV1 and MHV2 recover a diagram from a G^E model**, with no new parameter.
   Fed the *same pair*, the activity coefficients recovered from the cubic
   (`gamma_i = phi_i^L(x)/phi_i^L(pure i)` at the same T and P) differ from the NRTL fed in by
   at most 0.009 (MHV2) and 0.029 (MHV1) (plain Soave alpha) in ln gamma at 373.15 K and 2.5 bar (the gate
   `check_cubic_mixing_rule`, arm f); the one-fluid rule is 0.42 away.
3. **The alpha function matters as much as the rule.**  The cubic's own
   **pure-component vapour pressure** is the first error an equation of state brings:
   with the plain Soave alpha SRK puts water at 100 C at 92.5 kPa against 101.3 kPa
   (-8.8 %) -- read the first row of the Soave columns -- and the MHV rows carry that error
   (6.3 % and 6.7 % mean, 11.0 % and 12.2 % max).  With the per-component Mathias-Copeman
   alpha fitted by curation to each record's own vapour-pressure law (DEV.md 4c C408
   slice 0; `alphaFunction MathiasCopeman;`, and its a_i feeds the mixing rule) the pure ends are
   within 0.2 % and the MHV rows fall to 4.0 % mean (5.8 % and 7.2 % max), level with the
   gamma-phi column.  What remains is the PAIR's: it was fitted to isobaric bubble
   temperatures at 297-361 K and 15-95 kPa and this diagram is at 373 K up to 3.5 bar --
   the rule *returns the pair, including where the pair is wrong*.  Dahl & Michelsen fit a
   Mathias-Copeman alpha too (their Eq. 5 and Table 1, p. 1830).  The y bands are loose in
   the dilute range because y itself is small (0.086 at x1 = 0.011).
4. **gammaPhi is the better answer at 1-3.5 bar, and MHV is the only answer where
   it does not exist.**  The point of the rule is the supercritical and the
   high-pressure region the gamma-phi frame cannot enter; this diagram is the
   place where both are defined, so the comparison is fair.

## What it does not say

* It does not validate the rule at high pressure (a later slice carries a
  carbon dioxide + methanol witness).
* It does not say the pair is good at 373 K; its anchor band is the pair's own error.
* The departures `H_R`, `S_R` carry the slope of G^E (Theory Guide `sec:cubic-mixing-rule`,
  Eq. cmr-dep); under `phiPhi` they reach both phases, each at its own root (a liquid
  stream is priced on the cubic's liquid root, DEV.md 4c C410).

## The gate

`bin/curate/check_cubic_mixing_rule.py` recomputes SRK + NRTL + MHV1/MHV2 in Python from the
papers' equations and holds the engine to it: ln phi_i of both roots to 1e-9, the closed
form sum y ln phi = Z - 1 - ln(Z - B) - beta I, H_R and S_R against a temperature difference of
the engine's own ln phi, the byte identity of `vanDerWaalsOneFluid` with no `mixingRule`, the pure
limit, three bubble pressures of this case against an independent solve, and eleven refusals
by name.
