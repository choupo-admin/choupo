# thermoTest (props side) — the multi-ion role

This is the `choupoProps` member of the **thermoTest** tutorial. The full guide
and the other four subcases (evaporator/lumped, evaporator/Pitzer, antisolvent
crystalliser/eNRTL, VLE flash/NRTL) live in
[`tutorials/steady/thermoTest/`](../../steady/thermoTest/README.md).

`model4_speciation_scaling` — the same {NaCl, CaSO₄, water} system in its **third
role**: a multi-ion broth. The aqueous speciation engine (Pitzer-HMW / Davies)
reasons in the shared ions Na⁺, Cl⁻, Ca²⁺, SO₄²⁻ (+ the neutral pair CaSO₄aq) and
reports saturation indices SI = log₁₀(IAP/Ksp) for gypsum and halite. Concentrate
the brine and gypsum scales first (r≈0.035, it starts at saturation), halite only
near r≈0.50 — the whole point of "there are no salts once dissolved, only ions."
Pitzer-HMW is **mandatory** at this ionic strength (I≈3); the Davies law is valid
only to I≈0.5, so `activityModel pitzerHMW;` is declared, never silently defaulted.

```bash
runCase tutorials/props/thermoTest/model4_speciation_scaling
```
