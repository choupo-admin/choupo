# Validating a case against measured data — and diagnosing what is wrong

*For an LLM helping a user author a Choupo case.  Read this before you reach
for "a better component record", and before you answer any question of the form
"is this model good enough?".*

Most of `docs/ai/` tells you how to **express** a case.  This file tells you how
to find out whether the case is **right**, and — when it is not — how to work
out *which* declaration is at fault.  That question has a wrong answer that
feels productive (change a number in a component record and see if it improves)
and a right one (find out what the error is a function of).

---

## 0. The rule that governs everything below

**Do not build a case by analogy and stop there.**  Copying a working case and
swapping components gives you a case that *runs*.  Running is not agreeing.  A
cubic equation of state will return a plausible density at 200 bar for any
mixture you hand it, at exit 0, with every KPI stable enough to pin in a golden
master.  Nothing in the corpus will notice.

If the user is asking whether a model is adequate — or if you are about to tell
them it is — you owe them a comparison against something measured.  Everything
below is how to build one.

---

## 1. Where measured data comes from

### 1.1 The ThermoML archive — `bin/choupo-thermoml`

The archive is a large collection of experimental datasets published alongside
articles in the thermophysical-property journals.  **It is not part of Choupo.**
The user obtains their own copy; the tool reads it locally.

```bash
bin/choupo-thermoml sync                      # fetch the archive (once)
bin/choupo-thermoml index                     # build the local index
bin/choupo-thermoml search ammonia            # what is there for a compound
bin/choupo-thermoml search nitrogen --online  # search the remote catalogue
bin/choupo-thermoml extract nitrogen --into data/local
bin/choupo-thermoml extract nitrogen --allow-mixture --into data/local
bin/choupo-thermoml extract-vle <query> --block N
```

Things that will bite you:

* **`--allow-mixture` is off by default, and that default is correct.**  A
  property read off a *mixture* study is a different physical quantity from the
  pure-component property of the same name.  Writing mixture rows under a
  pure-component header attaches a real DOI to a false claim.  Pass the flag
  only when you *want* the mixture data (a Henry fit, a VLE fit, a density
  comparison), and read the header the tool writes: it says `system ( A B )`.
* **A multi-block article demands `--block N`.**  Choosing which block is the
  curator's act; the tool refuses to choose.
* **An unresolvable component refuses** rather than being guessed at.
* The extracted file declares **every variable as a column**.  A binary density
  set is `T, P, x_<component>, rho` — not `(T, rho)`.  If you only use the
  first two columns you are discarding the fact that distinguishes the points.

### 1.2 Anything else

Primary publications, the user's own laboratory data, a vendor data sheet.  The
rules in §4 apply identically.

### 1.3 What may enter the repository

Read [`data-doctrine.md`](data-doctrine.md) and
[`curation-protocol.md`](curation-protocol.md) in full before writing any
measured value into the tree.  The short form:

* **A handful of values cited to their primary publication is a CITATION** and
  may live in a case.  A whole published table is the authors' *arrangement*
  and may not.
* **`data/standards/` is a curation act**, not something you do while authoring
  a case.  The engine refuses to write there.  Case-local and `data/local/` are
  where your work goes.
* **NonCommercial and no-grant sources are excluded entirely** — not "cite them
  carefully", excluded.  That includes several sources whose numbers are easy
  to find.
* **Never invent a citation.**  If you cannot name the primary source of a
  value, say so and leave the gap visible.  *Unsourced* is a gap a reader can
  see; *falsely sourced* is one nobody can.  Verify author names, journal and
  year against the file you actually have — do not write them from memory.

---

## 2. Where the data goes in the case

The property layout has four axioms (see [`thermo.md`](thermo.md) and
[`data-doctrine.md`](data-doctrine.md)).  Operationally, for a case:

| what | where |
|---|---|
| intrinsic pure-compound property | `data/standards/components/<name>.dat` — **curated, not yours to edit** |
| pair-dependent parameter (NRTL, Henry, kij) | `data/standards/parameters/<model>/<pair>.dat` — same |
| equipment-dependent kinetics | the case's `constant/` |
| **sample-specific measured data** | the case's `constant/components/<name>.dat` |
| **cited evidence you are validating against** | the case's `constant/experiments/` |

### 2.1 A case-local component record OVERLAYS, field by field

`constant/components/H2.dat` does **not** replace the standard entry — the
`Database` overlays it field by field.  So a file containing only

```
name        H2;
formula     H2;
MW          2.016;
Tc          41.67;
Pc          20.77;
omega       0.0;
```

changes exactly those constants and inherits everything else (Cp polynomial,
vapour pressure, thermochemistry, provenance).  This is the cheapest possible
experiment and you should reach for it *to measure*, not to fix.

### 2.2 A binary interaction parameter needs a RECORD, not an inline value

There is no inline `kij` in the grammar.  Write the record:

```
// constant/parameters/SRK/N2-H2.dat
recordType eosBinaryInteraction;
schemaVersion 1;
i    N2;
j    H2;
kij  0.08;
eos  SRK;
```

and point the declaration at it — the `source` is **required**, and that is
deliberate: a parameter with no stated origin is exactly what this project
refuses to ship.

```
equationOfState
{
    model      SRK;
    mixingRule vanDerWaalsOneFluid;
    binaryInteractions
    {
        N2-H2 { source "constant/parameters/SRK/N2-H2.dat"; }
    }
}
```

**When no pair record exists, the engine announces `kij = 0`** in the run's own
advisories.  Read that line before concluding anything: an absent parameter is
a declared, announced fact, not a silent default.

---

## 3. The diagnostic method — what is the error a function of?

This is the part that is worth more than any individual fix.

When a model disagrees with measurement, you have three candidate causes and
they leave **different fingerprints**.  Evaluate the model at several
compositions (or temperatures, or pressures) and look at the **mean signed
error per group**, never at the aggregate AAD alone:

| fingerprint | cause | the knob |
|---|---|---|
| all groups shift **by the same amount, same direction** | a **pure-component** datum | the component record |
| the error **changes sign** or varies strongly with composition | the **mixing rule** | a `kij` / pair parameter |
| the error is **insensitive to both**, and grows toward one pure component | **the model itself** | a different model — nothing you can declare |

**An error a mixture parameter cannot reach is not a mixture problem.  An error
a pure-component change shifts uniformly is not a pure-component problem
either.**

A worked example is shipped: `tutorials/props/molecular/srk01_h2n2_density`.
It evaluates SRK against sixteen published (T, P, x, ρ) points on N₂+H₂ at the
conditions of an ammonia synthesis loop, and then tries both knobs.  Neither
works — the effective-hydrogen substitution makes it *worse* and moves all
compositions together; the best `kij` fixes the equimolar mixture and cannot
touch the nitrogen-rich one.  What is left is the cubic's own volumetric
behaviour, and the remedy (volume translation, or a reference Helmholtz
equation) **does not exist in this tree**, which the case says plainly.

### 3.1 Do this in the right order

1. **Measure the baseline first**, with the declaration the user actually runs.
   That number is the answer to their question; everything after is diagnosis.
2. **Vary one knob at a time, on a COPY of the case.**  Never mutate the case
   you are validating.
3. **Group the errors** by whatever you varied in the data (composition,
   temperature, pressure) and read the *signed* means.
4. **Only then** propose a change — and if the fingerprint says "the model",
   propose the model, not a parameter.

### 3.2 The negative result is a deliverable

"I tried the two available knobs and neither helps, and here is why" is a
*better* answer than a tuned parameter, and it is the one a student learns
from.  Do not bury it because it looks like failure.

---

## 4. If you put a number in front of a reader, something must re-measure it

This project's standing rule is **published implies pinned**.  It applies to
prose, not only to result blocks:

* A golden master (`expected`) pins **what a run prints**.  It cannot see a
  number written into a README, a case header or a comment.
* So an agreement statistic, an AAD, a "the error is about 1 %" — written into
  a document — is a **transcription with no owner**.  It stays put while the
  engine, the records and the anchors move underneath it, and nothing fails.

Two acceptable resolutions:

1. **Do not write the number.**  Ship the comparison and let the reader run it.
2. **Write it and add a check that re-measures it** from the run's own output
   and the case's own data, and fails when the two disagree.  Where two prose
   homes cannot share a variable, a check that recomputes is the only available
   single source.

The same applies to a **negative** result, and more urgently: nobody re-reads
the "we tried this and it did not work" paragraph on the day it stops being
true.  Pin it, so that the day a curated parameter lands and *does* work, the
claim fails loudly instead of quietly becoming a lie.

---

## 5. Checklist before you tell a user a model is fine

- [ ] Did I compare against something **measured**, or only against another case?
- [ ] Do I know the **primary source** of every measured value I used, and did I
      read it off the file rather than from memory?
- [ ] Did I check the run's own **advisories** — an announced `kij = 0`, an
      extrapolation outside a declared `Trange`, an estimated input?
- [ ] Did I group the errors and read the **signed** means, or only the AAD?
- [ ] Did I run the knob experiments on **copies**, leaving the case untouched?
- [ ] Is every number I have written down **re-measurable by something**?
- [ ] Have I said what the comparison does **not** cover — the conditions,
      compositions and properties it never touched?

That last one is not politeness.  A validation quoted beyond its range is worse
than none, because it transfers confidence the evidence never carried.
