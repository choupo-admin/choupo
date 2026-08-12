# The `origin` vocabulary: the engine and the ratified record disagree

> **STATUS: a FINDING, with a proposed default — not an executed migration.**
> Found 2026-08-12 while closing the `origin` axis of the five-axis provenance
> record.  Nothing in the engine or the catalogue is changed by this document.
>
> Related: [`provenance-semantics-five-axes.md`](provenance-semantics-five-axes.md)
> (the ratified record this conflicts with).

---

## 1. What was found

`src/core/Origin.H` carries the canonical `Origin` enum and its word mapping.
Neither of the two censuses taken while drafting the five-axis record found
it — they read the `.dat` files and the docs, and the enum is source.  It says:

```cpp
inline Origin originFromWord(const std::string& w)
{
    if (w == "literature" || w == "experimental" || w == "measured") return Origin::literature;
    if (w == "regressed"  || w == "fitted")                          return Origin::regressed;
    if (w == "predictive" || w == "predicted")                       return Origin::predictive;
    if (w == "estimated"  || w == "estimate")                        return Origin::estimated;
    if (w == "assumed")                                              return Origin::assumed;
    if (w == "placeholder" || w == "stub")                           return Origin::placeholder;
    return Origin::unattributed;
}
```

Recounted against `data/standards/` on 2026-08-12 (`origin <word>;` at the
start of a line):

| word in the catalogue | files | what the engine does with it |
|---|---|---|
| `literature` | 6 | → `literature` |
| `measured` | 4 | → `literature` |
| `standard` | 3 | → **`unattributed`** |
| `definition` | 1 | → **`unattributed`** |
| `asserted` | 1 | → **`unattributed`** |

**Five of the eleven records declaring a word have it silently discarded**, and
the discard maps them onto the enum value whose own comment reads *"no
provenance declared (the honest default)"*.  The engine reports a curated,
cited, deliberately-worded value as anonymous.

## 2. The two halves of the conflict

**(a) Three words fall on the floor.**  They are not near-misses:

* `components/fluorine.dat`, `dHf_298`: `origin definition;` with the citation
  *"IUPAC convention: an element in its reference state has dHf = dGf = 0 at
  298.15 K"*.  That is the **strongest** attribution a number can carry — it is
  true by the definition of the reference state — and the engine files it under
  *no provenance declared*.  The record even carries the history: it previously
  held a Joback **estimate** for an element, corrected in 2026-08-02 as a
  category error.  The correction is now invisible to the engine.
* `components/LiCl.dat`, liquid Cp: `origin asserted;` with
  `why "temporary energy-closure proxy; ... not a physical liquid-LiCl Cp
  model"`.  That is an owned stand-in — `placeholder`, or `assumed` — and it
  reads as *unattributed*, which is the one thing it is not.
* `mixtures/{air,airHumid,flueGas}.dat`: `origin standard;` with the US
  Standard Atmosphere 1976 named in the note.  A value fixed by a published
  standard is `literature` at worst.

**(b) `measured` folds into `literature`, and the five-axis record separates
exactly those.**  The ratified `origin` axis distinguishes *somebody measured
this* from *somebody published this*; the synonym list collapses them, so four
records lose that distinction on the way in.  This is milder than (a) — no
information is called anonymous — but it is the engine contradicting a
contract that was ratified after it was written.

## 3. Why the fold is not a harmless default

`originFromWord`'s unattributed return is **load-bearing**, and deliberately
so.  `Component.cpp` uses it as the typo guard on a required field:

```cpp
// Normalise through the canonical Origin vocabulary: a typo
// ("literatre") folds to unattributed and REFUSES -- the
// raw string comparison would bless any garbage word.
provOk = (originFromWord(org) != Origin::unattributed) && !method.empty();
```

That is right, and it is the problem.  **A word the vocabulary does not know
and a word the curator chose deliberately are indistinguishable to every
caller.**  `origin definitoin;` (a typo) and `origin definition;` (an IUPAC
convention) produce the same value, and where the field is required the second
one would be refused with a message about an anonymous composition — advice
that is false about the record it is given to.

That shape has been paid for in this project before: *a field the engine
cannot see is a comment* (`reviewStatus`, `dissociatesTo`, `synthetic`).  Here
the field is read, normalised, and then thrown away, which is worse — the
record looks attributed and the engine says it is not.

## 4. Why this is not a mechanical sweep

Three of the five records need a word the enum does not have.

`definition` is the real gap.  An element's ΔHf° = 0 is **not** measured, not
fitted, not predicted, not estimated from structure, not an engineering
assumption the curator owns, and not a placeholder awaiting replacement.  It
is fixed by the reference-state convention: no experiment could revise it, and
no better datum could replace it.  None of the seven existing origins says
that, and mapping it to the nearest one loses the only fact about it that
matters.

So this is not a data migration.  It is the engine's canonical vocabulary and
a ratified contract disagreeing, with three words dropped on the floor and one
of them naming a category the enum does not carry.

## 5. Proposed default (DELEGATE-WITH-DEFAULT, per philosophy §4)

Stated so the work can proceed on a recorded default rather than wait, and
reversible in one commit if Vítor rules otherwise:

1. **Add `definition` to the enum** — a value fixed by convention or by the
   definition of a reference state.  It ranks above `literature`: not the best
   measurement available, but not a measurement at all.
2. **`standard` → `literature`.**  A published standard is a citable table.
   The specific standard already lives in the record's `note`/`citation`, which
   is where a source belongs; `origin` names the KIND.
3. **`asserted` → `placeholder`** for the LiCl record, whose own `why` says it
   is a temporary proxy and not a physical model.  Not `assumed`: an assumption
   the curator owns is a modelling choice, and this one is waiting to be
   replaced.
4. **Keep `measured` as a synonym of `literature` for now, and say so in the
   header.**  Splitting it is the five-axis record's business and touches the
   `from` graph; folding it is a stated approximation rather than an oversight,
   and it costs nothing today because no consumer branches on the difference.
5. **An unknown word REFUSES by name**, replacing the silent fold.  The typo
   guard gets stronger (`literatre` is named, not silently anonymised), and a
   future deliberate word cannot be swallowed the way these three were.  This
   is the part that makes the defect unrepeatable; (1)–(3) only fix the five
   records that have already hit it.

Item 5 is the one with a blast radius: every record declaring an unmapped word
fails at load until it is migrated.  Recounted, that is five records, all
named in §1, all in `data/standards/`.  A gate must pin the count in **both**
directions — a new unmapped word appearing, and the migration silently
un-happening — because a check that stops comparing is the failure mode this
project has now paid for three times.

## 6. What has NOT been done

No source, no `.dat` and no gate was changed by this document.  The census in
§1 was taken by recounting the tree, not from memory, and the recount is the
authority: if these numbers and `data/standards/` disagree, the tree is right
and this section is stale.
