# Binary pairs from open measurements

**Status: FIRST PATH BUILT 2026-09-28; SLICE 2 2026-10-05 (section 6) (DEV.md C16); THE PIPELINE AND ITS PILOT 2026-11-10 (section 8, DEV.md C282).**  Vítor asked for wider
binary-interaction coverage from free, open sources, keeping provenance,
commercial use and redistribution.  Two routes were named: import tables
already published under compatible terms, and fit new parameters to the
NIST/TRC ThermoML Archive.  This record is the licence determination for
both, the chain that was built, what it produced, and what it found on the
way.  Nothing here was promoted to `reviewed`: that is Vítor's.  Since C282
(section 8) a pair may also be promoted AUTOMATICALLY, as `reviewStatus
autoPromoted; humanReviewed false;`, which the engine voices on every run.

---

## 1. Route 1 -- importing published tables: the licences, read

### 1.1 ChemSep's interaction-parameter tables (`.ipd`)

Read 2026-09-28 from ChemSep LITE 8.50 as distributed at www.chemsep.org
(`lite.zip`, sha256 `69640c709f51ef89341ff1596b4fea4a37d9de774f4fac041934c0413958573c`;
the HTTPS host refused the session's TLS proxy, the plain-HTTP host served
the same pages).  The licence that ships with the software,
`help/chemsep.lic`, says:

> "Use of the ChemSep Pure Component Property Databank (and ONLY the
> ChemSep Pure Component Property Databank) is governed by the Artistic
> License of the Perl Foundation."

> "Sublicense of SOFTWARE to another party is not permitted."

and the tables name their own origin in their headers: `nrtl.ipd` "DECHEMA
NRTL at P=1atm", `uniquac.ipd` "DECHEMA UNIQUAC at P=1atm" (`wilson.ipd`
"Original compilation by Andrew Mason", no source stated).

**Verdict: EXCLUDED from the public tree; LOCAL ONLY.**  The Artistic grant
does not reach the tables, sublicensing is forbidden, and DECHEMA
transcription is on the curation protocol's NEVER list in any case.  A user
may stage their own install's tables privately:
`bin/curate/chemsep_to_choupo.py` does, and the runtime announces each such
pair `[local] UNVERIFIED`.

The tree said otherwise in three places, all corrected here:
`thirdParty/README.md` listed "ChemSep pure-component databank + binary
pairs | Artistic-2.0", the ChemSep card's NOTICE said Choupo uses "component
properties + binary interaction parameters" under Artistic-2.0, and the
importer stamped every staged PAIR `license "Artistic-2.0"`.

### 1.2 The `thermo` Python package (Caleb Bell)

Read 2026-09-28 at version 0.6.1 (PyPI sdist, sha256
`35ad523c54d54d91d8aaf8be0c68a628fb17cfae76fffe02d8e543facbef9e18`).  The code
is MIT-licensed.  `thermo/interaction_parameters.py` states "Only two data
sets are currently included, both from ChemSep", and
`thermo/Interaction Parameters/ChemSep/nrtl.ipd` is **byte-identical** to
ChemSep LITE 8.50's `ipd/nrtl.ipd` (checked with `cmp`), DECHEMA header and
all.  An `Artistic_license_2_0.txt` sits beside it -- the licence of the
pure-component databank, which does not extend to the pairs.

**Verdict: EXCLUDED -- the same tables, reached through a permissive
intermediary.**  Bell's MIT grant covers Bell's code; it cannot relicense
ChemSep's tables or DECHEMA's values.  This is the provenance laundering
CLAUDE.md section 10 names.  Two further facts, each a reason on its own not
to take a value from this API:

- `IPDB.get_ip_specific` returns `metadata["missing"][ip]` for a pair it
  does not hold -- `{"bij": 0, "alphaij": 0.3}` for the NRTL table -- so an
  absent pair comes back as a number indistinguishable from a measured zero.
- `nrtl.ipd` carries some pairs twice (methanol/tetrachloromethane, DECHEMA
  pages 18 and 279, alpha 0.2892 and 0.4622); `nrtl.json` keeps one of them
  for both directions, a selection made without a word.

### 1.3 Enforcement

`bin/curate/check_source_licence.py` gained `EXCLUDED_TABLES`: a record under
`data/standards/` that names a ChemSep `.ipd`, "ChemSep NRTL/UNIQUAC/Wilson",
`IPDB` or the package's `Interaction Parameters/ChemSep` folder as the
source of a value is refused; a mention after a cross-check word is not.  The arm runs
BEFORE the accepted-databank arm, and that order is the point: the old gate
accepted any "ChemSep" in an authority field under the pure-component
databank's licence, so `citation "ChemSep NRTL table"` -- a DECHEMA-derived
pair -- would have passed.  Card: `thirdParty/thermo-ipdb/README.md`.

### 1.4 The local route did not work, and now does

`chemsep_to_choupo.py` staged pairs into `data/local/binaryPairs/`, a
directory no loader reads since Migration 2 renamed the home to
`parameters/` on 2026-07-16 -- a local import the runtime could not reach.
It writes `data/local/parameters/` now.  Verified end to end against the
LITE 8.50 tables: 758 pairs staged, `audit_chemsep_pairs.py` 758/758 PASS,
and a scratch run resolved the staged acetone-methanol pair from the local
tier with the `[local] UNVERIFIED` announcement.  Nothing of it is committed.

## 2. Route 2 -- regressing pairs to ThermoML measurements

### 2.1 The archive and its terms

Version: `ThermoML.v2020-09-30.tgz`, the only data file of NIST record
ark:/88434/mds2-2422 (record version 1.2.6), sha256-verified by
`choupo-thermoml sync`.  No later archive exists: the release history ends
at that tarball, and the archive's search API returns 834 publications for
2019 and none for 2020-2025 (queried 2026-09-28).  Terms re-read the same
day: the NIST licence page still grants non-SRD data under 17 U.S.C. 105 and
disclaims third-party rights; the TRC page still says the files are
"available with permission of the journal publishers".  The assessment of
2026-08-25 (`thermoml-archive-assessment.md`) stands: the archive LOCATES,
the article SOURCES, bulk import is reserved.  NIST's statement that the
transcription was verified is not a critical evaluation of the experiments,
which is why every series is held out against another laboratory.

**What the tree now carries from it:** ten series (13-54 points each) in five
cases, each citing its ARTICLE, each marked `reviewStatus
transcribedNotCheckedAgainstArticle` (announced on every run).  The fitted
parameters are Choupo's own work.  Whether the raw archive files may be
redistributed stays unanswered and irrelevant: nothing of the archive
itself is in the tree.

### 2.2 The chain

    choupo-thermoml sync          download + verify the tarball
    choupo-thermoml identity      CAS -> InChIKey bridge (two resolvers agree)
    choupo-thermoml vle-index     every binary VLE block, searchable
    choupo-thermoml vle-search    by component / CAS / InChIKey / geometry / P
    choupo-thermoml extract-vle   one block -> one dataset file
    choupoProps (the case)        fitParameters -> proposal record
    promotion                     proposal -> catalogue record (+ review fields)
    choupo-import                 the case seals a copy of the record

Python prepares the data; the engine and the cases read only the files it
wrote, and no network.

**Identity is joined by identifier, never by name.**  The archive carries no
CAS number at all (0 of 58 276 binary blocks); it carries standard InChI and
InChIKey.  The catalogue carries CAS and no InChIKey.  `identity` asks
PubChem PUG REST and NCI CACTUS for each catalogue CAS and accepts an
InChIKey only when both agree and PubChem's formula matches the record's
own: 477 resolved; 17 disagree, which is the rule working -- radicals whose
CAS one resolver maps to the parent molecule (`O` to water, `H` to H2, `OH`
to hydroxide) and stereoisomers the two resolvers key differently (maleic
acid, glucose, tartaric acid, two trans-dimethylcyclohexanes); 13 incomplete
(a resolver did not answer -- recorded as such, never as a disagreement --
including three placeholder records whose CAS is 00-00-0); 4 formula
mismatches (two deuterium records, whose PubChem formula is written in H,
and `Cl` and `HOCl`, whose records write `CL` and `HOCL` -- a formula field
that does not parse as element symbols, a small curation finding of its own).  Two InChIKeys are claimed by two records each (cis/trans pairs
whose CAS resolves to the stereo-free key) and join nothing.

`vle-index`: 12 993 binary vapour-liquid blocks, 5 071 joining both compounds
to the catalogue; 800 isobaric bubble-temperature blocks at or below 110 kPa
cover **617 catalogue pairs** -- the reach of this route.

### 2.3 Five systems, chosen before fitting

Low-pressure binary bubble temperatures on components the catalogue
describes, each with at least two studies from different laboratories so
the held-out set is independent, each useful to the tutorials:

| case | pair | fit (DOI, points) | held out (DOI, points) |
|---|---|---|---|
| curate04 | methanol + water | 10.1016/j.jct.2009.11.020, 54 on six isobars 15-95 kPa | 10.1021/je200341c, 13 at 101.32 kPa |
| curate05 | acetone + methanol | 10.1021/je5007373, 32 at 101.3 kPa | 10.1021/je0603170, 30 at 100 kPa |
| curate06 | isopropanol + water | 10.1016/j.jct.2017.02.005, 29 at 100 kPa | 10.1021/acs.jced.7b00523, 16 at 101.058 kPa |
| curate07 | ethyl acetate + ethanol | 10.1016/j.fluid.2005.07.010, 24 at 101.325 kPa | 10.1021/je700322p, 28 at 100 kPa |
| curate08 | methyl acetate + methanol | 10.1021/je600518s, 27 at 100 kPa | 10.1016/j.fluid.2015.04.018, 19 at 101.3 kPa |

Acetic acid + water (more studies than most) was passed over: its vapour
dimerises, and an ideal-gas vapour would make the pair absorb the
association.  A sixth candidate, `j.fluid.2015.12.029` (methyl acetate +
methanol on six isobars), was refused by the extractor itself: every
(x, P, T) row appears twice.

### 2.4 The model and its frame

NRTL, `tau_ij = a_ij + b_ij/T`, `G_ij = exp(-alpha tau_ij)`, Renon & Prausnitz
direction.  **Two parameters**, b_ij and b_ji; a_ij = a_ji = 0 and alpha =
0.30 fixed, because bubble temperatures over these ranges do not identify
more -- and curate04's `fit_nrtl_ab` proves it on the one set that spans
temperature: freeing a_ij and a_ji gives `NOT individually identifiable`
(max|corr| 0.996) and a WORSE held-out AAD.  Each fit is repeated from a
second start; all five land on the same pair.  Vapour: ideal gas, no
Poynting.  Pure components: the catalogue's Antoine records, unchanged.
UNIQUAC and Wilson were not fitted in this slice (§5).

**Weighting.**  `residual { weighting uncertainty; }` (new, opt-in) weights
each point by 1/U, U the article's own per-point expanded uncertainty kept
in the dataset -- in the isopropanol + water fit set U runs from 0.13 to
1.35 K along x.  The held-out AAD is never weighted.  Default stays `equal`,
so every earlier case is arithmetically unchanged.

**The band, declared before any fit, one rule for all five:** the held-out
set's largest stated U plus the catalogue Antoine's own error at that set's
pure endpoints (measured with no pair involved), as a percentage of the
held-out mean T, rounded up to two significant figures.

### 2.5 Results

| pair | b_ij, b_ji (K) | in-sample rms | held-out AAD | band | verdict | where it lives |
|---|---|---|---|---|---|---|
| methanol-water | 165.0, 41.8 | 0.50 K | 0.53 K (0.150 %) | 0.33 % | validated | catalogue |
| acetone-methanol | 369.8, -92.8 | 0.13 K | 0.32 K (0.096 %) | 0.047 % | **notValidated** | its case only |
| isopropanol-water | -69.6, 968.2 | 0.52 K | 0.83 K (0.232 %) | 0.63 % | validated | catalogue |
| ethyl acetate-ethanol | 95.4, 214.8 | 0.077 K | 0.11 K (0.032 %) | 0.052 % | validated | catalogue |
| methyl acetate-methanol | 182.9, 185.6 | 0.029 K | 0.15 K (0.045 %) | 0.089 % | validated | catalogue |

(b_ij in the i -> j order each record states.)  The overlay in each case
draws the pair against both studies beside ideal mixing and UNIFAC; its
AADs are pinned (`aad` rows).

**Coverage.**  Public NRTL pairs: 2 before (benzene-toluene, an ideality
assumption; ethanol-water, a literature set), **6** after -- the four above,
each `reviewStatus interim`.  UNIQUAC: 3, unchanged.  Private tier, for a
user who installs ChemSep: 758 staged NRTL/UNIQUAC/Wilson pairs.

## 3. Engine and tool changes

- `fitParameters(T_bubble)` reads the bench's own column spellings
  (`x[<comp>]`, `T_bubble`), so ONE dataset file serves the fit and the
  overlay; gains the opt-in uncertainty weighting (rms and max residual stay
  in K); and writes the fit span as `validity {}` into the proposal, the
  block `PairAudit` reads.  The weighting's logic lives in
  `src/propertyOps/FitWeighting.{H,cpp}` so `FitParameters.cpp` gains it
  through one-line call sites: the EduTools least-squares lesson cites that
  file line by line and its tests hold each citation to its line (a first
  draft moved them and failed `--gui`).
- `PairAudit` reads a pair record's `reviewStatus` and announces `interim`
  once per process, on the component loader's channel and tag
  (`[unreviewed]`).  Before this, the field on a pair record was a comment.
- `bin/choupo-import` traces a per-operation `thermo {}` override that names
  a pair model with no inline numbers -- the scans that draw a catalogue
  pair sealed without it and the staged run refused.
- `bin/choupo-thermoml`: `identity`, `vle-index`, `vle-search`; `extract-vle`
  joins by InChIKey, keeps uncertainties, joins the vapour block,
  `--interior-only`, refuses duplicated rows.

## 4. The gate

`bin/curate/check_regressed_pairs.py` re-runs the case each regressed record
names and requires the record to equal what it regresses now; only validated
fits in the catalogue; `interim` voiced; every dataset carrying DOI, archive
sha256, CAS + InChIKey of both compounds and one uncertainty per row.  Six
by-hand sabotages, all caught in the end: a nudged b_ij, a removed
reviewStatus, a catalogue verdict flipped to notValidated, the sealed copy
marked `reviewed` (engine silent), a dataset's InChIKey removed, and the
non-validated record copied into the catalogue.  **Two survived the first
draft** -- the removed reviewStatus and the silent engine -- because the
field regex ran over the raw file and matched the header PROSE "reviewStatus
interim: the measurements were...".  A pattern that matches prose is a check
prose can satisfy; the gate reads the comment-stripped record now.  The
licence arm: four sabotages, of which "ChemSep NRTL table" without the word
DECHEMA is the one that discriminates the new rule from the old.

## 5. Findings, and what is NOT done

- **The catalogue water Antoine record boils 0.70 K low at 101.32 kPa**
  (and 0.52 K at 101.06), measured against the held-out studies' own pure
  endpoints.  Every water pair carries that error and no pair can remove it.
  Curation of `water.dat`'s vapour pressure is Vítor's.
- **`validated` is not `best`.**  On methanol + water's held-out study
  UNIFAC (0.36 K) is closer than the validated pair (0.53 K), which was
  regressed below atmospheric pressure.
- **Acetone + methanol: two studies disagree.**  UNIFAC, which saw neither,
  reproduces the held-out study to 0.04 K and misses the fit study by
  0.34 K; the fitted pair does the mirror image.  A scratch run with the
  LOCAL DECHEMA pair (never committed) gave 0.11 K and 0.39 K -- the same
  side as UNIFAC.  Reading both articles is a curator's act; swapping the
  roles now would be choosing the partition after seeing the residual.
- **The UNIFAC tables' licence line.**  `parameters/UNIFAC/{groups,
  interactions}.dat` were imported from a ChemSep `.gct` and call it "the
  ChemSep database (Artistic-2.0)"; the `.gct` files sit under the LITE
  licence, not the Artistic grant.  The values are Hansen et al. 1991, a
  journal table cited as the primary; only the attribution is wrong.
  Correcting shipped records' provenance is RESERVED for Vítor.
- **A pair's `reviewStatus` on the reactive molecular backbone is still
  silent**: `marcilla02` carries a case-local UNIQUAC pair marked interim,
  read through the reactive builder's path, which does not call `PairAudit`.
- **The overlay labels a column declared in K as `SI`/relative** (only
  affine units are classed as temperature).  Harmless -- it reports both the
  absolute and relative AAD -- and not changed, because re-classing it would
  rename pinned `aad` statistics in other cases.
- **NOT done:** UNIQUAC and Wilson fits; bubble-PRESSURE (isothermal P-x)
  and T-x-y fitting -- the fit reads bubble temperatures only, so the 2 057
  bubbleP blocks and the vapour compositions are drawn, not fitted; reading
  the ten series back against their articles; the 617-pair widening.

Next, in order: read the ten series back against the articles and flip
them to `checked`; settle the acetone-methanol disagreement; add a
`P_bubble` residual kind so isothermal data count; then widen by the same
rule, pair by pair, never in bulk.

## 6. Slice 2 (2026-10-05): four more systems, and a verdict that cannot see a second liquid

Same chain, same rules, same archive (the cache of 2026-09-28, sha256
re-verified).  Nothing under `src/` changed.

### 6.1 The systems, chosen before fitting

Chosen by teaching value, each with at least two low-pressure bubble-
temperature studies whose x is reported for the SAME component:

| case | pair | why |
|---|---|---|
| curate09 | 1-propanol + water | completes the C1-C3 water + alcohol series beside methanol and isopropanol; minimum azeotrope; five studies, the most of any candidate |
| curate10 | acetonitrile + water | the textbook system for pressure-swing distillation; minimum azeotrope |
| curate11 | acetone + ethanol | two common solvents with a positive deviation and NO azeotrope -- the contrast to the rest of the family |
| curate12 | ethanol + cyclohexane | the binary under heterogeneous azeotropic dehydration of ethanol (cyclohexane the entrainer) |

Passed over, each for a reason that was measured: **methanol + benzene**
(the aromatic the brief asked for) -- its two studies report x of DIFFERENT
components, `extract-vle` has no reorientation, and a hand edit of a measured
file is the act the chain exists to prevent, so the tool needs a
`--x-of <component>` option first; **ethanol + p-xylene** -- ethanol's
catalogue Antoine record ends at 369 K and the data run to 411 K, so the pair
would absorb an extrapolated vapour pressure; **acetone + water, acetone +
chloroform, THF + water, 1,4-dioxane + water, ethanol + toluene** -- no
low-pressure bubble-T block in the archive; **benzene + toluene** -- five
studies, but the catalogue's pair is a declared ideality assumption the
benzene + toluene cases are built on, and replacing it is a corpus decision,
not a widening.  Acetic acid pairs stay out for slice 1's reason (vapour
dimerisation).

**Partition rule (declared before any fit, in the case headers):** the fit
set is the study with the most interior points; the held-out set is the next
largest that shares NO author with it.  The archive carries no affiliations,
so a shared author is the dependence the rule can check, and it checks no
more: curate09's two studies have no author in common but may come from one
department -- a read-back of the articles settles that.

**Band:** slice 1's rule unchanged.  Where the held-out study reports no pure
endpoint (curate12) the Antoine term is ZERO, the strict reading -- the band
is then the measurement's own uncertainty alone.

The declaration was committed BEFORE the first fit (the commit "C16 slice 2,
step 1"), so it can be read against the result.

### 6.2 Results

| pair | b_ij, b_ji (K) | in-sample rms | held-out AAD | band | verdict | where it lives |
|---|---|---|---|---|---|---|
| 1-propanol-water | -25.1, 979.8 | 0.52 K | 0.21 K (0.057 %) | 0.26 % | validated | catalogue |
| acetonitrile-water | 218.3, 616.3 | 0.52 K | 0.50 K (0.137 %) | 0.72 % | validated | catalogue |
| acetone-ethanol | 149.8, 68.1 | 0.072 K | 0.093 K (0.028 %) | 0.14 % | validated | catalogue |
| ethanol-cyclohexane | 354.7, 565.4 | 1.30 K | 0.32 K (0.094 %) | 0.41 % | validated | **its case only** |

Overlay on each held-out set: NRTL beats UNIFAC everywhere it can be drawn
(0.21 vs 0.36 K; 0.093 vs 0.79 K; 0.33 vs 0.59 K); acetonitrile carries no
UNIFAC groups in its record, so curate10 draws ideal mixing only.  Both
starts land on the same pair in all four.  Two numbers to read, not hide:
curate09's in-sample reduced chi2 is 8.9 (two parameters cannot follow its
fit set within the set's own U), and curate12's in-sample rms (1.30 K) is
four times its held-out AAD.  curate09 runs its fit at `tolerance 1e-6`: at
1e-8 the LM reached the same minimum and then rejected every step until
lambda diverged, because chi2 changes there fall below the inner bubble-point
noise.  The LM has no step-size stop; that is a tool gap, named, not fixed.

**Coverage.**  Public NRTL pairs: 6 -> **9**.

### 6.3 `validated` is necessary, not sufficient

A bubble-temperature scan solves for ONE liquid by construction, so a held-out
AAD on bubble temperatures cannot see a predicted second liquid.  Checked on
each pair's own NRTL equation (Gibbs energy of mixing against its lower
convex hull), the highest temperature at which each pair splits the liquid:

| pair | predicted split up to | validity span | verdict on stability |
|---|---|---|---|
| 1-propanol-water | 355.5 K | 360.5-368.6 K | stable in span; splits BELOW it |
| acetonitrile-water | 323.6 K | 350.0-367.6 K | stable in span; splits BELOW it |
| acetone-ethanol | none above 200 K | 329.7-348.9 K | stable |
| ethanol-cyclohexane | 358.8 K | 337.7-353.5 K | **splits across its whole span** |
| isopropanol-water (slice 1) | 330.4 K | 353.1-371.4 K | stable in span; splits BELOW it |

The engine agrees: a VLLE flash at 340 K and 3 bar with the ethanol +
cyclohexane pair splits a 43/57 feed into two liquids (beta 0.48).  Both of
its studies are filed by the archive as liquid + gas, one liquid.  A pair
that contradicts its own evidence's phase count inside the span it claims
would put a second liquid into every flash that reads it, and no
bubble-temperature verdict could tell -- so it was NOT promoted, though
`validated`.  It stays in curate12 as an authored record with the reason in
its header.  The remedy (a third parameter constrained by the phase count, or
LLE data) is a curation decision, Vitor's.  LLE data: the archive has NONE for this
pair (searched by InChIKey on 2026-10-05, DEV.md C35 item 6 -- 19 binary
blocks, every one of one liquid), so that route is closed until someone
measures it; the record stays in its case.

The three that split BELOW their span are honest extrapolations -- each record
says where, and why (the two-parameter b/T form grows tau as T falls) -- but
1-propanol, isopropanol and acetonitrile are all miscible with water at room
temperature, so a student who runs a cooler or decanter with these pairs below
their validity span WILL get a false second liquid.  The validity block is the
guard; whether the engine should ANNOUNCE a pair used outside its validity
span was open here, and Vitor ruled it on 2026-10-05 (DEV.md C35 item 5): it
does, through `PairSpanGuard` (`src/thermo/PairAudit.H`) -- `[pair-span]`,
once per pair per run, into the caveat block, no number moved --
held by `check_regressed_pairs` arm (g).

### 6.4 The gate's new arm, and its sabotages

`check_regressed_pairs` arm (f): a catalogue pair must predict ONE liquid at
six temperatures spanning its validity block, recomputed from the record's
own parameters (independent of the engine).  By hand, 2026-10-05:

- S1, curate12's record copied into `data/standards/parameters/NRTL/`: FAILED
  on arm (f) ALONE -- arms (a)-(e) all pass it (it reproduces, it is
  validated, it carries every field), which is the point.
- S2, the hull test disarmed (threshold 1e-9 -> 1e9) with S1 in place: OK --
  so arm (f) is the only thing in the tree that refuses that record.
- S3, the validity parser blinded: FAILED on every catalogue record ("arm (f)
  cannot run, so it must not pass"), not a silent pass.

### 6.5 Found on the way, not fixed

- **A VLLE flash that finds two LIQUIDS publishes the second as a GAS.**
  `IsothermalFlash.cpp:1857` decides the two-phase fallback by
  `sol.regime.find("VL")`, and the LL regime's own string (line 1000) reads
  "two-phase liquid (LL, VLLE attempt ...)" -- "VLLE" contains "VL".  So the
  beta liquid goes out on the vapour port with `vf = 1` / `phase gas;`, the
  second liquid port carries zero, and the energy report books a 498 kW
  residual on a 100 kmol/h decanter (scratch case, the curate12 pair).  No
  corpus case reaches it today (`vlle03` solves three phases).  A one-word
  fix in `src/`, outside this slice's licence; DEV.md section 5.
  **FIXED 2026-10-05** (branch `claude/c34-vlle-ll-fallback`): the kind is a
  typed field, `FlashSolution::liquidLiquid`; this decanter is now the corpus
  witness `vlle04_two_liquids_decanter`, gate `check_vlle_fallback`.
- **No reorientation in `extract-vle`** (6.1): the next tool step before the
  aromatics can be fitted.

### 6.6 Still NOT done

Reading the eighteen series back against their articles (flip to
`checked`); settling acetone + methanol (the archive holds seven blocks of
it -- a third study is the curator's tie-break, not the fitter's); a `P_bubble`
residual; UNIQUAC/Wilson; `--x-of` in `extract-vle`; an LM step-size stop; a
stability-constrained fit for alcohol + hydrocarbon pairs.

## 7. A partially miscible pair: bubble temperatures AND tie lines in one fit (2026-11-05, DEV.md 4c C226 A1-A3)

Section 6.6 listed three absences that are now (partly) filled, and the
sentences above that depended on them ("a `P_bubble` residual; UNIQUAC/Wilson")
are corrected here rather than rewritten: `P_bubble` has existed since C123.

* **UNIQUAC and Wilson fit by the dictionary path, and always did** (A3,
  confirmed by a run on a copy of curate04, 2026-11-05): `a_ij`/`a_ji` for
  UNIQUAC and `A_ij`/`A_ji` for Wilson converge, publish the identifiability
  statistics and the held-out verdict.  What did NOT work was the PROPOSAL
  record: it wrote NRTL's five keys for every model, so a Wilson fit published
  `a_ij 0, b_ij 0` (the ideal pair, silently) and a UNIQUAC one an `alpha` no
  UNIQUAC reads.  The proposal now carries each model's own keys.  There is
  still no `parameters/Wilson/` home and `check_regressed_pairs` reads NRTL
  records only; neither was built (no run needed them).
* **`residual.kind T_bubble+LLE`** (A1): measured binodal compositions join the
  bubble rows in ONE least-squares problem (`src/propertyOps/LleResidual.{H,cpp}`).
  A tie line is (T, x1 in the lean liquid, x1 in the rich liquid); the model
  answers by the same liquid-liquid flash `propertyScanBinary` uses
  (`IsothermalFlash::solveCore`, `PhaseSet::LL`), the two rows are
  `(x_model - x_measured)/sigma` with the branches matched by order, and
  `sigma` is DECLARED (`residual.liquidLiquid { sigma; origin; }`, no default)
  so that kelvin and mole fraction add as dT/U + dx/sigma -- mixing therefore
  REQUIRES `weighting uncertainty`.  The package must carry two liquid phases
  (the flash refuses otherwise, and the fit says so by name).  A model that
  predicts ONE liquid where two were measured takes the bubble rows' 1e3
  penalty and is announced tie line by tie line; a start that splits NO
  measured tie line is refused (the penalty is flat: no gradient).  The held-out
  band is `acceptance { maxLLE }`, declared before the fit and inside the
  fingerprint; a held-out tie line left as one liquid is a miss
  (`notValidated`), never a skip.
* **Arm (f) of `check_regressed_pairs` accepts a declared gap** (A2): a pair
  with `liquidLiquid true;` and a `gap {}` block, tie-line evidence of `role
  fit`, a band equal to `acceptance.maxLLE`, validity covering the measured
  temperatures, and an equation that (recomputed here by the Gibbs convex
  hull) splits the liquid at every measured tie line within the band.  The
  prohibition is unchanged for every other pair.  Arm (h) builds the right
  record and six wrong ones from the synthetic witness and holds them.
* **The witness is SYNTHETIC** (`curate13_synthetic_lle_butanol_water`): the
  data are generated by the engine from NRTL parameters of our own choosing,
  say so in every header and at run time, and prove recovery (1e-5), not water
  + 1-butanol.  THE REAL PAIR IS NOT DONE: it needs measured tie lines (a
  ThermoML LLE series, or a published table read by a curator), and the 4.2 GB
  archive cache is not in this tree.  A promoted real pair needs the same
  protocol as slice 2: fit on one study, hold out another, bands before the fit.

## 8. The pipeline: `choupo-curate pair A B`, `autoPromoted`, and no series in the tree (2026-11-10, DEV.md 4c C282)

### 8.1 What was built

`bin/choupo-curate` (its pure-compound mode unchanged) gains three
subcommands that apply the rules of sections 2-7 and decide nothing new:

    choupo-curate pair A B [--plan] [--resume] [--no-commit]
    choupo-curate pair A B --promote
    choupo-curate fetch <case>
    choupo-curate revert <pair-file-stem>

`pair` joins A and B to the archive by InChIKey (identity.json); refuses a
pair that already has a record in ANY model directory of
`data/standards/parameters/`; extracts every bubble-T block at or below
110 kPa with a declared uncertainty (`extract-vle --interior-only`); sets
aside BY NAME a block with partial or no uncertainty, fewer than five interior
points, a second block of the same article, or x reported for the other
component (still no reorientation, section 6.1); runs the **study triage**
(C226 item 3) as leave-one-study-out fits BY THE ENGINE (fitParameters, the
same model and weighting) and sets aside a study whose held-out AAD exceeds
its own largest stated U plus the largest stated U of the others -- with two
studies the triage says it cannot judge, and with more than half flagged it
refuses (no majority); applies the section-6.1 partition (fit = most interior
points; held out = next largest sharing no author, measured at one pressure)
and refuses without an independent held-out study; computes the band by the
section-2.4 rule, the pure endpoints by the engine; writes
`tutorials/props/curation/curateNN_nrtl_<i>_<j>` on the curate06/09 shape and
COMMITS that declaration before any fit; then fits, writes the case-local
record (`reviewStatus interim`), seals the case and applies arm (f).

`--promote` writes the record into `data/standards/parameters/NRTL/` as
`reviewStatus autoPromoted; humanReviewed false; promotedBy ...;` ONLY when
the verdict is `validated`, arm (f) is clean and the triage RAN; it never
overwrites, and re-seals the case on the catalogue record in the same
transaction.  `revert` removes only a record whose `promotedBy` names this
tool, puts the case-local record back and removes the importer's claim on the
sealed copy (the importer's own rule 4 asks for that by hand).

**The engine** (`src/thermo/PairAudit.H`): `reviewStatus autoPromoted` is
voiced once per process on the `[unreviewed] pair` channel, into the caveat
block -- "promoted into the catalogue AUTOMATICALLY by its fitting pipeline
... and NO human has reviewed it (humanReviewed false)".  Every other word is
read and not announced, as before.

**The gate** (`check_regressed_pairs`): `autoPromoted` is accepted beside
`interim` only with `humanReviewed false;`, a `promotedBy` and the engine's own
autoPromoted sentence in its case's run (an `[unreviewed] pair` line alone does
not count: an inline pair prints one too); `humanReviewed false` beside any
other status is refused.

### 8.2 No measured series in the tree

Vítor, 2026-11-10: *"nós não vamos copiar as séries medidas! Vamos só guardar
os parâmetros de ajuste."*  A pipeline case declares its datasets in
`constant/archiveDatasets` -- DOI, the NIST per-article URL
(`https://trc.nist.gov/ThermoML/<DOI>.xml`, the file the extractor reads;
`.json` beside it as the page), the article file's sha256, the selector
(`--block N --interior-only`) and the sha256 of the extracted file -- and
`choupo-curate fetch` regenerates the points into
`constant/archiveExtracts/` (gitignored; the GUI bundle glob excludes it too),
from the local archive cache when it holds the article, else from NIST, with
both sums checked.  A mismatch REFUSES; an unreachable NIST with no cache is
NOT RUN (exit 2).  Measured: all nine article URLs of the pilot answer 200,
and each extract regenerated from NIST alone is byte-identical to the one from
the cache.  NIST answers Python's default client name with HTTP 403; the tool
sends a generic one.  `fetch` also writes `CHECKLIST.txt` beside the extracts:
each extracted table under its DOI and citation, for the read-back C226 asks
for (gitignored, because it carries the points).

`bin/runTests` fetches such a case before running it: a sha256 mismatch is a
FAIL, an unreachable source a SKIP by name with the remedy, NOT counted as a
pass; the regressed-pairs gate's exit 2 is SKIP the same way.  This is the
gates' existing SKIP convention applied to a case -- a decision the commander
should confirm (section 8.5).

### 8.3 The pilot: five pairs

Candidates: both components in the catalogue, no record for the pair in any
model directory, no acetic acid, no AmbroseWalton vapour pressure (C281), and
-- checked for the five chosen -- no binary block in the archive with a second
liquid.  Ranked by mutually author-disjoint studies, then points; acetone +
methanol (4) passed over (curate05 holds its disagreement), triethylene glycol
+ water and 2-butanol + dimethyl carbonate refused by the tool itself (no
majority in the triage; no independent held-out study of the same
orientation).  The ranking is in each case header.

| case | pair (x of) | fit / held out | triage | band | held-out AAD | verdict | where |
|---|---|---|---|---|---|---|---|
| curate15 | methanol + DMC | je0601309 (65, 40-93 kPa) / je301290c (19, 101.3 kPa) | 8 studies, all agree | 0.088 % | 0.219 K, 0.0641 % | validated | **catalogue, autoPromoted** |
| curate16 | ethanol + DMC | acs.jced.9b00414 (20) / je030131q (9, 95.8 kPa) | 2 of 4 set aside | 0.24 % | 1.18 K, 0.341 % | notValidated | its case |
| curate17 | DIPE + isopropanol | j.fluid.2014.09.014 (67) / je300994y (19, 101.3 kPa) | 4, all agree | 0.24 % | 1.89 K, 0.551 % | notValidated | its case |
| curate18 | isopropanol + DMC | j.jct.2004.09.009 (32) / je030131q (9, 95.8 kPa) | 1 of 3 set aside | 0.24 % | 0.184 K, 0.0521 % | validated | **catalogue, autoPromoted** |
| curate19 | ethanol + isooctane | je300847v (22) / j.fluid.2005.01.007 (19, 101.32 kPa) | 5, all agree | 0.57 % | 0.394 K, 0.113 % | validated | its case: **splits one liquid** at 344.6 K inside its span (arm f) |

Both starts land on the same pair in all five.  Public NRTL pairs: 10 -> 12.
Three readings, not hidden: curate16's fit set is reproduced to 0.029 K and
the held-out study missed by 1.18 K -- the triage had already found the four
studies in two camps; curate18's triage set a study aside on a thin margin
(0.636 against 0.520 K), which with three studies is a two-against-one
reading; and curate19 is the section-6.3 lesson again (ethanol + a paraffin,
validated on bubble temperatures, a false second liquid in the equation).
DMC carries no UNIFAC groups in its record, so the three DMC cases draw ideal
and NRTL only.

### 8.4 What is NOT done

- The read-back of the ten series against their articles (all stay
  `transcribedNotCheckedAgainstArticle`; the CHECKLIST is the aid).
- The existing C16 cases (curate04-curate14) still CARRY their measured
  series in the tree; converting them to `archiveDatasets` is Vítor's
  decision, not taken here.
- The bulk form C226 asked for (many pairs, DOI-only) is not walked into:
  the pilot is five pairs, one command each.
- UNIQUAC/Wilson in the pipeline; `--x-of` reorientation in `extract-vle`;
  a fit set spanning several articles.
- The triage threshold (own largest U + the others' largest U) is a stated
  default, deliberately generous; whether a curator wants it tighter is open.

### 8.5 Open for the commander

A case whose series are regenerated depends on NIST (or the local cache) at
check time.  CI runners reach the public internet, so a nightly sweep should
fetch and run them; where it cannot, the case and the gate SKIP by name and
are not counted as a pass.  That per-case SKIP had no precedent in
`bin/runTests` (only gates used SKIP), and its summary line does not count
SKIPs -- the line names each one, the tally does not.

## 9. The same pipeline for one compound: Ambrose-Walton curves refitted (2026-11-10, DEV.md 4c C281 step 2)

### 9.1 What was built

    choupo-curate vp <component> [--plan] [--no-commit] [--resume]
    choupo-curate vp <component> --promote
    choupo-curate revert <component>
    choupo-thermoml extract-vp <article file> --inchikey <key> --into <dir>

`vp` applies section 2-8's rules to a component whose `vaporPressure` is
`model AmbroseWalton` (it refuses any other curve: it never overwrites one
somebody fitted or read).  Identity by InChIKey; one study per ARTICLE,
extracted by `extract-vp`, whose reading of a pure liquid-gas vapour-pressure
point is the C279 audit's (`audit_components_thermoml.extract_file`,
imported, so the audit and the refit cannot read two sets of points out of
one article); a boiling-temperature row is set aside by name (its stated U
is in kelvin), and an article whose pressure rows do not all state an
uncertainty is set aside.  Partition: fit = the study with the most points
(ties by DOI), held out = the next largest sharing no author.  The case
`curateNN_vp_<component>` declares its two datasets in
`constant/archiveDatasets` with `extractor vapourPressure;` and the InChIKey,
and `fetch` regenerates them; the declaration is committed before the fit.
The case is NOT sealed: the fit reads only its evidence, and the run must
load the catalogue record so it voices what that record now is.

Two stated defaults, each declared in every case before its fit:

- **The band is the held-out study's MEAN stated relative U95(P)/P**, rounded
  up to two significant figures -- not section 2.4's largest U.  A pair's U is
  in kelvin and nearly uniform along a series; a vapour pressure's relative U
  spans orders of magnitude along one (glycerol's held-out study: 0.7 to
  7.4 %), so its maximum is set by the lowest-pressure point; and the
  statistic it is held to, the held-out AAD, is itself a mean.
- **The normal boiling point.**  Where the record's `Tb` lies outside every
  measured temperature (fit and held out), the fitted Antoine is an
  extrapolation there and is promoted only if its own normal boiling point
  lies within 2 K of `Tb`.  Inside the measured span the held-out verdict is
  the test.

`--promote` (verdict `validated` and the Tb rule) replaces the block by the
Antoine (Trange = the fit's own span; outside it the engine announces the
extrapolation, as for every Antoine), rewrites the banner sentence that
called Psat an estimate, and replaces the per-value provenance entry by one
naming the evidence (role, DOI, extract and article sha256), `fittedInCase`,
the verdict, band and the fitted normal boiling point, marked `reviewStatus
autoPromoted; humanReviewed false; promotedBy "bin/choupo-curate vp
--promote";`.  `revert` restores the AmbroseWalton block, entry and banner --
measured byte-identical to the record before promotion -- and only on a record
this mode promoted.

**The engine** (`src/thermo/Database.cpp`, the component loader's existing
home for a record's status): any per-value provenance entry marked `reviewStatus
autoPromoted` is voiced once per process, `[unreviewed] component '<c>':
`<entry>` reviewStatus autoPromoted -- ... NO human has reviewed it`, into the
caveat block and the result JSON advisories; generic over the entry's key.

**The gates.**  `check_regressed_pairs` arm (i): each promoted curve is
reproduced by its case (Antoine A, B, C to 1e-8 relative; Trange = the fit
dataset's span; evidence against `archiveDatasets`; verdict, held-out points,
AAD, band), only `validated` is in the catalogue, the status is `autoPromoted`
with `humanReviewed false` and `promotedBy`, and the case's run prints the
loader's line and carries it in the advisories; floor 1.  By-hand sabotages,
each caught by arm (i) alone: B edited, `humanReviewed true`, Trange widened,
verdict `notValidated`, AAD edited, and the engine's voice disabled (both the
console and the JSON checks fired).  `check_ambrose_walton_announced` arm
(e) pins the AmbroseWalton count at 47 (a new estimate, or a revert, moves
the pin deliberately); a pin of 46 was tried and refused.

### 9.2 Results

Fourteen of the 48 components had two author-disjoint studies of at least
five pressure points with stated uncertainty.

| case | component | fit / held out (DOI) | band % | held-out AAD % | verdict | Tnb fit / record Tb, K | outcome |
|---|---|---|---|---|---|---|---|
| curate20 | diButylCarbonate | acs.jced.6b00517 / j.jct.2008.02.012 | 5.3 | 105 | notValidated | 478.44 / 480.6 | kept AW |
| curate21 | diEthylCarbonate | j.jct.2008.02.012 / acs.jced.7b00295 | 2.0 | 13.2 | notValidated | 384.41 / 399.95 | kept AW |
| curate22 | diNButylEther | j.fluid.2006.06.017 / j.fluid.2015.05.002 | 0.36 | 4.75 | notValidated | 413.64 / 415.35 | kept AW |
| curate23 | diethylethanolamine | je049761y / j.fluid.2018.05.032 | 1.7 | 3.57 | notValidated | 427.31 / 434.15 | kept AW |
| curate24 | dimethylSulfoxide | j.fluid.2011.02.002 / je400531a | 3.2 | 3.87 | notValidated | 466.07 / 462.15 | kept AW |
| curate25 | dimethylethanolamine | je049761y / j.jct.2013.03.020 | 2.2 | 12.9 | notValidated | 387.26 / 404.15 | kept AW |
| curate26 | furfural | acs.jced.7b00574 / je060406c | 5.6 | 10.9 | notValidated | 435.22 / 434.85 | kept AW |
| curate27 | glycerol | j.fluid.2015.03.038 / je200766t | 5.0 | 8.30 | notValidated | 557.06 / 563.15 | kept AW |
| curate28 | methylDiEthanolAmine | je060269j / je400373d | 2.3 | 5.13 | notValidated | 520.66 / 520.15 | kept AW |
| curate29 | methylTertPentylEther | je101250d / je0255980 | 7.8 | 9.94 | notValidated | 359.46 / 359.51 | kept AW |
| curate30 | methylethanolamine | je049761y / je101259r | 2.6 | 15.8 | notValidated | 438.36 / 432.39 | kept AW |
| curate31 | monoethanolamine | j.fluid.2015.06.045 / je800530u | 5.4 | 2.82 | validated | 432.68 / 444.15 | kept AW: Tb rule (-11.5 K) |
| curate32 | nEicosane | acs.jced.6b00821 / je800534x | 4.2 | 28.4 | notValidated | 673.03 / 616.95 | kept AW |
| curate33 | nHexylAcetate | je050141m / j.jct.2005.08.003 | 7.2 | 5.89 | validated | 444.46 / 444.65 | **catalogue, autoPromoted** |

(DOI prefixes 10.1021/ for `je...` and `acs.jced...`, 10.1016/ for `j....`.)
The other 34 keep AmbroseWalton and its step-1 announcement: 20 have no
usable archive study, 4 no agreed identity, 10 only one independent study.
No golden moved: no tutorial loads nHexylAcetate (the one tutorial on these
records, temperature02_engineers_ladder, carries a sealed glycerol, and
glycerol was not promoted).

### 9.3 Readings, and what is NOT done

- **The single-study partition is the binding constraint.**  A laboratory
  usually measures one range (transpiration at low T, ebulliometry near the
  boiling point), so the fit study and the held-out study rarely overlap and
  the held-out verdict measures the EXTRAPOLATION of a three-parameter
  Antoine across tens of kelvin (diButylCarbonate: fitted at 383-478 K, held
  out at 287-329 K, 105 %).  The failing fits are nonetheless far nearer the
  measurements than the curves they would replace (C279: diethylethanolamine
  AW 82.7 % over all its points, the refit 3.6 % on an unseen study).
  Whether a fit on every study but one, or a held-out rule requiring overlap,
  is allowed is Vítor's decision; nothing was re-partitioned after a result.
- Under section 2.4's MAXIMUM-U band, dimethylSulfoxide (3.87 % against
  6.6 %) would have been validated; the band was declared before the fit, so
  it is recorded, not acted on.
- monoethanolamine is the Tb rule working: a validated fit on 274-303 K data
  that puts the normal boiling point 11.5 K low.
- NOT done: a study triage (C226 item 3 is the pair pipeline's); Wagner or
  extended Antoine forms; read-back of the series against the articles (all
  stay `transcribedNotCheckedAgainstArticle`); boiling-temperature rows as
  evidence.

## 10. One compound, every laboratory: the C283 acceptance (2026-11-10, DEV.md 4c C281 step 3 and C283)

**What changed, and why.**  Step 2 (section 9) fitted one laboratory, held out
another and judged the held-out AAD against the held-out laboratory's own
stated uncertainty.  Twelve of fourteen failed, and Vitor rejected the outcome
("isto nao e ciencia exata"): laboratories disagree with each other by more
than they claim, so the band measured a laboratory's claimed precision, not
the curve.  Step 3 landed in three moves, each written into every case's
declaration before its fit:

1. **The objective (C280, applied here).** `vaporPressureFit` reads the same
   `objective { method twoStage|leastSquares|minimax; }` block as
   `fitParameters`, through `src/propertyOps/FitObjective.{H,cpp}`; the one
   residual is the pressure, relative, `(P_model - P)/P`
   (`scale { Psat relative; }`).  Stage 1 is the op's own least-squares
   search in log10 P, stage 2 the shared minimax search, run in the curve's
   own log10 P at three temperatures of the fit range and mapped back to
   (A, B, C): in (A, B, C) the simplex stalled on a nearly collinear valley
   (curate33: 1500 evaluations stopped 0.6 % above the optimum maximum, where
   the held-out AAD read 7.5 % against 9.4 % at the optimum).  Both answers are kept.
   Measured: no golden outside the C281 cases moved (curate01, psat01,
   esterification2sector, compare_psat_ambrose_walton, temperature02).
2. **The evidence (C283, amended).**  Every usable study is fitted; none is
   held out.  `outliers { maxRelativeError 15 percent; }` (three times the
   acceptance): after the least-squares stage a point beyond it is discarded
   BY NAME (DOI, T, P, error), published in `curation.outliersDropped`, and
   the least-squares stage repeated once on the kept points.
3. **The acceptance (C283).**  Default: the maximum relative P error over the
   kept points <= 5 %, and, where the record's Tb lies outside their range,
   the fitted normal boiling point within 1 K of it; outside either the gap
   is announced and nothing is promoted.  A case may declare another in
   `system/curationDict` (`acceptance { maxRelativeError ...  percent;
   maxTemperatureError ... K; reason "..."; }`, the reason required); with
   none the run says the default was used.  The record's provenance carries
   the studies, the points kept and dropped per study, the dropped points by
   name, and the mean and max error of the fit and of the AmbroseWalton curve
   on the same kept points.

**Result.**  24 components have a case (curate20-43: the fourteen of step 2
redeclared, ten new ones that had one study or one author group).  SEVEN are
promoted `autoPromoted; humanReviewed false;`: diNButylEther,
diethylethanolamine, dimethylSulfoxide, methylTertPentylEther,
methylethanolamine, monoethanolamine, triethylamine.  Nine miss the 5 %
(diButylCarbonate, diEthylCarbonate, dimethylethanolamine, furfural -- by
0.07 % --, glycerol, methylDiEthanolAmine, phenanthrene, squalane,
triethanolamine); eight pass it and miss the 1 K Tb condition because Tb lies
beyond the measured range (nEicosane, nHexylAcetate, diethanolamine,
mNitrotoluene, nAminoethylEthanolamine, nAminoethylPiperazine,
nPentylAcetate, pyrene).  nHexylAcetate, promoted in step 2, was reverted to
AmbroseWalton.  The AmbroseWalton count is 41.  Per-study errors are in
`docs/reviews/2026-11-10-vapour-pressure-curator-list.md` (generated by
`bin/curate/vp_curator_list.py`), where a human decides; the tool never reads
it.  Held by `check_regressed_pairs` arm (i), which recomputes the kept
points, both curves' errors, the acceptance and the Tb condition from the
record, the case's datasets and the run's discarded list (four by-hand
sabotages caught), and `check_ambrose_walton_announced` arm (e) (pin 41).

**NOT done.**  `pair` keeps its held-out band (this slice did not change
it).  Measured from the pinned goldens, the C283 default for a pair (held-out
max |dT| < 1 K) would flip curate19 (ethanol + isooctane, held-out max
1.19 K) from validated to not accepted and curate14's `fit_twoStage` (max
0.45 K, notValidated today) to accepted on its bubble side; curate15
(0.50 K) and curate18 (0.54 K) stay accepted, curate16 (3.91 K) and curate17
(3.19 K) stay not; curate04-13 pin no held-out maximum, so their move is
unmeasured until each case is run.  A two-liquid pair's composition side
(5 % relative) is also unmeasured.

### 10.1 The acceptance is graded (2026-11-10, DEV.md 4c C285)

Vitor, on the nine curves above 5 %: "mete mesmo as que estao acima de 5%.
Mas acima de 5% - 10% mete um warning, e entre 10 a 20% poe um warning mais
severo. Acima de 20% descarta".  The pass/fail threshold of section 10 item 3
became FOUR grades.  On the max relative P error over the kept points: up to
5 % `clean`, up to 10 % `warning`, up to 20 % `severe`, above `refused`; where
the record's Tb lies outside the kept range, on |Tnb - Tb| (stated default,
same factors): up to 1 K `clean`, 2 K `warning`, 4 K `severe`, above
`refused`.  The fit's grade is the worse of the two, and every grade but
`refused` is promoted.  Everything else in C283 stands (all laboratories,
outliers above 15 % discarded by name, objective twoStage).

**Where the grade lives.**  In the value's per-value provenance entry,
beside `reviewStatus autoPromoted`: `fitGrade clean|warning|severe;`,
`fitGradeMaxRelativeError_pct` and, only where the temperature criterion
applied, `fitGradeBoilingPointGap_K` -- the numbers that decided it, so a
reader (and the loader) never recomputes it.  The component loader
(`src/thermo/Database.cpp`, `announceFitGrade`) is generic over the
provenance key: a clean grade says nothing more; a warning prints `[fit-grade]
... fitGrade warning -- the fitted curve misses some of its measurements by up
to X %[, and places its normal boiling point Y K from the record's Tb]; it was
accepted with a WARNING`; a severe one the same with `SEVERE` and "it is WEAK";
both ride the AdvisoryLog once per component and value per process (caveat
block, result JSON advisories).  A grade word the loader does not know --
`refused` included -- refuses by name.

**Result.**  The 24 cases were re-declared (`--redeclare`, each declaration
committed before its fit, the studies required to be the ones already
declared -- no re-partition) and re-run; no fitted number moved.  SIXTEEN are
promoted: seven clean (the seven of C283, re-promoted with their grade),
six warning (diEthylCarbonate 7.54 %; dimethylethanolamine 8.51 %;
nHexylAcetate, Tb gap -1.64 K; diethanolamine -1.75 K;
nAminoethylEthanolamine +1.88 K; squalane 9.43 %), three severe
(diButylCarbonate, 8.82 % and -3.76 K; furfural, -2.54 K; methylDiEthanolAmine
11.08 %).  Eight are refused, every one on the temperature criterion (glycerol
-5.23 K, triethanolamine -6.63 K, pyrene -8.16 K, and five more than 16 K
off).  No fit exceeded 20 %: the largest kept-point error is 12.15 %
(triethanolamine), so the P branch of `refused` has no live witness and its
gate arm was proved by a tightened limit instead.  The AmbroseWalton count
falls to 32.  squalane is accepted with its Tb INSIDE the kept range (no
temperature condition) although its curve's normal boiling point is 59 K above
the record's Tb -- the rule as declared; the curator list shows it.

Held by `check_regressed_pairs` arm (i): the grade recomputed from the kept
points and the record's coefficients, the record's `fitGrade` and deciding
numbers equal to it, never `refused`, and a warning or SEVERE grade voiced on
the console and in the advisories (a clean one voicing nothing).  Sabotages,
by hand: furfural's grade edited severe -> warning (caught: recomputed
severe); glycerol force-promoted as severe through a patched tool (caught:
recomputed refused, on its -5.23 K gap); the P limits tightened to 5 / 6 / 7 %
in the gate (five records caught as refused, the P branch); the loader's line
suppressed (caught, 18 failures: nine records, console and JSON).
