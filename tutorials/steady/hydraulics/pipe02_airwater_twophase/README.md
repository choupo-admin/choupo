# Gas-liquid two-phase pressure drop — air-water (Lockhart-Martinelli)

Air (N₂) + water flowing through a horizontal 0.05 m × 10 m commercial-steel
line. The pipe's **two-phase path activates automatically**: the feed flashes
two-phase at 2 bar / 25 °C (N₂ is supercritical → all vapour; water → mostly
liquid), so 0 < V/F < 1 and the pipe routes to the gas-liquid models instead of
the single-phase liquid path.

## Result (Lockhart-Martinelli, Chisholm multiplier + Butterworth holdup)

| quantity | value | meaning |
|---|---|---|
| superficial gas velocity j_G | 4.30 m/s | the fast, light phase |
| superficial liquid velocity j_L | 0.58 m/s | the slow, heavy phase |
| Re (gas-alone / liquid-alone) | 27 500 / 28 800 | both turbulent → **tt, C = 20** |
| Martinelli parameter X | 2.67 | X > 1 → liquid gradient dominates |
| **two-phase multiplier φ_L²** | **8.63** | ΔP is **8.6× the liquid flowing alone** |
| **liquid holdup ε_L** | **0.36** | vs **0.12** no-slip — the slow liquid is HELD UP |
| ΔP (10 m, horizontal) | 0.067 bar | the result |

**The two teaching points:**
1. **The multiplier φ_L² = 8.6:** two-phase friction is far above either phase
   alone — the classic Lockhart-Martinelli amplification, visible in the printout
   via X and the Chisholm C.
2. **Slip → holdup:** the homogeneous (no-slip) model would put the liquid
   fraction at j_L/(j_L+j_G) ≈ 0.12; L-M gives **0.36** because the liquid moves
   slower than the gas and accumulates. Switch `twoPhase { model homogeneous; }`
   to see the difference for yourself.

## Validation

The **Lockhart-Martinelli** correlation (Chem. Eng. Prog. 45 (1949) 39) was
developed and validated on **isothermal air-water** (and similar gas-liquid)
pipe data — so air-water is exactly the system it is trusted on. The model
structure here (X, φ_L², the tt/vt/tv/vv C-selection, the Butterworth 1975 void
fraction) reproduces that framework.

## All four models (Layer 1 + Layer 2)

Switch `twoPhase { model ...; }` and compare — the spread IS a lesson (two-phase
ΔP correlations routinely disagree by ~50 %):

| model | ΔP (10 m) | holdup ε_L | multiplier | notes |
|---|---|---|---|---|
| `homogeneous` | 6004 Pa | 0.12 (no-slip) | φ = 1 | pseudo-fluid |
| `LockhartMartinelli` | 6737 Pa | 0.36 | φ_L² = 8.6 | textbook (Layer 1) |
| `Friedel` | 8980 Pa | 0.12 (multiplier-only correlation -- carries NO holdup model; the 0.12 shown is the no-slip fallback) | φ_LO² = 11.1 | general, σ-based (Layer 2) |
| `BeggsBrill` | 7821 Pa | 0.25 | f-ratio 1.48 | regime = **intermittent**; inclination-aware (Layer 2) |

Layer 2 (`Friedel`, `BeggsBrill`) needs **surface tension** — supplied here by
`transport { surfaceTension { model BrockBird; } }` (from water's Tc/Pc/Tb).
Beggs-Brill also classifies the **flow pattern** (segregated / intermittent /
distributed) and corrects holdup for pipe **inclination** (here horizontal, so
ψ = 1).

## Honest scope

- **Adiabatic**: the inlet vapour fraction is held along the pipe (no flashing /
  condensation in the line). Flashing flow is a future increment.
- **Liquid density**: ρ_L = 877 kg/m³ comes from the **Rackett** branch, ~12 % low
  for water (a known anomaly, also in `pipe01_water_line`). It biases the
  *absolute* ΔP; the correlation *structure* is unaffected.
- Liquid viscosity via `operation { viscosity ...; }` (water's value): the flash
  leaves a trace of dissolved N₂ in the liquid and the Vogel model has no N₂ entry.
