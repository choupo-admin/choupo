# A bubble point is (x, P, T), and the fit now reads all three

*Record of the 2026-08-25 slice.  Engine: `EvidencePartition`,
`FitParameters`, `VaporPressureModel`.  Witness:
`tutorials/steady/optimisation/fitNRTL02_thermoml_isobars`.  Gate:
`bin/curate/check_held_out_pressure.py`.*

---

## 1  What was wrong

`fitParameters(kind T_bubble)` read one scalar, `residual.P`, and priced
every experimental point at it.

A pure-property datum genuinely is two-dimensional — `(T, Psat)`,
`(T, Cp)`.  A binary bubble point is not: it is `(x, P, T)`, and which two
of the three are the independent pair is the experimenter's choice, not
the model's.  So a study that measured three isobars could only be fitted
by discarding two of them.

That is not a small loss.  The temperature dependence of an NRTL pair
lives in `b_ij` and `b_ji` through `tau = a + b/T`, and it is identifiable
only from data that span temperature.  A single isobar of ethanol/water
spans about twelve kelvin, and `fitNRTL01` — which fits exactly that —
reports `identifiable 0`, `max_abs_corr 0.99997` and a condition number of
3.6e11.  It has been saying so, correctly, since it was written.  What it
could not do was use data that would improve the situation.

## 2  What was built

`EvidencePoint` gained an optional third coordinate `z`, a quiet NaN when
the dataset declares none — **not zero**, because zero is a pressure and
NaN is the absence of one, the same distinction `Trange unknown;` draws
for a validity window.  `loadColumns`/`loadAll` gained a defaulted
`zNames` parameter, so the three existing callers (the two pure-property
fits, the isotherm path) are unaffected to the bit; a caller that does not
pass it cannot be reached by this change, which is why it is a default
rather than a second loader.

The reader accepts **both forms a faithful transcription uses**:

* a **column** (`{ name Pressure; unit kPa; }`) where the study varied the
  pressure — ThermoML calls this a Variable;
* a **held-constant scalar** (`Pressure 101.3 kPa;`) where the study fixed
  it — ThermoML calls this a Constraint.

Both say the same thing about any individual measurement, and the reader
must accept both or the two halves of one partition could not be priced
the same way when one study varied the pressure and another fixed it.  A
file declaring the quantity both ways is refused: a column disagreeing
with the constraint above it is a transcription error, and picking one
silently would carry it into the fit.

`computeResiduals` takes a pressure **vector**.  With one scalar `P` that
vector is the scalar repeated and the arithmetic is what it always was —
which is why every legacy case is byte-unchanged.

## 3  The refusals, and what each one is for

The dangerous failure here is never an error.  It is a plausible number.

| declared | refused because |
|---|---|
| `residual.P` **and** evidence carrying its own | Two homes for one fact.  The scalar is what the header prints; the column is what the bubble points are computed at.  A reader could be told 101.325 kPa about a fit performed at 13.15. |
| some fit datasets with a pressure, some without | Half the residual priced at the datasets' own pressure, half at the declared scalar, is two experiments reported as one. |
| fit evidence with a pressure, held-out evidence without | The held-out residual would then measure the difference between two pressures and publish it as a *model error* — the most convincing wrong number this operation can produce. |
| a held-constant with **no unit** | `Pressure 101.3;` is read as canonical SI, i.e. 101.3 Pa.  The fit converges, to a deep vacuum, with no symptom.  The column form cannot make this mistake because its unit sits in the `columns` block, so the scalar form must not be allowed to either. |

The last one is the sabotage worth keeping (S3 in the gate): with the
check removed, the probe case *ran*.  It did not crash, it converged, and
the only trace was an extrapolation warning about ethanol's Antoine
window — because at 101.3 Pa everything is far outside it.  The gate
catches it only because it demands the **named** refusal; accepting any
failure would have been checking that something went wrong rather than
that the right thing did.

## 4  The witness, and the result it was not built expecting

`fitNRTL02_thermoml_isobars` regresses the ethanol/water pair against 45
points on three isobars (13.15, 19.71, 32.86 kPa — Voutsas et al., *Fluid
Phase Equilib.* 2011, doi:10.1016/j.fluid.2011.06.009), and holds out 21
points at 101.3 kPa from a different laboratory (Kamihama et al., *J.
Chem. Eng. Data* 2012, doi:10.1021/je2008704).

The fit converges in 19 iterations to a reduced chi-square of 0.023, an
in-sample rms of 0.144 K.  Then:

|  | vacuum data (13–33 kPa) | atmospheric data (101.3 kPa) |
|---|---|---|
| catalogue pair, unchanged | rms 0.1619 K | aad 0.0821 K |
| pair fitted here | rms 0.1438 K *(in-sample)* | aad 0.3857 K |

**The regression bought 11 % where it looked and lost a factor of 4.7
where it did not.**  All four numbers come from this one run: two
`evaluate`-mode operations score the catalogue pair on both datasets, so
the comparison is symmetric rather than an accusation, and each pair is
visibly at its best where its evidence was taken.

Two things this makes teachable that the engine could not show before:

* **In-sample quality does not transfer.**  A reader who saw `converged
  1`, `chi2_reduced 0.023`, `rms 0.144 K` would ship the new pair.  The
  held-out column is the only thing in the run that says not to, and it
  exists only because the partition was declared before the fit.
* **Conditioning is not identifiability.**  Three isobars span about 28 K
  instead of 12, and `cond(J'J)` falls from 3.6e11 to 5.6e9 — two orders
  of magnitude.  `max|correlation|` is still 1.000 and `identifiable` is
  still 0.  `b_ij = -539 ± 456`, `b_ji = 682 ± 768`: a correlated pair
  that happens to describe the vacuum data, with nothing pinning either
  one, hence nothing constraining what they do at 101 kPa.  The catalogue
  record's declared validity window is 298–373 K; it was fitted where it
  is being asked, and this fit was not.

Nothing was tuned to produce this.  The fit starts from the catalogue
pair, the bounds are `fitNRTL01`'s, and the two datasets were the only
ethanol+water bubble-temperature studies in the mirror that suited the
roles — a structural search over all 1460 archive files carrying that
property, which found exactly 20 such blocks.

## 5  `reviewStatus` on a dataset — a citation is not a check

`docs/design/thermoml-archive-assessment.md` §4 admits point values "cited
to the ORIGINAL article, **checked against it when the paper is in
hand**".  The second half is unmet here: both files were transcribed from
the archive and neither publication has been read.

A file in that state is easy to mistake for a checked one, because it
carries the article's DOI *from the moment it is written*.  It looks fully
sourced.  So the extractor now writes
`provenance { reviewStatus transcribedNotCheckedAgainstArticle; }`, the
partition reads it, and the run announces it on the console **and** raises
it on the `AdvisoryLog` so it reaches the end-of-run caveat block — a line
a thousand lines above the answer has been delivered and not received.

A curator who reads the papers and confirms the numbers edits the field to
`checked`.  Nothing automatic may.

Two smaller provenance fixes rode along.  The extractor's citation used to
live only in the file's **banner comment**, which the parser discards —
the 2026-08-05 shape, *a field the engine cannot see is a comment*; it now
writes a machine-readable `provenance {}` and `system ( )` block beside
it.  And `readOwnProvenance` was extracted so **both** declaration forms
use it: it had sat inside the `evidence ( )` branch, so a legacy
single-`dataset` op announced a fully cited file as one "with no declared
identity" — an announcement about the reader rather than about the
evidence.

## 6  102 identical paragraphs, and the guard that was scoped wrong

Building the witness surfaced a defect one field over from the
2026-08-24 advisory-attribution slice.

`VaporPressureModel::noteRange` announces an out-of-range evaluation once,
latched on `announcedOutside_` — a member of the **model instance**.  An
instance's lifetime is the caller's business, and Levenberg-Marquardt
rebuilds the entire thermo package once per iteration *and* once per
finite-difference perturbation.  So "announce once" became "announce once
per rebuild": **102 identical paragraphs in one run of `fitNRTL02`**, every
one of them about the same temperature.

`AdvisoryLog::add` already returns `false` for a sentence it is holding,
and the log outlives every rebuild — it is the only thing in the process
that can answer *has this been said?*  Gating the console echo on that
return took 102 lines to 2.

The general form is the arity doctrine applied to an announcement rather
than a value: **a guard scoped to an object the caller recreates in a loop
guards nothing.**

*Not widened, and said rather than implied:* the instance latch stays as
the cheap hot-path early-out, so one instance still reports only its FIRST
excursion — an instance that extrapolates a few kelvin past its window and
later goes supercritical announces only the first, two physically
different situations under one report.  That blind spot predates this
change and is not closed by it.

## 7  The gap this slice did NOT close, named

The two caveats `fitNRTL02` still reports — ethanol's Antoine correlation
at 371.8 K and 372.8 K — are `BubblePoint::compute`'s **initial guess**,
the mole-fraction-weighted normal boiling point of the first datum in each
dataset.  Neither is a state the run publishes; the answer at that point
is 335 K.

An `AdvisoryFrame` now wraps the Levenberg-Marquardt search, and it does
not fix this: the parity pass and the held-out pass re-provoke the same
guess with the frame closed, and the promotion rule then correctly moves
the entry to `accepted`.  That is the mechanism working perfectly on a
raise site scoped one level too high.

The fix is a frame *inside* `newton1D`'s T loop plus a re-evaluation at the
converged T, so a genuinely out-of-range answer still announces — which
requires restructuring the per-instance latch, since today it would
suppress the re-announcement.  Recorded in
`docs/design/advisory-attribution.md` §7, stated in the gate's "does NOT
cover" section, and written into the witness's own header.  A visible gap
is strictly better than an invisible falsehood.

## 7b  THE ARITY SIN INVERTED: one key, two meanings

Caught by the full regression, not by any of the five sabotages, and it is
the most instructive failure of the slice.

`curate03_thermoml_fixture_bubble` — an existing, passing case — began
REFUSING with the new "two homes for one fact" message.  The diagnosis was
not what the message implied: its fixtures carry **no `Pressure` column
at all**.  What they carry is a top-level `pressure 101.325 kPa;`, and
that key already had a meaning — `readOwnProvenance` reads it as
DOSSIER METADATA, so a finding can say at what pressure it rests.

My `zNames = {"P", "Pressure", "pressure"}` gave that existing key a
SECOND meaning: a solver input.  The case then looked like it declared
the pressure twice, because after my change it did.

**The arity doctrine is usually about one fact with two homes.  This is
the inversion: one home given two meanings.**  It is harder to see,
because nothing is duplicated — the duplication is created by the reader.
The test to apply before reusing a key: *does this name already answer a
question, and is it the same question I am about to ask it?*

Here it genuinely is the same question — "at what pressure was this
measured?" — so the reader keeps it, and the two consumers (the dossier
and the residual) read ONE home.  What had to go was the case's own
repetition of it, and the remedy is exactly the one the refusal names:
`residual.P` deleted from curate03.  **Nothing numeric moved** — the
scalar was 1.01325 bar and the dataset's is 101.325 kPa, the same 101 325
Pa — and the case passes byte-identical against its unchanged golden.

The alternative considered and REJECTED: dropping lowercase `pressure`
from `zNames` and keeping only `P`/`Pressure`.  That would have left
curate03 untouched with no case edit at all, and it is the wrong fix —
it makes capitalisation carry the difference between metadata and a
solver input, which is a trap laid for the next author rather than a
contract.

## 8  A DEBT THIS SLICE UNCOVERED IN MY OWN WORK: two ThermoML toolchains

Found while checking whether the witness duplicated an existing case — it
does not, but the *tooling* behind it does, and the duplication is mine.

`bin/choupo-thermoml` has existed since **2026-08-11** with five
subcommands: `sync`, `index`, `search`, `extract`, `extract-vle`.  On
**2026-08-25** I built `bin/choupo-import-thermoml`,
`bin/curate/thermoml_locate.py` and `bin/curate/thermoml_extract.py`
without finding it.  Three of the five now have a second implementation:

| existing (2026-08-11) | mine (2026-08-25) | status |
|---|---|---|
| `sync` | `choupo-import-thermoml` | `sync` was written and **deliberately left unimplemented** — it refuses, exit 2, rather than invent a distribution URL and checksum it could not reach behind the proxy.  Mine does exactly what that refusal described, now that the network is reachable.  **Not a duplicate so much as the missing half, built in the wrong place.** |
| `index` + `search` | `citations.jsonl` + `thermoml_locate.py --local` | genuine duplication |
| `extract-vle` | `thermoml_extract.py` | genuine duplication — with a twist, below |

The twist is the interesting part.  `extract-vle` **refuses a
variable-pressure series by name**:

> "the series spans N distinct pressures.  VARIABLE PRESSURE is a
> different geometry; this extractor reads a curve at ONE pressure."

That refusal was correct on the day it was written, because the *fit*
could only take one pressure.  **This slice removes the reason for it.**
So the consolidation is not merely tidying: `extract-vle` should now
accept the geometry it refuses, which is precisely the Voutsas set this
witness is built on.

THE FIX — **EXECUTED the same day**, and it turned out to be more than
tidying.  All three files are deleted; `bin/choupo-thermoml` is the only
ThermoML tool in the tree.  What the fold cost, and what it found:

* **`sync` performs the download it had described and refused to fake.**  It
  fetches the tarball, verifies it against the sha256 NIST publishes in the
  same record, refuses and DELETES on a mismatch, checks every tarball member
  for path traversal before extracting one, and writes the `SYNC.json` stamp
  the index already looked for.  `--index-only` stamps a cache that is
  already unpacked — and it VERIFIES anyway when it can, because otherwise it
  would silently promote a hand-placed cache to "synced"; the index reads what
  the stamp *claims*, not merely that it exists.

* **`extract-vle` reads the geometry it used to refuse**, since this slice
  removed the reason.  Its refusal ("VARIABLE PRESSURE is a different
  geometry") was never about the file: it was about the CONSUMER, which could
  price only one pressure.  A varied pressure now becomes a COLUMN and a held
  one stays a SCALAR — the same Variable/Constraint distinction the reader
  makes, and the two halves have to agree or a faithful transcription could be
  written and not read.

* **The cache moved to `thirdParty/thermoml/`, which is where it always
  belonged.**  `data/local/` is for Choupo RECORDS held privately — and the
  loader RESOLVES that tree by name, so anything there is in the runtime's
  reach by construction.  A 4 GB tree of third-party XML one directory from
  the resolver was a correctness risk, not just a filing error.

* **The GUI reads the one index.**  `index.json` is 70 MB (it keeps CAS,
  InChI and InChIKey so `search` can match any of them); the Literature panel
  needs ~7 MB of citation.  The dev-server middleware PROJECTS it, once,
  in memory.  Writing a second slim file beside it would have been this
  section's own sin again.

* **The online Cordra query survived as `search --online`.**  That half was
  never duplication: `search` needs a 4 GB cache to answer anything, and the
  API needs none — "what does my cache hold?" and "what has anybody
  measured?" are two questions, so they are two flags on one command rather
  than two commands.

TWO PRE-EXISTING DEFECTS FELL OUT OF THE FOLD, both found by pointing the
older tool at a real article for the first time:

1. **A WRONG AXIS LABEL ON RIGHT NUMBERS.**  `system` was emitted in the
   file's `<Compound>` order while `x1` followed the BLOCK's `<Component>`
   order.  They coincide in most files — which is why the fixture never
   caught it — and in `j.fluid.2011.06.009` they do not: the file declares
   water then ethanol, the block declares Components (2, 1), and the mole
   fraction is ethanol's.  The tool wrote `x1 is water` above an x_ethanol
   column, with the data correct underneath.  *A mislabelled axis is a wrong
   answer that nothing downstream can detect.*  The names follow `members`
   now, and a component that cannot be resolved to a name REFUSES rather than
   being guessed.

2. **A MULTI-BLOCK ARTICLE WAS REFUSED ON ITS FIRST BLOCK.**  The loop raised
   at the first `<PureOrMixtureData>` that was not a binary bubble curve, so
   a paper reporting a ternary before its binaries was refused *for the
   ternary* — and its own "no interpretable dataset found" line was dead code
   the loop could never reach.  Every block is examined now and the refusals
   are COLLECTED: exactly one interpretable block is used, several are listed
   by index with a demand for `--block N` (choosing is the curator's act),
   none produces each block's own reason.  Kamihama 2012 goes from an
   unhelpful "declares 1 component(s)" to three named candidates.

3. **An ISOBARIC set was unreachable.**  The reader looked only at ThermoML
   *Variables* and never at *Constraints*, so a study that fixed its pressure
   — the commonest form of VLE there is — was refused with "the declared
   variables are ['composition']", which is true and useless: the pressure
   was three lines away.

AND A STALE CLAIM CLOSED.  Both the tool and its gate said the
published-dialect reader was "unverified until a real archive file has passed
through it".  11 921 of the archive's 11 923 files now parse (the two
refusals are malformed XML *in the archive*, listed with the parse error), so
the by-name matching held against the real thing at scale.  The gate's
blind-spot list was corrected to say it **cannot check** this rather than
that it is **unsettled** — *a gate whose blind-spot list outlives the blind
spot tells the reader something false, with authority.*

## 9  What is pinned, and where

* The four comparison numbers, the condition number, `identifiable`,
  `max_abs_corr` and both held-out AADs (per cent **and** kelvin — two
  operations reporting "AAD" in two units invite exactly the comparison
  the units make wrong) are golden rows in the case's `expected`.
* `check_held_out_pressure.py` recounts the isobars **from the dataset
  file**, not from the log — an auditor that reuses the auditee's
  arithmetic checks nothing — and builds three probe cases the shipped
  witness cannot be, because a guard whose only case satisfies it is a
  guard nothing tests.
* Five sabotages, each with a rebuild, all caught.  The instructive one is
  S1: with `pData_Pa[k]` replaced by `pData_Pa[0]`, the header went on
  printing `across 3 isobars` **truthfully**, because the span is computed
  from the loaded points while the pressure is used in the residual.  An
  announcement can stay true while the arithmetic beneath it stops being
  described by it.
