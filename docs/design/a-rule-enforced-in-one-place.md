# A rule enforced in one place out of many

*2026-09-04.  Slice record.  Gate: `check_standards_write_guard`.*

## The claim, and what was behind it

Four documents in this repository state, without qualification, that the engine
refuses to write into the frozen catalogue:

| home | wording |
|---|---|
| `CLAUDE.md` §7 | "The engine REFUSES to write under `data/standards/` — new data is a curation act." |
| `docs/ai/data-doctrine.md` | "**engine REFUSES to write here**" |
| `docs/architecture/domain-glossary.md` | "the engine refuses to write under `data/standards/`" |
| `src/propertyOps/FitParameters.cpp` | "(the engine never writes the standards catalogue)" |

Exactly one code site enforced it: `EstimateComponent.cpp`, a scan of the
`proposal` path's components for the literal word `standards`.

Measured on 2026-09-04: **50 lookups across 34 files** take an output path from
a dict; **32 of those files** then construct a `std::ofstream`.  One was
guarded.

## Reproduced, not supposed

Before anything was written, the defect was demonstrated.  A copy of
`curate02_vle_heldout_ethanol_water` with its `proposal` key pointed at
`…/standards/parameters/NRTL/ethanol-water.dat`:

```
EXIT=0
-rw-r--r--  2663  …/standards/parameters/NRTL/ethanol-water.dat
```

A **promotable pair record** — carrying a `provenance {}` block that
`thermo/PairAudit.H` reads as authoritative — written into the frozen tree at
exit 0, with nothing said.  That is the worst of the fifty: the other unguarded
paths write CSVs, which are untidy in the catalogue; this one writes something a
later run would *believe*.

The last words of the sentence matter: a rule enforced in one place out of many
is a sentence, not a contract.

## Where the rule lives now

`records::targetsStandardsTree` / `records::refuseStandardsWrite`, in
`src/thermo/RecordResolver.H` — beside `standardsRecord()`, which already
computes `Database::currentRoot()/standards`.  A separate `core/ProtectedPaths.H`
was considered and rejected: it would have been a second home for the same path,
which is the defect this project spends most of its gates preventing.  `thermo`
is band 3, and every band that writes (`propertyOps` 2, `outerDriver` and
`reporting` 1) reaches it downward, so the layering is unchanged.

### Two rules, because each covers the other's blind spot

**(a) A path component literally named `standards`.**  Coarse — it also refuses
a scratch directory carrying the word — and deliberately kept, because it is the
rule that still fires when the catalogue root is not where the process thinks it
is: an unset `CHOUPO_HOME`, a case run against another tree, or a **sealed**
case, which forbids the installation catalogue entirely and so has no root to
compare against.  It is also `estimateComponent`'s existing behaviour, and
generalising a guard must not quietly loosen it.

**(b) Containment under the resolved catalogue root**, compared
weakly-canonically because the target does not exist yet — that being the whole
point of asking before writing.  This catches the routes (a) cannot see: a
symlink, or `data/../data/standards`.

Neither alone is the contract; their **disjunction** is.  The refusal names
which one fired, because a reader who hit (a) on a scratch path and a reader who
hit (b) on the real catalogue need different next steps.

## What was deliberately not guarded

The outer drivers' `path` keys are **dict** paths — `units[0].operation.refluxRatio`
— not filesystem paths.  Guarding one would refuse a legitimate case.  This is
the misclassification a mechanical sweep invites, and it is why the sweep was
done by reading each site rather than by pattern alone.

Reads are not guarded either.  Reading from `data/standards/` is what the engine
is for.

## The gate, and the sabotage that survived

`check_standards_write_guard` recounts the writing files on every run (the arity
lesson from `check_origin_census`, which got its own population wrong twice by
counting once and then remembering), and drives both rules through the real
binary.

Six sabotages; **the first survived**, and it is the useful one.  Deleting
`fitParameters`' guard at the point the `proposal` key is *read* left the gate
green — because the op guards that key twice, once at the read and once on the
path `auto` resolves to, and for any non-`auto` path the second covers the
first.  The redundancy is correct and stays.  What was missing was the ability
to tell the two apart, and the difference is visible: with the early guard gone,
the run performs the entire regression and refuses at the end.  The gate now
asserts that no `Final chi2` precedes the refusal — the early guard's purpose,
made checkable.

The one **exemption** — `choupoProps/main.cpp`, which reads `output.file` to
locate a CSV a props op already wrote — carries its premise as a check rather
than a claim: every stream that file opens must name a string literal.  The day
one takes a variable, the exemption stops being true and the gate says so.  It
is not a `debt_registry` entry, because nothing here is an accepted violation
with a remedy; it is a correctly classified non-writer.

## Why this sits on the curation campaign

Vítor ruled on 2026-09-03 that a student curates **for their own case only** —
*"cura para ele"* — with no proposal path into the shared catalogue.  Outside
one operation, the engine had no structural expression of that at all.  It has
one now, and every refusal names the case-local remedy.
