# A model declares the records it reads — proposal for debt D3

> **KIND: ADR · STATUS: PROPOSAL, awaiting Vítor.** Nothing here is
> implemented. Written because `module-boundaries.md` D3 says this debt *"will
> produce the next one"*, and on 2026-08-04 and again on 2026-08-05 it did.
>
> Per `project-philosophy.md` §4: *never skip alignment when proposing
> architecture changes — propose, wait for confirmation, then code.*

---

## 1. The debt, and the two times it has now been paid for

`bin/choupo-import` seals a case by materialising its property-data
**dependency closure** into `constant/`. That closure is a **hand-written list
of 21 `want(...)` calls** — ten under `parameters/`, four under `chemistry/`,
three each under `phases/` and `components/`, one under `mixtures/`.

Nothing connects that list to the models that actually read those records. A
model knows what it consumes; the importer does not, and cannot ask.

**2026-08-04 — the Edwards sealing defect.** A new activity model,
`EdwardsPitzer`, read a new record home, `parameters/EdwardsPitzer/`. The
importer had never been told. The sealed case kept **9 of its 28 pair
parameters** — the Brønsted like-sign zeros, which need no record — and
answered as a *different model*. It ran, it converged, and it printed two
identical monovalent gammas and two neutral gammas of exactly 1, which is what
a **Davies** run prints. Nothing refused.

It was caught by the corpus golden one step later, which is **luck, not
design**: a case sealed *before* its golden was recorded would have frozen the
damaged answer as the reference.

**2026-08-05 — the same shape, twice more.** Adding `reviewStatus` to 67
component records changed nothing in five sealed cases until they were
re-imported by hand; narrowing two `Trange` fields changed nothing in two more
until the same. Neither is a defect in the seal — a snapshot is *supposed* to
be a snapshot — but both required a human to know which cases to re-import,
which is the same missing link seen from the other end.

## 2. Why the obvious fixes are not proposed

**"Add the new home to the importer."** That is what was done both times, and
it is the behaviour the debt describes rather than a remedy for it. The list
stays hand-maintained and stays silent when incomplete.

**"Scan the case's `constant/` and seal whatever is referenced."** The
importer cannot see a reference that a model computes — `parameters/NRTL/<a>-<b>.dat`
is assembled from a component pair at run time, not written anywhere.

**"Seal everything under `data/standards/`."** Defeats the purpose: a sealed
case is meant to be a self-contained *minimum*, and the manifest's per-record
hashes are what make drift detectable.

## 3. The proposal

**A model declares its record homes; the importer enumerates them.**

Each model that reads curated data answers one question about itself — *given
this component/species set, which record paths do I need?* — and the importer
composes those answers instead of carrying its own list.

Two candidate shapes, and the difference is where the declaration lives:

**(a) A virtual on the model.** `ActivityModel::recordsNeeded(components) ->
vector<path>`, likewise for the EOS, Henry, adsorption and chemistry readers.
The importer walks the declared package and asks each model. *Cost:* the
importer must construct models to interrogate them, which drags a build
dependency into a curation tool.

**(b) A static registry entry beside the factory registration.** The one line
that registers a model gains a second: the record home it reads, and the rule
that turns a component set into filenames. *Cost:* the rule is data, so a
model whose lookup is genuinely computed (the NRTL pair) needs a small
callback anyway.

**Recommendation: (b), because it composes with the existing explicit-factory
doctrine.** `registerBuiltins()` is already the one place where every model
announces itself; a model that must state its name to be usable can state its
record home in the same line. (a) would make a curation script link the
engine, which the module boundaries would then have to permit.

## 4. What this does NOT solve, stated so it is not assumed

- It does not tell an existing sealed case that a standards record changed.
  That is the *other* half — a case knows what it sealed, but nothing watches
  the origin. `check_seal_drift` compares a mirror to its manifest, not to the
  catalogue. **Out of scope here**, and worth its own debt if Vítor agrees.
- It does not make the seal detect a model change, only a missing record.
- It does not remove the need for `validate_staged_agrees`. That guard
  compares the sealed answer against the case's golden and is what would have
  caught Edwards without any of this. It stays either way.

## 5. The decision asked for

1. Is the direction right — a model declaring its record homes, rather than an
   importer maintaining a list of them?
2. If so, shape (a) or (b)?
3. Is the "nothing watches the origin" half a separate debt, or part of this?

No code will be written against this until it is answered.
