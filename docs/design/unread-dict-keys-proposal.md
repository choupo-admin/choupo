# A key nobody reads — proposal, awaiting Vítor's ruling

**Status: BUILT 2026-07-31 (commit 700672a2, "A key nobody read is a key
that did nothing, and the author believes it did").**  `src/core/DictAudit`
carries the audit and `Flowsheet` runs it over each unit's `operation {}`
on the LAST pass; the `murphreeEficiency` case below is the live example
the implementation announces.  (This header still said "PROPOSAL.  Nothing
implemented." until the 2026-08-03 coherence sweep -- a shipped feature
whose design record invites someone to build it again is the same defect
one level up: a document nobody re-read.)

Written 2026-07-30 after the last-wins sweep; it touches `core/Dictionary`,
which is constitutional, so it waited for a ruling before a line of it was
coded.

---

## 1. The defect, reproduced

`tutorials/steady/distillation/column01_benzene_toluene`, with one letter
removed from a key:

```
operation
{
    refluxRatio          2.0;
    murphreeEficiency    0.6;      // one 'f' short of murphreeEfficiency
}
```

The case runs.  Exit 0.  Fifteen ideal stages, `Emv = 1.0`, no message at any
verbosity, and the printed answer is the answer to a **different question**
than the one the student asked.  The student wrote down an efficiency, saw a
converged column, and has no way to learn that the number was never read.

A **required** key is safe — `refluxRatioo` refuses at once
(`missing scalar entry 'refluxRatio'`).  The hole is every key read through
`lookupScalarOrDefault` / `lookupWordOrDefault`, which is most of the
optional vocabulary: `murphreeEfficiency`, `feedQuality`, `maxOuterIter`,
`compositionTol`, and their equivalents in every other unit.

This is the same family as the last-wins defects fixed on 2026-07-30 (a
duplicated key, a duplicated record) and the same family as the "no silent
crutch" rule: the engine acted on a default while a declaration sat in the
file saying otherwise, and said nothing.

## 2. What is proposed

A **schema-free, observational** diagnostic.  No per-unit key list to write,
none to maintain, nothing to drift.

`Dictionary` records two things as the run proceeds:

* **READ** — every key any `lookup*` / `found()` actually touched;
* **ASKED-FOR-AND-ABSENT** — every key a `lookup*OrDefault` requested and did
  not find.

The second set is the discovery.  It *is* the unit's optional vocabulary,
declared by the code itself, at run time, with no schema: when
`DistillationColumn` calls `lookupScalarOrDefault("murphreeEfficiency", 1.0)`
it has told us that this dictionary understands that word.

After the solve, one pass over the case's dictionaries reports every key
that was never read, and — by edit distance against the asked-for-and-absent
set of the same dictionary — offers the correction:

```
[unread] units[3].operation.murphreeEficiency  was never read.
         Did you mean `murphreeEfficiency`?  (asked for by distillationColumn,
         defaulted to 1)
```

## 3. Warn, then decide

**v1 warns, at verbosity >= 1, and returns exit 0.**  A refusal is the
doctrinally consistent end state, but it is not the safe first step: the
corpus has 300+ cases and some may carry keys that are read only on a branch
the case does not take (a key read only when `model simultaneous;`).  The
honest order is:

1. implement the warning;
2. run the whole corpus and read every warning it produces — each one is
   either a real dead key or a false positive that teaches us something about
   branch-conditional reads;
3. drive the corpus to zero;
4. add a gate that keeps it at zero;
5. **then** ask whether the warning becomes a refusal, or a `strictKeys true;`
   in `controlDict` that a case opts into.

Step 2 is the point of the whole exercise and cannot be skipped: a diagnostic
whose false-positive rate we have not measured is a diagnostic nobody will
trust, and a warning nobody trusts is worse than none.

## 4. Cost, and what it touches

* `core/Dictionary.H/.cpp` — two `mutable std::set<std::string>` per
  dictionary, marked in the lookup methods.  Constitutional file: hence this
  proposal.
* One reporting pass, walking the dictionaries a case loaded.
* Levenshtein on short words, over a handful of keys, once per run — not the
  hot path.

Memory: two small sets per dictionary node.  A case holds hundreds of nodes,
not millions.

## 5. What is NOT proposed

* **No per-unit key schema.**  A declared list of legal keys is a second home
  for a fact the code already states by asking for it — the arity sin, and it
  would drift the first time someone adds a key without updating the list.
* **No refusal in v1** (see §3).
* **No "did you mean" guess that silently APPLIES the correction.**  It names
  the suspicion; the author fixes the file.  The engine never edits the case.

## 6. The open question for Vítor

Three things need a ruling, and only the first blocks the work:

1. **Does `Dictionary` get to remember what was read of it?**  It is a change
   to the constitutional file, and it makes a parser stateful about its own
   consumption.  The alternative — an external register keyed by dictionary
   pointer — keeps `Dictionary` pure at the cost of a second home for the
   fact, which is worse.
2. Warning at verbosity >= 1 (with the summary) or >= 2?
3. Does the end state refuse, or does it stay a loud warning with an opt-in
   `strictKeys`?
