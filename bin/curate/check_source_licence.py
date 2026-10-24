#!/usr/bin/env python3
"""Gate: no encumbered SOURCE is the authority for a shipped value.

    bin/curate/check_source_licence.py

WHY THIS EXISTS.  docs/ai/curation-protocol.md states, of NIST SRD/WebBook,
DIPPR, Yaws, CRC-as-a-product, direct DECHEMA/DDBST transcription and CAS
Common Chemistry:

    "NEVER (no-grant or NonCommercial -- do not enter their numbers, even
     cited)"

The public tree underwent a deliberate legal scrub to remove third-party
databank values.  On 2026-08-05 an audit found records that survived it.
Nothing had ever checked, so the scrub was a one-time sweep with no ratchet.

THE DISTINCTION THIS GATE ENFORCES, and it is the whole design.  A string
match on "NIST" is WRONG and would have condemned two innocent records:

    ethyleneOxide.dat  citation "Pell & Pilcher, Trans. Faraday Soc. 61
                                 (1965) 71, via NIST WebBook"
    cyclopentane.dat   citation "Prosen & Rossini (NBS heats of combustion
                                 of the cyclopentane series), via NIST WebBook"

Both name a PRIMARY -- a journal article, with authors, volume and year --
and name the aggregator as the ACCESS ROUTE.  That is exactly what the
protocol asks for ("cite the PRIMARY per value, never the aggregator's
arrangement").  Where you READ a number is not where it CAME FROM.

The violation is the aggregator standing AS the authority:

    H3PO4.dat          "dHf_298: CRC Handbook (crystalline H3PO4 ...)"
    methylAcetate.dat  "Primary data: NIST WebBook / DIPPR-class compilations"

-- the second calling an aggregator "Primary data", which is the exact
inversion the invariant forbids.

THE SECOND RULE, added 2026-09-01: a NONCOMMERCIAL COMPILATION.  Burcat's
Third Millennium database (hosted at ReSpecTh) is "provided free of charge
for non commercial use" -- and NonCommercial is on the excluded list
regardless of copyleft, because the objection is not a licence to honour but
a restriction against this project's free-for-commercial ethos.  Unlike an
aggregator, no `via` rescues it: the compilation IS what would be copied,
and the protocol says "do not enter their numbers, EVEN CITED".  What is
allowed is the name as a CROSS-CHECK, which enters no value; OH.dat is the
one record in the tree that uses it that way.

This gate had never heard the name, while bin/curate/import_gibbs_nasa.py
had said in capitals since 2026-06-14 that Burcat is licence-excluded and
that every package bundling it is provenance laundering.  ONE DECISION, TWO
HOMES, DISAGREEING -- and the disagreement shipped: 36 records in the public
tree name it as the origin of their formation data.  They are PINNED, not
deleted (debt_registry.NC_COMPILATION carries why, the remedy, and what is
reserved to Vitor).

SABOTAGES, 2026-09-01, all five behave:
  S1  a new record whose banner names BURCAT.THR      -> FAILS, names it
  S2  a record saying "dHf via Burcat's database"     -> FAILS (no via rescue;
      this is the arm that distinguishes the two rules, and the one an
      aggregator-shaped implementation would have got wrong)
  S3  "from ATcT, cross-checked with Burcat"          -> stays compliant, so
      the allow-branch is real rather than permanently-true
  S4  a pin for a file that does not mention Burcat   -> STALE, naming the
      registry constant it lives in
  S5  the detector regex disarmed                     -> all 36 pins go stale,
      so the pins are load-bearing and cannot outlive the check

So the rule is: an encumbered name may appear ONLY after a `via`/`through`
marker, i.e. as a route, never as the subject of a source/citation field.

WHAT THIS GATE DOES NOT DO.  It does not replace the offending values.  A
substitute datum must come from a primary source, and inventing one -- or
silently promoting a differing NBS printing over the CRC number a case's
goldens were recorded against -- would put a fabrication where a measured
value belongs.  The known violations are PINNED with their remedy; the pin
list is the curation work-list, and a new violation fails immediately.


THE CARD ARM (2026-09-06).  Every source this gate rules on has a card under
thirdParty/<source>/README.md (CARDS), every card another gate rules on is
named by that gate by path (CARDS_OF_OTHER_GATES), and no card on disk is an
orphan.  Fired by hand, observed lines:
  * an orphan card (a thirdParty/zzz_probe/README.md nobody names) ->
      "FAILED -- card(s) no gate names: thirdParty/zzz_probe/README.md."
  * a card this gate names removed (thirdParty/svehla/README.md) ->
      "FAILED -- CARDS['NASA TR R-132'] names thirdParty/svehla/README.md,
       which does not exist"
  * the other gate's mention of its card removed ->
      "FAILED -- thirdParty/lvpp-sigma/README.md must exist and be named, by
       path, inside bin/curate/check_cosmo_scrub.py"
  The FIRST positive run failed on its own: thirdParty/thermoml/ had data and
  no card, only an index row -- the arm found a missing card before it found
  a sabotage.  And the third sabotage SURVIVED its first attempt: renaming
  the mention to README.mdX left the original path as a SUBSTRING of the
  sabotaged one, so the `in` test still matched.  A sabotage must remove the
  thing, not decorate it; the second attempt (README.md -> nothing) fired.

THE NO-GRANT NAMES AND THE CASE-LOCAL ARM (2026-10-11, C65 item c).  The
first run of the widened pattern failed on its own, on the real thing:
data/standards/components/NH3.dat named Engineering Toolbox in its header
and in its liquidViscosity `method` (fixed in the same commit).  Then, by
hand, each restored and the gate re-run to exit 0:
  S1  one NH3 mirror's pin removed from NO_GRANT_CASE_LOCAL -> FAILED, naming
      that mirror's line as a NEW case-local violation;
  S2  `citation "REFPROP 10 output; ..."` in a catalogue record -> FAILED;
  S3  the same record citing a primary `..., via Engineering Toolbox` -> OK,
      so the read-through branch is real for the new names too;
  S4  a pin for a case-local record that names nothing -> STALE PIN, naming
      NO_GRANT_CASE_LOCAL.

VENDORED THIRD-PARTY CODE (2026-10-22, C138 slice 2).  NanoFiltran and the
two libraries inside it, held by ACCEPTED_VENDORED_CODE.  By hand, each
restored and the gate re-run to OK:
  S1  NOTICE's "Michael F. Hutt" replaced by "the author" -> FAILED, "NOTICE
      does not name ['Michael F. Hutt'] for the vendored NanoFiltran";
  S2  one word added to LICENSE-LAPACK.txt -> FAILED, "is missing or is not
      the licence text the acceptance was made on".
"""
import re
import sys
from pathlib import Path

#  THE WAIVERS LIVE IN ONE PLACE.  See `debt_registry.py` -- a pin is a
#  decision to tolerate a known violation, and "what are we currently
#  tolerating?" is a fact with exactly one home.
import sys as _sys
_sys.path.insert(0, str(Path(__file__).resolve().parent))
from debt_registry import SOURCE_LICENCE, NC_COMPILATION, NO_GRANT_CASE_LOCAL

ROOT = Path(__file__).resolve().parents[2]

#  The protocol's NEVER list, as name patterns.  DECHEMA is handled
#  separately: a NAMED monograph in the series (Knapp et al.) is a citable
#  publication, while "curated from the DECHEMA bank" is transcription.
#  TWO MORE NO-GRANT NAMES (2026-10-11, DEV.md 4c C65 item c).  CLAUDE.md
#  section 10 names Engineering Toolbox and REFPROP beside DIPPR, Yaws, CRC and
#  NIST SRD/WebBook as no-grant sources -- "nothing to honour" -- and this gate
#  had never heard either name: NH3.dat shipped an Andrade viscosity fitted to
#  the Engineering Toolbox table, with the site named in its `method`, for as
#  long as the record existed.  They join the aggregator rule unchanged: a
#  primary read THROUGH either (`..., via Engineering Toolbox`) is a route and
#  stays compliant; either AS the origin of a value fails.  REFPROP is NIST's
#  program, whose fluid files implement published equations of state -- the
#  equation's paper is the primary to cite, the program at most a route.
#  Kept as its own constant because the CASE-LOCAL arm below reaches these
#  two names only (see NO_GRANT_CASE_LOCAL in debt_registry).
NO_GRANT_NAMES = r'Engineering\s*Tool\s*box|engineeringtoolbox(?:\.com)?|REFPROP'
NO_GRANT_NEW = re.compile(r'\b(' + NO_GRANT_NAMES + r')\b', re.I)

ENCUMBERED = re.compile(
    r'\b(CRC\s+Handbook|NIST\s+WebBook|NIST\s+SRD|DIPPR|Yaws|'
    r'CAS\s+Common\s+Chemistry|DDBST|Dortmund\s+Data\s+Bank|'
    + NO_GRANT_NAMES + r')\b', re.I)
DECHEMA = re.compile(r'\bDECHEMA\b', re.I)

#  A NONCOMMERCIAL COMPILATION -- a SECOND shape, and the difference from
#  the aggregators above is the whole reason it needs its own rule.
#
#  Burcat's Third Millennium database (now hosted at ReSpecTh) states:
#  "provided free of charge for non commercial use".  NonCommercial is on
#  the excluded list REGARDLESS of copyleft -- it is not a copyleft problem
#  to honour but a use restriction against this project's ethos.
#
#  For an aggregator, `via` rescues the citation: the value came from the
#  journal and the aggregator is only where somebody read it.  Here it
#  rescues nothing -- the compilation IS what would be copied, and the
#  protocol says "do not enter their numbers, even cited".  So this rule
#  has no VIA branch.  What it does allow is the name as a CROSS-CHECK: a
#  record that computes its value elsewhere and compares it against Burcat
#  enters no Burcat number, and OH.dat is exactly that.
#
#  THE SECOND HOME THIS CLOSES.  bin/curate/import_gibbs_nasa.py has said
#  in capitals since 2026-06-14 that Burcat is licence-excluded and that
#  every package bundling it is provenance laundering -- while THIS gate,
#  the one that enforces licence, had never heard the name.  One decision,
#  two homes, disagreeing, and the disagreement shipped: 36 records in the
#  public tree name it as the origin of their formation data.
NC_COMPILATION_SOURCE = re.compile(r'\b(BURCAT\.THR|Burcat|ReSpecTh)\b', re.I)

#  Markers that make a mention a CHECK rather than an origin.  Deliberately
#  narrower than VIA below: `via` is not among them.
CHECK_MARKER = re.compile(
    r'\b(cross-check\w*|compared|verified\s+against|anchor\w*)\b', re.I)

#  A route marker: the aggregator is where the value was READ.
VIA = re.compile(r'\b(via|through|accessed\s+(?:via|through)|retrieved\s+from)\b', re.I)

#  Fields that assert authority for a value.  A mention in a free-text
#  `note` is commentary; a mention in `source`/`citation`/`method` is a claim.
AUTHORITY_FIELD = re.compile(r'\b(source|citation|method|Source|Primary\s+data)\b')

#  THE THIRD SHAPE: AN ACCEPTED THIRD-PARTY DATABANK, and why it is a table
#  and not a comment (2026-09-05).  Hundreds of records name ChemSep as the
#  origin of a value.  That is compliant -- the ChemSep pure-component
#  database is distributed under the Artistic License 2.0, FSF-listed as
#  GPL-compatible, and aggregating it as DATA beside GPL code is permitted --
#  but until today the ONLY place that said so was a comment at the top of
#  bin/curate/chemsep_to_choupo.py.  A licence decision recorded in a tool's
#  comment is not enforced anywhere (CLAUDE.md section 7): had the importer
#  been deleted, or its header rewritten, nothing would have noticed, and
#  this gate would have gone on passing 356 records on a contract that no
#  longer existed anywhere in the tree.
#
#  So the acceptance is a CONTRACT here: a databank name in an authority
#  field is compliant only if it appears in this table WITH the licence that
#  makes it so, and the importer's own LICENSE constant is checked to agree.
#  A databank not in the table is treated as ENCUMBERED (a value cited from a
#  source nobody has cleared), which is the fail-closed reading.  One row
#  today.  Adding one is a licence decision: cite the licence text.
ACCEPTED_DATABANK = {
    "ChemSep": {
        "licence": "Artistic-2.0",
        "why": "ChemSep pure-component database (Kooijman & Taylor), "
               "Artistic License 2.0 -- FSF-listed GPL-compatible; DATA "
               "aggregation beside GPL-3.0 code",
        "importer": "bin/curate/chemsep_to_choupo.py",
    },
}
#  THE ACCEPTANCE HAS A SCOPE, AND THE SCOPE IS A CONTRACT TOO (2026-09-28).
#  The row above accepts ChemSep's PURE-COMPONENT databank.  ChemSep also
#  ships binary interaction-parameter tables (the `.ipd` files), and the
#  licence that ships WITH them says the Artistic grant does not reach them:
#
#      "Use of the ChemSep Pure Component Property Databank (and ONLY the
#       ChemSep Pure Component Property Databank) is governed by the Artistic
#       License of the Perl Foundation. [...] Sublicense of SOFTWARE to
#       another party is not permitted."
#                   -- help/chemsep.lic, ChemSep LITE 8.50 (lite.zip, sha256
#                      69640c709f51ef89341ff1596b4fea4a37d9de774f4fac041934c0413958573c,
#                      downloaded from www.chemsep.org and read 2026-09-28)
#
#  and the tables' own headers name where their numbers came from: "DECHEMA
#  NRTL at P=1atm", "DECHEMA UNIQUAC at P=1atm" (nrtl.ipd, uniquac.ipd).
#  DECHEMA transcription is on the protocol's NEVER list, so these tables
#  may be used LOCALLY (data/local/, your own install) and never enter the
#  public tree.  The `thermo` Python package (Caleb Bell, MIT) redistributes
#  the same NRTL and Peng-Robinson tables by CAS under
#  thermo/Interaction Parameters/ChemSep/ -- an MIT licence on the code does
#  not relicense ChemSep's tables or DECHEMA's values, so that copy is the
#  SAME exclusion, reached by another route (provenance laundering, CLAUDE.md
#  section 10).  Its `IPDB.get_ip_specific` also returns a default (bij 0,
#  alpha 0.3) for a pair it does not hold -- an absent value turned into a
#  number -- which is a second reason no value may be taken from it.
#
#  A mention is allowed only as a CROSS-CHECK (the CHECK_MARKER words), which
#  enters no value.  Each class names its card, so the prose and the gate
#  cannot drift apart.
EXCLUDED_TABLES = {
    "ChemSep interaction-parameter tables (.ipd)": {
        "pattern": re.compile(
            r'\b(?:nrtl|uniquacp?|uniquac_ext|wilson|margules|vanlaar|pr|srk|'
            r'apisrk|haydeno|henrys_law|wang_et_al)\.ipd\b'
            r'|\bChemSep\s+(?:IPD|NRTL|UNIQUAC|Wilson|interaction[- ]parameters?)\b',
            re.I),
        "why": "ChemSep LITE licence: Artistic-2.0 covers ONLY the pure-component "
               "databank, sublicensing forbidden; the tables are DECHEMA-derived "
               "by their own headers",
        "card": "thirdParty/chemsep/README.md",
    },
    "thermo (Python) ChemSep interaction-parameter copy": {
        "pattern": re.compile(
            r'\bIPDB\b|Interaction\s+Parameters/ChemSep|'
            r'\bthermo\.interaction_parameters\b|\bChemSep\s+PR\s+kij\b',
            re.I),
        "why": "a copy of the ChemSep .ipd tables inside an MIT-licensed code "
               "package; the MIT grant is Caleb Bell's, over his code, and does "
               "not relicense the tables",
        "card": "thirdParty/thermo-ipdb/README.md",
    },
}

#  A TABLE OF A NO-GRANT STANDARD, CARRIED BY AN OPEN LIBRARY (2026-10-11,
#  DEV.md 4c C62, the commander's ruling).  API STD 526's lettered orifice
#  areas (D..T) are a TABLE of a standard this project classes as no-grant
#  (docs/design/process-safety-audit.md), and the MIT licence of the open
#  `fluids` library that carries them is its author's grant over his CODE --
#  it does not relicense the table, exactly as the thermo package's copy of
#  the ChemSep .ipd tables above is not freed by its MIT licence (C16).  The
#  relief-valve sizer therefore publishes the REQUIRED area and selects no
#  letter.  The equations of API 520 Part I stay: they are facts with a
#  citation, not an arrangement (the C61 posture).
#
#  WHAT IS MATCHED is the table's own SIGNATURE, not a name: five or more of
#  its distinctive areas -- in square inches or converted to mm2 -- inside
#  one 600-character window of any SOURCE file (src/, gui/src, gui/tests,
#  bin/, tutorials/, data/standards/, docs/ prose).  A sentence that NAMES
#  API 526 enters no value and passes.  Identifiers the copied table travels
#  under (`API526_A...` in that library, the `api526Select` / `api526 = {`
#  this tree carried for an afternoon) are matched too.  This file is exempt
#  from its own scan, because it states the signature.
#
#  SABOTAGES, by hand, 2026-10-11 (each restored, the gate re-run to exit 0):
#    L0  the first run of this arm, before the relief gate was cleaned, caught
#        `api526Select` in bin/curate/check_relief_valve.py's probe.
#    L1  the in2 areas appended, unnamed, to ReliefArithmetic.H: caught (6).
#    L2  the mm2 areas appended to a design record's prose: caught (5).
#    L3  FOUR in2 areas only: passes, by design -- the threshold is the
#        signature, and four numbers are not a table.  Said, not hidden.
EXCLUDED_STANDARD_TABLES = {
    "API STD 526 orifice-letter areas": {
        "values": [
            #  in2 (the distinctive ones; 16.00 and 26.00 are too common)
            ("0.196", "0.307", "0.503", "1.287", "1.838", "2.853", "4.34",
             "6.38", "11.05"),
            #  the same areas in mm2, by their leading digits
            ("126.4", "198.0", "324.5", "506.4", "830.3", "1185.8", "1840.6",
             "2322.5", "4116.1", "7129.0", "10322."),
        ],
        "identifiers": re.compile(r'\bAPI526_A\w*\b|\bapi526Select\b|\bapi526\s*=\s*\{'),
        "why": "a table of API STD 526, a no-grant standard; the MIT licence of "
               "the library that carries it does not relicense it",
    },
}
STANDARD_TABLE_ROOTS = ["src", "gui/src", "gui/tests", "bin", "tutorials",
                        "data/standards", "docs"]
STANDARD_TABLE_SUFFIXES = {".H", ".h", ".cpp", ".ts", ".tsx", ".js", ".py",
                           ".md", ".tex", ".dat", ""}


def _table_hits(text, values):
    """Positions of the table's values, matched as whole numbers."""
    out = []
    for v in values:
        for m in re.finditer(r'(?<![0-9.])' + re.escape(v), text):
            out.append((m.start(), v))
    return sorted(out)


def standard_table_violations():
    """Files that reproduce a no-grant standard's table, and the scan size."""
    found, nscan = [], 0
    me = Path(__file__).resolve()
    for root in STANDARD_TABLE_ROOTS:
        base = ROOT / root
        if not base.is_dir():
            continue
        for f in base.rglob("*"):
            if not f.is_file() or f.resolve() == me or "node_modules" in f.parts:
                continue
            if f.suffix not in STANDARD_TABLE_SUFFIXES:
                continue
            try:
                if f.stat().st_size > 2_000_000:
                    continue
                text = f.read_text(errors="ignore")
            except OSError:
                continue
            nscan += 1
            rel = f.relative_to(ROOT).as_posix()
            for cls, ex in EXCLUDED_STANDARD_TABLES.items():
                ident = ex["identifiers"].search(text)
                if ident:
                    found.append(f"{rel}: `{ident.group(0)}` -- {cls} ({ex['why']})")
                    continue
                hit = None
                for values in ex["values"]:
                    #  Cheap first: a file holding fewer than five of the
                    #  strings anywhere cannot hold five in one window.
                    if sum(1 for v in values if v in text) < 5:
                        continue
                    hits = _table_hits(text, values)
                    for i in range(len(hits)):
                        win = {v for (pos, v) in hits[i:] if pos - hits[i][0] <= 600}
                        if len(win) >= 5:
                            hit = win
                            break
                    if hit:
                        break
                if hit:
                    found.append(f"{rel}: {len(hit)} of the table's areas "
                                 f"({', '.join(sorted(hit))}) within 600 "
                                 f"characters -- {cls} ({ex['why']})")
    return found, nscan


#  Databank names this gate KNOWS to look for.  A name here that is NOT in
#  ACCEPTED_DATABANK fails as encumbered.  (The NEVER-list aggregators above
#  stay in ENCUMBERED, which never has an accepted branch.)
KNOWN_DATABANK = re.compile(r'\b(ChemSep)\b')

#  THE FOURTH SHAPE: A UNITED STATES GOVERNMENT WORK (2026-09-06).  Svehla's
#  NASA TR R-132 (1962) is the primary for every Lennard-Jones sigma / eps-k
#  this project drafts (bin/curate/propose_lennard_jones.py), and a work of
#  the US federal government is in the public domain under 17 U.S.C. 105 --
#  no licence to honour, the primary to cite.  Until today that too was a
#  sentence in a tool's docstring.  The contract: a record that names a
#  public-domain source in an authority field must DECLARE the fact as the
#  licence word `publicDomain` in the same file, and the tool that writes
#  such records must carry the same word (cross-checked below, the ChemSep
#  shape).  A public-domain claim that is a comment is not a claim.  The
#  scan roots hold NO such record today -- the fragments live in data/local/
#  and the witness's case-local records -- so this class pins the TOOL, and
#  check_transport_correlations holds the sealed witness records to the
#  form; the day a block is promoted into data/standards/ the form arm here
#  applies to it with no change.
ACCEPTED_PUBLIC_DOMAIN = {
    "NASA TR R-132": {
        "licenceWord": "publicDomain",
        "why": "US government work (NASA Technical Report), public domain "
               "under 17 U.S.C. 105 -- Svehla (1962) NASA TR R-132",
        "tool": "bin/curate/propose_lennard_jones.py",
    },
}
#  VENDORED THIRD-PARTY CODE IS A CONTRACT TOO (2026-10-22, DEV.md 4c C138).
#  NanoFiltran (Geraldes & Alves 2008) lives in bin/curate/nanofiltran/ so the
#  reference numbers of tutorials/props/membrane/nanofiltran01_* can be
#  regenerated, and it carries THREE licences: its own MIT notice, Michael F.
#  Hutt's MIT notice on the Nelder-Mead routine, and the LAPACK (modified
#  BSD) licence of the linear solver.  A licence the code carries in a header
#  stays only while the header does, so each file is held here to its own
#  notice (the `needles`, read in the file's own encoding), the LAPACK text
#  to the hash of the copy fetched from netlib, and NOTICE to naming all
#  three.  Adding a vendored program is a licence decision: add its row.
ACCEPTED_VENDORED_CODE = {
    "NanoFiltran": {
        "dir": "bin/curate/nanofiltran",
        "files": {
            "src/NANOFILTRAN.F": ["Permission is hereby granted, free of charge",
                                  "GERALDES AND ANA MARIA ALVES"],
            "src/SIMPLEX.F":     ["Permission is hereby granted, free of charge",
                                  "Copyright (c) 1998-2004 <Michael F. Hutt>"],
            "src/LINEAR.F":      ["LAPACK driver routine (version 3.0)"],
        },
        "licenceTexts": {
            "LICENSE-LAPACK.txt":
                "a14cc25e10d40a3aa705b7de2fb764a6535d8ee9b2db4e1724900585457dfd55",
        },
        "notice": ["NanoFiltran", "Ana Maria Alves", "Michael F. Hutt", "LAPACK"],
        "why": "MIT (NanoFiltran, Geraldes & Alves 2007; SIMPLEX, Hutt 1998-2004) "
               "and the LAPACK modified-BSD licence -- permissive, GPL-compatible, "
               "aggregated beside Choupo's code and never linked into it",
    },
}

#  The report BY NAME, not the agency: hundreds of records cite NASA
#  thermochemical polynomials (McBride et al.) in their authority fields
#  under the general public-domain reading and carry no licence word; this
#  contract binds the source the lennardJones records are drafted from.
KNOWN_PUBLIC_DOMAIN = re.compile(r'\b(NASA\s+TR\s+R-132)\b')

#  EVERY SOURCE THIS GATE RULES ON HAS A CARD, AND EVERY CARD IS NAMED BY A
#  GATE (2026-09-06).  thirdParty/<source>/README.md records where a source
#  comes from, what its licence says and whether Choupo redistributes it --
#  the card is tracked, the data is ignored.  A licence verdict written only
#  in a gate's table is a contract nobody can read; written only in a card
#  it is a sentence nobody enforces.  Binding the two both ways is what keeps
#  them from drifting apart, which the top-level README had already done once
#  (its Burcat row said "free for scientific use" for five days after this
#  gate started refusing Burcat as NonCommercial).
CARDS = {
    "ChemSep":       "thirdParty/chemsep/README.md",
    "thermo IPDB":   "thirdParty/thermo-ipdb/README.md",
    "NASA TR R-132": "thirdParty/svehla/README.md",
    "Burcat":        "thirdParty/README.md",   # one bulk file, no folder: its card is the index row
    "NanoFiltran":   "bin/curate/nanofiltran/README.md",   # vendored code, tracked beside its tool
}
#  Cards this gate does NOT rule on but which must still be named by the gate
#  that does -- so no card is an orphan and no gate a silent one.
CARDS_OF_OTHER_GATES = {
    "thirdParty/lvpp-sigma/README.md":   "bin/curate/check_cosmo_scrub.py",
    "thirdParty/vt2005-cosmo/README.md": "bin/curate/check_cosmo_scrub.py",
    "thirdParty/thermoml/README.md":     "docs/design/thermoml-archive-assessment.md",
}
LICENCE_WORD = re.compile(r'(?m)^\s*licence\s+(\w+)\s*;')

#  KNOWN VIOLATIONS, pinned 2026-08-05 with the remedy each needs.  NOT
#  fixed here: a replacement datum is a curation act requiring a primary
#  source, and fabricating one is worse than the exposure it hides.
PINNED = SOURCE_LICENCE
SCAN = ["data/standards"]

#  THE CASE-LOCAL ARM (2026-10-11, C65 item c), and why it is NARROW.  Every
#  arm above scans data/standards/ alone; a case's constant/ records ship in
#  the same public tree and no arm looks at them.  The sweep that taught this
#  gate the two names above found them in 35 case-local records -- every one
#  a sealed MIRROR of NH3.dat, carrying the Engineering Toolbox viscosity the
#  catalogue record no longer carries, until each case is re-imported (which
#  moves goldens, so it is Vitor's list, CLAUDE.md 10).  They are PINNED, one
#  remedy for all, in debt_registry.NO_GRANT_CASE_LOCAL.  The arm reaches the
#  two NEW names only: the same sweep, run with every name this gate knows,
#  found 4 mirrors of methylAcetate.dat (pinned at their origin in
#  SOURCE_LICENCE), 30 mirrors naming Burcat (pinned at their origin in
#  NC_COMPILATION) and 13 AUTHORED case-local pair records transcribing
#  DECHEMA -- widening the whole gate to tutorials/ is a ~47-pin decision of
#  its own, recorded in DEV.md (C65) and not taken here.
CASE_LOCAL_ROOT = "tutorials"


def case_local_no_grant():
    """Case-local records naming a newly-taught no-grant compilation AS a
    value's origin (the same via/authority rules as the catalogue arm), and
    the number of records scanned."""
    found, nscan = [], 0
    for p in sorted((ROOT / CASE_LOCAL_ROOT).rglob("*.dat")):
        if "constant" not in p.parts:
            continue
        nscan += 1
        try:
            lines = p.read_text(errors="ignore").splitlines()
        except OSError:
            continue
        for n, line in enumerate(lines, 1):
            hit = NO_GRANT_NEW.search(line)
            if not hit or VIA.search(line[:hit.start()]):
                continue
            window = " ".join(lines[max(0, n - 3):n])
            if VIA.search(window.split(hit.group(0))[0]):
                continue
            if not AUTHORITY_FIELD.search(window):
                continue
            found.append((p.relative_to(ROOT).as_posix(), n, hit.group(0),
                          line.strip()[:110]))
            break
    return found, nscan


def main() -> int:
    violations, pinned_seen, nfiles = [], set(), 0
    nc_new, nc_seen = [], set()
    accepted_seen = {}
    #  THE ACCEPTANCE IS CHECKED, NOT ASSUMED: the importer that writes these
    #  records must state the SAME licence this table accepts them under.
    #  Two homes for one decision are tolerated only because this arm makes
    #  them agree or fail -- the importer keeps its constant because it
    #  writes provenance blocks from it, and this gate keeps the table
    #  because it is the one place a licence decision is enforced.
    for name, acc in ACCEPTED_DATABANK.items():
        imp = ROOT / acc["importer"]
        if not imp.exists():
            print(f"check_source_licence: FAILED -- ACCEPTED_DATABANK['{name}'] "
                  f"names importer {acc['importer']}, which does not exist; the "
                  "acceptance cannot be cross-checked against nothing.")
            return 1
        if not re.search(r"LICENSE\s*=\s*['\"]" + re.escape(acc["licence"]) + r"['\"]",
                         imp.read_text()):
            print(f"check_source_licence: FAILED -- {acc['importer']} does not "
                  f"declare LICENSE = '{acc['licence']}', the licence this gate "
                  f"accepts {name} under.  One decision, two homes, disagreeing.")
            return 1
    #  THE PUBLIC-DOMAIN CLASS IS CHECKED THE SAME WAY: the tool that writes
    #  records citing it must declare the licence word this table accepts.
    for name, acc in ACCEPTED_PUBLIC_DOMAIN.items():
        tool = ROOT / acc["tool"]
        if not tool.exists():
            print(f"check_source_licence: FAILED -- ACCEPTED_PUBLIC_DOMAIN['{name}'] "
                  f"names tool {acc['tool']}, which does not exist; the acceptance "
                  "cannot be cross-checked against nothing.")
            return 1
        if not re.search(r"LICENCE_WORD\s*=\s*(?:SOURCE_CLASS|['\"]"
                         + re.escape(acc["licenceWord"]) + r"['\"])", tool.read_text()) \
                or not re.search(r"SOURCE_CLASS\s*=\s*['\"]" + re.escape(acc["licenceWord"])
                                 + r"['\"]", tool.read_text()):
            print(f"check_source_licence: FAILED -- {acc['tool']} does not declare "
                  f"SOURCE_CLASS = '{acc['licenceWord']}' as its licence word, the "
                  f"word this gate accepts a {name} source under.  One decision, two "
                  "homes, disagreeing.")
            return 1

    #  VENDORED CODE: every file carries its own notice, the licence text is
    #  the fetched one, NOTICE names every holder (ACCEPTED_VENDORED_CODE).
    from hashlib import sha256 as _sha
    notice_text = (ROOT / "NOTICE").read_text()
    vendored_files = 0
    for name, acc in ACCEPTED_VENDORED_CODE.items():
        base = ROOT / acc["dir"]
        for rel, needles in acc["files"].items():
            p = base / rel
            if not p.is_file():
                print(f"check_source_licence: FAILED -- ACCEPTED_VENDORED_CODE['{name}'] "
                      f"names {acc['dir']}/{rel}, which does not exist")
                return 1
            body = p.read_bytes().decode("latin-1")
            miss = [s for s in needles if s not in body]
            if miss:
                print(f"check_source_licence: FAILED -- {acc['dir']}/{rel} no longer "
                      f"carries its licence notice ({miss}); vendored code is "
                      "redistributed under the notice it ships with, or not at all")
                return 1
            vendored_files += 1
        for rel, h in acc["licenceTexts"].items():
            p = base / rel
            if not p.is_file() or _sha(p.read_bytes()).hexdigest() != h:
                print(f"check_source_licence: FAILED -- {acc['dir']}/{rel} is missing "
                      "or is not the licence text the acceptance was made on")
                return 1
        miss = [s for s in acc["notice"] if s not in notice_text]
        if miss:
            print(f"check_source_licence: FAILED -- NOTICE does not name {miss} for "
                  f"the vendored {name}")
            return 1

    #  A SCAN OVER NOTHING IS NOT A CLEAN CATALOGUE (2026-08-15 fleet
    #  census).  This gate shared the check_true_ions death shape: rename
    #  data/standards and rglob returns nothing, zero violations are found
    #  over zero records, and the gate goes permanently green.  An absent
    #  scan root refuses by name; the collapsed-count floor sits before
    #  the OK verdict.
    for root in SCAN:
        if not (ROOT / root).is_dir():
            print(f"check_source_licence: FAILED -- scan root '{root}' does "
                  "not exist; this gate cannot see what it audits, and a "
                  "green verdict over an absent tree would be the "
                  "check_true_ions failure again.")
            return 1
    for root in SCAN:
        for p in sorted((ROOT / root).rglob("*.dat")):
            try:
                text = p.read_text()
            except (UnicodeDecodeError, OSError):
                continue
            nfiles += 1
            rel = p.relative_to(ROOT).as_posix()
            lines = text.splitlines()
            for n, line in enumerate(lines, 1):
                nc = NC_COMPILATION_SOURCE.search(line)
                if nc and not CHECK_MARKER.search(line[:nc.start()]):
                    if rel in NC_COMPILATION:
                        nc_seen.add(rel)
                    else:
                        nc_new.append(
                            f"{rel}:{n}  {nc.group(0)} is the ORIGIN of a "
                            f"value; the database is NonCommercial and no "
                            f"'via' rescues it\n        {line.strip()[:110]}")
                    break
            #  AN EXCLUDED TABLE NAMED AS A VALUE'S ORIGIN.  Checked before
            #  the accepted-databank arm, because "ChemSep" in the same line
            #  would otherwise be counted as the ACCEPTED databank -- which is
            #  exactly how a DECHEMA-derived pair would pass under the
            #  pure-component databank's licence.
            excluded_here = False
            for n, line in enumerate(lines, 1):
                for cls, ex in EXCLUDED_TABLES.items():
                    hit = ex["pattern"].search(line)
                    if hit and not CHECK_MARKER.search(line[:hit.start()]):
                        violations.append(
                            f"{rel}:{n}  {hit.group(0)} -- {cls} is EXCLUDED "
                            f"from the public tree ({ex['why']}); keep it in "
                            f"data/local/\n        {line.strip()[:110]}")
                        excluded_here = True
                        break
                if excluded_here:
                    break
            for n, line in enumerate(lines, 1):
                if excluded_here:
                    break
                db = KNOWN_DATABANK.search(line)
                if db and AUTHORITY_FIELD.search(line):
                    if db.group(0) in ACCEPTED_DATABANK:
                        accepted_seen[db.group(0)] = accepted_seen.get(db.group(0), 0) + 1
                    else:
                        violations.append(f"{rel}:{n}  {db.group(0)} cited AS the "
                                          "authority and NOT in ACCEPTED_DATABANK "
                                          "-- a databank nobody has cleared\n        "
                                          f"{line.strip()[:110]}")
                    break
            #  A public-domain source cited AS the authority must be declared
            #  as such by the licence word, in the same file.
            for n, line in enumerate(lines, 1):
                pd = KNOWN_PUBLIC_DOMAIN.search(line)
                if pd and AUTHORITY_FIELD.search(line):
                    want = ACCEPTED_PUBLIC_DOMAIN[pd.group(0)]["licenceWord"]
                    words = set(LICENCE_WORD.findall(text))
                    if want not in words:
                        violations.append(f"{rel}:{n}  {pd.group(0)} cited AS the "
                                          f"authority without `licence {want};` in the "
                                          "record -- a public-domain claim that is a "
                                          "comment is not a claim\n        "
                                          f"{line.strip()[:110]}")
                    else:
                        accepted_seen[pd.group(0)] = accepted_seen.get(pd.group(0), 0) + 1
                    break
            for n, line in enumerate(lines, 1):
                hit = ENCUMBERED.search(line) or DECHEMA.search(line)
                if not hit:
                    continue
                #  A route marker BEFORE the name means the aggregator is
                #  where it was read, not what it is.  Compliant.
                pre = line[:hit.start()]
                if VIA.search(pre):
                    continue
                #  A CITATION SPANS LINES, and the first draft of this gate
                #  missed a real violation because of it: SRK/N2-CH4 opens
                #  `Source: Knapp, Doering, ...` on one line and reaches
                #  `DECHEMA Chemistry Data Series` two lines later.  Checking
                #  only the hit's own line asked whether the claim and its
                #  subject happened to be typed together.  The window is the
                #  hit's line plus the two above it -- the span a wrapped
                #  citation actually occupies in this corpus.
                window = " ".join(lines[max(0, n - 3):n])
                if VIA.search(window.split(hit.group(0))[0]):
                    continue
                if not AUTHORITY_FIELD.search(window):
                    continue
                if rel in PINNED:
                    pinned_seen.add(rel)
                    continue
                violations.append(f"{rel}:{n}  {hit.group(0)} cited AS the "
                                  f"authority (not 'via')\n        {line.strip()[:110]}")

    std_found, std_nscan = standard_table_violations()
    if std_found or std_nscan < 1000:
        print("check_source_licence: FAILED")
        if std_nscan < 1000:
            print(f"  only {std_nscan} source file(s) scanned for a no-grant "
                  "standard's table against a floor of 1000; the scan surface "
                  "has collapsed.")
        for v in std_found:
            print("  NO-GRANT STANDARD TABLE: " + v)
        return 1

    cl_found, cl_nscan = case_local_no_grant()
    cl_seen = set()
    for rel, n, name, text in cl_found:
        if rel in NO_GRANT_CASE_LOCAL:
            cl_seen.add(rel)
        else:
            violations.append(f"{rel}:{n}  {name} cited AS the authority in a "
                              f"case-local record (not 'via')\n        {text}")
    if cl_nscan < 1000:
        print(f"check_source_licence: FAILED -- only {cl_nscan} case-local "
              "record(s) scanned against a floor of 1000; the case-local scan "
              "surface has collapsed.")
        return 1

    stale = sorted(set(PINNED) - pinned_seen)
    stale += [f"{s} (NO_GRANT_CASE_LOCAL)"
              for s in sorted(set(NO_GRANT_CASE_LOCAL) - cl_seen)]
    stale += [f"{s} (NC_COMPILATION)"
              for s in sorted(set(NC_COMPILATION) - nc_seen)]
    violations += nc_new
    if violations or stale:
        print("check_source_licence: FAILED")
        for v in violations:
            print("  NEW encumbered source: " + v)
        for s in stale:
            #  Name the list the entry is actually in.  Two lists now feed
            #  this arm, and "remove it from PINNED" sent the reader to the
            #  wrong constant for every NC_COMPILATION entry.
            where = "NC_COMPILATION" if s.endswith("(NC_COMPILATION)") \
                else "NO_GRANT_CASE_LOCAL" if s.endswith("(NO_GRANT_CASE_LOCAL)") \
                else "SOURCE_LICENCE"
            name = s.replace(" (NC_COMPILATION)", "").replace(" (NO_GRANT_CASE_LOCAL)", "")
            print(f"  STALE PIN: {name} no longer cites an encumbered "
                  f"source -- remove it from debt_registry.{where}")
        if violations:
            print("\n  curation-protocol.md: 'do not enter their numbers, even "
                  "cited'.\n  A primary cited THROUGH an aggregator is fine "
                  "('..., via NIST WebBook');\n  the aggregator AS the source "
                  "is not.")
        return 1

    #  Collapsed-scan floor (2026-08-15 fleet census): 783 records observed;
    #  a count under 100 means the scan surface has collapsed, not that the
    #  catalogue shrank.  See check_true_ions.
    if nfiles < 100:
        print(f"check_source_licence: FAILED -- only {nfiles} record(s) "
              "scanned against a floor of 100; the scan surface has "
              "collapsed and a verdict over it would describe nothing.")
        return 1

    #  AN ACCEPTED DATABANK NOBODY CITES IS A ROW THAT PINS NOTHING -- and a
    #  row that pins nothing is the check_true_ions shape.  The table must
    #  earn its place on every run.
    for name in ACCEPTED_DATABANK:
        if accepted_seen.get(name, 0) == 0:
            print(f"check_source_licence: FAILED -- ACCEPTED_DATABANK['{name}'] "
                  "is cited by NO record; either the records were renamed "
                  "(re-point the pattern) or the row is dead (remove it).")
            return 1
    for cls, ex in EXCLUDED_TABLES.items():
        if ex["card"] not in CARDS.values():
            print(f"check_source_licence: FAILED -- EXCLUDED_TABLES['{cls}'] "
                  f"names card {ex['card']}, which CARDS does not carry; an "
                  "exclusion whose card no gate names is a sentence, not a "
                  "contract.")
            return 1
    #  THE CARD ARM: published <=> pinned, between the gate and thirdParty/.
    for name, card in CARDS.items():
        if not (ROOT / card).is_file():
            print(f"check_source_licence: FAILED -- CARDS['{name}'] names "
                  f"{card}, which does not exist; a source this gate rules "
                  "on has no card, so its licence position lives only here.")
            return 1
    for card, keeper in CARDS_OF_OTHER_GATES.items():
        kp = ROOT / keeper
        if not (ROOT / card).is_file() or not kp.is_file() \
           or card not in kp.read_text(errors="ignore"):
            print(f"check_source_licence: FAILED -- {card} must exist and be "
                  f"named, by path, inside {keeper}; it is not.")
            return 1
    known_cards = set(CARDS.values()) | set(CARDS_OF_OTHER_GATES)
    on_disk = {str(q.relative_to(ROOT)) for q in (ROOT / "thirdParty").glob("*/README.md")}
    orphan = sorted(on_disk - known_cards)
    if orphan:
        print("check_source_licence: FAILED -- card(s) no gate names: "
              + ", ".join(orphan) + ".  Add each to CARDS (this gate rules "
              "on it) or CARDS_OF_OTHER_GATES (another gate does) so its "
              "licence position is enforced somewhere.")
        return 1
    accepted_txt = "; ".join(
        f"{n} ({ACCEPTED_DATABANK[n]['licence']}, {k} record(s))"
        for n, k in sorted(accepted_seen.items()))
    print(f"check_source_licence: OK -- {nfiles} record(s) scanned (an "
          f"absent or collapsed scan root REFUSES); no "
          f"encumbered source stands as the authority for a value, except "
          f"{len(PINNED)} pinned violations awaiting curation (a primary "
          "datum, not a guess).  A primary cited via an aggregator is "
          "compliant and is not counted.  "
          f"NonCommercial compilations: no new record names Burcat/ReSpecTh "
          f"as a value's origin; {len(NC_COMPILATION)} existing ones do and "
          f"are pinned.  Engineering Toolbox and REFPROP (C65) are among the "
          f"names refused, and they alone are also sought in the {cl_nscan} "
          f"case-local records under tutorials/**/constant/: "
          f"{len(NO_GRANT_CASE_LOCAL)} name one as a value's origin, all "
          f"sealed NH3 mirrors awaiting re-import, pinned (every other name "
          f"is judged in data/standards/ only).  "
          f"Accepted third-party databanks, by CONTRACT here and "
          f"cross-checked against the importer's LICENSE constant: "
          f"{accepted_txt} -- and that acceptance has a SCOPE: "
          f"{len(EXCLUDED_TABLES)} excluded interaction-parameter table "
          f"classes (ChemSep .ipd, the thermo package's copy) are named as "
          f"a value's origin by no record.  No source file reproduces a "
          f"no-grant standard's table ({len(EXCLUDED_STANDARD_TABLES)} class: "
          f"the API STD 526 orifice-letter areas, matched by their VALUES "
          f"over {std_nscan} source files, not by the name).  "
          f"Every source ruled on here has a thirdParty/ card and "
          f"every card on disk is named by a gate ({len(on_disk)} card(s)).  "
          f"Vendored third-party code, by CONTRACT: "
          f"{', '.join(ACCEPTED_VENDORED_CODE)} -- {vendored_files} file(s) each "
          f"carrying its own licence notice, the LAPACK text the fetched one, "
          f"NOTICE naming every holder.")
    #  THE MANIFEST READS ONLY THE FIRST LINE.  gate_manifest.py captures
    #  `line[0]` as the gate's claim, so a claim printed on a second line is
    #  invisible in the one place that answers "what does this project
    #  check?" -- which is why the NC clause sits above and not here.  What
    #  is here is the caveat, and a caveat is not a claim.
    print("  The NonCommercial arm does NOT say the pinned records "
          "are acceptable -- it says the ratchet is on and that what "
          "to do with them is Vitor's, per the registry entry.  A "
          "mention after a cross-check marker enters no value and is "
          "not counted.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
