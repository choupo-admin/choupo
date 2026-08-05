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

ROOT = Path(__file__).resolve().parents[2]

#  The protocol's NEVER list, as name patterns.  DECHEMA is handled
#  separately: a NAMED monograph in the series (Knapp et al.) is a citable
#  publication, while "curated from the DECHEMA bank" is transcription.
ENCUMBERED = re.compile(
    r'\b(CRC\s+Handbook|NIST\s+WebBook|NIST\s+SRD|DIPPR|Yaws|'
    r'CAS\s+Common\s+Chemistry|DDBST|Dortmund\s+Data\s+Bank)\b', re.I)
DECHEMA = re.compile(r'\bDECHEMA\b', re.I)

#  A route marker: the aggregator is where the value was READ.
VIA = re.compile(r'\b(via|through|accessed\s+(?:via|through)|retrieved\s+from)\b', re.I)

#  Fields that assert authority for a value.  A mention in a free-text
#  `note` is commentary; a mention in `source`/`citation`/`method` is a claim.
AUTHORITY_FIELD = re.compile(r'\b(source|citation|method|Source|Primary\s+data)\b')

#  KNOWN VIOLATIONS, pinned 2026-08-05 with the remedy each needs.  NOT
#  fixed here: a replacement datum is a curation act requiring a primary
#  source, and fabricating one is worse than the exposure it hides.
PINNED = {
    "data/standards/components/H3PO4.dat":
        "dHf_298 is taken FROM CRC (-1284.4 kJ/mol).  The file's own header "
        "names the primary (Wagman et al., NBS Tables 1982) and records that "
        "it gives -1279.0 -- a DIFFERENT number, so this is not a re-citation "
        "but a value change, and it moves a golden.  Needs Vitor.",
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

SCAN = ["data/standards"]


def main() -> int:
    violations, pinned_seen, nfiles = [], set(), 0
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
    if violations or stale:
        print("check_source_licence: FAILED")
        for v in violations:
            print("  NEW encumbered source: " + v)
        for s in stale:
            print(f"  STALE PIN: {s} no longer cites an encumbered source "
                  "-- remove it from PINNED")
        if violations:
            print("\n  curation-protocol.md: 'do not enter their numbers, even "
                  "cited'.\n  A primary cited THROUGH an aggregator is fine "
                  "('..., via NIST WebBook');\n  the aggregator AS the source "
                  "is not.")
        return 1

    print(f"check_source_licence: OK -- {nfiles} record(s) scanned; no "
          f"encumbered source stands as the authority for a value, except "
          f"{len(PINNED)} pinned violations awaiting curation (a primary "
          "datum, not a guess).  A primary cited via an aggregator is "
          "compliant and is not counted.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
