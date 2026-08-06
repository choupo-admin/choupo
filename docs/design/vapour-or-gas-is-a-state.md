# Vapour or gas — a STATE relation stored as a substance flag

> **KIND: ADR · STATUS: FINDING RECORDED 2026-08-06; implementation NOT yet
> started.**  Written after going to the sources rather than to the architect,
> on Vítor's instruction ("à vapour and gas difference you must understand it
> online!").

---

## 1. What the distinction actually is

From the standard references, and it is not a matter of taste:

> A **vapour** is a substance in the gas phase at a temperature **below** its
> critical temperature — so it **can be condensed to a liquid by raising the
> pressure alone**, without cooling.  A **permanent gas** is one **above** its
> critical temperature, where no pressure whatever will liquefy it, and above
> which there is no distinction between gas and liquid at all — only a single
> fluid.

Sources: [Physics LibreTexts 6.4 *Gas, Vapour, Liquid and Solid*](https://phys.libretexts.org/Bookshelves/Thermodynamics_and_Statistical_Mechanics/Heat_and_Thermodynamics_(Tatum)/06:_Properties_of_Gases/6.04:_Gas_Vapour_Liquid_and_Solid) ·
[Britannica, *critical temperature*](https://www.britannica.com/science/critical-temperature) ·
[Britannica, *Continuity of gaseous and liquid states*](https://www.britannica.com/science/gas-state-of-matter/Continuity-of-gaseous-and-liquid-states) ·
[Wikipedia, *Vapor*](https://en.wikipedia.org/wiki/Vapor)

**The load-bearing consequence: "vapour" and "gas" are not two kinds of
substance.  They are two STATES of one substance, and which one applies is a
relation between the substance's `Tc` and the local temperature.**  No
substance is a gas; a substance *is a gas at a temperature*.

## 2. What Choupo does

`data/standards/components/` carries a substance-level flag:

```
noncondensable true;     // permanent carrier gas (psychrometric carrier)
```

Exactly three records declare it — `N2`, `O2`, `CO2` — and the engine routes a
declaring component onto the Henry rung, announcing:

```
[resolver] CO2: permanent gas (noncondensable) -- HENRY rung through its
gas-liquid record, not the Raoult backbone (no pure liquid to reference
above Tc); its dissolved amount is an aqueous total
```

**The engine's own justification names the criterion — "above Tc" — and the
flag it acts on contains no temperature.**

## 3. The defect, and it is not academic

| record | Tc | permanent gas when |
|---|---|---|
| `N2` | 126.2 K | ordinary process work — the flag agrees |
| `O2` | 154.58 K | ordinary process work — the flag agrees |
| **`CO2`** | **304.13 K = 31.0 °C** | **only above 31 °C** |

Below 31 °C carbon dioxide is a **vapour**: it condenses under pressure alone.
That is not a corner case — it is how every CO2 cylinder works, and it is the
entire basis of supercritical-CO2 extraction, which is a unit operation this
corpus is meant to teach.

> **CORRECTED TWICE, 2026-08-06, and the method error is the lesson.**
>
> **First claim (wrong):** that `absorption01_CO2_water` and eight batch
> adsorber cases run CO2 at 298.15 K *"while the engine announces no pure
> liquid to reference above Tc"*.  Their TEMPERATURE was measured; their CODE
> PATH was assumed.  They never reach the reactive-electrolyte builder.
>
> **Second claim (also wrong):** that exactly one case in 332 consults the
> flag.  That came from running every case and grepping for the resolver's
> announcement — but `thermoAnnounce()` is **gated at verbosity 2**, so the
> sweep counted cases that PRINT at their configured verbosity, not cases that
> CONSULT the flag.  Twice in one slice I measured a proxy instead of the
> thing, which is the exact failure this project keeps paying for.
>
> **What is actually true**, from the declarations rather than the console —
> six cases carry a flagged gas as an apparent component in a reactive
> package:
>
> | case | flagged | min T |
> |---|---|---|
> | `column13_sour_water_stage_identity` | CO2 | 350 K |
> | `flash14_calcite_carbonate_basis` | CO2 | 313.15 K |
> | `flash16_calcite_precipitation` | CO2 | 313.15 K |
> | `flash18_water_analysis_basis` | CO2 | 313.15 K |
> | `flash19_organic_and_precipitate` | CO2 | 313.15 K |
> | `basis01_two_unit_chain` | CO2, N2 | 313.15 K |
>
> **Every one is ABOVE CO2's Tc of 304.13 K**, so the flag is doing correct
> work everywhere it is used and the announcement correctly stays silent.  The
> conclusion is unchanged — there is no witness — but it now rests on the
> right evidence, and the corrected picture is more interesting than the wrong
> one: five of the six sit at 313.15 K, **nine kelvin above** the critical
> temperature.  One carbonate case at ambient temperature would cross it.
>
> CO2's flag therefore remains a false claim about a substance below 31 °C,
> but a **latent** one: no shipped case produces a wrong answer from it today.

`N2` and `O2` are not exempt in principle either: in cryogenic air separation
— a canonical chemical-engineering unit operation — both are condensed on
purpose, and the flag would be false there too.

**This is the K_b shape** (a derived quantity stored beside its inputs, drifted
from them), with one twist that makes it worse: the quantity is not derivable
from other *record* fields at all, because it depends on the **state**. `Tc` is
already on all 247 records. The flag is a second home for a fact that cannot
be a record field.

## 4. What OpenFOAM does, since that is the instruction

**It has no such flag.** Non-condensable behaviour is not declared anywhere; it
falls out of the partial-pressure arithmetic. In
`multiphaseEuler/fvModels/homogeneousCondensation`, the saturation
concentration is

```
cSat = pSat/p * rhoGas/WGas
```

A species whose saturation pressure exceeds the total pressure at that
temperature simply never condenses — the physics emerges from the equation
instead of from an attribute. Condensation itself is a **runtime-selectable
`fvModel`**, and a phase is a first-class named entity with its own complete
`thermophysicalProperties.<phase>` file, not a flag on a substance.

Source: [`homogeneousCondensation.C`](https://cpp.openfoam.org/v13/homogeneousCondensation_8C_source.html) ·
[OpenFOAM 13 release notes](https://openfoam.org/release/13/) ·
[OpenFOAM v13 User Guide §8.1](https://doc.cfd.direct/openfoam/user-guide-v13/thermophysical)

That is rule 4 of [`class-structure.md`](../architecture/class-structure.md)
seen from the physics side: **derive the behaviour from the state, do not
store the conclusion.**

## 5. The ruling

**The flag is not deleted, and the routing is not silently changed.**  Both
would be wrong:

* Deleting it loses a legitimate *modelling* statement. In a psychrometric
  dryer at 300 K with trace CO2, "treat this as a permanent carrier" is a
  sound simplification, and the record's own comment says exactly that —
  `// permanent carrier gas (psychrometric carrier)`.
* Deriving it silently would change CO2's routing in every ambient-temperature
  case, which is a physics change wearing a refactor's clothes.

So it takes the shape **this project has already ratified one axis over** —
`role` (the case's modelling class) versus `volatility {}` (the substance's
physics), where the engine *announces the contradiction instead of obeying it
in silence*:

> `noncondensable true;` is a **modelling class**, not a physics claim.  When a
> component declaring it is evaluated at a temperature **below its own declared
> `Tc`**, the engine ANNOUNCES — naming `Tc`, the actual `T`, and the
> consequence — and continues.

The run's numbers do not move. What changes is that a student meets the
gas/vapour distinction at the exact moment it bites, on a real stream, with
both numbers in front of them.

## 5a. Status: implemented, and NOT yet witnessed

The announcement is built. `ReactiveVLEConfig` carries each flagged
component's `Tc` (attached by the builder, which holds the `Component` —
re-reading the record in the solver would be a second home for one fact), and
`ReactiveVLE::solve` announces once per instance for any flagged component
solved below it.

**It cannot fire on any case in the corpus, and that is stated rather than
glossed.** The single case that consults the flag runs N2 at 313.15 K against
Tc 126.2 K — correctly a permanent gas, correctly silent. So this contract has
parts one and two of the project's three-part test and **not part three**:

1. the contract is written — yes, here;
2. the engine announces the violation by name, with both temperatures — yes;
3. **a case fires it — no.**

The honest options are to build a witness (a reactive aqueous CO2 case at
ambient temperature; `chemistry/CO2-dissolution.dat` and `CO2aq-formation.dat`
both exist, so the records are there) or to leave the check unfireable and say
so. Shipping it silently as though it were consolidated is the one option that
is not available — an unfireable check is exactly the shape
`check_true_ions` had when it reported PASS on every run for months with both
of its inputs deleted.

Recorded as the owed work, not as done.

## 6. Rejected alternatives

* **Derive `noncondensable` from `T >= Tc` and route accordingly.** Rejected
  for now: correct physics, but it silently changes answers in the corpus, and
  a physics change is not a consolidation slice. It becomes available once the
  announcement has shown how many cases it touches — the measurement first.
* **Delete the flag as redundant with `Tc`.** Rejected: it is not redundant, it
  is a different *kind* of statement (modelling choice vs physical fact), which
  is precisely why the `role`/`volatility` split exists.
* **Refuse the contradiction.** Rejected: the psychrometric simplification is
  legitimate engineering, and I4's posture is that a deliberate approximation
  is announced, never forbidden — *the professor extrapolates on purpose, but
  knows he did.*
