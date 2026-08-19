# hxy01_ethanol_water_1atm — the enthalpy-concentration locus of ethanol/water at 1 atm

The saturated-liquid enthalpy on its bubble line, the saturated-vapour
enthalpy on its dew line, and the equilibrium tie between them — the data an
enthalpy-concentration (Ponchon–Savarit) construction is drawn on, and the
first thing the engine publishes that carries **enthalpy against
composition**.

Theory: `docs/theoryGuide.tex`, `\label{ch:ponchon}`.

```bash
runCase tutorials/props/scan/hxy01_ethanol_water_1atm
```

## What comes out

Two files, and a consumer needs both.

**`enthalpyConcentration.csv`** — a regular table, one header, homogeneous
rows:

```
x1,y1,T_K,h_liquid_J_per_mol,H_vapour_J_per_mol,role,status
```

**Every row is one equilibrium.**  It carries *both* ends of a tie line —
the liquid `(x1, h_liquid)` and the vapour `(y1, H_vapour)` that are in
equilibrium with each other — at the one temperature `T_K` they share.  So
nothing downstream pairs rows by index and nothing interpolates one end of a
tie.  `role` says only which composition was the uniform grid node:

| `role` | the grid node | `T_K` is | the other end |
|---|---|---|---|
| `bubble` | `x1` | the bubble temperature of `x1` | `y1`, the vapour in equilibrium with it |
| `dew` | `y1` | the dew temperature of `y1` | `x1`, the liquid in equilibrium with it |

The saturated-liquid curve is `(x1, h_liquid)` over all rows; the
saturated-vapour curve is `(y1, H_vapour)` over all rows.  `status` is `ok`
or names a refusal; a refused node keeps its grid coordinate and leaves the
solved fields **empty**, so a gap is visible rather than silently bridged.

**`enthalpyConcentration.meta`** — a `key,value` sidecar, written on every
run.  It states the two components, the pressure, **which enthalpy datum the
two columns are on**, which kernel computed each, the tie contract, whether
the heat of mixing is included, and the reason for every refused node.  The
construction's lever arms are enthalpy *differences*, so a constant offset
cancels in the geometry — which is exactly why the file has to say what its
axis means instead of letting the next reader assume.

## The datum

Both enthalpy columns are **absolute on Choupo's one enthalpy base, the
elements at 298.15 K**, from the same two kernels every energy balance and
duty in the engine is priced on:

* liquid — `ThermoPackage::H_liquid_formation(T_sat, x)`
* vapour — `ThermoPackage::H_stream_formation(T_sat, P, vapourFraction 1, y)`

The case declares that in its own `constant/thermoPhysPropDict`
(`caloric { energyBasis elementsDatum; liquid { enthalpyRoute
pureCpPlusExcess; } vapour { enthalpyRoute idealGasCp; } }`), and the builder
refuses any other energy basis.  A component that cannot be placed on that
datum is **refused by name with the remedy** — the operation never
substitutes a heat-capacity integral from a private zero, because a diagram
drawn on an inconsistent datum is geometrically pretty, physically
meaningless, and shows nothing on its face to say so.

## What the case shows

| quantity | value |
|---|---|
| bubble temperature, pure water | 372.45 K |
| bubble temperature, pure ethanol | 351.45 K |
| lowest temperature on the locus | 351.26 K |
| azeotrope (where `y1 − x1` changes sign) | between x_ethanol = 0.875 and 0.900 on this grid |
| tie-line gap λ = H(y\*) − h(x), minimum | 40 680 J/mol (at x_ethanol = 1) |
| tie-line gap λ, maximum | 45 053 J/mol (at x_ethanol = 0.125) |

The last two lines are the point of the case.  **Constant molar overflow is
the assumption that those two numbers are the same one.**  Here they differ
by 11 %: a mole of vapour condensing in the rectifying section does not
release what a mole of liquid needs to boil, and the flows are therefore not
constant down a section.  McCabe–Thiele cannot show that, because it has no
enthalpy axis to show it on.

## Provenance of every number

**Components** — `constant/components/ethanol.dat` and `water.dat`, sealed
copies of the `data/standards/` records.  Each contributes: `Tc`, `Tb`,
`HvapTb` (the Watson latent heat), `standardThermochemistry.dHf_298` (the
formation datum, ideal-gas reference state), the Antoine `vaporPressure`
coefficients, and the `idealGasHeatCapacity` and `liquidHeatCapacity`
polynomials.  Both records carry the header note *"individual literature
values — primary re-citation pending (IST review)"*, and that applies to
every one of those fields.  **Nothing in this case is better sourced than
the records it reads.**

**The activity model** — `constant/parameters/NRTL/ethanol-water.dat`, the
DECHEMA set: Gmehling & Onken, *DECHEMA Chemistry Data Series* Vol. I Part 1,
ethanol–water VLE-IG bank, `origin literature`, declared validity 298–373 K,
`nDataPoints 0` (the record is a literature quotation, not a refit here).
Its own note predicts the azeotrope at x_ethanol ≈ 0.894, T ≈ 351.4 K; this
scan's coarse grid brackets it between 0.875 and 0.900 with a lowest node
temperature of 351.26 K, which is consistent and is the only cross-check the
case makes against that claim.

**The vapour** — ideal gas, matching the ideal-gas basis the DECHEMA pair was
regressed on.  No fugacity departure enters `H_vapour`.

## What is NOT validated

Read this list before quoting any number above.

1. **No comparison with measured h–x–y data anywhere.**  The gate
   `check_enthalpy_concentration` recomputes this whole locus in an
   independent Python implementation of the same equations and requires
   agreement — that is *verification*, and it says nothing about whether the
   equations are right.  A validating comparison needs a published
   enthalpy-concentration dataset for ethanol/water and this case does not
   have one.

2. **The heat of mixing H^E is omitted, and it is exactly what this diagram
   would show.**  No pair of this activity model declares
   `calorimetricFit`, so the engine's liquid enthalpy is ideal mixing of the
   pure-liquid legs and the run announces it (`[advisory]`, and
   `excess_enthalpy_included,0` in the sidecar).  Ethanol/water has a large,
   strongly composition-dependent heat of mixing.  **The curvature of the
   published liquid line is therefore incomplete**, and the real line sits
   off it by H^E(x).  A VLE-fitted G^E can be differentiated into an H^E, but
   consistency is not correctness, so the engine declines to and says so.

3. **The pure-end λ does not equal the record's own `HvapTb`, and the gap is
   recorded rather than tuned.**  At x = 1 the tie collapses and λ *is* the
   state surface's heat of vaporisation at the boiling point:

   | | λ from this locus | record `HvapTb` | gap |
   |---|---|---|---|
   | ethanol | 40 680 J/mol | 38 560 J/mol | +5.50 % |
   | water | 41 488 J/mol | 40 660 J/mol | +2.04 % |

   Neither is an error in this case.  The elements-datum liquid leg takes the
   Watson transition at **298.15 K** and then integrates the **declared
   liquid Cp** to T (`Component::h_formation`, the Kirchhoff-consistent state
   form), while `HvapTb` is an independent datum measured at Tb.  The two
   come from different data and disagree.  The gate pins the gap in **both**
   directions so it can neither drift nor be quietly closed.

4. **Antoine is extrapolated at the water-rich end.**  Both records declare
   `Trange` ending at 369 K (ethanol) and 373 K (water); the bubble-point
   search evaluates up to 373.15 K.  The run announces both, and they reach
   the end-of-run caveat block.

5. **Ethanol's liquid Cp is integrated 0.45 K past its declared window, and
   nothing announced it.**  `liquidHeatCapacity.Trange (280 351)`; the
   pure-ethanol node sits at 351.45 K.  This is silent because
   `PolynomialCp::H` — the *integral* — does not call `noteRange`, while
   `PolynomialCp::Cp` does.  The numerical effect here is under 50 J/mol on a
   constant Cp, but the mechanism is general and is not this case's to fix;
   it is recorded here because a reader comparing the two announcements will
   otherwise conclude the liquid Cp was in range.

6. **One formulation only.**  gammaPhi + NRTL + ideal vapour, one binary, one
   pressure.  Nothing here exercises an EoS departure in the vapour
   enthalpy, a calorimetrically fitted liquid, or a second pressure.

## What this case does not do

It does not draw.  There is no difference point, no lever arm and no
staircase in the engine — those belong to a tool reading this locus, and
keeping the split there is what stops the geometry and the thermodynamics
from drifting apart.
