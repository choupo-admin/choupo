#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
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
  (c) THE BORON SPLIT (DEV.md 4c C198, Stage 1).  The module records carry the
      PDF's two boron tests (91 % at pH 8; 95 % at pH 10), the engine's
      rated-test KPIs reproduce them, and each module splits boron into boric
      acid and borate at its DECLARED pH (8.2 for the first pass, Table 2;
      10 for the second, Table 1).  THE ARM THAT PINNED THE OPPOSITE IS
      REWRITTEN INTO ITS POSITIVE FORM: the derived pair of permeances
      reproduces the rated test at the TEST's own pH; relabelling the second
      pass's test pH 10 -> 7 changes the derived acid rejection (alpha at the
      test moved) and NOT the component's effective rejection at the test
      (that is the sheet's number through the module's film); declaring the
      second pass at pH 9 raises the product's boron; the run announces the
      frozen split and the assumed base.  The full recomputation is
      check_boron_split.py's.
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

  (f)-(k) THE PLANT IS TRAINS AND RACKS (DEV.md 4c C199), recomputed from the
      case's own dicts and the result's stream masses, never from a sizer's
      answer:
      (f) six trains (the PDF's six skids of 16 442 m3/d), one item per train
          for every pump, exchanger and bank family, the per-train flows, shaft
          powers, vessels, membrane area and devices times six equal the plant's
          (and the PDF's 233 / 54 / 18 vessels of seven elements), the specific
          shaft energy is the case's 2.81 kWh/m3;
      (g) the pumps: pumps per train = ceil(flow per train / the postDict's
          declared largest pump), running = trains x installed, installed =
          running + the declared spares, utilisation, discharge pressure below
          the declared rating;
      (h) the exchanger arrays: devices per train = ceil(Q_LP / the window's
          top), each device inside the window, the window itself the Q650's
          250-650 gpm converted, the brine pressure under 83 bar;
      (i) the vessel banks: vessel length, racks, vessels in the last rack, rack
          envelope, loading clearance and bank envelope recomputed from the
          flowsheet's vessels and elements, the module record's element size
          and the postDict's declared numbers, and the plan's box equal to the
          published envelope;
      (j) the RO building: every bank, pump and array stands in its room, on the
          floor, inside the room's box;
      (k) six more fixtures refuse by name: a pump with no rating, a pump too
          small for its train (naming the count), a bank with no rack size,
          vessels the trains cannot share, an exchanger above its pressure
          rating, per-train sizing with no trains declared.

  (l)-(m) A HEADER IS SIZED BY ITS VELOCITY (DEV.md 4c C199, `pipeHeader`):
      (l) the 54 header items (feed, brine, permeate of RO1, RO2a, RO2b, six
          trains) have their flow per train, required bore sqrt(4Q/(pi vmax)),
          nominal bore (the smallest DECLARED bore at or above it, velocity
          inside the window), velocity, Reynolds number, Churchill friction
          factor (written out HERE) and Darcy-Weisbach drop per metre
          recomputed from the postDict and the stream masses; the density is
          the package's as published and is only range-checked;
      (m) four fixtures refuse by name: no velocity window, no bore that fits
          (the message must give the largest declared bore, which the second,
          weaker refusal does not -- a sabotage survived without that word), a
          window above the nearest bore, no viscosity.

WHAT THIS DOES NOT CHECK, said plainly:
  * THAT A PUMP, RACK OR CLEARANCE NUMBER IS A REAL ONE.  Those not read from an
    open page are ASSUMED and say so; the gate holds the arithmetic, not the
    catalogue.
  * THAT ANY NUMBER IS THE REAL PLANT'S.  The PDF is a manufacturer's claim at
    its own test conditions; the case assumes the conditions, derives A_w from
    them, lumps the ions and picks the plant pressures so that 47.2 % and the
    product hold.  Reproducing the PDF's figures is the case's design, not a
    validation.
  * THE LAYOUT AGAINST ANY CODE OR THE REAL SITE: every position is author-set.
  * THE FIRST LAW (UNAVAILABLE on this component set, as membrane27).
  * BORON AS A COMPUTED-pH PHYSICS: the pH is a declared label of each module
    (Stage 1); Stage 2 resolves it from the carbonate system (see (c)).
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


def sub_file(p: Path, old: str, new: str, count: int = 1):
    s = p.read_text()
    if old not in s:
        raise RuntimeError("fixture edit: %r not in %s" % (old, p))
    p.write_text(s.replace(old, new, count))


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
    for needle in ("FROZEN at the module inlet", "DECLARED ASSUMPTION", "pH 8.200 DECLARED", "pH 10.000 DECLARED"):
        if needle not in out:
            fails.append("(c) the run does not announce %r (the split's output half)" % needle)
    fs = (CASE / "system" / "flowsheetDict").read_text()
    if fs.count("aqueousSplit") < 3 or "boron ( fromAqueousSplit );" not in fs:
        fails.append("(c) the case no longer declares boron through `aqueousSplit {}` on its three modules (the input half)")
    # the derived pair reproduces the rated test AT THE TEST'S pH
    for unit in ("RO1", "RO2a"):
        k = K[unit]
        want = 1.0 - ((1.0 - k["split_test1_alpha"]) * (1.0 - k["split_R_acid"]) + k["split_test1_alpha"] * (1.0 - k["split_R_base"]))
        if abs(want - k["split_test1_R_eff"]) > 1e-9:
            fails.append("(c) %s: the derived (R_acid, R_base) does not reproduce its rated test at the test's pH (%.9f vs %.9f)"
                         % (unit, want, k["split_test1_R_eff"]))
    # THE POSITIVE FORM of the old limitation: the pH now couples
    d = fixture(tmp, "ph-label", lambda d: sub_file(d / "constant" / "assets" / "TM720C-430.dat", "pH                 10;", "pH                 7;"))
    out2, code = run_case(d)
    r2 = result_json(out2) if code == 0 else None
    if r2 is None:
        fails.append("(c) the pH-label fixture did not run")
    else:
        a, b = K["RO2a"], r2["kpis"]["RO2a"]
        if abs(a["split_R_acid"] - b["split_R_acid"]) < 1e-3:
            fails.append("(c) relabelling the second pass's boron TEST pH 10 -> 7 left the acid rejection at %.6f: the pH does not reach the split"
                         % a["split_R_acid"])
        if rel(a["R_int_fromRatedTest_boron"], b["R_int_fromRatedTest_boron"]) > 1e-9:
            fails.append("(c) relabelling the test pH moved the component's effective rejection AT THE TEST (%.6f -> %.6f): that is the sheet's"
                         " number through the film and must not depend on the label" % (a["R_int_fromRatedTest_boron"], b["R_int_fromRatedTest_boron"]))
    d = fixture(tmp, "pass2-pH9", lambda d: sub_file(d / "system" / "flowsheetDict", "                pH          10;", "                pH          9;", 2))
    out3, code = run_case(d)
    r3 = result_json(out3) if code == 0 else None
    if r3 is None:
        fails.append("(c) the pass-2 pH 9 fixture did not run")
    else:
        def prod_b(r):
            st = r["streams"]["perm2"]
            return st["composition"]["boron"] * st["F"] / st["F_mass"]
        if not prod_b(r3) > prod_b(res):
            fails.append("(c) declaring the second pass at pH 9 did not raise the product's boron: the pH does not couple to the plant")


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
            "                    NaCl  ( fromRatedTest naclRef );\n                    boron ( fromAqueousSplit );\n                }\n                source  \"as RO2a\";",
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
    ITEM = {i["id"]: i for i in L["items"]}
    for a in range(len(ids)):
        for b in range(a + 1, len(ids)):
            A, B = R[ids[a]], R[ids[b]]
            #  the building's shell holds the items its rooms list (C100); the
            #  engine checks that they fit their room, this arm skips the pair
            if (ids[a] == "roBuilding" and ITEM[ids[b]].get("room")) or \
               (ids[b] == "roBuilding" and ITEM[ids[a]].get("room")):
                continue
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
    s = L.get("summary", {})
    return len(ids), len(L["roads"]), s


# ---------------------------------------------------------------------------
#  C199: THE PLANT IS TRAINS AND RACKS.  Everything below is recomputed from the
#  case's own dicts (postDict, flowsheetDict, the module records) and the
#  result's streams, never from the sizers' own answers.
# ---------------------------------------------------------------------------
SKIDS = 6                    # the PDF: six skids of 16 442 m3/d each
PDF_SKID_M3D = 16442.0
PDF_SKID_VESSELS = {"RO1": 233, "RO2a": 54, "RO2b": 18}     # "233 (7M)", "54:18 (7M)"
GPM_M3H = 0.2271247          # 1 US gpm in m3/h (3.785411784 L x 60 / 1000)
IN_M = 0.0254


def strip_comments(s: str) -> str:
    return re.sub(r"//[^\n]*", "", re.sub(r"/\*.*?\*/", "", s, flags=re.S))


def post_text() -> str:
    return strip_comments((CASE / "system" / "postDict").read_text())


def flow_text() -> str:
    return strip_comments((CASE / "system" / "flowsheetDict").read_text())


def entry(post: str, unit: str) -> str:
    m = re.search(r"unitName\s+%s;(.*?)(?=unitName\s|\Z)" % re.escape(unit), post, re.S)
    return m.group(1) if m else ""


def numu(txt: str, key: str, unit: str):
    m = re.search(r"\b%s\s+([0-9.eE+-]+)\s*%s\b" % (key, re.escape(unit)), txt)
    return float(m.group(1)) if m else None


def num(txt: str, key: str):
    m = re.search(r"\b%s\s+([0-9.eE+-]+)\s*;" % key, txt)
    return float(m.group(1)) if m else None


def by_unit(res):
    """The sized items of each unit, the header pipes (C199, `pipeHeader`) apart:
    they are items of the bank's unit but not its banks."""
    out = {}
    for e in res.get("equipment", []):
        if e.get("type") == "pipeHeader":
            continue
        out.setdefault(e["unit"], []).append(e)
    for u in out:
        out[u].sort(key=lambda e: e.get("tag", ""))
    return out


def close(a, b, tol=1e-9):
    return abs(a - b) <= tol * max(1.0, abs(b))


def arm_f(res):
    """(f) THE TRAINS: six, as the PDF's six skids, every family has one item per
    train, and the per-train numbers times the trains reproduce the plant's."""
    K, S, U = res["kpis"], res["streams"], by_unit(res)
    tr = res.get("trains") or {}
    if tr.get("count") != SKIDS:
        fails.append("(f) the result declares %r trains, the PDF's skids are %d" % (tr.get("count"), SKIDS))
        return None
    prod_m3d = S["perm2"]["F_mass"] / 1000.0 * 86400.0
    if rel(prod_m3d / SKIDS, PDF_SKID_M3D) > 3e-4:
        fails.append("(f) a train makes %.1f m3/d, the PDF's skid %.0f" % (prod_m3d / SKIDS, PDF_SKID_M3D))
    for u in ("HPpump", "Booster", "Pass2Pump", "PX", "RO1", "RO2a", "RO2b"):
        items = U.get(u, [])
        tags = [e.get("tag") for e in items]
        if tags != ["train%d" % k for k in range(1, SKIDS + 1)]:
            fails.append("(f) %s has items %r, not train1..train%d" % (u, tags, SKIDS))
            continue
        for k, e in enumerate(items, 1):
            v = e["values"]
            if v.get("trains") != SKIDS or v.get("trainIndex") != k:
                fails.append("(f) %s/%s does not publish trains=%d trainIndex=%d" % (u, e["tag"], SKIDS, k))
        v0 = items[0]["values"]
        if u in ("HPpump", "Booster", "Pass2Pump"):
            if not close(v0["Q_train"] * SKIDS, v0["Q_plant"]) or not close(v0["shaftPowerTrain"] * SKIDS, K[u]["W_shaft_kW"], 1e-9):
                fails.append("(f) %s: the per-train flow or shaft power times %d is not the plant's" % (u, SKIDS))
        if u == "PX":
            if not close(v0["Q_LP"] * SKIDS, K["PX"]["Q_LPin_m3h"], 1e-9) or v0["rotorsPlant"] != v0["rotors"] * SKIDS:
                fails.append("(f) PX: the per-train flow or the rotor count times %d is not the plant's" % SKIDS)
        if u.startswith("RO"):
            if v0["vessels"] * SKIDS != K[u]["vessels"] or v0["vesselsPlant"] != K[u]["vessels"] \
                    or not close(v0["membraneArea"] * SKIDS, K[u]["area_stage"], 1e-9):
                fails.append("(f) %s: the per-train vessels or membrane area times %d is not the unit's" % (u, SKIDS))
            if v0["vessels"] != PDF_SKID_VESSELS[u]:
                fails.append("(f) %s: %d vessels per train, the PDF's skid design has %d" % (u, v0["vessels"], PDF_SKID_VESSELS[u]))
            if v0["elementsPerVessel"] != 7:
                fails.append("(f) %s: %d elements per vessel, the PDF's '7M' is 7" % (u, v0["elementsPerVessel"]))
    shaft = sum(K[u]["W_shaft_kW"] for u in ("IntakePump", "HPpump", "Booster", "Pass2Pump"))
    spec = shaft / (S["perm2"]["F_mass"] / 1000.0 * 3600.0)
    if abs(spec - 2.81) > 0.01:
        fails.append("(f) the plant's specific shaft energy is %.4f kWh/m3, the case's 2.81" % spec)
    return spec


def arm_g(res):
    """(g) THE PUMPS: the count is ceil(flow per train / the declared largest
    pump), recomputed from the stream masses and the postDict's own number."""
    U, S, post = by_unit(res), res["streams"], post_text()
    inlet = {"HPpump": ("toHPpump", 1025.0), "Booster": ("pxHPout", 1025.0),
             "Pass2Pump": ("perm1", 1000.0), "IntakePump": ("s0", 1025.0)}
    out = {}
    for u, (stream, rho) in inlet.items():
        e = entry(post, u)
        qmax = numu(e, "maxFlowPerUnit", "m3/h")
        if qmax is None:
            fails.append("(g) %s declares no maxFlowPerUnit in the postDict" % u)
            continue
        N = SKIDS if "perTrain yes" in e else 1
        q_train = S[stream]["F_mass"] / rho * 3600.0 / N          # m3/h, from the stream mass
        items = U.get(u, [])
        if len(items) != N:
            fails.append("(g) %s has %d items, %d expected" % (u, len(items), N))
            continue
        v = items[0]["values"]
        q_sheet = v.get("Q_train", v["Q_plant"])
        if rel(q_sheet, q_train) > 0.015:
            fails.append("(g) %s: the sheet's flow %.1f m3/h disagrees with the stream's %.1f (>1.5 %%)" % (u, q_sheet, q_train))
        need = max(1, math.ceil(q_train / qmax - 1e-9))
        got = int(v["pumpsNeeded"])
        if got != need:
            fails.append("(g) %s: the sheet needs %d pump(s) per train, ceil(%.1f / %g) = %d" % (u, got, q_train, qmax, need))
        installed = int(v.get("pumpsPerTrain", v["pumpsRunningPlant"]))
        if installed < need:
            fails.append("(g) %s: %d installed, %d needed" % (u, installed, need))
        run = installed * N
        sp = re.search(r"spare\s*\{\s*count\s+(\d+)", e)
        spare = int(sp.group(1)) if sp else 0
        if v["pumpsRunningPlant"] != run or v["pumpsSparePlant"] != spare or v["pumpsInstalledPlant"] != run + spare:
            fails.append("(g) %s: running/spare/installed %r/%r/%r, expected %d/%d/%d" % (
                u, v["pumpsRunningPlant"], v["pumpsSparePlant"], v["pumpsInstalledPlant"], run, spare, run + spare))
        util = (v["flowPerPump"]) / qmax
        if not close(v["utilisation"], util, 1e-9) or util > 1.0:
            fails.append("(g) %s: utilisation %.6f, flowPerPump/max = %.6f" % (u, v["utilisation"], util))
        pr = numu(e, "pressureRating", "bar")
        if pr is not None and v["P_out"] > pr:
            fails.append("(g) %s discharges at %.1f bar above the declared rating %.0f" % (u, v["P_out"], pr))
        out[u] = (need, installed, run, spare)
    return out


def arm_h(res):
    """(h) THE PRESSURE-EXCHANGER ARRAYS: devices per train = ceil(Q_LP / the
    top of the declared window), every device inside the window and under the
    pressure limit, the window itself the vendor's gpm figures converted."""
    U, S, post = by_unit(res), res["streams"], post_text()
    e = entry(post, "PX")
    rated, lo, rating = numu(e, "ratedFlowPerUnit", "m3/h"), numu(e, "minFlowPerUnit", "m3/h"), numu(e, "pressureRating", "bar")
    if None in (rated, lo, rating):
        fails.append("(h) the PX entry lacks ratedFlowPerUnit, minFlowPerUnit or pressureRating")
        return None
    if rel(650 * GPM_M3H, rated) > 5e-4 or rel(250 * GPM_M3H, lo) > 5e-4 or rating != 83.0:
        fails.append("(h) the window %.1f-%.1f m3/h / %.0f bar is not the Q650's 250-650 gpm / 83 bar" % (lo, rated, rating))
    q_train = S["toPX"]["F_mass"] / 1025.0 * 3600.0 / SKIDS
    rot = None
    for it in U.get("PX", []):
        v = it["values"]
        if rel(v["Q_LP"], q_train) > 0.015:
            fails.append("(h) PX/%s: Q_LP %.1f m3/h vs the stream's %.1f" % (it["tag"], v["Q_LP"], q_train))
        rot = math.ceil(v["Q_LP"] / rated - 1e-9)
        if int(v["rotors"]) != rot:
            fails.append("(h) PX/%s: %d devices, ceil(%.2f / %.1f) = %d" % (it["tag"], v["rotors"], v["Q_LP"], rated, rot))
        if not (lo - 1e-9 <= v["Q_LP"] / v["rotors"] <= rated + 1e-9):
            fails.append("(h) PX/%s: %.1f m3/h per device is outside the window %.1f-%.1f" % (it["tag"], v["Q_LP"] / v["rotors"], lo, rated))
        if S["brine"]["P"] / 1e5 > rating:
            fails.append("(h) the brine enters the exchanger at %.1f bar, above %.0f" % (S["brine"]["P"] / 1e5, rating))
    return rot


def arm_i(res):
    """(i) THE VESSEL BANKS: vessel length, racks, rack envelope, loading
    clearance and the bank's envelope recomputed from the dicts, and the plan's
    box equals the published envelope."""
    U, post, flow = by_unit(res), post_text(), flow_text()
    L = {i["id"]: i for i in res["layout"]["items"]}
    n = 0
    for u in ("RO1", "RO2a", "RO2b"):
        fb = re.search(r"name\s+%s;.*?module\s+([\w-]+);.*?vessels\s+(\d+);\s*elements\s+(\d+);" % u, flow, re.S)
        if not fb:
            fails.append("(i) cannot read %s's module, vessels and elements from the flowsheet" % u)
            continue
        mod, vessels, elems = fb.group(1), int(fb.group(2)), int(fb.group(3))
        rec = strip_comments((CASE / "constant" / "assets" / (mod + ".dat")).read_text())
        Le = numu(rec, "elementLength", "in") * IN_M
        De = numu(rec, "nominalDiameter", "in") * IN_M
        e = entry(post, u)
        if numu(e, "endAllowance", "m") is None or re.search(r"vesselsPerRack\s+\d+", e) is None:
            fails.append("(i) %s declares no endAllowance or vesselsPerRack" % u)
            continue
        allow, OD = numu(e, "endAllowance", "m"), numu(e, "outsideDiameter", "m")
        vpr, tiers = int(num(e, "vesselsPerRack")), int(num(e, "tiers"))
        pitch, tp = numu(e, "pitch", "m"), numu(e, "tierPitch", "m")
        base, margin, aisle = numu(e, "baseHeight", "m"), numu(e, "endMargin", "m"), numu(e, "aisle", "m")
        kcl = num(e, "vesselLengths")
        vt = vessels // SKIDS
        Lv = elems * Le + allow
        racks = math.ceil(vt / vpr)
        want = {"vesselLength": Lv, "racks": racks, "rackLength": Lv + 2 * margin, "rackWidth": (vpr // tiers) * pitch,
                "rackHeight": base + tiers * tp, "loadingClearance": kcl * Lv, "vesselsPerTier": vpr // tiers,
                "vesselsLastRack": vt - (racks - 1) * vpr}
        want["envelopeLength"] = want["rackLength"] + want["loadingClearance"]
        want["envelopeWidth"] = racks * want["rackWidth"] + (racks - 1) * aisle
        want["envelopeHeight"] = want["rackHeight"]
        if OD < De or pitch < OD or tp < OD:
            fails.append("(i) %s: the vessel/pitch/element diameters are inconsistent (%.3f / %.3f / %.3f)" % (u, De, OD, pitch))
        for it in U.get(u, []):
            v = it["values"]
            for k, w in want.items():
                if not close(v[k], w, 1e-9):
                    fails.append("(i) %s/%s: %s = %r, recomputed %r" % (u, it["tag"], k, v[k], w))
            if vpr % tiers or (racks - 1) * vpr + v["vesselsLastRack"] != vt:
                fails.append("(i) %s/%s: the racks do not hold the train's %d vessels" % (u, it["tag"], vt))
            if not close(v["elementsPerBank"], vt * elems):
                fails.append("(i) %s/%s: elementsPerBank %r != %d" % (u, it["tag"], v["elementsPerBank"], vt * elems))
            li = L.get(u + "/" + it["tag"])
            if not li or not (close(li["dx"], want["envelopeLength"], 1e-9) and close(li["dy"], want["envelopeWidth"], 1e-9)
                              and close(li["dz"], want["envelopeHeight"], 1e-9)) or li.get("footprintFrom") != "published":
                fails.append("(i) %s/%s: the plan's box is not the published envelope" % (u, it["tag"]))
            n += 1
    return n


def arm_j(res):
    """(j) THE RO BUILDING: every bank, pump and exchanger array stands in a
    room of the building, and its footprint lies inside that room."""
    B = res.get("building")
    if not B:
        fails.append("(j) the result carries no building block")
        return None
    rooms = {r["name"]: r for r in B["rooms"]}
    want = {"RO1": "ro1Hall", "RO2a": "ro2Hall", "RO2b": "ro2Hall", "HPpump": "pumpHall",
            "Booster": "pumpHall", "Pass2Pump": "pumpHall", "PX": "pxHall"}
    L = {i["id"]: i for i in res["layout"]["items"]}
    n = 0
    for u, room in want.items():
        for k in range(1, SKIDS + 1):
            iid = "%s/train%d" % (u, k)
            it = L.get(iid)
            if it is None:
                fails.append("(j) %s is not placed" % iid)
                continue
            if it.get("room") != room or iid not in rooms[room]["equipment"]:
                fails.append("(j) %s stands in room %r, expected %s" % (iid, it.get("room"), room))
                continue
            r = rooms[room]
            if it["x"] - it["dx"] / 2 < r["xMin"] - 1e-9 or it["x"] + it["dx"] / 2 > r["xMax"] + 1e-9 \
                    or it["y"] - it["dy"] / 2 < r["yMin"] - 1e-9 or it["y"] + it["dy"] / 2 > r["yMax"] + 1e-9:
                fails.append("(j) %s does not lie inside room %s" % (iid, room))
            if abs(it["z"] - r["z"]) > 1e-9:
                fails.append("(j) %s does not stand on its room's floor" % iid)
            n += 1
    return n, len(rooms)


def arm_k(tmp):
    """(k) REFUSALS BY NAME of the new sizers."""
    n = 0

    def refused(name, edit, words):
        nonlocal n
        d = fixture(tmp, name, edit)
        out, code = run_case(d)
        if code == 0 and "FAILED" not in out:
            fails.append("(k) %s: nothing refused (exit 0, no FAILED line)" % name)
            return
        miss = [w for w in words if w not in out]
        if miss:
            fails.append("(k) %s: refused, but not naming %r.  Tail:\n%s" % (name, miss, out[-500:]))
        n += 1
    P = lambda d: d / "system" / "postDict"
    refused("pump-without-a-rating", lambda d: sub_file(P(d),
            "                    maxFlowPerUnit  1600 m3/h;\n                    pressureRating  90 bar;\n                    origin          literature;",
            "                    pressureRating  90 bar;\n                    origin          literature;"),
            ["HPpump", "maxFlowPerUnit"])
    refused("pump-too-small", lambda d: sub_file(P(d),
            "maxFlowPerUnit  1600 m3/h;\n                    pressureRating  90 bar;\n                    origin          assumed;\n                    source          \"the Sulzer MSD-RO ceiling",
            "maxFlowPerUnit  600 m3/h;\n                    pressureRating  90 bar;\n                    origin          assumed;\n                    source          \"the Sulzer MSD-RO ceiling"),
            ["Pass2Pump", "do NOT carry", "2 pump"])
    refused("bank-without-a-rack-size", lambda d: sub_file(P(d), "vesselsPerRack  48;\n", ""),
            ["RO1", "vesselsPerRack"])
    refused("vessels-not-shared-by-trains", lambda d: sub_file(d / "system" / "flowsheetDict", "vessels          1398;", "vessels          1399;"),
            ["RO1", "cannot be shared"])
    refused("exchanger-above-its-pressure-rating", lambda d: sub_file(P(d), "pressureRating    83 bar;", "pressureRating    50 bar;"),
            ["PX", "pressure rating"])
    refused("per-train-without-trains", lambda d: sub_file(P(d), "    trains\n    {", "    notTrains\n    {"),
            ["declares no trains"])
    return n


# ---------------------------------------------------------------------------
#  C199: A HEADER IS SIZED BY ITS VELOCITY.  Recomputed from the case's own
#  dicts (the velocity window, the declared bores, the roughness, the
#  viscosity) and the result's stream masses; the density is the package's, as
#  PUBLISHED on the sheet, and is only range-checked here (no independent
#  density of a lumped NaCl brine exists in this gate).
# ---------------------------------------------------------------------------
def churchill(Re, rr):
    """Churchill (1977), written out here, not called from the engine."""
    A = (2.457 * math.log(1.0 / ((7.0 / Re) ** 0.9 + 0.27 * rr))) ** 16
    B = (37530.0 / Re) ** 16
    return 8.0 * ((8.0 / Re) ** 12 + 1.0 / (A + B) ** 1.5) ** (1.0 / 12.0)


def header_entries(post: str):
    """[(unit, text)] for every postDict entry of type pipeHeader."""
    out = []
    for m in re.finditer(r"unitName\s+(\w+);\s*type\s+pipeHeader;(.*?)(?=unitName\s|\Z)", post, re.S):
        out.append((m.group(1), m.group(2)))
    return out


def arm_l(res):
    """(l) THE HEADERS: every header's required bore, nominal bore, velocity and
    pressure drop per metre recomputed from the dicts and the stream masses; the
    bore is the smallest declared one at or above the required bore and its
    velocity stays inside the window."""
    post, S = post_text(), res["streams"]
    heads = {}
    for e in res.get("equipment", []):
        if e.get("type") == "pipeHeader":
            heads[(e["unit"], e["tag"])] = e
    ents = header_entries(post)
    if len(ents) != 3:
        fails.append("(l) the postDict declares %d pipeHeader entries, expected 3 (RO1, RO2a, RO2b)" % len(ents))
        return None
    n = 0
    seen = []
    for unit, txt in ents:
        vmin, vmax = numu(txt, "min", "m/s"), numu(txt, "max", "m/s")
        bores = sorted(float(x) for x in re.findall(r"insideDiameter\s+([0-9.eE+-]+)\s*m\b", txt))
        eps = numu(txt, "value", "mm")
        mu = numu(txt, "value", "Pa.s")
        fm = re.search(r"frictionModel\s+(\w+);", txt)
        roles = re.findall(r"role\s+(\w+);\s*stream\s+(\w+);", txt)
        if None in (vmin, vmax, eps, mu) or not bores or not roles or not fm or fm.group(1) != "Churchill":
            fails.append("(l) %s: cannot read the header declarations (window, bores, roughness, viscosity, Churchill, headers)" % unit)
            continue
        eps *= 1e-3
        for role, stream in roles:
            seen.append((unit, role))
            for k in range(1, SKIDS + 1):
                it = heads.get((unit, "train%d.%s" % (k, role)))
                if it is None:
                    fails.append("(l) %s has no %s header item for train %d" % (unit, role, k))
                    continue
                v = it["values"]
                rho = v["density"]
                if not (990.0 <= rho <= 1060.0):
                    fails.append("(l) %s/%s: density %r kg/m3 is not that of a liquid water stream" % (unit, it["tag"], rho))
                Q = S[stream]["F_mass"] / rho / SKIDS                     # m3/s per train
                Dreq = math.sqrt(4.0 * Q / (math.pi * vmax))
                fit = [d for d in bores if d >= Dreq * (1 - 1e-12)]
                if not fit:
                    fails.append("(l) %s/%s: no declared bore holds %.4f m, yet the engine sized it" % (unit, it["tag"], Dreq))
                    continue
                D = fit[0]
                vel = 4.0 * Q / (math.pi * D * D)
                if not (vmin * (1 - 1e-12) <= vel <= vmax * (1 + 1e-12)):
                    fails.append("(l) %s/%s: velocity %.4f m/s outside the window [%g, %g]" % (unit, it["tag"], vel, vmin, vmax))
                Re = rho * vel * D / mu
                f = churchill(Re, eps / D)
                dp = f / D * 0.5 * rho * vel * vel
                want = {"flow": Q * 3600.0, "requiredInsideDiameter": Dreq, "nominalInsideDiameter": D,
                        "headerNominalDiameter": D, "velocity": vel, "reynolds": Re, "frictionFactor": f,
                        "pressureDropPerMetre": dp, "velocityMin": vmin, "velocityMax": vmax, "viscosity": mu}
                for key, w in want.items():
                    if not close(v[key], w, 1e-6):
                        fails.append("(l) %s/%s: %s = %r, recomputed %r" % (unit, it["tag"], key, v[key], w))
                n += 1
    if len(seen) != 9:
        fails.append("(l) %d headers declared, expected feed, brine and permeate for 3 banks" % len(seen))
    return n


def arm_m(tmp):
    """(m) REFUSALS BY NAME of the header sizer: no velocity window, no size that
    fits (too short a list; a window the nearest bore falls under), no
    viscosity (the package declares no model)."""
    n = 0

    def refused(name, edit, words):
        nonlocal n
        d = fixture(tmp, name, edit)
        out, code = run_case(d)
        if code == 0 and "FAILED" not in out:
            fails.append("(m) %s: nothing refused (exit 0, no FAILED line)" % name)
            return
        miss = [w for w in words if w not in out]
        if miss:
            fails.append("(m) %s: refused, but not naming %r.  Tail:\n%s" % (name, miss, out[-500:]))
        n += 1
    P = lambda d: d / "system" / "postDict"
    refused("header-without-a-velocity-window", lambda d: sub_file(P(d),
            "velocity\n                {\n                    min     1.0 m/s;", "notvelocity\n                {\n                    min     1.0 m/s;"),
            ["pipeHeader", "RO1", "velocity"])
    refused("header-without-a-bore-that-fits", lambda d: sub_file(P(d),
            "{ insideDiameter 0.45 m; } { insideDiameter 0.50 m; } { insideDiameter 0.55 m; }\n"
            "                        { insideDiameter 0.60 m; } { insideDiameter 0.70 m; } { insideDiameter 0.80 m; }",
            "{ insideDiameter 0.45 m; }"),
            ["NO declared size fits", "RO1", "feed", "the largest declared is 0.45 m"])
    refused("header-window-above-the-nearest-bore", lambda d: sub_file(P(d),
            "min     1.0 m/s;\n                    max     2.0 m/s;", "min     1.99 m/s;\n                    max     2.0 m/s;"),
            ["NO declared size fits", "below the window's minimum"])
    refused("header-without-a-viscosity", lambda d: sub_file(P(d),
            "viscosity\n                {\n                    value   1.0e-3 Pa.s;", "notviscosity\n                {\n                    value   1.0e-3 Pa.s;"),
            ["pipeHeader", "viscosity"])
    return n


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
        nref2 = arm_k(tmp)
        nref3 = arm_m(tmp)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    e = arm_e(res)
    spec = arm_f(res)
    pumps = arm_g(res)
    px = arm_h(res)
    nb = arm_i(res)
    bld = arm_j(res)
    nh = arm_l(res)
    if fails or a is None or e is None or spec is None or not pumps or px is None or not nb or bld is None or not nh:
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
          "equivalence and 5.3 mg/L boron; the boron tests are the PDF's (91 %% at pH 8, 95 %% at pH 10), each module splits boron "
          "into acid and borate at its DECLARED pH, the derived pair reproduces the test at the test's pH, relabelling the test's pH "
          "moves the acid rejection and not the effective one at the test, and a second pass declared at pH 9 raises the product's "
          "boron (the pH couples; the old pinned limitation is gone); %d fixtures refuse by name "
          "(a boron solute with no rejection, a record with no boron test, 30 bays in a 22-bay car park, `at` on an east side); the "
          "layout's %d footprints overlap nowhere and stand inside the fence, none of %d roads crosses one, the gate opens "
          "on the north line and the three boundary pipes cross at published points on the fence labelled `(not drawn)`, "
          "each tank's box holds its sized volume.  THE PLANT IS %d TRAINS (the PDF's six skids of 16 442 m3/d): every pump, "
          "exchanger and bank family has one item per train, the per-train flows, shaft powers, vessels, membrane area and "
          "devices times %d reproduce the plant's, and the specific shaft energy is %.3f kWh/m3; the pump counts are "
          "ceil(flow per train / the declared largest pump) from the stream masses (HP %d, booster %d, second pass %d per train, "
          "intake station %d, plus declared spares); each train's exchanger array is %d devices inside the Q650's 250-650 gpm "
          "window and under 83 bar; the %d vessel banks' length, racks, rack envelope, loading clearance and plan box are "
          "recomputed from the dicts; %d bank, pump and array items stand in the %d rooms of the RO building; %d more fixtures "
          "refuse by name (a pump with no rating, one too small for its train, a bank with no rack size, vessels the trains "
          "cannot share, an exchanger above its pressure rating, per-train sizing with no trains declared).  NOT CHECKED: that any "
          "number is the real plant's (the PDF is a manufacturer's claim at assumed test conditions; every pump, vessel and "
          "rack number not read from a page is ASSUMED and says so), the layout against any code or the real site, the first "
          "law, and boron's pH computed from the carbonate system (Stage 2: the pH is a declared label).  THE HEADERS (C199): the %d header items (feed, brine and permeate of three banks, six trains) have their required bore, nominal bore, velocity inside the declared window, Reynolds number, Churchill friction factor and pressure drop per metre recomputed from the dicts and the stream masses (the density is the package's, range-checked only); %d more fixtures refuse by name (no velocity window, no bore that fits, a window above the nearest bore, no viscosity).  NOT CHECKED: that the window or the list of bores is a standard's (both are the case's, assumed), the header's length, fittings and wall."
          % (CASE.name, prod, r1 * 100, r2 * 100, tds, fac, b, nref, ni, nr, SKIDS, SKIDS, spec,
             pumps["HPpump"][0], pumps["Booster"][0], pumps["Pass2Pump"][0], pumps["IntakePump"][2], px, nb, bld[0], bld[1], nref2, nh, nref3))
    return 0


if __name__ == "__main__":
    sys.exit(main())
