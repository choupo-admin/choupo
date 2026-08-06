#!/usr/bin/env python3
"""Gate: every aqueous equilibrium is either CHECKED against the tree's own
species data, or its reason for being uncheckable is NAMED.

    bin/curate/check_logk_crosscheck.py

WHY THIS EXISTS.  `data/standards/chemistry/` holds 77 equilibrium records,
each carrying a `logK25` taken from a primary source (overwhelmingly USGS
PHREEQC).  `data/standards/species/` holds the aqueous species, many carrying
`hfAq` and `sAq`.  Those two sets describe the SAME thermodynamics, and until
2026-08-06 nothing had ever compared them.

The comparison is exact arithmetic, not a correlation.  For a reaction that is
balanced in elements and charge, the element-reference terms cancel, so

    dG0 = SUM nu_i * (hfAq_i - T * sAq_i)
    logK25 = -dG0 / (ln10 * R * T)

That is the same cancellation the electrolyte builder already relies on when
it says H+(aq) = 0 cancels for a neutral salt.  No element entropies are
needed and none are assumed.

WHAT THE FIRST RUN FOUND, and it is the reason this ships as a COVERAGE gate
rather than a correctness one:

    77 records, all accounted for, 0 unparsed
     2  derivable  -> both AGREE (dlogK -0.0084 and +0.0045)
    75  NOT derivable:
        43   the species is a DERIVED COMPLEX -- see below
        11   water participates AND a species datum is missing
         9   recordType gasLiquidEquilibrium  (a different standard state)
         6   recordType ionExchangeEquilibrium (ditto)
         5   a genuine curation gap: the species file exists and carries no
             hfAq/sAq (H2PO4, HPO4, Tart, HTart, H2Tart)
         1   water participates (no record anywhere carries water's LIQUID
             formation datum -- water.dat has only the ideal-gas one)

AND THE DECISIVE DISTINCTION, which a first version of this gate got wrong.
Of the 59 distinct species blocking coverage, 53 HAVE NO SPECIES FILE AT ALL.
They are ion pairs and hydroxo complexes -- CaSO4aq, MgHCO3, FeOH2aq -- that
exist only as the PRODUCT of their own formation record.  No independent
tabulated hfAq/sAq exists for them anywhere, because the logK IS their primary
datum.  Those records are STRUCTURALLY uncheckable: a definition cannot be
verified against itself.

So 2 of 77 is close to the structural maximum, NOT a backlog.  The first draft
of this file called all 48 "a target list", which would have sent a curator
hunting for values that do not exist.  Only five are genuinely curable, and
they are named in the gate's own output so the list cannot drift.

Where the check DOES run it agrees to better than 0.01 log units, which says
the method is right and the ceiling is structural.

WHAT IS CHECKED:

  (a) EVERY RECORD IS ACCOUNTED FOR.  Unparsed must be zero.  A record whose
      shape the reader does not recognise is not "fine", it is invisible -- and
      a first draft of this very script silently matched 14 of 77 and reported
      a confident "2 agree" over a sample it never mentioned.  That arm exists
      because the author made exactly that mistake an hour earlier.

  (b) A DERIVABLE RECORD AGREES.  Tolerance 0.30 log units, which is generous
      on purpose: the logK and the species enthalpies come from DIFFERENT
      primary sources, and the project's standing rule is that independent
      primaries disagreeing is a finding, while same-source disagreement is
      the only error.  A record beyond tolerance is reported with its size in
      log units and as a factor in K, for curation to adjudicate.

  (c) COVERAGE MAY NOT SILENTLY FALL.  The count of derivable records is
      pinned.  It may RISE freely -- adding hfAq/sAq to a species makes more
      records checkable, which is the point -- but a DROP means a datum was
      removed or a record reshaped, and that must be deliberate.

WHAT IS NOT CHECKED, said plainly rather than implied:

  * whether a curated logK is RIGHT.  Seventy-five of seventy-seven are not
    examined at all by this gate.  A green run here is not a statement about
    the chemistry catalogue's correctness; it is a statement that the small
    checkable part is consistent and that the unchecked part is enumerated.
  * gas-liquid and ion-exchange equilibria.  They are on different standard
    states (Henry / exchange convention) and the same arithmetic does not
    apply.  They are named as out of scope, not silently dropped.

Exit 1 on an unparsed record, a disagreement beyond tolerance, or a fall in
coverage.
"""
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CHEM = ROOT / "data" / "standards" / "chemistry"
SPEC = ROOT / "data" / "standards" / "species"

R, T, LN10 = 8.314462618, 298.15, 2.302585093

#  Independent primaries may legitimately differ; same-source disagreement is
#  the error.  0.30 log units is ~2x in K -- wide enough not to cry wolf over a
#  CODATA-vs-PHREEQC gap, narrow enough that a transcription slip cannot hide.
TOL = 0.30

#  Pinned floor, not a target.  It may rise; a FALL is a removed datum.
MIN_DERIVABLE = 2


def live(text):
    """The text the PARSER would see: comments removed.

    Found by sabotage.  Commenting out CO3's `sAq` left this gate's coverage
    unchanged, because a bare regex matches happily inside a `//` line -- so
    the check was reading a datum the engine itself ignores, and would have
    derived a logK from a value no run can see.  That is the project's own
    rule (`a field the engine cannot see is a comment`) turned inside out, and
    it is the failure mode a curation tool is most prone to.
    """
    text = re.sub(r"/\*.*?\*/", " ", text, flags=re.S)
    return re.sub(r"//[^\n]*", " ", text)


def species_table():
    out = {}
    for f in sorted(SPEC.glob("*.dat")):
        t = live(f.read_text(errors="replace"))
        h = re.search(r"hfAq\s*\{\s*value\s+(-?[\d.eE+]+)", t)
        s = re.search(r"sAq\s*\{\s*value\s+(-?[\d.eE+]+)", t)
        if h and s:
            out[f.stem] = (float(h.group(1)), float(s.group(1)))
    return out


def main() -> int:
    if not CHEM.is_dir() or not SPEC.is_dir():
        print("check_logk_crosscheck: FAILED\n  the chemistry or species tree "
              "is missing -- a check that cannot run must not pass")
        return 1

    sp = species_table()
    agree, disagree, named, unparsed = [], [], [], []
    structural, curable = set(), set()

    for f in sorted(CHEM.glob("*.dat")):
        t = live(f.read_text(errors="replace"))
        rt = re.search(r"recordType\s+(\w+)", t)
        rt = rt.group(1) if rt else "?"
        if rt in ("gasLiquidEquilibrium", "ionExchangeEquilibrium"):
            named.append((f.stem, f"recordType {rt}: a different standard "
                                  "state; this arithmetic does not apply"))
            continue
        if rt != "aqueousSpeciation":
            unparsed.append((f.stem, f"unrecognised recordType '{rt}'"))
            continue
        lk = re.search(r"logK25\s+(-?[\d.eE+]+)", t)
        prod = re.search(r"species\s+(\w+)\s*;", t)
        mas = re.search(r"masters\s*\((.*?)\)\s*;", t, re.S)
        if not lk:
            named.append((f.stem, "no logK25 declared"))
            continue
        if not prod or not mas:
            unparsed.append((f.stem, "aqueousSpeciation with no species/masters"))
            continue

        nuW = re.search(r"nuWater\s+(-?[\d.]+)", t)
        nuW = float(nuW.group(1)) if nuW else 0.0
        terms = re.findall(r"ion\s+(\w+)\s*;\s*nu\s+(-?[\d.]+)", mas.group(1))
        need = [prod.group(1)] + [n for n, _ in terms]
        miss = sorted({n for n in need if n not in sp})

        if nuW != 0.0 and miss:
            named.append((f.stem, "water participates AND species datum "
                                  "missing: " + ",".join(miss)))
            continue
        if nuW != 0.0:
            named.append((f.stem, "water participates -- no record carries "
                                  "water's LIQUID formation datum (water.dat "
                                  "has only the ideal-gas one)"))
            continue
        if miss:
            #  TWO VERY DIFFERENT REASONS, and conflating them overstates what
            #  curation could ever achieve.
            #
            #  A species with NO FILE AT ALL is a DERIVED COMPLEX -- an ion
            #  pair or hydroxo species (CaSO4aq, MgHCO3, FeOH2aq) that exists
            #  only as the product of this very record.  There is no
            #  independent tabulated hfAq/sAq for it anywhere, because the
            #  logK IS its primary datum.  Such a record is STRUCTURALLY
            #  uncheckable: you cannot verify a definition against itself.
            #
            #  A species that HAS a file but lacks the two values is a genuine
            #  curation gap, and the only kind that adding data can close.
            #
            #  Measured 2026-08-06: 59 distinct species block coverage, and 53
            #  of them have no file -- so the checkable fraction is near its
            #  structural maximum, not a backlog.  A first version of this
            #  gate called all of them "a target list", which was wrong and
            #  would have sent a curator hunting for values that do not exist.
            orphan = [n for n in miss if not (SPEC / f"{n}.dat").exists()]
            gap = [n for n in miss if (SPEC / f"{n}.dat").exists()]
            if orphan:
                named.append((f.stem, "derived complex, no independent datum "
                                      "exists (the logK defines it): "
                                      + ",".join(orphan)))
                structural.update(orphan)
            else:
                named.append((f.stem, "curation gap -- species file exists but "
                                      "carries no hfAq/sAq: " + ",".join(gap)))
                curable.update(gap)
            continue

        def g(n):
            h, s = sp[n]
            return h - T * s

        dG = g(prod.group(1)) - sum(float(nu) * g(n) for n, nu in terms)
        d = -dG / (LN10 * R * T) - float(lk.group(1))
        (agree if abs(d) < TOL else disagree).append((f.stem, d))

    total = len(agree) + len(disagree) + len(named) + len(unparsed)
    fail = []

    if unparsed:
        fail.append(f"{len(unparsed)} record(s) UNPARSED -- a record whose "
                    "shape the reader does not recognise is invisible, not "
                    "fine:\n      "
                    + "\n      ".join(f"{n}: {w}" for n, w in unparsed))

    for n, d in sorted(disagree, key=lambda x: -abs(x[1])):
        fail.append(f"{n}: derived logK25 differs from the curated value by "
                    f"{d:+.3f} log units ({10**abs(d):.1f}x in K).  Either the "
                    "curated logK or the species hfAq/sAq is wrong, or they "
                    "come from sources that genuinely disagree -- which is a "
                    "curation finding, not a silent tolerance.")

    n_der = len(agree) + len(disagree)
    if n_der < MIN_DERIVABLE:
        fail.append(f"coverage FELL: {n_der} record(s) derivable, pinned floor "
                    f"is {MIN_DERIVABLE}.  Coverage may rise freely; a drop "
                    "means a species datum was removed or a record reshaped.")

    if fail:
        print("check_logk_crosscheck: FAILED")
        for f_ in fail:
            print("  * " + f_)
        return 1

    reasons = Counter(w.split(":")[0].split(" --")[0] for _, w in named)
    top = "; ".join(f"{c} {r}" for r, c in reasons.most_common(3))
    print(f"check_logk_crosscheck: OK -- {total} record(s) accounted for, 0 "
          f"unparsed; {n_der} derivable from the tree's own species data and "
          f"all within {TOL} log units (max |dlogK| "
          f"{max((abs(d) for _, d in agree), default=0.0):.4f}); "
          f"{len(named)} not derivable, each with its reason named ({top}).  "
          f"Of the species involved, {len(structural)} are DERIVED COMPLEXES with "
          f"no independent datum anywhere -- the logK defines them, so those "
          f"records are structurally uncheckable, not a backlog -- against "
          f"{len(curable)} genuine curation gap(s) where a species file exists "
          f"and carries no hfAq/sAq"
          + (": " + ", ".join(sorted(curable)) if curable else "") + ".  "
          "THIS GATE DOES NOT SAY THE CATALOGUE IS RIGHT: it examines only the "
          "checkable part and enumerates the rest, and the rest is most of it.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
