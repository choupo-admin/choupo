#!/usr/bin/env python3
"""THE ONE HOME for every accepted violation in the project.

    bin/curate/debt_registry.py

WHY THIS EXISTS.  A pin is a **waiver**: a decision to tolerate a known
violation, taken once, that then silently outlives the reason for it unless
someone goes looking.  There are 90 `check_*` scripts under `bin/curate/`, and
the waivers were scattered across eight of them as ad-hoc module-level
constants -- `PINNED`, `PINS`, `PINNED_UP`, `ALLOW`.

That is **the arity doctrine violated by the machinery built to enforce it**.
The project's own rule is that a derived fact has exactly one home, and "the
set of violations this project has agreed to live with" is exactly such a
fact.  Nobody could answer *"what are we currently tolerating?"* without
reading eight files, and the answer was the thing most worth asking.

Raised by an external review (2026-08-05), which put it well: the gates are
"beginning to form a shadow architecture", and known-violation pin lists are
legitimate waivers that "should eventually become a unified architectural-debt
registry rather than separate ad hoc arrays embedded in gates".

WHAT A REGISTRY ENTRY OWES THE READER.  Every waiver carries:

  * `why`      -- what is wrong, in the terms a curator would need;
  * `remedy`   -- what removing it actually requires;
  * `blocked`  -- what stands in the way TODAY, or None if it is simply work.

The `remedy` field is the one that matters.  A pin without a stated exit is
indistinguishable from a decision to keep the defect for ever, and this
project has explicitly refused several fixes (inventing a citation, choosing
between two contradictory permeabilities) on the grounds that a VISIBLE GAP IS
STRICTLY BETTER THAN AN INVISIBLE FALSEHOOD.  That reasoning only holds while
the gap stays visible, which is what this file is for.

WHAT IS *NOT* HERE, deliberately.  Configuration that merely tells a gate
where to look (`SCAN`, `ALLOWED_PATHS`, superscript tables) is not a waiver
and stays with its gate.  The distinction is whether the entry EXCUSES A
KNOWN VIOLATION or merely parameterises a search.

STALENESS IS ENFORCED BY THE GATES, NOT HERE.  Each gate that reads a waiver
list must fail when a pin no longer fires -- a pin outliving its violation is
a licence.  This file holds the entries; the gates prove they are still true.
"""

# ---------------------------------------------------------------------------
#  DATA PROVENANCE
# ---------------------------------------------------------------------------

#  Aqueous species records that declare thermochemistry (hfAq / sAq / cpAq)
#  with no source, citation or origin field anywhere in the file.
#
#  NOT FIXED BY WRITING A PLAUSIBLE REFERENCE.  An invented citation converts
#  "unsourced" into "falsely sourced", and the second is undetectable by any
#  reader or tool.  This list IS the curation work-list.
SPECIES_WITHOUT_CITATION = {
    "Zn", "Al", "BOH4", "Cd", "CuI", "CuII", "FeII", "FeIII", "H3BO3",
    "H4SiO4", "HS", "HTart", "MnII", "NH4", "NO2", "Pb", "Tart",
    #  The 2026-08-05 audit named SEVENTEEN.  There are eighteen: the gate
    #  found Acetate.dat on its first run.  A hand-compiled list of violations
    #  is itself a hand-maintained derived fact, and it was already one short
    #  on the day it was written.  The gate recounts; the list remembers.
    "Acetate",
}

#  Records whose SOURCE does not meet the project's licence/provenance
#  protocol.  Each names what is wrong and what removing it costs.
#  H3PO4.dat LEFT 2026-11-12 (DEV.md 4c C335): its dHf_298, s_298 and Cp(298)
#  are now NASA/TP-2002-211556 Table B2's (public domain; -1284.488 kJ/mol,
#  0.09 kJ/mol from the CRC number it held), with Wagman et al. 1982's
#  -1279.0 kept as a cross-check that enters no value.  No case reads it.
SOURCE_LICENCE = {
    "data/standards/components/methylAcetate.dat":
        "calls NIST WebBook / DIPPR-class compilations 'Primary data' -- the "
        "aggregator AS the authority, and no primary is named for Tc/Pc/omega/"
        "Tb/Hvap/dHf_298.  Either re-source from primaries or demote the "
        "record to data/local/.",
    "data/standards/parameters/NRTL/ethanol-water.dat":
        "'Curated from DECHEMA by V. Geraldes' over the VLE-IG bank -- direct "
        "transcription, the form the protocol names.  The bulk of the pair "
        "catalogue already moved to data/local/ in the legal scrub; this one "
        "survived and should follow.",
    "data/standards/parameters/SRK/N2-CH4.dat":
        "BORDERLINE, awaiting a ruling: cites Knapp, Doering, Oellrich, "
        "Ploecker & Prausnitz (1982) -- named authors of a published monograph "
        "that happens to appear in the DECHEMA series.  A named monograph is "
        "arguably a primary publication, not a databank transcription.  Ruled "
        "either way it should be explicit, not incidental.",
}

#  NC_COMPILATION -- values whose ORIGIN is a NonCommercially-licensed
#  compilation.  A DIFFERENT SHAPE from SOURCE_LICENCE above, and the
#  difference is why it needs its own list.
#
#  For an aggregator (NIST WebBook, CRC) the question is authority-vs-route:
#  a primary read THROUGH one is compliant, because the value came from the
#  journal article and the aggregator is only where somebody looked.  For a
#  NonCommercial compilation there is no route that rescues it -- the
#  arrangement IS what was copied, and the protocol says "do not enter their
#  numbers, even cited".  So `via Burcat` is not a defence; only Burcat as a
#  CROSS-CHECK (entering no value) is, and OH.dat is the one record that
#  does that.
#
#  WHETHER "Burcat 2005 / JANAF" IS A CITABLE PUBLICATION -- read 2026-09-03.
#  Eight records cite it in that form beside the twenty-five that name
#  BURCAT.THR outright.  "Burcat 2005" is Burcat & Ruscic, *Third Millennium
#  Ideal Gas and Condensed Phase Thermochemical Database for Combustion*,
#  ANL-05/20 / TAE 960 (2005): the report that DESCRIBES the database, whose
#  tables ARE the database.  Citing the report is citing the compilation
#  under its publication name, so those eight are the same class as the
#  twenty-five and stay in this list.  The remedy is unchanged and is a
#  curation act (re-sourcing from NASA TM-4513 / ATcT); nothing here changes
#  a value.
#
#  THE LICENCE, read at ReSpecTh (which now hosts the database): "provided
#  free of charge for non commercial use, on condition that proper quotation
#  will be included in the pertinent publications."  NonCommercial is on
#  CLAUDE.md 10's excluded list REGARDLESS of copyleft, against Choupo's
#  free-for-commercial ethos.
#
#  NOT FIXED HERE, and the reason is the usual one.  Deleting 36 curated
#  records removes the entire radical/sulfur/chlorine pool six Gibbs
#  tutorials are built on; re-fitting them from a clean source is a curation
#  act with a primary in hand, and inventing replacement numbers to close a
#  licence gap would put a fabrication where a measured value belongs.  It
#  is also not mine to rule: whether the Burcat 2005 PUBLICATION is a
#  citable paper distinct from the database file is a legal reading, and
#  both answers are defensible.  Vitor decides; the pin keeps the question
#  visible until he does.
#
#  REMEDY, the same for every entry and already established in the tree:
#  bin/curate/import_gibbs_nasa.py names NASA TM-4513 (McBride, Gordon &
#  Reno 1993 -- a US government work, public domain) as the clean route for
#  dHf_298/s_298/Cp, and ATcT (DOE, versioned OSTI DOI, no NC clause) for
#  dHf.  Re-import each species from there and the pin goes.
#  PARTLY DISCHARGED 2026-11-01 (DEV.md 4c C170 item 4).  Sixteen records
#  were re-sourced from NASA/TP-2002-211556 (US government work, public
#  domain; `bin/curate/nasa_tp2002_to_choupo.py`) because the report carries
#  the same species and AGREES with the value the record held to dHf 0.5
#  kJ/mol, s 0.02 J/(mol K) and Cp 2 % over the record's own Trange: C, CH3,
#  CS, CS2, Cl, H, H2O2, HO2, N, N2H4, NH, O, S, S2, SO, SO3.  What is left
#  below is left for a REASON the migration measured, never for want of
#  trying: the report has no entry under that formula (C3H3, C3H5, C4H2,
#  C4H4, C5H5, C6H5, CH3CO, CH3O2, HONO, HSO, HSO3, N2H3 -- or only isomers
#  whose identity the record does not state), or it has one that DISAGREES
#  (C2O dHf +87.8 kJ/mol, N2H2 +89.1 kJ/mol, NH2 +2.9, NO3 +3.5, SH s +0.20,
#  ClO s +8.3, HOCl s +0.40, O3 Cp 3.0 %).  A disagreement is a fact for a
#  curator (a different isomer or state?), not a number to choose.  The
#  sealed MIRRORS of these records under tutorials/ (31 files) are outside
#  `check_source_licence`'s scan and still carry the old values; refreshing
#  them is a re-import and moves goldens (Vitor's list).
#  DISCHARGED FURTHER 2026-11-12 (DEV.md 4c C335).  Thirteen of the twenty
#  were re-sourced from the same report, this time INCLUDING the ones that
#  disagree: C2O, C3H3, C4H2, C6H5, CH3CO, ClO, HOCl, HONO (the report's HNO2),
#  N2H2, NO3, SH, NH2, O3.  Two disagreements were the RECORD's fault (C3H3 and
#  N2H2 held another isomer's value under their own name); C2O's is the
#  report's (a JANAF-era dHf about 88 kJ/mol below modern determinations) and
#  is kept, marked interim with that reason.  No shipped case reads any of the
#  twenty, so no golden moved.  ATcT was NOT used: neither its site nor its
#  OSTI dataset records (DOI 10.17038/CSE/3703591) state any licence, and the
#  authors are contractor staff, so 17 U.S.C. 105 does not apply -- silence is
#  not a grant (CLAUDE.md 6, the sigma-profile rule).  The seven left:
NC_COMPILATION = {
    "data/standards/components/C3H5.dat":
        "the report has an allyl entry (`C3H5,allyl`), but its OWN source line for it is 'Burcat,2001 p58' -- the NonCommercial compiler's earlier report; taking the value through NASA would launder it (C335, 2026-11-12).  Remedy: a primary for allyl outside that compilation, or Vitor's ruling on whether a public-domain republication frees it.",
    "data/standards/components/C4H4.dat":
        "the record is VINYLACETYLENE; the report's only C4H4 entry is 1,3-cyclobutadiene, a different molecule (C335, 2026-11-12).  Remedy: a clean primary for vinylacetylene, or removal (no shipped case reads this record).",
    "data/standards/components/C5H5.dat":
        "the report has no C5H5 entry (C335, 2026-11-12).  Remedy: a clean primary for cyclopentadienyl, or removal (no shipped case reads this record).",
    "data/standards/components/CH3O2.dat":
        "the report has no CH3O2 (methylperoxy) entry, only CH3OOH (C335, 2026-11-12).  Remedy: a clean primary, or removal (no shipped case reads this record).",
    "data/standards/components/HSO.dat":
        "the report has no HSO entry (C335, 2026-11-12).  Remedy: a clean primary, or removal (no shipped case reads this record).",
    "data/standards/components/HSO3.dat":
        "the report has no HSO3 entry (C335, 2026-11-12).  Remedy: a clean primary, or removal (no shipped case reads this record).",
    "data/standards/components/N2H3.dat":
        "the report has no N2H3 entry (C335, 2026-11-12).  Remedy: a clean primary, or removal (no shipped case reads this record).",
}

#  basis01_two_unit_chain LEFT 2026-11-12 (C335): the importer's validator
#  read `energyClosures` as a dict; fixed, re-imported, no row moved.
#
#  NO_GRANT_CASE_LOCAL -- case-local records naming a no-grant compilation
#  (Engineering Toolbox, REFPROP) as the origin of a value (2026-10-11, DEV.md
#  4c C65 item c).  Every entry is a SEALED MIRROR of
#  data/standards/components/NH3.dat as it stood before C65: its
#  liquidViscosity was an Andrade fit to the Engineering Toolbox
#  saturated-liquid table, and, measured against the reference correlation
#  (Monogenidou, Assael & Huber, J. Phys. Chem. Ref. Data 47, 023102 (2018),
#  Table 6), wrong by -28 % at 200 K and +29..+86 % from 260 to 320 K.  The
#  catalogue record now carries a fit to that Table 6; each mirror keeps the
#  old block until its case is RE-IMPORTED (bin/choupo-import), and a
#  re-import moves goldens (C65's measured list), so it is Vitor's list under
#  CLAUDE.md 10, not a sweep this registry may take.
#
#  REMEDY, the same for every entry: re-import the case from the corrected
#  catalogue record (or edit the mirror's liquidViscosity block and re-seal),
#  after the moved rows are shown; the pin then goes STALE and must leave.
#
#  DISCHARGED 2026-10-20 (DEV.md 4c C112 item 7): the two witnesses of the
#  letdown EduTool, letdown01_ammonia_flashing and
#  letdown02_valve_fluid_properties, were re-imported with bin/choupo-import
#  and their pins left.  letdown02's re-import moved no number; letdown01's
#  moved the twelve valve density / volumetric-flow KPIs its golden pins,
#  listed for Vitor before any record.
#  DISCHARGED 2026-11-12 (DEV.md 4c C335): twenty more cases were re-imported
#  with bin/choupo-import, each validated against its own golden by the
#  importer and then by `bin/runTests --scope` (PASS, nothing re-recorded).
#  The five left REFUSED: the four green-ammonia plants because their
#  re-import moves golden rows (listed in
#  docs/reviews/2026-11-12-licence-debts-moved-rows.md, Vitor's list), and
#  basis01_two_unit_chain because the importer's own validator crashes on
#  its `closure` rows (AttributeError: `energyClosures` is a list there),
#  so nothing could be staged.
NO_GRANT_CASE_LOCAL = {
    "tutorials/plant/greenAmmonia03_basicDesign/constant/components/NH3.dat":
        "sealed NH3 mirror; Engineering Toolbox viscosity fit -- re-import.",
    "tutorials/plant/greenAmmoniaPEQ_baseCase/constant/components/NH3.dat":
        "sealed NH3 mirror; Engineering Toolbox viscosity fit -- re-import.",
}

#  INVERTED_VALIDITY_WINDOWS -- REMOVED 2026-08-05, the waiver is discharged.
#
#  Six records declared `Trange (hi lo)` with hi <= lo and the engine merely
#  ANNOUNCED them.  The gap underneath was that a curator with no recoverable
#  window had no way to SAY so: omitting the key is indistinguishable from
#  never having considered it, so an impossible interval was the only available
#  signal.  `Trange unknown;` is that missing form.  All six declare it, and
#  `PolynomialCp` now REFUSES an inverted interval at construction.
#
#  Worth recording HOW this entry came out: it was not remembered.  The gate
#  stopped importing it, and `check_debt_registry`'s orphan arm failed the
#  build -- "a waiver nobody consults is not a waiver".  A registry that makes
#  a discharged waiver impossible to leave lying around is doing the job a
#  scattered pin list could not.

# ---------------------------------------------------------------------------
#  STRUCTURE
# ---------------------------------------------------------------------------

#  Upward subsystem edges (invariant I17).
#
#  EMPTY SINCE 2026-08-05, and that is the point: debts D1, D2, D4, D6 and D7
#  were paid, so `check_layering` ASSERTS I17 rather than bounding it.  Kept as
#  an empty set rather than deleted, because an empty waiver list is a claim --
#  "nothing is excused" -- and deleting it would leave that claim unstated.
LAYERING_UPWARD_EDGES = set()

#  Subsystem cycles (invariant I18).  ACCEPTED, not debt.
LAYERING_ACCEPTED_CYCLES = {
    frozenset(("solver", "thermo")):
        "Michelsen's stability test is a thermodynamic criterion solved "
        "numerically; `solver` and `thermo` genuinely need each other, and "
        "breaking the dependency would cost a worse abstraction than the "
        "cycle.  Ruling module-boundaries.md §7.3.  Listed rather than "
        "silently tolerated so the stale-pin arm still covers it: an "
        "acceptance that outlives its subject is a licence.",
}

# ---------------------------------------------------------------------------
#  RECORD SELF-CONSISTENCY
# ---------------------------------------------------------------------------

#  Components whose declared Tb disagrees with their OWN Antoine set by more
#  than 3 % in Psat(Tb), with Tb INSIDE the record's declared Trange
#  (2026-08-22 fresh-eyes audit; value = the observed deviation in %, sign
#  kept so a defect that MOVES is also a finding).
#  Why tolerated: deciding WHICH half of each record is wrong needs primary
#  literature -- unsourced must never become falsely sourced, so the values
#  stay until a curator opens the primaries.  Remedy: fix Tb or the Antoine
#  coefficients from a primary source and remove the pin (the stale-pin arm
#  in check_tb_antoine fails a pin that heals).  Blocker: literature access.
#  dimethylSulfoxide (registered 2026-11-12, DEV.md 4c C367; -3.8 %: the
#  record's Tb 462.15 K, a ChemSep value, against its fitted Antoine, whose own
#  normal boiling point is 463.63 K).  The archive holds TWO POPULATIONS of
#  measurements that disagree by about 1.4 K.  (a) Eleven articles report a
#  normal boiling temperature or a boiling temperature at about 1 atm,
#  461.92-463.85 K, median 462.19 K: 10.1016/j.fluid.2008.09.010 (461.92 K),
#  j.fluid.2014.04.025 (462.18), j.fluid.2015.08.014 (462.24 at 101.3 kPa),
#  j.jct.2007.04.004 (462.19), j.jct.2019.05.005 (463.17), j.tca.2007.08.008
#  (462.19), 10.1021/acs.jced.7b00241 (463.85), acs.jced.8b00225 (462.16),
#  je100033s (462.06), je4006739 (462.25), je700408x (462.19); two more give
#  462.19 K at 95.3 kPa (j.fluid.2007.10.017) and 461.55 K at 96.6 kPa
#  (j.tca.2017.05.005).  (b) The pure-DMSO end of the vapour-liquid studies at
#  101.3 kPa, 463.17-464.0 K, median 463.38 K: 10.1016/j.fluid.2015.07.029
#  (464.0), j.fluid.2015.09.039 (463.75, at x = 0.011), j.jct.2019.03.036
#  (463.27), j.jct.2019.05.005 (463.17), 10.1021/acs.jced.6b00040 (463.38);
#  and the Psat points of 10.1021/je400531a at 463.43-463.45 K / 101.3 kPa,
#  which the record's clean fit (max 0.79 %, 49 points) follows.  Why
#  tolerated: which population is the pure liquid's boiling point depends on
#  the purity (water lowers it) and the method of each article, which only a
#  reading of the articles settles; the fit is NOT redone to meet the gate and
#  Tb is NOT changed to meet the fit.  Remedy: a human reads the articles'
#  purity and method statements, then fixes Tb or the curve and removes the pin
#  (the stale-pin arm fails a pin that heals).  Blocker: reading the articles.
#  methylDiEthanolAmine (registered 2026-11-12, DEV.md 4c C367; -11.1 %: the
#  record's Tb 520.15 K against its fitted Antoine, whose own normal boiling
#  point is 524.75 K).  The Tb is NOT the wrong half: it agrees with the two
#  points measured near 1 atm (10.1021/je060269j: 519.70 K at 98.59 kPa;
#  10.1021/je400373d: 520.28 K at 101.3 kPa).  The curve is the compromise of
#  laboratories that disagree by up to 30 % at the same temperature:
#  10.1021/je800290k reads 6.48 kPa at 430.48 K, 10.1021/acs.jced.8b00054 reads
#  5.00 kPa at 430.52 K (the latter is the point the outlier rule discards);
#  the fit stays severe (max 10.7 %) even inside the declared 2 bar window
#  (C367, which left out 7 points of je060269j above 200 kPa).  Why tolerated:
#  which laboratory is right is a judgement about each article's sample and
#  method that no tool makes.  Remedy: a reviewer reads the four articles and
#  sets studies aside BY NAME in the case, then refits and removes the pin.
#  Blocker: reading the articles.
#
#  ethylLactate (registered 2026-11-12, C367; +6.2 %: Tb 426.1 K, the
#  10.1016/j.fluid.2015.12.029 entry at 101.3 kPa, against a curve whose own
#  normal boiling point is 424.05 K).  Three laboratories disagree by 6-10 % at
#  the same temperature: 10.1016/j.tca.2013.11.010 reads 0.436 kPa at 303.15 K
#  where 10.1016/j.jct.2018.07.029 interpolates (0.3751 kPa at 302.5 K, 0.4491
#  at 304.5 K) to 0.398 kPa (tca 9.6 % higher), and jct.2018.07.029 reads
#  0.6892 kPa at 311.3 K where tca.2013.11.010 interpolates (0.603 kPa at
#  308.15 K, 0.829 at 313.15) to 0.737 kPa (jct 6.5 % lower); at 1 atm
#  fluid.2015.12.029 (93.32 kPa at 423.47 K) and tca.2013.11.010 (92.51 kPa at
#  423.15 K) agree with each other and sit above the minimax compromise.  No
#  point exceeds 2 bar, so the C367 window cannot help.  Remedy as above: a
#  reviewer reads the articles and sets studies aside by name.  Blocker:
#  reading the articles.
#
#  squalane (registered 2026-11-12, C367; +9.4 %: Tb 686.4 K against a curve
#  whose own normal boiling point is 682.26 K).  The one article
#  (10.1016/j.jct.2019.03.032, correlation gas chromatography) spans 1.5e-9 to
#  101.325 kPa -- ten and a half decades of pressure, 298.15-686.4 K -- with ONE
#  extrapolated 1-atm entry (686.4 K) above a table that ends at 600 K, 12 kPa.
#  A three-parameter Antoine cannot hold it; no point exceeds 2 bar, so the
#  C367 window cannot help.  Remedy: a pressure FLOOR decided by a reviewer
#  (fitWindow pressureMin, with its reason), or a wider correlation form.
#  Blocker: a reviewer's decision.
#
#  NOTE ON THE NUMBER: the gate fails a pinned record whose deviation moves by
#  more than 0.5 percentage points in EITHER direction (a defect that moves is a
#  finding), and a pin that heals below 3 % fails as stale.
TB_ANTOINE_PINNED = {   # 13 records fixed 2026-08-23 from properly-licensed
    #  sources (Poling App. A / Landolt-Boernstein / curation fits to McGarry
    #  and Perry curves); H2S's Tb was the wrong half there.
    "dimethylSulfoxide": -3.8,
    "methylDiEthanolAmine": -11.1,
    "ethylLactate": 6.2,
    "squalane": 9.4,
}

#  SPECIFICATION-SHEET UNIT WORDS CHOUPO'S OWN PARSER CANNOT READ (2026-09-07).
#
#  A design sheet's header says "It is a Choupo dictionary: every value carries
#  the unit it is in, named as the dict grammar names it."  Three unit words in
#  the sizers made that false, and they were found the day the FIRST reader of
#  a sheet was written -- which is what `check_design_sheet` said in its own
#  blind-spot list would find them: "a writer whose output the reader refuses
#  is a bug in BOTH, and nothing here would catch a grammar the C++ parser
#  rejects".  Verified by hand against the engine, not read off the tokenizer:
#  a case dict carrying `U 600.0 W/(m2.K);` gives
#      ERROR: system/postDict:45:41: unknown unit suffix 'W/' after scalar
#      value of 'U'.  Known units listed in core/Units.H.
#
#  ONE OF THE THREE IS FIXED AND IS NOT HERE.  `ShellTubeHX` declared
#  `W/(m2.K)`; `core/Units.cpp` names the SAME unit at the SAME factor 1.0 as
#  `W/m2/K`, which the tokenizer can deliver, so the spelling changed and NO
#  number moved.  `docs/ai/dict-syntax.md` already called that "the one
#  parseable spelling".
#
#  THE OTHER TWO (`um`, `rpm`) STAYED PINNED FOR TWO MONTHS because the only
#  remedy named here converted the VALUE (to `m`, to a `[0 0 -1 0 0]` scalar),
#  which moves the goldens that pin it -- a class the 2026-09-04 slice had
#  reserved.  EMPTIED 2026-11-09 (DEV.md 4c C269, after the C266 student walk
#  met the refused sheets on screen: sprayDryer07's design sheet IS that case's
#  answer, and `m3/yr`, written by CleanUtilitiesPass -- a writer OUTSIDE
#  `sizing/`, which arm (k)'s source sweep did not read -- took the
#  purified-water generator of all three tablet plants with it).  The remedy
#  taken moves NO number: both parsers learned the words, with their
#  dimensions (`um` length 1e-6, `rpm` = 1/min, `yr` = 365 d and `m3/yr`, in
#  core/Units.cpp and gui/src/dict/units.ts in the same commit).  Arm (k) now
#  sweeps every `set(key, value, "unit")` under src/postProcessing, and
#  gui/tests/designSheetCorpus.test.ts parses every sheet the witnesses write
#  with the app's real parser.  The name stays so a future pin has its home
#  and the stale-pin arm keeps its subject.
SHEET_UNIT_WORDS_UNPARSEABLE = {}


#  Records whose header contradicts the values they ship.
#
#  EMPTY SINCE 2026-08-05: NF270's contradiction was resolved by removing the
#  false KIND of claim (its cited datasheet publishes REJECTIONS, never
#  permeabilities) rather than by choosing between two numbers.  No value
#  moved, so no golden moved.
SELF_CONTRADICTING_RECORDS = {}


#  ---------------------------------------------------------------------------
#  STEADY CASES WHOSE STREAM CARRIES A PHASE LABEL THE ENGINE HAS DISPROVED
#  ---------------------------------------------------------------------------
#
#  The energy report prices each stream in the phase its state file declares
#  and CHECKS the label: a stream called liquid whose own Rachford-Rice
#  residual at (T, P, z) puts it above its bubble point cannot hold the name,
#  and the report says so -- naming the stream, the residual, and that the
#  enthalpy charged for it is "missing (or inventing) that phase change, which
#  is a residual of latent-heat size".  The check is not in question.
#
#  What is pinned here is that shipped tutorials trigger it, some with a
#  real energy residual beside the label.  The corpus stayed green because the
#  finding is announced rather than refused, which is the right default for an
#  extrapolation and is doing more work than it should here: an extrapolated
#  Antoine is a qualified answer, while a stream priced in a phase it cannot
#  occupy is a wrong one, out by a latent heat.
#
#  WHY IT IS PINNED AND NOT FIXED.  Correcting a case means changing what it
#  DECLARES about its streams -- the `vaporFraction`/`phase` in 0/ -- which
#  changes published answers in tutorials with recorded goldens.  That is
#  a curation decision about each case's physics and is Vitor's.  Refusing an
#  impossible label outright is a contract change with the same blast radius.
#
#  THE VALUE IS THE WORST ABSOLUTE ENERGY RESIDUAL, in kW, measured by
#  check_impossible_phase_pins from the run itself and never transcribed --
#  the first hand-taken version of this table was out by a factor of two on
#  two of the seven, in opposite directions, and the gate's own reader caught
#  it.  The gate fails if a case joins the list, leaves it, or gets worse.
#
#  REMEDY, per case: decide what the stream really is at its (T, P, z) and
#  declare it -- `phase gas|liquid` in 0/, or no pin at all so (T, P) resolve
#  it (a mixture's `vaporFraction` beside T and P is refused since
#  2026-10-03) -- then re-record the golden.
#  BLOCKER: each is a thermodynamic judgement about that case, not a sweep.
#  THREE PINS CLEARED 2026-09-18, and the record of WHEN is the point.
#
#  `combined01_brayton_rankine` left this dict on 2026-09-12 (1d0264ed5),
#  whose message named the shape in its own words: A FIX THAT PAYS SEVERAL
#  DEBTS AT ONCE PAYS THEM IN SEVERAL LEDGERS, AND THE ONE NOBODY REMEMBERS
#  IS THE ONE IN A DIFFERENT FILE.  It was written at 12:08.  Three hours
#  later `d6a984701` resolved the feed's thermal state and paid
#  `stripper01_sour_water` and `stripper02_sour_water_h2s`; nine hours later
#  `8d29f4621` made the evaporator chest read its own phase and paid
#  `phasechange01_partial_condenser`.  Neither cleared its ledger entry, so
#  this gate was RED from that evening until today -- the warning falsified
#  by the next two commits after the one that wrote it.
#
#  MEASURED 2026-09-18: all three print IMPOSSIBLE INLET PHASE exactly zero
#  times.  Nothing about the remaining three changed; their residuals are
#  re-measured by the gate on every run and are not transcribed here.
#
#  A FOURTH PIN CLEARED 2026-09-25, and the sentence above about a different
#  file came true on the day it was read: `acetone03_luyben_reaction_section`
#  declared no phase on `0/Rin`, so the report priced a 389 K vapour feed on
#  the liquid leg and the engine printed the line this dict pins.  One line
#  (`phase gas;`) closed its reactor, its separator and its whole plant at
#  0.0000 kW -- and the debt was paid in `check_energy_closure.KNOWN_OPEN`,
#  in the case's golden, and HERE, three ledgers in three files.  This one
#  was the one the ratchet had to ask for.
#
#  THE LAST TWO PINS CLEARED 2026-10-03, by the surface fix and not by any
#  edit to either case: `tsa01_co2_twin_bed` and `flash10_ch4propane_pcsaft`
#  each had an UNPINNED inlet whose carried default (vf = 0, liquid) the
#  report's label check read while its own pricing resolved past it.  The
#  flowsheet now resolves every unpinned domain inlet once after the solve
#  (`Flowsheet.cpp`, "THE STATE AN UNPINNED INLET SHOWS IS THE STATE IT
#  MEANS"; record docs/design/a-stream-is-fixed-by-two-variables.md), so the
#  label the check reads IS the resolved state and the line is not printed.
#  Both were the numerically clean pins (0.023 kW and 2.4e-5 kW): the LABEL
#  was impossible, the duty it distorted was nil.  The dict is EMPTY and
#  stays declared: the ratchet (arm a) is what keeps a case from joining the
#  corpus with an impossible label in silence, and it needs no member to
#  bite.
IMPOSSIBLE_PHASE_CASES = {}


# ---------------------------------------------------------------------------
#  A STATED DEBT ABOUT THIS FILE ITSELF
# ---------------------------------------------------------------------------
#
#  The same external review asked for a second thing this file does NOT do: a
#  machine-readable declaration per gate (claim, scope, knownBlindSpots,
#  positiveWitness, negativeWitness, retirementCondition), so a maintainer need
#  not reverse-engineer policy from the scripts.
#
#  It is not built, and the reason is a measurement rather than reluctance:
#  there are NINETY `check_*` scripts, not the fifteen the review estimated.
#  Declaring all ninety in one pass would be mostly mechanical transcription
#  performed at speed, which is how a declaration comes to disagree with the
#  gate it describes -- the exact failure this project spent the day finding in
#  four hand-compiled counts.
#
#  The waivers came first because they are the part that DECAYS: a scope note
#  that drifts is misleading, but a waiver that outlives its violation silently
#  grants permission.
#
#  CONDITION FOR BUILDING IT: derive each declaration from the gate's own
#  output rather than transcribing its docstring -- every gate already prints
#  its claim, its coverage and its blind spots on the OK line, by convention
#  established across the 2026-08-05 slice.  A declaration generated from what
#  the gate SAYS AT RUNTIME cannot drift from it.
GATE_DECLARATIONS_DEBT = (
    "90 check_* scripts carry their contract in prose only; a machine-readable "
    "declaration should be DERIVED from each gate's own OK line, never "
    "transcribed from its docstring."
)

# ---------------------------------------------------------------------------
#  EDUTOOLS THAT ARE STILL INSTRUMENT PANELS
# ---------------------------------------------------------------------------

#  THE RULE (Vitor, 2026-08-28): an EduTool is a page you SCROLL, carrying the
#  explanation and the equations, with the interactive earned by the
#  paragraphs above it.  The Explorer is the other surface, and it is for
#  studies that only make sense once you have CHOSEN compounds and
#  compositions -- which is why the pellet has no business there.
#
#  A tool may legitimately live in BOTH: the flash is a study of a chosen pair
#  in the Explorer and a lesson about the operating line in EduTools.  What it
#  may not be is an instrument panel in EduTools, because a panel shows a
#  reader who already knows the method what it does, and teaches a reader who
#  does not exactly nothing.
#
#  These are the tools still built as MethodSetupRail panels: knobs down one
#  side, a drawing pinned into what height is left, and the provenance in
#  small grey type underneath.  Every number on them is correct.  None of them
#  teaches.
#
#  The list is expected to SHRINK to nothing.  check_edutool_form fails if a
#  name here has already been converted (a pin outliving its violation is a
#  licence) and if a tool NOT here is a panel (which is how a new one would
#  arrive built the old way).
#  TWO OF THESE ARE NOT FILES.  McCabeTool and PsychroTool are defined INLINE
#  in MethodsWorkspace.tsx, which is how they escaped the first version of
#  check_edutool_form entirely -- it globbed methods/*Tool.tsx and reported 16
#  tools while the registry declared 18.  They are keyed by the label the
#  registry-driven gate resolves them to, so a tool cannot hide by being
#  named differently or by having no file of its own.
#  DISCHARGED 2026-08-28: the table is EMPTY because every one of the 18
#  live EduTools is now a scrolling lesson.  It stays as a table rather
#  than being deleted because it is the gate's exemption list, and an
#  exemption list that exists and is empty says something a deleted one
#  cannot: that nothing is exempt.  The fields below describe what a pin
#  would mean if a new tool were ever added in the panel form.
EDUTOOL_STILL_A_PANEL = {
}

EDUTOOL_PANEL_DEBT = {
    "why": "These EduTools are built as MethodSetupRail instrument panels "
           "rather than as scrolling lessons: the knobs and the drawing are "
           "there, the explanation and the equations are not. A reader who "
           "does not already know the method leaves knowing that.",
    "remedy": "Convert each to the scrolling form the temperature, flash and "
              "Thiele tools now use: numbered steps carrying the equations, "
              "the interactive placed where the paragraphs have earned it, "
              "the limits block kept, and the step content held as DATA so a "
              "test can assert the argument still runs end to end.",
    "blocked": None,   # not blocked on anything -- it is work
}


#  THE EDUTOOL LESSONS THAT DO NOT YET DEFINE THEIR SYMBOLS.
#
#  Found by the owner reading the tools and asking whether a student would
#  know what the letters mean; measured at 133 symbol uses across sixteen
#  lesson modules where the LETTER never appears outside a formula.  The
#  `where` field (gui/src/ui/methods/lessonStep.tsx) is the home for the
#  answer, and it arrived empty everywhere.
#
#  These were PINNED rather than rushed because filling them is real writing
#  and a WRONG definition is worse than a missing one: a gap is visible to a
#  student and a falsehood is not.  check_lesson_symbols refuses a NEW
#  unglossed symbol in a pinned lesson and refuses any at all in an unpinned
#  one, so the debt could be paid down but never grow.
#
#  DISCHARGED IN FULL 2026-08-28.  All sixteen lesson modules now gloss every
#  symbol their formulas use.  The dict is kept EMPTY rather than deleted,
#  because an empty waiver list is a CLAIM -- "nothing is excused here" --
#  and deleting it would leave that claim unstated (the LAYERING_UPWARD_EDGES
#  precedent).  The glosses were written against the ENGINE SOURCE, one
#  agent per lesson, each required to cite `file:line` for every symbol; the
#  citation requirement is what made them read the code instead of the page,
#  and it turned up eight defects the pages had been carrying -- among them
#  the cooling tower's operating-line slope (the prose contradicted its own
#  formula two lines below) and a claim in the Bjerrum lesson, written by
#  this project, that the engine has no pH input at all, which is false.
LESSON_SYMBOLS_UNGLOSSED = {
}

LESSON_SYMBOLS_DEBT = {
    "why": "An EduTool formula can use a symbol the page never defines, so a "
           "student meets a Greek letter with nothing to attach it to.  The "
           "worst case measured is the breakthrough lesson, whose FIRST "
           "formula uses eps and rho_b while the words 'porosity' and 'bulk "
           "density' appear nowhere in the file.",
    "remedy": "Add a `where: [{ sym, means, unit }]` list to the step whose "
              "formula uses them; it renders under the equation the way a "
              "textbook does.  Where the quantity is a per-unit amount, the "
              "gloss should say WHICH BASIS -- that is the fact that really "
              "varies between unit operations, and the letter is downstream "
              "of it.",
    "blocked": None,   # not blocked on anything -- it is writing
}


# ---------------------------------------------------------------------------
#  ORIGIN VOCABULARY -- words written as `origin <word>;` that the vocabulary's
#  one home does not know (2026-09-19)
# ---------------------------------------------------------------------------

#  `check_origin_census.KNOWN` enumerates the origin words the frozen tree
#  writes, and `check_origin_vocabulary` holds every `origin <word>;` DICT FORM
#  in prose (docs, comments, docstrings, schema descriptions) to that set --
#  because on 2026-09-19 every prose home of the estimate word had drifted to
#  the bare word (`estimate`) while all 150 records said `estimated`, and the engine's
#  tolerant `originFromWord` made the drift invisible at run time.
#
#  These two words are written in the dict form, are NOT in KNOWN, and are not
#  typos: each is a word somebody CHOSE and registered nowhere the vocabulary
#  lives.  They are pinned rather than added to KNOWN because a new origin
#  word is a classification decision (the census says so in its own header),
#  and pinned rather than rewritten because the first one is LIVE.
ORIGIN_WORDS_OUTSIDE_VOCABULARY = {
    "teachingSurrogate":
        "LIVE.  `src/propertyOps/ThielePellet.cpp` dispatches on it by string "
        "(`cat.origin() == \"teachingSurrogate\"`), two case-local catalyst "
        "records under tutorials/props/reactor/thiele0*/ declare it, and the "
        "GUI lesson quotes it.  `core/Origin.H` resolves it to `unattributed` "
        "and the census never sees it (case-local records are outside its "
        "domain) -- the `measuredFit` lesson written in Origin.H's own comment, "
        "unapplied: a declared word must be registered where the vocabulary "
        "lives.",
    "citedHeuristic":
        "PROPOSED, not shipped.  `docs/design/engineering-heuristics-as-"
        "curated-data.md` sketches a `provenance { origin citedHeuristic; }` "
        "grammar for a heuristic transcribed from a cited handbook; no record "
        "and no reader carries the word.",
}

ORIGIN_WORDS_DEBT = {
    "why": "A word the engine dispatches on, or a document teaches, that the "
           "vocabulary's one home does not list is a second home for the "
           "vocabulary -- and the tolerant `originFromWord` means a wrong or "
           "unregistered word runs to exit 0 and prints a plausible word back.",
    "remedy": "For each word: register it in `core/Origin.H` (with the rung it "
              "resolves to) AND `check_origin_census.KNOWN` in one commit, or "
              "rename the sites to a word already there.  Either is a "
              "vocabulary decision; the gate only keeps the list visible.",
    "blocked": "A classification decision (whose rung `teachingSurrogate` "
               "is -- it is deliberately NOT `estimated`, the record says "
               "'do not quote it') is reserved; the census header records "
               "that the engine enum and the five-axes contract already "
               "disagree, and no gate may settle that.",
}


#  THE DATASETS UNDER `constant/experiments/` THAT PREDATE THE EVIDENCE GRAMMAR
#  (2026-10-20, DEV.md 4c C117).
#
#  The Property Explorer's Evidence view reads a measured dataset from its OWN
#  header -- the grammar `bin/choupo-thermoml extract-vle` writes: a subject
#  (`system ( a b )` or `component x;`), a `columns ( { name; unit; } )` +
#  `data ( )` grid, and a `provenance {}` naming its `citation` and the
#  `sha256` a dossier cites it by.  `check_evidence_records` holds every file
#  under a tutorial's `constant/experiments/` to that.  MEASURED on the day:
#  19 of 40 comply; these 21 do not, each lacking exactly the words recorded
#  beside it (the gate recomputes them: a debt that grows or shrinks fails).
#  They are the corpus's older shapes -- flat two-column kinetics and
#  electrolyte tables read by their own ops, curation fixtures generated from
#  the correlation they test, ThermoML extracts that name the article by `doi`
#  and `archiveFile` and never wrote a `citation` line -- and every one of them
#  RUNS: nothing here is a defect in a case, it is a file the Explorer cannot
#  yet show as evidence.  NOT fixed here, because writing a citation into a
#  record this slice did not read against its source would convert
#  "uncited" into "falsely cited" (the 2026-08-05 rule).
EVIDENCE_LEGACY_DATASETS = {
    "tutorials/props/compare/acetone01_ipa_water_azeotrope/constant/experiments/luyben2011_ipa_water.dat":
        "sha256,subject",
    "tutorials/props/compare/compare_kinetics_order/constant/experiments/rate-batch.dat":
        "grid,sha256,subject",
    "tutorials/props/compare/compare_vle_etoh_water/constant/experiments/etoh_water_vle_1atm.dat":
        "sha256,subject",
    "tutorials/props/curation/curate01_water_evidence_partition/constant/experiments/psat-water-highT.dat":
        "citation,sha256,subject",
    "tutorials/props/curation/curate01_water_evidence_partition/constant/experiments/psat-water-lowT.dat":
        "citation,sha256,subject",
    "tutorials/props/curation/curate02_vle_heldout_ethanol_water/constant/experiments/etoh-water-101kPa-fit.dat":
        "citation,sha256,subject",
    "tutorials/props/curation/curate02_vle_heldout_ethanol_water/constant/experiments/etoh-water-101kPa-heldout.dat":
        "citation,sha256,subject",
    "tutorials/props/curation/curate03_thermoml_fixture_bubble/constant/experiments/ethanol-water-bubble-binary-bubble-fixture-heldout.dat":
        "citation",
    "tutorials/props/curation/curate03_thermoml_fixture_bubble/constant/experiments/ethanol-water-bubble-binary-bubble-fixture.dat":
        "citation",
    "tutorials/props/electrolyte/archer01_nacl_cold_to_hot/constant/experiments/archer92_tables9_10.dat":
        "grid,provenance,subject",
    "tutorials/props/electrolyte/enthalpy_naoh_water/constant/experiments/phiL_25C_parker1965.dat":
        "citation,grid,sha256,subject",
    "tutorials/props/electrolyte/fpd01_nacl_freezing/constant/experiments/fpd_nacl_interim.dat":
        "grid,provenance,subject",
    "tutorials/props/electrolyte/pitzer01_nacl/constant/experiments/phiL_25C_parker1965.dat":
        "citation,grid,sha256,subject",
    "tutorials/props/electrolyte/pitzer_gamma_hamer_wu/constant/experiments/hamer_wu_1972.dat":
        "grid,provenance,subject",
    "tutorials/props/electrolyte/pitzer_nacl_sp77_hot/constant/experiments/sp77_tableV.dat":
        "grid,provenance,subject",
    "tutorials/props/fit/cp01_polynomial_recovery/constant/experiments/cp-dce-liquid-synthetic.dat":
        "provenance,subject",
    "tutorials/props/fit/psat01_antoine_recovery/constant/experiments/psat-water-synthetic.dat":
        "provenance,subject",
    "tutorials/props/kinetics/rate01_arrhenius_recovery/constant/experiments/rate-secondorder-synthetic.dat":
        "provenance,subject",
    "tutorials/props/molecular/srk01_h2n2_density/constant/experiments/N2-H2-density-jced-7b00694.dat":
        "provenance",
    "tutorials/steady/optimisation/fitNRTL02_thermoml_isobars/constant/experiments/ethanol-water-bubble-j.fluid.2011.06.009.dat":
        "citation",
    "tutorials/steady/optimisation/fitNRTL02_thermoml_isobars/constant/experiments/ethanol-water-bubble-je2008704.dat":
        "citation",
}

EVIDENCE_LEGACY_DEBT = {
    "why": "These measured (or generated) datasets sit in a case's "
           "constant/experiments/ in an older shape: no declared subject, no "
           "self-describing column grid, or a provenance block without a "
           "citation or a sha256.  Each case runs; the Explorer's Evidence "
           "view cannot list them for a pair, and a dossier cannot cite them "
           "by hash.",
    "remedy": "Per file: declare the subject (`system ( a b );` or "
              "`component x;`), restate the grid as `columns ( { name; unit; "
              "} ) data ( )` where the consuming op reads that form, and add "
              "the `citation` (read against the source, never inferred from "
              "a doi) and the `sha256` of the source file -- then delete the "
              "pin; the gate fails until the pin goes.",
    "blocked": "Each citation must be read against its article; the "
               "generated fixtures (curate01/02/03) are synthetic BY DESIGN "
               "and may need a declared `source synthetic;` exemption word "
               "instead of a citation -- a decision for the curator, not a "
               "mechanical edit.",
}


# ---------------------------------------------------------------------------
#  AQUEOUS SOLVENT BY NAME -- "water" literals outside the one home
#  (2026-10-31, DEV.md 4c C188; read by check_aqueous_solvent_home)
# ---------------------------------------------------------------------------

#  The aqueous solvent's ONE home is ThermoPackage::aqueousSolventName()
#  (default in defaultAqueousSolvent()).  These two props-bench ops still
#  write the word, each with its exact count -- a pin that grows or shrinks
#  fails, so a new name recognition cannot hide behind an old one.
AQUEOUS_SOLVENT_NAME_LITERALS = {
    "src/propertyOps/FreezingPoint.cpp": (1,
        "props-bench op whose SUBJECT is the ice of water: it loads water.dat"
        " as the crystal's own record"),
    "src/propertyOps/Speciate.cpp": (2,
        "props-bench speciation stack is water-only by construction (water"
        " Debye-Hueckel surface): one literal REFUSES a declared non-water"
        " `aqueousProperties.solvent` by name, the other prices the solvent"
        " leg (Psat) that refusal guards"),
}

AQUEOUS_SOLVENT_NAME_DEBT = {
    "why": "Two props-bench ops name water directly instead of reading the "
           "package's aqueous solvent.  Both are honest today -- FreezingPoint "
           "is ABOUT water's ice, and Speciate refuses any other solvent by "
           "name before it uses the word -- but the bench surface "
           "(`aqueousProperties.solvent`, propertyOps/CasePackage.H) is a "
           "second declaration of the solvent that the package's home does "
           "not see.",
    "remedy": "When the speciation stack gains a non-water solvent surface, "
              "read the solvent from the package's home and load ITS Psat; "
              "FreezingPoint becomes a solvent-generic freezing op only if "
              "a non-water solid solvent is ever curated.  Then delete the "
              "pin; the gate fails until it goes.",
    "blocked": "A non-water Debye-Hueckel surface (A(T), molality basis on "
               "another solvent) is new physics, not a mechanical edit.",
}
