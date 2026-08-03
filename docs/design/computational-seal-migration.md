# The computationalSeal — sealing-schema migration (ratified 2026-08-03)

**Status: BUILT + corpus MIGRATED 2026-08-03 (328 manifests, 0 skipped).
This was a SEALING-SCHEMA migration, not a scientific reseal — nothing
was re-imported, re-validated or re-claimed; the legacy byte hashes
remain in every manifest as the historical provenance record.**

## 1. The problem

The legacy seal claims WHOLE-FILE BYTES (`sha256`): any comment,
whitespace or unit-spelling change — in the installed copy or in the
catalogue origin — reads as divergence.  Two consequences had grown:

* the seal-drift report could not tell curation prose from moved
  values (435 origin drifts, unclassified);
* the standing remedy ("re-run bin/choupo-import per case") would be a
  MASS RESEAL of ~330 cases — rewriting claims wholesale destroys the
  distinction between "the bytes moved" and "the content moved", and
  looks like re-validation when nothing was re-validated.

## 2. The ratified contract

* **computationalSeal**: the claim is about the PARSED content.  The
  exclusion of non-computational material is BY TYPED FIELDS — the
  parser's own tree (`src/core/DictCanonical`) — never by
  comment-stripping: comments and formatting never reach the tree by
  construction.  What enters: keys in declaration order, scalar values
  in canonical SI (round-trip `%.17g`), DECLARED dimensions where
  present, words/strings, lists, sub-dicts, `$var` references by name.
* Conservative corollary: dropping/adding a unit spelling (`1 bar` ↔
  raw `100000`) changes the declared-dims field and is NOT claimed
  cosmetic — the dimension-checked-lookup refusal surface moved.
  (`1 bar` ↔ `1e5 Pa` IS cosmetic: same SI value, same dims.)
* **legacySeal**: manifests without `sealSchema computational;` keep
  the byte semantics untouched.
* ONE implementation: the canonicalization lives in the engine;
  `choupoProps --canonical-hash / --canonical-dump` is the public
  surface (the dump is printable — the student can SEE what the seal
  claims); the importer and the migration script shell out to it.

## 3. Behaviour under `sealSchema computational;`

* Installed record, byte drift only (comment edits): verdict stays
  `verified`; the byte-only drift is ANNOUNCED by name ("BYTES ONLY").
* Installed record, computational drift (value/dims/key/structure, or
  no longer parses): `diverged`, named — exactly the legacy behaviour.
* `onDivergence refuse;` fires on computational divergence only; a
  junk `onDivergence` word now refuses on EVERY run (previously the
  validation sat behind the divergent path — found by the gate when
  the schema made its byte-edit probe clean; fixed in SealCheck).
* Seal-drift report: origin evolution is classified COSMETIC (parsed
  content identical to the sealed claim) vs COMPUTATIONAL.  First run
  of the classifier: the standing drift population is COMPUTATIONAL —
  the catalogue genuinely gained content (pcsaft blocks, ring-campaign
  thermochemistry), it was never just comments.  The classification,
  not any particular outcome, is the deliverable.

## 4. The migration (executed)

`bin/curate/migrate_seal_schema.py` — fail-closed, idempotent, minimal
textual insertion: (1) verify every imported/merged record's bytes
still match the legacy claim (ANY divergence ⇒ the case is SKIPPED and
listed, exit 1 — never silently re-claimed); (2) compute
`computationalSha256` from the installed file (byte-identical to the
import-time origin, so the hash describes the import-time content);
(3) insert the field + `sealSchema computational;`, leaving importedAt,
importerVersion and the byte hashes untouched.  Result: 328 migrated,
0 skipped.  `bin/choupo-import` (importerVersion 3) writes the new
schema on every future import/reseal.

## 5. Gates

`check_seal_schema` (canonicalization equivalences incl. the
conservative dims rule, cosmetic-stays-verified, value
diverges/refuses, migration idempotence + fail-closed;
sabotage-verified: computational divergence classified cosmetic ⇒ 2
probes fail).  `check_seal_verdict` updated: its divergence probe is
now a computational edit (a new key), and the junk-word refusal fires
on a clean run.  `check_seal_drift` carries the cosmetic/computational
classification.
