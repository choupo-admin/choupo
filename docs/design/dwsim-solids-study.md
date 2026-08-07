# DWSIM and the solid phase — the peer that already solved Choupo's open question

> **KIND: STUDY (no decision, no code).**  Commissioned by Vítor 2026-08-07:
> *"If openfoam is not the way, try dwsim."*  Read from a sparse clone of
> `DanWBR/dwsim` (`DWSIM.Thermodynamics`, depth 1, branch `windows`, 2026-08-07),
> not from documentation or memory.  Level 3.  **Nothing here is a proposal.**

The instruction was right, and it is worth being precise about *why*, because
it does not contradict the earlier finding.

[`theory-in-class-structure-study.md`](theory-in-class-structure-study.md)
concluded that OpenFOAM has more to teach Choupo than DWSIM — *"OpenFOAM
composes, DWSIM and Choupo subclass."*  That is about **class structure**, and
it still holds.  But the question actually blocking Choupo is not class
structure; it is **how a process simulator poses a solid phase in a flowsheet**,
and there OpenFOAM has nothing to say, because it is a CFD framework that never
faces a crystalliser.  DWSIM is the peer.  A comparator is chosen per question,
not once.

---

## 1. The finding: DWSIM has ONE solid mechanism, not two

Choupo has two ways a solid can appear
([`../architecture/solid-formation-routes.md`](../architecture/solid-formation-routes.md)):
the **chemistry route** (a mineral precipitating from solution, decided by a
dissolution K inside the speciation) and the **fugacity route** (`SolidPhase`,
a pure crystal freezing out of its own liquid).  That document records the
unsettled part: a crystallising `Phase` removes moles through the flash's phase
split while a mineral removes them inside the speciation, and **nothing
reconciles the two subtractions**.

DWSIM does not have that problem, because it does not have two mechanisms.

`FlashAlgorithms/ElectrolyteSVLE.vb` — the electrolyte solid-vapour-liquid
flash — does not implement solid formation at all.  It delegates:

```vb
Dim nl3 As New NestedLoopsSLE With {.SolidSolution = False}
```

and `NestedLoopsSLE` decides solid formation from **fusion thermodynamics**:

```vb
Ki(i) = (1 / activcoeff(i)) * Exp(-CompoundProperties(i).EnthalpyOfFusionAtTf _
        / (0.00831447 * T) * (1 - T / CompoundProperties(i).TemperatureOfFusion))
```

So the salt and the ice go through the *same* equation.  **The chemistry does
not enter as a second mechanism; it enters through the activity coefficient**,
the `1/activcoeff(i)` factor.  A dissolution equilibrium is what the activity
model makes of the solution, not a separate subtraction performed elsewhere.

## 2. Choupo's crystal equation is independently corroborated

That expression is, term for term, the one `SolidPhase::fEffective` implements:

| | DWSIM `NestedLoopsSLE` | Choupo `SolidPhase` |
|---|---|---|
| driving term | `Exp(-Hfus/(R T) (1 - T/Tf))` | `exp(-dG_fus/(R T))`, `dG_fus = Hfus (1 - T/Tfus)` |
| liquid side | `1 / activcoeff(i)` | `K = f_s/f_l` with `f_l = gamma * Psat` |
| pure-solid basis | one crystal per compound | the purity claim, zero at every other index |

Two independent implementations, in different languages, reaching the same
equation is the strongest evidence available short of measurement — and it is
evidence of a kind `check_ice_freezing` cannot produce, because that gate
recomputes Choupo's arithmetic from Choupo's own record.

## 3. The ΔCp term — and the trap in reading it

`NestedLoopsSLE` also carries the **heat-capacity-corrected** form, which
Choupo does not have:

```vb
MaxAct(i) = Exp(-Hf(i)*1000/8.31446/T * (1 - T/Tf(i)) _
            - dCp(i)/8.31446 * ((T - Tf(i))/T + Log(Tf(i)/T)))
```

The correction is real thermodynamics: ΔHfus is measured *at* the melting
point, and using it far from Tf without the liquid/solid Cp difference is an
approximation that degrades as T departs from Tf.

**But DWSIM does not use it.**  Three lines above, having computed both heat
capacities, it writes:

```vb
'ignoring heat capacity difference due to issues with DWSIM characterization
dCp(i) = 0.0#  '(cpl(i) - cps(i)) * constprop.Molar_Weight
```

I had drafted "DWSIM includes the ΔCp term and Choupo omits it" before reading
those three lines, and it would have been false in the way that matters: the
term is *written and disabled*, for a stated data reason, not a theory one.

The lesson for Choupo is therefore not "add ΔCp".  It is that a peer with a
much larger compound database judged its own characterisation data unequal to
the term and **said so in the code**.  Choupo omits the term silently.  Under
its own doctrine — a declared approximation must be visible — the honest step
is to name the omission where the crystal is computed, which costs nothing and
tells a student exactly how far from Tf the model can be trusted.

## 4. What this implies (implications, not a decision)

* The reconciliation problem named in `solid-formation-routes.md` §3 may be a
  **false dilemma**.  DWSIM suggests the resolution is not to reconcile two
  subtractions but to have one mechanism, with the chemistry entering through
  γ.  Whether Choupo's speciation-resident mineral route can be re-expressed
  that way is a real question and is NOT answered here.
* Choupo's crystal is corroborated, which strengthens the case for giving it a
  door — but the door remains the grammar question from the OpenFOAM study,
  and that study's recommendation (one uniform `phases ( … )` list) is
  unaffected by anything here.
* `SolidSolution = False` is an explicit DWSIM flag.  Choupo's purity claim is
  the same assumption, currently a comment rather than a named option.

## 5. What this study did not examine

* **Only `DWSIM.Thermodynamics`**, sparse-checked out.  The unit-operation
  side (its crystalliser block) was not read.
* **Whether DWSIM is RIGHT.**  Agreement between two implementations is
  evidence of correctness, not proof; both could inherit the same textbook
  simplification, and both omit ΔCp in practice.
* **No numerical comparison was run.**  Nothing here is validation; no Choupo
  number moved.

## Sources

* `DanWBR/dwsim` @ branch `windows`, sparse clone 2026-08-07 —
  `DWSIM.Thermodynamics/FlashAlgorithms/{NestedLoopsSLE,ElectrolyteSVLE}.vb`
* [DWSIM project site](https://dwsim.org/)
