# The delegated INTERIM review — 2026-08-24

**Commissioned by Vítor** ("Podes ser tu a rever com os teus generais?"), same
day the primary PDF of Edwards (1978) entered the session.  Method: three
INDEPENDENT reviewers, each blind-protocolled (transcribe the source first,
open the records second), their findings AUDITED against the primary page or
the cited distribution before anything landed — the auditor rule applies to
reviewers too.  **Promotion is not claimed here**: this dossier is the
review; removing an INTERIM mark stays the owner's word on top of it.

## Reviewer 1 — the 33 EdwardsPitzer records vs the paper

Every numeric parameter, every vInfinity point, every Henry and
molecule-ion Trange: **exact agreement** with an independent transcription
of Tables 2–6, the two tabulated zeros (CO2–HS⁻, H2S–HS⁻) and Table 5's
HS⁻ 0.074 included.  The absent `ion-S.dat` is the documented deferral
(no species/S, first dissociation only), not a gap.

**One real finding, audited against p. 969 and CORRECTED (fc51a391e):**
`NH3aq.dat` and `H2Saq.dat` declared their Eq 14 window as 0–170 °C "the
paper's stated correlation range"; the paper ties Eq 14 to "the same
temperature range as that used for Henry's constants" and Table 3 gives
both as 0–150 °C — the 0–170 is Figure 4's plotted span.  Both windows
narrowed to 423.15 K; the three sealed Edwards cases (the review's own
subject) resealed, agree-checks green, zero numbers moved.  Direction of
the error: WIDER than the source — the direction that silences an
extrapolation announcement.

## Reviewer 2 — the derived arithmetic, recomputed from scratch

All analytic conversions in the edwards02/03 case-local chemistry
(Table 1 rows → PHREEQC form, the Eq 20 carbamate with water as product,
the mass-action directions, the nuWater signs): **exact to stored
precision** (coefficient diffs ≤ 5e-6, logK25 diffs ≤ 4e-5 — last-digit
rounding).  The Edwards-vs-PHREEQC gaps the headers quote (0.008–0.009 in
logK25) reproduce as written.  One sub-threshold flag resolved on audit:
three "engine-printed" β⁰ values in the briefing were the session's own
hand arithmetic, not the engine's print — the stored records are exact;
the defect was in the briefing.

## Reviewer 3 — species and components outside the Edwards set

* **species/CO2aq.dat** — hfAq −413 800 / sAq 117.6: two independent open
  secondaries agree exactly (one is the cal→J conversion of NBS's own
  −98.90 kcal/mol); the NBS primary itself (public domain, srd.nist.gov)
  is blocked by THIS sandbox's proxy, not by any paywall.  Verdict:
  CONSISTENT-UNVERIFIED — one sitting with the NIST PDF converts it to
  VERIFIED.  MW verified by arithmetic.
* **The 11 Millero V0 blocks** — H⁺ definitional; Na⁺ verified against an
  open derivation of exactly Millero's convention (16.61 − 17.82 = −1.21);
  Cl⁻ within 0.01 of the open copy; the other eight PLAUSIBLE, mutually
  coherent, primary (ACS, paywalled) unreachable — the batch primary
  review their source lines promise remains the only path to VERIFIED.
  HCO3⁻ keeps its own "review first" flag.
* **The 13 Antoine blocks** — ALL VERIFIED against the cited MIT-licensed
  `chemicals` 1.5.2 distribution (wheel downloaded and diffed): 9 exact
  Poling matches, 1 exact Landolt ln→log10 conversion, 3 curation fits
  reproduced at their claimed deviations (0.05 %, 0.05 %, 2.4 %); every
  record's Psat(Tb) lands within 0.14 K of its own declared Tb.  What
  stays INTERIM is the UPSTREAM question (Poling/Perry/Landolt as the
  primaries), which the marks correctly describe.  Two nits corrected
  after this audit re-verified them against the wheel:
  - HCHO's header said "Wagner-25 curve"; the fit target is the
    Wagner-ORIGINAL (3-6) form of McGarry 1983 (reproduced at 0.050 %
    against that form, 17 % against the 2.5-5 form — decisive).  The
    word fixed, no number touched.
  - Six Trange windows rounded up to ~0.5 K OUTSIDE the source fit range
    (Cl2, N2, N2O, NO, ethylAcetate, propylene) — clamped to the source's
    exact endpoints.  The same error class as the Edwards windows, three
    orders of magnitude smaller.
* **aceticAcid-dissolution.dat** — the Henry derivation arithmetic is
  exact from its own quoted inputs; the vapour-dimer ΔH carries a PINNED
  TENSION, not a change: an open secondary quoting the same primary
  (Chao & Zwolinski 1978) implies ΔH_dim = −63.8 kJ/mol against the
  stored −58.5.  Snippet-level evidence only; the record's own
  `primarySourceRecheck` is where this gets settled.  DO NOT adjust the
  value on this dossier's authority.

## Round 2 — the primary in hand: Poling 5e, Appendix A (same evening)

Vítor supplied the book's Appendix A, so the UPSTREAM question the 13
Antoine marks describe was put to the source itself.  The book's Section D
states Antoine in the °C form (log10 P/bar = A − B/(t + C)); the records
use kelvin, so C_record = C_book − 273.15 — the conversion was verified
component by component rather than assumed.

**Eleven records cite Poling; NINE reproduce the primary exactly** —
coefficients to the last digit and windows inside the book's stated fit
range: Ar, Cl2, H2S, HCl, N2, N2O, NO, ethylAcetate, propylene.  (Six of
those nine are the windows clamped earlier the same day from the cited
distribution; the book confirms every clamp.)

**methylAcetate — CORRECTED.**  Coefficients exactly the book's, but the
declared window read `(260 380)` where the fit runs **249.90–351.11 K**:
the upper end 29 K beyond the correlation.  The same error class as the
two Edwards windows and the six clamps, and the largest of them — the
reactive-distillation case was telling its reader it extrapolated
**0.9 K** when the true excursion is **30 K**.  Window set to the source's
own range; the three sealed cases that mirror the record resealed
(agree-checks green, no golden moved, the announcements now honest).

**ethanol — a FINDING, deliberately not a correction.**  Its Antoine set
is NOT the book's (ours 5.37229 / 1670.409 / −40.191; Poling 5.33675 /
1648.220 / −42.232), and the record already says so in its own words:
*"individual literature values — primary re-citation pending"*.  The
difference was measured before deciding: **0.11–0.18 %** across 298–369 K,
and the SHIPPED set reproduces the normal boiling point BETTER than the
book's (1.01274 vs 1.01460 bar at 351.44 K, against 1.01325 actual).
Switching would move ethanol numbers across the corpus in exchange for
nothing demonstrable, so the values stand and the pending re-citation
stays pending — with the fact now recorded that Poling cannot close it,
because these are a different fit.

## Round 3 — the NBS primary page, read (same evening)

Vítor supplied page **2-83** of the NBS Tables (Table 23:C, CARBON,
J. Phys. Chem. Ref. Data 11, Suppl. 2, 1982) — the `ao` (aqueous) rows.
It settles more than it was asked to:

| species | page 2-83 | our record | verdict |
|---|---|---|---|
| CO2 ao | ΔfH −413.80 kJ/mol, S° 117.6 J/mol/K | −413800 J/mol, 117.6 | **exact** |
| HCO3⁻ ao | ΔfH −691.99, S° 91.2 | −691990, 91.2 | **exact** |
| CO3²⁻ ao | ΔfH −677.14, S° −56.9 | −677140, −56.9 | **exact** |

* **`species/CO2aq.dat` is PROMOTED.**  Its INTERIM mark sat exactly on
  this datum, the primary page has now been READ rather than transcribed
  at second hand, and both values agree to the digit.
* **A second finding, unasked for:** `HCO3` and `CO3` carried **no
  citation of their own** on `hfAq`/`sAq`.  They passed
  `check_species_citation` because the Criss–Cobble source of the
  neighbouring Cp block satisfied its search — the same shape that gate's
  own docstring records for a `volumetric` block, one field over.  The
  page verifies both values exactly, so the citation is now theirs.  The
  gate's blind spot (a block-level source vouching for a neighbour) is
  NAMED here, not patched: widening it is a gate change, and this
  session did not make one on its own initiative.
* **MW is NOT from this table.**  NBS 1982 lists 44.0100 on its own era's
  atomic weights — that very page prints C = 12.0112 — while the record's
  44.0095 is the modern IUPAC sum.  Both are right for their era; the
  record now says so, so nobody "corrects" one into the other.

Still open after round 3: the eleven Millero V0 blocks (paywalled
primary), the acetic vapour-dimer ΔH tension (Chao & Zwolinski), and the
upstream question on the three non-Poling Antoine records.

## Round 4 — Millero's own Table III, read (same evening)

Vítor supplied the paper.  Table III, *Conventional Partial Molal Volumes
of Ions in Water at 0, 25 and 50 °C*, p. 162, 25 °C block — read from the
page image, because the text extraction had dropped one column's labels
and a mangled column is exactly how a wrong number gets promoted.

**TEN of the eleven are EXACT**: H⁺ 0.00, Na⁺ −1.21, K⁺ 9.02, NH4⁺ 17.86,
Mg²⁺ −21.17, Ca²⁺ −17.85, Cl⁻ 17.83, OH⁻ −4.04, NO3⁻ 29.00, SO4²⁻ 13.98.

**The eleventh is WRONG — and it is the one the record itself flagged.**
`HCO3.dat` carried `V0 24.29` under its own note *"lower transcription
confidence than the majors — review first"*.  Millero gives **23.4**, and
to ONE decimal, not two: the stored value has a precision the source does
not offer, which is a second sign it did not come from this table.
Corrected.  The honest self-flag was right, and it was right about
exactly one of eleven.

The Millero blocks are **PROMOTED** (all eleven `reviewStatus interim`
marks lifted, the citation now naming the table, the page and the fact
that Millero states the table is itself taken from the compilation of his
ref 81 — a primary for THIS convention, not for the underlying
measurements).

**Exposure of the correction, measured rather than assumed:** no corpus
case declares a `densityMethod`, so the V0-consuming density route is not
exercised anywhere today — the eleven values are curated data that
nothing currently reads.  33 sealed mirrors still carry `24.29`; they
pick the correction up at their next natural reseal, and the exposure
until then is zero.

### What this round cost, recorded because it is the session's own error

The three citations added in round 3 were written with **nested double
quotes** (`row "CO2 ao"`), which the dict parser cannot take.  All three
standards records were left unparseable, and `check_species_citation`,
the four cases tested by hand and every sealed case passed anyway —
because sealed cases read their own mirrors, not the catalogue.  The
break was caught by `overlay01_nacl_ksp`, the ONE corpus case that reads
the standards catalogue LIVE, and it was caught by the FULL SUITE, not by
the targeted gates run before committing.  Two lessons, both already the
project's own doctrine and both ignored here: a targeted gate run is not
a suite, and the tree must not be edited while a suite is in flight.

## Round 5 — Chao & Zwolinski read, and the citation does not survive it

The record's own `vapourDimerisation` block asked for this: *"INTERIM:
primary re-check pending"*.  The re-check was done, and **it does not
confirm the numbers**.

| quantity | stored | Chao & Zwolinski (1978) |
|---|---|---|
| ΔH_dim (298.15 K) | −58.5 kJ/mol | **−63.18** kJ/mol — Table 14, "Derived from calculation / This work", 15.10 kcal/mol |
| log K_dim (298.15 K) | 3.146 | **2.555** — from the paper's own formation properties (see below) |

The second row is derived twice and agrees with itself: the paper's
tabulated log Kf (dimer 125.543, monomer 61.494) differ by 2.555, and its
ΔfG values (−716.59, −351.00) give ΔG_dim = −14.59 kJ/mol → log K = 2.556.
Its ΔfH values (−820.94, −378.57) give ΔH_dim = −63.80 kJ/mol, 0.6 kJ from
the paper's own Table 14 figure — the rounding of two-decimal kJ against
two-decimal kcal.

**The values were LEFT UNTOUCHED and the CITATION was corrected.**  That is
the only honest move available: the block is read by the engine
(`IsothermalFlash`, `ReactiveVLE`) and carried by **35 cases**, so changing
it moves the acetic vapour association across the corpus — the owner's
call, not a reviewer's.  What was fixed is the false attribution: the
record claimed a primary that does not carry its numbers, and *an unsourced
value is strictly better than a falsely sourced one* (the doctrine's own
words).  `source` now reads PROVENANCE UNRESOLVED and states what the paper
actually says; a `provenance { source unknown; }` block and
`primarySourceRecheck done2026-08-24-disagrees` make it machine-visible.

**In fairness to the stored number:** −58.5 kJ/mol = 13.98 kcal/mol is NOT
an outlier.  The same Table 14 tabulates ten studies spanning 11.4 to
17.0 kcal/mol, and values of 13.8, 14.5, 14.6 and 14.8 sit around it.  It
is simply not the paper's own recommendation, and this record said it was.

**DECIDED AND EXECUTED the same evening (Vítor):** the paper's own pair is
adopted — ΔH_dim = −63.18 kJ/mol, log K25 = 2.555 — so the record and its
citation now say the same thing.

**What it moved, measured by the goldens' own diff rather than asserted:**

| quantity | before | after | move |
|---|---|---|---|
| p_dimer (atm) | 5.711e-4 / 7.091e-4 | 1.067e-4 / 1.610e-4 | **−81 % / −77 %** |
| dimer share of vapour | 0.1102 / 0.1213 | 0.0226 / 0.0276 | **−79 % / −77 %** |
| p_monomer (atm) | 5.138e-3 | 5.664e-3 | +10.2 % |
| pH, flows, duties | — | — | ≤ 0.9 % |
| all 29 compared values | — | — | **median 0.083 %** |

The parameter governs the dimer, and it moved the dimer by ~80 % while the
rest of the answer barely felt it — which is what a correctly-scoped
constant should do.

**Of the 35 cases that mirror the record, only 5 actually move** — the
acetic-acid VLE cases (flash10, flash11, flash12, flash13, flash17).  The
other 30 carry the record without their answers depending on it, and
resealed unchanged.

**The importer refused the five, and was RIGHT to.**  `choupo-import`
validates that a seal never changes physics; here the physics changed by
intent, so the check fired.  There is no bypass flag and there should not
be: the order it demands is mirror → re-record → reseal, and the seal's
agree-check then passes on the new answer.  A deliberate curation change
has to be visible as a golden diff, and this one is.

## The 78 sealed mirrors

78 sealed cases mirror the six clamped Antoine windows at their old
values.  They are deliberately NOT resealed: a seal is the photograph of
the data the case ran with — that is its contract — and a ≤0.5 K validity
sliver moves no number in any of them.  Each picks up the correction at
its next natural reseal.  (The three Edwards cases WERE resealed: they
are the review's own subject.)

## What promotion would mean, per group

| group | review outcome | promotion decision |
|---|---|---|
| 33 EdwardsPitzer + 8 case-local chemistry | verified against the primary in hand, twice over | **PROMOTED 2026-08-24** on the owner's delegation ("Avança como achares melhor e de acordo com a filosofia de Gall") — the 8 case-local source strings now cite this dossier instead of "INTERIM pending"; both cases resealed, goldens intact.  The 33 standards records never carried a parsed mark; this dossier and the commit record are their review record. |
| species/CO2aq.dat | **primary page 2-83 READ 2026-08-24; both values exact** | **PROMOTED** — and the same page gave HCO3⁻ and CO3²⁻ the citation their own numbers lacked |
| 13 Antoine blocks | transcription fully verified vs the cited distribution | KEPT INTERIM — the marks describe the UPSTREAM question (Poling/Perry/Landolt as primaries), and that question is still true |
| 11 Millero V0 | **primary Table III READ 2026-08-24: ten exact, one wrong** | **PROMOTED** — and `HCO3⁻` corrected 24.29 → 23.4, which is precisely the one its own record flagged for review |
| acetic dimer ΔH | **primary READ 2026-08-24: the stored pair is NOT the paper's** | **CITATION CORRECTED, values untouched** — adopting the paper's numbers moves physics in 35 cases and is the architect's call (round 5) |

The promotion boundary IS the Gall reading of the delegation: claim exactly
what was verified, keep every mark that still tells the truth.
