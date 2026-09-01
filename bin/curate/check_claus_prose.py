#!/usr/bin/env python3
"""Every number the Claus pages QUOTE is recomputed from the witness's golden.

WHY THIS GATE EXISTS, and it is the bjerrum-prose argument with one more home.
`claus01_thermal_stage` teaches through prose, and the prose quotes numbers --
a solved flame temperature, the two sulfur allotrope fractions at each end, the
H2S : SO2 ratio in both units, and the hydrogen that explains why the furnace
ratio is not two.  Those numbers live in THREE homes that cannot share a
variable:

    tutorials/steady/gibbs/claus01_thermal_stage/system/controlDict
    gui/src/ui/methods/ClausGibbsTool.tsx
    docs/tutorials-catalogue.md

and are DERIVED from a fourth, the case's `expected`.  Three transcriptions of
one measurement is the arity sin with prose on top, and it had ALREADY drifted
before the page shipped: the ratio is 1.999270 and two homes said 1.99926,
carbonyl sulfide is 0.0370 % and one home rounded it to 0.04 %, and the
boiler's S2 was 0.05 % in one home and 0.055 % in another.  Nothing failed,
because nothing looked -- which is the whole finding.

WHAT IT CHECKS.  It reads `expected`, recomputes each quantity in QUOTED, and
requires each home NAMED for that quantity to contain the recomputed value,
formatted the way that home prints it.  A number that moves in the golden and
not on the page then FAILS by name.

WHY CONTAINMENT AND NOT A SHAPE MATCH, which was the first design and was
wrong: "any number with this integer part and this many decimals" finds sixty
unrelated numbers in a 400-row catalogue and reports every one as a
disagreement.  The gate's own first run printed 79 false findings about
`0.055` and then, in the same breath, a TRUE one -- which is precisely the
signal-to-noise a gate must not have.  A quantity is checked in the homes that
are declared to carry it, and a home that stops carrying it FAILS rather than
passing silently.

A HOME MAY STILL CONTRADICT ITSELF, and this is the sharpest blind spot.
The test is that the right number appears in the home, not that every mention
of it is right: a page quoting 3.44 % in its table and 3.4 % in its prose
passes.  Found while sabotaging -- two sabotages SURVIVED because each number
appears twice in its home and only the first was corrupted, which looked like
a gate defect and was a sabotage defect, but the survival is real for the
half-wrong case.  Closing it means locating each mention, which is a second
transcription of the page's layout; stated instead.

SABOTAGES, all six behave (S1 and S2 only once every site is corrupted):
  S1  the case header quotes the old 1.99926          -> FAILS, names the home
  S2  the page rounds 3.44 % to 3.4 %                 -> FAILS
  S3  the catalogue says 1515 K                       -> FAILS
  S4  a home quotes 1.9992700, one digit finer        -> FAILS (the number
      must stand alone: a substring test would pass this AND the reverse)
  S5  the golden itself moves                         -> FAILS on all 3 homes,
      which is the direction that matters: the pages are wrong, not the case
  S6  a prose home is deleted                         -> FAILS rather than
      passing over a subject that is not there

WHAT IT DOES NOT CHECK.  Nothing about whether the numbers are RIGHT: the
golden is self-recorded, and this gate compares prose against it, never against
measurement.  It does not verify the PROSE AROUND a number -- "S8 dominates"
beside a correct 3.44 % would pass, and the claim is a reading judgement.  And
it checks the quantities listed in QUOTED, not every digit on any page: a
number added to the prose without a row here is unchecked, exactly as the
1.99926 was.
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CASE = os.path.join(ROOT, 'tutorials/steady/gibbs/claus01_thermal_stage')
HOMES = {
    'case header': os.path.join(CASE, 'system/controlDict'),
    'EduTool page': os.path.join(ROOT, 'gui/src/ui/methods/ClausGibbsTool.tsx'),
    'tutorials catalogue': os.path.join(ROOT, 'docs/tutorials-catalogue.md'),
}


def golden():
    """{(unit, key): value} from the case's recorded KPI rows."""
    path = os.path.join(CASE, 'expected')
    if not os.path.exists(path):
        sys.exit("FAIL check_claus_prose: %s does not exist.  A gate that "
                 "cannot read its subject must not pass." % path)
    out = {}
    with open(path) as fh:
        for ln in fh:
            p = ln.split()
            if len(p) >= 4 and p[0] in ('kpi', 'stream'):
                try:
                    out[(p[1], p[2])] = float(p[3])
                except ValueError:
                    pass
    if len(out) < 40:
        sys.exit("FAIL check_claus_prose: the golden yielded %d row(s) -- the "
                 "witness records far more.  The scan has collapsed and a "
                 "verdict over it would describe nothing." % len(out))
    return out


def main():
    g = golden()

    def y(unit, sp):
        v = g.get((unit, 'y_' + sp))
        if v is None:
            sys.exit("FAIL check_claus_prose: the golden has no y_%s for "
                     "'%s' -- the case changed shape and this gate is "
                     "describing a case that no longer exists." % (sp, unit))
        return v

    CASE_HEADER, PAGE, CATALOGUE = HOMES.keys()

    #  (label, value, format, homes that must carry it).
    #
    #  THE FORMAT IS PART OF THE CLAIM.  A page printing 3.44 % beside a
    #  golden of 0.034379 agrees; the same page printing 3.4 % is quoting a
    #  coarser number and a reader cannot reproduce the arithmetic from it.
    #  Where two homes print a quantity to different precision, it appears
    #  twice below -- which is a fact about the pages, not a workaround.
    QUOTED = [
        ("furnace temperature", g[('furnace', 'T')], "%.2f",
         [CASE_HEADER, PAGE, CATALOGUE]),
        ("furnace S2 %", 100 * y('furnace', 'S2'), "%.2f",
         [CASE_HEADER, PAGE, CATALOGUE]),
        ("furnace H2S %", 100 * y('furnace', 'H2S'), "%.2f",
         [CASE_HEADER, PAGE]),
        ("furnace SO2 %", 100 * y('furnace', 'SO2'), "%.2f",
         [CASE_HEADER, PAGE]),
        ("furnace H2 %", 100 * y('furnace', 'H2'), "%.2f",
         [CASE_HEADER, PAGE]),
        ("furnace CO %", 100 * y('furnace', 'CO'), "%.2f",
         [CASE_HEADER, PAGE]),
        ("furnace COS %", 100 * y('furnace', 'carbonylSulfide'), "%.3f",
         [CASE_HEADER, PAGE]),
        ("furnace H2S:SO2", y('furnace', 'H2S') / y('furnace', 'SO2'), "%.2f",
         [CASE_HEADER, PAGE, CATALOGUE]),
        ("boiler S8 %", 100 * y('boiler', 'S8'), "%.2f",
         [CASE_HEADER, PAGE, CATALOGUE]),
        ("boiler S2 %", 100 * y('boiler', 'S2'), "%.3f",
         [CASE_HEADER, PAGE, CATALOGUE]),
        ("boiler H2S %", 100 * y('boiler', 'H2S'), "%.3f",
         [CASE_HEADER, PAGE]),
        ("boiler SO2 %", 100 * y('boiler', 'SO2'), "%.3f",
         [CASE_HEADER, PAGE]),
        ("boiler H2S:SO2", y('boiler', 'H2S') / y('boiler', 'SO2'), "%.6f",
         [CASE_HEADER, PAGE, CATALOGUE]),
    ]

    texts = {}
    for name, path in HOMES.items():
        if not os.path.exists(path):
            sys.exit("FAIL check_claus_prose: home '%s' (%s) does not exist.  "
                     "A gate whose subject is absent must not pass."
                     % (name, path))
        with open(path) as fh:
            texts[name] = fh.read()

    bad, checked = [], 0
    for label, value, fmt, homes in QUOTED:
        want = fmt % value
        for name in homes:
            checked += 1
            #  NOT a substring test.  `"1.04" in text` matches inside
            #  "1.0424", so a home quoting the number to MORE digits than
            #  declared would pass while a home quoting it to fewer would
            #  also pass -- the gate would be blind in both directions at
            #  once.  The number must stand alone.
            pat = re.compile(r'(?<![\d.])' + re.escape(want) + r'(?![\d])')
            if not pat.search(texts[name]):
                bad.append("%s: %s should read %s and does not appear there"
                           % (name, label, want))

    if bad:
        print("check_claus_prose: FAILED")
        for b in bad:
            print("  " + b)
        print("\n  The golden is the one home that is MEASURED.  Fix the "
              "prose, or re-record the case and then fix the prose -- never "
              "the other way round.")
        return 1

    print("check_claus_prose: OK -- %d quotation(s) of %d quantit(ies) across "
          "%d prose home(s) all reproduce the witness's golden to the "
          "precision they print at.  NOT CHECKED: whether the golden is RIGHT "
          "(it is self-recorded), whether the sentence AROUND a number is "
          "true, or any number not listed in QUOTED -- which is how a 1.99926 "
          "survived three homes on the day this case was written."
          % (checked, len(QUOTED), len(HOMES)))
    return 0


if __name__ == '__main__':
    sys.exit(main())
