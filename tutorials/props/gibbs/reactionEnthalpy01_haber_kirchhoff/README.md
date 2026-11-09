# `reactionEnthalpy01_haber_kirchhoff` — the reaction enthalpy depends on T

The witness of the EduTool **Reaction enthalpy and temperature**
(`reaction-enthalpy`). One `reactionGibbs` operation prices
N₂ + 3 H₂ → 2 NH₃ (ideal gases at 1 bar) at seven temperatures, from
298.15 K to 800 K, on the formation surface of the catalogue records.

```bash
runCase .
```

| T | ΔH° per mole of reaction | per mole of NH₃ |
|---|---|---|
| 298.15 K | −91.88 kJ | −45.94 kJ |
| 700 K | −105.35 kJ | −52.68 kJ |
| 773.15 K | −106.88 kJ | −53.44 kJ |

The degree sign fixes the **standard state** (1 bar, each species in its
reference phase), not the temperature: tables are printed at 298.15 K by
convention. A converter running at 700–800 K releases about 16 % more heat
per mole of ammonia than the 25 °C value says.

`constant/` is copied whole from
[`landscape06_nitrogen_fixation_routes`](../landscape06_nitrogen_fixation_routes),
so the formation surface is the same one; this case reads only N₂, H₂ and NH₃.
