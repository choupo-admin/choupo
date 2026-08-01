# A5 thermal: the non-isothermal fixed bed — design before code

Status: **T1 AND T1.5 SHIPPED 2026-08-01**, same day as this design
(T1: batch20_thermal_breakthrough — energy CLAIMED at 5.7e-5, t_50
806 s vs the isothermal 3042 s; T1.5: batch21_tsa_hot_purge — feed.T as
the hot-purge control, the WHOLE commitment re-declared OUT at T_old /
IN at T_new, ~97 % regenerated, energy claimed across the swing at
1.6e-4; gate check_thermal_bed, both slices sabotage-verified).  One
wording correction earned by the first run: DT_ad is announced as the
all-heat-retained BOUND, because u_th < u_sh makes the heat LAG the
front and the observed rise sits well below it.  T2 = wall heat
exchange stays named and deferred.  Original design below, written
2026-08-01 ahead of implementation (the A-series pattern: spec first,
stencil audited, anchors named before the run).

## 1. Scope decisions (each one refuses out loud)

* **Thermal REQUIRES `flowModel ergun`.**  The A3 constant-(u, P, T)
  closure holds c_tot = P/(RT) constant BY DECLARATION; a temperature
  field makes c_tot vary per cell, so thermal + constantVelocity is a
  contradiction of declared constants — REFUSED by name (A3 stays the
  isothermal teaching model).  Ergun mode already integrates every
  species and takes P per cell from ideal gas — it extends naturally to
  T per cell.
* **One temperature per cell** (local gas–solid thermal equilibrium).
  The two-temperature model (gas/solid film resistance) is a LATER
  refinement; the assumption is DECLARED in the run header.
* **Adiabatic in T1.**  The wall term −(4h_w/d)(T−T_w) is T2; asking for
  `wallHeatTransfer{}` in T1 refuses, named.
* **Adsorbed-phase heat capacity neglected, DECLARED** (the standard
  teaching simplification; stated in the header beside the solid cp).
* **k_LDF stays the declared constant** (its own T-dependence is sample
  data the case may some day declare; not fabricated here).

## 2. The energy balance (per cell j)

    [ eps*c_tot,j*cpg_j + rho_b*cp_s ] dT_j/dt =
        - (u*c_tot*cpg)|face * dT/dz                (advected enthalpy)
        + rho_b * Sum_i (-dH_ads,i) * dq_ij/dt      (adsorption release)

with cpg the MIXTURE molar ideal-gas heat capacity from the components'
own declared idealGasHeatCapacity models (no new data), and dH_ads the
SAME isosteric datum the van't Hoff b(T) and the energy ledger already
consume — one datum, three readers, no second home.  Axial thermal
dispersion defaults to 0 (declared), same posture as Dax.

The isotherm becomes T-dependent PER CELL: `Adsorbent::loading(p, T_j)`
— the van't Hoff machinery already exists; the change is passing the
cell's T instead of the declared constant.

State layout: one extra row block `T_j (N)` appended to the packed Y
(after the ledger rows), positivity-guarded in Kelvin.

## 3. New datum: the solid heat capacity `cp_s`

The adsorbent identity record carries no cp today.  HONESTY RULE: no
invented literature pin.  T1 reads `operation.solidHeatCapacity` from
the CASE (sample/equipment data, the kLDF pattern), with `scope` and
`source` strings REQUIRED — a teaching value declares itself as one.
Curating a primary-cited cp onto `assets/zeolite13X.dat` is a separate
curation act (Vítor's), after which the case value becomes an override.
A thermal run without a declared cp_s refuses, named.

## 4. Validation anchors (equilibrium theory — printed BEFORE the run)

For a single adsorbate + inert carrier, adiabatic:

* **Thermal-wave velocity** (no adsorption coupling limit):
      u_th = u * c_tot*cpg / (eps*c_tot*cpg + rho_b*cp_s)
  printed beside the concentration front's u_sh; the run's temperature
  front must travel at the coupled speed between these bounds.
* **Adiabatic temperature rise** of the combined front (energy over the
  breakthrough): DT = q*(c_in)*(-dH_ads) / (cp_s + eps*c_tot*cpg/rho_b)
  per kg basis — the plateau the outlet T must reach while the front
  loads, decaying back after saturation.
* **The isothermal limit IS the regression**: cp_s -> infinity (or a
  declared huge value) must reproduce batch18's breakthrough to golden
  tolerance — the thermal model must CONTAIN the isothermal one.
* The energy LEDGER stays an exact state difference; in thermal mode
  the vessel enthalpy prices each cell at ITS OWN T (the per-cell
  extension of today's ergun-mode vesselEnthalpy).

Witness case: `batch20_thermal_breakthrough` (ergun, CO2/He on 13X,
declared cp_s, adiabatic; golden pins the outlet T plateau against the
anchor + the crossings against the isothermal-limit shift).  Gate:
extend or sibling `check_feed_switch` with the thermal refusals
(thermal+A3, missing cp_s, wallHeatTransfer in T1).

## 5. Interactions with today's A5 feed switch

The feed switch composes: a thermal bed switched to hot clean carrier
IS the TSA regeneration step — but T of the FEED is a new control
(`feed.T` today refuses).  T1 keeps that refusal (feed enters at the
initial declared T); lifting it is the natural T1.5 once the energy
balance exists, and the refusal text will say so.
