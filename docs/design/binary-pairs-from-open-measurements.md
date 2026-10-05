# Binary pairs from open measurements

**Status: FIRST PATH BUILT 2026-09-28; SLICE 2 2026-10-05 (section 6) (DEV.md C16).**  Vítor asked for wider
binary-interaction coverage from free, open sources, keeping provenance,
commercial use and redistribution.  Two routes were named: import tables
already published under compatible terms, and fit new parameters to the
NIST/TRC ThermoML Archive.  This record is the licence determination for
both, the chain that was built, what it produced, and what it found on the
way.  Nothing here was promoted to `reviewed`: that is Vítor's.

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
LLE data) is a curation decision, Vitor's.

The three that split BELOW their span are honest extrapolations -- each record
says where, and why (the two-parameter b/T form grows tau as T falls) -- but
1-propanol, isopropanol and acetonitrile are all miscible with water at room
temperature, so a student who runs a cooler or decanter with these pairs below
their validity span WILL get a false second liquid.  The validity block is the
guard; whether the engine should ANNOUNCE a pair used outside its validity
span is open (it does for a vapour-pressure Trange, not for a pair's).

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
- **No reorientation in `extract-vle`** (6.1): the next tool step before the
  aromatics can be fitted.

### 6.6 Still NOT done

Reading the eighteen series back against their articles (flip to
`checked`); settling acetone + methanol (the archive holds seven blocks of
it -- a third study is the curator's tie-break, not the fitter's); a `P_bubble`
residual; UNIQUAC/Wilson; `--x-of` in `extract-vle`; an LM step-size stop; a
stability-constrained fit for alcohol + hydrocarbon pairs.
