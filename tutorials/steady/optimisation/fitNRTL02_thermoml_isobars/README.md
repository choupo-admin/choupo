# fitNRTL02 — a good fit that predicts worse

Regress the ethanol/water NRTL pair against 45 bubble points measured on
three vacuum isobars, then ask the fitted pair about 21 points at
atmospheric pressure, measured by a different laboratory in a different
year.  Both datasets come out of the NIST/TRC ThermoML Archive and carry
the citation of the article they were published in.

```bash
runCase tutorials/steady/optimisation/fitNRTL02_thermoml_isobars
```

## What the run finds

The regression converges in 19 iterations to a reduced chi-square of 0.023
over 45 points — an in-sample rms of 0.144 K, which is at the scatter of
the measurements.  Everything on the fit's own report says it went well.

Then the fitted pair meets the 21 points it never saw:

|                       | vacuum data<br>(Voutsas, 13–33 kPa) | atmospheric data<br>(Kamihama, 101.3 kPa) |
|---|---|---|
| catalogue pair (unchanged)  | rms 0.1619 K              | aad 0.0821 K |
| pair fitted here            | rms 0.1438 K *(in-sample)*| aad 0.3857 K |

The regression bought an 11 % improvement where it looked, and lost a
factor of 4.7 where it did not.  A reader who saw only `converged 1`,
`chi2_reduced 0.023` and `rms 0.144 K` would ship the new pair.

Each pair is at its best where its evidence was taken.  The two `evaluate`
operations in `system/propsDict` are what make that symmetric rather than
an accusation: they score the *catalogue* pair on both datasets, so all
four numbers come from this one run.

## Why it happens

NRTL's interaction is `tau = a + b/T`, so separating `a` from `b` needs
data that span `1/T`.  Three isobars from 13 to 33 kPa span about 28 K
around 320 K — better than the 12 K of the single-isobar twin
(`fitNRTL01`), and it shows: the condition number of `J'J` falls from
3.6e11 to 5.6e9.  But `max|correlation|` is still 1.000 and the run still
reports `identifiable 0`.  Two orders of magnitude of conditioning did not
buy identifiability, and the confidence intervals say why —
`b_ij = -539 ± 456`, `b_ji = 682 ± 768`.  The parameters are a correlated
pair that happens to describe the vacuum data; nothing pins either one, so
nothing constrains what they do at 101 kPa.

The catalogue record's own declared validity window is 298–373 K.  It was
fitted where it is being asked; this fit was not.

## What the case demonstrates mechanically

* **A per-point pressure.**  A bubble point is `(x, P, T)`, and which two
  are independent is the experimenter's choice.  The Voutsas set carries a
  `Pressure` column because that study varied it; the Kamihama set carries
  a held-constant `Pressure 101.3 kPa;` because that one fixed it.  Both
  forms reach the solver, and declaring a scalar `residual.P` beside
  evidence that carries its own is refused by name — two homes for one
  fact.
* **A declared fit / held-out partition.**  The `evidence ( )` block names
  which dataset trains and which tests, and is frozen before any fitting
  code runs.  The fitter is never *handed* a validation point.
* **No acceptance band.**  The run reports the held-out residual and claims
  no pass or fail, because a limit chosen after seeing the residual is not
  a limit.

## What the case does not show

It does not show that regression is a bad idea, and it does not show that
the catalogue pair is right.  It is one pair, one system, one pressure
decade.  The transferable part is the method: hold out evidence from an
independent study, declare the partition before fitting, and read the
held-out column before believing the in-sample one.

## Provenance, and what has not been done

    FIT       Voutsas, Pamouktsis, Argyris & Pappa, Fluid Phase Equilib. (2011)
              doi:10.1016/j.fluid.2011.06.009    45 points, 13.15/19.71/32.86 kPa

    HELD OUT  Kamihama, Matsuda, Kurihara, Tochigi & Oba, J. Chem. Eng. Data (2012)
              doi:10.1021/je2008704              21 points, 101.3 kPa

Both files were written by `bin/choupo-thermoml extract-vle` from a local
mirror of the archive, and both declare
`reviewStatus transcribedNotCheckedAgainstArticle` — **the values have not
been read back against the publications they cite.**  The run says so on
the console and in its end-of-run caveat block.  A citation says where
numbers are supposed to come from, not that anybody looked; a transcribed
file carries the DOI from birth, which is exactly what makes the unchecked
state look checked.  A curator who reads the two papers and confirms the
numbers edits that field to `checked`.

The two extrapolation caveats the run reports — ethanol's Antoine
correlation at 371.8 K and 372.8 K, outside its declared 273–369 K window
— are the bubble-point Newton's *starting* temperature (the
mole-fraction-weighted normal boiling point of the first datum in each
set), not a state any published answer contains.  The mechanism that would
say so is opened around the parameter search but not yet inside the
bubble-point Newton; the gap is named in
`docs/design/advisory-attribution.md`.

Gate: `bin/curate/check_held_out_pressure.py` (five sabotages).
