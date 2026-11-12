/*---------------------------------------------------------------------------*\
       \|/       C hemicals     | Open-source, glass-box chemical process simulator
      \\|//      H eat-transfer | https://choupo.org
     \\\|///     O perations    |
      \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
       \|/       P roperties    | Licence: GPL-3.0-or-later
        |        O ptimization  |
       /|\                      |
-------------------------------------------------------------------------------
    SPDX-License-Identifier: GPL-3.0-or-later
    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
\*---------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------*\
  dataSourcesLesson -- "Where to find property data" (DEV.md 4c C322; scope
  approved by Vitor 2026-11-12: the question that picks a source, a map of
  free sources, the licence classes, measured / fitted / estimated, a real
  record's provenance, an exercise).  Record:
  docs/design/where-to-find-property-data.md.

  NOTHING HERE IS FROM MEMORY.  Every statement about a source's licence was
  read on that source's OWN current page on the date its row carries
  (SOURCES[].read / .date), and the page draws that row.  A source whose own
  terms page could not be reached says so on the page (PubChem, 2026-11-12:
  a browser challenge refused every automated request) instead of being
  given a licence from memory.

  THE PROJECT'S POLICY IS QUOTED, NOT RESTATED.  The licence-class table is
  the policy in docs/architecture/settled-contracts.md (licence policy, CODE
  vs DOCS vs DATA) and CLAUDE.md section 7, each row naming the line it
  stands on and the gate arm in bin/curate/check_source_licence.py that
  enforces it.  CITATIONS below lists every file:line the page names, and
  gui/tests/dataSourcesLesson.test.ts reads each one back against the tree.

  NO COMMERCIAL DATABANK IS NAMED.  They are described as a class; the
  product names are banned from the user-facing pages by check_doctrine.
\*---------------------------------------------------------------------------*/

import type { LessonLimit, LessonStep } from "./lessonStep.js";

/** The worked example's record, a real file of the public catalogue. */
export const EXAMPLE_RECORD = "data/standards/parameters/NRTL/dimethylCarbonate-methanol.dat";

/** The case that regenerates the example's measurements from the archive. */
export const EXAMPLE_DATASETS = "data/curation/pairs/dimethylCarbonate-methanol/constant/archiveDatasets";

// ---- 1 · the question that picks a source ----------------------------------

/** What kind of datum, and where a student looks for it first.  Rows are
 *  the page's editorial guidance, not a ranking of databases. */
export interface PickerRow {
  id: string;
  property: string;
  system: string;
  conditions: string;
  lookFirst: string;
}

export const PICKER: readonly PickerRow[] = [
  {
    id: "pure-constant",
    property: "a pure-component constant (Tc, Pc, omega, Tb, molar mass)",
    system: "one substance",
    conditions: "none: it is a single number",
    lookFirst: "an evaluated pure-component databank that cites a primary "
      + "per value; the WebBook to find the original paper",
  },
  {
    id: "pure-curve",
    property: "a pure-component curve (vapour pressure, heat capacity, density)",
    system: "one substance",
    conditions: "a temperature range: the fit must cover yours",
    lookFirst: "measured series in journal articles, located through the "
      + "ThermoML archive or the WebBook's reference list",
  },
  {
    id: "formation",
    property: "an enthalpy or Gibbs energy of formation, an entropy",
    system: "one species, one phase",
    conditions: "298.15 K and a stated standard pressure",
    lookFirst: "the CODATA Key Values for the key substances; the NASA Glenn "
      + "coefficients for ideal gases",
  },
  {
    id: "mixture-vle",
    property: "vapour-liquid equilibrium of a pair (to fit NRTL, UNIQUAC, Wilson)",
    system: "two volatile liquids",
    conditions: "your pressure or temperature, your composition range",
    lookFirst: "the ThermoML archive: it locates the articles; you fit, "
      + "on one laboratory, and hold out another",
  },
  {
    id: "gas-solubility",
    property: "a gas dissolved in a liquid (Henry's constant)",
    system: "a gas and a solvent, infinitely dilute",
    conditions: "near 298 K, with its temperature dependence",
    lookFirst: "Sander's compilation for water as solvent; the Solubility "
      + "Data Series for other solvents and to cross-check",
  },
  {
    id: "solid-solubility",
    property: "the solubility of a solid or a liquid in a liquid",
    system: "a salt or an organic in a solvent",
    conditions: "a temperature range, sometimes a second solute",
    lookFirst: "the IUPAC-NIST Solubility Data Series, to find and compare the "
      + "measurements; enter the original paper's value",
  },
  {
    id: "identity",
    property: "who the substance IS (CAS number, InChIKey, formula, names)",
    system: "any",
    conditions: "none",
    lookFirst: "PubChem, for identity only, never for a property value",
  },
];

// ---- 2 · the map of free sources -------------------------------------------

/** The licence classes of the project's own policy (LICENCE_CLASSES). */
export type LicenceClass =
  | "public-domain" | "open" | "aggregator" | "noncommercial" | "no-grant";

/** One source on the map.  `licence` is what its OWN page says, quoted or
 *  closely paraphrased; `read` names the page and what was read on it;
 *  `date` is when.  `allows` is what the project's policy does with it. */
export interface SourceRow {
  id: string;
  name: string;
  holds: string;
  access: string;
  cite: string;
  licence: string;
  cls: LicenceClass;
  allows: string;
  url: string;
  read: string;
  date: string;
}

export const SOURCES: readonly SourceRow[] = [
  {
    id: "thermoml",
    name: "NIST/TRC ThermoML Archive",
    holds: "Experimental thermophysical data from journal articles, one "
      + "ThermoML XML file per article; the archive's last release is "
      + "ThermoML.v2020-09-30.",
    access: "One tarball from data.nist.gov (doi 10.18434/mds2-2422), or one "
      + "file per article at trc.nist.gov/ThermoML/<doi>.xml.  Choupo's "
      + "toolchain is bin/choupo-thermoml.",
    cite: "The ARTICLE whose data you use, by its DOI.  The archive is cited "
      + "as where you found it.",
    licence: "The data.nist.gov record (version 1.2.6) carries the licence "
      + "https://www.nist.gov/open/license.  That page: NIST works not under "
      + "the Standard Reference Data Act are not subject to US copyright "
      + "(17 U.S.C. 105), and NIST makes \u201cno warranty of "
      + "non-infringement of third party intellectual property rights\u201d.",
    cls: "aggregator",
    allows: "A finding aid.  The measurements belong to the articles.  "
      + "Choupo keeps no measured point in the tree and fits its own "
      + "parameters; bulk import is reserved (thirdParty/thermoml/README.md:30).",
    url: "https://data.nist.gov/od/id/mds2-2422",
    read: "the record's metadata through data.nist.gov/rmm/records "
      + "(title, DOI, licence field, version 1.2.6, file "
      + "ThermoML.v2020-09-30.tgz) and the licence page www.nist.gov/open/license",
    date: "2026-11-12",
  },
  {
    id: "webbook",
    name: "NIST Chemistry WebBook (SRD 69)",
    holds: "Thermochemistry, phase-change data, Henry's law data, spectra "
      + "and fluid properties, each table with its literature references.",
    access: "Free to read at webbook.nist.gov, one page per species.",
    cite: "The primary paper the WebBook lists under the value; the WebBook "
      + "itself (doi 10.18434/T4D303) as the route.",
    licence: "Every species page: \u201cData compilation copyright by the "
      + "U.S. Secretary of Commerce on behalf of the U.S.A.  All rights "
      + "reserved.\u201d  No reuse grant.",
    cls: "aggregator",
    allows: "Read it, follow the reference, enter the PRIMARY paper's value "
      + "cited to that paper.  Never copy the compilation.",
    url: "https://webbook.nist.gov/chemistry/",
    read: "the home page (SRD 69, doi 10.18434/T4D303) and the methanol "
      + "phase-change page (cbook.cgi?ID=C67561&Mask=4), whose footer carries "
      + "the copyright sentence and whose references list the original papers",
    date: "2026-11-12",
  },
  {
    id: "sds",
    name: "IUPAC-NIST Solubility Data Series (SRD 106)",
    holds: "Compiled and critically evaluated solubilities of gases, liquids "
      + "and solids in liquids, from the original measurements.",
    access: "srdata.nist.gov/solubility: search by substance or CAS number; "
      + "the volumes as scanned PDFs.",
    cite: "The original paper for a measurement; the SDS volume for an "
      + "evaluation you quote.",
    licence: "The database is NIST Standard Reference Database 106, under "
      + "the Standard Reference Data Act (copyright secured for the United "
      + "States).  The volumes: \u201cCopyright \u00a9 1979 International "
      + "Union of Pure and Applied Chemistry.  All Rights Reserved.\u201d "
      + "(Volume 1).",
    cls: "aggregator",
    allows: "A finding aid and a cross-check.  Enter the original paper's "
      + "measurement, cited to that paper.",
    url: "https://srdata.nist.gov/solubility/",
    read: "the home page (SRD 106, doi 10.18434/T4QC79), the disclaimer page, "
      + "the IUPAC volumes page and the front matter of Volume 1 (SDS-1.pdf); "
      + "the Standard Reference Data section of www.nist.gov/open/license",
    date: "2026-11-12",
  },
  {
    id: "nasa",
    name: "NASA Glenn coefficients (NASA/TP-2002-211556)",
    holds: "Nine-coefficient NASA polynomials for Cp, H and S of gases and "
      + "condensed species, with enthalpies of formation at 298.15 K.",
    access: "The report on the NASA Technical Reports Server, citation "
      + "20020085330.",
    cite: "McBride, Zehe and Gordon (2002), NASA/TP-2002-211556, with the page.",
    licence: "The NTRS record: distribution PUBLIC, rights determination "
      + "GOV_PUBLIC_USE_PERMITTED.  A US government work (17 U.S.C. 105).",
    cls: "public-domain",
    allows: "Values may enter a public record, cited, with `licence "
      + "publicDomain;` declared beside them.",
    url: "https://ntrs.nasa.gov/citations/20020085330",
    read: "the record through ntrs.nasa.gov/api/citations/20020085330 "
      + "(title, authors, date, distribution, copyright determination)",
    date: "2026-11-12",
  },
  {
    id: "codata",
    name: "CODATA Key Values for Thermodynamics",
    holds: "Internationally agreed enthalpies of formation, entropies and "
      + "H(298)-H(0) of key substances, each with its uncertainty.",
    access: "The table at codata.info; the book by Cox, Wagman and Medvedev "
      + "(Hemisphere, 1989).",
    cite: "Cox, Wagman and Medvedev (1989).",
    licence: "The page states no licence.  It says the use of the values "
      + "\u201cis encouraged in the analysis of thermodynamic measurements, "
      + "data reduction, and preparation of other thermodynamic tables\u201d.",
    cls: "no-grant",
    allows: "Cite a Key Value as the primary for that consensus value; "
      + "Choupo so far records them as cross-checks "
      + "(docs/design/what-water-dat-does-not-say.md:58).  Nothing on the "
      + "page grants copying the table.",
    url: "https://www.codata.info/resources/databases/key1.html",
    read: "the whole table page: its introduction, its reference and its "
      + "disclaimer; no licence or copyright statement appears on it",
    date: "2026-11-12",
  },
  {
    id: "sander",
    name: "Sander's compilation of Henry's law constants",
    holds: "46 434 Henry's law constants for 10 173 species in water, from "
      + "995 references (version 5.0.0).",
    access: "henrys-law.org (search, SQL and Fortran downloads); the article "
      + "in Atmos. Chem. Phys. 23 (2023).",
    cite: "Sander (2023), doi 10.5194/acp-23-10901-2023.  The site asks that "
      + "the 2015 paper no longer be cited.",
    licence: "The 2023 article: \u201cdistributed under the Creative "
      + "Commons Attribution 4.0 License\u201d.  The 2015 version 4.0: "
      + "Creative Commons Attribution 3.0.",
    cls: "open",
    allows: "Values may enter a public record with the attribution and the "
      + "changes stated, as data/standards/parameters/Henry/"
      + "benzonitrile-water.dat:10 does.",
    url: "https://acp.copernicus.org/articles/23/10901/2023/",
    read: "the article pages of acp-23-10901-2023 and acp-15-4399-2015 "
      + "(licence lines) and www.henrys-law.org (the citation request and "
      + "the database's size)",
    date: "2026-11-12",
  },
  {
    id: "chemsep",
    name: "ChemSep pure-component databank",
    holds: "Pure-component constants and temperature correlations.",
    access: "Inside ChemSep LITE (lite.zip at chemsep.org), the pcd/ folder.",
    cite: "The databank, per value; the primary source where the record "
      + "names one.",
    licence: "help/chemsep.lic (LITE 8.51): \u201cUse of the ChemSep Pure "
      + "Component Property Databank (and ONLY the ChemSep Pure Component "
      + "Property Databank) is governed by the Artistic License\u201d, and "
      + "\u201cSublicense of SOFTWARE to another party is not permitted.\u201d",
    cls: "open",
    allows: "Pure-component values, cited, are accepted (Artistic-2.0).  "
      + "The interaction-parameter tables (ipd/) are NOT covered: local only.",
    url: "http://www.chemsep.org/downloads/index.html",
    read: "help/chemsep.lic inside lite.zip, downloaded from the downloads "
      + "page (sha256 ffd2500d...150f); the pcd/ folder carries "
      + "Artistic_license_2_0.txt",
    date: "2026-11-12",
  },
  {
    id: "pubchem",
    name: "PubChem",
    holds: "Identity: names, CAS numbers, InChI and InChIKey, formulas, "
      + "structures; deposited data from many contributors.",
    access: "pubchem.ncbi.nlm.nih.gov and its PUG REST interface.",
    cite: "PubChem and the compound's CID, for identity.",
    licence: "PubChem's own pages could not be read on this date (a browser "
      + "challenge refused every automated request).  NCBI's policy page "
      + "says NCBI places no restrictions on its molecular databases, but "
      + "that submitters may claim rights NCBI cannot transfer.  PubChem is "
      + "not named there.",
    cls: "aggregator",
    allows: "Identity only: to join a name to a CAS number or an InChIKey.  "
      + "Never the source of a property value on this page.",
    url: "https://www.ncbi.nlm.nih.gov/home/about/policies/",
    read: "the Molecular Data Usage section of www.ncbi.nlm.nih.gov/home/"
      + "about/policies; pubchem.ncbi.nlm.nih.gov/docs/about and "
      + "/docs/citation-guidelines were NOT readable",
    date: "2026-11-12",
  },
];

/** The classes that cannot enter a public project, and why. */
export interface ExcludedRow { id: string; what: string; example: string; why: string; url?: string; read?: string; date?: string }

export const EXCLUDED: readonly ExcludedRow[] = [
  {
    id: "noncommercial",
    what: "NonCommercial compilations",
    example: "Burcat's Third Millennium thermochemical database (mirrored at "
      + "ReSpecTh): \u201cfree for use for non-commercial purposes on "
      + "condition that proper quotation is given to its source.  The "
      + "database cannot be used for commercial purposes without a written "
      + "agreement from the authors.\u201d",
    why: "Choupo is free for commercial use under the GPL, so a value under "
      + "a non-commercial restriction cannot ship in it, even cited.  The "
      + "name may appear as a cross-check only.",
    url: "https://respecth.elte.hu/burcat/Introduction%202005_.pdf",
    read: "the introduction of the 2005 edition (Introduction 2005_.pdf), "
      + "linked from respecth.elte.hu/index_th.php",
    date: "2026-11-12",
  },
  {
    id: "no-grant",
    what: "Compilations with no grant (all rights reserved)",
    example: "Commercial property databanks sold by subscription or with a "
      + "simulator; printed handbooks; any table whose page says nothing "
      + "about reuse.",
    why: "There is nothing to honour: no licence gives you the right to "
      + "copy the arrangement.  Read them, follow their references, cite "
      + "the primary.  Silence is not permission.",
  },
  {
    id: "laundered",
    what: "A restricted table re-published under an open licence",
    example: "An interaction-parameter table copied inside an MIT-licensed "
      + "code package, while the table's own header names a commercial "
      + "compilation.",
    why: "The open licence covers the packager's code, not the table.  "
      + "This is provenance laundering, and the value stays out.",
  },
];

// ---- 3 · the licence classes (the project's own policy) --------------------

/** One class: what you may do with a source of that class, and where the
 *  rule is written.  Read the cells as "yes", "no" or the condition. */
export interface LicenceClassRow {
  cls: LicenceClass;
  name: string;
  examples: string;
  read: string;
  cite: string;
  copyValues: string;
  redistribute: string;
  rule: string;
}

export const LICENCE_CLASSES: readonly LicenceClassRow[] = [
  {
    cls: "public-domain",
    name: "Public domain (a US government work)",
    examples: "NASA/TP-2002-211556",
    read: "yes", cite: "yes, as scholarly practice",
    copyValues: "yes, declaring `licence publicDomain;`",
    redistribute: "yes",
    rule: "bin/curate/check_source_licence.py:485",
  },
  {
    cls: "open",
    name: "Open licence, share-alike included (CC BY, CC BY-SA, Artistic-2.0)",
    examples: "Sander 2023; the ChemSep pure-component databank",
    read: "yes", cite: "yes, required",
    copyValues: "yes, with attribution, share-alike honoured on that data, "
      + "changes stated",
    redistribute: "yes, under its own licence",
    rule: "docs/architecture/settled-contracts.md:3471",
  },
  {
    cls: "aggregator",
    name: "Aggregator with no grant (it compiles others' measurements)",
    examples: "the WebBook, the Solubility Data Series, the ThermoML archive",
    read: "yes", cite: "the primary; the aggregator as the route",
    copyValues: "only the primary measurement, read through it and cited "
      + "to the original paper",
    redistribute: "no",
    rule: "CLAUDE.md:726",
  },
  {
    cls: "noncommercial",
    name: "NonCommercial",
    examples: "the Burcat database; CC BY-NC data",
    read: "yes", cite: "as a cross-check only",
    copyValues: "no, not even cited",
    redistribute: "no",
    rule: "docs/architecture/settled-contracts.md:3477",
  },
  {
    cls: "no-grant",
    name: "No grant, or a licence that excludes the use",
    examples: "commercial databanks; ChemSep's interaction-parameter tables",
    read: "yes, if you have access", cite: "yes",
    copyValues: "no: local only, in your private data/local/",
    redistribute: "no",
    rule: "bin/curate/check_source_licence.py:337",
  },
];

// ---- 5 · the worked example -------------------------------------------------

/** One line of the example record, quoted as it stands in the file, with
 *  what it tells a reader.  The test reads each line back from the file. */
export interface RecordLine { line: number; text: string; means: string }

export const RECORD_LINES: readonly RecordLine[] = [
  { line: 52, text: "origin        fitted;",
    means: "The parameters were fitted to measurements; they were not measured." },
  { line: 55, text: "fittedInCase  \"data/curation/pairs/dimethylCarbonate-methanol\";",
    means: "The case that reproduces the fit.  Anybody can rerun it." },
  { line: 56, text: "reviewStatus  autoPromoted;",
    means: "A pipeline promoted it, by a rule declared before the fit." },
  { line: 57, text: "humanReviewed false;",
    means: "No person has read the series back against the articles yet.  "
      + "The engine says so on every run that reads the pair." },
  { line: 61, text: "reuse         \"Choupo's own regression; the measured points belong to the cited articles and are not reproduced in this record or this tree\";",
    means: "The licence position, in one line: the parameters are Choupo's, "
      + "the data are the authors'." },
  { line: 69, text: "doi       \"10.1021/je0601309\";",
    means: "The fit set: the primary article, by its DOI." },
  { line: 70, text: "sha256    \"6ddd13da5f82956b17e5ae2526f704058dfcbf03b90e50716fb5a7cf3d47836d\";",
    means: "The fingerprint of the archive file the points were read from.  "
      + "A different file refuses." },
  { line: 76, text: "role      validation;",
    means: "The second article is held out: the fit never saw it." },
  { line: 78, text: "doi       \"10.1021/je301290c\";",
    means: "A different laboratory, seven years later." },
  { line: 93, text: "nDataPoints   65;",
    means: "How many points the fit used." },
  { line: 99, text: "temperature { min 314.41 K; max 348.58 K; }",
    means: "Where the pair is valid.  Outside it, an extrapolation." },
  { line: 107, text: "verdict     validated;",
    means: "The held-out points met the band declared before the fit." },
  { line: 112, text: "aad_pct     0.064080;",
    means: "Held-out average deviation, per cent of T: step 5's formula." },
  { line: 119, text: "maxAAD      0.088000;   // per cent",
    means: "The band: the held-out study's U95 over its mean T." },
];

/** The NIST per-article URLs the example's case declares (the record names
 *  the DOIs; the case names where each article file is served). */
export const EXAMPLE_URLS: readonly { line: number; url: string }[] = [
  { line: 27, url: "https://trc.nist.gov/ThermoML/10.1021/je0601309.xml" },
  { line: 45, url: "https://trc.nist.gov/ThermoML/10.1021/je301290c.xml" },
];

/** The acceptance band of the example, as its record states the rule
 *  (EXAMPLE_RECORD:120): the held-out study's expanded uncertainty over its
 *  mean bubble temperature, in per cent, rounded UP to two significant
 *  figures.  Closed-form arithmetic printed with its constants. */
export const BAND_U_K = 0.3;
export const BAND_TMEAN_K = 341.73;
export function bandPct(U: number, Tmean: number): number { return 100 * U / Tmean; }
export function roundUp2(x: number): number {
  const p = Math.pow(10, 1 - Math.floor(Math.log10(Math.abs(x))));
  return Math.ceil(x * p - 1e-9) / p;
}

// ---- the steps ---------------------------------------------------------------

export const DS_STEPS: readonly LessonStep[] = [
  {
    n: 1,
    title: "Three questions pick the source",
    body: "Before searching, write down which property, of which system, at "
      + "which conditions.  A critical temperature is one number; a vapour "
      + "pressure is a curve that must cover your temperatures; a mixture "
      + "needs data on that pair, near your pressure.  Each answer points to "
      + "a different kind of source, and the table below says where to look "
      + "first.",
  },
  {
    n: 2,
    title: "A source is three things",
    body: "For every source, ask what it holds, how you reach it, and what "
      + "its licence lets you do.  The third question has a written answer "
      + "on the source's own page, and that page is the only place to read "
      + "it.  Each row below was read on its own page, on the date shown.",
  },
  {
    n: 3,
    title: "Read, cite, copy, redistribute",
    body: "These are four different permissions.  Anything public may be "
      + "read and cited.  Copying a value into a record that others "
      + "download, and passing on the whole table, need a licence that "
      + "grants them.  The table is Choupo's own policy, with the line where "
      + "each rule is written.",
    note: "The rule behind the whole table: cite the PRIMARY source per "
      + "value, never the aggregator's arrangement "
      + "(docs/architecture/settled-contracts.md:3482).",
  },
  {
    n: 4,
    title: "Measured, fitted, estimated",
    body: "A measured value comes from an experiment.  A fitted value is a "
      + "parameter adjusted to measurements, valid only where they were.  "
      + "An estimated value comes from a method, such as group contribution, "
      + "with a typical error and no measurement behind it.  Choupo's "
      + "records declare which, and the engine reads the word "
      + "(src/core/Origin.H:51).",
    note: "Ask each value: measured by whom; fitted to what, over which "
      + "range; estimated by which method, with what typical error.  The "
      + "page before this one shows estimation at work.",
  },
  {
    n: 5,
    title: "Uncertainty travels with the number",
    body: "A measurement carries its uncertainty; a fit carries its "
      + "deviation from points it never saw.  Choupo's pair fits report the "
      + "average absolute deviation on the held-out points "
      + "(src/propertyOps/FitParameters.cpp:1538):",
    formula: String.raw`\mathrm{AAD} = \frac{100}{N}\sum_{k=1}^{N}\frac{\lvert T_{\mathrm{calc},k} - T_{\mathrm{meas},k}\rvert}{T_{\mathrm{meas},k}}`,
    where: [
      { sym: "\\mathrm{AAD}", means: "the average absolute deviation", unit: "%" },
      { sym: "N", means: "the number of held-out points" },
      { sym: "k", means: "the index of a point" },
      { sym: "T_{\\mathrm{calc},k}", means: "the bubble temperature the model computes at point k", unit: "K" },
      { sym: "T_{\\mathrm{meas},k}", means: "the bubble temperature measured at point k", unit: "K" },
    ],
    note: "A fit is accepted against a band declared BEFORE it, from the "
      + "measurement's own uncertainty; a band chosen after the fit proves "
      + "nothing.",
  },
  {
    n: 6,
    title: "Cite the measurement, not the compiler",
    body: "A compilation is where you found a value; the paper is where it "
      + "was measured.  Cite the paper, so a reader can check the "
      + "conditions, the purity and the uncertainty.  Citing the compiler "
      + "copies its arrangement, hides the conditions, and can carry a "
      + "transcription error you never saw.",
  },
  {
    n: 7,
    title: "A real record, read line by line",
    body: "The NRTL pair methanol + dimethyl carbonate in Choupo's public "
      + "catalogue is a fitted record whose measurements belong to two "
      + "articles.  Each line below is quoted from the file; the number is "
      + "its line.  The record keeps the DOIs and the fingerprints, never "
      + "the points.",
    note: "The engine voices the review status of every pair it reads "
      + "(src/thermo/PairAudit.H:112).  Some newer records also carry a fit "
      + "grade, for example data/standards/parameters/NRTL/"
      + "124Trimethylbenzene-2Pentanol.dat:63.",
  },
];

// ---- 6 · the exercise ------------------------------------------------------

/** The four decisions a student can take about a datum. */
export const DS_CHOICES = ["enter", "primary", "local", "out"] as const;
export type DsChoice = typeof DS_CHOICES[number];

export const DS_CHOICE_WORD: Record<DsChoice, string> = {
  enter: "Enter it, cited",
  primary: "Find the primary first",
  local: "Local only",
  out: "Cross-check only",
};

/** A datum a student might want for a project.  All are invented
 *  situations built on the real sources above. */
export interface ExerciseCase {
  id: string;
  datum: string;
  source: SourceRow["id"] | "burcat" | "ipd";
  answer: DsChoice;
  why: string;
}

export const DS_EXERCISE: readonly ExerciseCase[] = [
  {
    id: "henry-co2",
    datum: "Henry's constant of CO2 in water at 298 K, from Sander's 2023 "
      + "compilation.",
    source: "sander", answer: "enter",
    why: "CC BY 4.0: enter it with the citation and say what you changed "
      + "(units, form of the temperature dependence).",
  },
  {
    id: "webbook-psat",
    datum: "A vapour-pressure equation shown on a WebBook page, with a "
      + "journal reference below it.",
    source: "webbook", answer: "primary",
    why: "The WebBook reserves its compilation.  Read the referenced "
      + "paper, check its range, and cite the paper.",
  },
  {
    id: "ipd-nrtl",
    datum: "An NRTL pair from ChemSep's interaction-parameter table.",
    source: "ipd", answer: "local",
    why: "The Artistic licence covers ONLY the pure-component databank; "
      + "the tables are not covered.  Use it in your private data/local/.",
  },
  {
    id: "burcat-hf",
    datum: "An enthalpy of formation from the Burcat database.",
    source: "burcat", answer: "out",
    why: "Non-commercial only.  Compare against it; take the value from the "
      + "NASA Glenn report or the CODATA Key Values instead.",
  },
  {
    id: "chemsep-tc",
    datum: "A critical temperature from ChemSep's pure-component databank.",
    source: "chemsep", answer: "enter",
    why: "Artistic-2.0 covers the pure-component databank: enter it per "
      + "value, cited, and its primary where the record names one.",
  },
  {
    id: "thermoml-vle",
    datum: "Bubble-point data for your pair, found in the ThermoML archive.",
    source: "thermoml", answer: "primary",
    why: "The archive locates; the article is the source.  Cite the DOI, "
      + "fit your own parameters, and keep the points out of the tree.",
  },
];

/** The walk for the student's OWN datum, in order. */
export const DS_WALK: readonly string[] = [
  "Which property, which system, which conditions?  Write them down.",
  "Is the value measured, fitted or estimated?  If fitted or estimated: "
    + "fitted to what, estimated how, valid where?",
  "Where was it measured?  Find the original paper and its DOI.",
  "What does the licence on the source's own page say, and on what date "
    + "did you read it?",
  "Which class is that (the table in step 3)?  It decides: enter it "
    + "cited, enter the primary, keep it local, or use it only to check.",
  "Write the answer into the record: origin, source, licence, uncertainty, "
    + "validity range.",
];

// ---- the limits ------------------------------------------------------------

export const DS_LIMITS: readonly LessonLimit[] = [
  {
    id: "not-legal-advice",
    title: "This is not legal advice",
    body: "The page reports what each source's own page said on the date "
      + "shown and what Choupo's policy does with it.  Licences change; "
      + "read the page again before you rely on it.",
  },
  {
    id: "not-a-ranking",
    title: "Not a ranking of sources",
    body: "The map lists free sources a student can reach.  It does not "
      + "judge which is more accurate for a given substance.",
  },
  {
    id: "pubchem-unread",
    title: "One licence was not verified",
    body: "PubChem's own terms page could not be read on 2026-11-12.  The "
      + "page uses PubChem for identity only and claims no licence for it.",
  },
];

// ---- citations the page makes, read back by the test -----------------------

/** Every file:line the page names, with a fragment that line must contain.
 *  gui/tests/dataSourcesLesson.test.ts opens each one.  Paths are relative
 *  to the repository root. */
export const CITATIONS: readonly { file: string; line: number; contains: string }[] = [
  { file: "src/core/Origin.H", line: 51, contains: "enum class Origin" },
  { file: "src/propertyOps/FitParameters.cpp", line: 1538, contains: "aadHeldOut   +=" },
  { file: "src/thermo/PairAudit.H", line: 112, contains: "autoPromoted" },
  { file: "data/standards/parameters/NRTL/124Trimethylbenzene-2Pentanol.dat", line: 63, contains: "fitGrade" },
  { file: "data/standards/parameters/Henry/benzonitrile-water.dat", line: 10, contains: "CHANGES (indicated per CC-BY)" },
  { file: "docs/design/what-water-dat-does-not-say.md", line: 58, contains: "CODATA" },
  { file: "thirdParty/thermoml/README.md", line: 30, contains: "Bulk import" },
  { file: "docs/architecture/settled-contracts.md", line: 3471, contains: "**DATA**" },
  { file: "docs/architecture/settled-contracts.md", line: 3477, contains: "NonCommercial" },
  { file: "docs/architecture/settled-contracts.md", line: 3482, contains: "PRIMARY" },
  { file: "CLAUDE.md", line: 726, contains: "aggregator" },
  { file: "bin/curate/check_source_licence.py", line: 337, contains: "EXCLUDED_TABLES" },
  { file: "bin/curate/check_source_licence.py", line: 485, contains: "ACCEPTED_PUBLIC_DOMAIN" },
  { file: EXAMPLE_RECORD, line: 120, contains: "rounded UP to two significant figures" },
];
