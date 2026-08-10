# End-to-end numerical provenance — the `Tracked<T>` / Origin contract

> **KIND: ADR · STATUS: CONTRACT DECIDED 2026-08-10 · AUTHORITY: LEVEL 2
> (binds the current thermophysical-properties consolidation).**
> Directive from Vítor, 2026-08-10.  **No implementation is authorised by
> this record.**  What it fixes is the CONTRACT, now, because the
> consolidation currently touching all five phase families, electrolytes,
> reactions and the activity models is the last moment at which this can
> be stated once instead of retrofitted five times.

---

## 1. The decision

Every number CHOUPO reports must be traceable, by machine, along the whole
chain that produced it:

```
result → equation / balance → resolved state → model → parameters
       → primary-source datum → solver iterations → residual
```

`WHY?` — the user-facing question, wherever it is asked — is the
**serialisation of that graph**, not a narration written beside it.

**The binding negative, stated first because it is the one that decides the
design: the engine must SUBSTANTIATE the explanation; the GUI only
EXPOSES it.**  An explanation layer the engine cannot back is a story about
a computation, and this project has already paid twice for surfaces that
computed their own version of something the engine owned (the Mass Balance
chart's private `fluid + solid`, 2026-08-10; the energy chart implying
addition where terms cancel, same day).  A provenance panel assembled in
TypeScript would be the same defect with higher stakes, because its subject
is trust.

## 2. What a `Tracked<T>` carries

The contract is the SET OF QUESTIONS a tracked quantity must answer, not a
struct layout (the layout is an implementation decision, deliberately left
open):

| field | meaning | absent means |
|---|---|---|
| `value` | the number, in canonical SI | — |
| `origin` | how this number came to exist: `measured` · `derived` · `solved` · `declared` · `estimated` | ILLEGAL — an untagged number is the defect this record exists to end |
| `producedBy` | the named computation (model, balance, solver, reader) | ILLEGAL |
| `inputs` | the tracked quantities this one was computed FROM | empty = a leaf (a declared or read datum) |
| `record` | for a leaf: the `.dat` record + field it was read from | non-leaf |
| `evidence` | for a leaf: the evidence tag of ADR `property-evidence-taxonomy.md` | non-leaf |
| `residual` | for a SOLVED quantity: the converged residual and the criterion that accepted it | not solved |
| `iterations` | for a SOLVED quantity: the iteration count | not solved |
| `caveats` | approximations/extrapolations announced on the path (the existing `AdvisoryLog` entries, attached rather than merely printed) | none raised |

Three properties follow, and each is a REFUSAL rather than a convention:

* **No anonymous arithmetic on a reported path.** A quantity that reaches a
  report, a KPI, a stream file or the result JSON carries its graph or the
  run refuses. (Internal scratch arithmetic is unaffected — the contract
  binds what is REPORTED, not every intermediate double.)
* **A leaf names its record.** "Where did 3.047 come from" must terminate at
  a file and a field, never at a literal in `.cpp`.
* **A solved quantity carries its own residual.** The normalized-residual
  contract (`normalized-residual-convergence.md`) already produces the five
  numbers; this record fixes that they travel WITH the answer instead of
  only being printed near it.

## 3. Alternatives considered, and why they were rejected

**(a) A parallel provenance log — record events beside the computation.**
Rejected: the log and the computation are then two homes for one truth, and
they drift exactly like the two mass-balance implementations did. Any
quantity computed on a path the logger forgot is silently unexplained, and
nothing detects the omission.

**(b) Provenance only at the boundaries (readers + reports).** Rejected:
this is what exists today, and it answers "which file" but not "through
what". The Marcilla and flash21 findings both turned on the MIDDLE of the
chain — a conversion basis, a rung choice — which boundary provenance
cannot see.

**(c) Reconstruct provenance on demand by re-running instrumented.**
Rejected: a re-run is a different execution. For an iterative solve it may
take a different path, and the explanation would then describe a
computation the user never saw. It also cannot survive into a permalink
(ADR `reproducible-permalink-sealing.md`), which must explain a result
without re-executing it.

**(d) `Tracked<T>` everywhere, including hot loops.** Rejected on cost:
threading a graph through every Newton residual evaluation would dominate
runtime and, worse, produce a graph with hundreds of thousands of
indistinguishable nodes — unreadable, therefore not an explanation. The
contract binds REPORTED quantities and the ACCEPTED state, with iterations
summarised (count + residual + criterion), not enumerated.

## 4. Consequences

* **Accepted cost:** every model, reader and report gains a provenance
  obligation. This is why the contract is fixed DURING the consolidation —
  paying it once per family is the cheap version; retrofitting is the
  expensive one.
* **Accepted risk:** the graph can grow large for a plant case. Mitigation
  is a stated future decision (collapse by unit, lazily materialise), NOT a
  reason to weaken the contract.
* **Enabled:** the evidence taxonomy (ADR 2) becomes checkable — a leaf's
  `evidence` is exactly what the solver's refusal doctrine reads; anchors
  (roadmap item 4) can cite the chain rather than the answer; permalinks
  (ADR 3) can explain without re-running.
* **NOT decided here:** the struct's memory layout, whether the graph is
  materialised eagerly or lazily, the serialisation format, and any GUI
  surface. Those are implementation decisions for the slice that builds it.

## 5. Constraint on work in flight

Anything the current consolidation touches — the five phase families,
electrolytes, reactions, activity models — must be written so that a
reported quantity CAN answer §2's questions, even before the machinery
exists. Concretely: no new reported number may be produced by arithmetic
whose inputs are unnameable, and no new leaf may be a literal in code.

## 6. Status

Contract decided. Implementation UNAUTHORISED and unscheduled. Sequencing
(Vítor, 2026-08-10, non-negotiable): this contract and the data sealing are
fixed in the properties consolidation → evidence taxonomy in `choupoProps`
→ ThermoML pilot → anchors with pre-declared envelopes → permalinks →
showcases.
