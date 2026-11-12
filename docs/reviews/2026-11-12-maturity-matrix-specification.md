# A maturity matrix for Choupo: specification

Date: 2026-11-12.  Written by the reviewing (cloud) session at Vítor's
request.  The generator and its gate are code, so they are the building
(laptop) session's to write (DEV.md 4c C364); this file is the specification
they are built from and the frame every later review in `docs/reviews/` uses.

## 1. The problem this answers

On the commit this was written against, the tree registers 253 capability
names (`check_feature_documented`'s own count), 687 components, about 1600
mixture-parameter records, 535 runnable cases and 76 EduTools.  Nobody can
read that, and a review without a map does two bad things at once: it
re-reads what was already checked, and it misses what never was.

The suite already answers ONE question well: *has an answer moved?*  A golden
pins what a run prints.  It does not say the answer is right
(`docs/architecture/verification-and-validation.md` section 1), and the tree
has no single place that says, per capability, what evidence exists that it
is.

The aim: **every capability has a known level of evidence, read from the
tree; a review fills one named empty cell; a filled cell is held by a gate and
is looked at again only when its code changes.**  Consolidation becomes a
count that rises, not a campaign that restarts.

## 2. Where the frame comes from

Named from memory, not re-read for this document, and used as a frame only
(no text copied): the ASME verification-and-validation standards for
computational mechanics; Oberkampf and Roy, *Verification and Validation in
Scientific Computing* (2010), for the separation of code verification,
solution verification and validation; the predictive-capability maturity
model of Oberkampf, Pilch and Trucano (2007) and the NASA standard for models
and simulations, for the idea of a table of evidence levels per element; the
phenomena identification and ranking table of nuclear safety analysis, for
ranking what to examine by importance and by ignorance.

The five classes of `verification-and-validation.md` section 2 (regression,
verification, architectural gate, expected refusal, validation) are kept;
this matrix says WHICH capability each piece of evidence is about.

## 3. Rows

Version 1 has two kinds of row.

**A. Capabilities.**  The registered names, enumerated exactly as
`bin/curate/check_feature_documented.py` enumerates them (every literal in a
`registerType` / `registerModel` / `reg(` call under `src/`, aliases counted
once, family = the registering source file).  ONE enumeration: the generator
imports it, it does not write a second.

**B. Catalogue classes.**  One row per class of record, with counts, because
a row per record does not fit a page: components; NRTL, UNIQUAC, Wilson,
Henry, Pitzer and eNRTL pairs; reference equations of state; assets
(materials, membranes, adsorbents, modules, stacks); utilities.  The
per-record detail goes to a table file beside the summary.

Not in version 1, named so the absence is visible: cases as rows (by tier),
EduTools as rows, guide chapters as rows.

## 4. Columns

The columns are INDEPENDENT, not a ladder: a model can be validated and
undocumented.  Each cell is filled only by evidence that exists in the tree;
the rule for each column says what counts.

| column | the question | what counts as evidence |
|---|---|---|
| RUNS | does a tracked case with a golden exercise it? | a case under `tutorials/` whose dictionaries name the type or model and that carries an `expected` file; the cell lists the cases |
| DOCUMENTED | can a reader find what it computes? | `check_feature_documented`'s two conditions (a labelled guide section and the AI catalogue), unchanged |
| BALANCED (units only) | does it conserve what it must? | the unit is covered by the per-unit arm of `check_energy_closure` and by `check_mass_closure` on a case that exercises it, with no open pin |
| VERIFIED | does the code compute what its stated model says? | one of: (a) a `verify()` anchor of THEORY kind on a correlation object; (b) a gate that recomputes the result by an implementation independent of the engine's (as `check_reference_eos` and `check_pinch_p1` do); (c) a case of the *verification* class (closed form, or code to code) that names the capability.  An ARITHMETIC anchor (a literal the same formula produced) counts only as *transcription checked* and is shown as such, never as verified |
| VALIDATED | does the model agree with measurements it was not fitted to? | a case of the named validation subset (`verification-and-validation.md` section 3); or a pinned comparison (`aad` or `anchor` rows) against a dataset whose provenance is measured and that the fit did not read.  An in-sample grade is NOT validation and is shown in its own sub-column |
| REVIEWED | has a named person read it and answered for it? | for a record, its `review { by <person>; }` block (C296/C297); for a capability, a dated file in `docs/reviews/` signed by a named human; for an EduTool, its curator field.  A model's review does not fill this cell |

For the catalogue classes (rows B) the same columns are counts: how many
records of the class carry each kind of evidence, with REPRODUCIBLE added
(the record is reproduced from its own curation case by a gate, as
`check_regressed_pairs` and `check_henry_records` do) and the grade
distribution (clean / warning / severe, and the in-sample and
single-laboratory caps).

## 5. Where the evidence is read from

Most cells are derived with no hand-written input: RUNS from the case
dictionaries, DOCUMENTED and its debt from the existing gate, BALANCED from
the closure gates' own reports, REVIEWED from the records, the catalogue
counts from the records and `generated/releaseInventory.json`.

Two columns need ONE small hand-kept table, because no rule can tell which
names a gate or a case is evidence for: `maturity_evidence.tsv`, one row per
claim -- *name, column (VERIFIED or VALIDATED), kind of evidence, pointer (a
gate, a case, a guide anchor), one sentence saying what was compared with
what.*  It is the only hand-kept home, and every row of it is checked: the
pointer exists, the gate or case passes, the named capability is registered.
A row that points at nothing fails; nothing is believed because it is
written.

## 6. The ratchet, and when a cell reopens

* **The counts may only rise.**  A floor per column is pinned; the gate fails
  when a count falls, unless the row was removed with a written reason
  (a capability retired, an evidence found wrong).
* **Evidence carried by a gate or a case renews itself.**  It is re-run with
  the suite, so a change in the code that breaks it is seen at once and the
  cell empties by the gate failing, not by anyone remembering.
* **Evidence carried by a person goes stale.**  A REVIEWED cell records the
  git blob ids of the capability's source files at the time of the review.
  When they change, the cell reads *reviewed, code changed since* -- neither
  empty nor filled -- until someone looks again at the DIFF, not at the whole.
* **A new capability is born with two cells filled.**  A newly registered
  name must enter with RUNS and DOCUMENTED (rule 4d already asks for the
  second; the witness case every slice ships is the first).

## 7. Which empty cell is next

A generated ranking, so the choice is not a matter of taste.  Each empty
VERIFIED or VALIDATED cell gets a score, the product of three declared
weights kept in one file:

* **exposure** -- how many cases use the name, weighted by tier (showcase 3,
  tutorial 2, witness 1), plus a fixed bonus when a case on the demonstration
  path uses it;
* **consequence** -- by family: a thermodynamic model, a flash, a column, a
  reactor or a recycle solver 3; sizing, costing and economics 2; reporting
  and layout 1;
* **ignorance** -- 3 when neither VERIFIED nor VALIDATED is filled, 2 when
  one is, 1 when only REVIEWED is missing.

The weights are a stated default and are the first thing to tune once the
first ranking is read.

## 8. What a review is, under this matrix

* **One review, one target:** a cell, or one column of one family.  The
  review file names the commit it was run against.
* **By measurement:** it runs the cases, recomputes by an independent route,
  sabotages by hand to see whether the slice's own gates fire, and compares
  with measured data where an open source or the archive has it.
* **Two possible outcomes, both recorded.**  *The cell can be filled:* the
  review hands over the independent computation (script and numbers) and the
  builder turns it into a gate or a case and adds the evidence row.  *It
  cannot:* numbered findings.
* **A finding** carries: an id, the cell, a severity, the statement in one
  sentence, the evidence (command, input, expected, observed), and whether
  the reviewer reproduced it twice.
  * S1 -- a wrong number or a broken conservation a student would use
    without being told;
  * S2 -- a right number presented in a way that misleads, or a limit
    crossed without an announcement;
  * S3 -- a defect of form that changes no decision.
* **One ledger,** `docs/reviews/LEDGER.tsv`: id, date, cell, severity,
  statement, review file, status (open / fixed in a commit / declined with
  the reason), and the commit.  The reviewer adds rows; the builder fills the
  answer.
* **A pull limit.**  No new review is started while more than ten S1 or S2
  findings are unanswered.  The rate of review follows the rate of repair.
* **The reviewer does not fix** and writes only under `docs/reviews/`.

## 9. The gate

`check_maturity_matrix`, when built, holds: the generated matrix is the one
the tree produces (freshness, as every generated artefact); every row of
`maturity_evidence.tsv` resolves and passes; no column count is below its
pinned floor; every newly registered name has RUNS and DOCUMENTED.  Its claim
line states the counts per column and what it does NOT judge.

## 10. What the matrix does not say

That the evidence is enough.  A filled VERIFIED cell says an independent
route agrees AT THE POINTS TESTED; a filled VALIDATED cell says the model met
those measurements, in that range.  It does not judge the teaching quality of
a page, the choice of a default, or whether a capability should exist.  It
makes the absence of evidence visible; it is not a certificate.

## 11. What is known before the generator exists

Only what existing gates already count, on the commit this was written
against: DOCUMENTED 212 of 253 (`check_feature_documented`); the validation
subset is six cases with measured datasets (`check_validation_subset`); no
NRTL record carries a person's review.  Every other number is the
generator's to measure, and none is guessed here.

## 12. Build order proposed to the builder

1. Rows A with RUNS, DOCUMENTED, BALANCED and REVIEWED (no hand input), the
   summary page and the freshness arm of the gate.
2. `maturity_evidence.tsv` seeded from what already exists (the correlation
   objects' theory anchors, the gates that carry an independent
   recomputation, the validation subset), VERIFIED and VALIDATED, the ratchet.
3. Rows B (the catalogue classes) and the ranking of section 7.
4. The ledger and the pull limit, when the first review under this frame is
   answered.
