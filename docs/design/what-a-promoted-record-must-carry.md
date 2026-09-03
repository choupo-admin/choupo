# What a promoted record must carry

**Status: BUILT 2026-09-03.  Slice 1 of the curation campaign Vítor ratified
the same day ("temos de consolidar agora esta parte porque é realmente
importante garantir que os fundamentos da simulação são fáceis de curar").
It implements nothing new: it makes ONE generated artefact honour the
provenance semantics ratified on 2026-08-12.**

---

## 1. The finding

`choupoProps fitParameters` can write a binary-pair `.dat` a reader MOVES into
`constant/parameters/<model>/` and then simulates with.  That file is the
deliverable: it outlives the run, the console, and usually the person.

The run that produces it prints, in this order:

    FIT QUALITY        chi2 over 8 points, labelled IN-SAMPLE
    HELD-OUT EVIDENCE  the dataset, 3 points, AAD 0.0737 % (0.2630 K)
    ACCEPTANCE         maxAAD 0.1 %, with the reason it was set at 0.1 %
    VERDICT            validated

and then wrote a file containing none of it:

    provenance
    {
        source        fitted;
        fitDate       "2026-09-03";
        algorithm     "Levenberg-Marquardt (choupoProps fitParameters)";
        chi2          0.80969941;
        nDataPoints   8;
        identifiable  false;
    }

Against `docs/design/provenance-semantics-five-axes.md` (RATIFIED 2026-08-12)
this is the ORIGIN word sitting in the slot whose one job is *where the DATA
came from* — and the record named no dataset, no DOI and no verdict.  The
contract is explicit about exactly this pairing: **"`fitted` — regressed
against data.  The data's identity lives in `provenance`, never inside this
word."**

`source fitted;` was not inert either.  `src/thermo/PairAudit.H` — the ONE
parser every activity-model family loader shares — reads a `source` word as a
LEGACY origin and raises

    - pair ethanol-water: legacy source-word origin ('fitted') -- declare a
      typed `origin`; deprecation

on every promoted proposal.  The tool that exists to help a student curate was
emitting a deprecation warning against itself.

## 2. What changed

Two things, and neither is a new grammar.

**The record now carries its evidence and its verdict**, on the axes the
contract names and in the FILE LAYOUT the curated corpus already uses —
`origin`, `method` and `methodVersion` as keys inside `provenance {}`, which is
where `data/standards/parameters/NRTL/*.dat` carry them and where `PairAudit`
reads them.  A first draft put `origin` at the record's top level, on the
reasoning that an axis deserves its own home; that draft ran, loaded, and
reported `origin unattributed` at run time, silently.  **The axis is a
responsibility, not a nesting level** — and a layout its own reader cannot see
is the writer/reader split in another register.

Only one block is new: `validation { verdict …; heldOut { … } acceptance { … } }`.
The corpus had no home for a held-out result on a promotable record, because
until today no promotable record could state one.

**The write MOVED.**  It used to happen inside the identifiability block, which
runs BEFORE the held-out pass — so the verdict was not yet computed when the
file was written.  The pair facts are now captured there (`PairProposal`) and
the file is emitted after the verdict, which is the only ordering in which the
artefact can say what the run concluded.

## 3. Two things found on the way

**The result JSON emitted three keys twice.**  `ResultEmitter` wrote `origin`,
`method` and `methodVersion` by hand and then called
`pairResolutionAuditJson` — the shared formatter that exists so there is ONE
implementation — which writes the same three.  Every pair resolution in every
`choupoSolve` result JSON carried them twice in a single object.  Found by
reading the round-trip arm's own output; `choupoProps` never had the defect,
because it only ever called the shared formatter.

**A `.gitignore` line outlived its directory.**  `constant/binaryPairs/` was
renamed `constant/parameters/` by Migration 2 on 2026-07-16 and the ignore rule
was not moved with it, so for seven weeks `proposal auto;` records landed
somewhere nothing ignored.  Both spellings are kept now.

## 4. What is deliberately NOT done

* **No corpus migration.**  The ~95 `origin=` values across 72 files that the
  five-axes record measured are untouched.  That migration is not authorised by
  that record and is not authorised by this one; what is fixed here is a
  GENERATOR, which is the class the five-axes record itself flagged as urgent
  ("a generator producing new files in a vocabulary the scheme did not
  contain").
* **The `Origin` enum keeps its words.**  `originFromWord("fitted")` already
  maps to `Origin::regressed`, so the record reads correctly today; renaming the
  enum is part of the migration above.
* **No number is validated.**  The record carries the run's own output.  The
  gate proves the file states it and that it agrees with the console; whether
  the coefficients are right is a curation question, and this record's own
  witness answers it with `identifiable false` beside `verdict validated`.
* **Promotion stays a human act.**  Nothing writes into `data/standards/`, and
  nothing decides that a record SHOULD be promoted.

## 5. Witness and gate

`tutorials/props/curation/curate02_vle_heldout_ethanol_water` declares
`proposal ethanol-water.proposal.dat;` and writes the record.  The artefact is
NOT tracked: its header and `fitDate` carry the generation date, so a committed
copy would go dirty every day the case is re-run.  What is pinned is its
CONTRACT.

`bin/curate/check_promoted_pair_record.py` rebuilds it from the witness and
checks six things: the header states the verdict above the `mv` line; `origin`
is typed and inside `provenance {}`; both datasets appear with the role each
was frozen in, plus the partition fingerprint; the verdict, point count and
band AGREE with the same run's console; the record ROUND-TRIPS (promoted into a
flash case with its inline pair stripped, it runs and resolves to `origin
regressed` with no deprecation advisory); and the resolution JSON names each key
once.  Five sabotages, all fired.

The instructive sabotage is S5 — removing `proposal` from the witness — because
without that arm the whole gate would pass vacuously on a case that had stopped
writing the artefact at all.  The gate's own first version had a defect of the
same family: its round-trip probe stripped the inline pair block with a DOTALL
regex that matched the word where it appears in the dict's HEADER COMMENT,
deleted the entire liquid phase, and then reported that *the promoted record
does not RUN*.  **A probe that mangles its own input blames the engine for its
own edit.**

---

## 6. The same defect one artefact along: the Explorer could not see an estimate

**Slice 2, the same day.**  §1 was about a file carrying what the run
concluded.  This is about the screen carrying what the file declares.

`choupoProps estimateComponent` already does the honest thing.  Every value it
derives is written with its own provenance block:

    provenance
    {
        Tc { origin estimated; method "Joback";
             methodVersion "joback-poling5e-table2-2";
             inputFingerprint "CH3:2,ketone:1";
             uncertainty { status unquantified;
                           reason "first-order group estimate -- review against data before design"; } }
    }

**Nothing read them.**  The Explorer's component inspector drew `reviewStatus`,
`role nonvolatile` and `provenance.source synthetic`, and walked past the
per-value blocks entirely — so a student who generated a component by group
contribution and opened it in the Explorer saw a panel indistinguishable from
a curated, measured record.  Joback carries roughly 10 % on Tc; the screen said
nothing.

The inspector's own model had carried a mark kind for exactly this since it was
written:

    kind: "reviewStatus" | "tier" | "role" | "estimate" | "synthetic";

and `"estimate"` was **never constructed anywhere in the codebase**.  A declared
vocabulary with no emitter.

### 6.1 The rule is structural on both sides

A per-value block is a sub-dict of `provenance` that DECLARES `origin` — that
is the reader's whole test, and the gate applies the same one.  A list of field
names (`Tb`, `Tc`, `Pc`, …) would be a second home for the engine's own
vocabulary and would go stale the first time a generator learns a new value.

The mark distinguishes experimental origins (`measured` / `experimental` /
`literature`, the words `core/Origin.H` accepts) from every other — estimated,
predictive, regressed, assumed, placeholder — because those are numbers
something PRODUCED, and the reader is told which values and by what.
`unquantified` is rendered as the record's own answer about its error, not as a
missing field.

### 6.2 A contract across two languages, and the transcription problem

The writer is C++ and the reader is TypeScript.  The GUI's unit tests run
against a TRANSCRIPTION of the engine's output, because the generated file is a
run output and gitignored — and a transcription drifts from its original in
silence.

`bin/curate/check_estimate_visible.py` is what stops that: it RUNS the
generator on the corpus witness and requires every per-value fact the live
record declares to appear verbatim in `gui/tests/componentRecord.test.ts`.
Three sabotages on the engine (drop `origin`, drop `uncertainty`, change
`methodVersion`) each fire their own arm.

### 6.3 A guard whose only case satisfies it

Two more sabotages were run on the reader, and **the first survived**.

Removing the `origin` requirement — so any sub-dict of `provenance` would count
as a per-value block — changed nothing, because every sub-dict in the acetone
fixture happens to declare `origin`.  The test claimed to check the structural
rule and had no case that could fail it: the diafiltration `reason` shape
again, in a different file.

`componentRecord.test.ts` now carries a `validity {}` block beside a real
per-value block — real vocabulary, since `thermo/PairAudit.H` reads exactly
that — and the sabotage fires.  The second reader sabotage (narrowing the
filter so `measured` counts as derived) fires the curated-record arm: an
`estimate` mark on a measured record is the same defect pointing the other way.
