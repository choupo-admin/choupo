#!/usr/bin/env python3
"""Gate: the pressure-relief valve the sizing pass sizes (DEV.md 4c C62) is
the arithmetic the EduTool teaches, on numbers the case's own items supply.

    bin/curate/check_relief_valve.py

WHY THIS EXISTS.  The relief-sizing equations live in TWO implementations:
the C++ the `reliefValve` sizer calls (`src/postProcessing/sizing/
ReliefArithmetic.H`) and the TypeScript the "Designing for overpressure"
EduTool computes (`gui/src/ui/methods/overpressure.ts`, DEV.md 4c C61), whose
test holds them to API 520 Part I's own worked Examples 1, 2 and 5 as the open
`fluids` library reproduces them.  Two homes for one procedure drift the day
one is edited, unless something compares them -- so this gate does.

WHAT THIS CHECKS:

  (a) THE TWO IMPLEMENTATIONS AGREE, ON THE PUBLISHED EXAMPLES.  A probe is
      compiled against `ReliefArithmetic.H` alone (g++ -std=c++17
      -- no engine build touched) and must reproduce the NUMBERS
      `gui/tests/overpressure.test.ts` pins -- read from that file, never
      typed here -- for Example 1 (critical gas), Example 2 (subcritical) and
      Example 5 (liquid) to 1e-9, C(1.35) and F2(1.8, 0.7) to 1e-12, and
      1 psi to 1e-12.  Every constant the two share (0.03948, 17.9, 11.78, the
      water reference density, 21 000, 34 500, 0.82, 10 %, 3 psi, 21 %,
      101 325 Pa) is read from BOTH sources and must be equal.

  (b) THE CASE'S VALVES RECOMPUTE.  On `greenAmmoniaBasicDesign`, every
      `reliefValve` entry of its postDict publishes a `<unit>/psv` item, and
      for each: the set pressure is the protected item's own published
      `pressureDesign` (the item the basis names); every scenario's P1 is
      the set pressure plus 10 % or 3 psi (21 % for fire) plus 1 atm; every
      area is recomputed HERE from the scenario's published W, T1, Z, k, M
      (or rho) by the API 520 equations written a THIRD time in Python; the
      fire load is recomputed from the protected item's own D and H and the
      published level, Q = C F A^0.82, and W = Q / lambda x M; the governing
      area is the largest; NO API 526 letter or orifice area is published
      (the letter table is a no-grant standard's, not reproduced -- the
      commander's ruling; `check_source_licence` refuses the table itself),
      and the basis says the lettered orifice is not selected and why.
      No psv item carries a cost, and the run's TOTALS line neither moved to
      INCOMPLETE nor omits a priced item: it equals the sum of the priced
      items' totals.

  (c) THE REFUSALS AND THE SHEET, on a small fixture built here (the flash01
      drum with a sized vessel): the good fixture writes `design/flash01/psv`
      with a `relief {}` block and a `sizing {}` block every line of which is
      two tokens (the long-key fix), lists the valve under NOT COSTED and
      leaves the total complete; a declared coefficient announces nothing and
      an undeclared one is announced; and each of these refuses BY NAME: the
      relief entry declared BEFORE the item it protects, a scenario word that
      is named-but-not-built (`tubeRupture`, with its reason), a blocked
      outlet left unnamed on a two-outlet unit, a fire case whose relieving
      pressure is above the liquid's critical pressure, and a fire case on an
      item that declares no inventory.

SABOTAGES, by hand, 2026-10-11 (each restored, the gate re-run to exit 0):
  S1  api520Subcritical 17.9 -> 17.8 in the header: (a), Example 2 and the
      shared constant.
  S2  the TypeScript fire accumulation 0.21 -> 0.20: (a).
  S3  the TypeScript test's Example 1 pin moved in its 9th digit: (a).
  S4  the case declares a fire case on the Separator: (b) -- the valve is
      refused (supercritical) and the case publishes no Separator/psv.
  S5  the sizer gives the fire case the NON-fire accumulation (rebuilt): (b)
      on two valves and (c), P1 and A.
  S6  the costing pass prices the out-of-scope item (rebuilt): (b) and (c),
      INCOMPLETE and no NOT COSTED list.
  S7  the order refusal's first words changed (rebuilt): SURVIVED -- the arm
      reads the REMEDY ("AFTER the unit's own sizing entry"), which that
      sabotage left in place; S7b removed the remedy and (c) fired.  The arm
      is about the remedy on purpose: a refusal that names no remedy is the
      defect.

WHAT THIS DOES NOT CHECK, said plainly:
  * WHETHER API 520 IS RIGHT.  Neither the standard nor API 521 nor ASME VIII
    was read: every equation and constant reached the tree through the open
    `fluids` implementation and the DIERS fire document (the EduTool's
    record).  Agreement between three transcriptions of one secondary source
    is not a check of the primary.
  * WHETHER A SCENARIO IS CREDIBLE, or the governing one the right one.  The
    scenarios are the case's declaration.
  * THE FLUID PROPERTIES.  Z, k and the bubble point are the package's; this
    gate recomputes the ARITHMETIC on them, not them.
"""
import math
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
_CACHE = os.environ.get("CHOUPO_SUITE_OUTPUTS")
#  The engine finds its catalogue (the construction materials included)
#  through CHOUPO_HOME; a fixture copied to a temporary directory is not
#  under the tree, so the variable is set rather than inherited by luck.
ENV = dict(os.environ, CHOUPO_HOME=str(ROOT))
CASE = ROOT / "tutorials" / "plant" / "greenAmmoniaBasicDesign"
FIXTURE_SRC = ROOT / "tutorials" / "steady" / "flash" / "flash01_benzene_toluene"
HEADER = ROOT / "src" / "postProcessing" / "sizing" / "ReliefArithmetic.H"
TS = ROOT / "gui" / "src" / "ui" / "methods" / "overpressure.ts"
TS_TEST = ROOT / "gui" / "tests" / "overpressure.test.ts"

fails = []


def rel(a, b):
    return abs(a - b) / abs(b) if b != 0 else abs(a)


# ---------------------------------------------------------------------------
#  The API 520 / 521 arithmetic, a THIRD time, for arm (b).  Same equations;
#  the point is that the published numbers recompute from the published
#  inputs, not that this copy is independent of the source.
# ---------------------------------------------------------------------------
PATM = 101325.0
PSI = 0.45359237 * 9.80665 / (0.0254 * 0.0254)
RHO_W = 999.0107539518483

def p1_abs(set_g_pa, fire):
    if fire:
        return set_g_pa * 1.21 + PATM
    return max(set_g_pa * 1.10, set_g_pa + 3 * PSI) + PATM


def gas_area(W, T, Z, M, k, P1_kpa, P2_kpa, Kd=0.975, Kb=1.0, Kc=1.0):
    rc = (2 / (k + 1)) ** (k / (k - 1))
    r = P2_kpa / P1_kpa
    if r <= rc:
        C = 0.03948 * math.sqrt(k * (2 / (k + 1)) ** ((k + 1) / (k - 1)))
        return W / (C * Kd * P1_kpa * Kb * Kc) * math.sqrt(T * Z / M)
    F2 = math.sqrt(k / (k - 1) * r ** (2 / k) * (1 - r ** ((k - 1) / k)) / (1 - r))
    return 17.9 * W / (F2 * Kd * Kc) * math.sqrt(T * Z / (M * P1_kpa * (P1_kpa - P2_kpa)))


def liquid_area(Q_lmin, G, dP_kpa, Kd=0.65, Kw=1.0, Kc=1.0, Kv=1.0):
    return 11.78 * Q_lmin / (Kd * Kw * Kc * Kv) * math.sqrt(G / dP_kpa)


def fire_c_si(adequate):
    c = 21000.0 if adequate else 34500.0
    return c * (1055.05585262 / 3600) * (1 / 0.3048 ** 2) ** 0.82


# ---------------------------------------------------------------------------
#  (a) the two implementations
# ---------------------------------------------------------------------------
PROBE = r'''
#include "postProcessing/sizing/ReliefArithmetic.H"
#include <cstdio>
using namespace Choupo::reliefMath;
int main()
{
    auto e1 = gasArea(24270, 348, 0.90, 51, 1.11, 670, 101.325, 0.975, 1, 1);
    auto e2 = gasArea(24270, 348, 0.90, 51, 1.11, 670, 532, 0.975, 1, 1);
    double e5 = liquidArea(6814, 0.9 * 999 / waterRefDensity,
                           1.1 * 1724 - 0.2 * 1724, 0.65, 0.97, 1, 1);
    std::printf("ex1 %d %.17g\n", e1.critical ? 1 : 0, e1.A_mm2);
    std::printf("ex2 %d %.17g\n", e2.critical ? 1 : 0, e2.A_mm2);
    std::printf("ex5 %.17g\n", e5);
    std::printf("C135 %.17g\n", criticalCoefficient(1.35));
    std::printf("F2 %.17g\n", subcriticalCoefficient(1.8, 0.7));
    std::printf("psi %.17g\n", psiPa);
    std::printf("fireSI %.17g %.17g\n", fireCoefficientSI(true), fireCoefficientSI(false));
    std::printf("acc %.17g %.17g\n", maxAccumulatedGauge(10e5, false), maxAccumulatedGauge(1e5, false));
    std::printf("accfire %.17g\n", maxAccumulatedGauge(10e5, true));
    std::printf("C0 %.17g\nSUB %.17g\nLIQ %.17g\nRHOW %.17g\n", api520C0, api520Subcritical, api520Liquid, waterRefDensity);
    std::printf("FA %.17g\nFI %.17g\nFX %.17g\n", fireCAdequate, fireCInadequate, fireExponent);
    std::printf("AS %.17g\nASP %.17g\nAF %.17g\nPATM %.17g\n", accumulationSingle, accumulationSingleMinPsi, accumulationFire, pAtmPa);
    return 0;
}
'''


def arm_a():
    ts = TS.read_text()
    tt = TS_TEST.read_text()
    with tempfile.TemporaryDirectory() as td:
        src = Path(td) / "probe.cpp"
        exe = Path(td) / "probe"
        src.write_text(PROBE)
        cxx = shutil.which("g++") or shutil.which("clang++")
        if not cxx:
            fails.append("(a) no C++ compiler: the twin check cannot run -- a check that "
                         "cannot run must not pass")
            return {}
        r = subprocess.run([cxx, "-std=c++17", "-O0", "-I", str(ROOT / "src"),
                            str(src), "-o", str(exe)], capture_output=True, text=True)
        if r.returncode != 0:
            fails.append("(a) the probe against ReliefArithmetic.H does not compile:\n"
                         + r.stderr[-2000:])
            return {}
        out = subprocess.run([str(exe)], capture_output=True, text=True).stdout
    v = {}
    for line in out.splitlines():
        parts = line.split()
        v[parts[0]] = parts[1:]

    def ts_pin(pattern, what):
        m = re.search(pattern, tt, re.S)
        if not m:
            fails.append("(a) cannot find %s in gui/tests/overpressure.test.ts" % what)
            return None
        return float(m.group(1))

    pins = {
        "ex1": ts_pin(r'Example 1, critical gas.*?rel\(s\.A_mm2, ([0-9.eE+-]+)\)', "Example 1"),
        "ex2": ts_pin(r'Example 2,.*?rel\(s\.A_mm2, ([0-9.eE+-]+)\)', "Example 2"),
        "ex5": ts_pin(r'Example 5, liquid.*?rel\(A, ([0-9.eE+-]+)\)', "Example 5"),
        "C135": ts_pin(r'rel\(criticalCoefficient\(1\.35\), ([0-9.eE+-]+)\)', "C(1.35)"),
        "F2": ts_pin(r'rel\(subcriticalCoefficient\(1\.8, 0\.7\), ([0-9.eE+-]+)\)', "F2"),
        "psi": ts_pin(r'rel\(PSI_PA, ([0-9.eE+-]+)\)', "PSI_PA"),
    }
    got = {"ex1": float(v["ex1"][1]), "ex2": float(v["ex2"][1]),
           "ex5": float(v["ex5"][0]), "C135": float(v["C135"][0]),
           "F2": float(v["F2"][0]), "psi": float(v["psi"][0])}
    tol = {"ex1": 1e-9, "ex2": 1e-9, "ex5": 1e-9, "C135": 1e-12, "F2": 1e-12, "psi": 1e-12}
    for k, p in pins.items():
        if p is not None and rel(got[k], p) > tol[k]:
            fails.append("(a) %s: the C++ gives %.12g, the EduTool's test pins %.12g "
                         "(rel %.2e > %g)" % (k, got[k], p, rel(got[k], p), tol[k]))
    if v["ex1"][0] != "1" or v["ex2"][0] != "0":
        fails.append("(a) the flow regime of Example 1 / 2 is not critical / subcritical")

    def ts_const(name):
        m = re.search(r'export const %s = ([0-9.eE+-]+);' % name, ts)
        return float(m.group(1)) if m else None

    shared = [("C0", "API520_C0"), ("SUB", "API520_SUBCRITICAL"),
              ("LIQ", "API520_LIQUID"), ("RHOW", "WATER_REF_DENSITY"),
              ("FX", "FIRE_EXPONENT"), ("PATM", "P_ATM_PA")]
    for cpp, tsn in shared:
        t = ts_const(tsn)
        c = float(v[cpp][0])
        if t is None:
            fails.append("(a) %s is not a literal in overpressure.ts any more" % tsn)
        elif c != t:
            fails.append("(a) %s: C++ %.17g, TypeScript %.17g" % (tsn, c, t))
    m = re.search(r'FIRE_C_USC = \{ adequate: ([0-9.]+), inadequate: ([0-9.]+) \}', ts)
    if not m or float(v["FA"][0]) != float(m.group(1)) or float(v["FI"][0]) != float(m.group(2)):
        fails.append("(a) the fire coefficients differ between the C++ and FIRE_C_USC")
    m1 = re.search(r'single: \{ frac: ([0-9.]+), minPsi: ([0-9.]+) \}', ts)
    m2 = re.search(r'fire: \{ frac: ([0-9.]+), minPsi: ([0-9.]+) \}', ts)
    if not (m1 and m2) or float(v["AS"][0]) != float(m1.group(1)) \
            or float(v["ASP"][0]) != float(m1.group(2)) \
            or float(v["AF"][0]) != float(m2.group(1)) or float(m2.group(2)) != 0.0:
        fails.append("(a) the accumulation allowances differ between the C++ and ACCUMULATION")
    if rel(float(v["acc"][0]), 11e5) > 1e-12 or rel(float(v["acc"][1]), 1e5 + 3 * PSI) > 1e-12 \
            or rel(float(v["accfire"][0]), 12.1e5) > 1e-12:
        fails.append("(a) the pressure ladder does not give 11 bar, 1 bar + 3 psi and 12.1 bar")
    if rel(float(v["fireSI"][0]), fire_c_si(True)) > 1e-12 \
            or round(float(v["fireSI"][0]) / 1000, 1) != 43.2:
        fails.append("(a) the fire coefficient in SI is not 21 000 Btu/h/ft2^0.82 converted (43.2)")
    return got


# ---------------------------------------------------------------------------
#  (b) the case
# ---------------------------------------------------------------------------
def stdout_of(case: Path):
    rel_ = case.relative_to(ROOT).as_posix()
    if _CACHE:
        f = Path(_CACHE) / (rel_.replace("/", "__") + ".out")
        try:
            return f.read_text(errors="replace")
        except OSError:
            pass
    proc = subprocess.run([str(ROOT / "choupoSolve"), str(case)],
                          capture_output=True, text=True, env=ENV)
    return proc.stdout if proc.returncode == 0 else None


def equipment(out):
    items, inblk = {}, False
    for line in out.splitlines():
        if '"equipment": [' in line:
            inblk = True
            continue
        if inblk and re.match(r'^  \]', line):
            inblk = False
        if not inblk:
            continue
        m = re.search(r'"item": "([^"]*)"', line)
        if not m:
            continue
        it = {"line": line, "values": {}, "inventory": {}}
        mv = re.search(r'"values": \{([^}]*)\}', line)
        if mv:
            for k, x in re.findall(r'"([A-Za-z_][A-Za-z0-9_]*)": *(-?[0-9][0-9.eE+-]*)', mv.group(1)):
                it["values"][k] = float(x)
        mi = re.search(r'"inventory": \{([^}]*)\}', line)
        if mi:
            for k, x in re.findall(r'"([A-Za-z_][A-Za-z0-9_.]*)": *(-?[0-9][0-9.eE+-]*)', mi.group(1)):
                it["inventory"][k] = float(x)
        mb = re.search(r'"basis": "([^"]*)"', line)
        it["basis"] = mb.group(1) if mb else ""
        it["unit"] = re.search(r'"unit": "([^"]*)"', line).group(1)
        it["cost"] = '"cost":' in line
        mc = re.search(r'"cost": \{.*?"totalModule": (-?[0-9][0-9.eE+-]*)', line)
        it["C_TM"] = float(mc.group(1)) if mc else None
        items[m.group(1)] = it
    return items


def check_valve(item_id, it, items, where):
    v = it["values"]
    if it["cost"]:
        fails.append("%s %s carries a cost -- a relief valve is NOT costed" % (where, item_id))
    m = re.search(r'read from (\S+), gauge', it["basis"])
    if not m or m.group(1) not in items:
        fails.append("%s %s: the basis names no protected item this run sized" % (where, item_id))
        return
    prot = items[m.group(1)]
    if prot["unit"] != it["unit"]:
        fails.append("%s %s protects an item of ANOTHER unit (%s)" % (where, item_id, m.group(1)))
    if "pressureDesign" not in prot["values"] or \
            rel(v["P_set_gauge"], prot["values"]["pressureDesign"]) > 1e-12:
        fails.append("%s %s: P_set_gauge %g is not the protected item's pressureDesign"
                     % (where, item_id, v.get("P_set_gauge", float("nan"))))
        return
    setg = v["P_set_gauge"] * 1e5
    P2 = v["P_back_gauge"] * 1e5 + PATM
    prefixes = sorted({k[:-len("_A")] for k in v if k.endswith("_A") and k != "A_relief"})
    if not prefixes:
        fails.append("%s %s publishes no scenario" % (where, item_id))
        return
    amax = -1.0
    for p in prefixes:
        fire = p == "fire"
        P1 = p1_abs(setg, fire)
        if rel(v[p + "_P1_abs"] * 1e5, P1) > 1e-9:
            fails.append("%s %s %s: P1 %.9g bar abs, the ladder gives %.9g"
                         % (where, item_id, p, v[p + "_P1_abs"], P1 / 1e5))
        if fire:
            D, H = prot["values"].get("D"), prot["values"].get("H")
            lev = v["fire_level"]
            fracs = [x for k, x in prot["inventory"].items() if k.endswith(".fraction")]
            if not any(abs(f - lev) < 1e-12 for f in fracs):
                fails.append("%s %s: fire_level %g is none of the protected item's declared "
                             "inventory fractions %s" % (where, item_id, lev, fracs))
            Awet = math.pi * D * lev * H + math.pi * D * D / 4
            if rel(v["fire_Awet"], Awet) > 1e-9:
                fails.append("%s %s: fire_Awet %.9g, D/H/level give %.9g" % (where, item_id, v["fire_Awet"], Awet))
            Q = fire_c_si(True) * v["fire_F"] * Awet ** 0.82    # every shipped fire case: adequate
            if rel(v["fire_Q"] * 1e3, Q) > 1e-9:
                fails.append("%s %s: fire_Q %.9g kW, C F A^0.82 gives %.9g" % (where, item_id, v["fire_Q"], Q / 1e3))
            W = Q / v["fire_lambda"] * 1e-3 * v["fire_M"] * 3600
            if rel(v["fire_W"], W) > 1e-9:
                fails.append("%s %s: fire_W %.9g kg/h, Q/lambda x M gives %.9g" % (where, item_id, v["fire_W"], W))
        if (p + "_Z") in v:
            A = gas_area(v[p + "_W"], v[p + "_T1"], v[p + "_Z"], v[p + "_M"], v[p + "_k"],
                         P1 / 1e3, P2 / 1e3)
        else:
            rho = v[p + "_rho"]
            Q_lmin = v[p + "_W"] / rho * 1000 / 60
            if rel(v[p + "_Q"], Q_lmin) > 1e-9:
                fails.append("%s %s %s: Q %.9g L/min, W/rho gives %.9g" % (where, item_id, p, v[p + "_Q"], Q_lmin))
            A = liquid_area(Q_lmin, rho / RHO_W, (P1 - P2) / 1e3)
        if rel(v[p + "_A"], A) > 1e-9:
            fails.append("%s %s %s: A %.9g mm2, recomputed %.9g" % (where, item_id, p, v[p + "_A"], A))
        amax = max(amax, v[p + "_A"])
    if rel(v["A_relief"], amax) > 1e-12:
        fails.append("%s %s: A_relief %.9g is not the largest scenario area %.9g"
                     % (where, item_id, v["A_relief"], amax))
    if "A_orifice" in v or "orifice is NOT selected" not in it["basis"]:
        fails.append("%s %s: an orifice area is published, or the basis does not say the "
                     "lettered orifice is NOT selected" % (where, item_id))


def arm_b():
    pd = (CASE / "system" / "postDict").read_text()
    pd_nc = re.sub(r'//[^\n]*', '', pd)
    declared = re.findall(r'unitName\s+(\w+);\s*type\s+reliefValve;', pd_nc)
    if len(declared) < 1:
        fails.append("(b) %s declares no reliefValve entry" % CASE.name)
        return 0
    out = stdout_of(CASE)
    if out is None:
        fails.append("(b) %s does not run to exit 0" % CASE.name)
        return 0
    items = equipment(out)
    for u in declared:
        iid = u + "/psv"
        if iid not in items:
            fails.append("(b) %s declares a relief valve on %s and publishes no %s"
                         % (CASE.name, u, iid))
            continue
        check_valve(iid, items[iid], items, "(b)")
    tot = re.search(r'TOTALS \(EUR\)( -- INCOMPLETE)?\s+[0-9]+\s+[0-9]+\s+([0-9]+)', out)
    if not tot:
        fails.append("(b) no TOTALS line in the costing table")
    else:
        if tot.group(1):
            fails.append("(b) the capital total reads INCOMPLETE")
        s = sum(it["C_TM"] for it in items.values() if it["C_TM"] is not None)
        if abs(s - float(tot.group(2))) > 0.5 * len(items):
            fails.append("(b) TOTALS C_TM %s is not the sum of the priced items' totals %.0f"
                         % (tot.group(2), s))
    if "NOT COSTED (outside the costing scope" not in out:
        fails.append("(b) the costing table does not list the relief valves as NOT COSTED")
    return len(declared)


# ---------------------------------------------------------------------------
#  (c) the fixture
# ---------------------------------------------------------------------------
VESSEL = '''        { unitName flash01; type vessel; material carbonSteel;
          designRules { residenceTime 60; flowKey F_beta; flowUnit kmol/s; L_over_D 3;
                        pressureDesign %(pd)s; corrosionAllow 0.003; jointEfficiency 1.0; }
          %(inv)s }
'''
INV = 'inventory { held ( { stream liquid; fraction 0.5; } { stream vapor; fraction 0.5; } ); }'
PSV = '''        { unitName flash01; type reliefValve; material carbonSteel;
          designRules { %(extra)s scenarios ( %(scen)s ); } }
'''
GOOD_SCEN = ('{ scenario blockedOutlet; outlet vapor; } { scenario blockedOutlet; outlet liquid; } '
             '{ scenario fire; environmentFactor 1.0; drainage adequate; }')
COSTING = '''costing { method Turton; year 2026; cepci 820; cepci2001 397; usdToEur 0.92; }
'''


def fixture(td, name, body):
    d = Path(td) / name
    shutil.copytree(FIXTURE_SRC, d)
    for x in ("design", "converged", "reports", "expected"):
        p = d / x
        if p.is_dir():
            shutil.rmtree(p)
        elif p.exists():
            p.unlink()
    (d / "system" / "postDict").write_text("sizing\n{\n    units\n    (\n" + body
                                           + "    );\n}\n" + COSTING)
    r = subprocess.run([str(ROOT / "choupoSolve"), "."], capture_output=True, text=True,
                       cwd=str(d), env=ENV)
    return d, r.stdout + r.stderr, r.returncode


def arm_c():
    n = 0
    with tempfile.TemporaryDirectory() as td:
        vessel = VESSEL % {"pd": "5", "inv": INV}
        d, out, rc = fixture(td, "good", vessel + PSV % {"extra": "", "scen": GOOD_SCEN})
        n += 1
        if rc != 0:
            fails.append("(c) the good fixture does not run to exit 0:\n" + out[-1500:])
            return n
        sheet = d / "design" / "flash01" / "psv"
        if not sheet.is_file():
            fails.append("(c) the good fixture wrote no design/flash01/psv")
        else:
            t = sheet.read_text()
            if not re.search(r'^relief\s*\{', t, re.M) or not re.search(r'^\s+governing\s+\w+;', t, re.M):
                fails.append("(c) the psv sheet carries no relief {} block naming the governing scenario")
            if re.search(r'^\s+orifice\s+\w+;', t, re.M) or "orifice is NOT selected" not in t:
                fails.append("(c) the psv sheet names an orifice letter, or does not say the "
                             "lettered orifice is NOT selected")
            body = re.search(r'^sizing\s*\{(.*?)^\}', t, re.M | re.S)
            for line in (body.group(1).splitlines() if body else []):
                if line.strip() and not re.match(r'^\s+\S+\s+\S', line):
                    fails.append("(c) a sheet sizing line is not key-space-value: %r" % line)
            if re.search(r'^cost\s*\{', t, re.M):
                fails.append("(c) the psv sheet carries a cost block")
        items = equipment(out)
        if "flash01/psv" in items:
            check_valve("flash01/psv", items["flash01/psv"], items, "(c)")
        else:
            fails.append("(c) the good fixture publishes no flash01/psv item")
        if "TOTALS (EUR) -- INCOMPLETE" in out or "flash01/psv  --" not in out:
            fails.append("(c) the fixture's total is INCOMPLETE, or the valve is not listed NOT COSTED")
        if re.search(r'NOT DECLARED[^\n]*flash01/psv', out):
            fails.append("(c) the valve is listed among items with no declared inventory")
        if "[assumed] reliefValve 'flash01': KdVapour" not in out:
            fails.append("(c) an undeclared KdVapour is not announced")

        checks = [
            ("declared", vessel + PSV % {"extra": "KdVapour 0.975; KdLiquid 0.65; Kb 1; Kc 1; Kw 1; Kv 1; backPressure 0 bar;",
                                         "scen": GOOD_SCEN},
             None),
            ("order", PSV % {"extra": "", "scen": GOOD_SCEN} + vessel, "AFTER the unit's own sizing entry"),
            ("tubeRupture", vessel + PSV % {"extra": "", "scen": "{ scenario tubeRupture; }"},
             "unverified"),
            ("unnamedOutlet", vessel + PSV % {"extra": "", "scen": "{ scenario blockedOutlet; }"},
             "name the one that closes"),
            ("supercriticalFire", VESSEL % {"pd": "60", "inv": INV}
             + PSV % {"extra": "", "scen": "{ scenario fire; environmentFactor 1.0; drainage adequate; }"},
             "critical pressure"),
            ("noInventory", VESSEL % {"pd": "5", "inv": ""}
             + PSV % {"extra": "", "scen": "{ scenario fire; environmentFactor 1.0; drainage adequate; }"},
             "inventory"),
        ]
        for name, body, must in checks:
            d, out, rc = fixture(td, name, body)
            n += 1
            if must is None:
                if re.search(r"\[assumed\] reliefValve 'flash01'", out):
                    fails.append("(c) a fully declared relief entry still announces an assumption")
                if "flash01/psv" not in equipment(out):
                    fails.append("(c) the declared fixture sized no valve")
                continue
            failed = re.search(r'flash01\s+FAILED: ReliefValve[^\n]*', out)
            if not failed or must not in out[out.find("FAILED: ReliefValve"):][:3000]:
                fails.append("(c) %s: the relief entry is not refused naming %r\n%s"
                             % (name, must, failed.group(0) if failed else out[-800:]))
            if "flash01/psv" in equipment(out):
                fails.append("(c) %s: a refused valve still published an item" % name)
    return n


def main():
    arm_a()
    nb = arm_b()
    nc = arm_c()
    if fails:
        print("check_relief_valve: FAILED")
        for f in fails:
            print("  " + f)
        return 1
    print("check_relief_valve: OK -- the C++ relief arithmetic (ReliefArithmetic.H) "
          "reproduces the numbers the overpressure EduTool's test pins for API 520 "
          "Examples 1, 2 and 5 (1e-9), C(1.35), F2 and 1 psi (1e-12), and shares "
          "every constant with overpressure.ts; %d relief valves of %s recompute "
          "(set = the protected item's pressureDesign, P1 from the 10 %%/3 psi and "
          "21 %% ladder, every scenario's area from its published W, T, Z, k, M or "
          "rho, the fire load from the protected item's D, H and inventory level, "
          "the governing area the largest, no API 526 letter selected and the "
          "basis saying why), none is costed and the capital total stays complete; %d fixture "
          "runs: the sheet's relief {} block, a declared coefficient silent and an "
          "undeclared one announced, and 5 refusals by name (order, tubeRupture, "
          "an unnamed outlet, a supercritical fire case, a fire case with no "
          "inventory).  NOT CHECKED: API 520/521 and ASME VIII themselves (none "
          "was read), whether a scenario is credible, and the fluid properties "
          "(the package's)." % (nb, CASE.name, nc))
    return 0


if __name__ == "__main__":
    sys.exit(main())
