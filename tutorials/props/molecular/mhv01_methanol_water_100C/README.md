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

| x1 | y1 (meas.) | P meas. | gammaPhi | MHV1 | MHV2 | one-fluid kij = 0 |
|---|---|---|---|---|---|---|
| 0.000 | 0.000 | 101.3 | 103.9 (+2.6 %) | 92.5 (-8.8 %) | 92.5 (-8.8 %) | 92.5 (-8.8 %) |
| 0.011 | 0.086 | 110.3 | 109.1 (-1.1 %) | 98.2 (-11.0 %) | 97.7 (-11.4 %) | 141.0 (+27.7 %) |
| 0.035 | 0.191 | 124.1 | 120.1 (-3.2 %) | 110.3 (-11.2 %) | 109.0 (-12.2 %) | 212.0 (+70.8 %) |
| 0.053 | 0.245 | 133.7 | 128.0 (-4.3 %) | 118.9 (-11.1 %) | 117.0 (-12.5 %) | 244.3 (+82.7 %) |
| 0.121 | 0.434 | 164.8 | 155.4 (-5.7 %) | 148.5 (-9.9 %) | 145.4 (-11.8 %) | 291.3 (+76.8 %) |
| 0.281 | 0.619 | 204.8 | 207.9 (+1.5 %) | 203.9 (-0.4 %) | 200.4 (-2.2 %) | 297.8 (+45.4 %) |
| 0.352 | 0.662 | 216.5 | 227.1 (+4.9 %) | 223.8 (+3.4 %) | 220.6 (+1.9 %) | 299.5 (+38.3 %) |
| 0.522 | 0.750 | 251.0 | 266.2 (+6.0 %) | 264.3 (+5.3 %) | 262.3 (+4.5 %) | 312.2 (+24.4 %) |
| 0.667 | 0.824 | 282.0 | 294.5 (+4.4 %) | 294.2 (+4.3 %) | 292.9 (+3.9 %) | 327.8 (+16.3 %) |
| 0.826 | 0.911 | 311.7 | 323.1 (+3.7 %) | 325.2 (+4.3 %) | 324.5 (+4.1 %) | 344.8 (+10.6 %) |
| 0.932 | 0.969 | 334.4 | 341.6 (+2.2 %) | 345.7 (+3.4 %) | 345.4 (+3.3 %) | 354.2 (+5.9 %) |
| 1.000 | 1.000 | 353.4 | 353.4 (-0.0 %) | 359.1 (+1.6 %) | 359.1 (+1.6 %) | 359.1 (+1.6 %) |

Over the ten interior points (mean / maximum |dP/P|, mean |dy|):

| | mean | max | mean abs dy |
|---|---|---|---|
| gammaPhi | 3.7 % | 6.0 % | 0.020 |
| mhv1 | 6.4 % | 11.2 % | 0.023 |
| mhv2 | 6.8 % | 12.5 % | 0.022 |
| oneFluid | 39.9 % | 82.7 % | 0.153 |

## How to read it

1. **The one-fluid rule with kij = 0 is not a model of this system**: 83 % wrong
   in the water-rich range.  The cubic alone has no way to know that methanol and
   water attract each other.
2. **MHV1 and MHV2 recover a diagram from a G^E model**, with no new parameter.
   Fed the *same pair*, the activity coefficients recovered from the cubic
   (`gamma_i = phi_i^L(x)/phi_i^L(pure i)` at the same T and P) differ from the NRTL fed in by
   at most 0.009 (MHV2) and 0.029 (MHV1) in ln gamma at 373.15 K and 2.5 bar (the gate
   `check_cubic_mixing_rule`, arm f); the one-fluid rule is 0.42 away.
3. **The 4-12 % that remains is not the rule's.**  (a) The catalogue pair was
   fitted to isobaric bubble temperatures at 297-361 K and 15-95 kPa; this diagram
   is at 373 K and reaches 3.5 bar -- the rule *returns the pair, including where
   the pair is wrong*.  (b) The cubic's own **pure-component vapour pressure** is
   the first error an equation of state brings: with the plain Soave alpha function
   the engine carries, SRK puts water at 100 C at 92.5 kPa against 101.3 kPa (-8.8 %) --
   read the first row.  A pair fitted in the frame of the records' own vapour-pressure
   laws inherits that error at the water end whatever the rule.  Dahl & Michelsen fit a
   Mathias-Copeman alpha to each pure vapour pressure (their Eq. 5 and Table 1, p. 1830);
   the engine's fitted alpha is a separate object (DEV.md 4c C408, slice 0) and **joins this
   case when it lands** -- the MHV rows are then expected to fall toward the gamma-phi
   column.  (c) The y bands are loose in the dilute range because y itself is small
   (0.086 at x1 = 0.011).
4. **gammaPhi is the better answer at 1-3.5 bar, and MHV is the only answer where
   it does not exist.**  The point of the rule is the supercritical and the
   high-pressure region the gamma-phi frame cannot enter; this diagram is the
   place where both are defined, so the comparison is fair.

## What it does not say

* It does not validate the rule at high pressure (a later slice carries a
  carbon dioxide + methanol witness).
* It does not say the pair is good at 373 K; its anchor band is the pair's own error.
* The departures `H_R`, `S_R` carry the slope of G^E (Theory Guide `sec:cubic-mixing-rule`,
  Eq. cmr-dep); under `phiPhi` they reach the vapour's enthalpy and entropy only -- a liquid
  stream is priced on the formation enthalpy (DEV.md 4c C410).

## The gate

`bin/curate/check_cubic_mixing_rule.py` recomputes SRK + NRTL + MHV1/MHV2 in Python from the
papers' equations and holds the engine to it: ln phi_i of both roots to 1e-9, the closed
form sum y ln phi = Z - 1 - ln(Z - B) - beta I, H_R and S_R against a temperature difference of
the engine's own ln phi, the byte identity of `vanDerWaalsOneFluid` with no `mixingRule`, the pure
limit, three bubble pressures of this case against an independent solve, and eleven refusals
by name.
