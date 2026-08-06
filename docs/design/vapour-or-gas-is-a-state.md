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
corpus is meant to teach. `absorption01_CO2_water` runs at ambient
temperature, where the engine states "no pure liquid to reference above Tc"
about a substance **below** its Tc.

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
