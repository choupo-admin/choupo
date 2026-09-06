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
"""
import re
import sys
from pathlib import Path

#  THE WAIVERS LIVE IN ONE PLACE.  See `debt_registry.py` -- a pin is a
#  decision to tolerate a known violation, and "what are we currently
#  tolerating?" is a fact with exactly one home.
import sys as _sys
_sys.path.insert(0, str(Path(__file__).resolve().parent))
from debt_registry import SOURCE_LICENCE, NC_COMPILATION

ROOT = Path(__file__).resolve().parents[2]

#  The protocol's NEVER list, as name patterns.  DECHEMA is handled
#  separately: a NAMED monograph in the series (Knapp et al.) is a citable
#  publication, while "curated from the DECHEMA bank" is transcription.
ENCUMBERED = re.compile(
    r'\b(CRC\s+Handbook|NIST\s+WebBook|NIST\s+SRD|DIPPR|Yaws|'
    r'CAS\s+Common\s+Chemistry|DDBST|Dortmund\s+Data\s+Bank)\b', re.I)
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
    "NASA TR R-132": "thirdParty/svehla/README.md",
    "Burcat":        "thirdParty/README.md",   # one bulk file, no folder: its card is the index row
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
            for n, line in enumerate(lines, 1):
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

    stale = sorted(set(PINNED) - pinned_seen)
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
                else "SOURCE_LICENCE"
            name = s.replace(" (NC_COMPILATION)", "")
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
          f"are pinned.  Accepted third-party databanks, by CONTRACT here and "
          f"cross-checked against the importer's LICENSE constant: "
          f"{accepted_txt}.  Every source ruled on here has a thirdParty/ card and "
          f"every card on disk is named by a gate ({len(on_disk)} card(s)).")
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
