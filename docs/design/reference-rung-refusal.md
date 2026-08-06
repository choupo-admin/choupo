# The reference rung — a declared field the hot path did not honour

> **KIND: ADR · STATUS: DECIDED and IMPLEMENTED 2026-08-06.**  Taken under the
> standing delegation ("decide!"), and it revised its own plan on the first
> measurement — which is the part worth reading.

---

## 1. What I set out to do, and why that was wrong

The queued task said: *make the reference state of `standardThermochemistry` a
declared, parsed field, announce it, and refuse mixing rungs.*

The first measurement killed the first two thirds of that. `referenceState` has
been a parsed field for a long time. `Component::readFromDict` reads it,
validates it against `idealGas` / `pureLiquid` / `pureSolid`, refuses anything
else by name, and stores it as `naturalPhase_`. And `h_formation(T,
targetPhase)` — the enthalpy router — **honours it correctly**, taking the
phase transition at 298 K and integrating in the target phase.

So the plan was written against a defect that had already been fixed, and
carrying it out would have produced a second home for the same field.

What is actually broken is narrower and worse.

## 2. The measurement

```
247  component records under data/standards/components/
160  carry standardThermochemistry{}
142    take the DEFAULT rung (no referenceState key)
 16    declare pureSolid          (CaCO3, sucrose, glucose, silica, ...)
  2    declare pureLiquid         (H2SO4, HNO3)
  0  of those 18 carry an idealGasHeatCapacity{} block
```

The 142 defaulters were checked, not assumed: 51 of them are combustion
radicals (`CH3`, `OH`, `HCO`, …) carrying `role nonvolatile`, which in that
family means *never condenses* rather than *never vaporises*. `idealGas` is the
correct rung for every one of them. **No migration is needed** — the default is
right wherever it is taken.

## 3. The defect

`h_pure_ig(T)`, `s_pure_ig(T)` and therefore `g_pure_ig(T)` read `Hf298_` and
`S298_` straight off the record and integrate the ideal-gas Cp on top. They did
that whatever the record declared. Their consumers are not marginal: both Gibbs
reactors, `ReactiveFlash`, `Reaction::Kp`, `ConversionReactor`,
`EquilibriumReactor`, `BatchReactor`'s internal-energy leg, and
`ThermoPackage`'s `H_ig` / `S_ig`.

A `pureSolid` datum read on that path comes back wrong by a heat of
sublimation — right sign, plausible magnitude, no diagnostic.

**The catalogue could not reach it, and the reason is the point.** All 18
non-gas-rung records simply lack a gas Cp, so `h_pure_ig` threw. Right outcome,
wrong reason, and the message said:

```
Component 'H3PO4': h_pure_ig(T) needs idealGasHeatCapacity block in.dat
```

That is advice. A curator following it — and it is reasonable advice for
H3PO4 or HNO3, which have perfectly good gas-phase heat capacities — converts
an honest refusal into a silent wrong answer. **The error message pointed at
the bug.**

Harmless-because-unchecked is not safety, for the second time in three days;
the first was `PolynomialCp` parsing `Tmin`/`Tmax` and never reading them.

## 4. The ruling

`h_pure_ig` and `s_pure_ig` refuse when the record declares a non-gas rung,
**before** the Cp check, so the message names the real cause:

```
Component 'H3PO4': h_pure_ig(T) evaluates the IDEAL-GAS rung, but this record
declares standardThermochemistry.referenceState pureSolid -- dHf_298 and s_298
are tabulated on the solid standard state, so reading them here would be wrong
by a heat of sublimation.  Use h_formation(T, phase), which takes the
transition at 298 K.  Do NOT 'fix' this by adding an idealGasHeatCapacity{}
block: the Cp is not what is missing.
```

The refusal quotes the record's **own word**, not the engine's internal phase
name, so the reader can find the key in their file.

One routing change rides with it: `ThermoPackage`'s nonvolatile guard tested
`hasCpIdealGas()` alone, which would send a future solid-rung record with a gas
Cp into the vapour half and hit the new refusal mid-solve. It now also requires
`datumOnIdealGasRung()`. That predicate is deliberately **separate** from
`hasCpIdealGas()` and deliberately does **not** require `hasGibbsData_` — a
first draft folded all three together and would have rerouted the 87 records
that carry a gas Cp and no formation datum at all.

Byte-identical on today's catalogue, by measurement rather than by hope.

## 5. What this does NOT settle

**`water.dat` is still the live problem, and it is a different one.** Its
`standardThermochemistry` is the ideal-gas datum (−241826 J/mol, 188.834
J/mol·K) and its rung is, correctly, the default. Nothing here is mislabelled.
But an aqueous reaction wanting water's **liquid** datum has nowhere to read one
from, which is why deriving `water-dissociation`'s equilibrium constant from the
records gives **logK25 = −12.4986 against a stored −14** — a factor of 32 in K,
and dH 79 % off. With the liquid values (−285830, 69.95) the same arithmetic
gives −13.998.

That is a **missing second datum**, not a wrong one, and `check_reference_rung`
says so explicitly rather than implying coverage it does not have. Closing it
means letting one record carry a datum on more than one rung — a data-layer
change, not a guard, and it wants Vítor's word before the grammar moves.

**`gStd(T)` as an interface function** (the OpenFOAM shape, from which `K =
exp(−ΔG°/RT)` falls out as an identity — see
[`theory-in-class-structure-study.md`](theory-in-class-structure-study.md) and
[`../architecture/class-structure.md`](../architecture/class-structure.md) rules
4 and 5) still follows **after** that, not before. A standard-state function is
not worth building on data that cannot say which standard state it is on. That
ordering was the study's finding and this slice confirms it from the other side.

## 6. Rejected alternatives

* **Migrate the 142 defaulters to an explicit `referenceState idealGas;`.**
  Rejected: measured correct in every case, so the migration would change 142
  files to say what the code already says, and create a second place for the
  default to drift from.
* **Make `hasCpIdealGas()` itself rung-aware.** Rejected: it is named after the
  Cp block and answering a different question under that name is how the
  original conflation happened.
* **Warn instead of refuse.** Rejected under the project's own posture — the
  quantity is wrong by a latent heat, not uncertain by it.
