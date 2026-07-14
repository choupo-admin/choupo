# Dilute-phase pneumatic conveying of sand in nitrogen

A single `pneumaticConveyor` unit: silica sand (~200 µm) carried by nitrogen up
a 100 mm line, 50 m long, with a 10 m vertical rise.

## What it shows

The total conveying-line pressure drop as a **sum of physical contributions**
(glass-box) — Rhodes, *Introduction to Particle Technology*, Ch. 8:

| contribution | this case (Pa) |
|---|---|
| gas acceleration      | 543 |
| solids acceleration   | 211 |
| gas–wall friction     | **3730** (dominant) |
| solids–wall friction  | 154 |
| static head (gas+solids, 10 m rise) | 268 |
| **TOTAL ΔP**          | **4906** (→ P_out 1.95 bar) |

and the key velocities:

- superficial gas velocity `u_g` = 21.9 m/s,
- particle velocity `u_p` = 21.1 m/s (Hinkle slip),
- single-particle terminal velocity `u_t` = 1.03 m/s,
- **saltation velocity `u_salt` = 3.6 m/s** (Rizk) — `u_g` is well above it, so
  transport is stable. The conveyor **warns aloud** (verbosity ≥ 1) if `u_g`
  ever falls below `u_salt` (risk of solids settling and blocking the line) —
  a first-class, announced design check, never a silent clip.

Solids loading = 0.20 kg solid / kg gas (dilute phase), suspended-solids
density ρ* = 0.47 kg/m³.

## The model (selectable pieces)

- particle velocity: Hinkle `u_p = u_g(1 − 0.68 d_p^0.92 ρ_p^0.5 ρ_g^−0.2 D^−0.54)`,
  with an honest `u_g − u_t` fallback if the correlation leaves the dilute regime;
- gas friction: Fanning (Blasius turbulent / 16/Re laminar);
- solids friction: Hinkle `f_p = (3/8)(ρ_g/ρ_p) C_D (D/d_p)((u_g−u_p)/u_p)²`,
  C_D from Schiller–Naumann at the slip Reynolds number;
- saltation: Rizk (1973).

## Inputs

Operation block is **hardware only** (the credo): pipe diameter `D`, length `L`,
vertical rise `dz`. Every velocity, the suspended density and the pressure drop
are **results**. Particle density comes from the solid component's
`solid { rho_p; }` (silica = 2650 kg/m³); the size from the inlet PSD (Sauter
mean for the drag). The carrier-gas viscosity needs a `transport { model Chung; }`
block in the thermoPackage (for the friction Reynolds numbers).

Note the source-stream solids are declared as **`solidFlows`** (mass flows, e.g.
`silica 282 kg/h;`), the convention for a feed stream.
