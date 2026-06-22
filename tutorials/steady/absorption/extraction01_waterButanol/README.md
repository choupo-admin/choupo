# extraction01_waterButanol — a binary liquid-liquid split

Water + 1-butanol at 25 °C and 1 atm. The pair has a well-known liquid-liquid
**miscibility gap** below its upper critical solution temperature (125.5 °C), so
a feed whose composition lies inside the gap spontaneously splits into two
liquid phases. This case feeds a **70/30 water/nButanol** mixture (inside the
gap) to an isothermal decanter and lets the flash find the two-liquid split.

Run it:

```
runCase tutorials/steady/absorption/extraction01_waterButanol
```

## What you see

A single feed splits into two liquids, both at 298.15 K, `vf = 0`:

| phase | water | nButanol | flow (kmol/h) |
|---|---|---|---|
| aqueous (water-rich) | 0.984 | 0.016 | 50.64 |
| organic (butanol-rich) | 0.408 | 0.592 | 49.36 |

The split is found by Michelsen TPD stability testing (to seed a robust initial
guess) followed by direct Gibbs-energy minimisation — the LL path the engine
uses precisely because a Newton/successive-substitution flash on a symmetric
γ-model would collapse to the trivial K = 1 saddle.

This case demonstrates:

- `phases (...)` syntax with TWO liquid phases;
- `phaseSet LL` in the IsothermalFlash;
- the Michelsen TPD stability test as the initial-guess generator.

## Reading the log honestly

Two display caveats worth knowing as a student:

- The LL flash reuses the VL solver's printout, so the two liquids are shown
  under `Vapor flow V` / `Liquid flow L` headings (and x/y/K labels). Read them
  as phase-α (organic) and phase-β (aqueous), not as a vapour and a liquid.
- The decanter is isothermal and adiabatic in reality (an enthalpy hand-check
  gives H_in ≈ H_out), so the physically correct duty is ≈ 0. The KPI `Q` and
  any utility/cost the run reports for this LL split are a known artifact of the
  shared flash duty path — do not cost this unit from them.
