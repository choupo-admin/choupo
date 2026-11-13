# Dilute-phase pneumatic conveying of sand in nitrogen

A single `pneumaticConveyor` unit: silica sand (Sauter mean 169.5 µm) carried by
nitrogen at 3 bar and 298 K up a 100 mm line, 30 m long, with a 6 m vertical
rise and no bends.

## What it shows

The total conveying-line pressure drop as a **sum of physical contributions**
(glass-box) — Rhodes, *Introduction to Particle Technology*, Ch. 8:

| contribution | this case (Pa) |
|---|---|
| gas acceleration      | 362 |
| solids acceleration   | 1384 |
| gas–wall friction     | 1492 |
| solids–wall friction  | **61751** (dominant) |
| static head (gas+solids, 6 m rise) | 617 |
| **TOTAL ΔP**          | **65606** (→ P_out 2.344 bar) |

and the key velocities:

- superficial gas velocity `u_g` = 14.61 m/s,
- particle velocity `u_p` = 13.97 m/s (force balance, below),
- single-particle terminal velocity `u_t` = 0.92 m/s,
- **saltation velocity `u_salt` = 8.48 m/s** (Rizk) — `u_g/u_salt` = 1.72, a
  safe margin above plugging. The conveyor **warns aloud** (verbosity ≥ 1) if
  `u_g` ever falls below `u_salt` (risk of solids settling and blocking the
  line) — a first-class, announced design check, never a silent clip.

Solids loading = 2.00 kg solid / kg gas (dilute phase), suspended-solids
density `rho*` = 7.09 kg/m³, so the voidage `1 − rho*/rho_p` = 0.9973 lies
inside the range of the solids-friction correlation.  At this loading the solids friction
carries 94 % of the drop: conveying solids IS a pressure-drop problem.

## The model

- particle velocity: a FORCE BALANCE, not a fitted slip.  In developed flow a
  particle no longer accelerates, so the gas drag on it balances its wall
  friction plus the gravity component along the pipe,
  `slip² C_D = (4/3) d_p rho_p g (sin θ + mu_w cos θ)/rho_g`, `sin θ = dz/L`,
  `u_p = u_g − slip`, iterated because `C_D` depends on the slip Reynolds
  number.  `mu_w` is the particle–wall friction coefficient,
  `particleWallFriction` in the operation block; this case declares none, so
  the unit uses 0.4 (published as the `particleWallFriction` KPI);
- drag: Schiller–Naumann `C_D`, for the slip and for `u_t`;
- gas friction: Fanning (Blasius turbulent / 16/Re laminar);
- solids friction: Yang (1974), on the voidage and `u_t/u_p`.  This line's
  mean inclination is 11.5°, below the 30° cutoff (`dz/L` above 0.5 in
  magnitude), so the horizontal equation is used — the run prints which one, and says that a
  mixed line should be segmented;
- saltation: Rizk (1973).

## Inputs

Operation block is **hardware only** (the credo): pipe diameter `D`, length `L`,
vertical rise `dz`. Every velocity, the suspended density and the pressure drop
are **results**. Particle density comes from the solid component's
`solid { rho_p; }` (silica = 2650 kg/m³); the size from the inlet PSD (Sauter
mean for the drag). The carrier-gas viscosity needs a
`transport { vapour { viscosity { model Chung; } } }` block in the
thermoPhysPropDict (for the Reynolds numbers).

The feed stream `0/Feed` carries the sand as the `solid` phase of its overall
`componentMolarFlows` (`silica 46.6045273 kmol/h`, 2800 kg/h, beside 50 kmol/h
of nitrogen in the `vapour` phase), with a `particleSizeDistribution` block.
