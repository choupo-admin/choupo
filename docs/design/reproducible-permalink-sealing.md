# Reproducible permalinks — the SEALING decision

> **KIND: ADR · STATUS: SEALING DECISION DECIDED 2026-08-10 · AUTHORITY:
> LEVEL 2.**  Directive from Vítor, 2026-08-10.  The permalink SURFACE
> (`choupo.org/r/<hash>`) is ROADMAP and depends on everything above it.
> What is decided **now**, because it constrains the current
> thermophysical-properties consolidation, is **what the hash seals**.

---

## 1. Why the sealing decision cannot wait for the surface

A permalink is only worth having if the thing it names cannot change
underneath it. That property is decided by what goes INTO the hash, and the
catalogue closure is being reorganised right now. Deciding the hash later
means re-deriving every hash later, which is the same as not having them.

## 2. The decision

**The hash seals CODE and DATA together:**

```
hash = H( engine version + the case's full dependency closure )
```

where the closure is the one `bin/choupo-import` already computes: every
component, parameter, species, chemistry and convention record the case
actually consumes, **as addressed content** — the fat-catalogue `.dat`
files are part of the identity, not an ambient environment the result
happens to run in.

This is not new machinery. `sealSchema computational` (2026-08-03) already
makes the claim the PARSED content, so comment and formatting drift is
cosmetic while a moved value diverges. The decision here is that the
permalink's identity is **that** closure plus the engine version — nothing
narrower.

### 2a. The reproducibility contract, stated explicitly

> **Same result within the declared residual — NOT bit-for-bit
> determinism.**

Stated in the record because leaving it implicit is how a promise becomes a
lie: floating-point summation order, compiler version, `-ffast-math`-class
flags and hardware all move last bits, and an iterative solve legitimately
lands on a slightly different iterate. A permalink therefore promises that
a re-run **converges to the same answer within the residual the case
declares** — which is a scientific claim, checkable, and honest — rather
than byte equality, which is neither.

This is why ADR `numerical-provenance-contract.md` matters here: the
residual is carried WITH the answer, so "within the declared residual" is a
comparison the machinery can actually make.

### 2b. The `.wasm` blob is archived per released version

**Permanent executability is part of the product promise.** A permalink
that can no longer be RUN is a screenshot. Archiving the released `.wasm`
beside the release means a five-year-old result can be re-executed by the
engine that produced it, in a browser, without rebuilding a toolchain that
may no longer exist.

Today's evidence that this is not theoretical: `gui/public/wasm` is a
gitignored local product, and on 2026-08-10 it sat twelve days behind
`src/`, so the published site ran physics the suite had already corrected.
An unarchived binary is not merely inconvenient — it is unreconstructable.

## 3. Alternatives considered, and why they were rejected

**(a) Hash the case files only.** Rejected: the same dict over a different
catalogue is a different calculation. This is precisely the failure the
sealed-case work exists to prevent, and a permalink is where it would be
most damaging — a URL that silently changes meaning.

**(b) Hash code only, reference data by version tag.** Rejected: a tag is a
mutable pointer maintained by people. `Choupo-2607` naming different bytes
next year breaks every permalink minted this year, silently.

**(c) Promise bit-for-bit determinism.** Rejected: unachievable across
compilers and hardware, and pursuing it would force numerical choices
(fixed summation order, banned vectorisation) that cost accuracy to buy a
property nobody actually needs. The scientific requirement is agreement
within a declared tolerance.

**(d) Re-run on demand at the current engine version.** Rejected: that
answers a different question ("what would CHOUPO say today"), which is
useful but is NOT a permalink. A citation must resolve to what was
published.

**(e) Archive nothing; rebuild from the tagged source.** Rejected: it makes
executability depend on a toolchain (Emscripten 3.1.6 is pinned for a
reason) surviving indefinitely. Archiving the blob is a few tens of MB per
release against a promise that cannot otherwise be kept.

## 4. Consequences

* Release procedure gains an artefact: the `.wasm` set per released version
  (`RELEASING.md` must say so when this is implemented).
* Storage grows per release — accepted, and small beside the promise.
* The declared residual becomes part of a case's PUBLIC contract, not only
  its solver configuration: a case with a loose tolerance makes a weaker
  reproducibility claim, and that is visible rather than hidden.
* Any change to what the dependency closure contains changes future hashes.
  Old permalinks stay valid (they name the closure they sealed); this is
  why the closure's definition is being fixed now rather than after.
* **NOT decided here:** the hash function, the URL scheme, storage/hosting,
  garbage collection, or whether permalinks are public by default.

## 5. Status

Sealing decision decided; permalink surface is ROADMAP and last in the
sequence. Sequencing (Vítor, 2026-08-10, non-negotiable): provenance
contract + data sealing fixed in the properties consolidation → evidence
taxonomy in `choupoProps` → ThermoML pilot → anchors with pre-declared
envelopes → permalinks → showcases.
