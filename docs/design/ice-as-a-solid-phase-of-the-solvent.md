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

## 2. What Choupo does instead — CORRECTED 2026-08-07

> **The first version of this section was wrong, and the error was mine
> twice over: I asserted an architecture without reading it, then built two
> slices on the assertion.**  It claimed Choupo writes the one condition SIX
> times with "K-values as the PRIMITIVE".  That is not what the code does.

`ThermoPackage::Kvec_phases(alpha, beta, T, P, xA, xB)` is:

```cpp
const auto fA = phases_.at(alpha)->fEffective(T, P, xA);
const auto fB = phases_.at(beta) ->fEffective(T, P, xB);
for (i) K[i] = fA[i] / fB[i];
```

K is **derived from a per-phase interface function**, not computed per model.
And `Phase::fEffective(T, P, x)` is a pure virtual on a `Phase` base with a
factory and three implementations — `VaporPhase`, `LiquidPhase`, `SolidPhase`.

**Fugacity equality IS chemical-potential equality** — the same condition in
different coordinates, since mu_i = mu_i^0 + RT ln(f_i/f_i^0).  So the
architecture is ALREADY in the shape section 3 describes: one interface
function per phase, the equilibrium relation derived from it once.  What I
called six competing solvers is one condition with several *consumers*, plus
genuinely separate machinery for chemical equilibrium (the Gibbs paths) and
for minerals (curated logK).

**And the solid slot already exists, with the gap named in its own refusal:**

```
SolidPhase[crystallizing]: SLE is scheduled for.  The Phase abstraction is
in place; only fEffective() needs a concrete model (e.g. pure-crystal
reference fugacity).
```

Someone built the abstraction and left a labelled hole exactly where ice
goes.  The honest conclusion is the opposite of what this file first said:
**the architecture Vítor asked for is largely already there, and ice is one
unimplemented virtual rather than a new spine.**

What the corrected picture leaves genuinely separate:

| condition | how it is solved | is it the same interface? |
|---|---|---|
| vapour–liquid, liquid–liquid | `Kvec_phases` from `fEffective` | **yes** |
| solid–liquid (crystallising) | `SolidPhase::fEffective` **throws** | yes, once implemented |
| chemical equilibrium | Gibbs minimisation, three entry points | no — a different surface |
| mineral–liquid | saturation index on a curated logK | no — and see section 6a |

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

## 4. The design — corrected: IMPLEMENT the interface, do not invent it

The original text here proposed making the potential an interface, as though
none existed.  One does.  The design is therefore much smaller:

**Ice is a `SolidPhase` in crystallising mode whose `fEffective` returns the
pure-crystal reference fugacity.**  Nothing else.

For a pure solid in equilibrium with its own liquid,

```
f_solid(T) = f_pureLiquid(T) * exp(-dG_fus(T) / (R T)),
dG_fus(T)  = dHfus (1 - T/Tfus)
```

and the existing `Kvec_phases` then does the rest.  Work it through for water
in a solution: `LiquidPhase::fEffective` gives `gamma_w x_w f_pureLiq`, so
K = 1 at equilibrium yields

```
gamma_w x_w = exp(-dG_fus/(R T))      i.e.   ln a_w = -dG_fus(T)/(R T)
```

— which is freezing-point depression, **derived**, exactly as section 1
claimed, but now falling out of machinery that already exists rather than
machinery to be built.  The activity a_w is already computed on the same
virial parameters as the gammas (`AqueousActivity.H`, the HMW osmotic sum),
and the freeze concentrate speciates through the path it always used.

That is what "in a natural way, like OpenFOAM" means here, and the measure of
it is that ice adds **one function and no new concept**.

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

## 6. The order of work — re-scoped after the correction

1. **`referenceState` declared and honoured** — DONE 2026-08-06
   (`check_reference_rung`).
2. **`s_formation` / `g_formation`, so a potential can be asked for on ANY
   phase from ONE datum** — DONE 2026-08-07.  Validated on water: the
   potential closes to +0.23 J/mol of CODATA while its legs are -572 J/mol
   and -1.92 J/(mol K) out.
   **Still worth having after the correction**, and this is not
   self-justification: the Gibbs paths and `Reaction::Kp` DO consume a
   potential directly, and they were ideal-gas-only.  It just was not the
   precondition for ice that this file claimed.
3. **`h_pure_ig`/`s_pure_ig` delegate to the general form** — DONE 2026-08-07,
   bit-identical over 426 comparisons.
4. **`SolidPhase::fEffective` for a pure crystal** — the remaining work, and
   now visibly small.  The refusal it replaces already names the model wanted.
5. **A witness case**: freeze a brine, get pure ice and a speciated
   concentrate, check the freezing-point depression against tabulated data.

Steps 2 and 3 stand on their own merits.  Step 4 is what was actually asked
for, and it turns out not to have needed them.

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
