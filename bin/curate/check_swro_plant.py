#!/usr/bin/env python3
"""Gate: the Campo de Dalias seawater plant (DEV.md 4c C194) says what its
header says, recomputed OUTSIDE the engine.

    bin/curate/check_swro_plant.py

THE CASE.  tutorials/plant/swro01_campoDalias is built on a MANUFACTURER'S
two-page case study (Toray, MC-CS-CAMPODEDALIAS-1910): a two-pass SWRO of six
skids each, the second pass's concentrate recycled to the first, a pressure
exchanger, boron, post-treatment placeholders, and a plot plan up to the
fence.  The gate holds the PDF's numbers HERE (transcribed from the PDF, the
one place they are typed beside a recomputation) and requires the engine's
result to reproduce them.

WHAT THIS CHECKS.
  (a) THE PLANT'S NUMBERS from the result JSON, by arithmetic on stream masses
      and the declared densities, not on the engine's own KPIs: the product is
      the PDF's 98 664 m3/day (0.05 %); the first pass's volumetric recovery is
      its 47.2 % (0.1 %); the second pass's recovery lies in the PDF's 84-90 %;
      the concentrate recycled is exactly what the second pass did not
      permeate; the plant's mass closes (intake = product + brine); the
      exchanger's two flows balance (|imbalance| < 1e-3); the permeate meets
      the PDF's targets (TDS < 400 mg/L -- as NaCl-equivalent scaled by the
      lump's 7 % -- and boron < 0.5 mg/L).
  (b) THE FEED is Table 2 of the PDF: the twelve ions are summed to their
      osmotic NaCl equivalent and the boron to B, and the `seawater` stream
      carries exactly that per m3 at the declared 1025 kg/m3.
  (c) THE BORON ROUTE.  The module records carry the PDF's two boron tests
      (91 % at pH 8; 95 % at pH 10), the engine's rated-test KPIs reproduce
      them, and the approximation is ANNOUNCED in the output.  THE LIMITATION
      IS PINNED: a copy with the second pass's test labelled pH 7 gives the
      SAME intrinsic boron rejection -- the engine does not couple the pH to
      the transport.  The day it does, this arm fails and demands that the
      case's header, the design record and this gate be rewritten.
  (d) REFUSALS BY NAME: a unit whose rejection list omits the boron
      solute present in its feed, one whose module record has no boron test, a car park that
      cannot hold its bays, a fence crossing with `at` on an east/west side.
  (e) THE LAYOUT, recomputed from the result's own geometry: no two
      footprints overlap, no road crosses a footprint, every item stands inside
      the fence, the gate's opening is on the fence, the three boundary
      streams cross it at published points ON the fence line each labelled
      as beyond the plan ("(not drawn)"), each water tank's square footprint
      holds the circle its sized volume needs at its height, and the
      exchanger's array count is ceil(Q_LP / rated flow).

WHAT THIS DOES NOT CHECK, said plainly:
  * THAT ANY NUMBER IS THE REAL PLANT'S.  The PDF is a manufacturer's claim at
    its own test conditions; the case assumes the conditions, derives A_w from
    them, lumps the ions and picks the plant pressures so that 47.2 % and the
    product hold.  Reproducing the PDF's figures is the case's design, not a
    validation.
  * THE LAYOUT AGAINST ANY CODE OR THE REAL SITE: every position is author-set.
  * THE FIRST LAW (UNAVAILABLE on this component set, as membrane27).
  * BORON AS A pH-DEPENDENT PHYSICS: the case does not model it (see (c)).
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
CASE = ROOT / "tutorials" / "plant" / "swro01_campoDalias"
ENV = dict(os.environ, CHOUPO_HOME=str(ROOT))
_CACHE = os.environ.get("CHOUPO_SUITE_OUTPUTS")

fails = []

# ---- the PDF's numbers (Toray MC-CS-CAMPODEDALIAS-1910, Tables 1-3) --------
PDF_PRODUCT_M3D = 98664.0
PDF_R1 = 0.472
PDF_R2 = (0.84, 0.90)
PDF_TDS_MAX_MGL = 400.0
PDF_B_MAX_MGL = 0.5
PDF_BORON = {"TM820E-400": ("pH 8", 0.91), "TM720C-430": ("pH 10", 0.95)}
#  Table 2, mg/L, with the molar masses used to turn them into mmol/L
PDF_IONS = {"Ca": (436.7, 40.078, 2), "Mg": (1358.7, 24.305, 2), "Na": (12009.4, 22.99, 1),
            "K": (409.5, 39.098, 1), "Sr": (4.9, 87.62, 2), "CO3": (7.2, 60.009, 2),
            "HCO3": (165.5, 61.017, 1), "SO4": (2913.6, 96.06, 2), "Cl": (21373.7, 35.453, 1),
            "F": (1.5, 18.998, 1), "NO3": (1.0, 62.005, 1)}
PDF_B_MGL = 5.3
PDF_TDS_MGL = 38697.2
MW_NACL, MW_B = 58.44, 10.81
RHO_SEA = 1025.0     # the declared rho_feed of the first pass (read below, held equal)


def rel(a, b):
    return abs(a - b) / abs(b) if b != 0 else abs(a)


def run_case(case: Path):
    if _CACHE and case == CASE:
        f = Path(_CACHE) / (case.relative_to(ROOT).as_posix().replace("/", "__") + ".out")
        try:
            return f.read_text(errors="replace"), 0
        except OSError:
            pass
    r = subprocess.run([str(ROOT / "choupoSolve"), str(case)], capture_output=True, text=True, env=ENV)
    return r.stdout + r.stderr, r.returncode


def result_json(out: str):
    a, b = out.find("<<<Choupo:result-begin>>>"), out.find("<<<Choupo:result-end>>>")
    if a < 0 or b < 0:
        return None
    try:
        return json.loads(out[a + len("<<<Choupo:result-begin>>>"):b])
    except ValueError:
        return None


def fixture(tmp: Path, name: str, edit) -> Path:
    dst = tmp / name
    shutil.copytree(CASE, dst, ignore=shutil.ignore_patterns("converged", "design", "reports",
                    "iterations", "log.*", "*.json"))
    edit(dst)
    return dst


def sub_file(p: Path, old: str, new: str):
    s = p.read_text()
    if old not in s:
        raise RuntimeError("fixture edit: %r not in %s" % (old, p))
    p.write_text(s.replace(old, new, 1))


def declared_rho_sea() -> float:
    s = re.sub(r'//[^\n]*', '', (CASE / "system" / "flowsheetDict").read_text())
    m = re.search(r"name\s+RO1;.*?rho_feed\s+([0-9.]+);", s, re.S)
    return float(m.group(1)) if m else float("nan")


# ---------------------------------------------------------------------------
def arm_a(res):
    S, K = res["streams"], res["kpis"]
    need = ("seawater", "feed1", "roFeed", "brine", "perm1", "perm2", "conc2", "spentBrine", "perm2a", "perm2b")
    if not all(n in S for n in need):
        fails.append("(a) the result lacks streams %s" % [n for n in need if n not in S])
        return
    if not res.get("converged"):
        fails.append("(a) the run is not converged")
    rho1 = declared_rho_sea()
    if rho1 != RHO_SEA:
        fails.append("(a) the first pass declares rho_feed %s, the gate holds %s" % (rho1, RHO_SEA))
    m = lambda n: S[n]["F_mass"]                       # kg/s
    prod_m3d = m("perm2") / 1000.0 * 86400.0           # permeate carries the module's 1000 kg/m3
    if rel(prod_m3d, PDF_PRODUCT_M3D) > 5e-4:
        fails.append("(a) the product is %.1f m3/day, the PDF's %.0f (rel %.2e)" % (prod_m3d, PDF_PRODUCT_M3D, rel(prod_m3d, PDF_PRODUCT_M3D)))
    r1 = (m("perm1") / 1000.0) / (m("roFeed") / rho1)
    if rel(r1, PDF_R1) > 1e-3:
        fails.append("(a) the first-pass recovery is %.5f, the PDF's %.3f" % (r1, PDF_R1))
    r2 = m("perm2") / m("perm1")
    if not (PDF_R2[0] <= r2 <= PDF_R2[1]):
        fails.append("(a) the second-pass recovery %.4f is outside the PDF's %.2f-%.2f" % (r2, *PDF_R2))
    if rel(m("conc2"), m("perm1") - m("perm2")) > 1e-9:
        fails.append("(a) the recycled concentrate is not what the second pass did not permeate")
    if rel(m("seawater"), m("perm2") + m("spentBrine")) > 1e-6:
        fails.append("(a) the plant's mass does not close: intake %.6g, product + brine %.6g"
                     % (m("seawater"), m("perm2") + m("spentBrine")))
    if rel(m("feed1"), m("seawater") + m("conc2")) > 1e-6:
        fails.append("(a) the first pass's feed is not the intake plus the recycle")
    if abs(K["PX"].get("flowImbalance", 1.0)) > 1e-3:
        fails.append("(a) the exchanger's flows are unbalanced: %r" % K["PX"].get("flowImbalance"))
    # permeate quality from the streams' own composition
    z, F = S["perm2"]["composition"], S["perm2"]["F"]
    vol = m("perm2") / 1000.0
    nacl_gl = z["NaCl"] * F * MW_NACL / vol
    b_mgl = z["boron"] * F * MW_B / vol * 1000.0
    ions_mmol = sum(v[0] / v[1] for v in PDF_IONS.values())
    nacl_eq_gl = ions_mmol / 2.0 * MW_NACL / 1000.0
    factor = PDF_TDS_MGL / (nacl_eq_gl * 1000.0)       # real TDS per NaCl-equivalent
    tds_mgl = nacl_gl * 1000.0 * factor
    if tds_mgl >= PDF_TDS_MAX_MGL:
        fails.append("(a) the product TDS %.1f mg/L (NaCl-eq x %.4f) is not below %g" % (tds_mgl, factor, PDF_TDS_MAX_MGL))
    if b_mgl >= PDF_B_MAX_MGL:
        fails.append("(a) the product boron %.4f mg/L is not below %g" % (b_mgl, PDF_B_MAX_MGL))
    return tds_mgl, b_mgl, prod_m3d, r1, r2, factor


def arm_b(res):
    s = res["streams"]["seawater"]
    z, F, mass = s["composition"], s["F"], s["F_mass"]
    vol = mass / RHO_SEA
    nacl_gl = z["NaCl"] * F * MW_NACL / vol
    b_mgl = z["boron"] * F * MW_B / vol * 1000.0
    ions_mmol = sum(v[0] / v[1] for v in PDF_IONS.values())
    want = ions_mmol / 2.0 * MW_NACL / 1000.0
    if rel(nacl_gl, want) > 2e-4:
        fails.append("(b) the feed's NaCl is %.4f g/L; Table 2's ions in osmotic NaCl equivalence give %.4f" % (nacl_gl, want))
    if rel(b_mgl, PDF_B_MGL) > 2e-4:
        fails.append("(b) the feed's boron is %.4f mg/L, Table 2's %.1f" % (b_mgl, PDF_B_MGL))
    # electroneutrality of Table 2 (a transcription check on the gate's own copy)
    cat = sum(v[0] / v[1] * v[2] for k, v in PDF_IONS.items() if k in ("Ca", "Mg", "Na", "K", "Sr"))
    an = sum(v[0] / v[1] * v[2] for k, v in PDF_IONS.items() if k not in ("Ca", "Mg", "Na", "K", "Sr"))
    if rel(cat, an) > 2e-3:
        fails.append("(b) the gate's copy of Table 2 is not electroneutral (%.2f vs %.2f meq/L): a transcription error" % (cat, an))


def pH_of(rec: Path):
    s = re.sub(r'//[^\n]*', '', rec.read_text())
    m = re.search(r"id\s+boronRef;.*?pH\s+([0-9.]+);.*?rejection\s+([0-9.]+);", s, re.S)
    return (float(m.group(1)), float(m.group(2))) if m else (None, None)


def arm_c(res, out, tmp):
    K = res["kpis"]
    for mod, unit in (("TM820E-400", "RO1"), ("TM720C-430", "RO2a")):
        want_label, want_rej = PDF_BORON[mod]
        pH, rej = pH_of(CASE / "constant" / "assets" / (mod + ".dat"))
        if pH is None or "pH %d" % round(pH) != want_label or abs(rej - want_rej) > 1e-12:
            fails.append("(c) %s's boron test is pH %s, %s; the PDF says %s, %.2f" % (mod, pH, rej, want_label, want_rej))
        got = K[unit].get("ratedTest_R_obs_boron")
        if got is None or abs(got - want_rej) > 1e-6:
            fails.append("(c) %s: the engine's rated-test reproduction of boron is %r, not %.2f" % (unit, got, want_rej))
        want_n = {"TM820E-400": 0.9975, "TM720C-430": 0.992}[mod]
        gn = K[unit].get("ratedTest_R_obs_NaCl")
        if gn is None or abs(gn - want_n) > 1e-6:
            fails.append("(c) %s: the NaCl rated-test reproduction is %r, not %.4f" % (unit, gn, want_n))
    if "the probe models no pH" not in out:
        fails.append("(c) the run does not announce that the boron probe models no pH (the approximation's output half)")
    if "boron is ONE lumped solute" not in (CASE / "system" / "flowsheetDict").read_text():
        fails.append("(c) the case's `source` no longer declares boron a lumped solute with a constant rejection (the input half)")
    # the pH-label fixture: the engine must NOT move the intrinsic rejection
    d = fixture(tmp, "ph-label", lambda d: sub_file(d / "constant" / "assets" / "TM720C-430.dat", "pH                 10;", "pH                 7;"))
    out2, code = run_case(d)
    r2 = result_json(out2) if code == 0 else None
    if r2 is None:
        fails.append("(c) the pH-label fixture did not run")
    else:
        a, b = res["kpis"]["RO2a"]["R_int_fromRatedTest_boron"], r2["kpis"]["RO2a"]["R_int_fromRatedTest_boron"]
        if rel(a, b) > 1e-9:
            fails.append("(c) THE LIMITATION HAS MOVED: relabelling the second pass's boron test pH 10 -> 7 changed the intrinsic"
                         " rejection (%.6f -> %.6f), so the engine now couples pH to transport.  Rewrite the case header's BORON"
                         " section, the design record and this arm." % (a, b))


def arm_d(tmp):
    n = 0
    def refused(name, edit, words):
        nonlocal n
        d = fixture(tmp, name, edit)
        out, code = run_case(d)
        if code == 0:
            fails.append("(d) %s: the run EXITED 0 -- not refused" % name)
            return
        miss = [w for w in words if w not in out]
        if miss:
            fails.append("(d) %s: refused, but not naming %r.  Tail:\n%s" % (name, miss, out[-600:]))
        n += 1
    refused("boron-without-a-rejection", lambda d: sub_file(d / "system" / "flowsheetDict",
            "                    NaCl  ( fromRatedTest naclRef );\n                    boron ( fromRatedTest boronRef );\n                }\n                source  \"as RO2a\";",
            "                    NaCl  ( fromRatedTest naclRef );\n                }\n                source  \"as RO2a\";"),
            ["boron"])
    def drop_boron_test(d):
        p = d / "constant" / "assets" / "TM820E-400.dat"
        s = p.read_text()
        i = s.index("    {\n        id                 boronRef;")
        j = s.index("    }\n", i) + 6
        p.write_text(s[:i] + s[j:])
    refused("no-boron-test", drop_boron_test, ["boron"])
    refused("carpark-too-many-bays", lambda d: sub_file(d / "system" / "layoutDict", "bays        22;", "bays        30;"),
            ["carPark", "bays"])
    refused("east-crossing-with-at", lambda d: sub_file(d / "system" / "layoutDict",
            "{ stream product;    to   \"the irrigation and potable network: the product main to the Campo de Dalias region (not drawn)\";         side north;  at 70 m; }",
            "{ stream product;    to   \"the irrigation and potable network: the product main to the Campo de Dalias region (not drawn)\";         side east;  at 70 m; }"),
            ["at"])
    return n


def rects(L):
    return {i["id"]: (i["x"] - i["dx"] / 2.0, i["x"] + i["dx"] / 2.0, i["y"] - i["dy"] / 2.0, i["y"] + i["dy"] / 2.0, i["dz"]) for i in L["items"]}


def arm_e(res):
    L = res.get("layout")
    if not L:
        fails.append("(e) the result carries no layout block")
        return
    R = rects(L)
    ids = sorted(R)
    for a in range(len(ids)):
        for b in range(a + 1, len(ids)):
            A, B = R[ids[a]], R[ids[b]]
            if A[0] < B[1] and B[0] < A[1] and A[2] < B[3] and B[2] < A[3]:
                fails.append("(e) footprints overlap: %s and %s" % (ids[a], ids[b]))
    fx = L["fence"]
    for k, (x0, x1, y0, y1, _) in R.items():
        if x0 < fx["xMin"] or x1 > fx["xMax"] or y0 < fx["yMin"] or y1 > fx["yMax"]:
            fails.append("(e) %s stands outside the fence" % k)
    for road in L["roads"]:
        hw = road["width"] / 2.0
        pts = road["centreline"]
        for p, q in zip(pts, pts[1:]):
            x0, x1 = sorted((p[0], q[0])); y0, y1 = sorted((p[1], q[1]))
            for k, (a0, a1, b0, b1, _) in R.items():
                if x0 - hw < a1 and a0 < x1 + hw and y0 - hw < b1 and b0 < y1 + hw:
                    fails.append("(e) road %s crosses the footprint of %s" % (road["road"], k))
    ops = L.get("fenceOpenings", [])
    if len(ops) != 1 or ops[0].get("side") != "north" or abs(ops[0]["y"] - fx["yMax"]) > 1e-9:
        fails.append("(e) the gate's opening is not on the fence's north line: %r" % ops)
    cross = {c["stream"]: c for c in L.get("fenceCrossings", [])}
    for s, side in (("seawater", "south"), ("spentBrine", "south"), ("product", "north")):
        c = cross.get(s)
        if c is None:
            fails.append("(e) no published fence crossing for %s" % s)
            continue
        on = abs(c["y"] - (fx["yMin"] if side == "south" else fx["yMax"])) < 1e-9 and fx["xMin"] <= c["x"] <= fx["xMax"]
        if c["side"] != side or not on:
            fails.append("(e) %s does not cross the fence on its %s line (%r)" % (s, side, c))
        if not c.get("labelDeclared") or "(not drawn)" not in c.get("label", ""):
            fails.append("(e) %s's crossing does not name what lies beyond as not drawn" % s)
    # the tanks' footprints hold the circle their sized volume needs
    for t in ("Remineralisation/tank1", "Disinfection/tank1", "ProductTank/tank1", "ProductTank/tank2", "ProductTank/tank3"):
        sheet = CASE / "design" / t.split("/")[0] / t.split("/")[1]
        if not sheet.is_file():
            fails.append("(e) no design sheet %s" % t)
            continue
        m = re.search(r"V_R\s+([0-9.eE+-]+) m3;", sheet.read_text())
        x0, x1, y0, y1, h = R[t]
        if not m or (x1 - x0) * (y1 - y0) * h < float(m.group(1)) * 0.999:
            fails.append("(e) %s's box (%.0f m3) cannot hold its sized volume %s m3" % (t, (x1 - x0) * (y1 - y0) * h, m.group(1) if m else "?"))
    # the exchanger array
    p = CASE / "design" / "PX" / "pressureExchanger"
    txt = p.read_text() if p.is_file() else ""
    q = re.search(r"Q_LP\s+([0-9.eE+-]+) m3/h;", txt)
    rot = re.search(r"rotors\s+\[0 0 0 0 0\]\s+([0-9.]+);", txt)
    rated = re.search(r"ratedFlowPerUnit\s+([0-9.eE+-]+) m3/h;", txt)
    if not (q and rot and rated) or float(rot.group(1)) != math.ceil(float(q.group(1)) / float(rated.group(1)) - 1e-12):
        fails.append("(e) the exchanger sheet's rotors are not ceil(Q_LP / rated flow)")
    s = L.get("summary", {})
    return len(ids), len(L["roads"]), s


def main():
    if not (ROOT / "choupoSolve").exists():
        print("check_swro_plant: FAILED -- no choupoSolve build")
        return 1
    out, code = run_case(CASE)
    if code != 0:
        print("check_swro_plant: FAILED -- the case did not run (exit %d)\n%s" % (code, out[-1500:]))
        return 1
    res = result_json(out)
    if res is None:
        print("check_swro_plant: FAILED -- no result JSON")
        return 1
    a = arm_a(res)
    arm_b(res)
    tmp = Path(tempfile.mkdtemp(prefix="check_swro_plant_"))
    try:
        arm_c(res, out, tmp)
        nref = arm_d(tmp)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    e = arm_e(res)
    if fails or a is None or e is None:
        print("check_swro_plant: FAILED")
        for f in fails:
            print("  " + f)
        return 1
    tds, b, prod, r1, r2, fac = a
    ni, nr, summ = e
    print("check_swro_plant: OK -- on %s the product is %.1f m3/day (the PDF's 98 664), the first pass recovers %.2f %% "
          "(47.2) and the second %.1f %% (84-90), the recycle is what the second pass did not permeate, the plant's mass "
          "closes and the exchanger balances, the product holds %.1f mg/L TDS (%.4f x NaCl-eq) and %.3f mg/L boron "
          "against < 400 and < 0.5, all recomputed from stream masses; the feed is Table 2's twelve ions in osmotic NaCl "
          "equivalence and 5.3 mg/L boron; the boron tests are the PDF's (91 %% at pH 8, 95 %% at pH 10), announced as an "
          "approximation, and relabelling the pH moves nothing (the limitation is PINNED); %d fixtures refuse by name "
          "(a boron solute with no rejection, a record with no boron test, 30 bays in a 22-bay car park, `at` on an east side); the "
          "layout's %d footprints overlap nowhere and stand inside the fence, none of %d roads crosses one, the gate opens "
          "on the north line and the three boundary pipes cross at published points on the fence labelled `(not drawn)`, "
          "each tank's box holds its sized volume, and the exchanger's rotors are ceil(Q_LP / rated).  NOT CHECKED: that any "
          "number is the real plant's (the PDF is a manufacturer's claim at assumed test conditions), the layout against "
          "any code or the real site, the first law, and boron as pH-dependent physics (not modelled)."
          % (CASE.name, prod, r1 * 100, r2 * 100, tds, fac, b, nref, ni, nr))
    return 0


if __name__ == "__main__":
    sys.exit(main())
