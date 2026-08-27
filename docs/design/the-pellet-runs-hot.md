# The pellet runs hot

*A temperature field for the Thiele EduTool, 2026-08-27.*

## 1. Where this came from

The owner, on his students: *"o módulo de Thiele — um gráfico interativo que
mostrasse campos 2D de temperatura ia ajudar imenso"*, together with the
instruction to build **the simple thing that works first** and only then the
complex one — Gall's law, named.

Two facts had to be established before anything was built.

**The 2D field already existed.**  `ThielePelletTool` has painted the pellet
cross-section as rings (sphere, cylinder) and mirrored slabs since it shipped,
each band filled with one published `c_over_cs`.  What was missing was not the
picture; it was the quantity.

**The engine refused temperature, and said why.**  `ThielePellet.cpp` announces
on every run:

> the NON-ISOTHERMAL pellet is not modelled: coupled to Arrhenius it has up to
> three steady states for one phi and eta may exceed 1, so its answer is a SET
> and a Newton would return whichever root the guess was nearest.

That refusal is correct and stays.  This slice does not overturn it.

## 2. What Prater's relation buys, and why it is EXACT here

The species and energy balances inside a pellet carry the **same** reaction
term.  Eliminating it between them gives, for constant `D_eff` and `k_eff` and
any kinetics whatsoever, a first integral:

```
    T(r) − T_s  =  β · T_s · ( 1 − c(r)/c_s ),
    β           =  (−ΔH) · D_eff · c_s / ( k_eff · T_s )
```

So the temperature field costs **no second boundary-value problem**.  It is
algebra over the concentration field the op already solves.

**And here it is exact, not an approximation — which is the opposite of what
the obvious reading suggests, and the first draft of this record got it
wrong.**

What couples the two balances is the rate's dependence on temperature.  This
op takes `rateConstant` as a **number**, not an Arrhenius law.  The reaction
term therefore does not know the temperature, the species equation is
independent of the energy equation, its profile `c(r)` is exact, and Prater
hands back the exact temperature field.  Nothing is linearised and nothing is
iterated.

**The coupling returns the moment `k` is Arrhenius** — and that is exactly
where the multiplicity the op declines to solve lives.  `β` is then the size
of the temperature excursion that Arrhenius factor would be exposed to, so it
doubles as the measure of how badly a fixed-`k` reading would mislead.  The
run announces all of this; it judges none of it.

## 3. What was built

**Engine.** An OPTIONAL `thermal {}` block on the op:

```
thermal
{
    heatOfReaction        -2.83e8;   // J/kmol  (exothermic, negative)
    thermalConductivity    0.25;     // W/(m.K), effective, pellet
    surfaceConcentration   0.021;    // kmol/m3
}
```

Absent, the run is byte for byte what it was.  Present, the field CSV gains
`T_over_Ts` and `T_K`, and the diagnostics gain `prater_beta`,
`deltaT_centre_K`, `T_centre_K` **and the three declared ingredients beside
them** — β is derived and announced with everything that made it, never
declared, because the tree stores no derivative.

`surfaceConcentration` cannot be derived and refuses by name if absent: the
dimensionless first-order problem this op solves does not contain `c_s` at
all, which is precisely why its field is published as `c/c_s`.

**Case.** A NEW witness, `thiele02_prater_temperature` — the same operation as
`thiele01` with only the thermal block added, so **the difference IS the
temperature**.  `thiele01` stays the isothermal control and its golden is
untouched (verified: PASS, unmoved).

Its three numbers are teaching values and the case says so.  The catalyst
record it carries already declares itself a surrogate ("NOT traceable to any
primary measurement.  Do not quote it."), and these are of the same kind.

**Result:** β = 0.4017, and the pellet centre runs at **736.7 K against a
surface at 573.15 K — 163.5 K hotter**.  That is the intuition a student does
not have, and a line plot of `c/c_s` cannot give them.

**GUI.** The same three discs, with a toggle: paint by `c/c_s` or by
temperature.  One picture, two stories.

* A toggle rather than a second strip of discs, because the strip's height is
  a measured budget (`MenuBar.tsx`) and a second row would have to come out of
  it.  The simple thing that works.
* The toggle appears **only** when the run published a temperature.  A control
  that yields the same picture teaches the reader that controls do nothing.
* The temperature ramp is normalised over **one range across all three
  shapes**, so the same colour means the same kelvin.  Per-shape normalisation
  would paint three different pellets identically and hide the comparison the
  strip exists for.
* A band with no published temperature keeps its concentration colour rather
  than falling to the ramp's cold end: painting *no datum* as *coldest* is a
  number where there is none.
* The CSV reader accepts **exactly two** header forms and refuses anything
  else by name — an equality against a closed list, not a prefix test, so a
  drifted header cannot be read positionally and silently mis-columned.
* An isothermal row carries `undefined`, never `0` (absolute zero) and never
  `1` (a claim the pellet is isothermal).  Three different statements.

## 4. NOT done, said plainly

* **The non-isothermal pellet is still not solved.**  Arrhenius kinetics, the
  coupled BVP, its up-to-three steady states and η > 1 remain out of scope,
  and the op's refusal still says so on every run.  This slice makes the
  temperature *visible* under a fixed rate constant; it does not make the
  coupled problem tractable.
* **No number here is measured.**  β's three ingredients are teaching values
  in a case whose catalyst record already refuses to be quoted.  Nothing in
  this slice is a claim about CO oxidation or about any real pellet.
* **Knudsen diffusion** is still not modelled, and the op still says so — the
  `D_eff` that enters β inherits that caveat whole.
* The `η(φ)` family chart is untouched: it is parametric in φ and holds no
  pellet fixed, so it has no temperature to show.
