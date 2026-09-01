#!/usr/bin/env python3
"""Every number a PROCESS page quotes is recomputed from its witness's golden.

WHY THIS GATE EXISTS, and it is the bjerrum-prose argument with one more home.
The process EduTools teach through prose, and the prose quotes numbers --
a solved flame temperature, the two sulfur allotrope fractions at each end, the
H2S : SO2 ratio in both units, and the hydrogen that explains why the furnace
ratio is not two.  Those numbers live in THREE homes that cannot share a
variable:

    the case's own header (controlDict or flowsheetDict)
    the EduTool page that walks it
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

WHAT IT COVERS TODAY: two process pages -- `claus-gibbs` over
claus01_thermal_stage and `sour-water` over stripper02_sour_water_h2s.  A
third adds one dict to SUBJECTS and one block to quantities().

SABOTAGES, ten, all behave (S1 and S2 only once every site is corrupted):
  S1  the case header quotes the old 1.99926          -> FAILS, names the home
  S2  the page rounds 3.44 % to 3.4 %                 -> FAILS
  S3  the catalogue says 1515 K                       -> FAILS
  S4  a home quotes 1.9992700, one digit finer        -> FAILS (the number
      must stand alone: a substring test would pass this AND the reverse)
  S5  the golden itself moves                         -> FAILS on all 3 homes,
      which is the direction that matters: the pages are wrong, not the case
  S6  a prose home is deleted                         -> FAILS rather than
      passing over a subject that is not there
  S7  the sour-water page drops a pH digit             -> FAILS
  S8  the sour-water CASE HEADER quotes 7.62           -> FAILS (the header
      rounds to two decimals and the page prints seven; each is checked at
      the precision it publishes, so neither is excused)
  S9  the page rounds a tray temperature to 356.43     -> FAILS
  S10 the Claus arm still fires after generalisation   -> FAILS, so adding a
      second subject did not quietly disarm the first

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
CATALOGUE = os.path.join(ROOT, 'docs/tutorials-catalogue.md')

#  ONE ENTRY PER PROCESS PAGE.  A third page adds a dict here and a block in
#  quantities(); nothing else changes.
SUBJECTS = {
    'claus': {
        'case': os.path.join(ROOT,
                             'tutorials/steady/gibbs/claus01_thermal_stage'),
        'homes': {
            'case header': 'system/controlDict',
            'EduTool page': 'gui/src/ui/methods/ClausGibbsTool.tsx',
            'tutorials catalogue': 'docs/tutorials-catalogue.md',
        },
    },
    'sourwater': {
        'case': os.path.join(
            ROOT, 'tutorials/steady/distillation/stripper02_sour_water_h2s'),
        'homes': {
            'case header': 'system/flowsheetDict',
            'EduTool page': 'gui/src/ui/methods/SourWaterTool.tsx',
        },
    },
}


def golden(case):
    """{(unit, key): value} plus {('csv', 'stage:key'): value} for one case."""
    path = os.path.join(case, 'expected')
    if not os.path.exists(path):
        sys.exit("FAIL check_process_prose: %s does not exist.  A gate that "
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
            elif len(p) >= 4 and p[0] == 'csv':
                try:
                    out[('csv', p[2])] = float(p[3])
                except ValueError:
                    pass
    if len(out) < 15:
        sys.exit("FAIL check_process_prose: %s yielded %d golden row(s) -- "
                 "the witness records far more.  The scan has collapsed and "
                 "a verdict over it would describe nothing."
                 % (os.path.basename(case), len(out)))
    return out


def quantities(name, g):
    """[(label, value, format, [home names])] for one subject."""
    def kpi(unit, key):
        v = g.get((unit, key))
        if v is None:
            sys.exit("FAIL check_process_prose: %s has no %s/%s in its "
                     "golden -- the case changed shape and this gate is "
                     "describing a case that no longer exists."
                     % (name, unit, key))
        return v

    if name == 'claus':
        HDR, PAGE, CAT = 'case header', 'EduTool page', 'tutorials catalogue'
        y = lambda u, s: kpi(u, 'y_' + s)
        return [
            ("furnace temperature", kpi('furnace', 'T'), "%.2f", [HDR, PAGE, CAT]),
            ("furnace S2 %", 100 * y('furnace', 'S2'), "%.2f", [HDR, PAGE, CAT]),
            ("furnace H2S %", 100 * y('furnace', 'H2S'), "%.2f", [HDR, PAGE]),
            ("furnace SO2 %", 100 * y('furnace', 'SO2'), "%.2f", [HDR, PAGE]),
            ("furnace H2 %", 100 * y('furnace', 'H2'), "%.2f", [HDR, PAGE]),
            ("furnace CO %", 100 * y('furnace', 'CO'), "%.2f", [HDR, PAGE]),
            ("furnace COS %", 100 * y('furnace', 'carbonylSulfide'), "%.3f",
             [HDR, PAGE]),
            ("furnace H2S:SO2", y('furnace', 'H2S') / y('furnace', 'SO2'),
             "%.2f", [HDR, PAGE, CAT]),
            ("boiler S8 %", 100 * y('boiler', 'S8'), "%.2f", [HDR, PAGE, CAT]),
            ("boiler S2 %", 100 * y('boiler', 'S2'), "%.3f", [HDR, PAGE, CAT]),
            ("boiler H2S %", 100 * y('boiler', 'H2S'), "%.3f", [HDR, PAGE]),
            ("boiler SO2 %", 100 * y('boiler', 'SO2'), "%.3f", [HDR, PAGE]),
            ("boiler H2S:SO2", y('boiler', 'H2S') / y('boiler', 'SO2'),
             "%.6f", [HDR, PAGE, CAT]),
        ]

    if name == 'sourwater':
        HDR, PAGE = 'case header', 'EduTool page'
        c = lambda k: kpi('csv', k)
        #  The case header rounds its pH claim to two decimals ("8.49 -> 7.61")
        #  and the page prints every digit.  That is a fact about the two
        #  pages, not a workaround: each is checked at the precision it
        #  publishes, so neither is excused and neither is asked for digits
        #  it never claimed.
        return [
            ("top pH (page)", c('0:pH'), "%.7f", [PAGE]),
            ("top pH (header)", c('0:pH'), "%.2f", [HDR]),
            ("bottom pH (page)", c('7:pH'), "%.7f", [PAGE]),
            ("bottom pH (header)", c('7:pH'), "%.2f", [HDR]),
            ("top m_HCO3", c('1:m_HCO3'), "%.8f", [PAGE]),
            ("bottom m_HCO3", c('7:m_HCO3'), "%.10g", [PAGE]),
            ("top m_HS", c('1:m_HS'), "%.8f", [PAGE]),
            ("bottom m_HS", c('7:m_HS'), "%.8f", [PAGE]),
            ("bottom m_H2Saq", c('7:m_H2Saq'), "%.9f", [PAGE]),
            ("T top", kpi('tower', 'T_top'), "%.9f", [PAGE]),
            ("T bottom", kpi('tower', 'T_bottom'), "%.9f", [PAGE]),
        ]

    sys.exit("FAIL check_process_prose: no quantities defined for subject "
             "'%s'.  A subject with nothing to check is a subject nobody "
             "checks." % name)


def main():
    bad, checked, nq = [], 0, 0
    for name, sub in SUBJECTS.items():
        g = golden(sub['case'])
        texts = {}
        for home, rel in sub['homes'].items():
            path = (CATALOGUE if rel.startswith('docs/')
                    else os.path.join(ROOT, rel) if rel.startswith('gui/')
                    else os.path.join(sub['case'], rel))
            if not os.path.exists(path):
                sys.exit("FAIL check_process_prose: %s home '%s' (%s) does "
                         "not exist.  A gate whose subject is absent must "
                         "not pass." % (name, home, path))
            with open(path) as fh:
                texts[home] = fh.read()

        qs = quantities(name, g)
        nq += len(qs)
        for label, value, fmt, homes in qs:
            want = fmt % value
            for home in homes:
                checked += 1
                #  NOT a substring test.  `"1.04" in text` matches inside
                #  "1.0424", so a home quoting the number to MORE digits than
                #  declared would pass while a home quoting FEWER would also
                #  pass -- blind in both directions at once.  It must stand
                #  alone.
                pat = re.compile(r'(?<![\d.])' + re.escape(want) + r'(?![\d])')
                if not pat.search(texts[home]):
                    bad.append("%s / %s: %s should read %s and does not "
                               "appear there" % (name, home, label, want))

    if bad:
        print("check_process_prose: FAILED")
        for b in bad:
            print("  " + b)
        print("\n  The golden is the one home that is MEASURED.  Fix the "
              "prose, or re-record the case and then fix the prose -- never "
              "the other way round.")
        return 1

    print("check_process_prose: OK -- %d quotation(s) of %d quantit(ies) "
          "across %d process page(s) all reproduce their witness's golden to "
          "the precision each home prints at.  NOT CHECKED: whether a golden "
          "is RIGHT (they are self-recorded), whether the sentence AROUND a "
          "number is true, or any number not listed in quantities() -- which "
          "is how a 1.99926 survived three homes on the day the Claus case "
          "was written." % (checked, nq, len(SUBJECTS)))
    return 0


if __name__ == '__main__':
    sys.exit(main())
