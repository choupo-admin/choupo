# No competitor is named here

> **KIND: RULING (Vítor, 2026-09-24) · STATUS: EXECUTED.**  This record states
> the rule, what was removed under it, where the removed material still lives,
> and the one narrow class of mention that survives — with the reason each
> half has.

---

## 1. The ruling

Vítor, while commissioning the green ammonia case study for publication:

> *"A comparação com [os outros] sou eu depois que a vou fazer no artigo!
> Aqui não se menciona nada, por uma questão de boa educação e evitar
> problemas legais!"*

Two reasons, and they are different reasons.  **Courtesy**: a project does not
carry a running commentary on other people's products in its own tree.
**Legal prudence**: a public repository that hosts a detailed study of a named
third party's software is an exposure that buys this project nothing.  The
comparison belongs in a peer-reviewed article, where its author signs it.

This **tightens** the rule of 2026-07-03, which banned a competitor only in
the USER-FACING MANUALS and tolerated a developer-facing exception.  The
exception is closed.  `docs/developerGuide.tex` and the `docs/design/` and
`docs/architecture/` records were exactly where the tolerated mentions had
accumulated.

## 2. What was removed, and where it still is

Two documents left the tree:

| file | what it was |
|---|---|
| `docs/design/dwsim-architecture-manual.md` | 304 lines; its own subtitle called it "a developer's manual" for a named third-party product |
| `docs/design/dwsim-solids-study.md` | 130 lines; a reading of that product's solid-liquid equilibrium solver |

Both were commissioned by Vítor on 2026-08-07 and entered the tree on
2026-09-14 in commit `0b4cbcac8`.  **They are not erased**: git history keeps
them, and either can be read with

```
git show 0b4cbcac8:docs/design/dwsim-architecture-manual.md
git show 0b4cbcac8:docs/design/dwsim-solids-study.md
```

**Removing a document is not the same as losing what it taught**, and the
findings that were load-bearing were kept, restated as Choupo's own
architecture facts, in the places that act on them:

* the layering lesson — a contracts layer with zero dependencies at the
  bottom, and a diagnostics subsystem that owns its own presentation dragging
  a GUI toolkit into a solver — is in `src/core/ResultRecords.H`,
  `docs/architecture/module-boundaries.md`,
  `docs/design/where-a-finding-record-lives.md` and `docs/developerGuide.tex`;
* the neglected liquid/solid heat-capacity term in ΔG_fus, and the fact that
  a peer omits it for a stated DATA reason, is in
  `src/thermo/phase/SolidPhase.H` and pinned by `check_ice_freezing`;
* the silent-zero-volume failure that the volumetric refusals exist to
  prevent is in `src/thermo/electrolyte/AqueousVolumetric.cpp` and
  `check_volumetric_rung1`.

## 3. What was rewritten rather than removed

Roughly twenty files carried a name in prose that was incidental to the point
being made.  In each the FINDING is unchanged and the product is described by
what it is — *a large open-source process simulator*, *the commercial
simulator*, *a peer database*.  An architecture fact does not need the product
to be true, and where it did carry technical identifiers (assembly names,
parameter keywords) those were replaced by what the identifier *is*.

**Two verbatim quotations of Vítor's own instructions named products.**  A
quotation is not rewritten — it is REDACTED, with the elision marked as an
elision (`[…]`) and dated, in
`docs/design/role-vocabulary-forum-2026-08-02.md` and
`docs/design/the-licence-of-a-sigma-profile.md`.  Silently rewording someone's
words to make them comply is a worse fault than the one being fixed.

## 4. What survives, and the principle that decides it

**A name survives only where the name IS the evidence, and removing it would
destroy the record rather than tidy it.**  That is a narrow test and it admits
exactly three things:

1. **`docs/legal/data-licensing-review-2026-08-11.md`.**  It quotes a
   project's own published statement about the licence of a database it
   redistributes.  A licence statement must be attributable to the party who
   made it, or it is not a licence record at all — and this project's own
   rules (CLAUDE.md §10) require citing where a licence permission came from.
   Citing someone's published words about their own work is not a comparison.
2. **`bin/curate/check_doctrine.py`.**  The gate must name the words it bans.
3. **`.gitignore`.**  One ignored path for a private, local-only interop
   directory that is never uploaded.

**The value-provenance cautions did NOT qualify, and this is the interesting
half.**  `data/standards/species/K.dat` and
`data/standards/conventions/MilleroConventional-v1.dat` recorded that a named
external database carries V°(K⁺) sign-flipped.  That reads as a public
accusation about somebody else's data, and — decisively — **the name adds
nothing a curator can act on**: the caution's whole job is *"the sign here is
the primary's; do not copy a −9 you find elsewhere"*, which is complete
without it.  Both now say that, with the number and the shape of the evidence
intact.  A licence statement and an accusation are not the same kind of claim,
and they do not get the same exemption.

## 5. The gate

The rule was already in `check_doctrine` and had been true of every surface it
scanned — the named manuals, `docs/ai/`, the tutorials, the site.  It was
silent about `docs/design/`, `docs/architecture/`, `src/`, `gui/`, `bin/`,
`data/` and `.claude/`, which is the whole of where the mentions lived.  **A
rule not enforced is a sentence.**  The competitor rule now runs a SECOND
pass over every TRACKED file in the repository, with the three exemptions of
§4 named individually and with a reason apiece.

The other doctrine rules (`streams{}`, the retired property filenames,
`fitBinaryPair`) stay on the teaching surfaces, because they are about what is
TAUGHT and a history record that names a retired grammar is doing its job.

## 6. Not done

* **Git history is not rewritten**, and will not be.  Rewriting published
  history to remove a name would break every clone and every commit hash this
  project's records cite, to hide something that was lawful when it was
  written.  The ruling binds what the tree carries from here on.
* **No claim is made that the ban list is complete.**  It holds eight product
  names; a ninth product mentioned tomorrow passes.  The list is in the gate
  and is the one home for it.
* The removed studies are **not** re-created in a private tier.  If the
  architecture work they supported needs re-reading, the git objects above are
  the archive, and re-deriving a finding from a public codebase is always
  available.
