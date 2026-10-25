#!/usr/bin/env python3
"""Gate: the bund capacity arithmetic Choupo's layout check computes (DEV.md
4c C134) is the arithmetic the secondary-containment EduTool teaches (C136),
on numbers the green-ammonia witness's own bund supplies.

    bin/curate/check_bund_arithmetic.py

WHY THIS EXISTS.  The capacity arithmetic of a bund lives in TWO
implementations: the C++ the layout check calls
(`src/postProcessing/layout/BundArithmetic.H`, from `PlantLayout.cpp`'s
`readBunds`) and the TypeScript the "Secondary containment: designing a
bund" EduTool computes (`gui/src/ui/methods/bund.ts`).  Two homes for one
procedure drift the day one is edited unless something compares them -- the
C62 relief-valve precedent (`check_relief_valve`), applied again.  It is its
own gate rather than an arm of `check_plant_layout` because it runs in a
second and READS gui/, so the `--gui` path reaches it; `check_plant_layout`
runs the witness cases and takes minutes.

WHAT THIS CHECKS:

  (a) THE TWO IMPLEMENTATIONS AGREE, ON THE PINNED EXAMPLES.  Every
      `pin("<name>", <call>, <value>);` line of `gui/tests/bund.test.ts` --
      read from that file, never typed here -- is compiled AS WRITTEN against
      `BundArithmetic.H` alone (g++ -std=c++17, the function names put in
      `bundMath::`; no engine build touched) and the C++ must give the value
      the TypeScript test pins, to 1e-14 relative.  Every `inline` function
      of the header must be exercised by at least one pin, and each must have
      its named twin in bund.ts (`Twin of bundMath::<name>`) and the reverse.

  (b) THE WITNESS'S BUND IS THE PINS.  The `green_*` pins are
      `greenAmmoniaPEQ_baseCase`'s `tankFarm` bund: their INPUTS are read off
      the case -- the region's area, the wall height, the tanks' declared
      footprints, the rain depth and the rule's fraction from its layoutDict,
      the largest tank's V_R from its golden -- and their VALUES must equal
      the golden's own `layout bund:tankFarm` rows (gross is area x wall,
      displacedVolume, netVolume, requiredVolume) to 1e-9.

  (c) THE ENGINE CALLS THE HEADER.  `PlantLayout.cpp`'s `displacedBelow`
      returns the header's three displacement functions and carries none of
      their arithmetic, and the bund block takes its gross volume, its terms,
      its depth allowance and its required volume from the header -- a
      second copy of the arithmetic in the engine would pass (a) and (b)
      while the layout check drifted.

SABOTAGES, by hand, 2026-10-25 (each restored, the gate re-run to exit 0):
  S1  BundArithmetic.H displacedStanding 0.25 -> 0.26: (a) on every
      standing pin, (b) not (the witness's tanks are declared boxes).
  S2  the test's `lying_partial` pin moved in its 16th digit: SURVIVED, as
      it should -- a relative change of 4e-15 is inside the 1e-14 the arm
      claims; moved in its 12th digit (S2b): (a).
  S3  the test's `green_gross` input 7480 -> 7481 with its value moved to
      match: (a) silent (both sides agree), (b) fires on the input and on
      the golden's gross.
  S4  PlantLayout.cpp's box branch written back inline (its own lo / hi and
      `dx * dy * (hi - lo)`): (c), four findings.
  Every source sabotage was restored with `cp -p`, so the build stays fresh
  by check_build_fresh's clock.

WHAT THIS DOES NOT CHECK, said plainly:
  * the page's teaching beyond the engine -- the sloped floor, the
    freeboard, the useful capacity, the level and the scenarios -- which
    the EduTool's own test holds to closed forms and to mass conservation;
  * WHETHER A CAPACITY RULE IS RIGHT: the rule is the case's declaration,
    and the EduTool's 110 % / 25 % is a teaching example;
  * that the engine's layout check RUNS: `check_plant_layout` does that.
"""
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HDR = ROOT / "src" / "postProcessing" / "layout" / "BundArithmetic.H"
CPP = ROOT / "src" / "postProcessing" / "layout" / "PlantLayout.cpp"
TS = ROOT / "gui" / "src" / "ui" / "methods" / "bund.ts"
TS_TEST = ROOT / "gui" / "tests" / "bund.test.ts"
GREEN = ROOT / "tutorials" / "plant" / "greenAmmoniaPEQ_baseCase"

fails = []


def rel(a, b):
    return abs(a) if b == 0 else abs(a - b) / abs(b)


def header_functions():
    return re.findall(r"^inline scalar (\w+)\(", HDR.read_text(), re.M)


def read_pins():
    pins = []
    for line in TS_TEST.read_text().splitlines():
        m = re.match(r'\s*pin\("(\w+)", (.+), ([-0-9.eE+]+)\);\s*$', line)
        if m:
            pins.append((m.group(1), m.group(2), float(m.group(3))))
    return pins


# ---------------------------------------------------------------------------
#  (a) the twin
# ---------------------------------------------------------------------------

def arm_a(pins, funcs):
    if len(pins) < 12:
        fails.append("(a) found %d pin(...) lines in gui/tests/bund.test.ts, expected at "
                     "least 12 -- a twin check over nothing must not pass" % len(pins))
        return {}
    body = []
    for name, expr, _ in pins:
        cexpr = re.sub(r"\b(%s)\(" % "|".join(funcs), r"bundMath::\1(", expr)
        body.append('    std::printf("%s %%.17g\\n", (double)(%s));' % (name, cexpr))
    probe = ("#include \"postProcessing/layout/BundArithmetic.H\"\n#include <cstdio>\n"
             "using namespace Choupo;\nint main()\n{\n" + "\n".join(body) + "\n    return 0;\n}\n")
    cxx = shutil.which("g++") or shutil.which("clang++")
    if not cxx:
        fails.append("(a) no C++ compiler: the twin check cannot run -- a check that "
                     "cannot run must not pass")
        return {}
    with tempfile.TemporaryDirectory() as td:
        src, exe = Path(td) / "probe.cpp", Path(td) / "probe"
        src.write_text(probe)
        r = subprocess.run([cxx, "-std=c++17", "-O0", "-I", str(ROOT / "src"), str(src),
                            "-o", str(exe)], capture_output=True, text=True)
        if r.returncode != 0:
            fails.append("(a) the probe against BundArithmetic.H does not compile:\n"
                         + r.stderr[-2000:])
            return {}
        out = subprocess.run([str(exe)], capture_output=True, text=True).stdout
    got = {}
    for line in out.splitlines():
        k, v = line.split()
        got[k] = float(v)
    for name, expr, value in pins:
        c = got.get(name)
        if c is None or rel(c, value) > 1e-14 or (value == 0 and abs(c) > 1e-15):
            fails.append("(a) %s = %s: the C++ gives %r, the EduTool's test pins %r"
                         % (name, expr, c, value))
    used = {f for f in funcs for _, e, _ in pins if re.search(r"\b%s\(" % f, e)}
    for f in funcs:
        if f not in used:
            fails.append("(a) BundArithmetic.H's %s is exercised by no pin in "
                         "gui/tests/bund.test.ts" % f)
    ts = re.sub(r"\n\s*\*\s*", " ", TS.read_text())
    twins = set(re.findall(r"Twin of bundMath::(\w+)", ts))
    for f in funcs:
        if f not in twins or not re.search(r"export function %s\(" % f, ts):
            fails.append("(a) BundArithmetic.H's %s has no named twin in bund.ts" % f)
    for t in twins - set(funcs):
        fails.append("(a) bund.ts names a twin bundMath::%s the header does not define" % t)
    return got


# ---------------------------------------------------------------------------
#  (b) the witness
# ---------------------------------------------------------------------------

def num(s):
    return float(s)


def arm_b(pins, got):
    lay = re.sub(r"//[^\n]*", "", (GREEN / "system" / "layoutDict").read_text())
    m = re.search(r'name\s+"tankFarm";(.*?)\n    \}\n', lay, re.S)
    if not m:
        fails.append("(b) greenAmmoniaPEQ_baseCase's layoutDict has no bund `tankFarm`")
        return
    blk = m.group(1)
    rg = re.search(r"region\s*\{\s*xMin ([-0-9.]+) m; xMax ([-0-9.]+) m; yMin ([-0-9.]+) m;"
                   r" yMax ([-0-9.]+) m; \}", blk)
    wall = re.search(r"wall\s*\{\s*height ([0-9.]+) m;", blk)
    frac = re.search(r"terms\s*\(\s*\{\s*fraction ([0-9.]+); of largest;", blk)
    rain = re.search(r"name rain; depth ([0-9.]+) mm;", blk)
    items = re.findall(r'"(NH3Storage/tank\d)"', blk)
    if not (rg and wall and frac and rain and len(items) == 2):
        fails.append("(b) the tankFarm declaration no longer reads as region / wall / one"
                     " term of the largest / a rain depth / two tanks")
        return
    A = (num(rg.group(2)) - num(rg.group(1))) * (num(rg.group(4)) - num(rg.group(3)))
    h = num(wall.group(1))
    fps = []
    for it in items:
        f = re.search(r'item\s+"%s";.*?footprint\s*\{\s*length ([0-9.]+) m; width ([0-9.]+) m;'
                      r' height ([0-9.]+) m; \}' % re.escape(it), lay, re.S)
        if not f:
            fails.append("(b) %s declares no box footprint in the layoutDict" % it)
            return
        fps.append(tuple(f.group(i) for i in (1, 2, 3)))
    if fps[0] != fps[1]:
        fails.append("(b) the two tanks' footprints differ; the green_box pin assumes one")
    gold = (GREEN / "expected").read_text()
    def g(key):
        mm = re.search(r"^layout\s+bund:tankFarm\s+%s\s+(\S+)" % key, gold, re.M)
        return float(mm.group(1)) if mm else None
    vr = re.search(r"^equipment NH3Storage/tank1\s+values\.V_R\s+(\S+)", gold, re.M)
    want = {k: g(k) for k in ("area", "wallHeight", "displacedVolume", "netVolume",
                              "requiredVolume")}
    if None in want.values() or not vr:
        fails.append("(b) the witness's golden no longer pins %s or tank1's V_R"
                     % [k for k, v in want.items() if v is None])
        return
    P = {n: (e, v) for n, e, v in pins}
    def fmt(x):
        return ("%.10g" % x)
    expect_expr = {
        "green_box": "displacedBox(%s, %s, 0, %s, %s)" % (fps[0][0], fps[0][1], fps[0][2], fmt(h)),
        "green_gross": "grossVolume(%s, %s)" % (fmt(A), fmt(h)),
        "green_rain": "depthAllowance(%s, %s)" % (fmt(num(rain.group(1)) / 1000), fmt(A)),
    }
    for k, e in expect_expr.items():
        if k not in P or P[k][0] != e:
            fails.append("(b) pin %s reads %r; the case declares %r"
                         % (k, P.get(k, ("absent",))[0], e))
    for k in ("green_term", "green_required"):
        if k not in P or ("termVolume(%s, true, %s," % (frac.group(1), vr.group(1))) not in P[k][0]:
            fails.append("(b) pin %s does not take the rule's fraction %s of tank1's V_R %s"
                         % (k, frac.group(1), vr.group(1)))
    checks = [
        ("area", A, want["area"]),
        ("wallHeight", h, want["wallHeight"]),
        ("gross = area x wall", P.get("green_gross", (0, 0))[1], want["area"] * want["wallHeight"]),
        ("displacedVolume = 2 x green_box", 2 * P.get("green_box", (0, 0))[1], want["displacedVolume"]),
        ("netVolume", P.get("green_net", (0, 0))[1], want["netVolume"]),
        ("requiredVolume", P.get("green_required", (0, 0))[1], want["requiredVolume"]),
    ]
    for what, a, b in checks:
        if rel(a, b) > 1e-9:
            fails.append("(b) %s: the EduTool's pin/the case gives %.12g, the witness's "
                         "golden %.12g" % (what, a, b))
    return A, h


# ---------------------------------------------------------------------------
#  (c) the engine calls the header
# ---------------------------------------------------------------------------

def arm_c():
    s = re.sub(r"//[^\n]*", "", CPP.read_text())
    if '#include "postProcessing/layout/BundArithmetic.H"' not in s:
        fails.append("(c) PlantLayout.cpp does not include BundArithmetic.H")
    m = re.search(r"scalar displacedBelow\(const LayoutItem& i, scalar h\)\s*\{(.*?)\n\}", s, re.S)
    if not m:
        fails.append("(c) PlantLayout.cpp has no displacedBelow")
        return
    body = m.group(1)
    for f in ("displacedStanding", "displacedLying", "displacedBox"):
        if "bundMath::%s(" % f not in body:
            fails.append("(c) displacedBelow does not call bundMath::%s" % f)
    for bad in ("kPi", "acos", "sqrt", "hi - lo", "std::max", "std::min"):
        if bad in body:
            fails.append("(c) displacedBelow carries arithmetic of its own (`%s`): the "
                         "header is the one home" % bad)
    for f in ("grossVolume", "termVolume", "depthAllowance", "requiredVolume"):
        if "bundMath::%s(" % f not in s:
            fails.append("(c) PlantLayout.cpp's bund block does not call bundMath::%s" % f)


def main():
    funcs = header_functions()
    if len(funcs) < 7:
        fails.append("(a) BundArithmetic.H defines %d inline functions; expected 7" % len(funcs))
    pins = read_pins()
    got = arm_a(pins, funcs)
    wb = arm_b(pins, got)
    arm_c()
    if fails:
        print("check_bund_arithmetic: FAILED")
        for f in fails:
            print("  " + f)
        return 1
    print("check_bund_arithmetic: OK -- the C++ bund arithmetic (BundArithmetic.H) reproduces "
          "the %d examples the secondary-containment EduTool's test pins (1e-14), every one of "
          "its %d functions pinned and twinned in bund.ts; the green-ammonia witness's tankFarm "
          "bund (%.0f m2 x %.4g m, two declared tank footprints, its rule and rain) is the "
          "green_* pins and equals its golden's gross, displaced, net and required volumes "
          "(1e-9); PlantLayout.cpp calls the header and carries none of its arithmetic.  NOT "
          "CHECKED: the page's teaching beyond the engine (slope, freeboard, useful capacity, "
          "scenarios -- the EduTool's own test), whether a capacity rule is right, and that the "
          "layout check runs (check_plant_layout)."
          % (len(pins), len(funcs), wb[0] if wb else 0, wb[1] if wb else 0))
    return 0


if __name__ == "__main__":
    sys.exit(main())
