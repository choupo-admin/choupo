# How a Choupo class is shaped — five rules, and what each one cost

> **AUTHORITY: LEVEL 2.**  Written 2026-08-06.  Authority map:
> [`README.md`](README.md).
>
> This page states no new policy.  It gathers, on one page, the rules that
> already bind — from [`project-philosophy.md`](project-philosophy.md),
> [`module-boundaries.md`](module-boundaries.md),
> [`global-invariants.md`](global-invariants.md) and the design records — and
> gives each the **defect that paid for it**.
>
> It exists because those rules were spread across five documents and a
> developer met them one at a time, usually after breaking one.
>
> **This page is the CONTRACT; the Developer Guide TEACHES it.**  The guide
> (`docs/developerGuide.tex`) carries the same five rules as §20, with
> §19 for the layering and §21 for the gates — written to be read once,
> start to finish, by someone about to write a class.  That is the ordinary
> level-2/level-4 relationship (see [`README.md`](README.md)): where the two
> disagree, this page wins and the guide is the stale copy.  The guide gained
> that material on 2026-08-06, when Vítor ruled that the sole-author
> attribution line records who answers for the work and is not a bar on
> drafting into it.

---

## The rules

Everything below is one rule seen from five sides. If you remember nothing
else: **a fact has one home, that home is neutral, the engine can read it,
derived things are derived, and a quantity carries its basis.**

---

### 1. A fact has ONE home

A derived quantity is computed, never stored beside its inputs. *Trees never
store derivatives.*

**What it cost.** `K_b`, the boiling-point-elevation constant, was stored in
`water.dat` beside the `Tb`, `MW` and `HvapTb` that determine it by
`K_b = R·Tb²·M/ΔHvap`. The copies had drifted: 0.512 stored against 0.512942
implied, 0.18 % apart, feeding straight into every evaporator's BPE. The
`anchors{}` block said so in a comment and nothing acted on it.

The same shape, four more times in one day: five hand-compiled counts wrong in
both directions; waivers spread across eight of the 93 gate scripts; the
forward reaction `order` with five readers and five defaults.

**How to obey it.** Derive, and keep any declared value as a *validating
anchor* whose comparison the run announces — `Component::K_b()` is the
worked example. If two places must know something, one of them computes it
and the other asks.

---

### 2. That home is NEUTRAL

Shared logic goes to the lowest layer that can **own** the concept without
acquiring upward dependencies — not merely the lowest layer that compiles.

**What it cost.** Every one of the five upward edges in the subsystem graph
was the same defect: a shared concept filed inside one of its two consumers.

| the edge | the concept, and where it was hiding |
|---|---|
| `core` → `streams`/`thermo`/`unitOperations` | `FlatUnit` — four strings of topology — declared inside `SimulationResult`, so `core` inherited the result record's whole dependency set |
| `unitOperations` ↔ `propertyOps` | `readExchange`, a record reader both a props bench and a process unit need, living in `namespace propertyOps` |
| `reporting` ↔ `postProcessing` | `OdsWriter`, a zip-based spreadsheet writer, filed under `reporting` |
| `unitOperations` → `reporting` | the finding *records* declared inside the result that carries them |

**How to obey it.** Ask what the thing *depends on*, not what it is *for*. A
draft of `module-boundaries.md` placed `io` beside `streams` because
`SolutionWriter` "is the persistence face of the stream-state contract" —
true, and wrong: it also reads the whole `SimulationResult`, so that band
makes `io → result` an upward edge. The narrative was about persistence; the
include graph was about the result record, **and the include graph is what
the compiler obeys.**

`check_layering` asserts this now: no upward edge anywhere, and a new one
fails with nothing to excuse it.

---

### 3. The ENGINE can read it

A fact that changes behaviour must live in a **parsed field**, never in a
comment, a banner or a header.

**What it cost.** Three times in three days:

* 67 component records carried `PROPOSAL TIER — UNVERIFIED` in a banner the
  parser discards — including 7 of the 16 in `cavett01`, the flagship
  external-reference case. Nothing announced them. `reviewStatus` is a parsed
  field now.
* `PolynomialCp` assigned `Tmin_`/`Tmax_` and never read them, so the
  commonest Cp path made no validity claim at all — which is why six inverted
  windows did no visible harm. *Harmless-because-unchecked is not safety.*
* `water.dat`'s `standardThermochemistry` is the **ideal-gas** datum, stated
  in a comment, with no `phase` field. Deriving `water-dissociation`'s
  equilibrium constant from the records therefore gives **logK25 = −12.4986
  against a stored −14** — a factor of 32 in K. With the correct liquid values
  the same arithmetic gives −13.998. Nothing is wrong except that the datum
  cannot say what it is referenced to.

**How to obey it.** If you would write it in a comment to warn a reader, the
engine needs it too. `docs/design/theory-in-class-structure-study.md` §8 has
the full record of the third case.

---

### 4. DERIVE, don't re-implement

One place computes each derived quantity, from the fundamental relation, for
every combination of models — rather than each model carrying its own copy.

**Where the idea comes from.** OpenFOAM composes a thermo type from
interchangeable layers and then derives everything else in a single template:

```cpp
g(p, T)  { return this->ha(p, T) - T*this->s(p, T); }        // G = H − TS
K(p, T)  { return exp(-this->Y()*this->gStd(T)/(RR*T)); }    // K = exp(−ΔG°/RT)
```

The equilibrium constant is not a model and not a correlation — it is an
identity, computed once, valid for every equation of state crossed with every
caloric model. That is where OpenFOAM's extensibility actually comes from: a
new EoS is a new class, and every derived quantity arrives free.

**Where Choupo is not there yet, stated plainly.** K-values are the
*primitive* here (`Kvec`, `stageK`), computed per model, and Gibbs
minimisation lives in `gibbsMethod/{ElementPotential,DirectMin,ReactiveFlash}`
plus the LL path in `IsothermalFlash`. Phase equilibrium and chemical
equilibrium are classically **one** condition applied to different degrees of
freedom; here they are separate solvers.

This is a known gap, not a settled contract. The prerequisite is rule 5.

---

### 5. A quantity carries its BASIS

When a value is expressed in one basis and a consumer needs another, the
**conversion is an object**, not an assumption.

**Two domains, one shape.** OpenFOAM solves this twice, identically, in
unrelated parts of the code — which is the strongest evidence that it is
structural rather than idiomatic:

* *Thermo:* `gStd(T)` is an interface function every caloric layer must
  supply, so a potential's reference state is part of the contract.
* *Particles:* a distribution carries `Q_` (the moment order it is **declared**
  in), `sampleQ_` (what the consumer wants) and `q() = sampleQ_ − Q_`.

**Choupo now obeys it on one side and not the other.**
`src/core/distribution/` copies the second: Rosin-Rammler declares the **mass**
basis (a sieve), log-normal declares **number** (a count), and
`moment(k, basis)` does the conversion in one place. Ask either for `d32()`
and the answer is right without knowing which convention its author used.

The thermo side is rule 3's third example: the reference state is a comment.
That is also why debt **D3**, the standard-state transfer term, has stayed
contract-only for weeks — *the transfer term has no state to transfer
between.*

---

## The shape of a new class

Every physical model in this tree is the same shape, and the one exception was
fixed on 2026-08-06 because it was the exception:

```cpp
class Thing
{
public:
    using Factory = std::function<std::unique_ptr<Thing>(...)>;
    static void registerType(const std::string& name, Factory f);
    static std::unique_ptr<Thing> New(...);
    static void registerBuiltins();          // called EXPLICITLY from main
    virtual ~Thing() = default;
    virtual std::string type() const = 0;
};
```

`ActivityModel`, `EquationOfState`, `HeatCapacityModel`, `VaporPressureModel`,
`UnitOperation`, `OuterDriver`, `PostProcessor`, `CostingModel` — and now
`SizeDistribution`, which was a bare `struct` of two vectors until it was
made to conform.

No macro self-registration, ever: a student must be able to read where types
come from, and a linker must not be able to discard one silently.

---

## How to tell whether you have obeyed them

The project's own test for a consolidated contract is three-part, and the
third is the one that usually goes missing:

1. the contract is **written**;
2. the engine **refuses** violators, by name, with a remedy;
3. a **case fires that refusal** — not a case that describes the structure, a
   case that exercises it.

Then sabotage it. Four times this week a gate survived a sabotage it should
have caught, and each time the *claim* was wrong rather than the code: an arm
that tested a tabular sum while calling it a quadrature; a coverage check
matching a substring of the call it was meant to detect; an arm that measured
truncation and called it discretisation. **A sabotage a gate survives is a
claim the gate should stop making.**
