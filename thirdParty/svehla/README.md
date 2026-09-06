# thirdParty/svehla — NASA TR R-132 (Svehla 1962), a US government work

## The source

Svehla, R. A. (1962).  *Estimated viscosities and thermal conductivities of
gases at high temperatures.*  NASA Technical Report R-132.  Lewis Research
Center, National Aeronautics and Space Administration.

Table I(a) gives Lennard-Jones force constants — collision diameter σ [Å] and
well depth ε/k [K] — for about 200 species, each with a METHOD CODE saying how
it was obtained; Table I(b) is the legend for those codes.  Codes 1–4 are fits
to measured viscosity data; the rest are Svehla's own estimation routes.

## Licence, and how it was established

A **work of the United States Government**: not subject to copyright in the
United States (17 U.S.C. § 105).  Free to reproduce, quote and redistribute,
with attribution as scholarly practice rather than as a licence condition.

This is one of only two accepted source CLASSES in
`bin/curate/check_source_licence.py` (the other is ChemSep's Artistic-2.0), and
it is a CONTRACT there rather than a comment: the gate names this report, and
any record citing it must declare `licence publicDomain;`.

Verified 2026-09-06.

## Does Choupo redistribute it?

**The PDF, no — the transcription, yes, and deliberately.**

- The report itself (`NASA-TR-R-132-Svehla-1962.pdf`) lives here, gitignored.
  Fetch your own from NTRS (`https://ntrs.nasa.gov/`).
- What IS committed is `bin/curate/svehla1962/` — a page-image transcription of
  Table I(a), the method legend and a hand-written isomer table, made by reading
  300 dpi renderings row by row (the pdftotext dump is unusable: decimal points
  become bullets, `l` and `1` swap, `Cl` becomes `C1`).  It is committed because
  it is the ONE home of the data, and because a value nobody can trace back to a
  page number is a value nobody can check.

## What reads it

`bin/curate/propose_lennard_jones.py` derives `lennardJones {}` record fragments
into `data/local/` by parsed elemental formula with a molar-mass cross-check —
never by name — deterministically, and refuses an `--out` under
`data/standards/`.  Promotion into the public catalogue is a curation review, so
**no block from this source has been written into `data/standards/`**.  The
witness case `tutorials/props/transport/transport02_chapman_enskog` carries its
seven blocks case-locally.

The engine models that consume them are `ChapmanEnskog` (gas viscosity, the
report's eq. 1) and `modifiedEucken` (gas thermal conductivity, eq. 2).

## Format

Fixed-width columns in the printed table: molecule · σ · method for σ · ε/k ·
method for ε/k · data page · references.  The transcription keeps every column,
including both method codes, because σ and ε/k can come from different routes
and a reader must be able to tell a fitted value from an estimated one.

Record: [`docs/design/transport-correlations-as-objects.md`](../../docs/design/transport-correlations-as-objects.md) §8.
