# Two routes by which a solid appears — and only one has a door

> **Status.** Written 2026-08-07, on Vítor's instruction to make the two
> mechanisms explicit rather than leave a contributor to infer them from
> `flash19` and `SolidPhase.H`.  Level 3 (design reference).  It DECIDES
> nothing about the flash's future solid path; that is an open question and
> §4 says so.

A solid can enter a Choupo calculation two ways.  They are not variants of
one mechanism and neither is a special case of the other: they answer
different physical questions, live in different layers, and — today — only
one of them can be reached from a case at all.

---

## 1 · The chemistry route — a mineral precipitating from solution

**Reachable.  Exercised by `flash19_organic_and_precipitate`.**

The question is *has this solution become supersaturated with respect to a
solid whose dissolution equilibrium we know?*  Calcite, gypsum, halite.

| Piece | Where it lives |
|---|---|
| Which solids may form | `constant/chemistryDict` → `equilibria { solidPhases ( calcite ); }` |
| The dissolution equilibrium | the owning component's own `solidPhases{}` block |
| Who solves it | `SpeciationSolver`, on the aqueous-species basis |
| How it is decided | saturation index; the solid appears at SI = 0 |

The solid is **not** a `Phase` object here.  It is an outcome of the aqueous
equilibrium network, computed in molality, on the species basis, inside the
speciation — and projected back onto the apparent basis like everything else
the speciation resolves.  `chemistryDict` declares *availability*, never
presence: whether calcite actually appears is the answer, not the input.

Choosing which polymorph forms first is kinetics, which this calculation
cannot see.  `flash19` admits calcite and leaves aragonite out for exactly
that reason, and says so in its own header rather than modelling it.

## 2 · The fugacity route — a pure crystal freezing out of its own liquid

**Built, gated, and NOT reachable from any case.**

The question is a different one: *is the pure solid of this component more
stable than the liquid it is in?*  Ice in water.  There is no chemistry
involved and no network to solve — it is phase equilibrium, and the whole
model is one virtual function:

```
f_solid(T) = Psat(T) · exp(−ΔG_fus(T) / RT)      at the crystal's index
ΔG_fus(T)  = ΔHfus · (1 − T/Tfus)                zero everywhere else
```

`Kvec_phases` already derives K from `Phase::fEffective`, so K = 1 gives
`ln a_w = −ΔG_fus/RT`, which *is* freezing-point depression — derived, with
no code of its own.  That was the point: the codebase was already structured
around the `Phase` abstraction, so a freezing solvent needed no special case.

**The door is missing.**  `solid` is registered in the `Phase` factory
(`Phase::registerBuiltins`), but no reader ever emits a phase config of that
type: the flat reader hardcodes liquid-then-vapour, and the `gammaGamma`
reader emits `liquidPhases` followed by an optional `vapour`.  There is no
grammar by which a case can declare a crystallising solid.  `SolidPhase` is
reached only by `check_ice_freezing`'s probe.

So it is accurate to say the engine models a pure crystal correctly and
*inaccurate* to say the corpus has two ways for a solid to appear.  One is a
route; the other is a phase with no entrance.

---

## 3 · Which route a given solid belongs to

Ask what makes the solid appear, not what it is made of.

* **Dissolution equilibrium with ions in solution** → chemistry route.  The
  solid's stability is set against an aqueous network, its datum is a
  dissolution log K, and its owner is the component's `solidPhases{}`.
* **The pure component freezing** → fugacity route.  Its stability is set
  against its own liquid, its datum is ΔHfus and Tfus, and it is a `Phase`.

A salt crystallising from brine is the first even though a crystal is
involved; ice is the second even though water is a solute host.  The test is
the *equilibrium it is posed against*, not the phase's appearance.

### If both were declared at once

Today this cannot happen — §2's route has no grammar, so there is nothing to
combine.  `IsothermalFlash` nonetheless **refuses** a package carrying a
phase of type `solid`, naming both routes and the remedy for each, because
the alternative is to run a plain VLE as though the declared phase were
absent.  That guard is unreachable by construction and is documented as such
both in place and in `check_ice_freezing`'s own report; it is what makes
adding the grammar safe later, and it is not evidence the grammar exists.

Were both to become declarable, the accounting question is the real one and
is **not settled here**: a crystallising `Phase` removes moles through the
flash's phase split, while a precipitating mineral removes them inside the
speciation.  Nothing currently reconciles those two subtractions, and a case
doing both would need that reconciliation specified before it could be
trusted — not discovered by running one.

---

## 4 · The open boundary, stated rather than left to be found

To make the fugacity route reachable, two things are needed and only the
first is small:

1. **A declaration grammar** — a `solidPhases` list in the `gammaGamma`
   reader, so a case can write `{ name ice; mode crystallizing; component
   water; }`.  Contained, and it makes the refusal above fireable, which
   would let a structural witness exist.
2. **A designed solid path in the flash** — how a three-phase VLS
   equilibrium is posed, seeded, and converged, and how its mole accounting
   reconciles with the speciation's.  This is a modelling decision, not an
   implementation detail, and it is the reason no witness case ships with
   the crystal.

Until (2), `check_ice_freezing` proves the phase is right and explicitly
does **not** claim any flash converges onto it.  The `inert` mode is a
further stub: an inert solid must be propagated as a phase of the stream
while the flash skips it, and that skipping is not built.

---

## Related

* `src/thermo/phase/SolidPhase.{H,cpp}` — the crystal, and its purity claim
* `docs/design/ice-as-a-solid-phase-of-the-solvent.md` — the design record
* `bin/curate/check_ice_freezing.py` — what is verified, and what is not
* `tutorials/steady/flash/flash19_organic_and_precipitate` — the chemistry
  route, with an organic liquid and speciation in the same case
