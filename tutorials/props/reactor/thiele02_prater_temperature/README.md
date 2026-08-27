# thiele02_prater_temperature — how hot the inside of a pellet gets

The SAME pellet as `thiele01_sphere_first_order`, with one block added, so the
difference between the two runs **is** the temperature.

```
runCase tutorials/props/reactor/thiele02_prater_temperature
```

---

## The one difference

```
thermal
{
    heatOfReaction        -2.83e8;   // J/kmol  (exothermic, negative)
    thermalConductivity    0.25;     // W/(m.K), effective, pellet
    surfaceConcentration   0.021;    // kmol/m3
}
```

Everything else — catalyst, species, T, P, rate constant, diffusion, grid,
verification tolerances — is `thiele01` unchanged.  Run both and diff the
output: nothing else moves.

## What it publishes, and what the answer is

The reaction is exothermic, so the pellet is hottest where the reactant is
most depleted, which is the centre:

| | |
|---|---|
| Prater number β | **0.4017** |
| surface temperature `T_s` | 573.15 K |
| centre temperature | **736.65 K** |
| ΔT across the pellet | **163.5 K** |

The field CSV gains two columns, `T_over_Ts` and `T_K`, one value per node —
so the temperature is a FIELD, not a headline number, and the EduTool paints
the same discs by it.

## Where the temperature comes from — and why it is EXACT

The species and energy balances inside a pellet carry the **same** reaction
term.  Eliminate it between them and, for constant `D_eff` and `k_eff` and any
kinetics at all, what is left is a first integral — **Prater's relation**:

```
    T(r) - T_s  =  beta * T_s * ( 1 - c(r)/c_s )

    beta  =  (-dH) * D_eff * c_s / ( k_eff * T_s )
```

So the temperature field costs **no second boundary-value problem**.  It is
algebra over the concentration field the operation already solved.

**And here it is exact, not an approximation.**  The obvious objection — *"but
the concentration profile was solved isothermally"* — does not apply, and the
reason is worth having:

> What couples the two balances is the RATE's dependence on temperature.  This
> case declares `rateConstant 40.0;` — a **number**, not an Arrhenius law.  The
> reaction term therefore does not know the temperature, the species equation
> is independent of the energy equation, and its profile is exact.  Prater then
> hands back the exact temperature.

Nothing is linearised.  Nothing is iterated.

## What happens the moment you write k(T)

The coupling comes back, and with it the thing this operation refuses to
solve.  Its own run says so:

> the NON-ISOTHERMAL pellet is not modelled: coupled to Arrhenius it has up to
> three steady states for one phi and eta may exceed 1, so its answer is a SET
> and a Newton would return whichever root the guess was nearest.

β is then the size of the temperature excursion that Arrhenius factor would be
exposed to — 163.5 K here — which is why it is also the measure of how badly a
fixed-`k` reading would mislead.  **That case is deliberately not this one.**

## The numbers are teaching values, and none is measured

The catalyst record this case carries already refuses to be quoted of itself:

> Round values in the range commonly quoted for a porous gamma-alumina support
> pellet.  NOT taken from, and NOT traceable to, any primary measurement.

The three numbers in `thermal {}` are of the same kind.  The conductivity is in
the range usually quoted for such a pellet; the heat of reaction and the
surface concentration were chosen so that β lands where the lesson is — a
centre visibly hotter than the surface.  **No number here is a claim about CO
oxidation, or about any real pellet.**

`surfaceConcentration` has to be declared and cannot be derived: the
dimensionless first-order problem this operation solves does not contain `c_s`
at all, which is exactly why its concentration field is published as `c/c_s`.

## What is still not modelled

* The **coupled** non-isothermal pellet, with Arrhenius kinetics and its
  multiplicity.  Out of scope, and the run says so every time.
* **Knudsen diffusion** — the `D_eff` that enters β inherits that caveat whole,
  and the run announces it.
* Any order other than first, any external film resistance, any pellet-size
  distribution.  All as in `thiele01`.
