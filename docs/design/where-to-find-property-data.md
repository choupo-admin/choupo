# Where to find property data — an EduTool on sources and licences

*2026-11-12.  DEV.md 4c C322: an EduTool on "how to find properties" (free
sources, licences, primary citation, measured vs estimated, Choupo's
provenance as the example).  Scope approved by Vítor the same day, in six
parts: the question that picks a source; a map of free sources; a
licence-class table that is the project's own policy; measured / fitted /
estimated and uncertainty; a real record's provenance as the worked
example; an exercise.  Later the same day Vítor approved a new shelf,
"Property data & parameters", right after "Thermodynamics", and a path
"From a measurement to a parameter"; the page is that shelf's second
tenant.*

## 1. What was built

| file | what |
|---|---|
| `gui/src/ui/methods/dataSourcesLesson.ts` | every fact of the page: the picker, the eight sources, the excluded classes, the policy table, the quoted record, the exercise, the limits, and `CITATIONS` (every `file:line` the page names) |
| `gui/src/ui/methods/DataSourcesTool.tsx` | the page; it draws and computes nothing except the band arithmetic of the example (`100 × 0.3 K / 341.73 K`, rounded up), marked `page` |
| `gui/tests/dataSourcesLesson.test.ts` | reads every quoted record line and every `file:line` back from the tree, reproduces the record's `maxAAD`, holds the C277 text budget (60 words before the equation, 40 after), renders the page |
| `docs/design/where-to-find-property-data.mount.patch` | NOT applied: the mount (below) |

The page has ONE equation, the held-out average absolute deviation the
pair fits report, cited to `src/propertyOps/FitParameters.cpp:1538`.

## 2. Every licence was read on the source's own page

Nothing on the page states a licence from memory.  Each row below was read
on 2026-11-12 on the page named; the page prints the same URL and date.

| source | page read | what it says | class on the page |
|---|---|---|---|
| NIST/TRC ThermoML Archive | data.nist.gov record `mds2-2422` (via `data.nist.gov/rmm/records`), version 1.2.6, file `ThermoML.v2020-09-30.tgz`; https://www.nist.gov/open/license | licence field = the NIST licence page; that page: non-SRD NIST works are not subject to US copyright (17 U.S.C. 105) and "NO WARRANTY OF NON-INFRINGEMENT OF THIRD PARTY INTELLECTUAL PROPERTY RIGHTS" | aggregator (finding aid) |
| NIST Chemistry WebBook (SRD 69) | https://webbook.nist.gov/chemistry/ and the methanol phase-change page | "Data compilation copyright by the U.S. Secretary of Commerce on behalf of the U.S.A.  All rights reserved." | aggregator, no grant |
| IUPAC-NIST Solubility Data Series (SRD 106) | https://srdata.nist.gov/solubility/ (home, disclaimer, IUPAC volumes page); SDS Volume 1 front matter; the SRD section of the NIST licence page | NIST SRD 106 under the Standard Reference Data Act; Volume 1: "Copyright © 1979 International Union of Pure and Applied Chemistry.  All Rights Reserved." | aggregator, no grant |
| NASA/TP-2002-211556 | https://ntrs.nasa.gov/api/citations/20020085330 | distribution PUBLIC, determination `GOV_PUBLIC_USE_PERMITTED` | public domain |
| CODATA Key Values | https://www.codata.info/resources/databases/key1.html | no licence or copyright statement; use "is encouraged in the analysis of thermodynamic measurements, data reduction, and preparation of other thermodynamic tables" | no grant (cite a Key Value as the primary; nothing grants copying the table) |
| Sander's Henry's law compilation | https://acp.copernicus.org/articles/23/10901/2023/ and /15/4399/2015/; https://www.henrys-law.org/ | 2023: CC BY 4.0; 2015: CC BY 3.0; the site asks that the 2015 paper no longer be cited | open |
| ChemSep pure-component databank | `help/chemsep.lic` inside `lite.zip` (ChemSep LITE 8.51) from http://www.chemsep.org/downloads/index.html (https refused the TLS handshake) | Artistic licence for the pure-component databank "and ONLY" it; "Sublicense of SOFTWARE to another party is not permitted." | open (pure-component only); the `ipd/` tables local only |
| PubChem | pubchem.ncbi.nlm.nih.gov/docs/about and /docs/citation-guidelines: NOT READABLE (a browser challenge refused every automated request); https://www.ncbi.nlm.nih.gov/home/about/policies/ read instead | NCBI "places no restrictions" on its molecular databases, submitters may claim rights; PubChem not named there | identity only; no licence claimed on the page |
| Burcat's database (excluded) | https://respecth.elte.hu/burcat/Introduction%202005_.pdf | "free for use for non-commercial purposes ... cannot be used for commercial purposes without a written agreement from the authors" | NonCommercial: cross-check only |

The policy table quotes the project's rules and names the line each is
written at: `docs/architecture/settled-contracts.md:3471` (open data,
share-alike honoured), `:3477` (NonCommercial and no-grant excluded),
`:3482` (cite the primary), `CLAUDE.md:726` (an aggregator is a route, a
NonCommercial compilation is not), `bin/curate/check_source_licence.py:337`
(`EXCLUDED_TABLES`) and `:485` (`ACCEPTED_PUBLIC_DOMAIN`).  No commercial
databank is named; they are described as a class.

## 3. The worked example

`data/standards/parameters/NRTL/dimethylCarbonate-methanol.dat`, quoted line
by line (lines 52-119): `origin fitted`, `fittedInCase`, `reviewStatus
autoPromoted; humanReviewed false;`, the `reuse` line, the two DOIs (fit and
held out, two laboratories), the article sha256, the validity span, the
verdict, the held-out AAD and the band.  The NIST per-article URLs are not
in the record; they are in the case's `constant/archiveDatasets` (lines 27
and 45) and the page quotes them from there.  The record carries no
`fitGrade`; the page points to one that does
(`124Trimethylbenzene-2Pentanol.dat:63`) rather than inventing one.

## 4. The mount (not applied here)

`registry.ts`, `MethodsWorkspace.tsx` and `lessonReferences.json` are held by
the laptop session (c315/c316 queued there), so the mount is
`where-to-find-property-data.mount.patch`, built and tested on this branch
and then reverted.  It:

* adds `"property-data-sources"` to `MethodToolId`;
* adds the shelf `"Property data & parameters"` after `"Thermodynamics"`, and
  moves `property-origins` and `property-trust` onto it, with the new entry
  between them (`origins: ["page", "reference", "assumption"]`);
* adds the path `measurement-to-parameter`: property-origins ->
  property-data-sources -> property-trust -> local-composition ->
  least-squares -> four-ways-mixture.  "From a database to binary
  parameters" belongs between least-squares and four-ways-mixture and is
  added the day that page exists (a path step must name a live tool);
* mounts the page in `MethodsWorkspace.tsx`;
* adds five verified references (`pageSources` = "The map of free sources")
  and the `<LessonReferences tool="property-data-sources" />` line to the
  page;
* aligns `propertyOriginsTool.test.ts` (its shelf) and `methodPaths.test.ts`
  (the path list).

After applying: `node bin/curate/method_tools.mjs` (regenerates
`generated/methodTools.json`) and `gate_manifest --only check_method_tools
check_lesson_references` (both claims' counts move).  Measured with the
patch applied: typecheck clean; twelve GUI test files (189 tests) green;
`check_method_tools`, `check_lesson_references`, `check_lesson_symbols`,
`check_edutool_form`, `check_curator_parity`, `check_doctrine`,
`check_glossary_bans`, `check_doc_references`, `generated_artefacts --check`
and `gate_manifest --check` OK.

## 5. Findings, recorded and not fixed

* The catalogue's Henry records cite Sander 2015 (version 4.0), and
  `henrys-law.org` now asks that it no longer be cited (version 5.0.0,
  2023, CC BY 4.0).  The values may still be right; the citation is the
  superseded one.  C321's next slice is the place to decide.
* `CLAUDE.md:720` says the public repo "redistributes NO third-party
  values", while the tree ships CC BY (Sander) and Artistic-2.0 (ChemSep
  pure-component) values under the policy at
  `docs/architecture/settled-contracts.md:3471`.  The page follows the
  policy; the sentence is a stale copy of the older rule.
* PubChem's terms could not be read; the page claims none.
* ChemSep LITE is now 8.51; `thirdParty/chemsep/README.md` records the 8.50
  archive and its sha256.  The licence sentences are unchanged.

## 6. What this page does not do

It is not legal advice, it does not rank sources by accuracy, and it
verifies no number against a measurement.  Licences change: each row says
when it was read.

## The licence policy the page quotes (a stable anchor)

The page's licence-class table cites these four sentences.  They are quoted
here, from the project's policy in CLAUDE.md and
docs/architecture/settled-contracts.md, because those two files are edited
every day and a line number into them does not hold; the page cites THIS
section.

- **DATA** in `data/standards/` and vendored case data is multi-licensed by component: each file may carry its own open licence, copyleft included.
- An aggregator (a WebBook, a handbook) raises an authority-versus-route question: a primary measurement read THROUGH it is compliant, because the value came from the journal.
- Excluded regardless of copyleft: NonCommercial data, and no-grant or all-rights-reserved compilations.
- Cite the PRIMARY source per value, never the compiler's arrangement.
