# Where the catalyst pellet lives, and why D_eff is not a property of it

*Ruling 2026-08-18.  Unblocks the Weisz-Prater criterion (the remaining half of
the η announcement) and the Thiele η–φ slice.  No implementation authorised by
this document — it settles the DATA question those slices are blocked on.*

## The question

`catalystLoading` is a unit conversion, and the engine now announces that the
pellet behind it is unresolved and η = 1 is assumed
(`unitOperations/reactor/CatalystPellet.H`).  Making that announcement
QUANTITATIVE — a Weisz-Prater number — and later making it OPERATIVE — a
Thiele modulus multiplying the rate — needs two quantities the tree does not
carry: **a pellet dimension** and **an effective diffusivity**.

Where does each live?  Getting this wrong is not a filing inconvenience: a
second home for a derived value is the defect this project has paid for
repeatedly, and a diffusivity filed as though it belonged to the catalyst
would be wrong for every species but one.

## The ruling

### 1. The pellet is an ASSET, `kind catalyst;`

`data/standards/assets/` is flat with a `kind` field, and today carries
`constructionMaterial`, `RO`, `NF`, `IEM`, `adsorbent`, `ionExchangeResin`.  A
catalyst is the same kind of thing as an adsorbent — a purchased solid with a
geometry, a density and a porosity — and `Adsorbent` + `AdsorbentRegistry` is
the pattern to mirror, down to `dParticle()` and `sphericity()`, which already
exist there.

The record carries what is INTRINSIC to the solid:

* `geometry slab|cylinder|sphere;` and its characteristic dimension,
* particle and bulk density,
* **particle porosity `epsilon_p` and tortuosity `tau`**,
* the usual identity and provenance fields every record carries.

### 2. D_eff is NOT a property of the catalyst, and must not be stored on it

An effective diffusivity is a property of **a species diffusing in a
particular pellet at a particular temperature**.  Filing it on the catalyst
record would make it a single number standing for every species in the
mixture, which is false for all but one of them — and it is false *silently*,
because nothing in a run would contradict it.

By the three-axiom property layout (`CLAUDE.md` §7) a pair-dependent quantity
lives in `parameters/<feature>/<pair>.dat`.  The precedent is exact and it is
enforced: `Adsorbent::readIdentity` **REFUSES a record that still embeds an
`isotherms{}` block**, pointing at `parameters/adsorption/equilibria/` — "no
silent dual reader".  An adsorption isotherm is (adsorbent, adsorbate); an
effective diffusivity is (catalyst, species).  Same shape, same home.

### 3. And the ordinary case stores nothing at all, because D_eff is DERIVED

    D_eff = (epsilon_p / tau) * D_molecular

*The tree never stores a derivative.*  `epsilon_p` and `tau` are intrinsic to
the pellet and live on the asset; `D_molecular` is a property of the species in
the fluid.  So in the normal case **no D_eff record exists anywhere**: it is
derived where it is used and **ANNOUNCED with the rule that produced it**,
exactly as `EdwardsCatalogue` announces each of its five estimation rules
rather than writing an estimated pair to disk.

A `parameters/` record is therefore for a **measured** D_eff only — a real
datum from a real experiment, which the derivation cannot produce.  When one
exists it is used and the derived value becomes a cross-check, on the
`K_f` pattern from the ice slice: the derivation runs when its inputs are
present and a consumer asks, the declared value stands as a validating anchor,
and a disagreement between two independent routes is a FINDING, never a
silent override.

### 4. A missing D_eff refuses; it does not default

There is no defensible default.  A tortuosity is conventionally 2–7 and the
choice moves η by a factor of three; picking one would be inventing the answer
the student came to compute.  So a case asking for a Weisz-Prater number or a
Thiele modulus without a route to D_eff is **refused by name**, with both
remedies stated (declare `epsilon_p`/`tau` on the pellet, or cite a measured
`parameters/` record).

This is the reference-rung lesson applied one field over: *a generic remedy
stapled to a specific diagnosis contradicts it*, so the refusal must name which
of the two routes was attempted and what it lacked.

## What this rules OUT, and why

* **D_eff as a field on the catalyst record** — §2.  One number standing for
  every species, silently.
* **A `catalyst {}` block inside the reactor's `operation {}`** — that files a
  purchased solid's intrinsic properties inside one unit's operating
  parameters, so two reactors loaded with the same catalyst carry two copies
  that drift.  The unit declares WHICH catalyst; the catalyst declares what it
  IS.
* **A default tortuosity** — §4.
* **A `kind catalyst;` record carrying kinetics.**  Rate constants are
  equipment- and reaction-specific (axiom 3: they live in the case's
  `constant/`).  The asset carries the SOLID, never the chemistry run on it —
  the same line `Adsorbent` draws between the sorbent and its isotherms.

## Status

Ruled, not built.  Nothing in `src/`, `data/standards/assets/` or any case
changes on account of this document.  It exists so the two slices it unblocks
are not each free to answer the question differently — which is how one
quantity acquires two homes.
