# One condition, four solvers — and why ice does not fit

> **KIND: ADR · STATUS: DESIGN DECIDED 2026-08-06.**  Taken under the standing
> delegation.
>
> **The first draft of this file was wrong, and the correction is the whole
> point.**  It designed ice as a solid phase carrying a special
> `fusionReaction { solvent; }` grammar, bolted onto the mineral path.  Vítor's
> answer: *"the classical thermodynamic theory is already capable of doing
> that!  Therefore the class architecture should be implemented to do that in a
> natural way like OpenFOAM used to do."*
>
> He is right.  A special case for ice is a confession that the architecture
> cannot express its own physics.  What follows designs the general condition
> and lets ice fall out of it.

---

## 1. Classical thermodynamics has ONE condition

Every phase equilibrium in this simulator is the same statement:

```
mu_i(phase A)  =  mu_i(phase B)          for every species i present in both
```

Vapour–liquid, liquid–liquid, solid–liquid, ice–water, and chemical
equilibrium itself are that one condition applied to different degrees of
freedom.  A K-value, a solubility product, a saturation index and a reaction
equilibrium constant are not four physical laws; they are four *algebraic
rearrangements* of one.

## 2. What Choupo does instead, measured

| equilibrium | how it is solved | where |
|---|---|---|
| vapour–liquid | **K-values as the PRIMITIVE**, computed per model | `Kvec`, `stageK` |
| chemical | Gibbs minimisation | `gibbsMethod/ElementPotential`, `DirectMin` |
| reactive flash | a third Gibbs path | `gibbsMethod/ReactiveFlash` |
| liquid–liquid | direct Gibbs minimisation, Nelder–Mead | `IsothermalFlash` LL |
| mineral–liquid | saturation index on a curated logK | `SpeciationSolver` |
| **ice–water** | **does not exist** | — |

Six ways of writing one condition, and the seventh could not be added without
inventing a seventh.  That is the actual finding, and it was already named as a
known gap in [`../architecture/class-structure.md`](../architecture/class-structure.md)
rule 4 — *"phase equilibrium and chemical equilibrium are classically one
condition applied to different degrees of freedom; here they are separate
solvers."*  Ice is the case that makes the cost of that concrete.

## 3. What OpenFOAM does, and why it can add a model for free

OpenFOAM composes a thermo type from interchangeable layers and derives
everything else **once**:

```cpp
g(p, T) { return this->ha(p, T) - T*this->s(p, T); }      // G = H - TS
K(p, T) { return exp(-this->Y()*this->gStd(T)/(RR*T)); }  // K = exp(-dG0/RT)
```

`gStd(T)` — the standard-state Gibbs energy — is an **interface function every
caloric model must supply**.  The equilibrium constant is then not a model and
not a correlation: it is an identity, computed in one place, valid for every
equation of state crossed with every caloric model.  A new equation of state is
a new class, and every derived quantity arrives free.

**That is why OpenFOAM can add a phase without adding a solver, and Choupo
cannot.**  The difference is not effort; it is that one project made the
standard-state potential an interface and the other made the K-value a
primitive.

## 4. The design: make the potential the interface

```
             mu_i^0(T, P, phase)        <- ONE interface function per species
                      |                    per phase.  Everything below derives.
      +---------------+---------------+
      |               |               |
   K = exp(-dG0/RT)   a_i = ...    SI = log a - log K
   (VLE, chemical)    (activity)   (solid-liquid, INCLUDING ice)
```

A phase is then a **named carrier of standard potentials**, exactly as
OpenFOAM's `thermophysicalProperties.<phase>` is, and the equality condition is
written once.

**Ice under this design requires no new grammar at all.**  It is water, in a
solid phase, whose standard potential differs from the liquid's by the Gibbs
energy of fusion:

```
mu_ice^0(T) = mu_water,liq^0(T) - dG_fus(T),    dG_fus(T) = dHfus (1 - T/Tfus)
```

Apply the one condition, `mu_ice^0(T) = mu_water^0(T) + RT ln a_w`, and it
rearranges to

```
ln a_w = -dG_fus(T) / (R T)
```

which is freezing-point depression — **derived, not declared**.  No
`fusionReaction`, no ice-specific branch, no new selector.  The same
rearrangement with a solute's potentials gives the solubility product; with a
vapour's, the K-value.

**And the water activity is already there**, on the same virial parameters as
the gammas: `AqueousActivity.H` computes `ln a_w = −(M_w/1000) φ Σ m_i`, with
PitzerHMW returning the rigorous HMW osmotic sum — already used for the gypsum
a_w² leg and the boiling-point elevation.  The freeze concentrate then
speciates through the machinery that already exists, because nothing about it
is special either.

## 5. The validating anchor

The dilute limit of the derivation is the cryoscopic constant:

```
K_f = R Tf^2 M_w / dHfus = 8.314462618 x 273.15^2 x 0.0180153 / 6008
    = 1.860 K kg/mol        against the textbook 1.86
```

So **`K_f` stops being reference-only and becomes the dilute-limit check on the
derived mechanism** — the shape `K_b` was given on 2026-08-05: derive from the
record's own inputs, keep any declared value as a validating anchor the run
announces.  A quantity with no reader acquires one without becoming a second
home.

## 6. The order of work, and why it is this order

This is a programme, and pretending otherwise would be the dishonest part.

1. **`referenceState` declared and honoured** — DONE 2026-08-06
   (`check_reference_rung`).  A potential cannot be an interface until a datum
   can say which standard state it is on.
2. **`gStd(T)` as an interface function**, in OpenFOAM's shape, with `K`
   derived from it.  Blocked on ONE thing, already measured: `water.dat`
   carries only the ideal-gas datum, so 12 of the 77 chemistry records cannot
   close (`water-dissociation` derives logK25 −12.4986 against a stored −14;
   with the liquid datum, −13.998).  **That is the next slice.**
3. **The equality condition written once**, with the existing solvers
   re-expressed against it — K-values become derived, not primitive.
4. **Ice, and freeze concentration, as a consequence** — a phase declaring a
   potential, with no code of its own.

Step 4 is what was asked for; steps 2 and 3 are why it is not a two-line
change.  Doing 4 alone would mean a seventh special case, which is the thing
this record exists to refuse.

## 6a. Step 3, measured before touching a solver (2026-08-07)

The six sites were read rather than assumed, and the result is smaller than
the count suggested.  **Four of the six ask a potential for exactly one
thing** — `g_pure_ig(T)`, the standard-state Gibbs energy:

| site | what it asks a potential for |
|---|---|
| `gibbsMethod/ElementPotential` | `g_pure_ig` |
| `gibbsMethod/DirectMin` | `g_pure_ig`, then an activity |
| `gibbsMethod/ReactiveFlash` | `g_pure_ig`, then an activity |
| `thermo/reaction/Reaction::Kp` | `g_pure_ig` |

That IS `gStd(T)` under another name.  The gap was never that these four
disagreed about what a potential is — it is that `g_pure_ig` is **ideal-gas
only**, so nothing could ask for the same quantity on a liquid or a solid.
`g_formation(T, phase)` is that quantity generalised, and the two agree
exactly where they overlap:

> **All 247 catalogue records, at 300 / 500 / 900 K: `g_formation(T,"gas")` is
> BIT-IDENTICAL to `g_pure_ig(T)`.  Zero differences.**

So unifying them is a rename with a proof, not a numerical risk — and once
unified, four of the six sites are already consumers of the general
interface, pinned to the gas phase by their callers rather than by their own
code.

**The two that remain are the real work**, and they are the two that do not
ask for a potential at all:

* **`Kvec` / `stageK`** — K is the PRIMITIVE here, computed per model rather
  than derived from `exp(-dG0/RT)`.
* **the mineral saturation index** in `SpeciationSolver` — driven by a curated
  `logK`, which `check_logk_crosscheck` can now derive for exactly 3 of 77
  records, 43 of them being ion pairs whose `logK` IS their primary datum.

That second bullet is the honest limit on how far step 3 can go: for a derived
complex there is no independent potential to derive K from, so its curated
`logK` remains the primary. **Unifying does not mean deleting the curated
route; it means the DERIVED route exists beside it and they can be compared.**

**One refusal must survive the unification.**  `g_pure_ig` refuses a non-gas
rung, by name, with the remedy — that is `check_reference_rung`'s arms (c)-(f).
Delegating naively to `g_formation(T,"gas")` would instead attempt a
solid -> gas crossing and refuse as *"sublimation not modelled"*: still a
refusal, but a worse one, naming a modelling gap where the reader's actual
problem is a mislabelled rung.  The rung check comes first and the delegation
after, or the unification costs a diagnostic.

## 7. What is NOT claimed, in any step

* **No nucleation, no kinetics, no crystal habit.**  A thermodynamic ceiling,
  the same posture the mineral path already takes.
* **No sub-zero validity for the Pitzer pairs.**  Their records carry a
  `Trange` and the announcement built on 2026-08-06 fires when a run leaves it.
  A freeze case at 263 K will say so rather than pretend the fit covers it.
* **Ice is pure.**  Solute inclusion in the lattice is real and is not
  modelled — which is exactly what makes the concentrate's balance exact.

## 8. Rejected alternatives

* **Ice as a special solid phase with its own reaction grammar** — the first
  draft of this file.  Rejected: it adds a seventh way of writing one
  condition, and each one costs the next capability more than the last.
* **Drive freezing from `K_f`.**  Rejected: `K_f` is the dilute limit, so it is
  accurate only where the answer is uninteresting — and a freeze concentrate is
  by definition concentrated.  It stays the anchor, never the driver.
* **A `freezingModel` selector.**  Rejected by the one-knob rule: the
  formulation already fixes the activity model, and ice is a phase, not a
  method.
