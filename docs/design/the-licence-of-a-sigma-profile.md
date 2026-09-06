# The licence of a sigma profile

*Recorded 2026-09-06 (task #94).  Kind: ADR.  Status: SHIPPED — no value
moves, no golden moves; what shipped is two corrected memories, one rule,
and two gate arms.  Engine: `src/thermo/activityCoefficient/CosmoSac.H`
(comment only).  Gate: `bin/curate/check_cosmo_scrub.py`, arms (v) and (i).
Predecessor: the 2026-07-26 COSMO / VT-2005 licence separation
(`CLAUDE.md` §5), which this record confirms rather than reopens.*

---

## 1  The question

Vítor, 2026-09-06: *"se for legal, inclui os parâmetros COSMO-SAC na base
standard"* — if it is legal, include the COSMO-SAC parameters in the standard
base.  The parameters in question are the per-component sigma profiles the
2002 constants were fitted against, which every catalogue record names as
its `VT2005` set and none carries.  So the question is a licence question
about one dataset, and the answer had to come from the dataset's own texts,
not from what this repository remembered about them.

## 2  The three primary texts, read 2026-09-06

Quoted, not paraphrased.  A paraphrase of a licence is a second home for it.

**(1) usnistgov/COSMOSAC, `README.md` on `master`**
(https://github.com/usnistgov/COSMOSAC).  The code is MIT / "not subject to
copyright in the USA".  On the data:

> "The .cosmo files in the folders profiles/UD and profiles/VT2005 are
> covered by less permissive licenses, for which the respective README file
> should be consulted.  Permission from BioVia was obtained to make the
> .cosmo files available for academic, non-commercial use.  For all other
> use, please contact ian.bell@nist.gov for more information."

The `profiles/VT2005` folder holds 1432 `Sigma_Profiles_v2/VT2005-NNNN-PROF.txt`
files, `Sigma_Profile_Database_Index_v2.txt` and `COSMO-SAC-VT-2005_v2.F90`
— and **no README or licence file of its own**.  The "respective README"
the top-level text points at does not exist for VT2005; the only statement
that reaches those files is the sentence above.

**(2) usnistgov/COSMOSAC, `profiles/UD/Readme.txt`**:

> "This database can be freely used for non-profit, academic purposes.
> Re-distribution of the database without the concent of the authors is
> prohibited." *(sic)*

**(3) The original Virginia Tech page**, Internet Archive snapshot
https://web.archive.org/web/20190701184554/https://www.design.che.vt.edu/VT-Databases.html.
It offers "VT-2005 Sigma Profile Database Files" for download under the
heading *"Open Literature Resources — To download: Right-click link and Save
Target As"*, and contains **no licence, copyright, permission or
redistribution statement anywhere on the page**.

## 3  The verdict

`CLAUDE.md` §10 excludes two classes regardless of copyleft: **NonCommercial**
and **no-grant / all-rights-reserved**.  Both apply here, one to each route:

* Through NIST, the VT-2005 files come with an explicit permission, and that
  permission is *academic, non-commercial* — the CC-BY-NC class, excluded
  because Choupo is free for commercial use under the GPL and will not ship
  data its own users may not use.
* Direct from Virginia Tech, the files come with **nothing**.  A page heading
  that says "Open Literature Resources" is a heading; a download link is a
  download link.  Neither is a grant.  **A dataset with no licence statement
  is no-grant**, in the same class as a table in a copyrighted book, and
  silence is not permission.
* UD is out by its own words: redistribution prohibited without consent.

So the VT-2005 values **stay out of `data/standards/`**, the 2026-07-26
separation stands unchanged (every catalogue set an external reference,
`licence externalRestricted; installed false;`, the user's own copy via
`bin/choupo-import-cosmo` into `data/local/cosmo/`, the model refusing by
name without it), and the witness `cosmoSAC01` keeps running on SYNTHETIC
surrogates.

**Rejected alternatives, each with its reason:**

| alternative | why not |
|---|---|
| Read "Open Literature Resources" as an open licence | it is a heading on a page with no rights statement; a court would not read it as a grant and neither may a curator |
| Ship the values "for academic use" with a notice | the NonCommercial exclusion exists precisely so that no user of a GPL tool has to ask whether their use is academic |
| Ship LVPP profiles instead, under the existing `variant "2002"` label | legal, and thermodynamically wrong — §4 |
| Cite the values through NIST as an aggregator route (`via`) | the `via` rule rescues a *primary* read through an aggregator; here the restriction is the primary's own, and NIST's text names it |

## 4  The LVPP position: legal yes, thermodynamic no

LVPP (https://github.com/lvpp/sigma) is MIT, Copyright (c) 2017 LVPP — a
clean licence, and the tree already carries a derivation tool for it
(`bin/curate/lvpp_sigma_profile.py`).  But `data/tmp/COSMO_VALIDATION_STUDY.md`
(2026-07-24) measured what happens when an LVPP profile is run under the
2002 constants that were fitted to VT-2005 profiles: a different QM protocol
(NWChem B3LYP/def2-SVPD, SES cavity, +6 % area / +10 % volume on ethylene),
profiles 170× to 580× further from VT-2005 than the control, and the
activity coefficient of water at infinite dilution in acetone moving from
4.69 to 0.97 — **the sign of G^E flips**.  The study's own conclusion: an
LVPP set is generatable *"but must not be labelled `variant "2002"`"*.

A native LVPP variant is therefore a NEW `ActivityModel` with its own
constants, and it is **reserved for Vítor (task #95)**.  Nothing here builds
it, and nothing here reads LVPP data.

## 5  The two corrupted memories, found and fixed

Both were read back as true by the session that opened this task, which is
what a corrupted memory does.

1. **`src/thermo/activityCoefficient/CosmoSac.H`** said the sigma profiles
   come from *"the LVPP open database, github.com/lvpp/sigma, MIT + citation"*
   and that there is *"ONE parameter source (LVPP == the NIST benchmark
   data)"*.  Both false: no record in the tree names an LVPP set, every one
   names `VT2005`, and the study proves LVPP ≠ VT-2005.  The header now
   states what the tree does, keeps the never-mix-variants sentence, and
   says why the variant guard is load-bearing.
2. **`CLAUDE.md`**, the COSMO-SAC paragraph in §6, called the `VT2005` set
   *"US-gov public domain via the NIST bundle"*.  The NIST bundle's own
   README says the opposite.  The sentence is corrected in place, with the
   old wording quoted so a reader who remembers it can see it was replaced,
   and the same paragraph's "reference code … public domain" now says the
   CODE is MIT and the profile folders are not.  A short §6 paragraph
   carries the rule.

Where the "public domain" claim came from is not recoverable; it was
plausibly a conflation of the code's status with the data's, which the NIST
README separates in one sentence.  The lesson is the one `CLAUDE.md` §10
already carries: *a licence decision recorded anywhere but the gate is a
sentence, not a contract* — and a licence FACT recorded from memory is a
sentence that may be false.

## 6  The gate arms

The study's finding makes the variant label load-bearing: `CosmoSac.cpp`
reads `variant "2002"` and nothing else before pairing a profile with the
2002 constants, so a foreign profile carrying that label runs to a silently
wrong gamma at exit 0.  `check_cosmo_scrub` gains two arms over
`data/standards/components/*.dat` and the sealed mirrors under
`tutorials/**/constant/components/*.dat`:

* **(v)** a leaf set declaring `variant "2002"` REFUSES when its `source`
  names a foreign database (LVPP, CHAOS, the UD folder), and REFUSES when it
  names neither the VT-2005 database nor a SYNTHETIC surrogate.
* **(i)** `installed true;` on any VT2005 set in the public tree REFUSES —
  values follow an installed set.

Sabotaged by hand on temporary edits, reverted before any suite run; the
observed lines are in the gate's docstring.  **The first draft's arms ran on
nothing**: the gate's block regex is non-overlapping, so the enclosing
`cosmo {}` consumes every leaf and a leaf never matches on its own; the
draft skipped bodies containing a brace and S3 came back OK.  The leaves are
re-extracted from the enclosing body now.  S1b is the load-bearing sabotage:
an LVPP source carrying an open word (CC-BY) satisfies the older
open-licence arm, and only arm (v) refuses it.

**What the arms cannot see, said plainly:** a `source` string that lies —
LVPP numbers under a sentence naming VT-2005.  No text gate can catch that;
the importer reading the dataset's own file layout, or a human comparison,
can.

## 7  The human remedy

What would change the verdict is a **written open-licence grant** for the
VT-2005 database from its authors — Y. A. Liu's group at Virginia Tech — or
a written statement from Ian Bell (NIST) that the permission obtained from
BioVia extends to redistribution under an open licence.  Either is a
document a human obtains and commits; `check_source_licence` could then cite
it by path.  Until then the values stay out, and no gate here can make the
decision on the tree's behalf.

## 8  What was NOT done

* **No value was added** to `data/standards/`; no golden moved; no number in
  any record moved.
* **No LVPP variant** was built (reserved, task #95), and
  `bin/curate/lvpp_sigma_profile.py` was **not changed**: it still emits an
  `LVPP_v25 { variant "2002"; … installed true; }` block, which is exactly
  the label the study says must not be used.  Its output is a fragment the
  user pastes, never a file the tool writes, and arm (v) refuses that block
  the moment it lands in the public tree — but the tool writing the wrong
  label is a finding, recorded here for Vítor rather than fixed on a
  builder's judgement.
* **`data/tmp/` is TRACKED** (436 files) although the study's own header
  calls it gitignored.  The `evidence/lvpp-*` records carry cavity area and
  volume only, no sigma-profile lists.  But
  `data/tmp/_sources/cosmo_tools/profiles/*.csv` (16 files) carry a
  `psigmaA_VT2005_A2` column with non-zero VT-2005 sigma-profile values for
  15 compounds, read on 2026-07-24 from the then-shipped `VT2005` sets, and
  `data/tmp/_sources/nist_cosmosac_ref/` holds the VT-2005 ethanol
  `.cosmo`/`.sigma` pair (DMol3) that `validate_panel.py` labels
  *"(DMol3, VT-2005 source)"*.  `check_cosmo_scrub` scans `data/standards`
  and `tutorials` for `.dat` records and cannot see these.  **Nothing was
  deleted** — whether they leave the tree, and whether `data/tmp/` becomes
  gitignored as its documents claim, is Vítor's call, reported not decided.

  **SETTLED THE SAME DAY, on the evidence rather than on the label.**  Vítor
  read the first framing and pushed back — *"não sejas mais papista que o
  DWSIM"* — and he was right, so the two halves were separated and each
  decided on what it IS.

  * The **16 CSVs** stay.  A sigma profile is a computed physical fact, not
    expression; what a compilation can protect is its selection and
    arrangement, and in the EU the sui generis right reaches an extraction of
    a SUBSTANTIAL part.  Fifteen of 1432 is 1 %, printed column by column
    beside the LVPP values inside a study whose whole purpose is to show the
    two are incompatible.  That is scientific quotation, and deleting it
    would destroy the evidence for a ruling this project relies on.
  * The **NIST `.cosmo`/`.sigma` pair** also stays, and this REVERSES the
    morning's recommendation to remove it.  Reading what the file DOES
    settled it: the `.cosmo` is the INPUT and the `.sigma` the golden OUTPUT
    of `sigma_profile.py --selftest`, the only independent check that tool
    has.  Removing it takes no value out of any Choupo record — no number in
    either file reaches a `.dat`, a case or the runtime — and it would leave
    a check that cannot run, which this project's doctrine forbids.  What was
    wrong was the SILENCE, not the retention: the directory now carries a
    `README.md` quoting NIST's restriction verbatim, saying this is a narrow
    exception rather than the rule, and naming the remedy if the reading is
    ever judged too generous — delete the pair AND make the selftest refuse
    by name, never the quiet third option where the files go and the check
    stops checking.
  * The **`data/tmp/` tracking** is a documentation defect, not a licence
    one, and is FIXED: the study's header called the tier gitignored while
    `.gitignore` carries no rule for it and git tracks 436 files.  The header
    now says the tree is public and points at the licence note.

  **The durable rule, which is what the episode was about:** a licence
  decision needs an EXTENT, not only a name.  "VT-2005 is no-grant" is not
  applicable — it led to a proposal to rewrite 1187 commits over fifteen
  rows.  "Choupo does not redistribute the VT-2005 database as a data
  product; values quoted in a study for comparison are quotation, and one
  reference pair used to verify a tool against the implementation that
  produced it is a test fixture" is a rule a human can apply and a gate can
  encode.
* Two guide sentences were left as found because a `.tex` edit requires a
  PDF rebuild committed beside it (`check_guide_pdf_fresh`) and this slice
  touched no guide: `docs/propsGuide.tex` ("The standard catalogue ships
  VT2005 sets for 77 components" — true of the references, misleading about
  the values) and `docs/tutorialsGuide-props.tex` (the cosmoSAC01 `\tutwhat`
  line says "VT-2005 profiles" where the witness runs on SYNTHETIC
  surrogates).  Both are named here so the next guide rebuild settles them.
* `docs/architecture/archive/2608-handoff.md` repeated the "US-gov public
  domain" claim; being an archived snapshot it keeps its text and gains a
  dated correction note pointing here.
