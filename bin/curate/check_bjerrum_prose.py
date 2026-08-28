#!/usr/bin/env python3
"""Every number the Bjerrum pages QUOTE is recomputed from the witness's golden.

WHY THIS GATE EXISTS.  `bjerrum01_carbonate_pH` teaches through prose, and the
prose quotes numbers -- two crossover pH's, the two pK's they sit below, the
carbonate activity coefficient at each, and the depth of the sum-to-one dip.
Those numbers live in TWO homes that cannot share a variable (a case header the
solver reads past, and a TypeScript lesson the browser reads) and are DERIVED
from a third (the golden).  That is the arity sin with prose on top, and it had
already drifted: the case header said gamma_CO3 = 0.82 where the lesson said
0.81 and the golden says 0.8130.  Nothing failed, because nothing looked.

WHAT IT CHECKS.  It reads `expected`, interpolates the two crossovers the same
way a reader would (linearly in pH on the log ratio of the two molalities),
takes the minimum of the three fractions, and requires BOTH prose homes to
quote each quantity to the precision they print it at.  A number that moves in
the golden and not on the page now FAILS by name.

WHAT IT DOES NOT CHECK.  Nothing about whether the numbers are RIGHT -- the
golden is self-recorded and this gate compares prose against it, never against
measurement.  It does not read the generated tutorials guide (that is derived
from the case header by `buildDocs`, and `check_docs_fresh` owns staleness).
And it checks the quantities listed in QUOTED below, not every digit on either
page: a number added to the prose without a row here is unchecked, exactly as
the 0.82 was.
"""
import collections, math, os, re, sys

ROOT   = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CASE   = os.path.join(ROOT, 'tutorials/props/electrolyte/bjerrum01_carbonate_pH')
HEADER = os.path.join(CASE, 'system/propsDict')
LESSON = os.path.join(ROOT, 'gui/src/ui/methods/bjerrumLesson.ts')

def golden():
    d = collections.defaultdict(dict)
    with open(os.path.join(CASE, 'expected')) as fh:
        for ln in fh:
            p = ln.split()
            if len(p) >= 4 and p[0] == 'diag':
                try: d[p[1]][p[2]] = float(p[3])
                except ValueError: pass
    rows = sorted((v['pH'], k, v) for k, v in d.items() if 'pH' in v)
    if len(rows) < 10:
        sys.exit("FAIL check_bjerrum_prose: the golden yielded %d pH points -- "
                 "expected the 44 the witness declares.  A gate that cannot "
                 "read its subject must not pass." % len(rows))
    return rows

def crossover(rows, a, b):
    """pH where molality a == molality b, and gamma_CO3 there."""
    hit = None
    for i in range(len(rows) - 1):
        try:
            fa = math.log(rows[i][2][a] / rows[i][2][b])
            fb = math.log(rows[i+1][2][a] / rows[i+1][2][b])
        except (KeyError, ValueError, ZeroDivisionError):
            continue
        if (fa > 0) != (fb > 0):
            t = fa / (fa - fb)
            hit = (rows[i][0] + t*(rows[i+1][0] - rows[i][0]),
                   rows[i][2]['gamma_CO3'] + t*(rows[i+1][2]['gamma_CO3']
                                                - rows[i][2]['gamma_CO3']))
    if hit is None:
        sys.exit("FAIL check_bjerrum_prose: no %s/%s crossover in the golden."
                 % (a, b))
    return hit

def main():
    rows = golden()
    pH1, g1 = crossover(rows, 'm_CO2aq', 'm_HCO3')
    pH2, g2 = crossover(rows, 'm_HCO3',  'm_CO3')
    C_T = 1.0e-3
    dip = min(sum(v[k] for k in ('m_CO2aq', 'm_HCO3', 'm_CO3')) / C_T
              for _, _, v in rows)

    #  (label, measured value, decimals as each page prints it)
    QUOTED = [
        ("first crossover pH",        pH1, 3),
        ("second crossover pH",       pH2, 3),
        ("gamma_CO3 at crossover 1",  g1,  2),
        ("gamma_CO3 at crossover 2",  g2,  2),
    ]
    pages = {"case header": open(HEADER).read(),
             "lesson":      open(LESSON).read()}

    bad = []
    for label, value, dp in QUOTED:
        want = "%.*f" % (dp, value)
        for pname, text in pages.items():
            if want not in text:
                bad.append("%s: %s should read %s (golden: %.6f) -- not found"
                           % (pname, label, want, value))
    #  the dip is printed at two precisions, and BOTH must be roundings of the
    #  same measured number -- that is the point, not a licence to differ.
    for pname, text, dp in (("case header", pages["case header"], 5),
                            ("lesson",      pages["lesson"],      4)):
        want = "%.*f" % (dp, dip)
        if want not in text:
            bad.append("%s: sum-to-one dip should read %s (golden: %.8f)"
                       % (pname, want, dip))

    #  the overstatement this gate was born from: the engine DOES take a pH.
    for pname, text in pages.items():
        m = re.search(r'no pH (input|knob)', text)
        if m:
            bad.append("%s: claims '%s' -- Speciate.cpp accepts `pH <number>;` "
                       "as well as `pH solve;`" % (pname, m.group(0)))

    if bad:
        print("FAIL check_bjerrum_prose:")
        for b in bad: print("  " + b)
        sys.exit(1)

    print("OK check_bjerrum_prose: 4 quoted quantities + the sum-to-one dip "
          "recomputed from the golden and found in BOTH prose homes "
          "(crossovers pH %.3f / %.3f, gamma_CO3 %.2f / %.2f, dip %.6f); "
          "the given-pH overstatement is absent from both.  Checks prose "
          "against the SELF-RECORDED golden, never against measurement."
          % (pH1, pH2, g1, g2, dip))

if __name__ == '__main__':
    main()
