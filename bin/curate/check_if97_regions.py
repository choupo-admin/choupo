#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""Gate: the IAPWS-IF97 kernel is held to the verification tables PRINTED in
its source paper, region by region, and its region boundaries to the paper's
own permitted inconsistencies.

    bin/curate/check_if97_regions.py [--source PATH/TO/IF97.cpp]

THE SOURCE.  W. Wagner et al., "The IAPWS Industrial Formulation 1997 for the
Thermodynamic Properties of Water and Steam", J. Eng. Gas Turbines Power 122
(2000) 150-182.  Its appendix prints, for computer-program verification:
Table A3 (region 1), Table A6 (region 2), Table A10 (region 3, at (T, rho)),
Table A12 (psat), Table A29 (Tsat), and the B23 point (Table A1, footnote).
Every value below was READ from those tables (page images; the PDF carries
them as scans, not text) and is typed here exactly as printed, 9 significant
digits.  Section 4.3 and Table 13 give the permitted inconsistencies at the
single-phase region boundaries (the "Prague values"): dv 0.05 %, dh 0.2
kJ/kg, dcp 1 %, ds 0.2 J/(kg K), dg 0.2 kJ/kg, dw 1 % (w: "not included in
the Prague values", the paper's own requirement).

WHAT IT CHECKS (arms):
  (a) the KERNEL against the printed tables: a probe compiled against
      src/thermo/iapws/IF97.cpp (or --source) evaluates regions 1, 2, 3, 4
      and B23 at every printed verification point, and each computed value
      must agree with the printed one to HALF A UNIT IN THE LAST PRINTED
      DIGIT (printed as 0.ddddddddd x 10^e, the tolerance is 0.5 x
      10^(e-9)) -- the printed digits, no more, no less.  The probe also
      asks IF97::verify() for its own verdict (< 1e-8).
  (b) the BACKWARD density: from each Table A10 state's printed pressure,
      rho3(p, T) returns the printed density and pT_region routes to 3 (the
      density tolerance is the printed pressure's half-unit propagated
      through (dp/drho)_T, plus 1e-12).
  (c) the REGION-5 REFUSAL fires BY NAME, in the kernel (props(10 MPa,
      1200 K)) and through the engine (choupoProps on a one-point case).
  (d) CONTINUITY across 1/3 (T = 623.15 K, psat(623.15) <= p <= 100 MPa,
      region 1 against region 3's liquid branch) and 2/3 (p = pB23(T),
      623.15 <= T <= 863.15 K, region 2 against region 3's vapour branch),
      50 points each: every inconsistency within the Prague value; the
      maxima must also stay within the paper's own Table 13 maxima (+ half
      a unit in their last printed digit) -- measured, they reproduce them.
  (e) the ENGINE reaches region 3: choupoProps evaluates a (rho, T) point at
      a Table A10 state and a (p, T) point that routes to region 3, and the
      published diagnostics reproduce the table to 1e-8 (the result JSON
      carries 12 significant figures).

WHAT IT DOES NOT CHECK.  That IF97 is right about water (its own stated
uncertainty against IAPWS-95: up to ~3 % in v and -53 % in cp in the
immediate critical region, the paper's Figs. 14-16); region 5 (refused);
the region-3 backward equations of the 2003 supplementary release (not
used -- the density is iterated on Eq. 25 itself); metastable states.  And
a coefficient digit too far down to move any printed 9-digit value: by hand,
2026-11-04, changing the 5th or the 9th significant digit of region-3 n_20
fails arms (a), (b) and (d); changing its 14th digit passes -- the printed
table cannot resolve it, and nothing in the tree can.

SABOTAGE (by hand, on a COPY, no rebuild): `--source <copy of IF97.cpp>`
compiles the probe against the copy, so the gate can be fired without
touching the tree.
"""
import json
import math
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PROPS = ROOT / "choupoProps"

# --- The printed tables (Wagner et al. 2000, appendix) ---------------------
# Region 1, Table A3: (T [K], p [MPa]) -> v, h, u, s, cp, w
A3 = [
    ((300.0, 3.0),  ["0.100215168e-2", "0.115331273e3", "0.112324818e3",
                     "0.392294792",    "0.417301218e1", "0.150773921e4"]),
    ((300.0, 80.0), ["0.971180894e-3", "0.184142828e3", "0.106448356e3",
                     "0.368563852",    "0.401008987e1", "0.163469054e4"]),
    ((500.0, 3.0),  ["0.120241800e-2", "0.975542239e3", "0.971934985e3",
                     "0.258041912e1",  "0.465580682e1", "0.124071337e4"]),
]
# Region 2, Table A6
A6 = [
    ((300.0, 0.0035), ["0.394913866e2",  "0.254991145e4", "0.241169160e4",
                       "0.852238967e1",  "0.191300162e1", "0.427920172e3"]),
    ((700.0, 0.0035), ["0.923015898e2",  "0.333568375e4", "0.301262819e4",
                       "0.101749996e2",  "0.208141274e1", "0.644289068e3"]),
    ((700.0, 30.0),   ["0.542946619e-2", "0.263149474e4", "0.246861076e4",
                       "0.517540298e1",  "0.103505092e2", "0.480386523e3"]),
]
# Region 3, Table A10: (T [K], rho [kg/m3]) -> p [MPa], h, u, s, cp, w
A10 = [
    ((650.0, 500.0), ["0.255837018e2", "0.186343019e4", "0.181226279e4",
                      "0.405427273e1", "0.138935717e2", "0.502005554e3"]),
    ((650.0, 200.0), ["0.222930643e2", "0.237512401e4", "0.226365868e4",
                      "0.485438792e1", "0.446579342e2", "0.383444594e3"]),
    ((750.0, 500.0), ["0.783095639e2", "0.225868845e4", "0.210206932e4",
                      "0.446971906e1", "0.634165359e1", "0.760696041e3"]),
]
A12 = [(300.0, "0.353658941e-2"), (500.0, "0.263889776e1"),
       (600.0, "0.123443146e2")]                      # psat [MPa]
A29 = [(0.1, "0.372755919e3"), (1.0, "0.453035632e3"),
       (10.0, "0.584149488e3")]                       # Tsat [K]
B23 = ("0.623150000e3", "0.165291643e2")             # T [K], p [MPa]
PRAGUE = {"dv_pct": 0.05, "dh": 0.2, "dcp_pct": 1.0, "ds_J": 0.2,
          "dg": 0.2, "dw_pct": 1.0}
# The paper's Table 13: achieved maxima (absolute values) per boundary.
PAPER_MAX = {"13": {"dv_pct": 0.004, "dh": 0.031, "dcp_pct": 0.195,
                    "ds_J": 0.042, "dg": 0.005, "dw_pct": 0.299},
             "23": {"dv_pct": 0.018, "dh": 0.134, "dcp_pct": 0.353,
                    "ds_J": 0.177, "dg": 0.005, "dw_pct": 0.403}}

PROBE = r'''
#include "IF97.H"
#include <cstdio>
#include <stdexcept>
using namespace Choupo::IF97;
static void st(const char* tag, const Props& r)
{
    std::printf("%s v %.17g h %.17g u %.17g s %.17g cp %.17g w %.17g p %.17g rho %.17g region %d\n",
                tag, r.v, r.h, r.u, r.s, r.cp, r.w, r.p, r.rho, r.region);
}
int main()
{
    std::printf("verify %.17g\n", verify());
    const double r1[3][2] = {{300,3},{300,80},{500,3}};
    for (int i = 0; i < 3; ++i) { char t[16]; std::snprintf(t, 16, "A3_%d", i);
        st(t, region1(r1[i][1]*1e6, r1[i][0]));
        std::printf("route A3_%d %d\n", i, pT_region(r1[i][1]*1e6, r1[i][0])); }
    const double r2[3][2] = {{300,0.0035},{700,0.0035},{700,30}};
    for (int i = 0; i < 3; ++i) { char t[16]; std::snprintf(t, 16, "A6_%d", i);
        st(t, region2(r2[i][1]*1e6, r2[i][0]));
        std::printf("route A6_%d %d\n", i, pT_region(r2[i][1]*1e6, r2[i][0])); }
    const double r3[3][3] = {{650,500,25.5837018},{650,200,22.2930643},{750,500,78.3095639}};
    for (int i = 0; i < 3; ++i) { char t[16]; std::snprintf(t, 16, "A10_%d", i);
        st(t, region3(r3[i][1], r3[i][0]));
        const double h = 1e-6 * r3[i][1];
        const double dpdrho = (region3(r3[i][1] + h, r3[i][0]).p
                             - region3(r3[i][1] - h, r3[i][0]).p) / (2 * h);
        std::printf("back A10_%d %.17g %d %.17g\n", i, rho3(r3[i][2]*1e6, r3[i][0]),
                    pT_region(r3[i][2]*1e6, r3[i][0]), dpdrho); }
    const double Ts[3] = {300, 500, 600};
    for (int i = 0; i < 3; ++i) std::printf("psat A12_%d %.17g\n", i, psat(Ts[i]) / 1e6);
    const double ps[3] = {0.1, 1, 10};
    for (int i = 0; i < 3; ++i) std::printf("tsat A29_%d %.17g\n", i, Tsat(ps[i]*1e6));
    std::printf("b23 p %.17g T %.17g\n", pB23(623.15) / 1e6, TB23(16.5291643e6));
    try { props(10e6, 1200.0); std::printf("r5 NOREFUSAL\n"); }
    catch (const std::exception& e) { std::printf("r5 %s\n", e.what()); }
    // continuity 1/3: T = 623.15 K, psat(623.15) .. 100 MPa
    const double p0 = psat(623.15);
    for (int k = 0; k < 50; ++k)
    {
        const double p = p0 + k * (100e6 - p0) / 49.0, T = 623.15;
        const Props a = region1(p, T);
        const Props b = region3(rho3(p, T, Root::Liquid), T);
        std::printf("c13 %.17g %.17g %.17g %.17g %.17g %.17g %.17g\n", p,
            100*(a.v-b.v)/a.v, a.h-b.h, 100*(a.cp-b.cp)/a.cp, 1e3*(a.s-b.s),
            (a.h-T*a.s)-(b.h-T*b.s), 100*(a.w-b.w)/a.w);
    }
    for (int k = 0; k < 50; ++k)
    {
        const double T = 623.15 + k * (863.15 - 623.15) / 49.0, p = pB23(T);
        const Props a = region2(p, T);
        const Props b = region3(rho3(p, T, Root::Vapour), T);
        std::printf("c23 %.17g %.17g %.17g %.17g %.17g %.17g %.17g\n", T,
            100*(a.v-b.v)/a.v, a.h-b.h, 100*(a.cp-b.cp)/a.cp, 1e3*(a.s-b.s),
            (a.h-T*a.s)-(b.h-T*b.s), 100*(a.w-b.w)/a.w);
    }
    return 0;
}
'''

fails = []


def fail(msg):
    fails.append(msg)
    print("  FAIL " + msg)


def halfUnit(printed):
    """Half a unit in the last printed digit of `0.ddddddddd e x`."""
    m = re.fullmatch(r"(-?)0\.(\d+)(?:e([+-]?\d+))?", printed)
    if not m:
        raise ValueError(printed)
    nd, ex = len(m.group(2)), int(m.group(3) or 0)
    return 0.5 * 10.0 ** (ex - nd)


def held(label, computed, printed):
    tol = halfUnit(printed)
    d = abs(computed - float(printed))
    if d > tol:
        fail(f"(a) {label}: computed {computed:.12g} vs printed {printed} "
             f"(|d| = {d:.3g} > half a unit in the last printed digit, {tol:.3g})")
    return d / tol


def run_probe(source):
    cxx = shutil.which("g++")
    if not cxx:
        fail("(a) g++ not found: the probe CANNOT run -- refusing (a check that cannot run must not pass)")
        return None
    with tempfile.TemporaryDirectory(prefix="if97probe-") as td:
        td = Path(td)
        (td / "probe.cpp").write_text(PROBE)
        exe = td / "probe"
        r = subprocess.run([cxx, "-std=c++17", "-O2",
                            "-I", str(ROOT / "src" / "thermo" / "iapws"),
                            str(td / "probe.cpp"), str(source), "-o", str(exe)],
                           capture_output=True, text=True, timeout=300)
        if r.returncode != 0:
            fail(f"(a) the probe did not compile against {source}: {r.stderr[-400:]}")
            return None
        r = subprocess.run([str(exe)], capture_output=True, text=True, timeout=300)
        if r.returncode != 0:
            fail(f"(a) the probe exited {r.returncode}: {r.stderr[-400:]}")
            return None
        return r.stdout.splitlines()


def props_case(td, ops):
    """A minimal choupoProps case: steamTables ops only, no components needed
    beyond water (copied from the witness)."""
    witness = ROOT / "tutorials" / "props" / "steam" / "steam03_if97_region3"
    case = Path(td) / "case"
    shutil.copytree(witness, case, ignore=shutil.ignore_patterns(
        "expected", "*.csv", "results*", "log*"))
    (case / "system" / "propsDict").write_text(
        "// check_if97_regions: a generated probe case\n"
        "operations\n(\n" + ops + "\n);\n")
    return case


def run_engine(ops):
    with tempfile.TemporaryDirectory(prefix="if97eng-") as td:
        case = props_case(td, ops)
        r = subprocess.run([str(PROPS), "."], cwd=case, capture_output=True,
                           text=True, timeout=600,
                           env={"CHOUPO_HOME": str(ROOT), "PATH": "/usr/bin:/bin"})
        # The result JSON rides on stdout between the engine's markers.
        res = {}
        m = re.search(r"<<<Choupo:result-begin>>>(.*?)<<<Choupo:result-end>>>",
                      r.stdout, re.S)
        if m:
            try:
                res["result"] = json.loads(m.group(1))
            except Exception:
                pass
        return r, res


def find_diag(res, opname):
    """The diagnostics of op `opname` in whatever result JSON the run wrote."""
    def walk(o):
        if isinstance(o, dict):
            if o.get("name") == opname and isinstance(o.get("diagnostics"), dict):
                return o["diagnostics"]
            for v in o.values():
                x = walk(v)
                if x is not None:
                    return x
        elif isinstance(o, list):
            for v in o:
                x = walk(v)
                if x is not None:
                    return x
        return None
    for v in res.values():
        x = walk(v)
        if x is not None:
            return x
    return None


def main():
    source = ROOT / "src" / "thermo" / "iapws" / "IF97.cpp"
    if "--source" in sys.argv:
        source = Path(sys.argv[sys.argv.index("--source") + 1]).resolve()
    lines = run_probe(source)
    if lines is None:
        print(f"check_if97_regions: FAILED -- {len(fails)} arm(s)")
        return 1
    rows = {}
    for ln in lines:
        parts = ln.split()
        rows.setdefault(parts[0], []).append(parts[1:])

    worst = 0.0
    # (a) the kernel against the printed tables
    v = float(rows["verify"][0][0])
    if not v < 1e-8:
        fail(f"(a) IF97::verify() = {v:.3g} (>= 1e-8)")
    states = {}
    for ln in lines:
        p = ln.split()
        if p[0].startswith(("A3_", "A6_", "A10_")):
            states[p[0]] = {p[i]: float(p[i + 1]) for i in range(1, len(p) - 1, 2)}
    table = []
    for name, data, keys in (("A3", A3, ["v", "h", "u", "s", "cp", "w"]),
                             ("A6", A6, ["v", "h", "u", "s", "cp", "w"]),
                             ("A10", A10, ["p", "h", "u", "s", "cp", "w"])):
        for i, (pt, printed) in enumerate(data):
            st = states[f"{name}_{i}"]
            for k, pr in zip(keys, printed):
                c = st[k] / 1e6 if k == "p" else st[k]
                worst = max(worst, held(f"Table {name} {pt} {k}", c, pr))
                table.append((name, pt, k, pr, c))
    for ln in rows.get("route", []):
        if ln[0].startswith("A3_") and ln[1] != "1":
            fail(f"(a) Table A3 state {ln[0]} routes to region {ln[1]}, not 1")
        if ln[0].startswith("A6_") and ln[1] != "2":
            fail(f"(a) Table A6 state {ln[0]} routes to region {ln[1]}, not 2")
    for (T, pr), ln in zip(A12, rows["psat"]):
        worst = max(worst, held(f"Table A12 psat({T} K) [MPa]", float(ln[1]), pr))
        table.append(("A12", T, "psat", pr, float(ln[1])))
    for (p, pr), ln in zip(A29, rows["tsat"]):
        worst = max(worst, held(f"Table A29 Tsat({p} MPa) [K]", float(ln[1]), pr))
        table.append(("A29", p, "Tsat", pr, float(ln[1])))
    b = rows["b23"][0]
    worst = max(worst, held("B23 pB23(623.15 K) [MPa]", float(b[1]), B23[1]))
    worst = max(worst, held("B23 TB23(16.5291643 MPa) [K]", float(b[3]), B23[0]))

    # (b) the backward density
    for i, ((T, rho), printed) in enumerate(A10):
        ln = rows["back"][i]
        r = float(ln[1])
        # the printed pressure's half unit, carried through (dp/drho)_T
        tol = halfUnit(printed[0]) * 1e6 / float(ln[3]) + 1e-12
        if abs(r - rho) > tol:
            fail(f"(b) rho3({printed[0]} MPa, {T} K) = {r:.12g}, printed rho {rho} (tol {tol:.2g})")
        if ln[2] != "3":
            fail(f"(b) ({printed[0]} MPa, {T} K) routes to region {ln[2]}, not 3")

    # (c) region-5 refusal, kernel
    r5 = " ".join(rows["r5"][0])
    if "region 5" not in r5:
        fail(f"(c) props(10 MPa, 1200 K) did not refuse BY NAME (got: {r5[:160]})")

    # (d) continuity
    maxima = {}
    for tag in ("c13", "c23"):
        m = {k: 0.0 for k in PRAGUE}
        for ln in rows[tag]:
            vals = [abs(float(x)) for x in ln[1:]]
            for k, x in zip(["dv_pct", "dh", "dcp_pct", "ds_J", "dg", "dw_pct"], vals):
                m[k] = max(m[k], x)
        maxima[tag] = m
        for k, lim in PRAGUE.items():
            if m[k] > lim:
                fail(f"(d) boundary {tag[1]}/{tag[2]}: max |{k}| = {m[k]:.4g} exceeds the "
                     f"Prague value {lim} (Wagner et al. 2000, Section 4.3)")
            # The paper's own achieved maximum (Table 13), held to half a unit
            # in its last printed digit: the transcription reproduces not only
            # the permitted band but the inconsistency the authors measured.
            pm = PAPER_MAX[tag[1:]][k]
            if m[k] > pm + halfUnit(f"{pm:.3f}"):
                fail(f"(d) boundary {tag[1]}/{tag[2]}: max |{k}| = {m[k]:.4g} exceeds the paper's "
                     f"own Table 13 maximum {pm} (+ half its last printed digit)")

    # (c)+(e) the engine
    if not PROPS.exists():
        fail("(e) choupoProps not built: the engine arms CANNOT run -- refusing")
    else:
        ops = ("{ name r5; type steamTables; point { P 10 MPa; T 1200 K; } }")
        r, _ = run_engine(ops)
        txt = r.stdout + r.stderr
        if r.returncode == 0 or "region 5" not in txt:
            fail(f"(c) the engine did not refuse region 5 by name (exit {r.returncode})")
        ops = ("{ name a10; type steamTables; point { rho 500 kg/m3; T 650 K; } }\n"
               "{ name pt3; type steamTables; point { P 25.5837018 MPa; T 650 K; } }")
        r, res = run_engine(ops)
        if r.returncode != 0:
            fail(f"(e) choupoProps exit {r.returncode} on the region-3 points: {(r.stdout + r.stderr)[-400:]}")
        else:
            da, dp = find_diag(res, "a10"), find_diag(res, "pt3")
            if da is None or dp is None:
                fail("(e) the region-3 points' diagnostics are absent from the result JSON")
            else:
                for k, pr in zip(["p_MPa", "h", "u", "s", "cp", "w"], A10[0][1]):
                    if abs(da.get(k, float("nan")) / float(pr) - 1) > 1e-8:
                        fail(f"(e) engine (rho, T) point: {k} = {da.get(k)} vs printed {pr}")
                if int(dp.get("region", 0)) != 3 or abs(dp.get("rho", 0) / 500.0 - 1) > 1e-8:
                    fail(f"(e) engine (p, T) point: region {dp.get('region')}, rho {dp.get('rho')} (want 3, 500)")

    for name, pt, k, pr, c in table:
        print(f"  Table {name:4s} {str(pt):16s} {k:5s} printed {pr:>16s}  computed {c:.12g}")
    for tag, lab in (("c13", "1/3"), ("c23", "2/3")):
        m = maxima[tag]
        print(f"  boundary {lab}: " + ", ".join(
            f"{k} {m[k]:.4g} (paper {PAPER_MAX[tag[1:]][k]}, Prague {PRAGUE[k]})" for k in PRAGUE))
    if fails:
        print(f"check_if97_regions: FAILED -- {len(fails)} arm(s)")
        return 1
    m13, m23 = maxima["c13"], maxima["c23"]
    print(f"check_if97_regions: OK -- IF97 regions 1, 2, 3, 4 and B23 reproduce every verification value "
          f"printed in Wagner et al. 2000 (Tables A3, A6, A10, A12, A29, B23 point; worst = "
          f"{worst:.2f} of half a unit in the last printed digit); rho3(p,T) returns the Table A10 densities; "
          f"region 5 refuses by name in the kernel and the engine; boundaries within the Prague values "
          f"(1/3 max dcp {m13['dcp_pct']:.3f} %, dw {m13['dw_pct']:.3f} %; 2/3 max dcp {m23['dcp_pct']:.3f} %, "
          f"dw {m23['dw_pct']:.3f} %); the engine reaches region 3 at (rho,T) and (p,T). "
          f"Does NOT check IF97 against IAPWS-95, region 5, or metastable states.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
