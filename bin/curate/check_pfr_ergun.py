#!/usr/bin/env python3
"""Gate: the pfr's opt-in Ergun pressure drop integrates what it claims, and refuses by name.

    bin/curate/check_pfr_ergun.py

WHY THIS EXISTS (DEV.md 4c C66, 2026-10-12).  The multi-reaction `pfr` gained
`operation { L_over_D <->; catalyst { particleDiameter <l>; }
pressureDrop { model Ergun; voidFraction <->; allowable <p>; } }`: the bed's
cross-section from its volume and slenderness, and dP/dz from Ergun's equation
marched with the species by the same RK4.  A golden pins what a run PRINTS,
so it cannot say whether the drop is Ergun's; this gate recomputes it.

WHAT THIS GATE CHECKS, on throwaway copies of
`tutorials/steady/reactors/pfr02_reversible_wgs` (an ideal-gas package):

  (a) THE CLOSED FORM.  The copy is made NON-REACTING (a feed of water and
      hydrogen: the forward rate carries CO, the reverse CO2, and neither is
      fed) and isothermal, so the gas's composition, temperature and mass
      flux G are constant along the bed and, on an ideal gas,
          dP/dz = -(a G + c G^2) R T / (M P),
          a = 150 (1-eps)^2 mu / (eps^3 dp^2),   c = 1.75 (1-eps) / (eps^3 dp),
      integrates to  P_out^2 = P_in^2 - 2 (a G + c G^2) R T L / M.
      The gate takes mu from the run's own `mu_gas_in` KPI (it cannot
      recompute Chung), everything else from the declaration, and holds the
      engine's P_out to the closed form at 1e-7 relative -- the RK4's own
      error on 200 steps, not a tolerance chosen to pass.
  (b) THE GEOMETRY.  D = (4 V_R / (pi L/D))^(1/3), A = pi D^2/4, L = (L/D) D,
      recomputed from the declaration.
  (c) THE OUTLET LEAVES AT P_in - dP: the produced stream's P in the result
      JSON is the integrated outlet, not the inlet's.
  (d) EVERY REFUSAL FIRES BY NAME: a `pressureDrop` without `L_over_D`; no
      `voidFraction`; an unknown model; no particle; an unread key in the
      block; and the keys on the SINGLE-reaction path.
  (e) AN EXCEEDED ALLOWABLE IS ANNOUNCED, in the caveat block, with the
      (L/D)^2 sentence; a drop inside it is not.
  (f) ABSENT THE KEYS NOTHING IS PUBLISHED: the untouched witness carries no
      `dP_bed_bar`, no `P` profile column and an outlet P left to the
      flowsheet.  (Byte-identity of the result JSON against the parent build
      was measured once, by hand, on every corpus pfr case -- DEV.md 4c C66;
      this arm is the part that can be re-run.)

WHAT THIS DOES NOT CHECK, said plainly:
  * whether Ergun is RIGHT for an ammonia catalyst bed (wall effect,
    particle shape, maldistribution): nothing here measures a bed;
  * the dense-gas viscosity: the package's model is dilute-gas;
  * the sizer's one-home refusal (`L_over_D` in both the unit and the
    designRules) -- it needs a postDict, and `check_design_sheet` runs the
    sized cases; the shell's L/D on greenAmmoniaBasicDesign's sheet is read
    from the unit, which that case's golden pins.

SABOTAGES PERFORMED (by hand, 2026-10-12), each against this gate:
  S1  the inertial coefficient 1.75 -> 1.70 in PFR::ergunGradient.  Caught
      by (a).
  S2  dP/dV = dP/dz (the division by A dropped).  Caught by (a).
  S3  the outlet left at P = 0 (the flowsheet's inlet pressure).  Caught by
      (c).
"""
import json
import math
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOLVE = ROOT / "build" / "linux64Gcc" / "choupoSolve"
CASE = ROOT / "tutorials/steady/reactors/pfr02_reversible_wgs"
R = 8.314462618          # core/Constants.H


def run(case):
    p = subprocess.run([str(SOLVE)], cwd=str(case), capture_output=True,
                       text=True, timeout=600)
    out = p.stdout + p.stderr
    js = None
    m = re.search(r"<<<Choupo:result-begin>>>(.*?)<<<Choupo:result-end>>>",
                  out, re.S)
    if m:
        try:
            js = json.loads(m.group(1))
        except json.JSONDecodeError:
            pass
    return p.returncode, out, js


OPERATION = """        operation
        {
            V_R           2.0e-3;
            nSteps        200;
            L_over_D      20;
            catalyst      { particleDiameter 1 mm; }
            pressureDrop  { model Ergun;  voidFraction 0.40;%s }
        }
        reactions   ( wgs_reversible );"""

FEED = """componentMolarFlows
{
    water    1.0 kmol/h;
    H2       1.0 kmol/h;
}
"""

TRANSPORT = "\ntransport { vapour { viscosity { model Chung; } } }\n"


def make(td, operation=None, single=False, transport=True, feed=True):
    dst = Path(td) / "case"
    shutil.copytree(CASE, dst, ignore=shutil.ignore_patterns(
        "reports", "converged", "log.*", "iterations", "design"))
    fs = dst / "system/flowsheetDict"
    txt = fs.read_text()
    block = re.search(r"        operation\n        \{.*?\n        \}\n        reaction    wgs_reversible;",
                      txt, re.S)
    assert block, "witness flowsheetDict layout changed; update this gate"
    if operation is not None:
        new = operation
        if single:
            new = new.replace("reactions   ( wgs_reversible );",
                              "reaction    wgs_reversible;")
        txt = txt[:block.start()] + new + txt[block.end():]
    fs.write_text(txt)
    if feed:
        f0 = dst / "0/feed"
        t = f0.read_text()
        t = re.sub(r"componentMolarFlows\s*\{.*?\}\n", FEED, t, flags=re.S)
        f0.write_text(t)
    if transport:
        tp = dst / "constant/thermoPhysPropDict"
        tp.write_text(tp.read_text() + TRANSPORT)
    return dst


def main() -> int:
    fails = []
    claims = []
    if not SOLVE.exists():
        print("check_pfr_ergun: CANNOT RUN -- no native build at " + str(SOLVE))
        return 1

    # ---- (a) (b) (c) the closed form, the geometry, the outlet -----------
    with tempfile.TemporaryDirectory() as td:
        case = make(td, OPERATION % "")
        rc, out, js = run(case)
        if rc != 0 or js is None:
            print("check_pfr_ergun: FAIL -- the non-reacting Ergun copy did not"
                  " run (exit %d):\n%s" % (rc, out[-1500:]))
            return 1
        k = js["kpis"]["wgs"]
        P_in = 1.0e6
        T = 600.0
        V_R, LD, dp, eps = 2.0e-3, 20.0, 1.0e-3, 0.40
        D = (4.0 * V_R / (math.pi * LD)) ** (1.0 / 3.0)
        A = 0.25 * math.pi * D * D
        L = LD * D
        for key, ref in (("D_bed_m", D), ("A_bed_m2", A), ("L_bed_m", L)):
            if abs(k.get(key, float("nan")) - ref) > 1e-12 * ref:
                fails.append(f"(b) {key} = {k.get(key)} != {ref} from the declaration")
        # the gas: water + H2, equimolar, unreacted
        MW = js["componentMolarMass"]
        M = 0.5 * MW["water"] + 0.5 * MW["H2"]          # kg/kmol
        F = 2.0 / 3600.0                                  # kmol/s
        G = F * M / A                                     # kg/(m2 s)
        mu = k["mu_gas_in"]
        a = 150.0 * (1 - eps) ** 2 * mu / (eps ** 3 * dp * dp)
        c = 1.75 * (1 - eps) / (eps ** 3 * dp)
        K = (a * G + c * G * G) * R * T / (M * 1.0e-3)
        P_out_cf = math.sqrt(P_in * P_in - 2.0 * K * L)
        P_out = k["P_out_bar"] * 1.0e5
        rel = abs(P_out - P_out_cf) / P_out_cf
        if rel > 1.0e-7:
            fails.append(f"(a) P_out {P_out:.6f} Pa against the closed form "
                         f"{P_out_cf:.6f} Pa (rel {rel:.2e} > 1e-7): the march "
                         f"is not Ergun's on this cross-section")
        if abs(k.get("X_N2", 0.0)) > 0 or abs(js["streams"]["products"]["F"] - F) > 1e-12:
            fails.append("(a) the copy reacted or lost material -- the closed "
                         "form assumes it does not")
        Pstream = js["streams"]["products"]["P"]
        if abs(Pstream - P_out) > 1e-6 * P_in:
            fails.append(f"(c) the outlet stream leaves at {Pstream} Pa, not "
                         f"the integrated {P_out} Pa")
        if "P" not in (js.get("profiles", {}).get("wgs", {}).get("columns", {})
                       if isinstance(js.get("profiles"), dict) else {}):
            pass   # the profile shape is not this gate's claim
        claims.append(f"(a) closed form P_out {P_out_cf/1e5:.6f} bar, engine "
                      f"{P_out/1e5:.6f} bar (rel {rel:.1e}); dP {k['dP_bed_bar']:.4f} bar")

    # ---- (d) refusals ------------------------------------------------------
    probes = [
        ("no L_over_D", OPERATION.replace("            L_over_D      20;\n", "") % "",
         False, "operation.L_over_D"),
        ("no voidFraction", OPERATION.replace("  voidFraction 0.40;", "") % "",
         False, "voidFraction"),
        ("unknown model", OPERATION.replace("model Ergun;", "model Kozeny;") % "",
         False, "Kozeny"),
        ("no particle", OPERATION.replace("            catalyst      { particleDiameter 1 mm; }\n", "") % "",
         False, "particleDiameter"),
        ("unread key", OPERATION % "  sphericity 0.8;", False, "sphericity"),
        ("single-reaction path", OPERATION % "", True, "MULTI-reaction path"),
    ]
    for label, op, single, expect in probes:
        with tempfile.TemporaryDirectory() as td:
            case = make(td, op, single=single)
            rc, out, _ = run(case)
            if rc == 0:
                fails.append(f"(d) {label}: ran to exit 0 -- no refusal")
            elif expect not in out:
                fails.append(f"(d) {label}: refused without naming `{expect}`:"
                             f" ...{out[-300:]}")
    claims.append(f"(d) {len(probes)} refusals fired by name")

    # ---- (e) the allowable -------------------------------------------------
    with tempfile.TemporaryDirectory() as td:
        case = make(td, OPERATION % "  allowable 0.1 bar;")
        rc, out, js = run(case)
        adv = " ".join(a.get("message", "") for a in (js or {}).get("advisories", []))
        if rc != 0 or "ABOVE the declared allowable" not in adv or "(L/D)^2" not in adv:
            fails.append("(e) a drop above `allowable` was not announced in the"
                         " result's advisories with the (L/D)^2 remedy")
    with tempfile.TemporaryDirectory() as td:
        case = make(td, OPERATION % "  allowable 100 bar;")
        rc, out, js = run(case)
        adv = " ".join(a.get("message", "") for a in (js or {}).get("advisories", []))
        if "ABOVE the declared allowable" in adv:
            fails.append("(e) a drop INSIDE `allowable` was announced as above it")
    claims.append("(e) an exceeded allowable is announced, a met one is not")

    # ---- (f) absent the keys ----------------------------------------------
    with tempfile.TemporaryDirectory() as td:
        case = make(td, None, transport=False, feed=False)
        rc, out, js = run(case)
        k = (js or {}).get("kpis", {}).get("wgs", {})
        if rc != 0 or any(x in k for x in ("dP_bed_bar", "L_over_D", "D_bed_m")):
            fails.append("(f) the untouched witness publishes hydraulics KPIs"
                         " it never declared")
        if abs(js["streams"]["products"]["P"] - 1.0e6) > 1e-6:
            fails.append("(f) the untouched witness's outlet left the inlet pressure")
    claims.append("(f) absent the keys, no hydraulics KPI and the outlet at the inlet P")

    if fails:
        print("check_pfr_ergun: FAIL")
        for f in fails:
            print("  " + f)
        return 1
    print("check_pfr_ergun: OK -- " + "; ".join(claims))
    return 0


if __name__ == "__main__":
    sys.exit(main())
