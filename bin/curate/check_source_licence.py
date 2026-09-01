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

#  KNOWN VIOLATIONS, pinned 2026-08-05 with the remedy each needs.  NOT
#  fixed here: a replacement datum is a curation act requiring a primary
#  source, and fabricating one is worse than the exposure it hides.
PINNED = SOURCE_LICENCE
SCAN = ["data/standards"]


def main() -> int:
    violations, pinned_seen, nfiles = [], set(), 0
    nc_new, nc_seen = [], set()
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

    print(f"check_source_licence: OK -- {nfiles} record(s) scanned (an "
          f"absent or collapsed scan root REFUSES); no "
          f"encumbered source stands as the authority for a value, except "
          f"{len(PINNED)} pinned violations awaiting curation (a primary "
          "datum, not a guess).  A primary cited via an aggregator is "
          "compliant and is not counted.  "
          f"NonCommercial compilations: no new record names Burcat/ReSpecTh "
          f"as a value's origin; {len(NC_COMPILATION)} existing ones do and "
          f"are pinned.")
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
